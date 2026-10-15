#!/usr/bin/env python3
"""
VPS 哨兵：用手機或電腦隨時查看 VPS 狀態
- 單一檔案，只用 Python 內建模組（不用另外安裝任何套件）
- 網頁儀表板：電腦版、手機版各自設計，可加到手機主畫面當 App 用
- 即時狀態、30 分鐘歷史曲線、Docker 容器與系統服務、一鍵更新系統
- 可選：Telegram 通知、多台 VPS 一起看
設定檔：/etc/vps-sentinel-lite.conf（可用環境變數 SENTINEL_CONF 指定別的位置）
"""
import base64
import glob
import hashlib
import hmac
import http.client
import io
import ipaddress
import html
import json
import os
import re
import secrets
import shutil
import ssl
import shlex
import signal
import socket
import sqlite3
import stat
import subprocess
import tarfile
import tempfile
import sys
import threading
import time
from datetime import date, datetime, timedelta, timezone
import urllib.parse
import urllib.error
import urllib.request
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.57"

# ───────────────────────── 哨兵備份檔（.vsbk）─────────────────────────
# 哨兵專用的備份格式：外面是自己的檔案格式，裡面用的是成熟、標準的加密方法（不自己發明加密）：
#   - 密碼 → 金鑰：scrypt（Python 內建；故意算得很慢又吃記憶體，就算密碼被拿去猜也猜很久）
#   - 加密內容：AES-256（系統的 openssl 來算，CTR 模式）
#   - 防竄改：HMAC-SHA256（先加密再簽，打開前先檢查，密碼不對或檔案被改過一個位元都會發現）
# 檔案內容：「VSBK」＋版本＋scrypt 參數(log2 N, r, p)＋鹽(16)＋隨機數(16)＋加密後的內容＋簽章(32)
# 每個檔案的鹽和隨機數都不一樣，所以每個檔案的加密金鑰也都不一樣。
# 版本 2：每個檔案有自己的密碼（＝用總密碼和這個檔案的鹽算出來的，HMAC-SHA256，反推不回總密碼），
#   Telegram 上只給這份的密碼，就算外流也只打得開這一份；總密碼（網頁上那組）每一份都打得開。
VSBK_MAGIC = b"VSBK"
VSBK_HEAD = 40
VSBK_SCRYPT = (15, 8, 1)                          # N=32768、r=8、p=1：大約要 32 MB 記憶體、零點幾秒


def _vsbk_keys(pw, salt, nonce, n, r, p):
    m = hashlib.scrypt(pw.encode("utf-8"), salt=salt, n=1 << n, r=r, p=p, maxmem=256 << 20, dklen=64)
    enc = hmac.new(m[:32], b"vsbk-enc" + nonce, hashlib.sha256).hexdigest()
    mac = hmac.new(m[32:], b"vsbk-mac" + nonce, hashlib.sha256).digest()
    return enc, mac


def _vsbk_aes(enc, src, dst, decrypt=False):
    """AES-256-CTR。金鑰用環境變數交給 openssl（不放在指令列上，別的程式看不到）；
    openssl 會把這串（每個檔案都不同的）金鑰材料再轉成真正的金鑰和起始值"""
    if not shutil.which("openssl"):
        raise OSError("主機上沒有 openssl")
    r = subprocess.run(["openssl", "enc", "-aes-256-ctr", *(["-d"] if decrypt else []), "-pbkdf2", "-iter", "1",
                        "-md", "sha256", "-nosalt", "-pass", "env:VSBK_K", "-in", src, "-out", dst],
                       env=dict(os.environ, VSBK_K=enc), capture_output=True, timeout=3600)
    if r.returncode != 0:
        raise OSError("openssl 執行失敗：" + r.stderr.decode(errors="replace").strip()[:200])


def vsbk_file_pass(master, salt):
    """這個檔案自己的密碼：4 組 5 個字（大約 99 位元，跟自動產生的總密碼一樣強）"""
    abc = "abcdefghjkmnpqrstuvwxyz23456789"
    v = int.from_bytes(hmac.new(master.encode("utf-8"), b"vsbk-file" + salt, hashlib.sha256).digest(), "big")
    out = []
    for _ in range(20):
        v, i = divmod(v, len(abc))
        out.append(abc[i])
    return "-".join("".join(out[i:i + 5]) for i in range(0, 20, 5))


def vsbk_pass_of(path, master):
    """備份檔自己的密碼（舊版做的檔案沒有，回傳空字串）"""
    try:
        with open(path, "rb") as f:
            head = f.read(VSBK_HEAD)
    except OSError:
        return ""
    if len(head) < VSBK_HEAD or head[:4] != VSBK_MAGIC or head[4] != 2:
        return ""
    return vsbk_file_pass(master, head[8:24])


def vsbk_encrypt(src, dst, master):
    """用總密碼加密；實際上鎖的是這個檔案自己的密碼（見上面版本 2 的說明）"""
    salt, nonce = os.urandom(16), os.urandom(16)
    head = VSBK_MAGIC + bytes([2, *VSBK_SCRYPT]) + salt + nonce
    enc, mac = _vsbk_keys(vsbk_file_pass(master, salt), salt, nonce, *VSBK_SCRYPT)
    ct = dst + ".ct"
    try:
        _vsbk_aes(enc, src, ct)
        h = hmac.new(mac, head, hashlib.sha256)
        with open(ct, "rb") as fi, open(dst, "wb") as fo:
            fo.write(head)
            for chunk in iter(lambda: fi.read(1 << 20), b""):
                h.update(chunk)
                fo.write(chunk)
            fo.write(h.digest())
    finally:
        if os.path.exists(ct):
            os.remove(ct)


def vsbk_decrypt(src, dst, pw):
    """解開 .vsbk（總密碼或這份自己的密碼都可以）；密碼不對或檔案壞掉會丟出 ValueError（先檢查簽章，沒問題才解）。
    dst 是 None 的話只檢查密碼對不對"""
    size = os.path.getsize(src)
    with open(src, "rb") as f:
        head = f.read(VSBK_HEAD)
        if len(head) < VSBK_HEAD or head[:4] != VSBK_MAGIC or size < VSBK_HEAD + 32:
            raise ValueError("這不是哨兵的備份檔")
        if head[4] not in (1, 2):
            raise ValueError("這個備份檔是比較新版的哨兵做的，請先更新哨兵")
        n, r, p = head[5], head[6], head[7]
        if not (10 <= n <= 22 and 1 <= r <= 32 and 1 <= p <= 16):
            raise ValueError("備份檔壞了")
        tries = [pw]
        if head[4] == 2:                                 # 打的可能是總密碼，也可能是這份自己的密碼
            tries.append(vsbk_file_pass(pw, head[8:24]))
        keys = [_vsbk_keys(t, head[8:24], head[24:40], n, r, p) for t in tries]
        hs = [hmac.new(mac, head, hashlib.sha256) for _, mac in keys]
        ct = dst + ".ct" if dst else None
        try:
            with open(ct or os.devnull, "wb") as fo:
                left = size - VSBK_HEAD - 32
                while left > 0:
                    chunk = f.read(min(left, 1 << 20))
                    if not chunk:
                        raise ValueError("備份檔不完整")
                    for h in hs:
                        h.update(chunk)
                    fo.write(chunk)
                    left -= len(chunk)
            tag = f.read(32)
            ok = [k for (k, _), h in zip(keys, hs) if hmac.compare_digest(h.digest(), tag)]
            if not ok:
                raise ValueError("解開密碼不對，或是備份檔被改過、壞掉了")
            if dst:
                _vsbk_aes(ok[0], ct, dst, decrypt=True)
        finally:
            if ct and os.path.exists(ct):
                os.remove(ct)


def vsbk_cli(args):
    """python3 sentinel.py --decrypt 備份檔.vsbk [解開後的檔名]：在任何有 Python 和 openssl 的主機上都能用"""
    if not args or not os.path.isfile(args[0]):
        sys.exit("用法：python3 sentinel.py --decrypt 備份檔.vsbk")
    src = args[0]
    dst = args[1] if len(args) > 1 else re.sub(r"\.vsbk$", "", src) + (".tar.gz" if not src.endswith(".tar.gz.vsbk") else "")
    if os.path.exists(dst):
        sys.exit(f"{dst} 已經存在，請先移走或換一個檔名")
    if sys.stdin.isatty():
        import getpass
        pw = getpass.getpass("解開密碼：")
    else:
        pw = sys.stdin.readline().rstrip("\r\n")
    try:
        vsbk_decrypt(src, dst, pw)
    except (ValueError, OSError) as e:
        if os.path.exists(dst):
            os.remove(dst)
        sys.exit(f"沒有解開：{e}")
    print(f"已解開：{dst}\n放回原位：sudo tar -xzf {shlex.quote(dst)} -C /")
    sys.exit(0)


# ───────────────────────── 還原（sudo python3 sentinel.py --restore）─────────────────────────
# 一個指令把備份放回去，並讓服務回到原本的樣子：
#   1. 拿到備份檔（這台上的、或是哨兵網頁上產生的還原連結）→ 解開 → 列出內容、確認
#   2. 先把這台現在的檔案留一份（還原錯了可以放回去）
#   3. 新主機：先用系統內建的套件裝好 Docker、nginx，哨兵自己用 install.sh 裝好
#   4. 停掉相關服務 → 放回檔案 → n8n 容器照原本的設定建回來 → 哨兵、3x-ui、網站重新啟動
#   5. 一項一項檢查有沒有跑起來，提醒網址（網域）要不要改指向這台
# 3x-ui 不會自動安裝（要跑它官方的安裝程式），缺的話會先告訴使用者。
# 測試用：SENTINEL_RESTORE_ROOT＝放回到哪個資料夾（預設 /）；SENTINEL_RESTORE_DRY=1＝不真的執行指令，只列出來
RS_MANIFEST = "vsbk-manifest.json"
RS_HERE = os.path.dirname(os.path.abspath(__file__))
# install.sh、cloud.sh 在專案資料夾（git clone 的地方）；從網頁還原時哨兵會告訴我們在哪
RS_SRC = next((d for d in (os.environ.get("SENTINEL_SRC"), RS_HERE) if d and os.path.isfile(os.path.join(d, "install.sh"))), RS_HERE)
RS_UNIT = "/etc/systemd/system/vps-sentinel-lite.service"


def rs_conf_text(text):
    out = {}
    for line in text.splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def rs_conf(path):
    try:
        with open(path, encoding="utf-8") as f:
            return rs_conf_text(f.read())
    except OSError:
        return {}


class Restore:
    def __init__(self, root, dry, yes, status=None):
        self.root, self.dry, self.yes, self.status = root, dry, yes, status
        self.cmds, self.result, self.log = [], [], []
        self.name, self.after = "", ""

    def say(self, text=""):
        """印出來；從網頁還原時也寫進進度檔，網頁每隔一下來讀"""
        print(text, flush=True)
        self.log += [ln for ln in str(text).split("\n") if ln.strip()]
        self.save()

    def save(self, done=False, error=""):
        if not self.status:
            return
        d = {"t": time.time(), "done": done, "error": error, "name": self.name, "log": self.log[-200:],
             "result": [{"label": a, "ok": b} for a, b in self.result], "after": self.after,
             "ok": done and not error and all(b for _, b in self.result)}
        tmp = self.status + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False)
            os.replace(tmp, self.status)
        except OSError:
            pass

    def p(self, path):
        """原本的絕對路徑 → 這次要放回去的位置"""
        return os.path.join(self.root, path.lstrip("/"))

    def sh(self, cmd, timeout=900, cwd=None, quiet=True, env=None):
        """執行指令；成功回傳 True。測試時只記下來"""
        self.cmds.append(" ".join(shlex.quote(c) for c in cmd))
        if self.dry:
            self.say("   （測試，不執行）" + self.cmds[-1])
            return True
        try:
            r = subprocess.run(cmd, cwd=cwd, timeout=timeout, stdin=subprocess.DEVNULL, env={**os.environ, **(env or {})},
                               stdout=subprocess.DEVNULL if quiet else None, stderr=subprocess.DEVNULL if quiet else None)
            return r.returncode == 0
        except (OSError, subprocess.SubprocessError):
            return False

    def has(self, prog):
        return self.dry or bool(shutil.which(prog))

    def ask(self, q):
        if self.yes:
            return True
        try:
            return input(q).strip().lower() in ("y", "yes", "是", "好")
        except EOFError:
            return False


def rs_pick_local():
    """沒指定檔案：列出這台上的備份讓使用者選"""
    conf = rs_conf(os.environ.get("SENTINEL_CONF", "/etc/vps-sentinel-lite.conf"))
    fs = []
    for r in (os.path.join(conf.get("CLOUD_DIR", "/srv/cloud"), "哨兵備份"),
              os.path.join(conf.get("DATA_DIR", "/var/lib/vps-sentinel-lite"), "backups")):
        fs += glob.glob(os.path.join(r, "*", "*.vsbk"))
    fs = sorted(fs, key=os.path.getmtime, reverse=True)[:20]
    if not fs:
        sys.exit("這台上找不到備份檔。請在指令後面加上備份檔的位置，或哨兵網頁上產生的還原連結")
    print("這台上的備份（最新的在最上面）：")
    for i, f in enumerate(fs, 1):
        print(f"  {i:>2}. {os.path.basename(os.path.dirname(f))}／{os.path.basename(f)}")
    try:
        n = int(input("要還原哪一份？輸入編號：").strip())
    except (ValueError, EOFError):
        sys.exit("沒有選，結束")
    if not 1 <= n <= len(fs):
        sys.exit("沒有這個編號")
    return fs[n - 1]


def rs_download(url, td):
    print("下載備份檔中…")
    dst = os.path.join(td, "download.vsbk")
    try:
        with urllib.request.urlopen(url, timeout=900) as r, open(dst, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
    except urllib.error.HTTPError as e:
        sys.exit("還原連結過期或不對，請在哨兵網頁上重新產生一個" if e.code in (403, 404) else f"下載失敗（錯誤 {e.code}）")
    except Exception as e:  # noqa: BLE001
        sys.exit(f"下載失敗：{e}")
    return dst


def rs_members(tar):
    """檢查備份裡的每個檔案：只接受一般檔案、資料夾、捷徑，而且不能跑到別的地方去"""
    out = []
    for m in tar.getmembers():
        parts = m.name.split("/")
        if m.name.startswith("/") or ".." in parts or not (m.isfile() or m.isdir() or m.issym()):
            continue
        if m.name == RS_MANIFEST or (len(parts) == 1 and m.name.endswith(".txt")):
            continue                                    # 還原說明、還原資料：不用放到主機上
        out.append(m)
    return out


def rs_items(names, man, conf_path):
    """從備份內容判斷有哪些服務"""
    def any_in(prefix):
        return any(n == prefix or n.startswith(prefix + "/") for n in names)
    return {"sentinel": conf_path.lstrip("/") in names, "xui": any_in("etc/x-ui"), "nginx": any_in("etc/nginx"),
            "caddy": any_in("etc/caddy"), "acme": any_in("root/.acme.sh"), "cloud": any_in("opt/vps-cloud/data"),
            "n8n": bool(man.get("containers"))}


def rs_docker_run(c):
    """照備份時記下來的設定，把容器建回來"""
    cmd = ["docker", "run", "-d", "--name", c["name"]]
    if c.get("restart") and c["restart"] != "no":
        cmd += ["--restart", c["restart"]]
    for e in c.get("env") or []:
        cmd += ["-e", e]
    for p in c.get("ports") or []:
        cmd += ["-p", p]
    for m in c.get("mounts") or []:
        cmd += ["-v", f"{m['name'] if m.get('type') == 'volume' else m['source']}:{m['dest']}"]
    if c.get("network") not in (None, "", "default", "bridge"):
        cmd += ["--network", c["network"]]
    return cmd + [c["image"]]


def restore_cli(args):
    """sudo python3 sentinel.py --restore [備份檔或還原連結] [--yes] [--password-file 檔案] [--status 進度檔]
    --password-file：密碼放在檔案裡（讀完就刪掉）；--status：把進度寫成 JSON（網頁還原用）"""
    opts, rest, it = {}, [], iter(args)
    for a in it:
        if a in ("--password-file", "--status"):
            opts[a] = next(it, "")
        elif a == "--yes":
            opts[a] = True
        else:
            rest.append(a)
    root = os.environ.get("SENTINEL_RESTORE_ROOT", "/")
    rs = Restore(root, os.environ.get("SENTINEL_RESTORE_DRY") == "1", bool(opts.get("--yes")), opts.get("--status") or None)
    td = tempfile.mkdtemp(prefix="vsrestore-")
    os.chmod(td, 0o700)
    try:
        if root == "/" and os.geteuid() != 0:
            sys.exit("請用 sudo 執行：sudo python3 sentinel.py --restore")
        src = rest[0] if rest else rs_pick_local()
        if re.match(r"https?://", src):
            src = rs_download(src, td)
        elif not os.path.isfile(src):
            sys.exit(f"找不到備份檔：{src}")
        if opts.get("--password-file"):
            try:
                with open(opts["--password-file"], encoding="utf-8") as f:
                    pw = f.read().rstrip("\r\n")
            finally:
                try:
                    os.remove(opts["--password-file"])
                except OSError:
                    pass
        elif sys.stdin.isatty():
            import getpass
            pw = getpass.getpass("解開密碼（總密碼或這份自己的密碼都可以）：")
        else:
            pw = sys.stdin.readline().rstrip("\r\n")
        tgz = os.path.join(td, "backup.tar.gz")
        try:
            vsbk_decrypt(src, tgz, pw)
        except (ValueError, OSError) as e:
            sys.exit(f"沒有解開：{e}")
        rs_run(rs, tgz)
    except SystemExit as e:
        if e.code not in (0, None):
            rs.save(done=True, error=str(e.code))
        raise
    except Exception as e:  # noqa: BLE001
        rs.save(done=True, error=f"還原到一半出錯了：{e}")
        raise
    finally:
        shutil.rmtree(td, ignore_errors=True)
    rs.save(done=True)
    sys.exit(1 if any(not ok for _, ok in rs.result) else 0)


def rs_run(rs, tgz):
    with tarfile.open(tgz, "r:gz") as tar:
        try:
            man = json.load(tar.extractfile(RS_MANIFEST))
        except (KeyError, ValueError, AttributeError):
            man = {}                                   # 1.34 以前做的備份沒有還原資料，從內容判斷
        conf_path = man.get("conf") or "/etc/vps-sentinel-lite.conf"
        try:                                           # 備份裡的哨兵設定（網域、連接埠：新主機安裝時要用）
            bconf = rs_conf_text(tar.extractfile(conf_path.lstrip("/")).read().decode("utf-8", "replace"))
        except (KeyError, AttributeError):
            bconf = {}
        members = rs_members(tar)
        items = rs_items({m.name for m in members}, man, conf_path)
        cur = rs_conf(rs.p(conf_path))
        here = cur.get("NAME") or ""
        rs.name = man.get("name") or bconf.get("NAME") or ""
        rs.say(f"\n這份備份：「{man.get('name') or bconf.get('NAME') or '（舊版備份）'}」{man.get('when') or ''}")
        rs.say("裡面有：" + "、".join(man.get("items") or [k for k, v in items.items() if v]))
        if here and man.get("name") and here != man["name"]:
            rs.say(f"⚠️ 這台現在叫「{here}」，但這份是「{man['name']}」的備份；還原後這台會變成「{man['name']}」的設定")
        xui_missing = items["xui"] and not os.path.exists(rs.p("/usr/local/x-ui/x-ui")) and not rs.dry
        if xui_missing:
            rs.say("⚠️ 這台還沒有裝 3x-ui。建議先用 3x-ui 官方的安裝指令裝好（裝的時候問的問題都按 Enter），再執行一次還原；"
                  "不先裝的話，3x-ui 的設定一樣會放回去，裝好之後就會用回原本的設定。")
        rs.say("還原會蓋掉這台上同樣位置的檔案（會先另外留一份）。")
        if not rs.ask("要開始還原嗎？輸入 y 繼續："):
            sys.exit("沒有還原")

        # 1. 先把現在的檔案留一份
        keep = rs.p(f"/root/還原前的檔案-{datetime.now():%Y%m%d-%H%M%S}.tar.gz")
        os.makedirs(os.path.dirname(keep), exist_ok=True)
        n = 0
        with tarfile.open(keep, "w:gz") as old:
            for m in members:
                p = rs.p(m.name)
                if not m.isdir() and os.path.lexists(p):
                    try:
                        old.add(p, m.name, recursive=False)
                        n += 1
                    except OSError:
                        pass
        os.chmod(keep, 0o600)
        rs.say(f"\n① 這台原本的檔案（{n} 個）先留在 {keep}")

        # 2. 新主機：缺的程式先裝好（之後再把備份的設定蓋上去）
        rs.say("② 檢查需要的程式")
        apt = {"DEBIAN_FRONTEND": "noninteractive"}
        if items["n8n"] and not rs.has("docker"):
            rs.say("   安裝 Docker…")
            rs.sh(["apt-get", "update", "-qq"], env=apt)
            rs.sh(["apt-get", "install", "-y", "-qq", "docker.io"], env=apt)
            if any(c.get("compose") for c in man["containers"]):
                rs.sh(["apt-get", "install", "-y", "-qq", "docker-compose-v2"], env=apt)
        if items["nginx"] and not rs.has("nginx"):
            rs.say("   安裝 nginx…")
            rs.sh(["apt-get", "install", "-y", "-qq", "nginx"], env=apt)
        new_dom = bconf.get("DOMAIN") and (not rs.has("caddy") or cur.get("DOMAIN") != bconf["DOMAIN"])
        if items["sentinel"] and (not os.path.exists(rs.p(RS_UNIT)) or new_dom):
            rs.say(f"   {'設定網站的加密連線（' + bconf['DOMAIN'] + '）' if bconf.get('DOMAIN') else '安裝哨兵'}…")
            rs.sh(["bash", os.path.join(RS_SRC, "install.sh"), bconf.get("DOMAIN", "")], timeout=1200, quiet=False,
                  env={**apt, **({"HTTPS_PORT": bconf["HTTPS_PORT"]} if bconf.get("HTTPS_PORT") else {})})

        # 3. 停掉相關服務，免得放回檔案時正在寫
        rs.say("③ 暫停相關服務")
        services = [(s, label) for s, label, k in (("vps-sentinel-lite", "哨兵", "sentinel"), ("x-ui", "3x-ui", "xui"),
                                                    ("nginx", "nginx", "nginx"), ("caddy", "Caddy", "caddy")) if items[k]]
        for s, _ in services:
            rs.sh(["systemctl", "stop", s])
        for c in man.get("containers") or []:
            rs.sh(["docker", "stop", c["name"]])
            for m in c.get("mounts") or []:
                if m.get("type") == "volume":
                    rs.sh(["docker", "volume", "create", m["name"]])    # 資料卷要先建好，資料才放得進去

        # 4. 放回檔案（保留原本的擁有者和權限）
        rs.say("④ 放回檔案")
        kw = {"filter": "fully_trusted"} if hasattr(tarfile, "fully_trusted_filter") else {}
        tar.extractall(rs.root, members=members, numeric_owner=True, **kw)   # 上面已經一個一個檢查過
        rs.say(f"   放回 {sum(1 for m in members if not m.isdir())} 個檔案")

    # 5. 讓服務回到原本的樣子
    rs.say("⑤ 啟動服務")
    rs.sh(["systemctl", "daemon-reload"])
    if items["acme"] and (rs.dry or os.path.exists(rs.p("/root/.acme.sh/acme.sh"))):
        rs.sh([rs.p("/root/.acme.sh/acme.sh"), "--install-cronjob"])    # 憑證自動更新的排程
    for c in man.get("containers") or []:
        if c.get("compose"):
            rs.sh(["docker", "compose", "up", "-d"], cwd=None if rs.dry else rs.p(c["compose"]))
        elif not rs.sh(["docker", "start", c["name"]]) or rs.dry:
            if c.get("network") not in (None, "", "default", "bridge", "host"):
                rs.sh(["docker", "network", "create", c["network"]])
            rs.sh(rs_docker_run(c))
    for s, _ in services:
        if s != "x-ui" or not xui_missing:
            rs.sh(["systemctl", "enable", s])
            rs.sh(["systemctl", "restart", s])
    conf = rs_conf(rs.p(conf_path))
    if items["cloud"] and conf.get("CLOUD_GB") and (rs.dry or not os.path.isdir(rs.p("/srv/cloud"))):
        rs.say("   重新建立雲端硬碟…")
        rs.sh(["bash", os.path.join(RS_SRC, "cloud.sh"), conf["CLOUD_GB"]], timeout=1800, quiet=False)

    # 6. 檢查
    rs.say("\n還原結果：")
    checks = [(label, ["systemctl", "is-active", "--quiet", s]) for s, label in services]
    checks += [(f"n8n（{c['name']}）", ["docker", "exec", c["name"], "true"]) for c in man.get("containers") or []]
    for label, cmd in checks:
        ok = rs.sh(cmd, timeout=30)
        rs.result.append((label, ok))
        tip = "：請先用 3x-ui 官方的安裝指令裝好，裝好就會用回備份的設定" if label == "3x-ui" and xui_missing else " 沒有跑起來"
        rs.say(f"  {'✅' if ok else '❌'} {label}{'' if ok else tip}")
    if not checks:
        rs.say("  （這份備份裡沒有需要啟動的服務）")
    dom = conf.get("DOMAIN")
    if dom and conf.get("BIND") == "127.0.0.1":            # 還原後哨兵改走網域的加密連線：網頁要換網址
        hp = conf.get("HTTPS_PORT") or "443"
        rs.after = f"https://{dom}" + ("" if hp == "443" else f":{hp}") + "/"
    if dom and not rs.dry:
        try:
            dip = socket.gethostbyname(dom)
            with urllib.request.urlopen("https://api.ipify.org", timeout=6) as r:
                mine = r.read().decode().strip()
            if dip != mine:
                rs.say(f"\n⚠️ 網址 {dom} 現在指向 {dip}，這台是 {mine}：請到網域商把它改指向這台，網站和憑證才會正常")
        except Exception:  # noqa: BLE001
            pass
    bad = sum(1 for _, ok in rs.result if not ok)
    rs.say("\n還原完成 ✅" if not bad else f"\n還原完成，但有 {bad} 項沒有跑起來 ❌")
    rs.say(f"如果想回到還原前的樣子：sudo tar -xzf {shlex.quote(keep)} -C /")
    return rs


if __name__ == "__main__" and sys.argv[1:2] == ["--decrypt"]:
    vsbk_cli(sys.argv[2:])
if __name__ == "__main__" and sys.argv[1:2] == ["--restore"]:
    restore_cli(sys.argv[2:])

# ───────────────────────── 設定 ─────────────────────────

CONF_PATH = os.environ.get("SENTINEL_CONF", "/etc/vps-sentinel-lite.conf")


def load_config():
    path = CONF_PATH
    conf = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                conf[k.strip()] = v.strip().strip('"').strip("'")
    for k, v in os.environ.items():   # 環境變數優先
        if k.startswith("SENTINEL_") and k != "SENTINEL_CONF":
            conf[k[len("SENTINEL_"):]] = v
    return conf


C = load_config()
NAME = C.get("NAME") or socket.gethostname()
def _load_links():
    """這台主機的常用網頁（例如 3x-ui 後台、n8n），會在名稱旁邊出現連結"""
    try:
        v = json.loads(C.get("LINKS") or "[]")
        links = [{"name": str(x["name"])[:30], "url": str(x["url"])[:300]} for x in v if isinstance(x, dict) and x.get("url")]
    except (ValueError, TypeError, KeyError):
        links = []
    if not links and C.get("PANEL_URL"):           # 舊版只有一個「管理後台網址」
        links = [{"name": "管理後台", "url": C["PANEL_URL"]}]
    return links


LINKS = _load_links()
CLOUD_URL = C.get("CLOUD_URL", "")              # 雲端硬碟（cloud.sh 安裝後自動填）
CLOUD_DIR = C.get("CLOUD_DIR", "/srv/cloud")
CLOUD_PORT = int(C.get("CLOUD_PORT") or 8099)    # 雲端硬碟在本機的連接埠；網址 /cloud/ 開頭的都轉給它


def all_links():
    """使用者設定的常用連結＋雲端硬碟（雲端硬碟是固定的，不能在網頁上刪）"""
    return LINKS + ([{"name": "雲端硬碟", "url": CLOUD_URL, "fixed": True}] if CLOUD_URL else [])


# ── 雲端硬碟一鍵登入：已經登入哨兵，就不用再登入雲端硬碟 ──
CLOUD_USER_HEADER = "X-Sentinel-User"           # 哨兵轉送時告訴雲端硬碟「這是主人」（外面送進來的同名標頭一律丟掉）
CLOUD_OWNER = "owner"


def _sign(msg):
    return hmac.new(TOKEN.encode(), msg.encode(), hashlib.sha256).hexdigest()


CLOUD_DAYS = 30                                 # 雲端硬碟通行證的有效天數


def cloud_cookie_value(exp=None):
    """雲端硬碟通行證：裡面寫著到期時間並簽章，過期就要重新從哨兵點進去（就算被偷看到也不能一直用）"""
    exp = int(exp or time.time() + CLOUD_DAYS * 86400)
    return f"{exp}.{_sign(f'cloud-cookie:v2:{exp}')}"


def cloud_cookie_ok(v):
    exp, _, sig = (v or "").partition(".")
    return (bool(re.fullmatch(r"[0-9]{1,12}", exp)) and int(exp) > time.time()
            and hmac.compare_digest(sig.encode(), _sign(f"cloud-cookie:v2:{exp}").encode()))


CLOUD_TK_MIN = 15                               # 一次性登入票的有效分鐘數
CLOUD_TK_USED = {}                              # 用過的票（到期前都記著，同一張不能用第二次）
CLOUD_TK_LOCK = threading.Lock()


def cloud_sso_url():
    base = CLOUD_URL[:-len("cloud/")] if CLOUD_URL.endswith("cloud/") else CLOUD_URL.rstrip("/") + "/"
    return base + "cloud-sso"


def cloud_ticket():
    """一次性登入票：網頁點雲端硬碟時用表單送出（不放在網址裡），用過一次或 15 分鐘後就失效"""
    n, exp = secrets.token_urlsafe(12), int(time.time()) + CLOUD_TK_MIN * 60
    return f"{n}.{exp}.{_sign(f'cloud-sso:v3:{n}:{exp}')}"


def cloud_ticket_use(t):
    n, exp, sig = (str(t or "").split(".") + ["", "", ""])[:3]
    if not (re.fullmatch(r"[A-Za-z0-9_-]{8,40}", n) and re.fullmatch(r"[0-9]{1,12}", exp)
            and hmac.compare_digest(sig.encode(), _sign(f"cloud-sso:v3:{n}:{exp}").encode())):
        return False
    now = time.time()
    with CLOUD_TK_LOCK:
        for k in [k for k, v in CLOUD_TK_USED.items() if v < now]:
            del CLOUD_TK_USED[k]
        if int(exp) < now or n in CLOUD_TK_USED:
            return False
        CLOUD_TK_USED[n] = int(exp)
    return True


def cloud_info():
    if not CLOUD_URL:
        return None
    info = {"url": CLOUD_URL, "login": cloud_sso_url(), "ticket": cloud_ticket()}
    if os.path.ismount(CLOUD_DIR):
        d = disk(CLOUD_DIR)          # 跟 df 一樣的算法：系統預留的一小塊（約 16 MB）不算「已用」
        if d:
            info.update(total=d["total"], used=d["used"], pct=d["pct"])
    return info
BIND = C.get("BIND", "0.0.0.0")
PORT = int(C.get("PORT", "8787"))
TOKEN = C.get("TOKEN", "")
SERVICES = [s.strip() for s in C.get("SERVICES", "").split(",") if s.strip()]
DISKS = [d.strip() for d in C.get("DISKS", "/").split(",") if d.strip()]
TG_BOT = C.get("TG_BOT_TOKEN", "")
TG_CHAT = C.get("TG_CHAT_ID", "")
try:
    TG_KEEP = max(0.0, min(47.0, float(C.get("TG_KEEP_HOURS", "0") or 0)))   # 通知保留幾小時後自動刪除（0＝不刪；Telegram 只允許刪 48 小時內的）
except ValueError:
    TG_KEEP = 0.0
ALERT_CPU = float(C.get("ALERT_CPU", "90"))
ALERT_MEM = float(C.get("ALERT_MEM", "90"))
ALERT_DISK = float(C.get("ALERT_DISK", "90"))
CPU_MINUTES = float(C.get("ALERT_CPU_MINUTES", "5"))
DATA_DIR = C.get("DATA_DIR", "/var/lib/vps-sentinel-lite")


def _num(v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# 每日備份（說明在下面「每日備份」那一段）
BACKUP_ON = C.get("BACKUP", "on").lower() not in ("off", "0", "no")
BACKUP_HOUR = int(min(23, max(0, _num(C.get("BACKUP_HOUR"), 4))))
BACKUP_KEEP = 7                                   # 每個地方都只留最近 7 份
BACKUP_KEY = C.get("BACKUP_KEY", "")              # 備份檔的解開密碼（所有主機共用；第一次備份時自動產生）
try:
    BACKUP_TZ = int(C.get("BACKUP_TZ", ""))      # 備份檔名用哪個時區（跟使用者的瀏覽器一樣，分鐘；所有主機共用）
except ValueError:
    BACKUP_TZ = None
BK_LOCAL_DIR = os.path.join(DATA_DIR, "backups")  # 沒有雲端硬碟時，備份放這裡
BK_CLOUD_SUB = "哨兵備份"                          # 有雲端硬碟時，備份放在雲端硬碟的這個資料夾
BK_FILE_MAX = 300 * 1024 * 1024                   # 單一檔案超過這個大小就跳過（多半是記錄檔或暫存）
BK_UPLOAD_MAX = 2 * 1024 ** 3
TG_FILE_MAX = 49 * 1024 * 1024                    # Telegram 機器人最多只能傳 50 MB 的檔案
BK_SKIP_DIRS = {"cache", ".cache", "tmp", "log", "logs", "node_modules"}
BK_RUN = threading.Lock()                         # 同一時間只跑一次備份
BK_MAKE = threading.Lock()                        # 同一時間只打包一份
BK = {"last": None, "ok_t": None, "day": None, "key_t": 0, "names": {}, "tg": {}, "running": False}  # 會存檔
# tg：每台主機在 Telegram 裡最新那份備份的訊息 [聊天編號, 訊息編號]，傳了新的就把舊的刪掉
# names：每台主機上次用的名稱（""＝這台；其他主機用代號），主機改名後把舊資料夾搬到新名稱

TRAFFIC_LIMIT_GB = _num(C.get("TRAFFIC_LIMIT_GB"), 0)            # 0 = 不限制
TRAFFIC_RESET_DAY = int(min(28, max(1, _num(C.get("TRAFFIC_RESET_DAY"), 1))))
TRAFFIC_COUNT = C.get("TRAFFIC_COUNT", "both") if C.get("TRAFFIC_COUNT") in ("both", "out", "in", "max") else "both"


def parse_peers(raw):
    """PEERS=東京=http://100.x.x.x:8787,大阪=http://100.y.y.y:8787|另一組密碼"""
    peers = []
    for item in raw.split(","):
        item = item.strip()
        if "=" not in item:
            continue
        name, rest = item.split("=", 1)
        url, _, tok = rest.partition("|")
        url = url.strip()
        if "://" not in url:
            url = "http://" + url
        # 容錯：直接貼上手機用的網址（含 #t=密碼 或舊的 ?t=密碼）也可以
        u = urllib.parse.urlsplit(url)
        qtok = (urllib.parse.parse_qs(u.query).get("t", [""])[0]
                or urllib.parse.parse_qs(u.fragment).get("t", [""])[0])
        path = u.path.rstrip("/")
        for tail in ("/api/status", "/api/all", "/index.html"):
            if path.endswith(tail):
                path = path[: -len(tail)]
        peers.append({"name": name.strip(), "url": f"{u.scheme}://{u.netloc}{path}",
                      "token": tok.strip() or qtok or TOKEN})
    return peers


PEERS = parse_peers(C.get("PEERS", ""))


def peers_conf():
    """把 PEERS 寫回設定檔的格式（密碼跟這台一樣就不寫）"""
    return ",".join(f"{p['name']}={p['url']}" + (f"|{p['token']}" if p["token"] != TOKEN else "") for p in PEERS)


def set_peer(name, url, token, force=False):
    """網頁上修改其他主機的連線網址；會先試連，連不上就問要不要照樣儲存"""
    i = next((k for k, p in enumerate(PEERS) if p["name"] == name), None)
    if i is None:
        return False, "找不到這台主機", False
    url = re.sub(r"[\s,|]", "", str(url or ""))
    if not url:
        return False, "網址不能是空白", False
    token = re.sub(r"[\s,|]", "", str(token or "")) or PEERS[i]["token"]
    if PEERS[i]["token"].startswith("vsk_"):     # 用配對鑰匙連的：跟那台的登入密碼無關，鑰匙照留
        token = PEERS[i]["token"]
    new = parse_peers(f"{name}={url}|{token}")[0]
    pu = urllib.parse.urlsplit(new["url"])
    try:
        pu.port
    except ValueError:
        pu = None
    if not pu or pu.scheme not in ("http", "https") or not pu.hostname:
        return False, "網址格式不對，例如 https://網域:9443 或 http://IP:8787", False
    if not force:
        try:
            req = urllib.request.Request(new["url"] + "/api/status", headers={"X-Token": new["token"]})
            with urllib.request.urlopen(req, timeout=6) as r:
                json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            return False, peer_error(e, new["url"]), True
    PEERS[i] = new
    try:
        write_conf({"PEERS": peers_conf()})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}", False
    log(f"更改「{name}」的連線網址：{new['url']}")
    return True, f"已更新「{name}」的連線網址", False
PEER_SEEN = {}                                  # 其他主機最後一次連上的時間（會存檔）
TG_SENT = {}                                    # 每台主機已經通知到哪一筆事件（事件時間，會存檔）
TG_MSGS = []                                    # 傳出去的通知 [時間, 聊天, 訊息編號]，到期自動刪除（會存檔）

if not TOKEN:
    sys.exit("錯誤：設定檔裡沒有 TOKEN（存取密碼），請先設定。")


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


# ───────────────────────── 讀取系統狀態 ─────────────────────────

def read(path, default=""):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return default


def run(cmd, timeout=15):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                           env={**os.environ, "LANG": "C", "LC_ALL": "C"})
        return r.returncode, r.stdout
    except (OSError, subprocess.SubprocessError):
        return -1, ""


def cpu_times():
    parts = read("/proc/stat").split("\n", 1)[0].split()[1:9]
    v = [int(x) for x in parts] + [0] * (8 - len(parts))
    return sum(v), v[3] + v[4]          # 總時間, 閒置(含等待磁碟)


def default_ifaces():
    """對外的網卡：有預設路由的那張（IPv4 或 IPv6）"""
    ifs = set()
    for line in read("/proc/net/route").splitlines()[1:]:
        f = line.split()
        if len(f) > 2 and f[1] == "00000000":
            ifs.add(f[0])
    for line in read("/proc/net/ipv6_route").splitlines():
        f = line.split()
        if len(f) >= 10 and f[0] == "0" * 32 and f[1] == "00" and f[9] != "lo":
            ifs.add(f[9])
    return ifs


def iface_bytes():
    """{網卡: (收, 送)}；找得到對外網卡就只算那張，避免 Docker、翻牆內部轉送被重複計算"""
    out = {}
    for line in read("/proc/net/dev").splitlines()[2:]:
        if ":" not in line:
            continue
        iface, data = line.split(":", 1)
        f = data.split()
        try:
            out[iface.strip()] = (int(f[0]), int(f[8]))
        except (IndexError, ValueError):
            pass
    wanted = default_ifaces() & set(out)
    if wanted:
        return {k: v for k, v in out.items() if k in wanted}
    return {k: v for k, v in out.items()
            if k != "lo" and not k.startswith(("docker", "veth", "br-", "virbr", "tun", "wg", "tailscale"))}


def net_bytes():
    vals = iface_bytes().values()
    return sum(v[0] for v in vals), sum(v[1] for v in vals)


def boot_id():
    return read("/proc/sys/kernel/random/boot_id").strip()


SSH_WAY = {"publickey": "用金鑰", "password": "用密碼", "keyboard-interactive/pam": "用密碼"}


def ssh_logins(since_us):
    """從系統紀錄找出 since_us（微秒）之後成功登入的 SSH：[(時間微秒, 帳號, 來源 IP, 方式)]"""
    try:
        r = subprocess.run(["journalctl", "-t", "sshd", "-t", "sshd-session", "--since", f"@{since_us // 1_000_000}",
                            "-o", "json", "--no-pager", "-q"], capture_output=True, encoding="utf-8",
                           errors="replace", timeout=15)
    except (OSError, subprocess.SubprocessError):
        return []
    out = []
    for line in r.stdout.splitlines():
        try:
            e = json.loads(line)
            t, msg = int(e.get("__REALTIME_TIMESTAMP") or 0), e.get("MESSAGE")
        except (ValueError, TypeError, AttributeError):
            continue
        m = re.match(r"Accepted (\S+) for (\S+) from (\S+)", msg) if isinstance(msg, str) else None
        if m and t > since_us:
            out.append((t, m.group(2), m.group(3), SSH_WAY.get(m.group(1), "")))
    return out


def cycle_bounds(day=None):
    """這個計費週期的開始、結束日期（依每月重置日）"""
    day = day or date.today()
    d = TRAFFIC_RESET_DAY
    if day.day >= d:
        start = date(day.year, day.month, d)
    else:
        y, m = (day.year, day.month - 1) if day.month > 1 else (day.year - 1, 12)
        start = date(y, m, d)
    y, m = (start.year, start.month + 1) if start.month < 12 else (start.year + 1, 1)
    return start, date(y, m, d)


def meminfo():
    m = {}
    for line in read("/proc/meminfo").splitlines():
        k, _, v = line.partition(":")
        try:
            m[k] = int(v.split()[0]) * 1024
        except (ValueError, IndexError):
            pass
    total = m.get("MemTotal", 0)
    avail = m.get("MemAvailable", m.get("MemFree", 0))
    st, sf = m.get("SwapTotal", 0), m.get("SwapFree", 0)
    return {
        "total": total, "used": total - avail,
        "pct": round((total - avail) / total * 100, 1) if total else 0,
        "swap_total": st, "swap_used": st - sf,
        "swap_pct": round((st - sf) / st * 100, 1) if st else 0,
    }


def disk(path):
    try:
        s = os.statvfs(path)
    except OSError:
        return None
    total = s.f_blocks * s.f_frsize
    used = total - s.f_bfree * s.f_frsize
    avail = s.f_bavail * s.f_frsize
    base = used + avail
    return {"path": path, "total": total, "used": used,
            "pct": round(used / base * 100, 1) if base else 0}


def os_name():
    for line in read("/etc/os-release").splitlines():
        if line.startswith("PRETTY_NAME="):
            return line.split("=", 1)[1].strip('"')
    return "Linux"


def docker_containers():
    if not shutil.which("docker"):
        return None
    code, out = run(["docker", "ps", "-a", "--format",
                     "{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Image}}\t{{.Label \"com.docker.compose.project\"}}"], 10)
    if code != 0:
        return None
    items = []
    for line in out.strip().splitlines():
        p = line.split("\t")
        if len(p) >= 4:
            items.append({"name": p[0], "state": p[1], "status": p[2], "image": p[3],
                          "project": p[4].strip() if len(p) > 4 else ""})
    items.sort(key=lambda c: (c["state"] == "running", c["name"]))
    return items


def service_states():
    out = []
    for name in SERVICES:
        _, s = run(["systemctl", "is-active", name], 5)
        out.append({"name": name, "state": s.strip() or "unknown"})
    return out


def apt_updates():
    if not shutil.which("apt-get"):
        return None
    code, out = run(["apt-get", "-s", "-o", "Debug::NoLocking=1", "upgrade"], 90)
    if code != 0:
        return None
    lines = [l for l in out.splitlines() if l.startswith("Inst ")]
    return {"total": len(lines), "security": sum("-security" in l for l in lines)}


# ───────────────────────── 更新哨兵本身 ─────────────────────────

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_FILES = ["sentinel.py", "web/index.html", "web/style.css", "web/app.js"]   # 程式本體＋網頁三個檔


def build_of(blobs):
    """把所有檔案內容合起來算一個指紋，用來判斷是不是最新版"""
    h = hashlib.sha1()
    for b in blobs:
        h.update(b)
    return h.hexdigest()[:7]


def load_page():
    """網頁放在 web/ 資料夾：啟動時把樣式和程式塞回 index.html，送出去的還是同一個完整網頁"""
    def rd(p):
        with open(os.path.join(HERE, p), encoding="utf-8") as f:
            return f.read()
    try:
        html = rd("web/index.html").rstrip("\n")
        return html.replace("/*@style.css*/\n", rd("web/style.css")).replace("/*@app.js*/\n", rd("web/app.js"))
    except OSError as e:
        log(f"找不到網頁檔案（{e}）：請重新執行 bash install.sh")
        return "<meta charset=utf-8><p style='font:16px sans-serif;padding:24px'>找不到網頁檔案，請在主機上重新執行 <b>bash install.sh</b></p>"


def _read_bytes(p):
    try:
        with open(os.path.join(HERE, p), "rb") as f:
            return f.read()
    except OSError:
        return b""


BUILD = build_of(_read_bytes(p) for p in SRC_FILES)
SELF_UNIT = "vps-sentinel-selfupdate"
SELF_LOG = "/var/log/vps-sentinel-selfupdate.log"
SELF = {"checked": 0, "has": None, "changes": [], "err": "", "lock": threading.Lock()}


def git(d, *args, timeout=30):
    try:
        r = subprocess.run(["git", "-c", "safe.directory=*", "-C", d, *args], capture_output=True,
                           encoding="utf-8", errors="replace", timeout=timeout,
                           env={**os.environ, "LANG": "C.UTF-8", "GIT_TERMINAL_PROMPT": "0"})
        return r.returncode, r.stdout, r.stderr
    except (OSError, subprocess.SubprocessError) as e:
        return -1, "", str(e)


def src_dir():
    """找安裝來源資料夾（git clone 下來的那個）"""
    for d in [C.get("SRC_DIR", ""), "/root/vps-sentinel", *glob.glob("/home/*/vps-sentinel")]:
        # 會用 root 身分執行裡面的 install.sh：只認 root 或資料夾所在家目錄的主人建立的，別的使用者放的不算
        try:
            own = os.stat(d).st_uid if d else -1
            home = os.stat(os.path.dirname(d)).st_uid if d.startswith("/home/") else 0
        except OSError:
            continue
        if own not in (0, home):
            continue
        if d and os.path.isdir(os.path.join(d, ".git")) and os.path.isfile(os.path.join(d, "install.sh")):
            return d
    return ""


def self_running():
    _, out = run(["systemctl", "is-active", SELF_UNIT], 5)
    return out.strip() in ("active", "activating")


def self_last():
    try:
        with open(SELF_LOG, encoding="utf-8", errors="replace") as f:
            lines = f.read().splitlines()[-200:]
    except OSError:
        return None
    for line in reversed(lines):
        if line.startswith("__RESULT__"):
            p = line.split()
            try:
                return {"ok": p[1] == "ok", "time": float(p[2])}
            except (IndexError, ValueError):
                return None
    return None


def self_check(force=False):
    """看 GitHub 上有沒有新版（3 小時查一次，或手動按「檢查」）"""
    d = src_dir()
    base = {"build": BUILD, "version": VERSION, "running": self_running(), "last": self_last()}
    if not d or not shutil.which("git") or not shutil.which("systemd-run"):
        return {**base, "supported": False,
                "err": "找不到安裝資料夾，請先照說明手動更新一次（git pull 後執行 bash install.sh）"}
    with SELF["lock"]:
        if force or time.time() - SELF["checked"] > 3 * 3600:
            code, _, err = git(d, "fetch", "--quiet", "origin")
            SELF["checked"] = time.time()
            if code != 0:
                SELF.update(has=None, changes=[], err="連不上 GitHub，暫時沒辦法檢查新版")
            else:
                blobs = [git(d, "show", f"@{{u}}:{p}")[1] for p in SRC_FILES]
                new_build = build_of(x.encode("utf-8") for x in blobs) if blobs[0] else ""
                _, logs, _ = git(d, "log", "--format=%s", "-n", "8", "HEAD..@{u}")
                SELF.update(has=bool(new_build) and new_build != BUILD, err="",
                            changes=[x.strip() for x in logs.splitlines() if x.strip()])
        return {**base, "supported": True, "has": SELF["has"], "changes": SELF["changes"], "err": SELF["err"],
                "checked": SELF["checked"]}


def self_update():
    d = src_dir()
    if not d:
        return False, "找不到安裝資料夾，請先照說明手動更新一次"
    if self_running():
        return False, "已經在更新中了"
    q = shlex.quote(d)
    script = f"""set -u
echo "=== 開始更新哨兵 $(date '+%F %T') ==="
res=fail
cd {q} && git -c safe.directory='*' fetch origin && git -c safe.directory='*' reset --hard '@{{u}}' && bash install.sh && res=ok
echo "__RESULT__ $res $(date +%s)"""
    try:
        if os.path.getsize(SELF_LOG) > 1_000_000:
            open(SELF_LOG, "w").close()
    except OSError:
        pass
    try:                                          # 安裝畫面會印出登入網址（含密碼）：記錄檔只給 root 看
        os.close(os.open(SELF_LOG, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600))
        os.chmod(SELF_LOG, 0o600)
    except OSError:
        pass
    run(["systemctl", "reset-failed", SELF_UNIT], 5)
    code, _ = run(["systemd-run", f"--unit={SELF_UNIT}", "--collect",
                   f"--property=StandardOutput=append:{SELF_LOG}",
                   f"--property=StandardError=append:{SELF_LOG}",
                   "/bin/bash", "-c", script], 15)
    if code != 0:
        return False, "無法開始更新"
    log("開始更新哨兵本身")
    return True, "已開始更新，大約 10～30 秒後會自動重新啟動"


# ───────────────────────── 雲端硬碟的更新 ─────────────────────────

CLOUD_IMAGE = "ghcr.io/gtsteffaniak/filebrowser"
CLOUD_TAG = "stable"
CLOUD_UNIT = "vps-cloud-update"
CLOUDUP = {"checked": 0, "has": None, "err": "", "lock": threading.Lock()}


def docker_json(*args):
    code, out = run(["docker", *args], 15)
    try:
        return json.loads(out) if code == 0 and out.strip() else None
    except ValueError:
        return None


def cloud_local():
    """雲端硬碟容器目前用的映像檔：(摘要清單, 版本)"""
    info = docker_json("inspect", "--format", "{{json .Image}}", "vps-cloud")
    if not info:
        return None, ""
    img = docker_json("image", "inspect", "--format", "{{json .}}", info) or {}
    labels = (img.get("Config") or {}).get("Labels") or {}
    digests = [d.split("@", 1)[1] for d in img.get("RepoDigests") or [] if "@" in d]
    return digests, labels.get("org.opencontainers.image.version", "")


def cloud_remote_digest():
    """直接問 GitHub 的映像檔倉庫，官方最新穩定版的摘要（不用下載整個映像檔）"""
    repo = CLOUD_IMAGE.split("/", 1)[1]
    with urllib.request.urlopen(f"https://ghcr.io/token?scope=repository:{repo}:pull", timeout=10) as r:
        tok = json.loads(r.read())["token"]
    req = urllib.request.Request(f"https://ghcr.io/v2/{repo}/manifests/{CLOUD_TAG}", method="HEAD", headers={
        "Authorization": f"Bearer {tok}",
        "Accept": ", ".join(["application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json",
                             "application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json"])})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.headers.get("Docker-Content-Digest", "")


def cloud_running():
    _, out = run(["systemctl", "is-active", CLOUD_UNIT], 5)
    return out.strip() in ("active", "activating")


def cloud_check(force=False):
    if not CLOUD_URL or not shutil.which("docker"):
        return None
    digests, ver = cloud_local()
    base = {"version": ver, "running": cloud_running()}
    if digests is None:
        return {**base, "has": None, "err": "雲端硬碟程式沒有在跑"}
    if base["running"]:                         # 更新中先不查：不然會拿舊版去比，更新完還一直說「有新版」
        return {**base, "has": None, "err": ""}
    with CLOUDUP["lock"]:
        if force or time.time() - CLOUDUP["checked"] > 3 * 3600:
            CLOUDUP["checked"] = time.time()
            try:
                dg = cloud_remote_digest()
                CLOUDUP.update(has=bool(dg) and dg not in digests, err="")
            except Exception:  # noqa: BLE001
                CLOUDUP.update(has=None, err="連不上官方的下載點，暫時沒辦法檢查新版")
        return {**base, "has": CLOUDUP["has"], "err": CLOUDUP["err"]}


def cloud_update():
    d = src_dir()
    if not CLOUD_URL:
        return False, "這台還沒安裝雲端硬碟"
    if not d or not os.path.isfile(os.path.join(d, "cloud.sh")):
        return False, "找不到安裝資料夾，請先更新哨兵"
    if cloud_running():
        return False, "雲端硬碟已經在更新中了"
    run(["systemctl", "reset-failed", CLOUD_UNIT], 5)
    code, _ = run(["systemd-run", f"--unit={CLOUD_UNIT}", "--collect", "/bin/bash", os.path.join(d, "cloud.sh"), "更新"], 15)
    if code != 0:
        return False, "無法開始更新"
    CLOUDUP["has"] = None
    CLOUDUP["checked"] = 0                     # 更新完下次再查一次
    log("開始更新雲端硬碟")
    return True, "已開始更新雲端硬碟"


# ───────────────────────── 常用連結健康檢查 ─────────────────────────

LINK_STATE = {}                                 # 網址 → {"up", "ms", "err", "fails"}


def check_link(url):
    """打開網址看看有沒有回應：有回應（就算要登入、404）都算活著，連不上或 5xx 才算掛掉"""
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "vps-sentinel"})
        with urllib.request.urlopen(req, timeout=8, context=ssl._create_unverified_context()) as r:
            code = r.status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception as e:  # noqa: BLE001
        t = str(e)
        why = ("等太久沒有回應" if "timed out" in t.lower() else "拒絕連線（服務可能沒在跑）" if "refused" in t
               else "找不到這個網域" if "Name or service" in t or "getaddrinfo" in t else "連不上")
        return False, None, why
    ms = int((time.time() - t0) * 1000)
    if code >= 500:
        return False, ms, f"網站出錯（代碼 {code}）"
    return True, ms, ""


def check_links():
    links = all_links()
    urls = [x["url"] for x in links]
    for u in list(LINK_STATE):
        if u not in urls:
            del LINK_STATE[u]
    # 雲端硬碟直接在本機檢查（從主機連自己的公開 IP，有些雲端主機會連不到，造成誤報）
    targets = [f"http://127.0.0.1:{CLOUD_PORT}/cloud/health" if x.get("fixed") else x["url"] for x in links]
    for u, (up, ms, err) in zip(urls, POOL.map(check_link, targets)):
        st = LINK_STATE.setdefault(u, {"fails": 0})
        st["fails"] = 0 if up else st["fails"] + 1
        st.update(up=True if up else (None if st["fails"] < 2 else False), ms=ms, err=err)   # 連續 2 次失敗才算掛掉，避免偶爾慢一下就誤報
    check_certs()


CERT_STATE = {}                                 # 網址 → {"exp": 到期時間, "expired": 已過期, "checked": 上次檢查}


def cert_expiry(url):
    """看網址的安全憑證什麼時候到期：回傳 (到期時間, 已過期)；不是 https、用 IP 或自己簽的憑證就不管"""
    u = urllib.parse.urlsplit(url)
    if u.scheme != "https" or not u.hostname:
        return None, False
    try:
        ipaddress.ip_address(u.hostname)
        return None, False
    except ValueError:
        pass
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((u.hostname, u.port or 443), timeout=8) as raw, \
                ctx.wrap_socket(raw, server_hostname=u.hostname) as s:
            return ssl.cert_time_to_seconds(s.getpeercert()["notAfter"]), False
    except ssl.SSLCertVerificationError as e:
        return None, e.verify_code == 10            # 10 ＝ 憑證已過期；其他原因（自己簽的、網域不符）不算
    except (OSError, KeyError, ValueError, TypeError):
        return None, False


def check_certs():
    """每 6 小時看一次常用連結的憑證"""
    now, urls = time.time(), [x["url"] for x in all_links()]
    for u in list(CERT_STATE):
        if u not in urls:
            del CERT_STATE[u]
    due = [u for u in urls if now - CERT_STATE.get(u, {}).get("checked", 0) > 6 * 3600]
    for u, (exp, expired) in zip(due, POOL.map(cert_expiry, due)):
        CERT_STATE[u] = {"exp": exp, "expired": expired, "checked": now}


# ── 用 acme.sh 申請的憑證（例如 3x-ui）：80 埠被 nginx 等佔走時，acme.sh 自己續不了，由哨兵幫忙 ──
ACME_HOME = C.get("ACME_HOME", "/root/.acme.sh")
ACME_UNIT = "vps-sentinel-acme"
ACME_LOG = "/var/log/vps-sentinel-acme.log"
ACME = {"last": {}, "lock": threading.Lock()}   # 網域 → 上次幫忙續期的時間


def acme_certs():
    """acme.sh 管的憑證：[{"domain", "ecc", "mode", "next"}]；mode 是 "no" 代表要用 80 埠驗證"""
    out = []
    for conf in glob.glob(os.path.join(ACME_HOME, "*", "*.conf")):
        d = os.path.basename(os.path.dirname(conf))
        name = d[:-4] if d.endswith("_ecc") else d
        if os.path.basename(conf) != name + ".conf":
            continue                                  # 略過 .csr.conf 之類的
        kv = {}
        for line in read(conf).splitlines():
            k, _, v = line.partition("=")
            kv[k.strip()] = v.strip().strip("'\"")
        try:
            nxt = int(kv.get("Le_NextRenewTime") or 0)
        except ValueError:
            nxt = 0
        out.append({"domain": name, "ecc": d.endswith("_ecc"), "mode": kv.get("Le_Webroot", ""), "next": nxt})
    return out


def port80_holder():
    """80 埠被誰佔著：(有沒有被佔, 佔用的系統服務名稱)"""
    with socket.socket() as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0", 80))
            return False, ""
        except OSError:
            pass
    _, out = run(["ss", "-ltnpH", "sport = :80"], 10)
    for pid in dict.fromkeys(re.findall(r"pid=(\d+)", out)):
        m = re.search(r"/([\w@.-]+\.service)$", read(f"/proc/{pid}/cgroup"), re.M)
        if m:
            return True, m.group(1)
    return True, ""


def acme_name(domain):
    """用常用連結的名稱稱呼這個網域（例如「3x-ui」），沒有就直接用網域"""
    for x in all_links():
        if urllib.parse.urlsplit(x["url"]).hostname == domain:
            return x["name"]
    return domain


def acme_renew_due():
    """acme.sh 該續期了、但 80 埠被別的服務佔著：暫停那個服務幾秒、續期、再打開"""
    if not os.path.isfile(os.path.join(ACME_HOME, "acme.sh")) or not shutil.which("systemd-run"):
        return
    if not ACME["lock"].acquire(blocking=False):
        return
    try:
        now = time.time()
        for c in acme_certs():
            if c["mode"] != "no" or not c["next"] or now < c["next"]:
                continue
            if now - ACME["last"].get(c["domain"], 0) < 12 * 3600:
                continue                              # 失敗的話 12 小時後再試，不要一直重來
            busy, unit = port80_holder()
            if not busy or not unit:
                continue                              # 80 埠空著：acme.sh 自己就續得了
            if unit in ("docker.service", "containerd.service"):
                continue                              # 80 埠是容器在用：停掉會讓所有容器（n8n、雲端硬碟）一起停，不幫忙
            ACME["last"][c["domain"]] = now
            acme = shlex.quote(os.path.join(ACME_HOME, "acme.sh"))
            u = shlex.quote(unit)
            script = f"""set -u
echo "=== 續期 {c['domain']}：暫停 {unit} $(date '+%F %T') ==="
trap 'systemctl start {u}' EXIT
systemctl stop {u}
{acme} --home {shlex.quote(ACME_HOME)} --renew -d {shlex.quote(c['domain'])} {'--ecc ' if c['ecc'] else ''}--force"""
            run(["systemctl", "reset-failed", ACME_UNIT], 5)
            code, _ = run(["systemd-run", f"--unit={ACME_UNIT}", "--collect", "--wait", "--quiet",
                           f"--property=StandardOutput=append:{ACME_LOG}",
                           f"--property=StandardError=append:{ACME_LOG}",
                           "/bin/bash", "-c", script], 300)
            name = acme_name(c["domain"])
            if code == 0:
                log(f"已自動續期 {c['domain']} 的憑證")
                COL.add_event("ok", f"「{name}」的安全憑證已自動續期")
                for st in CERT_STATE.values():
                    st["checked"] = 0                 # 下一分鐘就重新檢查，提醒會自己消失
            else:
                log(f"自動續期 {c['domain']} 失敗，詳細記錄在 {ACME_LOG}")
                COL.add_event("bad", f"「{name}」的安全憑證自動續期失敗")
    finally:
        ACME["lock"].release()


def links_status():
    return [{**x, **{k: v for k, v in LINK_STATE.get(x["url"], {}).items() if k != "fails"}} for x in all_links()]


# ───────────────────────── 換密碼 ─────────────────────────

def change_token():
    """換一組新的存取密碼：舊密碼、雲端硬碟通行證、一鍵登入網址全部失效"""
    global TOKEN
    old, new = TOKEN, secrets.token_urlsafe(18)
    TOKEN = new
    vals = {"TOKEN": new}
    if PEERS:
        vals["PEERS"] = peers_conf()             # 其他主機原本跟這台用同一組密碼的，要把舊密碼寫明，才不會連不上
    try:
        write_conf(vals)
    except OSError as e:
        TOKEN = old
        return False, f"無法寫入設定檔：{e}", ""
    log("已換成新的存取密碼")
    COL.add_event("info", "存取密碼已換新")
    return True, "已換成新密碼", new


def set_peer_token(name, token):
    """幫另一台換了密碼後，這邊記住它的新密碼"""
    p = next((p for p in PEERS if p["name"] == name), None)
    if not p or not token or p["token"].startswith("vsk_"):      # 用配對鑰匙連的：跟那台的登入密碼無關
        return
    p["token"] = token
    try:
        write_conf({"PEERS": peers_conf()})
    except OSError as e:
        log("無法記住新密碼：", e)


# ───────────────────────── 手機金鑰登入 ─────────────────────────
# 用手機的指紋／臉部辨識登入（WebAuthn 通行金鑰）。登記好的金鑰存在 DATA_DIR/passkeys.json，
# 登入成功就把目前的存取密碼交給這台裝置，之後跟輸入密碼登入完全一樣（換密碼後金鑰照樣能用）。
# 內建模組沒有驗證簽名的工具，下面自己做：讀 CBOR 格式、驗 P-256 橢圓曲線簽名、RSA 簽名。

PASSKEY_MAX = 5
PK_LOCK = threading.Lock()
PK_CHALLENGES = {}                              # 一次性的驗證題目 → 到期時間（2 分鐘）


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def unb64u(s):
    s = str(s or "")
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def cbor_load(data, i=0):
    """讀一筆 CBOR（金鑰資料用的格式），回傳 (內容, 下一筆的位置)"""
    ib = data[i]
    major, info = ib >> 5, ib & 31
    i += 1
    if info < 24:
        n = info
    elif info in (24, 25, 26, 27):
        size = 1 << (info - 24)
        n = int.from_bytes(data[i:i + size], "big")
        i += size
    else:
        raise ValueError("不支援的 CBOR 長度")
    if major == 0:
        return n, i
    if major == 1:
        return -1 - n, i
    if major in (2, 3):
        if i + n > len(data):
            raise ValueError("CBOR 資料不完整")
        v = data[i:i + n]
        return (v if major == 2 else v.decode()), i + n
    if major == 4:
        out = []
        for _ in range(n):
            v, i = cbor_load(data, i)
            out.append(v)
        return out, i
    if major == 5:
        out = {}
        for _ in range(n):
            k, i = cbor_load(data, i)
            out[k], i = cbor_load(data, i)
        return out, i
    if major == 7:
        return {20: False, 21: True, 22: None}.get(n), i
    raise ValueError("不支援的 CBOR 型別")


# P-256 橢圓曲線（手機通行金鑰幾乎都用這個）
_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
_A = _P - 3
_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b
_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
_G = (0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296,
      0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5)


def _ec_add(p, q):
    if p is None:
        return q
    if q is None:
        return p
    if p[0] == q[0]:
        if (p[1] + q[1]) % _P == 0:
            return None
        lam = (3 * p[0] * p[0] + _A) * pow(2 * p[1], -1, _P) % _P
    else:
        lam = (q[1] - p[1]) * pow(q[0] - p[0], -1, _P) % _P
    x = (lam * lam - p[0] - q[0]) % _P
    return x, (lam * (p[0] - x) - p[1]) % _P


def _ec_mul(k, p):
    out = None
    while k:
        if k & 1:
            out = _ec_add(out, p)
        p = _ec_add(p, p)
        k >>= 1
    return out


def ec_on_curve(x, y):
    return 0 <= x < _P and 0 <= y < _P and (y * y - x * x * x - _A * x - _B) % _P == 0


def _der_sig(sig):
    """把 DER 格式的簽名拆成 (r, s)"""
    if len(sig) < 8 or sig[0] != 0x30 or sig[1] != len(sig) - 2:
        raise ValueError("簽名格式不對")
    out, i = [], 2
    for _ in range(2):
        if sig[i] != 0x02:
            raise ValueError("簽名格式不對")
        n = sig[i + 1]
        out.append(int.from_bytes(sig[i + 2:i + 2 + n], "big"))
        i += 2 + n
    if i != len(sig):
        raise ValueError("簽名格式不對")
    return out


def ecdsa_verify(x, y, msg, sig):
    """驗證 P-256 + SHA-256 簽名（sig 是 DER 格式）"""
    try:
        r, s = _der_sig(sig)
    except (ValueError, IndexError):
        return False
    if not (0 < r < _N and 0 < s < _N) or not ec_on_curve(x, y):
        return False
    e = int.from_bytes(hashlib.sha256(msg).digest(), "big")
    w = pow(s, -1, _N)
    pt = _ec_add(_ec_mul(e * w % _N, _G), _ec_mul(r * w % _N, (x, y)))
    return pt is not None and pt[0] % _N == r


def rsa_verify(n, e, msg, sig):
    """驗證 RSA PKCS#1 v1.5 + SHA-256 簽名（Windows 電腦的金鑰會用這個）"""
    k = (n.bit_length() + 7) // 8
    if len(sig) != k or n.bit_length() < 2048:
        return False
    em = pow(int.from_bytes(sig, "big"), e, n).to_bytes(k, "big")
    t = bytes.fromhex("3031300d060960864801650304020105000420") + hashlib.sha256(msg).digest()
    return hmac.compare_digest(em, b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t)


def cose_key(raw):
    """把金鑰裡的公開鑰匙轉成可以存檔的格式；不支援的種類回傳 None"""
    k = raw if isinstance(raw, dict) else cbor_load(raw)[0]
    if k.get(1) == 2 and k.get(3) == -7 and k.get(-1) == 1:            # P-256
        x, y = int.from_bytes(k[-2], "big"), int.from_bytes(k[-3], "big")
        return {"alg": -7, "x": f"{x:x}", "y": f"{y:x}"} if ec_on_curve(x, y) else None
    if k.get(1) == 3 and k.get(3) == -257:                             # RSA
        n = int.from_bytes(k[-1], "big")
        return {"alg": -257, "n": f"{n:x}", "e": int.from_bytes(k[-2], "big")} if n.bit_length() >= 2048 else None
    return None


def pk_sig_ok(key, msg, sig):
    if key.get("alg") == -7:
        return ecdsa_verify(int(key["x"], 16), int(key["y"], 16), msg, sig)
    if key.get("alg") == -257:
        return rsa_verify(int(key["n"], 16), int(key["e"]), msg, sig)
    return False


def pk_path():
    return os.path.join(DATA_DIR, "passkeys.json")


def pk_load():
    try:
        with open(pk_path(), encoding="utf-8") as f:
            v = json.load(f)
        return [x for x in v if isinstance(x, dict) and x.get("id") and x.get("key")] if isinstance(v, list) else []
    except (OSError, ValueError):
        return []


def pk_save(keys):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = pk_path() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(keys, f, ensure_ascii=False)
    os.chmod(tmp, 0o600)
    os.replace(tmp, pk_path())


def pk_list():
    return [{"id": k["id"], "name": k.get("name") or "手機", "added": k.get("added"), "used": k.get("used")} for k in pk_load()]


def pk_challenge(kind):
    now = time.time()
    with PK_LOCK:
        for c in [c for c, (_, t) in PK_CHALLENGES.items() if t < now]:
            PK_CHALLENGES.pop(c, None)
        while len(PK_CHALLENGES) >= 200:                                # 有人一直要題目：丟掉最舊的
            PK_CHALLENGES.pop(min(PK_CHALLENGES, key=lambda c: PK_CHALLENGES[c][1]))
        c = b64u(secrets.token_bytes(32))
        PK_CHALLENGES[c] = (kind, now + 120)
    return c


def pk_rp(host):
    """網址的主機名稱（不含連接埠），金鑰會綁在這個名稱上"""
    h = (host or "").strip().lower()
    h = h[1:h.index("]")] if h.startswith("[") and "]" in h else h.rsplit(":", 1)[0] if h.count(":") == 1 else h
    return h


def _pk_client(cdj, kind):
    """檢查瀏覽器送來的 clientDataJSON：題目要對、要是一次性、網址的主機名稱要對；回傳主機名稱"""
    try:
        cd = json.loads(cdj)
    except ValueError:
        return None, "資料格式不對"
    if not isinstance(cd, dict) or cd.get("type") != kind:
        return None, "資料格式不對"
    with PK_LOCK:
        got = PK_CHALLENGES.pop(str(cd.get("challenge")), None)
    if not got or got[0] != kind or got[1] < time.time():
        return None, "等太久了，請再試一次"
    o = urllib.parse.urlsplit(str(cd.get("origin") or ""))
    host = (o.hostname or "").lower()
    if not host or not (o.scheme == "https" or host == "localhost"):
        return None, "要用 https 網址才能使用手機金鑰"
    return host, ""


def _pk_auth_data(ad, rp):
    """檢查驗證資料：要是這個網址、手機要確認過是本人（指紋、臉部或螢幕鎖）"""
    if len(ad) < 37 or not hmac.compare_digest(ad[:32], hashlib.sha256(rp.encode()).digest()):
        return "網址不符"
    if ad[32] & 0x05 != 0x05:
        return "手機沒有確認是你本人"
    return ""


def pk_register_begin(host):
    rp = pk_rp(host)
    keys = pk_load()
    if len(keys) >= PASSKEY_MAX:
        return False, {"message": f"最多只能登記 {PASSKEY_MAX} 支，請先刪掉一支"}
    return True, {"challenge": pk_challenge("webauthn.create"), "rp": rp, "name": NAME,
                  "user": b64u(hashlib.sha256(f"vps-sentinel:{rp}".encode()).digest()[:16]),
                  "exclude": [k["id"] for k in keys if k.get("rp") == rp]}


def pk_register_finish(d):
    try:
        cdj, att = unb64u(d.get("clientDataJSON")), unb64u(d.get("attestationObject"))
        rp, err = _pk_client(cdj, "webauthn.create")
        if err:
            return False, err
        ao = cbor_load(att)[0]
        ad = ao["authData"]
        err = _pk_auth_data(ad, rp)
        if err:
            return False, err
        if not ad[32] & 0x40 or len(ad) < 55:
            return False, "沒有收到金鑰"
        n = int.from_bytes(ad[53:55], "big")
        cid = ad[55:55 + n]
        key = cose_key(cbor_load(ad, 55 + n)[0])
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        return False, "資料格式不對"
    if not key:
        return False, "這種金鑰還不支援"
    name = re.sub(r"\s+", " ", str(d.get("name") or "")).strip()[:20] or "手機"
    with PK_LOCK:
        keys = pk_load()
        if len(keys) >= PASSKEY_MAX:
            return False, f"最多只能登記 {PASSKEY_MAX} 支，請先刪掉一支"
        if any(k["id"] == b64u(cid) for k in keys):
            return False, "這支已經登記過了"
        keys.append({"id": b64u(cid), "rp": rp, "key": key, "name": name, "added": int(time.time()), "used": None})
        try:
            pk_save(keys)
        except OSError as e:
            return False, f"無法存檔：{e}"
    log(f"登記了手機金鑰「{name}」")
    COL.add_event("info", f"登記了手機金鑰「{name}」")
    return True, f"已登記「{name}」，下次可以直接用它登入"


def pk_login_finish(d):
    try:
        cid = str(d.get("id") or "")
        cdj, ad, sig = unb64u(d.get("clientDataJSON")), unb64u(d.get("authenticatorData")), unb64u(d.get("signature"))
    except (ValueError, TypeError, AttributeError):
        return False, "資料格式不對"
    rp, err = _pk_client(cdj, "webauthn.get")
    if err:
        return False, err
    with PK_LOCK:
        keys = pk_load()
        k = next((k for k in keys if k["id"] == cid), None)
        if not k or k.get("rp") != rp:
            return False, "這支手機沒有登記過，請先用密碼登入，再到設定裡登記"
        err = _pk_auth_data(ad, rp)
        if err:
            return False, err
        if not pk_sig_ok(k["key"], ad + hashlib.sha256(cdj).digest(), sig):
            return False, "金鑰驗證失敗"
        k["used"] = int(time.time())
        try:
            pk_save(keys)
        except OSError:
            pass
    return True, k.get("name") or "手機"


def pk_delete(cid):
    with PK_LOCK:
        keys = pk_load()
        k = next((k for k in keys if k["id"] == cid), None)
        if not k:
            return False, "找不到這支"
        try:
            pk_save([x for x in keys if x is not k])
        except OSError as e:
            return False, f"無法存檔：{e}"
    log(f"刪除了手機金鑰「{k.get('name')}」")
    COL.add_event("info", f"刪除了手機金鑰「{k.get('name')}」")
    return True, f"已刪除「{k.get('name')}」，它不能再登入了"


# ───────────────────────── PIN 碼登入 ─────────────────────────
# 4～8 位數字，存在 DATA_DIR/pin.json（只存加鹽雜湊，不存 PIN 碼本身）。登入成功就交出目前的存取密碼。
# 數字很短容易被猜，所以：連續輸錯 5 次暫停 15 分鐘；累計輸錯 10 次直接關閉 PIN 碼，要用密碼或手機金鑰登入後重新設定。

PIN_LOCK_AFTER, PIN_LOCK_MIN, PIN_OFF_AFTER = 5, 15, 10
PIN_LK = threading.Lock()


def pin_path():
    return os.path.join(DATA_DIR, "pin.json")


def pin_load():
    try:
        with open(pin_path(), encoding="utf-8") as f:
            v = json.load(f)
        return v if isinstance(v, dict) and v.get("hash") else None
    except (OSError, ValueError):
        return None


def pin_save(v):
    os.makedirs(DATA_DIR, exist_ok=True)
    if v is None:
        try:
            os.remove(pin_path())
        except FileNotFoundError:
            pass
        return
    tmp = pin_path() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(v, f)
    os.chmod(tmp, 0o600)
    os.replace(tmp, pin_path())


def _pin_hash(pin, salt, n):
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), n).hex()


def pin_status():
    p = pin_load()
    if not p:
        return {"on": False}
    left = int(p.get("lock_until", 0) - time.time())
    return {"on": True, "locked": max(0, left)}


def pin_set(pin):
    pin = str(pin or "")
    if not re.fullmatch(r"[0-9]{4,8}", pin):
        return False, "PIN 碼要是 4 到 8 位數字"
    if len(set(pin)) == 1 or pin in "0123456789" or pin in "9876543210":
        return False, "這組太好猜了（同一個數字或連號），換一組吧"
    salt, n = secrets.token_hex(16), 200_000
    with PIN_LK:
        try:
            pin_save({"hash": _pin_hash(pin, salt, n), "salt": salt, "n": n, "fails": 0, "streak": 0, "lock_until": 0,
                      "set": int(time.time())})
        except OSError as e:
            return False, f"無法存檔：{e}"
    log("設定了 PIN 碼")
    COL.add_event("info", "PIN 碼登入已設定")
    return True, "PIN 碼設定好了"


def pin_off(reason=""):
    with PIN_LK:
        try:
            pin_save(None)
        except OSError as e:
            return False, f"無法存檔：{e}"
    log("關閉了 PIN 碼" + (f"：{reason}" if reason else ""))
    COL.add_event("warn" if reason else "info", reason or "PIN 碼登入已關閉")
    return True, "PIN 碼已關閉"


def pin_reset_fails():
    """用密碼或手機金鑰登入成功：之前輸錯的次數歸零"""
    with PIN_LK:
        p = pin_load()
        if p and (p.get("fails") or p.get("streak") or p.get("lock_until")):
            p.update(fails=0, streak=0, lock_until=0)
            try:
                pin_save(p)
            except OSError:
                pass


def pin_login(pin):
    """回傳 (成功與否, 訊息)"""
    pin = str(pin or "")
    with PIN_LK:
        p = pin_load()
        if not p:
            return False, "這台主機沒有設定 PIN 碼"
        now = time.time()
        if p.get("lock_until", 0) > now:
            return False, f"輸錯太多次，請 {int((p['lock_until'] - now) // 60) + 1} 分鐘後再試，或改用密碼登入"
        try:
            ok = re.fullmatch(r"[0-9]{4,8}", pin) and hmac.compare_digest(_pin_hash(pin, p["salt"], int(p["n"])), p["hash"])
        except (KeyError, ValueError, TypeError):
            ok = False
        if ok:
            p.update(streak=0)                    # 累計輸錯的次數要用密碼或手機金鑰登入才歸零，不然可以一直猜
            event = None
        else:
            p["streak"] = p.get("streak", 0) + 1
            p["fails"] = p.get("fails", 0) + 1
            event = None
            if p["fails"] >= PIN_OFF_AFTER:
                p = None
            elif p["streak"] >= PIN_LOCK_AFTER:
                p.update(streak=0, lock_until=now + PIN_LOCK_MIN * 60)
                event = f"PIN 碼連續輸錯 {PIN_LOCK_AFTER} 次，暫停 {PIN_LOCK_MIN} 分鐘"
        try:
            pin_save(p)
        except OSError:
            pass
    if p is None:
        log("PIN 碼輸錯太多次，已自動關閉")
        COL.add_event("bad", f"PIN 碼輸錯 {PIN_OFF_AFTER} 次，已自動關閉")
        return False, "PIN 碼輸錯太多次，已經自動關閉，請改用密碼登入"
    if event:
        log(event)
        COL.add_event("warn", event)
        return False, f"輸錯太多次，請 {PIN_LOCK_MIN} 分鐘後再試，或改用密碼登入"
    if not ok:
        return False, f"PIN 碼不對（再錯 {PIN_LOCK_AFTER - p['streak']} 次會暫停 {PIN_LOCK_MIN} 分鐘）"
    return True, ""


# ───────────────────────── 改名 ─────────────────────────

CONF_LOCK = threading.Lock()


def write_conf(values):
    """把多個設定寫回設定檔（有就取代，沒有就加在最後）"""
    with CONF_LOCK:                               # 兩邊同時改設定檔時，後寫的不會把先寫的蓋掉
        _write_conf(values)


def _write_conf(values):
    try:
        with open(CONF_PATH, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        text = ""
    for k, v in values.items():
        line = f"{k}={v}"
        if re.search(rf"(?m)^{k}=.*$", text):
            text = re.sub(rf"(?m)^{k}=.*$", lambda _: line, text, count=1)
        else:
            text = text.rstrip("\n") + "\n" + line + "\n"
    tmp = CONF_PATH + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)   # 裡面有密碼：一開始就只有 root 讀得到
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(tmp, 0o600)
    os.replace(tmp, CONF_PATH)


def set_traffic(cfg):
    global TRAFFIC_LIMIT_GB, TRAFFIC_RESET_DAY, TRAFFIC_COUNT
    try:
        limit = max(0.0, float(cfg.get("limit_gb") or 0))
        day = int(cfg.get("reset_day") or 1)
        mode = cfg.get("count") or "both"
    except (TypeError, ValueError):
        return False, "數字格式不對"
    if not 1 <= day <= 28:
        return False, "重置日要在 1～28 號之間"
    if mode not in ("both", "out", "in", "max"):
        return False, "計算方式不對"
    if limit > 1e6:
        return False, "上限太大了"
    try:
        write_conf({"TRAFFIC_LIMIT_GB": f"{limit:g}", "TRAFFIC_RESET_DAY": str(day), "TRAFFIC_COUNT": mode})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}"
    TRAFFIC_LIMIT_GB, TRAFFIC_RESET_DAY, TRAFFIC_COUNT = limit, day, mode
    log(f"流量設定：上限 {limit:g} GB、每月 {day} 號重置、計算方式 {mode}")
    return True, "已儲存"


def clean_url(url):
    url = re.sub(r"[\x00-\x20\x7f]", "", str(url or ""))
    if not url:
        return None, "網址不能是空白"
    if not re.match(r"(?i)^https?://", url):
        if re.match(r"(?i)^[a-z][a-z0-9+.-]*:(?!\d)", url):
            return None, "只能填 http:// 或 https:// 開頭的網址"
        url = "https://" + url                     # 沒打 https:// 就自動補上
    if not re.match(r"(?i)^https?://[^/\s]+", url) or len(url) > 300:
        return None, "網址格式不對，例如 https://你的網域:2053/路徑/"
    return url, ""


def set_links(items):
    """儲存常用連結（最多 6 個）；空的清單就是全部拿掉"""
    global LINKS
    if not isinstance(items, list):
        return False, "格式不對"
    out = []
    for x in items[:6]:
        if not isinstance(x, dict):
            continue
        name = re.sub(r"[\x00-\x1f\x7f]", "", str(x.get("name") or "")).strip()[:30]
        if not str(x.get("url") or "").strip():
            continue                               # 網址空白的那一列直接略過
        url, err = clean_url(x.get("url"))
        if err:
            return False, f"「{name or '連結'}」{err}"
        out.append({"name": name or "管理後台", "url": url})
    try:
        write_conf({"LINKS": json.dumps(out, ensure_ascii=False, separators=(",", ":")), "PANEL_URL": ""})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}"
    LINKS = out
    log("常用連結：" + ("、".join(f"{x['name']} {x['url']}" for x in out) or "（全部拿掉）"))
    return True, f"已儲存 {len(out)} 個連結" if out else "已拿掉所有連結"


def set_name(new):
    """把新名稱寫回設定檔，並立刻生效"""
    global NAME
    new = re.sub(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]", "", str(new or "")).strip().strip('"').strip("'")
    if not new:
        return False, "名稱不能是空白"
    if len(new) > 40:
        return False, "名稱太長了（最多 40 個字）"
    try:
        write_conf({"NAME": new})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}"
    log(f"名稱改為：{new}")
    NAME = new
    return True, "已改名"


# ───────────────────────── IP 所在國家 ─────────────────────────

def lookup_geo():
    manual = {"cc": C["COUNTRY"].upper(), "city": C.get("CITY", ""), "org": ""} if C.get("COUNTRY") else None
    for url in ("https://ipinfo.io/json", "https://api.country.is/"):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "vps-sentinel-lite",
                                                       "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=8) as r:
                d = json.loads(r.read())
            cc = (d.get("country") or "").upper()
            if len(cc) == 2:
                g = {"cc": cc, "city": d.get("city", ""), "ip": d.get("ip", ""),
                     "org": re.sub(r"^AS\d+\s+", "", d.get("org", ""))}
                if manual:                             # 設定檔手動指定的國家優先，只借用查到的 IP
                    manual["ip"] = g["ip"]
                    return manual
                return g
        except Exception:  # noqa: BLE001
            pass
    return manual


IF_INET6 = os.environ.get("SENTINEL_IF_INET6", "/proc/net/if_inet6")
V6_TARGETS = [("2606:4700:4700::1111", 443), ("2001:4860:4860::8888", 443)]   # Cloudflare、Google 的 IPv6 位址


def ipv6_addr():
    """這台主機對外的 IPv6 位址（沒有就回傳空字串）"""
    found = []
    try:
        with open(IF_INET6) as f:
            for line in f:
                p = line.split()
                if len(p) < 6 or p[3] != "00" or p[5] == "lo":       # 只要「全球」範圍的位址
                    continue
                a = ipaddress.IPv6Address(int(p[0], 16))
                if a.is_private or a.is_link_local:
                    continue
                found.append((int(p[4], 16) & 0x01, str(a)))           # 臨時位址排後面
    except (OSError, ValueError):
        return ""
    return sorted(found)[0][1] if found else ""


def ipv6_ok():
    """實際試著用 IPv6 連到外面"""
    for host, port in V6_TARGETS:
        try:
            with socket.create_connection((host, port), timeout=5):
                return True
        except OSError:
            continue
    return False


def tcp_conns():
    """目前建立中的 TCP 連線數（IPv4＋IPv6）"""
    n = 0
    for f in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            with open(f) as fh:
                next(fh, None)
                n += sum(1 for line in fh if line.split(None, 4)[3:4] == ["01"])
        except OSError:
            pass
    return n


# ───────────────────────── 系統更新 ─────────────────────────

UPDATE_UNIT = "vps-sentinel-update"
UPDATE_LOG = "/var/log/vps-sentinel-update.log"
UPDATE_SCRIPT = r"""set -u
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 LC_ALL=C.UTF-8
echo "=== 開始更新 $(date '+%F %T') ==="
if apt-get update \
   && apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade \
   && apt-get -y autoremove; then
  echo "__RESULT__ ok $(date +%s)"
else
  echo "__RESULT__ fail $(date +%s)"
fi"""


def update_supported():
    return bool(shutil.which("apt-get") and shutil.which("systemd-run"))


def update_running():
    _, out = run(["systemctl", "is-active", UPDATE_UNIT], 5)
    return out.strip() in ("active", "activating")


def update_last():
    try:
        with open(UPDATE_LOG, encoding="utf-8", errors="replace") as f:
            lines = f.read().splitlines()[-500:]
    except OSError:
        return None
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].startswith("__RESULT__"):
            parts = lines[i].split()
            try:
                res = {"ok": parts[1] == "ok", "time": float(parts[2])}
            except (IndexError, ValueError):
                return None
            n = None                               # 這次實際裝了幾個更新（找「N upgraded」）
            for line in reversed(lines[:i]):
                if line.startswith("=== 開始更新"):
                    break
                m = re.match(r"(\d+) upgraded", line)
                if m:
                    n = max(n or 0, int(m.group(1)))
            res["n"] = n
            return res
    return None


def start_update():
    if not update_supported():
        return False, "這台主機不支援一鍵更新"
    if update_running():
        return False, "已經在更新中了"
    try:                                       # 記錄檔太大就清掉
        if os.path.getsize(UPDATE_LOG) > 2_000_000:
            open(UPDATE_LOG, "w").close()
    except OSError:
        pass
    run(["systemctl", "reset-failed", UPDATE_UNIT], 5)
    # 交給 systemd 在背景跑：就算哨兵本身被更新重啟，更新也不會中斷
    code, _ = run(["systemd-run", f"--unit={UPDATE_UNIT}", "--collect",
                   f"--property=StandardOutput=append:{UPDATE_LOG}",
                   f"--property=StandardError=append:{UPDATE_LOG}",
                   "/bin/bash", "-c", UPDATE_SCRIPT], 15)
    if code != 0:
        return False, "無法開始更新"
    log("已開始系統更新")
    return True, "已開始"


# ───────────────────────── Oracle 免費主機防回收 ─────────────────────────
# Oracle 的「永久免費」主機連續 7 天太閒（處理器第 95 百分位、網路、A1 的記憶體都低於 20%）就可能被收回。
# 只要處理器那一項超過就不算閒置：每天 4 個整點（前後各多 5 分鐘）把整台的處理器用量補到 25%。
# 補的工作用最低優先（SCHED_IDLE），其他程式要用處理器時會立刻讓出來；本來就夠忙時完全不補。

KEEP_ON = C.get("KEEPALIVE", "on").lower() not in ("off", "0", "no")
KEEP_TARGET = 25                                    # 補到整台 25%（Oracle 的門檻是 20%，留一點餘裕）
KEEP_HOURS = sorted({int(h) % 24 for h in re.findall(r"\d+", C.get("KEEPALIVE_HOURS") or "1,7,13,19")})
KEEP_MARGIN = 5                                     # 整點前後各多補幾分鐘（就算 Oracle 用每小時平均來算也穩）
KEEP_FREE = ("VM.Standard.E2.1.Micro", "VM.Standard.A1.Flex")   # 永久免費的機型
KEEP_LOW = 20                                       # 7 天第 95 百分位低於這個就提醒
KEEP = {"oracle": None, "shape": "", "checked": 0, "days": {}, "proc": None, "base": None}   # days 會存檔
KEEP_LK = threading.Lock()

# 補處理器的小程式（另外開一個程序，才不會卡到哨兵自己）：每秒看整台用量，少多少補多少
KEEP_CHILD = r"""
import hashlib, os, sys, threading, time
try:
    os.sched_setscheduler(0, os.SCHED_IDLE, os.sched_param(0))
except (AttributeError, OSError):
    pass
try:
    os.nice(19)
except OSError:
    pass
target, parent, n = float(sys.argv[1]) / 100, os.getppid(), os.cpu_count() or 1
duty, buf = [0.0], os.urandom(1 << 16)
def burn():
    while True:
        t0 = time.monotonic()
        end = t0 + 0.1 * duty[0]
        while time.monotonic() < end:
            hashlib.sha256(buf).digest()            # 大塊資料的雜湊會放開 GIL，多個執行緒才能分到多核心
        time.sleep(max(0.0, 0.1 - (time.monotonic() - t0)))
def stat():
    v = [int(x) for x in open("/proc/stat").readline().split()[1:9]]
    return sum(v), v[3] + v[4]
for _ in range(n):
    threading.Thread(target=burn, daemon=True).start()
last = stat()
while os.getppid() == parent:
    time.sleep(1)
    cur = stat()
    tot, idle = cur[0] - last[0], cur[1] - last[1]
    last = cur
    if tot > 0:
        duty[0] = min(0.95, max(0.0, duty[0] + 0.6 * (target - (1 - idle / tot))))
"""


def keep_detect():
    """是不是 Oracle 的免費主機：先看主機板上的雲端標記，再問 Oracle 的主機資訊服務是哪種機型"""
    fake = C.get("ORACLE_SHAPE")                    # 測試用：SENTINEL_ORACLE_SHAPE=機型（none＝不是 Oracle）
    if fake:
        return (fake.lower() != "none"), ("" if fake.lower() == "none" else fake)
    if read("/sys/class/dmi/id/chassis_asset_tag").strip() != "OracleCloud.com":
        return False, ""
    shape = ""
    try:
        req = urllib.request.Request("http://169.254.169.254/opc/v2/instance/shape", headers={"Authorization": "Bearer Oracle"})
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=3) as r:
            shape = r.read(100).decode("ascii", "replace").strip()
    except (OSError, ValueError):
        pass
    return True, shape


def keep_free():
    """要不要幫忙：Oracle 上的免費機型（問不到機型時也幫，寧可多補一點）"""
    return bool(KEEP["oracle"]) and (not KEEP["shape"] or KEEP["shape"] in KEEP_FREE)


def keep_window(now=None):
    now = now or datetime.now()
    m = now.hour * 60 + now.minute
    for h in KEEP_HOURS:
        d = (m - h * 60) % 1440                     # 從這個整點開始過了幾分鐘（跨午夜也算得對）
        if d < 60 + KEEP_MARGIN or d >= 1440 - KEEP_MARGIN:
            return True
    return False


def keep_ticks():
    """補處理器的程序到現在用了多少處理器時間（跟 /proc/stat 一樣的單位）：(程序編號, 累計)"""
    p = KEEP["proc"]
    if not p or p.poll() is not None:
        return None, 0
    f = read(f"/proc/{p.pid}/stat").rsplit(")", 1)[-1].split()
    try:
        return p.pid, int(f[11]) + int(f[12])
    except (IndexError, ValueError):
        return p.pid, 0


def keep_start():
    with KEEP_LK:
        p = KEEP["proc"]
        if p and p.poll() is None:
            return
        try:
            KEEP["proc"] = subprocess.Popen([sys.executable, "-I", "-c", KEEP_CHILD, str(KEEP_TARGET)],
                                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError as e:
            KEEP["proc"] = None
            log("防回收：無法啟動：", e)


def keep_stop():
    with KEEP_LK:
        p, KEEP["proc"] = KEEP["proc"], None
    if p and p.poll() is None:
        p.terminate()
        try:
            p.wait(5)
        except subprocess.TimeoutExpired:
            p.kill()


def keep_record(pct, day=None):
    """記一分鐘的整台處理器用量（每天一張 0–100% 的次數表，只留 8 天）"""
    day = day or date.today().isoformat()
    with KEEP_LK:
        d = KEEP["days"].setdefault(day, [0] * 101)
        d[min(100, max(0, int(pct)))] += 1
        for k in sorted(KEEP["days"])[:-8]:
            del KEEP["days"][k]


def keep_p95():
    """最近 7 天每分鐘處理器用量的第 95 百分位（Oracle 判斷閒置用的那個數字）、有幾天的資料"""
    since = (date.today() - timedelta(days=6)).isoformat()
    with KEEP_LK:
        rows = [v for k, v in KEEP["days"].items() if k >= since]
    cnt = [sum(r[i] for r in rows) for i in range(101)]
    n = sum(cnt)
    if not n:
        return None, 0
    need, acc = n * 0.95, 0
    for i, c in enumerate(cnt):
        acc += c
        if acc >= need:
            return i, round(n / 1440, 1)
    return 100, round(n / 1440, 1)


def keep_info():
    """給網頁看的狀態；不是 Oracle 免費主機就不顯示"""
    if not keep_free():
        return None
    p95, days = keep_p95()
    p = KEEP["proc"]
    return {"on": KEEP_ON, "shape": KEEP["shape"], "p95": p95, "days": days, "target": KEEP_TARGET,
            "now": bool(p and p.poll() is None), "hours": KEEP_HOURS}


def keep_notice():
    """快要被當成閒置時的提醒（2 天以上的資料才判斷，免得剛裝好就誤報）"""
    if not keep_free():
        return ""
    p95, days = keep_p95()
    if p95 is not None and days >= 2 and p95 < KEEP_LOW:
        return "處理器太閒，Oracle 可能會收回這台"
    return ""


def set_keepalive(on):
    global KEEP_ON
    try:
        write_conf({"KEEPALIVE": "on" if on else "off"})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}"
    KEEP_ON = bool(on)
    if not on:
        keep_stop()
    return True, "已開啟防回收" if on else "已關閉防回收"


def keep_loop():
    """每 10 秒看一次要不要補；每分鐘記一筆整台用量（含補的部分，這才是 Oracle 看到的）"""
    last, t_rec = cpu_times(), time.time()
    while True:
        try:
            now = time.time()
            if now - KEEP["checked"] > 86400:       # 每天確認一次是不是 Oracle 免費主機
                KEEP["oracle"], KEEP["shape"] = keep_detect()
                KEEP["checked"] = now
                if KEEP["oracle"]:
                    log(f"防回收：這台是 Oracle（{KEEP['shape'] or '機型不明'}），{'會' if keep_free() else '不用'}幫忙")
            if now - t_rec >= 60:
                cur = cpu_times()
                if keep_free() and cur[0] > last[0]:
                    keep_record(100 * (1 - (cur[1] - last[1]) / (cur[0] - last[0])))
                last, t_rec = cur, now
            if KEEP_ON and keep_free() and keep_window():
                keep_start()
            elif KEEP["proc"]:
                keep_stop()
        except Exception as e:  # noqa: BLE001
            log("防回收出錯：", repr(e))
        time.sleep(10)


# ───────────────────────── 背景收集 ─────────────────────────

SAVE_LOCK = threading.Lock()


def ev_key(t):
    """同一個問題的代號：拿掉會變動的數字（百分比、天數、個數），名稱裡的數字要留著（容器 app-1 和 app-2 是兩件事）"""
    return re.sub(r"^\d+\s*|\s*[（(]?\d+(\.\d+)?\s*%[）)]?$", "", t)


class Collector:
    def __init__(self):
        self.lock = threading.Lock()
        self.cpu_pct = 0.0
        self.net = {"rx": 0.0, "tx": 0.0}
        self.containers = None
        self.services = []
        self.updates = None
        self.cpu_high_since = None
        self.started = time.time()
        self.geo = None
        self.hist = deque(maxlen=180)          # 最近 30 分鐘，每 10 秒一筆
        self.conn_hist = deque(maxlen=360)     # 最近 1 小時的連線數，用來判斷「跟平常比」
        self.v6 = {"addr": "", "ok": None, "fails": 0, "seen": False}   # IPv6：位址、能不能連出去
        self.events = deque(maxlen=40)         # 事件紀錄
        self.prev_keys = None
        self.upd_running = False
        self.upd_last = update_last()
        self.h24 = deque(maxlen=288)            # 24 小時，每 5 分鐘一筆
        self.h7d = deque(maxlen=336)            # 7 天，每 30 分鐘一筆
        self._b5 = self._b30 = None
        self.traffic = {"since": time.time(), "days": {}, "last": None}
        self.ssh_since = int(time.time() * 1_000_000)   # 從現在開始看 SSH 登入，不補報以前的
        self.saved_boot = None
        self.jobs = {}                          # 背景工作（查更新、IPv6、連結…）
        self.load()
        if self.saved_boot and self.saved_boot != boot_id():
            self.add_event("warn", "主機重新開機了")

    # ── 存檔 ──
    def state_path(self):
        return os.path.join(DATA_DIR, "state.json")

    def load(self):
        try:
            with open(self.state_path(), encoding="utf-8") as f:
                st = json.load(f)
        except (OSError, ValueError):
            return
        now = time.time()
        try:
            self.hist.extend(tuple(x) for x in st.get("hist", []) if now - x[0] < 1800)
            self.h24.extend(tuple(x) for x in st.get("h24", []) if now - x[0] < 86400)
            self.h7d.extend(tuple(x) for x in st.get("h7d", []) if now - x[0] < 7 * 86400)
            self.events.extend(tuple(x) for x in st.get("events", []))
            tr = st.get("traffic") or {}
            if isinstance(tr.get("days"), dict):
                self.traffic = {"since": tr.get("since", now), "days": tr["days"], "last": tr.get("last")}
            names = {p["name"] for p in PEERS}           # 已經從設定拿掉的主機就不留了
            PEER_SEEN.update({k: float(v) for k, v in (st.get("peer_seen") or {}).items() if k in names})
            TG_SENT.update({k: float(v) for k, v in (st.get("tg_sent") or {}).items() if k == "" or k in names})
            TG_MSGS.extend(list(m) for m in (st.get("tg_msgs") or []) if len(m) == 3)
            self.saved_boot = st.get("boot")
            bk = st.get("backup") or {}
            BK.update({k: bk[k] for k in ("last", "ok_t", "day", "key_t", "names", "tg") if k in bk})
            KEEP["days"].update({k: v for k, v in (st.get("keep") or {}).items() if isinstance(v, list) and len(v) == 101})
            if st.get("prev_keys") is not None:
                self.prev_keys = {("b:" if v[0] == "bad" else "w:") + ev_key(v[1]): tuple(v)   # 舊版存的代號格式不同：重新算
                                  for v in st["prev_keys"].values()}
            log(f"已讀取存檔：歷史 {len(self.hist)}/{len(self.h24)}/{len(self.h7d)} 筆、事件 {len(self.events)} 筆、流量 {len(self.traffic['days'])} 天")
        except (TypeError, ValueError, IndexError, AttributeError) as e:
            log("存檔格式有問題，略過：", e)

    def save(self):
        with SAVE_LOCK:                           # 收集、備份、關機可能同時存檔：一次只存一個
            with self.lock:
                st = {"v": 1, "saved": time.time(), "boot": boot_id(), "hist": list(self.hist), "h24": list(self.h24), "h7d": list(self.h7d),
                      "events": list(self.events), "traffic": self.traffic,
                      "prev_keys": self.prev_keys, "peer_seen": dict(PEER_SEEN),
                      "tg_sent": dict(TG_SENT), "tg_msgs": list(TG_MSGS),
                      "backup": {k: BK[k] for k in ("last", "ok_t", "day", "key_t", "names", "tg")}}
                with KEEP_LK:
                    st["keep"] = {k: list(v) for k, v in KEEP["days"].items()}
                st = json.dumps(st, ensure_ascii=False, separators=(",", ":"))   # 鎖著的時候就轉好，別的執行緒改到一半也不會出錯
            try:
                os.makedirs(DATA_DIR, exist_ok=True)
                tmp = self.state_path() + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write(st)
                os.replace(tmp, self.state_path())
            except OSError as e:
                log("存檔失敗：", e)

    # ── 長期歷史：每 5 分鐘、每 30 分鐘各取一次平均 ──
    @staticmethod
    def _avg(t, pts):
        n = len(pts)
        return (int(t), round(sum(p[1] for p in pts) / n, 1), round(sum(p[2] for p in pts) / n, 1),
                round(sum(p[3] for p in pts) / n), round(sum(p[4] for p in pts) / n))

    def roll(self, now):
        b5 = int(now // 300)
        if self._b5 is None:
            self._b5 = b5
        elif b5 != self._b5:
            pts = [h for h in self.hist if self._b5 * 300 <= h[0] < (self._b5 + 1) * 300]
            if pts:
                self.h24.append(self._avg(self._b5 * 300, pts))
            self._b5 = b5
        b30 = int(now // 1800)
        if self._b30 is None:
            self._b30 = b30
        elif b30 != self._b30:
            pts = [h for h in self.h24 if self._b30 * 1800 <= h[0] < (self._b30 + 1) * 1800]
            if pts:
                self.h7d.append(self._avg(self._b30 * 1800, pts))
            self._b30 = b30

    # ── 流量：依網卡計數器的增加量累加到每天 ──
    def count_traffic(self):
        cur, bid, tr = iface_bytes(), boot_id(), self.traffic
        last = tr.get("last")
        drx = dtx = 0
        if last:
            same_boot = last.get("boot") == bid
            prev = last.get("ifs", {})
            for k, (rx, tx) in cur.items():
                if k in prev:
                    prx, ptx = prev[k]
                    drx += rx - prx if (same_boot and rx >= prx) else rx
                    dtx += tx - ptx if (same_boot and tx >= ptx) else tx
                elif not same_boot:               # 重開機後才出現的網卡：開機以來的量都算
                    drx += rx
                    dtx += tx
        if drx or dtx:
            key = date.today().isoformat()
            with self.lock:
                d = tr["days"].setdefault(key, [0, 0])
                d[0] += drx
                d[1] += dtx
                if len(tr["days"]) > 400:          # 只留一年多
                    for k in sorted(tr["days"])[:-400]:
                        del tr["days"][k]
        tr["last"] = {"boot": bid, "ifs": {k: list(v) for k, v in cur.items()}}

    def traffic_info(self):
        start, end = cycle_bounds()
        today = date.today()
        with self.lock:
            days = dict(self.traffic["days"])
            since = self.traffic.get("since", time.time())

        def total(a, b):
            rx = tx = 0
            d = a
            while d < b:
                v = days.get(d.isoformat())
                if v:
                    rx += v[0]
                    tx += v[1]
                d += timedelta(days=1)
            return rx, tx

        def used(rx, tx):
            return {"both": rx + tx, "out": tx, "in": rx, "max": max(rx, tx)}[TRAFFIC_COUNT]

        rx, tx = total(start, end)
        pstart, _ = cycle_bounds(start - timedelta(days=1))
        prx, ptx = total(pstart, start)
        start_ts = datetime.combine(start, datetime.min.time()).timestamp()
        end_ts = datetime.combine(end, datetime.min.time()).timestamp()
        now = time.time()
        counted_from = max(start_ts, since)
        frac = (now - counted_from) / max(1, end_ts - counted_from)
        u = used(rx, tx)
        projected = u / frac if frac > 0.03 else None
        limit = TRAFFIC_LIMIT_GB * 1024 ** 3
        daily = []
        d = start
        while d <= today and d < end:
            v = days.get(d.isoformat(), [0, 0])
            daily.append({"d": f"{d.month}/{d.day}", "rx": v[0], "tx": v[1]})
            d += timedelta(days=1)
        return {
            "rx": rx, "tx": tx, "used": u, "limit": limit, "count": TRAFFIC_COUNT, "reset_day": TRAFFIC_RESET_DAY,
            "pct": round(u / limit * 100, 1) if limit else None,
            "projected": round(projected) if projected else None,
            "start": start.isoformat(), "end": end.isoformat(), "days_left": (end - today).days,
            "cycle_days": (end - start).days, "daily": daily,
            "prev": used(prx, ptx) if (prx or ptx) else None,
            "partial": since > start_ts, "since": since,
        }

    def history(self, rng):
        with self.lock:
            src = list(self.h24 if rng == "24h" else self.h7d if rng == "7d" else self.hist)
        return {"t": [h[0] for h in src], "cpu": [h[1] for h in src], "mem": [h[2] for h in src],
                "rx": [h[3] for h in src], "tx": [h[4] for h in src]}

    def loop(self):
        last_cpu, last_keep = cpu_times(), keep_ticks()
        last_net, last_t = net_bytes(), time.time()
        tick, last_err = 0, None
        while True:
            time.sleep(2)
            try:
                now_cpu, now_net, now_t, now_keep = cpu_times(), net_bytes(), time.time(), keep_ticks()
                dt_total = now_cpu[0] - last_cpu[0]
                dt_idle = now_cpu[1] - last_cpu[1]
                if now_keep[0]:                   # 防回收補的部分不算進畫面上的數字（只是讓 Oracle 看到，不是真的在忙）
                    dt_idle += max(0, now_keep[1] - (last_keep[1] if last_keep[0] == now_keep[0] else 0))
                last_keep = now_keep
                dt = max(now_t - last_t, 0.001)
                with self.lock:
                    if dt_total > 0:
                        self.cpu_pct = round(max(0.0, 100 * (1 - dt_idle / dt_total)), 1)
                    self.net = {"rx": max(0, (now_net[0] - last_net[0]) / dt),
                                "tx": max(0, (now_net[1] - last_net[1]) / dt)}
                    if self.cpu_pct >= ALERT_CPU:
                        self.cpu_high_since = self.cpu_high_since or now_t
                    else:
                        self.cpu_high_since = None
                last_cpu, last_net, last_t = now_cpu, now_net, now_t
                if tick % 5 == 0:                         # 每 10 秒記一筆歷史、算一次流量
                    m = meminfo()
                    with self.lock:
                        self.hist.append((round(now_t), self.cpu_pct, m["pct"],
                                          round(self.net["rx"]), round(self.net["tx"])))
                        self.roll(now_t)
                    c = tcp_conns()
                    with self.lock:
                        self.conn_hist.append(c)
                    try:
                        self.count_traffic()
                    except Exception as e:  # noqa: BLE001
                        log("流量計算失敗：", e)
                if tick % 30 == 0 and tick > 0:           # 每 1 分鐘存檔
                    self.save()

                if tick % 15 == 0:        # 每 30 秒：容器與服務
                    c, s = docker_containers(), service_states()
                    with self.lock:
                        self.containers, self.services = c, s
                recheck = False
                if self.upd_running or tick % 15 == 0:    # 更新中每 2 秒看一次，平常 30 秒
                    was, now = self.upd_running, update_running()
                    if was and not now:                   # 剛更新完
                        last = update_last()
                        with self.lock:
                            self.upd_last = last
                        recheck = True
                        ok = bool(last and last["ok"])
                        log("系統更新完成" if ok else "系統更新失敗")
                        self.add_event("ok" if ok else "bad", "系統更新完成" if ok else "系統更新失敗")
                    self.upd_running = now
                if tick % 15 == 0 and tick > 0:
                    self.track_events()
                    self.track_ssh()
                # 下面這些要連網路或跑別的程式，可能要等好幾秒：放到背景做，處理器、網速的數字才不會停住
                if tick % 900 == 0 or recheck:            # 每 30 分鐘：可更新套件數
                    self.bg("apt", self.check_apt)
                if tick % 150 == 3:                       # 每 5 分鐘：IPv6 還能不能用
                    self.bg("v6", self.check_v6)
                if tick % 5400 == 10:                     # 每 3 小時：GitHub 上有沒有新版的哨兵
                    self.bg("self", self_check)
                    self.bg("cloud", cloud_check)
                if all_links() and tick % 30 == 0:        # 每 1 分鐘：常用連結打不打得開
                    self.bg("links", check_links)
                if tick % 1800 == 120:                    # 每 1 小時：有沒有憑證要幫忙續期
                    self.bg("acme", acme_renew_due)
                if tick % 10800 == 0:                     # 每 6 小時：IP 所在國家
                    self.bg("geo", self.check_geo)
                if tick % 30 == 7 and tick > 300 and BACKUP_ON:  # 每 1 分鐘看一下：今天到了備份時間還沒備份就開始（剛啟動先等 10 分鐘，讓其他台也更新好）
                    now = datetime.now()
                    if now.hour >= BACKUP_HOUR and BK["day"] != now.strftime("%Y-%m-%d"):
                        BK["day"] = now.strftime("%Y-%m-%d")
                        self.bg("backup", backup_run)
            except Exception as e:  # noqa: BLE001
                # 某一項出錯不能讓整個收集停掉（不然畫面上的數字會一直停住）；同樣的錯誤只記一次
                if str(e) != last_err:
                    log("收集資料時出錯：", repr(e))
                    last_err = str(e)
                last_cpu, last_net, last_t = cpu_times(), net_bytes(), time.time()
            tick += 1

    def bg(self, name, fn):
        """在背景做一件事；上一次的還沒做完就先不重複做"""
        t = self.jobs.get(name)
        if t and t.is_alive():
            return

        def job():
            try:
                fn()
            except Exception as e:  # noqa: BLE001
                log(f"背景工作 {name} 出錯：", repr(e))
        self.jobs[name] = t = threading.Thread(target=job, daemon=True)
        t.start()

    def check_apt(self):
        u = apt_updates()
        with self.lock:
            self.updates = u

    def check_v6(self):
        a = ipv6_addr()
        ok = ipv6_ok() if a else None
        with self.lock:
            v = self.v6
            v["fails"] = 0 if ok or not a else v["fails"] + 1
            v.update(addr=a, ok=None if not a else (True if ok else (False if v["fails"] >= 2 else v["ok"])))
            v["seen"] = v["seen"] or bool(a)

    def check_geo(self):
        g = lookup_geo()
        if g:
            with self.lock:
                self.geo = g

    def add_event(self, kind, text):
        with self.lock:
            self.events.append((round(time.time()), kind, text))

    def track_ssh(self):
        """有人從 SSH 登入就記一筆（同一個帳號、同一個地方連續登入只記一筆，免得洗版）"""
        logins = ssh_logins(self.ssh_since)
        if not logins:
            return
        self.ssh_since = max(t for t, *_ in logins)
        groups = {}
        for _, user, ip, way in logins:
            groups.setdefault((user, ip, way), 0)
            groups[(user, ip, way)] += 1
        for (user, ip, way), n in list(groups.items())[:5]:
            more = f"・{n} 次" if n > 1 else ""
            self.add_event("info", f"{user} 從 {ip} 登入了主機（{way or 'SSH'}{more}）")

    def track_events(self):
        """比較這次和上次的問題，記錄「發生」與「恢復」"""
        snap = self.snapshot()
        cur = {}
        for t in snap["problems"]:
            cur["b:" + ev_key(t)] = ("bad", t)
        for t in snap["notices"]:
            cur["w:" + ev_key(t)] = ("warn", t)
        if self.prev_keys is None:
            self.add_event("info", "哨兵開始監看這台主機")
            for k, (kind, t) in cur.items():
                self.add_event(kind, t)
        else:
            for k, (kind, t) in cur.items():
                if k not in self.prev_keys:
                    self.add_event(kind, t)
            for k, (kind, t) in self.prev_keys.items():
                if k not in cur:
                    self.add_event("ok", f"已恢復：{t}")
        self.prev_keys = cur

    def snapshot(self):
        with self.lock:
            cpu, net = self.cpu_pct, dict(self.net)
            containers, services, updates = self.containers, list(self.services), self.updates
            high_since = self.cpu_high_since
            hist = list(self.hist)
            events = [{"t": e[0], "kind": e[1], "text": e[2]} for e in reversed(self.events)][:20]
            geo, upd = self.geo, {"supported": update_supported(),
                                  "running": self.upd_running, "last": self.upd_last}
        mem = meminfo()
        disks = [d for d in (disk(p) for p in DISKS) if d]
        load = os.getloadavg()
        reboot = os.path.exists("/var/run/reboot-required")

        problems = []
        if high_since and time.time() - high_since >= CPU_MINUTES * 60:
            problems.append(f"處理器持續偏高 {cpu:.0f}%")
        if mem["pct"] >= ALERT_MEM:
            problems.append(f"記憶體 {mem['pct']:.0f}%")
        for d in disks:
            if d["pct"] >= ALERT_DISK:
                problems.append(f"磁碟 {d['path']} 剩下不多（{d['pct']:.0f}%）")
        for c in containers or []:
            if c["state"] in ("exited", "dead", "restarting") and "Exited (0)" not in c["status"]:
                problems.append(f"容器 {c['name']} 停止")
            elif "unhealthy" in c["status"]:
                problems.append(f"容器 {c['name']} 不健康")
        for s in services:
            if s["state"] != "active":
                problems.append(f"服務 {s['name']} 沒在執行")
        for x in links_status():
            if x.get("up") is False:
                problems.append(f"「{x['name']}」打不開")
        cert_soon = []
        for x in all_links():
            c = CERT_STATE.get(x["url"]) or {}
            if c.get("expired") or (c.get("exp") and c["exp"] < time.time()):
                problems.append(f"「{x['name']}」的安全憑證過期了")
            elif c.get("exp") and c["exp"] - time.time() < 14 * 86400:
                cert_soon.append(f"「{x['name']}」的安全憑證 {max(1, int((c['exp'] - time.time()) // 86400))} 天後到期")

        traffic = self.traffic_info()
        notices = []
        if traffic["limit"]:
            if traffic["used"] >= traffic["limit"]:
                problems.append("本月流量已經用完")
            elif traffic["pct"] >= 90:
                notices.append(f"本月流量已用 {traffic['pct']:.0f}%")
            elif (traffic["projected"] and traffic["projected"] > traffic["limit"]
                  and traffic["days_left"] < traffic["cycle_days"] - 3):   # 週期剛開始幾天不預估，免得誤報
                notices.append("本月流量預計會超過上限")
        if reboot:
            notices.append("需要重新開機")
        cloud = cloud_info()
        if cloud and cloud.get("pct", 0) >= 90:
            notices.append(f"雲端硬碟快滿了（{cloud['pct']:.0f}%）")
        v6 = dict(self.v6)
        if v6["addr"] and v6["ok"] is False:
            notices.append("IPv6 連不出去")
        elif v6["seen"] and not v6["addr"]:
            notices.append("IPv6 位址不見了")
        if updates and updates["security"]:
            notices.append(f"{updates['security']} 個安全更新")
        if BACKUP_ON and BK["ok_t"] and time.time() - BK["ok_t"] > 50 * 3600:
            notices.append(f"{int((time.time() - BK['ok_t']) // 86400)} 天沒有成功備份")
        notices += cert_soon
        if keep_notice():
            notices.append(keep_notice())

        return {
            "name": NAME, "node": "", "online": True, "version": VERSION, "time": time.time(), "links": links_status(), "build": BUILD, "self_has": bool(SELF["has"] or (CLOUD_URL and CLOUDUP["has"])),
            "os": os_name(), "kernel": os.uname().release,
            "uptime": float(read("/proc/uptime", "0").split()[0] or 0),
            "cores": os.cpu_count() or 1, "cpu": cpu, "load": [round(x, 2) for x in load],
            "ipv6": {"addr": v6["addr"], "ok": v6["ok"]} if v6["addr"] or v6["seen"] else None,
            "cloud": cloud, "keep": keep_info(),
            "conns": tcp_conns(), "conns_avg": round(sum(self.conn_hist) / len(self.conn_hist), 1) if len(self.conn_hist) >= 30 else None, "procs": int((read("/proc/loadavg", "0 0 0 0/0").split()[3:4] or ["0/0"])[0].split("/")[-1] or 0),
            "mem": mem, "disks": disks, "net": net,
            "containers": containers, "services": services,
            "updates": updates, "reboot": reboot, "geo": geo, "update": upd, "events": events, "traffic": traffic, "bk_tz": BACKUP_TZ,
            "hist": {"t": [h[0] for h in hist], "cpu": [h[1] for h in hist], "mem": [h[2] for h in hist],
                     "rx": [h[3] for h in hist], "tx": [h[4] for h in hist]},
            "problems": problems, "notices": notices,
            "level": "bad" if problems else ("warn" if notices else "ok"),
        }


COL = Collector()


# ───────────────────────── 其他 VPS ─────────────────────────

def fetch_peer(p):
    try:
        req = urllib.request.Request(p["url"] + "/api/status", headers={"X-Token": p["token"]})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
        data["node"] = p["name"]                  # 代號：用來把指令轉給這台
        data["name"] = data.get("name") or p["name"]   # 顯示：用那台自己的名稱
        PEER_SEEN[p["name"]] = time.time()
        return data
    except Exception as e:  # noqa: BLE001
        return {"name": p["name"], "node": p["name"], "online": False, "level": "bad",
                "problems": ["連不上"], "error": peer_error(e, p["url"]), "last_seen": PEER_SEEN.get(p["name"]),
                "peer_url": p["url"]}


def peer_error(e, url):
    """把連線錯誤翻成看得懂的中文"""
    text = str(e)
    if isinstance(e, urllib.error.HTTPError):
        if e.code == 401:
            return "連線密碼不對，請重新配對"
        if e.code == 404:
            return f"這個網址不是 VPS 哨兵（{url}），請確認網址和連接埠"
        return f"對方回應錯誤（代碼 {e.code}）"
    if isinstance(e, ValueError):          # 回傳的不是哨兵的資料
        return f"這個網址不是 VPS 哨兵（{url}），請檢查連接埠，例如 https://網域:9443"
    if "timed out" in text or "timeout" in text.lower():
        return "等太久沒有回應：請確認對方開著，防火牆有開放這個連接埠"
    if "refused" in text:
        return "對方拒絕連線：請確認對方有安裝哨兵，或連接埠打錯了"
    if "Name or service not known" in text or "getaddrinfo" in text or "nodename" in text:
        return "找不到這個網域：請確認網址有沒有打錯"
    if "CERTIFICATE" in text.upper() or "SSL" in text.upper():
        return "加密憑證有問題：對方可能還在申請憑證，等幾分鐘再看看"
    if "unreachable" in text.lower() or "No route" in text:
        return "網路不通：請確認對方開著、網址沒打錯"
    return f"連不上（{text[:120]}）"


POOL = ThreadPoolExecutor(max_workers=8)


def all_status():
    peers = list(POOL.map(fetch_peer, PEERS)) if PEERS else []
    return [COL.snapshot()] + peers


# ───────────────────────── 配對暗號（新增主機） ─────────────────────────
# 新主機產生一組「配對暗號」＝ 它的網址 ＋ 一次性的隨機密鑰（128 位元），24 小時內有效、用一次就失效。
# 主要主機貼上暗號後跟新主機「對暗號」：雙方都用 HMAC-SHA256 證明自己知道密鑰，
# 再各自用 HKDF-SHA256（RFC 5869）算出同一把長期連線鑰匙 —— 密鑰和鑰匙都不會在網路上傳。
# 每台配對過來的主機各有一把鑰匙（新主機只存雜湊），可以單獨解除，不影響登入密碼；換登入密碼也不會斷線。
PAIR_FILE = os.path.join(DATA_DIR, "pairing.json")
PAIR_HOURS = 24
PAIR_FAILS = 5                                  # 對錯幾次就作廢這組暗號
PAIR_MAX = 10                                   # 最多幾台主機可以配對過來
PAIR_LOCK = threading.Lock()
PAIR_CACHE = {"mt": None, "d": {}}
PAIR_SEEN = {}                                  # 每把鑰匙最近一次連進來的時間（只記在記憶體）


def hkdf(ikm, salt, info, n=32):
    """HKDF-SHA256（RFC 5869）"""
    prk = hmac.new(salt or b"\0" * 32, ikm, hashlib.sha256).digest()
    out, t, i = b"", b"", 1
    while len(out) < n:
        t = hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest()
        out, i = out + t, i + 1
    return out[:n]


def pair_mac(secret, *parts):
    k = hkdf(secret, b"", b"vps-sentinel pair auth v1")
    return hmac.new(k, b"|".join(p if isinstance(p, bytes) else str(p).encode() for p in parts), hashlib.sha256).digest()


def pair_key(secret, n1, n2):
    return "vsk_" + b64u(hkdf(secret, n1 + n2, b"vps-sentinel peer key v1"))


def pair_load():
    try:
        mt = os.stat(PAIR_FILE).st_mtime_ns
    except OSError:
        mt = 0
    if mt != PAIR_CACHE["mt"]:                  # 安裝畫面另外產生的暗號也要讀得到
        try:
            with open(PAIR_FILE, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            d = {}
        PAIR_CACHE.update(mt=mt, d=d if isinstance(d, dict) else {})
    return PAIR_CACHE["d"]


def pair_save(d):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = PAIR_FILE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(tmp, PAIR_FILE)
    PAIR_CACHE.update(mt=None)


def pair_code(url):
    """產生新的配對暗號（舊的那組立刻失效）"""
    url = re.sub(r"[\s,|]", "", str(url or "")).rstrip("/")
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        return False, "網址格式不對"
    url = f"{u.scheme}://{u.netloc}{u.path.rstrip('/')}"
    secret = secrets.token_bytes(16)
    raw = b"\x01" + secret + url.encode()
    with PAIR_LOCK:
        d = dict(pair_load())
        d["pending"] = {"s": secret.hex(), "url": url, "exp": time.time() + PAIR_HOURS * 3600, "fails": 0}
        pair_save(d)
    return True, "VS-" + b64u(raw + hashlib.sha256(raw).digest()[:3])


def pair_decode(code):
    s = re.sub(r"\s", "", str(code or ""))
    if s[:3].upper() == "VS-":
        s = s[3:]
    try:
        raw = unb64u(s)
    except (ValueError, TypeError):
        raw = b""
    body, chk = raw[:-3], raw[-3:]
    if len(body) < 20 or body[:1] != b"\x01" or not hmac.compare_digest(hashlib.sha256(body).digest()[:3], chk):
        return None
    try:
        url = body[17:].decode()
    except UnicodeDecodeError:
        return None
    return url, body[1:17]


def pair_keys():
    return [k for k in pair_load().get("keys", []) if isinstance(k, dict)]


def pair_key_ok(given):
    """其他主機用配對鑰匙連進來"""
    if not given.startswith("vsk_"):
        return False
    h = hashlib.sha256(given.encode()).hexdigest()
    for k in pair_keys():
        if hmac.compare_digest(h, str(k.get("hash", ""))):
            PAIR_SEEN[k.get("id")] = time.time()
            return True
    return False


def pair_status():
    d = pair_load()
    p = d.get("pending") or {}
    left = max(0, int(p.get("exp", 0) - time.time())) if p else 0
    return {"keys": [{"id": k.get("id"), "name": k.get("name"), "t": k.get("t"), "seen": PAIR_SEEN.get(k.get("id"))}
                     for k in pair_keys()], "pending": left}


def pair_accept(d):
    """新主機這邊：主要主機拿暗號來對"""
    try:
        n1 = unb64u(d.get("n"))
        proof = unb64u(d.get("proof"))
    except (ValueError, TypeError):
        return False, "暗號不對", None
    name = re.sub(r"[\s,=|]+", " ", str(d.get("name") or "")).strip()[:40] or "主要主機"
    with PAIR_LOCK:
        st = dict(pair_load())
        p = st.get("pending")
        if not p or p.get("exp", 0) < time.time():
            return False, "暗號已失效，請在新主機重新產生", None
        secret = bytes.fromhex(p["s"])
        if len(n1) != 16 or not hmac.compare_digest(pair_mac(secret, "req", n1, name), proof):
            p = {**p, "fails": p.get("fails", 0) + 1}
            if p["fails"] >= PAIR_FAILS:
                st.pop("pending", None)
            else:
                st["pending"] = p
            pair_save(st)
            return False, "暗號不對", None
        n2 = secrets.token_bytes(16)
        key = pair_key(secret, n1, n2)
        keys = [k for k in pair_keys() if k.get("name") != name]      # 同一台重新配對：舊鑰匙作廢
        keys.append({"id": secrets.token_hex(4), "name": name, "hash": hashlib.sha256(key.encode()).hexdigest(), "t": int(time.time())})
        st["keys"] = keys[-PAIR_MAX:]
        st.pop("pending", None)
        pair_save(st)
        PAIR_SEEN[keys[-1]["id"]] = time.time()
        WATCH["down"] = False
    global PAGE
    PAGE = None                                   # 被監看就不用完整網頁，放掉記憶體
    log(f"「{name}」開始監看這台主機")
    COL.add_event("info", f"「{name}」開始監看這台主機")
    return True, "", {"n": b64u(n2), "name": NAME, "proof": b64u(pair_mac(secret, "ok", n1, n2, NAME))}


def pair_revoke(kid=None, given=None):
    """解除配對：指定哪一把，或是「連進來的這一把」（主要主機移除這台時）"""
    h = hashlib.sha256(str(given or "").encode()).hexdigest()
    with PAIR_LOCK:
        st = dict(pair_load())
        keys = pair_keys()
        gone = [k for k in keys if (kid and k.get("id") == kid) or (given and hmac.compare_digest(h, str(k.get("hash", ""))))]
        if not gone:
            return False, "找不到這個配對"
        st["keys"] = [k for k in keys if k not in gone]
        if not st["keys"]:
            st.pop("tg", None)                    # 沒有人監看了：主要主機的 Telegram 設定也不用留
        pair_save(st)
    for k in gone:
        log(f"解除了「{k.get('name')}」的配對")
        COL.add_event("info", f"解除了「{k.get('name')}」的配對")
    return True, "已解除配對"


def peer_add(code):
    """主要主機這邊：貼上新主機的暗號，對完暗號就加進主機列表"""
    got = pair_decode(code)
    if not got:
        return False, "暗號不完整，請整串複製貼上"
    url, secret = got
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ("http", "https") or not u.hostname or re.search(r"[\s,|?#]", url):
        return False, "暗號裡的網址不對，請在新主機重新產生"
    own = pair_load().get("pending") or {}
    if hmac.compare_digest(str(own.get("s", "")), secret.hex()):
        return False, "這是這台自己的暗號，請貼到主要主機"
    n1 = secrets.token_bytes(16)
    body = json.dumps({"n": b64u(n1), "name": NAME, "proof": b64u(pair_mac(secret, "req", n1, NAME))}).encode()
    try:
        req = urllib.request.Request(url + "/api/pair", data=body, method="POST", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            d = json.loads(r.read())
        n2 = unb64u(d.get("n"))
        name = re.sub(r"[\s,=|]+", " ", str(d.get("name") or "")).strip()[:40]
        if len(n2) != 16 or not name or not hmac.compare_digest(pair_mac(secret, "ok", n1, n2, str(d.get("name") or "")),
                                                               unb64u(d.get("proof"))):
            return False, "對方的回應對不上，已取消"
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, "那台的哨兵是舊版，請先更新"
        try:
            return False, json.loads(e.read()).get("message") or peer_error(e, url)
        except ValueError:
            return False, peer_error(e, url)
    except (ValueError, TypeError, AttributeError):
        return False, f"這個網址不是 VPS 哨兵（{url}）"
    except Exception as e:  # noqa: BLE001
        return False, peer_error(e, url)
    key = pair_key(secret, n1, n2)
    old = next((p for p in PEERS if p["url"] == url), None)
    if old:                                       # 本來就在列表裡：換成新的配對鑰匙
        old["token"] = key
    else:
        names = {p["name"] for p in PEERS} | {NAME}
        node, i = name, 2
        while node in names:
            node, i = f"{name} {i}", i + 1
        PEERS.append({"name": node, "url": url, "token": key})
    try:
        write_conf({"PEERS": peers_conf()})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}"
    if not old:
        log(f"開始監看「{name}」：{url}")
        COL.add_event("info", f"開始監看「{name}」")
    return True, f"已重新配對「{name}」" if old else f"已新增「{name}」"


def peer_remove(node):
    """主要主機這邊：把一台從列表移除（順便請那台把這邊的鑰匙作廢）"""
    p = next((p for p in PEERS if p["name"] == node), None)
    if not p:
        return False, "找不到這台主機"
    if p["token"].startswith("vsk_"):
        try:
            req = urllib.request.Request(p["url"] + "/api/pair", data=b'{"action":"forget"}', method="POST",
                                         headers={"X-Token": p["token"], "Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=6).close()
        except Exception:  # noqa: BLE001
            pass                                  # 連不上也照樣移除；那邊可以自己在設定裡解除
    PEERS.remove(p)
    try:
        write_conf({"PEERS": peers_conf()})
    except OSError as e:
        PEERS.append(p)
        return False, f"無法寫入設定檔：{e}"
    PEER_SEEN.pop(node, None)
    BEAT_SENT.pop(node, None)
    log(f"不再監看「{node}」")
    COL.add_event("info", f"不再監看「{node}」")
    return True, "已移除"

# ───────────────────────── 被監看模式 ─────────────────────────
# 被其他主機配對、自己又沒有要看別台的主機＝「被監看」：不開完整網頁（只留一頁說明＋取消按鈕），
# 不自己發事件通知（主要主機會轉發），只留主要主機拉資料需要的基本運作。
# 主要主機每 10 分鐘傳一次「心跳」，順便帶上它的 Telegram 設定；主要主機太久沒連進來，這台就用那組設定通知。
WATCH_SILENT = 300                              # 主要主機幾秒沒連進來就算失聯
WATCH = {"down": False, "t0": time.time()}       # t0：哨兵啟動的時間
BEAT_SENT = {}                                  # 主要主機這邊：每台上次送心跳的 [時間, 內容]


def watchers():
    """這台被哪些主機監看"""
    return [] if PEERS else [str(k.get("name") or "主要主機") for k in pair_keys()]


def pair_unwatch():
    """取消被監看：所有配對鑰匙作廢，網頁恢復"""
    with PAIR_LOCK:
        st = dict(pair_load())
        gone = [str(k.get("name") or "") for k in pair_keys()]
        if not gone:
            return False, "這台沒有被監看"
        st["keys"] = []
        st.pop("tg", None)
        pair_save(st)
        WATCH["down"] = False
    who = "、".join(gone)
    log(f"已取消被「{who}」監看")
    COL.add_event("info", f"已取消被「{who}」監看")
    return True, "已取消被監看"


def pair_beat_store(tg):
    """被監看這邊：記住主要主機的 Telegram 設定（失聯時用）"""
    tg = {"bot": str(tg.get("bot") or "")[:100], "chat": str(tg.get("chat") or "")[:40]} if isinstance(tg, dict) else {}
    with PAIR_LOCK:
        st = dict(pair_load())
        if (st.get("tg") or {}) != tg:
            st["tg"] = tg
            pair_save(st)


def peer_beats():
    """主要主機這邊：每 10 分鐘（Telegram 設定有變就馬上）告訴被監看的主機「我還在」"""
    tg = {"bot": TG_BOT, "chat": TG_CHAT} if TG_BOT and TG_CHAT else {}
    body = json.dumps({"action": "beat", "tg": tg}).encode()
    for p in PEERS:
        last = BEAT_SENT.get(p["name"])
        if not p["token"].startswith("vsk_") or (last and last[1] == body and time.time() - last[0] < 600):
            continue
        try:
            req = urllib.request.Request(p["url"] + "/api/pair", data=body, method="POST",
                                         headers={"X-Token": p["token"], "Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=6).close()
            BEAT_SENT[p["name"]] = [time.time(), body]
        except Exception:  # noqa: BLE001
            pass


def watch_check():
    """被監看這邊：主要主機太久沒連進來就通知（用主要主機給的 Telegram 設定）"""
    tg = pair_load().get("tg") or {}
    if not (tg.get("bot") and tg.get("chat")):
        return
    # 最後一次連進來的時間；剛配對好、剛重新啟動也當成連過（主要主機剛好也掛了的話，5 分鐘後一樣會通知）
    seen = max([WATCH["t0"]] + [max(PAIR_SEEN.get(k.get("id"), 0), k.get("t", 0)) for k in pair_keys()])
    gone = time.time() - seen > WATCH_SILENT
    if gone != WATCH["down"]:
        who = html.escape("、".join(watchers()))
        text = (f"🔌 <b>{who}</b>　超過 {WATCH_SILENT // 60} 分鐘沒來看「{html.escape(NAME)}」，可能當機或斷線了" if gone
                else f"✅ <b>{who}</b>　恢復連線了")
        _, err = tg_api(tg["bot"], "sendMessage", {"chat_id": tg["chat"], "text": text, "parse_mode": "HTML"})
        if err:
            log("Telegram 傳送失敗：", err)
            return
    WATCH["down"] = gone


# ───────────────────────── 從網頁重新開機 ─────────────────────────
# 要先拿到傳到 Telegram 的一次性驗證碼（沒設定 Telegram 就改輸入這台的密碼或 PIN 碼），免得被隨手重開

REBOOT_MIN, REBOOT_TRIES = 5, 5                      # 驗證碼幾分鐘內有效、最多輸錯幾次
REBOOT_CMD = os.environ.get("SENTINEL_REBOOT_CMD", "systemctl reboot").split()   # 測試時換成不會真的重開的指令
REBOOT = {"code": "", "t": 0, "tries": 0, "msg": None, "going": False}
REBOOT_LK = threading.Lock()


def reboot_tg():
    """這台能用的 Telegram：自己設定的；被監看的主機用主要主機給的"""
    if TG_BOT and TG_CHAT:
        return TG_BOT, TG_CHAT
    tg = pair_load().get("tg") or {}
    return (tg["bot"], tg["chat"]) if tg.get("bot") and tg.get("chat") else None


def reboot_ask():
    """傳驗證碼到 Telegram。回傳 (成功與否, 結果)"""
    tg = reboot_tg()
    if not tg:
        return True, {"ok": True, "mode": "pw"}
    with REBOOT_LK:
        if REBOOT["going"]:
            return False, {"ok": False, "message": "已經在重新開機了"}
        if REBOOT["code"] and time.time() - REBOOT["t"] < 30:      # 連按不要一直傳
            return True, {"ok": True, "mode": "tg", "message": "驗證碼剛傳過，請看 Telegram"}
        old, code = REBOOT["msg"], f"{secrets.randbelow(10 ** 6):06d}"
        REBOOT.update(code=code, t=time.time(), tries=0, msg=None)
    if old:
        tg_api(old[0], "deleteMessage", {"chat_id": old[1], "message_id": old[2]})
    text = f"🔐 <b>{html.escape(NAME)}</b>　重新開機驗證碼：<code>{code}</code>（{REBOOT_MIN} 分鐘內有效）"
    d, err = tg_api(tg[0], "sendMessage", {"chat_id": tg[1], "text": text, "parse_mode": "HTML"})
    if err:
        with REBOOT_LK:
            REBOOT.update(code="")
        return False, {"ok": False, "message": f"驗證碼傳不出去：{err}"}
    with REBOOT_LK:
        if REBOOT["code"] == code:
            REBOOT["msg"] = (tg[0], tg[1], d["result"]["message_id"])
    log("重新開機驗證碼已傳到 Telegram")
    return True, {"ok": True, "mode": "tg"}


def reboot_check(given):
    """回傳 (通過與否, 訊息)"""
    given = str(given or "").strip()
    if not reboot_tg():                             # 沒有 Telegram：用這台的密碼或 PIN 碼
        if given and hmac.compare_digest(given.encode(), TOKEN.encode()):
            return True, ""
        if re.fullmatch(r"[0-9]{4,8}", given) and pin_load():
            return pin_login(given)
        return False, "密碼不對"
    with REBOOT_LK:
        if not REBOOT["code"] or time.time() - REBOOT["t"] > REBOOT_MIN * 60:
            REBOOT["code"] = ""
            return False, "驗證碼過期了，請重新傳送"
        if re.fullmatch(r"[0-9]{6}", given) and hmac.compare_digest(given, REBOOT["code"]):
            REBOOT["code"] = ""                     # 用一次就失效
            return True, ""
        REBOOT["tries"] += 1
        if REBOOT["tries"] >= REBOOT_TRIES:
            REBOOT["code"] = ""
            return False, f"輸錯 {REBOOT_TRIES} 次，驗證碼已失效，請重新傳送"
        return False, "驗證碼不對"


def reboot_go(given):
    """驗證通過就在幾秒後重新開機（先讓網頁收到回覆）"""
    with REBOOT_LK:
        if REBOOT["going"]:
            return False, "已經在重新開機了"
    ok, msg = reboot_check(given)
    if not ok:
        return False, msg
    with REBOOT_LK:
        REBOOT["going"] = True
        msg_old, REBOOT["msg"] = REBOOT["msg"], None
    log("從網頁重新開機")
    COL.add_event("info", "從網頁重新開機")
    tg = reboot_tg()

    def later():
        if msg_old:                                 # 用過的驗證碼訊息刪掉
            tg_api(msg_old[0], "deleteMessage", {"chat_id": msg_old[1], "message_id": msg_old[2]})
        if tg:                                      # 等不到一般通知流程就重開了：直接傳
            tg_api(tg[0], "sendMessage", {"chat_id": tg[1], "parse_mode": "HTML",
                                          "text": tg_host_msg(NAME, ["🔄 從網頁重新開機"])})
        time.sleep(2)
        COL.save()
        rc, _ = run(REBOOT_CMD, 30)
        if rc != 0:
            with REBOOT_LK:
                REBOOT["going"] = False
            COL.add_event("bad", "重新開機失敗")
    threading.Thread(target=later, daemon=True).start()
    return True, "正在重新開機"


def watch_page(names):
    who = html.escape("、".join(names))
    return f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(NAME)}・VPS 哨兵</title><link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>
:root{{color-scheme:light dark;--bg:#eef1f7;--card:rgba(255,255,255,.7);--text:#101828;--sub:rgba(16,24,40,.6);--line:rgba(16,24,40,.1);--bad:#d92d20}}
@media (prefers-color-scheme:dark){{:root{{--bg:#06080f;--card:rgba(255,255,255,.06);--text:#f1f4fa;--sub:rgba(226,232,245,.58);--line:rgba(255,255,255,.1);--bad:#f97066}}}}
*{{box-sizing:border-box}}
body{{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);
  font:15px/1.6 ui-rounded,-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}}
.c{{width:100%;max-width:360px;padding:30px 24px 22px;border-radius:30px;background:var(--card);text-align:center;
  box-shadow:inset 0 0 0 1px var(--line),0 14px 36px -16px rgba(30,50,110,.3)}}
h1{{margin:12px 0 4px;font-size:27px}}p{{margin:0;color:var(--sub);font-weight:600}}
details{{margin-top:20px}}summary{{cursor:pointer;color:var(--sub);font-size:13.5px;font-weight:700;list-style:none}}
input,button{{width:100%;font:inherit;font-size:16px;border:0;border-radius:14px;padding:12px 14px;margin-top:10px}}
input{{background:var(--line);color:var(--text)}}button{{cursor:pointer;font-weight:800;color:#fff;background:linear-gradient(135deg,#38bdf8,#6366f1)}}
.m{{min-height:20px;margin-top:8px;font-size:13.5px;color:var(--bad)}}
</style></head><body><div class="c"><img src="/icon.svg" width="60" height="60" alt="">
<h1>{html.escape(NAME)}</h1><p>由「{who}」監看中，請到那邊看這台</p>
<details><summary>取消被監看</summary><form><input type="password" placeholder="這台的密碼或 PIN 碼" autocomplete="current-password" required>
<button>取消被監看</button><div class="m"></div></form></details></div>
<script>
document.querySelector("form").addEventListener("submit", async e => {{
  e.preventDefault();
  const b = e.target.querySelector("button"), m = e.target.querySelector(".m");
  b.disabled = true; m.textContent = "";
  try {{
    const r = await fetch("/api/pair", {{method:"POST", headers:{{"Content-Type":"application/json"}},
      body:JSON.stringify({{action:"unwatch", pw:e.target.querySelector("input").value.trim()}})}});
    const d = await r.json().catch(() => ({{}}));
    if (d.ok) return location.reload();
    m.textContent = d.message || "沒有成功，請再試一次";
  }} catch(err) {{ m.textContent = "連線失敗，請稍後再試"; }}
  b.disabled = false;
}});
</script></body></html>"""


# ───────────────────────── Telegram 通知 ─────────────────────────

TG_BASE = os.environ.get("SENTINEL_TG_API", "https://api.telegram.org/bot")   # 測試時可以換成假的伺服器


def tg_api(token, method, params=None):
    """呼叫 Telegram，失敗時回傳看得懂的中文原因"""
    try:
        data = urllib.parse.urlencode(params).encode() if params else None
        with urllib.request.urlopen(TG_BASE + token + "/" + method, data=data, timeout=10) as r:
            return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        try:
            desc = json.loads(e.read()).get("description", "")
        except Exception:  # noqa: BLE001
            desc = ""
        if e.code in (401, 404):
            return None, "機器人密碼不對，請重新複製 @BotFather 給你的那一串"
        if e.code == 409:
            return None, "這個機器人被其他程式（例如 n8n）佔用了，請手動填聊天編號，或另建一個機器人"
        if "chat not found" in desc:
            return None, "找不到這個聊天：請先傳一句話給機器人（群組的話要先把機器人加進去）"
        if "blocked" in desc:
            return None, "你把這個機器人封鎖了，請在 Telegram 解除封鎖後再試"
        if "kicked" in desc or "not a member" in desc:
            return None, "機器人不在這個群組裡，請先把它加進群組"
        return None, f"Telegram 回應錯誤：{desc or e.code}"
    except Exception:  # noqa: BLE001
        return None, "連不上 Telegram，請確認這台主機能連外網"


def norm_chat(v):
    """聊天編號：全形轉半形、拿掉空白和多餘的字（例如貼成「id: -100123」）"""
    v = str(v or "").translate(str.maketrans("０１２３４５６７８９－−—＠", "0123456789---@")).strip()
    v = re.sub(r"\s+", "", v)
    m = re.search(r"-?\d{3,}", v)
    if m and not re.search(r"\d{5,}:", v) and not v.startswith("@"):
        return m.group(0)
    return v


def tg_chat_name(c):
    if c.get("type") == "private":
        n = " ".join(x for x in (c.get("first_name"), c.get("last_name")) if x)
        return f"{n or '我自己'}（私訊）"
    return f"{c.get('title') or '群組'}（{'頻道' if c.get('type') == 'channel' else '群組'}）"


def telegram(cfg):
    """網頁設定 Telegram 通知：status 查狀態、find 自動尋找聊天、test 測試、save 儲存（都留空就是關閉）"""
    global TG_BOT, TG_CHAT, TG_KEEP
    act = cfg.get("action")
    token = str(cfg.get("token") or "").strip() or TG_BOT
    chat = norm_chat(cfg.get("chat"))
    token = token.replace(" ", "")
    if act == "status":
        info = {"ok": True, "on": bool(TG_BOT and TG_CHAT), "chat": TG_CHAT, "has_token": bool(TG_BOT), "keep": TG_KEEP}
        if TG_BOT:
            me, _ = tg_api(TG_BOT, "getMe")
            info["bot"] = "@" + me["result"]["username"] if me else ""
        return True, info
    if act == "save" and not cfg.get("token") and not chat and cfg.get("off"):
        try:
            write_conf({"TG_BOT_TOKEN": "", "TG_CHAT_ID": ""})
        except OSError as e:
            return False, f"無法寫入設定檔：{e}"
        TG_BOT = TG_CHAT = ""
        log("Telegram 通知已關閉")
        return True, "已關閉 Telegram 通知"
    if not re.fullmatch(r"\d{5,}:[\w-]{20,}", token):
        return False, "機器人密碼格式不對，應該長得像 123456789:AAH…"
    me, err = tg_api(token, "getMe")
    if err:
        return False, err
    bot = "@" + me["result"]["username"]
    picked = None
    if act == "find" or not chat:                  # 沒填聊天編號：自動幫忙找
        up, err = tg_api(token, "getUpdates", {"limit": 100})
        if err:
            return False, err
        chats = {}
        for u in up.get("result", []):
            m = u.get("message") or u.get("channel_post") or u.get("my_chat_member") or u.get("edited_message") or {}
            c = m.get("chat")
            if c and "id" in c:
                chats[c["id"]] = {"id": str(c["id"]), "name": tg_chat_name(c)}
        found = list(chats.values())[::-1]
        if not found:
            return False, f"還沒收到訊息：請先在 Telegram 找到 {bot}，傳一句話給它，再按一次「自動尋找」"
        if act == "find":
            return True, {"ok": True, "bot": bot, "chats": found}
        if len(found) > 1:
            return False, "找到不只一個聊天，請先按「自動尋找」，點選要傳去哪裡"
        chat, picked = found[0]["id"], found[0]
    if ":" in chat and re.search(r"\d{5,}:", chat):
        return False, "「要傳到哪裡」貼成機器人密碼了，這格可以留空，按「自動尋找」"
    if not re.fullmatch(r"-?\d{3,}|@\w{4,}", chat):
        return False, "聊天編號是一串數字（群組是 - 開頭）；不確定就留空，按「自動尋找」"
    text = f"✅ 「{NAME}」的通知會傳到這裡" if act == "save" else f"🔔 測試通知（{NAME}）"
    sent, err = tg_api(token, "sendMessage", {"chat_id": chat, "text": text})
    if err:
        return False, err
    if act == "test":
        where = "到「" + picked["name"] + "」" if picked else ""
        return True, {"ok": True, "chat": chat, "message": f"測試通知已送出{where}"}
    try:
        keep = max(0.0, min(47.0, float(cfg.get("keep") or 0)))
        write_conf({"TG_BOT_TOKEN": token, "TG_CHAT_ID": chat, "TG_KEEP_HOURS": f"{keep:g}"})
    except (OSError, ValueError) as e:
        return False, f"無法寫入設定檔：{e}"
    TG_BOT, TG_CHAT, TG_KEEP = token, chat, keep
    if keep:                                       # 這則確認訊息也照保留時間刪掉
        TG_MSGS.append([time.time(), chat, sent["result"]["message_id"]])
    log(f"Telegram 通知已設定：{bot} → {chat}")
    return True, {"ok": True, "chat": chat, "message": f"已開啟，通知會由 {bot} 傳送"}


def tg_send(text):
    if not (TG_BOT and TG_CHAT):
        return
    d, err = tg_api(TG_BOT, "sendMessage", {"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML"})
    if err:
        log("Telegram 傳送失敗：", err)
    elif TG_KEEP:
        TG_MSGS.append([time.time(), TG_CHAT, d["result"]["message_id"]])


def tg_cleanup():
    """把超過保留時間的通知刪掉（Telegram 規定只能刪 48 小時內的，太舊的就放棄）"""
    if not TG_MSGS or not TG_BOT:
        return
    now = time.time()
    for m in list(TG_MSGS):
        if TG_KEEP and now - m[0] < TG_KEEP * 3600:
            continue
        if not TG_KEEP:                            # 改成「不刪除」：之前排隊要刪的也不刪了
            TG_MSGS.remove(m)
            continue
        if now - m[0] < 48 * 3600:
            tg_api(TG_BOT, "deleteMessage", {"chat_id": m[1], "message_id": m[2]})
        TG_MSGS.remove(m)


def ev_line(e):
    """事件 → 一句通順的通知；不需要通知的回傳空字串"""
    k, t = e.get("kind"), str(e.get("text") or "")
    if t in ("哨兵開始監看這台主機", "開始系統更新"):     # 自己按的更新不用再通知「開始」，等結果就好
        return ""
    if t == "系統更新完成":
        return "✅ 系統更新完成"
    if t == "系統更新失敗":
        return "❌ 系統更新失敗"
    if t.startswith("已恢復："):
        return f"✅ 已解決：{t[4:]}"
    if "自動續期" in t:
        return ("✅ " if k == "ok" else "❌ ") + t
    if t == "主機重新開機了":
        return "🔄 主機重新開機了"
    if t == "從網頁重新開機":                       # 重開前已經直接傳了，不用再傳一次
        return ""
    if t == "重新開機失敗":
        return "❌ 重新開機失敗"
    if k == "info" and "登入了主機" in t:
        return "🔑 " + t
    if k == "info" and ("配對" in t or "監看" in t):
        return "🔗 " + t                               # 主機之間的連線有變動
    if k == "info" and ("密碼" in t or "手機金鑰" in t or "PIN" in t):
        return "🔐 " + t                               # 登入方式有變動：換密碼、手機金鑰、PIN 碼
    return {"bad": "🔴 ", "warn": "🟠 ", "ok": "✅ "}.get(k, "ℹ️ ") + t


def tg_host_msg(name, lines):
    """同一台主機的通知合成一則：只有一件事就一行，多件事就主機名稱當標題"""
    name = html.escape(name)
    lines = [html.escape(x) for x in dict.fromkeys(lines)]          # 同樣的內容只留一次
    if len(lines) == 1:
        icon, _, rest = lines[0].partition(" ")
        return f"{icon} <b>{name}</b>　{rest}"
    return f"<b>{name}</b>\n" + "\n".join(lines)


def alert_loop():
    """每 30 秒看一次所有主機的「事件紀錄」，有新事件就傳到 Telegram（跟網頁上的事件紀錄一致）"""
    time.sleep(20)                     # 等第一輪資料收集完
    offline_count, down, seen_ev = {}, set(), {}
    while True:
        try:
            if watchers():                     # 被監看：事件由主要主機轉發，這邊只注意主要主機有沒有失聯
                watch_check()
                TG_SENT.clear()                         # 取消被監看後從那一刻開始通知，不補發被監看期間的事件
            elif TG_BOT and TG_CHAT:
                for s in all_status():
                    key, name = s.get("node") or "", s.get("name") or "主機"
                    if not s.get("online"):
                        offline_count[key] = offline_count.get(key, 0) + 1
                        if offline_count[key] == 6 and key not in down:     # 連續約 3 分鐘連不上才通知
                            down.add(key)
                            tg_send(f"🔌 <b>{html.escape(name)}</b>　連不上了\n{html.escape(s.get('error') or '')}".strip())
                        continue
                    offline_count[key] = 0
                    if key in down:
                        down.discard(key)
                        tg_send(f"✅ <b>{html.escape(name)}</b>　恢復連線了")
                    evs = sorted((e for e in s.get("events") or [] if isinstance(e, dict) and isinstance(e.get("t"), (int, float))),
                                 key=lambda e: e["t"])          # 格式不對的事件跳過，不要害全部通知停擺
                    if not evs:
                        continue
                    last = TG_SENT.get(key)
                    if last is None:                   # 第一次看到這台：從現在開始通知，不補發以前的
                        TG_SENT[key] = evs[-1]["t"]
                        seen_ev[key] = {(e["t"], e.get("text")) for e in evs}
                        continue
                    done = seen_ev.get(key)
                    if done is None:                   # 剛重新啟動：已經通知過的（時間不晚於上次那筆）不要再發
                        done = seen_ev[key] = {(e["t"], e.get("text")) for e in evs if e["t"] <= last}
                    new = [e for e in evs if e["t"] >= last and (e["t"], e.get("text")) not in done]
                    lines = [x for x in (ev_line(e) for e in new) if x]
                    if lines:
                        tg_send(tg_host_msg(name, lines[-10:]))
                    done.update((e["t"], e.get("text")) for e in new)
                    if len(done) > 200:
                        seen_ev[key] = {(e["t"], e.get("text")) for e in evs}
                    TG_SENT[key] = evs[-1]["t"]
            else:
                TG_SENT.clear()                         # 關閉期間不累積，重新開啟時從那一刻開始通知
            if PEERS:
                peer_beats()
            tg_cleanup()
        except Exception as e:  # noqa: BLE001
            log("通知檢查失敗：", e)
        time.sleep(30)


# ───────────────────────── 每日備份 ─────────────────────────
# 每天清晨把這台主機上重要的設定打包（3x-ui、n8n、哨兵自己、Caddy／nginx、憑證…），加密成哨兵備份檔（.vsbk）。
# 每台主機的雲端硬碟「哨兵備份」資料夾裡，都放著「每一台」的備份（一台一個資料夾）；Telegram 上也有一份。
# 主要那台（有設定其他主機的）負責：把解開密碼同步給其他台、把自己的備份送過去、把其他台的拿回來。
# 所有主機共用同一組解開密碼。


def bk_safe(s):
    """主機名稱 → 可以當檔名、資料夾名稱的字（只換掉檔名不能用的符號，空白和中文照留）"""
    return re.sub(r'[\\/:*?"<>|\x00-\x1f\x7f]+', "_", str(s or "")).strip(" ._")[:40] or "host"


def _bk_safe_v130(s):
    """1.30～1.31 版的資料夾名稱（空白也換成底線），搬到新名稱用"""
    return re.sub(r'[\\/:*?"<>|\s]+', "_", str(s or "")).strip("._")[:40] or "host"


def bk_time(t):
    """備份檔名上的時間：所有主機都用同一個時區（使用者瀏覽器的），才不會一台差一小時"""
    if BACKUP_TZ is None:
        return datetime.fromtimestamp(t)
    return datetime.fromtimestamp(t, timezone(timedelta(minutes=BACKUP_TZ)))


def bk_fname(name, t, folder):
    """「主機名稱 2026-10-13 04.00.vsbk」；同一分鐘做了兩份就加 (2)"""
    base = f"{bk_safe(name)} {bk_time(t):%Y-%m-%d %H.%M}"
    f, i = base + ".vsbk", 2
    while os.path.exists(os.path.join(folder, f)):
        f, i = f"{base} ({i}).vsbk", i + 1
    return f


def bk_set_tz(tz):
    global BACKUP_TZ
    try:
        tz = int(tz)
    except (TypeError, ValueError):
        return False
    if not -14 * 60 <= tz <= 14 * 60:
        return False
    if tz != BACKUP_TZ:
        try:
            write_conf({"BACKUP_TZ": str(tz)})
        except OSError:
            return False
        BACKUP_TZ = tz
    return True


def bk_key():
    global BACKUP_KEY
    if not BACKUP_KEY:
        abc = "abcdefghjkmnpqrstuvwxyz23456789"   # 去掉容易看錯的 i、l、o、0、1
        key = "-".join("".join(secrets.choice(abc) for _ in range(5)) for _ in range(4))
        write_conf({"BACKUP_KEY": key})
        BACKUP_KEY = key
    return BACKUP_KEY


def bk_key_ok(key):
    return (isinstance(key, str) and 8 <= len(key) <= 128 and key == key.strip() and not re.search(r"[\r\n]", key)
            and key[0] not in "'\"" and key[-1] not in "'\"")


def bk_set_key(key, sync=False):
    """換解開密碼；sync＝順便告訴其他主機（之後的備份都用新密碼，以前的備份還是要用舊密碼開）"""
    global BACKUP_KEY
    if not bk_key_ok(key):
        return False, "密碼要 8 到 128 個字，前後不能有空白或引號"
    if key != BACKUP_KEY:
        try:
            write_conf({"BACKUP_KEY": key})
        except OSError as e:
            return False, f"無法寫入設定檔：{e}"
        BACKUP_KEY = key
        with COL.lock:
            BK["key_t"] = time.time()             # 之前打包好的（舊密碼）不再拿來用
    if not sync:
        return True, "已換成新的解開密碼"
    bad = [f"「{bk_peer_name(p)}」{msg}" for p in PEERS for ok, msg in [bk_send_key(p)] if not ok]
    return True, "已換成新的解開密碼" + (f"（{'、'.join(bad)}，下次備份時會再同步）" if bad else "，所有主機都改好了" if PEERS else "")


def bk_peer_name(peer):
    """其他主機在網頁上顯示的名稱（那台自己的名稱）；還不知道的話先用代號"""
    return BK["names"].get(peer["name"]) or peer["name"]


def bk_learn_name(key, name):
    """記下主機現在的名稱；回傳它以前用過的名稱（改名時要把舊資料夾搬過來）"""
    old = BK["names"].get(key)
    if name and name != old:
        with COL.lock:
            BK["names"][key] = name
    return tuple(x for x in (old,) if x and x != name)


def bk_send_key(peer):
    """讓那台用同一組解開密碼、同一個時區；順便問它現在叫什麼名字"""
    try:
        body = {"action": "key", "key": bk_key(), **({"tz": BACKUP_TZ} if BACKUP_TZ is not None else {})}
        req = urllib.request.Request(peer["url"] + "/api/backup", method="POST", data=json.dumps(body).encode(),
                                     headers={"X-Token": peer["token"], "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
        if d.get("name"):
            bk_learn_name(peer["name"], str(d["name"])[:40])
        return bool(d.get("ok")), d.get("message") or ""
    except urllib.error.HTTPError as e:
        return False, "還沒更新到新版" if e.code in (400, 404) else f"錯誤 {e.code}"
    except Exception as e:  # noqa: BLE001
        return False, peer_error(e, peer["url"])


def bk_cloud():
    return os.path.ismount(CLOUD_DIR)


def bk_root():
    """所有主機的備份都放這裡，一台一個資料夾；有雲端硬碟就放雲端硬碟，打開雲端硬碟就看得到"""
    return os.path.join(CLOUD_DIR, BK_CLOUD_SUB) if bk_cloud() else BK_LOCAL_DIR


def bk_where():
    return "雲端硬碟" if bk_cloud() else "主機上"


def bk_dir(name, aliases=()):
    """這台主機的備份資料夾（用主機自己的名稱）；aliases＝它以前可能用過的資料夾名稱，裡面的備份會搬過來並改成新的檔名"""
    d = os.path.join(bk_root(), bk_safe(name))
    cloud = bk_cloud()
    for p in (bk_root(), d):                       # 雲端硬碟裡的東西別人改得到：資料夾被換成捷徑（例如指到 /etc）就拿掉重建
        if os.path.islink(p):
            os.remove(p)
    os.makedirs(d, mode=0o755 if cloud else 0o700, exist_ok=True)
    if cloud:                                      # 雲端硬碟程式用編號 1000 的使用者在跑：要改成它的，才刪得掉
        for p in (bk_root(), d):
            try:
                os.lchown(p, 1000, 1000)
            except OSError:
                pass
    olds = {os.path.join(bk_root(), x) for a in (name, *aliases) for x in (bk_safe(a), _bk_safe_v130(a))} - {d}
    for od in olds:
        if not os.path.isdir(od) or os.path.islink(od):
            continue
        for f in bk_list(od):
            try:
                t = os.path.getmtime(f)
                nf = os.path.join(d, bk_fname(name, t, d))
                os.replace(f, nf)
                os.utime(nf, (t, t))
            except OSError:
                pass
        try:
            os.rmdir(od)
        except OSError:
            pass
    for f in bk_list(d):                           # 1.31 版的檔名（主機名稱-20261013-162242）也改成新的
        b = os.path.basename(f)
        if re.fullmatch(r".+-\d{8}-\d{6}\.vsbk", b):
            try:
                t = os.path.getmtime(f)
                nf = os.path.join(d, bk_fname(name, t, d))
                os.replace(f, nf)
                os.utime(nf, (t, t))
            except OSError:
                pass
    bk_prune(d)
    return d


def bk_own(path):
    if bk_cloud():
        try:
            os.lchown(path, 1000, 1000)
        except OSError:
            pass
    else:
        os.chmod(path, 0o600)


def bk_list(folder):
    try:
        fs = [os.path.join(folder, f) for f in os.listdir(folder) if f.endswith(".vsbk")]
    except OSError:
        return []

    def mt(f):
        try:
            return os.lstat(f).st_mtime
        except OSError:                            # 剛好被刪掉
            return 0
    return sorted((f for f in fs if not os.path.islink(f)), key=mt)


def bk_prune(folder):
    for f in bk_list(folder)[:-BACKUP_KEEP]:
        try:
            os.remove(f)
        except OSError:
            pass


def bk_cleanup_legacy():
    """1.30 版的備份沒有加密（只有 Telegram 上那份有），換成新格式後把它們刪掉"""
    pats = [os.path.join(BK_LOCAL_DIR, "*.tar.gz"), os.path.join(DATA_DIR, "peer-backups", "*", "*.tar.gz"),
            os.path.join(CLOUD_DIR, BK_CLOUD_SUB, "*", "*.tar.gz")]
    for f in (f for p in pats for f in glob.glob(p)):
        try:
            os.remove(f)
        except OSError:
            pass
    for d in glob.glob(os.path.join(DATA_DIR, "peer-backups", "*")) + [os.path.join(DATA_DIR, "peer-backups")]:
        try:
            os.rmdir(d)
        except OSError:
            pass


def n8n_containers():
    """n8n 容器的設定（還原時照這個把容器建回來）：[{name, image, env, ports, mounts, restart, network, compose}]"""
    out = []
    for c in docker_containers() or []:
        if "n8n" not in (c["image"] + " " + c["name"]).lower():
            continue
        info = (docker_json("inspect", c["name"]) or [{}])[0]
        cfg, host = info.get("Config") or {}, info.get("HostConfig") or {}
        img_env = set((((docker_json("image", "inspect", cfg.get("Image") or "") or [{}])[0].get("Config") or {}).get("Env") or []))
        ports = []
        for cp, binds in (host.get("PortBindings") or {}).items():
            for b in binds or []:
                ports.append(":".join(x for x in (b.get("HostIp") or "", b.get("HostPort") or "", cp) if x))
        out.append({"name": c["name"], "image": cfg.get("Image") or c["image"],
                    "env": [e for e in cfg.get("Env") or [] if e not in img_env],     # 映像檔本來就有的不用記
                    "ports": ports, "restart": (host.get("RestartPolicy") or {}).get("Name") or "",
                    "network": host.get("NetworkMode") or "",
                    "mounts": [{"type": m.get("Type"), "name": m.get("Name") or "", "source": m.get("Source") or "",
                                "dest": m.get("Destination") or ""} for m in info.get("Mounts") or []],
                    "compose": (cfg.get("Labels") or {}).get("com.docker.compose.project.working_dir") or ""})
    return out


def n8n_dirs(cs):
    """n8n 的資料（docker 的資料卷或掛進去的資料夾）和 docker compose 的設定資料夾"""
    return [m["source"] for c in cs for m in c["mounts"] if m["source"]] + [c["compose"] for c in cs if c["compose"]]


def xui_cert_paths(db="/etc/x-ui/x-ui.db"):
    """3x-ui 設定裡用到的憑證和私鑰（後台的、訂閱的、各個連線的）；放在別的資料夾也要一起備份，不然還原後 3x-ui 開不起來"""
    out = []
    if not os.path.isfile(db):
        return out
    try:
        con = sqlite3.connect(f"file:{urllib.parse.quote(db)}?mode=ro", uri=True, timeout=10)
        try:
            out += [v for (v,) in con.execute("SELECT value FROM settings WHERE key IN "
                                              "('webCertFile','webKeyFile','subCertFile','subKeyFile')")]
            for (ss,) in con.execute("SELECT stream_settings FROM inbounds"):
                try:
                    tls = (json.loads(ss or "{}") or {}).get("tlsSettings") or {}
                except ValueError:
                    continue
                for c in tls.get("certificates") or []:
                    out += [c.get("certificateFile"), c.get("keyFile")]
        finally:
            con.close()
    except sqlite3.Error:
        return []
    out = [p for p in out if isinstance(p, str) and p.startswith("/")]
    return out + [os.path.realpath(p) for p in out if os.path.islink(p)]   # 捷徑（例如 letsencrypt 的 live）連真正的檔案一起


def backup_sources(cs=None):
    """[(說明, [路徑…])]；只列出這台主機上真的有的（cs＝n8n 容器的設定）"""
    items = [("哨兵設定", [CONF_PATH, DATA_DIR]),
             ("3x-ui", ["/etc/x-ui", "/etc/systemd/system/x-ui.service"]),
             ("n8n", n8n_dirs(n8n_containers() if cs is None else cs)),
             ("Caddy", ["/etc/caddy"]),
             ("nginx", ["/etc/nginx"]),
             ("安全憑證", ["/root/.acme.sh", "/root/cert"] + xui_cert_paths()),
             ("排程", ["/var/spool/cron/crontabs/root"]),
             ("雲端硬碟設定", ["/opt/vps-cloud/data"]),
             ("其他", [p.strip() for p in C.get("BACKUP_PATHS", "").split(",") if p.strip()])]
    out = []
    for label, paths in items:
        paths = list(dict.fromkeys(p for p in paths if os.path.lexists(p)))
        if paths:
            out.append((label, paths))
    return out


def _bk_walk(top, skip):
    if not os.path.isdir(top) or os.path.islink(top):
        yield top
        return
    for root, dirs, files in os.walk(top):
        keep = []
        for d in dirs:
            p = os.path.join(root, d)
            if os.path.islink(p):
                yield p                            # 捷徑本身要留（例如 nginx 的 sites-enabled），不跟進去
            elif d.lower() not in BK_SKIP_DIRS and os.path.realpath(p) not in skip:
                keep.append(d)
        dirs[:] = keep
        for f in files:
            yield os.path.join(root, f)


def _is_sqlite(p):
    try:
        with open(p, "rb") as f:
            return f.read(16) == b"SQLite format 3\x00"
    except OSError:
        return False


def _sqlite_copy(src, dst):
    """資料庫正在使用中也能拿到完整的一份（直接複製可能剛好複製到寫一半的內容）"""
    s = sqlite3.connect(f"file:{urllib.parse.quote(src)}?mode=ro", uri=True, timeout=20)
    try:
        d = sqlite3.connect(dst)
        try:
            s.backup(d)
        finally:
            d.close()
    finally:
        s.close()


BK_README = """VPS 哨兵的備份：{name}（{when}）

內容：{items}

還原方法（會自動放回檔案、把服務重新啟動）：
  sudo python3 ~/vps-sentinel/sentinel.py --restore 備份檔.vsbk
詳細說明在哨兵網頁的「設定 → 備份 → 還原」。
"""


def xui_version():
    code, out = run(["/usr/local/x-ui/x-ui", "-v"], 10) if os.path.exists("/usr/local/x-ui/x-ui") else (1, "")
    m = re.search(r"v?(\d+\.\d+\.\d+)", out) if code == 0 else None
    return "v" + m.group(1) if m else ""


def _bk_tar(dst, td):
    """把要備份的東西打包成 dst（.tar.gz）；回傳 (包含哪些東西, 跳過的大檔)"""
    skip = {os.path.realpath(p) for p in (BK_LOCAL_DIR, os.path.join(DATA_DIR, "peer-backups"), CLOUD_DIR)}
    labels, big, seen, n = [], [], set(), 0
    cs = n8n_containers()
    with tarfile.open(dst, "w:gz", compresslevel=6) as tar:
        for label, paths in backup_sources(cs):
            got = 0
            for top in paths:
                for p in _bk_walk(top, skip):
                    rp = os.path.abspath(p)
                    if rp in seen or os.path.realpath(p) in skip:
                        continue
                    seen.add(rp)
                    arc = rp.lstrip("/")
                    try:
                        st = os.lstat(p)
                        if os.path.islink(p):
                            tar.add(p, arc, recursive=False)
                        elif not stat.S_ISREG(st.st_mode):
                            continue
                        elif st.st_size > BK_FILE_MAX:
                            big.append(rp)
                            continue
                        elif re.search(r"-(wal|shm|journal)$", p) and os.path.exists(re.sub(r"-(wal|shm|journal)$", "", p)):
                            continue                      # 資料庫的暫存檔：下面複製資料庫時已經包含進去了
                        elif _is_sqlite(p):
                            n += 1
                            cp = os.path.join(td, f"db{n}")
                            try:
                                _sqlite_copy(p, cp)
                                info = tar.gettarinfo(p, arc)
                                info.size = os.path.getsize(cp)
                                with open(cp, "rb") as f:
                                    tar.addfile(info, f)
                                os.remove(cp)
                            except sqlite3.Error:
                                tar.add(p, arc, recursive=False)
                        else:
                            tar.add(p, arc, recursive=False)
                        got += 1
                    except OSError:
                        continue                          # 檔案剛好被刪掉或讀不到：跳過
            if got:
                labels.append(label)
        text = BK_README.format(name=NAME, when=f"{bk_time(time.time()):%Y-%m-%d %H:%M}",
                                items="、".join(labels) or "（沒有找到要備份的東西）").encode()
        info = tarfile.TarInfo(f"還原說明-{bk_safe(NAME)}.txt")
        info.size, info.mtime, info.mode = len(text), int(time.time()), 0o644
        tar.addfile(info, io.BytesIO(text))
        man = json.dumps({"name": NAME, "when": f"{bk_time(time.time()):%Y-%m-%d %H:%M}", "items": labels, "version": VERSION,
                          "conf": CONF_PATH, "xui_version": xui_version(),
                          "containers": cs if "n8n" in labels else []}, ensure_ascii=False, indent=1).encode()
        info = tarfile.TarInfo(RS_MANIFEST)                # 還原時用的資料：n8n 容器怎麼建、3x-ui 是哪一版…
        info.size, info.mtime, info.mode = len(man), int(time.time()), 0o600
        tar.addfile(info, io.BytesIO(man))
    return labels, big


def make_backup():
    """打包並加密一份這台的備份，回傳 (檔案路徑, 包含哪些東西, 跳過的大檔)"""
    folder = bk_dir(NAME, bk_learn_name("", NAME))
    path = os.path.join(folder, bk_fname(NAME, time.time(), folder))
    tmp = os.path.join(folder, f".{secrets.token_hex(6)}.part")   # 猜不到的名字：雲端硬碟裡沒辦法先放好捷徑等著被寫
    try:
        with tempfile.TemporaryDirectory() as td:
            os.chmod(td, 0o700)
            tgz = os.path.join(td, "backup.tar.gz")
            labels, big = _bk_tar(tgz, td)
            vsbk_encrypt(tgz, tmp, bk_key())
        bk_own(tmp)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    bk_prune(folder)
    return path, labels, big


def bk_latest(max_age):
    """這台最近一份備份；太舊、還沒有、或是換密碼之前做的，就馬上打包一份新的"""
    with BK_MAKE:
        since = max(time.time() - max_age, BK.get("key_t") or 0)
        fs = [f for f in bk_list(bk_dir(NAME, bk_learn_name("", NAME))) if os.path.getmtime(f) > since]
        if fs:
            return fs[-1], None
        path, labels, big = make_backup()
        return path, (labels, big)


def fmt_size(n):
    n = float(n or 0)
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return f"{n:.0f} {u}" if u in ("B", "KB") else f"{n:.1f} {u}"
        n /= 1024


def tg_send_file(path, filename, caption):
    """把檔案傳到 Telegram（最多 50 MB）；回傳 (失敗原因或空字串, 訊息編號)"""
    if os.path.getsize(path) > TG_FILE_MAX:
        return f"檔案太大（{fmt_size(os.path.getsize(path))}），Telegram 只收 50 MB 以下的檔案", None
    b = "----vs" + secrets.token_hex(12)
    fields = {"chat_id": TG_CHAT, "caption": caption, "parse_mode": "HTML", "disable_notification": "true"}
    head = "".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in fields.items())
    filename = re.sub(r'[\x00-\x1f"\\]', "_", filename)          # 檔名不能有換行、引號，不然會混進別的欄位
    head += (f'--{b}\r\nContent-Disposition: form-data; name="document"; filename="{filename}"\r\n'
             "Content-Type: application/octet-stream\r\n\r\n")
    with open(path, "rb") as f:
        data = head.encode() + f.read() + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(TG_BASE + TG_BOT + "/sendDocument", data=data,
                                 headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            d = json.loads(r.read())
        return "", (d.get("result") or {}).get("message_id")
    except urllib.error.HTTPError as e:
        try:
            desc = json.loads(e.read()).get("description", "")
        except Exception:  # noqa: BLE001
            desc = ""
        if e.code == 413 or "too big" in desc:
            return "檔案太大，Telegram 不收", None
        return f"Telegram 回應錯誤：{desc or e.code}", None
    except Exception:  # noqa: BLE001
        return "連不上 Telegram", None


def tg_private():
    """通知是傳到私人對話（不是群組或頻道）：私人對話的編號是正的數字"""
    return TG_CHAT.isdigit()


def bk_to_tg(path, owner=None):
    """把備份檔（已經加密）傳到 Telegram；owner 是幫別台傳的時候那台的名稱。
    私人對話會附上打碼的「這份自己的」解開密碼；傳成功後把同一台前一份備份的訊息刪掉，Telegram 裡每台只留最新一份"""
    owner = owner or NAME
    cap = f"🗄 <b>{html.escape(owner)}</b>　每日備份（{fmt_size(os.path.getsize(path))}）\n"
    pw = vsbk_pass_of(path, bk_key()) if tg_private() else ""
    if pw and owner != NAME:                       # 別台做的：確定這組真的打得開才附（那台的總密碼可能還沒同步）
        try:
            vsbk_decrypt(path, None, pw)
        except (ValueError, OSError):
            pw = ""
    if pw:
        cap += f"解開密碼：<tg-spoiler>{html.escape(pw)}</tg-spoiler>"   # 這份自己的密碼，只打得開這一份
    else:
        cap += "解開密碼在網頁的「設定 → 備份」"
    err, mid = tg_send_file(path, os.path.basename(path), cap)
    if not err and mid:
        old = BK["tg"].get(owner)
        BK["tg"][owner] = [TG_CHAT, mid]
        if old:
            tg_api(TG_BOT, "deleteMessage", {"chat_id": old[0], "message_id": old[1]})   # 超過 48 小時的 Telegram 不讓刪，就留著
    return err


def bk_store(src, fname, stream, length, aliases=()):
    """把其他主機傳來的備份存在這台（src＝那台自己的名稱）；回傳 (成功, 說明, 存放位置)"""
    if not re.fullmatch(r'[^/\\\x00-\x1f"]{1,120}\.vsbk', fname or "") or fname.startswith("."):
        return False, "檔名不對", None
    if bk_safe(src) == bk_safe(NAME):              # 那台跟這台同名：分開放，不然會跟這台自己的備份混在一起、被當成這台的刪掉
        src = f"{src} 2"
    aliases = tuple(a for a in aliases if bk_safe(a) != bk_safe(NAME))
    if not 0 < length <= BK_UPLOAD_MAX:
        return False, "檔案大小不對", None
    folder = bk_dir(src, aliases)
    where = bk_where()
    if shutil.disk_usage(folder).free < length + 50 * 1024 * 1024:
        return False, f"{where}的空間不夠", None
    dest = os.path.join(folder, fname if not os.path.exists(os.path.join(folder, fname)) else bk_fname(src, time.time(), folder))
    tmp = os.path.join(folder, f".{secrets.token_hex(6)}.part")
    try:
        left = length
        with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as f:
            while left > 0:
                chunk = stream.read(min(left, 1 << 20))
                if not chunk:
                    raise OSError("傳到一半斷掉了")
                f.write(chunk)
                left -= len(chunk)
        bk_own(tmp)
        os.replace(tmp, dest)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False, f"存檔失敗：{e}", None
    bk_prune(folder)
    return True, where, dest


def bk_push(peer, path):
    """把這台的備份傳給另一台存起來"""
    was = BK["names"].get("~" + peer["name"], "")            # 上次送過去時這台叫什麼（改名後那邊要把舊資料夾搬過來）
    q = urllib.parse.urlencode({"from": NAME, "file": os.path.basename(path), "was": was if was != NAME else ""})
    try:
        with open(path, "rb") as f:
            req = urllib.request.Request(peer["url"] + "/api/backup-store?" + q, data=f, method="POST",
                                         headers={"X-Token": peer["token"], "Content-Type": "application/octet-stream",
                                                  "Content-Length": str(os.path.getsize(path))})
            with urllib.request.urlopen(req, timeout=900) as r:
                d = json.loads(r.read())
        if d.get("ok"):
            bk_learn_name("~" + peer["name"], NAME)
        return bool(d.get("ok")), d.get("message") or ""
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, "那台還沒更新到新版"
        try:
            return False, json.loads(e.read()).get("message") or f"錯誤 {e.code}"
        except ValueError:
            return False, f"錯誤 {e.code}"
    except Exception as e:  # noqa: BLE001
        return False, peer_error(e, peer["url"])


def bk_pull(peer):
    """把另一台的最新備份拿過來存在這台；那台沒設定 Telegram 的話順便幫它傳；回傳 (成功, 說明)"""
    try:
        req = urllib.request.Request(peer["url"] + "/api/backup-file?fresh=1", headers={"X-Token": peer["token"]})
        with urllib.request.urlopen(req, timeout=900) as r:
            name = urllib.parse.unquote(r.headers.get("X-Backup-Name") or "")
            real = urllib.parse.unquote(r.headers.get("X-Backup-Host") or "")[:40] or bk_peer_name(peer)
            was = bk_learn_name(peer["name"], real)
            ok, msg, dest = bk_store(real, name, r, int(r.headers.get("Content-Length") or 0), aliases=(peer["name"], *was))
            their_tg = r.headers.get("X-Backup-TG") == "1"
    except urllib.error.HTTPError as e:
        return False, "那台還沒更新到新版" if e.code == 404 else f"錯誤 {e.code}"
    except Exception as e:  # noqa: BLE001
        return False, peer_error(e, peer["url"])
    if ok and not their_tg and TG_BOT and TG_CHAT:
        err = bk_to_tg(dest, owner=real)
        if err:
            log(f"幫「{real}」傳備份到 Telegram 失敗：", err)
    return ok, msg


def backup_run(manual=False):
    """完整的一次備份：打包加密 → Telegram → 同步密碼、送給其他主機 → 拿其他主機的回來"""
    if not BK_RUN.acquire(blocking=False):
        return
    BK["running"] = True
    try:
        res = {"t": time.time(), "ok": False, "size": 0, "items": [], "big": [], "to": [], "msg": ""}
        try:
            path, made = bk_latest(0 if manual else 3600)       # 一小時內剛打包過（例如被別台拿走時打包的）就直接用
            labels, big = made or (None, None)
            res.update(size=os.path.getsize(path), items=labels if labels is not None else (BK["last"] or {}).get("items", []),
                       big=big or [])
            bk_cleanup_legacy()
        except Exception as e:  # noqa: BLE001
            log("備份打包失敗：", repr(e))
            res["msg"] = f"打包失敗：{e}"
            path = None
        if path:
            res["to"].append({"where": f"存在這台的{bk_where()}", "ok": True, "msg": ""})
            if TG_BOT and TG_CHAT:
                err = bk_to_tg(path)
                res["to"].append({"where": "傳到 Telegram", "ok": not err, "msg": err})
            for p in PEERS:
                ok, msg = bk_send_key(p)                         # 先讓那台用同一組密碼，它做的備份這邊也打得開
                if ok:
                    ok, msg = bk_push(p, path)
                res["to"].append({"where": f"存到「{bk_peer_name(p)}」的{msg}" if ok else f"存到「{bk_peer_name(p)}」", "ok": ok, "msg": "" if ok else msg})
                if ok:
                    ok, msg = bk_pull(p)
                    res["to"].append({"where": f"「{bk_peer_name(p)}」的備份也存了一份在這台的{msg}" if ok else f"拿「{bk_peer_name(p)}」的備份",
                                      "ok": ok, "msg": "" if ok else msg})
            res["ok"] = all(x["ok"] for x in res["to"])
        prev = BK["last"]
        with COL.lock:
            BK["last"] = res
            if res["ok"]:
                BK["ok_t"] = res["t"]
        if res["ok"]:
            log(f"備份完成：{fmt_size(res['size'])}")
            if prev and not prev.get("ok"):
                COL.add_event("ok", "備份恢復正常了")
        else:
            why = res["msg"] or "；".join(f"{x['where']}：{x['msg']}" for x in res["to"] if not x["ok"])
            log("備份有問題：", why)
            COL.add_event("bad", f"備份失敗（{why}）")
        COL.save()
    finally:
        BK["running"] = False
        BK_RUN.release()


def bk_copies():
    """這台存著哪些主機的備份：[{name, count, t, size}]，這台自己排第一個"""
    out, root, me = [], bk_root(), bk_safe(NAME)
    try:
        names = sorted(os.listdir(root), key=lambda n: (n != me, n))
    except OSError:
        return []
    for n in names:
        fs = bk_list(os.path.join(root, n))
        if fs:
            out.append({"name": n, "me": n == me, "count": len(fs), "t": os.path.getmtime(fs[-1]), "size": os.path.getsize(fs[-1])})
    return out


def backup_status():
    with COL.lock:
        last = BK["last"]
    return {"on": BACKUP_ON, "hour": BACKUP_HOUR, "key": bk_key(), "running": BK["running"], "last": last,
            "copies": bk_copies(), "where": bk_where(), "tz": BACKUP_TZ, "folder": BK_CLOUD_SUB, "tg": bool(TG_BOT and TG_CHAT),
            "peers": [p["name"] for p in PEERS]}


def set_backup(on):
    global BACKUP_ON
    try:
        write_conf({"BACKUP": "on" if on else "off"})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}"
    BACKUP_ON = bool(on)
    return True, "已開啟每日備份" if on else "已關閉每日備份"


BK_LINK_HOURS = 24


def bk_link_sig(host, exp):
    return hmac.new(("vsbk-dl|" + TOKEN).encode(), f"{host}|{exp}".encode(), hashlib.sha256).hexdigest()[:40]


def bk_link(host):
    """新主機還原用的下載連結（24 小時內有效、只能下載加密過的備份檔）；回傳網址後面的參數"""
    if host not in {c["name"] for c in bk_copies()}:
        return None
    exp = int(time.time()) + BK_LINK_HOURS * 3600
    return urllib.parse.urlencode({"h": host, "e": exp, "s": bk_link_sig(host, exp)})


def bk_link_file(q):
    """還原連結 → 那台最新的備份檔；過期、被改過就回傳 None"""
    h, e, sig = q.get("h", [""])[0], q.get("e", [""])[0], q.get("s", [""])[0]
    if not e.isdigit() or int(e) < time.time() or "/" in h or h.startswith(".") or not h:
        return None
    if not hmac.compare_digest(sig.encode(), bk_link_sig(h, int(e)).encode()):
        return None
    fs = bk_list(os.path.join(bk_root(), h))
    return fs[-1] if fs else None


# ───────────────────────── 網頁還原（安裝時選「從備份還原」）─────────────────────────
# install.sh --restore 會產生一組一次性代碼（只存雜湊），印在終端機上；拿著代碼才能在網頁上傳備份檔、開始還原。
# 還原本身交給 sentinel.py --restore 在背景跑（用 systemd-run 跑在哨兵外面，哨兵被重新啟動也不會中斷），
# 進度寫在 progress.json，網頁每隔一下來讀。狀態檔不放在 DATA_DIR（那裡會被備份蓋掉）。
RSW_STATE = os.environ.get("SENTINEL_RESTORE_STATE", "/var/lib/vps-sentinel-restore/state.json")
RSW_DIR = os.path.dirname(RSW_STATE)
RSW_FILE = os.path.join(RSW_DIR, "upload.vsbk")
RSW_PROG = os.path.join(RSW_DIR, "progress.json")
RSW_FAIL = {"n": 0, "until": 0.0}                  # 代碼輸錯 10 次就暫停 10 分鐘


def rsw_read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def rsw_state():
    """還原模式的狀態；沒有在還原（或已經過期）回傳 None"""
    st = rsw_read(RSW_STATE)
    if not isinstance(st, dict):
        return None
    now = time.time()
    if st.get("stage") == "wait" and st.get("exp", 0) < now:
        return None
    if st.get("stage") == "running":
        pg = rsw_read(RSW_PROG) or {}
        if pg.get("done"):
            st.update(stage="done", done_t=pg.get("t") or now)
    if st.get("stage") == "done" and now - (st.get("done_t") or 0) > 6 * 3600:
        return None
    return st


def rsw_save(st):
    tmp = RSW_STATE + ".tmp"
    with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        json.dump(st, f)
    os.replace(tmp, RSW_STATE)


def rsw_code_ok(code):
    st = rsw_state()
    if not st or not code or RSW_FAIL["until"] > time.time():
        return False
    norm = re.sub(r"[\s-]", "", code).upper()           # 有沒有打中間的「-」、大小寫都可以
    ok = hmac.compare_digest(hashlib.sha256(norm.encode()).hexdigest(), str(st.get("hash", "")))
    if ok:
        RSW_FAIL["n"] = 0
    else:
        RSW_FAIL["n"] += 1
        if RSW_FAIL["n"] >= 10:
            RSW_FAIL.update(n=0, until=time.time() + 600)
    return ok


def rsw_status():
    st = rsw_state() or {}
    has = os.path.isfile(RSW_FILE)
    return {"active": bool(st), "stage": st.get("stage", ""), "file": has, "size": os.path.getsize(RSW_FILE) if has else 0,
            "progress": rsw_read(RSW_PROG) if st.get("stage") in ("running", "done") else None}


def rsw_store(stream, length):
    st = rsw_state()
    if not st or st.get("stage") != "wait":
        return False, "現在沒有在等待還原"
    if not 40 < length <= BK_UPLOAD_MAX:
        return False, "檔案大小不對"
    tmp, left, head = RSW_FILE + ".part", length, b""
    try:
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as f:
            while left > 0:
                chunk = stream.read(min(left, 1 << 20))
                if not chunk:
                    raise OSError("傳到一半斷掉了")
                head = head or chunk[:4]
                f.write(chunk)
                left -= len(chunk)
        if head != VSBK_MAGIC:
            os.remove(tmp)
            return False, "這不是哨兵的備份檔（檔名是 .vsbk 的那個）"
        os.replace(tmp, RSW_FILE)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False, f"存檔失敗：{e}"
    return True, "已上傳"


RSW_LOCK = threading.Lock()


def rsw_start(pw):
    """先確認密碼打得開，再在背景開始還原（兩個分頁同時按也只會開始一次）"""
    if not RSW_LOCK.acquire(blocking=False):
        return False, "已經在開始還原了"
    try:
        return _rsw_start(pw)
    finally:
        RSW_LOCK.release()


def _rsw_start(pw):
    st = rsw_state()
    if not st or st.get("stage") != "wait":
        return False, "現在沒有在等待還原"
    if not os.path.isfile(RSW_FILE):
        return False, "請先選擇備份檔"
    try:
        vsbk_decrypt(RSW_FILE, None, pw or "")
    except (ValueError, OSError) as e:
        return False, str(e)
    pwf = os.path.join(RSW_DIR, "pw")
    with open(os.open(pwf, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write(pw)
    try:
        os.remove(RSW_PROG)
    except OSError:
        pass
    args = [sys.executable, os.path.abspath(__file__), "--restore", RSW_FILE, "--yes", "--password-file", pwf, "--status", RSW_PROG]
    env = {"SENTINEL_SRC": C.get("SRC_DIR", "")}
    st.update(stage="running", start_t=time.time())
    rsw_save(st)
    if shutil.which("systemd-run") and os.environ.get("SENTINEL_RESTORE_DRY") != "1":
        cmd = ["systemd-run", "--unit", f"vps-sentinel-restore-{int(time.time())}", "--collect", "--quiet",
               *(f"--setenv={k}={v}" for k, v in env.items() if v), *args]
    else:
        cmd = args
    try:
        subprocess.Popen(cmd, env={**os.environ, **env}, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError as e:
        st.update(stage="wait")                   # 沒開始成功：回到等待，可以再按一次
        rsw_save(st)
        return False, f"沒辦法開始還原：{e}"
    return True, "開始還原"


# ───────────────────────── 網頁伺服器 ─────────────────────────

# App 圖示（蘋果風格：圓角方形、藍色漸層、白色盾牌，勾勾用挖空呈現）
ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n<defs>\n<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b9bff"/><stop offset="1" stop-color="#2f4fe0"/></linearGradient>\n<linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>\n<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".86"/></linearGradient>\n<mask id="m"><rect width="512" height="512" fill="#fff"/><path d="M204 258l36 36 72-76" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></mask>\n<filter id="d" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#001040" flood-opacity=".28"/></filter>\n</defs><rect width="512" height="512" rx="115" fill="url(#bg)"/><rect width="512" height="512" rx="115" fill="url(#hl)"/><path d="M256 108 371 150c9 3 15 12 15 22v72c0 84-52 140-122 168-5 2-11 2-16 0-70-28-122-84-122-168v-72c0-10 6-19 15-22Z" fill="url(#sh)" mask="url(#m)" filter="url(#d)" transform="translate(256 262) scale(.88) translate(-256 -258)"/></svg>'
# iPhone 加到主畫面用的圖示（PNG，正方形，iPhone 會自己切圓角）
ICON_PNG_180 = base64.b64decode('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')
ICON_PNG_512 = base64.b64decode('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')

MANIFEST = json.dumps({
    "name": "VPS 哨兵", "short_name": "VPS 哨兵", "start_url": "/", "display": "standalone",
    "background_color": "#06080f", "theme_color": "#06080f",
    "icons": [{"src": "/icon.svg?v=2", "sizes": "any", "type": "image/svg+xml"},
              {"src": "/icon-512.png?v=2", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
              {"src": "/apple-touch-icon.png?v=2", "sizes": "180x180", "type": "image/png"}],
}, ensure_ascii=False)


class Handler(BaseHTTPRequestHandler):
    server_version = "VPSSentinelLite"
    timeout = 120                               # 連上來卻一直不送資料的連線，2 分鐘後自動斷掉，不會越積越多把哨兵拖垮

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json; charset=utf-8", cache=False):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=86400" if cache else "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")              # 不讓別的網站把哨兵嵌進去騙你點按鈕
        self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
        self.send_header("Referrer-Policy", "no-referrer")       # 點外部連結時不帶出哨兵的網址
        self.end_headers()
        self.wfile.write(data)

    def authed(self):
        given = self.headers.get("X-Token", "")
        return bool(given) and (hmac.compare_digest(given.encode(), TOKEN.encode()) or pair_key_ok(given))

    # ── /cloud/ 開頭：整個轉給本機的雲端硬碟（沒有網域時，雲端硬碟就跟哨兵用同一個連接埠） ──
    HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"}

    def is_cloud(self):
        p = urllib.parse.urlsplit(self.path).path
        return bool(CLOUD_URL) and (p == "/cloud" or p.startswith("/cloud/") or p == "/cloud-sso")

    def cloud_authed(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == "vs_cloud" and cloud_cookie_ok(v):
                return True
        return False

    def cloud_cookie(self):
        secure = "; Secure" if (self.headers.get("X-Forwarded-Proto") or "").lower() == "https" else ""
        return f"vs_cloud={cloud_cookie_value()}; Path=/; Max-Age={CLOUD_DAYS * 86400}; HttpOnly; SameSite=Lax{secure}"

    def proxy_cloud(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path == "/cloud-sso":                     # 從哨兵點進來：一次性登入票（表單送的，不在網址上）換一張 30 天的通行證
            ok = False
            if self.command == "POST":
                try:
                    n = min(int(self.headers.get("Content-Length") or 0), 4096)
                    t = urllib.parse.parse_qs(self.rfile.read(n).decode("utf-8", "replace")).get("t", [""])[0]
                except (ValueError, OSError):
                    t = ""
                ok = cloud_ticket_use(t)
            go = ok or self.cloud_authed()             # 票用過了，但已經有通行證：一樣直接進去
            self.send_response(303)
            if ok:
                self.send_header("Set-Cookie", self.cloud_cookie())
            self.send_header("Location", "/cloud/" if go else "/?go=cloud")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        authed = self.cloud_authed()
        public = u.path.startswith(("/cloud/public/", "/cloud/static/", "/cloud/health"))
        if not authed and not public and self.command == "GET" and "text/html" in (self.headers.get("Accept") or ""):
            self.send_response(302)                     # 還沒登入哨兵：先到哨兵登入，登入後自動回來
            self.send_header("Location", "/?go=cloud")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.close_connection = True
        if not authed and not public and self.command not in ("GET", "HEAD", "OPTIONS"):
            return self.send(401, '{"error":"請先登入"}')    # 還沒登入就想上傳、修改：內容不收，直接擋掉
        try:
            conn = http.client.HTTPConnection("127.0.0.1", CLOUD_PORT, timeout=3600)
            conn.putrequest(self.command, self.path, skip_host=True, skip_accept_encoding=True)
            for k, v in self.headers.items():
                if k.lower() not in self.HOP and k.lower() not in ("content-length", CLOUD_USER_HEADER.lower(),
                                                                   "x-forwarded-for", "x-forwarded-proto"):
                    conn.putheader(k, v)
            conn.putheader("X-Forwarded-For", self.headers.get("X-Forwarded-For") or self.client_address[0])
            conn.putheader("X-Forwarded-Proto", self.headers.get("X-Forwarded-Proto") or "http")
            if authed:
                conn.putheader(CLOUD_USER_HEADER, CLOUD_OWNER)
            length = self.headers.get("Content-Length")
            spool = None
            if length is None and "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
                spool = tempfile.SpooledTemporaryFile(max_size=8 << 20)   # 分段上傳：先收齊（大的放暫存檔）再轉
                while True:
                    n = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                    if n == 0:
                        while self.rfile.readline().strip():
                            pass
                        break
                    while n > 0:                       # 一次最多讀 1 MB，對方說一段很大也不會一口氣吃掉記憶體
                        buf = self.rfile.read(min(n, 1 << 20))
                        if not buf:
                            raise OSError("傳到一半斷掉了")
                        spool.write(buf)
                        n -= len(buf)
                    self.rfile.readline()
                length = str(spool.tell())
                spool.seek(0)
            if length is not None:
                conn.putheader("Content-Length", length)
            conn.endheaders()
            src = spool or self.rfile
            if length is not None:                     # 上傳的檔案邊收邊轉，不會整個放進記憶體
                left = int(length)
                while left > 0:
                    buf = src.read(min(left, 1 << 20))
                    if not buf:
                        break
                    conn.send(buf)
                    left -= len(buf)
            r = conn.getresponse()
        except Exception:  # noqa: BLE001
            return self.send(502, "<meta charset=utf-8><p style='font:16px sans-serif;padding:24px'>雲端硬碟目前打不開，請稍後再試，或在主機上執行 <b>bash cloud.sh 檢查</b></p>",
                             "text/html; charset=utf-8")
        self.send_response(r.status, r.reason)
        for k, v in r.getheaders():
            if k.lower() not in self.HOP:
                self.send_header(k, v)
        self.end_headers()
        try:
            while True:
                buf = r.read1(65536) if hasattr(r, "read1") else r.read(65536)
                if not buf:
                    break
                self.wfile.write(buf)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            conn.close()

    def do_PUT(self):
        return self.proxy_cloud() if self.is_cloud() else self.send(404, '{"error":"找不到"}')
    do_PATCH = do_DELETE = do_OPTIONS = do_PROPFIND = do_PROPPATCH = do_MKCOL = do_COPY = do_MOVE = do_LOCK = do_UNLOCK = do_PUT

    def jbody(self, body):
        try:
            d = json.loads(body or b"{}")
        except (ValueError, RecursionError):
            d = {}
        return d if isinstance(d, dict) else {}

    def passkey(self, body):
        """登記、列出、刪除手機金鑰（已登入才能用）"""
        d = self.jbody(body)
        act = d.get("action")
        if act == "begin":
            ok, out = pk_register_begin(self.headers.get("Host"))
            return self.send(200 if ok else 400, json.dumps({"ok": ok, **out}, ensure_ascii=False))
        if act == "finish":
            ok, msg = pk_register_finish(d)
        elif act == "delete":
            ok, msg = pk_delete(str(d.get("id") or ""))
        else:
            return self.send(200, json.dumps({"ok": True, "keys": pk_list(), "max": PASSKEY_MAX}, ensure_ascii=False))
        return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg, "keys": pk_list()}, ensure_ascii=False))

    def passkey_login(self, body):
        d = self.jbody(body)
        act = d.get("action")
        if act == "has":                             # 登入頁問：有沒有登記過手機金鑰、有沒有設定 PIN 碼（沒有就不顯示）
            rp = pk_rp(self.headers.get("Host"))
            return self.send(200, json.dumps({"has": any(k.get("rp") == rp for k in pk_load()), "pin": bool(pin_load())}))
        if act == "begin":
            return self.send(200, json.dumps({"challenge": pk_challenge("webauthn.get"), "rp": pk_rp(self.headers.get("Host"))}))
        ok, res = pk_login_finish(d)
        if not ok:
            time.sleep(1)
            return self.send(401, json.dumps({"ok": False, "message": res}, ensure_ascii=False))
        log(f"用手機金鑰「{res}」登入")
        return self.send(200, json.dumps({"ok": True, "token": TOKEN}))

    def do_HEAD(self):
        if self.is_cloud():
            return self.proxy_cloud()
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.is_cloud():
            return self.proxy_cloud()
        path = urllib.parse.urlsplit(self.path).path
        if path == "/":
            rs = rsw_state()
            busy = rs and (rs.get("stage") == "wait" or rs.get("stage") == "running" and time.time() - rs.get("start_t", 0) < 7200)
            w = [] if busy else watchers()        # 等著網頁還原、還原中：照樣給完整網頁
            return self.send(200, watch_page(w) if w else page(), "text/html; charset=utf-8")
        if path == "/manifest.webmanifest":
            return self.send(200, MANIFEST, "application/manifest+json", cache=True)
        if path == "/apple-touch-icon.png":
            return self.send(200, ICON_PNG_180, "image/png", cache=True)
        if path == "/icon-512.png":
            return self.send(200, ICON_PNG_512, "image/png", cache=True)
        if path in ("/icon.svg", "/favicon.ico"):
            return self.send(200, ICON, "image/svg+xml", cache=True)
        if path == "/api/history":
            if not self.authed():
                time.sleep(1)
                return self.send(401, '{"error":"密碼錯誤"}')
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            rng, node = q.get("range", ["24h"])[0], q.get("node", [""])[0]
            if node:
                peer = next((p for p in PEERS if p["name"] == node), None)
                if not peer:
                    return self.send(404, '{"error":"找不到這台主機"}')
                try:
                    req = urllib.request.Request(peer["url"] + "/api/history?range=" + urllib.parse.quote(rng),
                                                 headers={"X-Token": peer["token"]})
                    with urllib.request.urlopen(req, timeout=8) as r:
                        return self.send(200, r.read())
                except urllib.error.HTTPError as e:
                    return self.send(e.code, '{"error":"那台主機還沒更新到新版"}' if e.code == 404 else e.read())
                except Exception as e:  # noqa: BLE001
                    return self.send(502, json.dumps({"error": peer_error(e, peer["url"])}, ensure_ascii=False))
            return self.send(200, json.dumps(COL.history(rng)))
        if path in ("/api/backup", "/api/backup-file"):
            return self.backup_get(path)
        if path == "/api/restore":                      # 網頁還原：沒有代碼只回答「有沒有在等待還原」
            if self.authed() or rsw_code_ok(self.headers.get("X-Restore-Code", "")):
                return self.send(200, json.dumps({"ok": True, **rsw_status()}, ensure_ascii=False))
            if self.headers.get("X-Restore-Code"):
                time.sleep(1)
                return self.send(401, json.dumps({"active": bool(rsw_state()), "error": "代碼不對"}, ensure_ascii=False))
            return self.send(200, json.dumps({"active": bool(rsw_state())}))
        if path == "/api/backup-dl":                    # 新主機還原：不用登入，靠連結上的簽章
            f = bk_link_file(urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query))
            if not f:
                time.sleep(1)
                return self.send(403, '{"error":"還原連結過期或不對"}')
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(os.path.getsize(f)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with open(f, "rb") as fh:
                shutil.copyfileobj(fh, self.wfile, 1 << 20)
            return
        if path in ("/api/status", "/api/all"):
            if not self.authed():
                time.sleep(1)
                return self.send(401, '{"error":"密碼錯誤"}')
            data = COL.snapshot() if path == "/api/status" else all_status()
            return self.send(200, json.dumps(data, ensure_ascii=False))
        self.send(404, '{"error":"找不到"}')

    def backup_get(self, path):
        """備份狀態、下載最新的備份（node=其他主機：轉給那台）"""
        if not self.authed():
            time.sleep(1)
            return self.send(401, '{"error":"密碼錯誤"}')
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        node = q.get("node", [""])[0]
        if node:
            peer = next((p for p in PEERS if p["name"] == node), None)
            if not peer:
                return self.send(404, '{"error":"找不到這台主機"}')
            try:
                req = urllib.request.Request(peer["url"] + path + "?fresh=1", headers={"X-Token": peer["token"]})
                r = urllib.request.urlopen(req, timeout=600 if path == "/api/backup-file" else 15)
            except urllib.error.HTTPError as e:
                return self.send(e.code, '{"error":"那台主機還沒更新到新版"}' if e.code == 404 else e.read())
            except Exception as e:  # noqa: BLE001
                return self.send(502, json.dumps({"error": peer_error(e, peer["url"])}, ensure_ascii=False))
            with r:
                if path == "/api/backup":
                    return self.send(200, r.read())
                self.send_response(200)
                for h in ("Content-Type", "Content-Length", "Content-Disposition", "X-Backup-Name", "X-Backup-Host", "X-Backup-TG"):
                    if r.headers.get(h):
                        self.send_header(h, r.headers[h])
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                shutil.copyfileobj(r, self.wfile, 1 << 20)
            return
        if path == "/api/backup":
            return self.send(200, json.dumps(backup_status(), ensure_ascii=False))
        try:
            f, _ = bk_latest(20 * 3600)           # 太舊就先打包一份新的
        except Exception as e:  # noqa: BLE001
            return self.send(500, json.dumps({"error": f"打包失敗：{e}"}, ensure_ascii=False))
        name = os.path.basename(f)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(os.path.getsize(f)))
        self.send_header("Content-Disposition", f"attachment; filename=\"backup.vsbk\"; filename*=UTF-8''{urllib.parse.quote(name)}")
        self.send_header("X-Backup-Name", urllib.parse.quote(name))
        self.send_header("X-Backup-Host", urllib.parse.quote(NAME))         # 這台在網頁上顯示的名稱，拿走的那台用它當資料夾名稱
        self.send_header("X-Backup-TG", "1" if TG_BOT and TG_CHAT else "0")   # 這台自己會傳到 Telegram，拿走的那台就不用再幫忙傳
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        with open(f, "rb") as fh:
            shutil.copyfileobj(fh, self.wfile, 1 << 20)

    def do_POST(self):
        if self.is_cloud():
            return self.proxy_cloud()
        u = urllib.parse.urlsplit(self.path)
        if u.path not in ("/api/update", "/api/rename", "/api/traffic", "/api/telegram", "/api/links", "/api/self", "/api/cloud-login", "/api/peer",
                          "/api/token", "/api/passkey", "/api/passkey-login", "/api/pin", "/api/pin-login", "/api/backup", "/api/backup-store",
                          "/api/restore-upload", "/api/restore-run", "/api/pair", "/api/pair-admin", "/api/reboot", "/api/keepalive"):
            return self.send(404, '{"error":"找不到"}')
        if u.path in ("/api/restore-upload", "/api/restore-run"):   # 網頁還原：要有安裝時給的代碼（或已經登入）
            if not (self.authed() or rsw_code_ok(self.headers.get("X-Restore-Code", ""))):
                time.sleep(1)
                return self.send(401, json.dumps({"error": "代碼不對，請看安裝完成時終端機上顯示的還原代碼"}, ensure_ascii=False))
            if u.path == "/api/restore-upload":
                try:
                    length = int(self.headers.get("Content-Length") or 0)
                except ValueError:
                    length = 0
                ok, msg = rsw_store(self.rfile, length)
                if not ok:
                    self.close_connection = True       # 沒讀完的內容不要留在連線裡
            else:
                n = int(self.headers.get("Content-Length") or 0)
                ok, msg = rsw_start(self.jbody(self.rfile.read(min(n, 4096))).get("pw"))
            return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
        if u.path == "/api/backup-store":            # 其他主機傳來的備份（檔案很大，邊收邊存，不先讀進記憶體）
            if not self.authed():
                time.sleep(1)
                return self.send(401, '{"error":"密碼錯誤"}')
            q = urllib.parse.parse_qs(u.query)
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            was = (q.get("was") or [""])[0][:40]
            ok, msg, _ = bk_store((q.get("from") or ["其他主機"])[0][:40], (q.get("file") or [""])[0], self.rfile, length,
                                  aliases=(was,) if was else ())
            if not ok:
                self.close_connection = True       # 沒收完的資料不要留在連線上
            return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
        try:
            size = min(int(self.headers.get("Content-Length") or 0), 16384 if u.path.startswith("/api/passkey") else 4096)
            body = self.rfile.read(size) if size else b""
        except (ValueError, OSError):
            body = b""
        if u.path == "/api/passkey-login":           # 還沒登入：用手機金鑰換到存取密碼
            return self.passkey_login(body)
        if u.path == "/api/pin-login":               # 還沒登入：用 PIN 碼換到存取密碼
            ok, msg = pin_login(self.jbody(body).get("pin"))
            if not ok:
                time.sleep(1)
                return self.send(401, json.dumps({"ok": False, "message": msg}, ensure_ascii=False))
            log("用 PIN 碼登入")
            return self.send(200, json.dumps({"ok": True, "token": TOKEN}))
        if u.path == "/api/pair":                    # 還沒登入：主要主機拿配對暗號來對（或主要主機移除這台時把鑰匙作廢）
            d = self.jbody(body)
            if d.get("action") == "unwatch":         # 被監看的那頁：用這台的密碼或 PIN 碼取消
                pw = str(d.get("pw") or "")
                ok = bool(pw) and hmac.compare_digest(pw.encode(), TOKEN.encode())
                msg = "密碼不對"
                if not ok and re.fullmatch(r"[0-9]{4,8}", pw) and pin_load():
                    ok, msg = pin_login(pw)
                if not ok:
                    time.sleep(1)
                    return self.send(401, json.dumps({"ok": False, "message": msg}, ensure_ascii=False))
                ok, msg = pair_unwatch()
                return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
            if d.get("action") == "beat":            # 主要主機的心跳
                if not self.authed():
                    return self.send(401, '{"error":"密碼錯誤"}')
                pair_beat_store(d.get("tg"))
                return self.send(200, '{"ok":true}')
            if d.get("action") == "forget":
                if not self.authed():
                    return self.send(401, '{"error":"密碼錯誤"}')
                ok, msg = pair_revoke(given=self.headers.get("X-Token", ""))
                return self.send(200 if ok else 404, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
            ok, msg, res = pair_accept(d)
            if not ok:
                time.sleep(1)
                return self.send(401, json.dumps({"ok": False, "message": msg}, ensure_ascii=False))
            return self.send(200, json.dumps(res, ensure_ascii=False))
        if not self.authed():
            time.sleep(1)
            return self.send(401, '{"error":"密碼錯誤"}')
        node = urllib.parse.parse_qs(u.query).get("node", [""])[0]
        if node:                                  # 轉給其他 VPS
            peer = next((p for p in PEERS if p["name"] == node), None)
            if not peer:
                return self.send(404, '{"ok":false,"message":"找不到這台主機"}')
            try:
                req = urllib.request.Request(peer["url"] + u.path, data=body, method="POST",
                                             headers={"X-Token": peer["token"],
                                                      "Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=20) as r:
                    data = r.read()
                if u.path == "/api/token":           # 那台換了密碼：這邊也要記住，不然下次就連不上它
                    try:
                        set_peer_token(node, json.loads(data).get("token"))
                    except (ValueError, AttributeError):
                        pass
                return self.send(r.status, data)
            except urllib.error.HTTPError as e:
                return self.send(e.code, e.read())
            except Exception as e:  # noqa: BLE001
                return self.send(502, json.dumps({"ok": False, "message": peer_error(e, peer["url"])}, ensure_ascii=False))
        if u.path == "/api/pair-admin":              # 這台：產生配對暗號、看配對過來的主機、解除配對
            d = self.jbody(body)
            if d.get("action") == "code":
                ok, code = pair_code(d.get("url"))
                return self.send(200 if ok else 400, json.dumps({"ok": ok, "code": code if ok else "", "message": "" if ok else code,
                                                                 "hours": PAIR_HOURS}, ensure_ascii=False))
            if d.get("action") == "revoke":
                ok, msg = pair_revoke(kid=str(d.get("id") or "")[:20] or None)
                return self.send(200 if ok else 404, json.dumps({"ok": ok, "message": msg, **pair_status()}, ensure_ascii=False))
            return self.send(200, json.dumps({"ok": True, **pair_status()}, ensure_ascii=False))
        if u.path == "/api/peer":
            d = self.jbody(body)
            if d.get("action") == "add":
                ok, msg = peer_add(d.get("code"))
                return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
            if d.get("action") == "remove":
                ok, msg = peer_remove(d.get("name"))
                return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
            ok, msg, tf = set_peer(d.get("name"), d.get("url"), d.get("token"), bool(d.get("force")))
            return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg, "test_failed": tf}, ensure_ascii=False))
        if u.path == "/api/passkey":
            return self.passkey(body)
        if u.path == "/api/reboot":                  # 先要驗證碼（ask），再帶著驗證碼重新開機（go）
            d = self.jbody(body)
            if d.get("action") == "go":
                ok, msg = reboot_go(d.get("code"))
                if not ok:
                    time.sleep(1)
                return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
            ok, res = reboot_ask()
            return self.send(200 if ok else 400, json.dumps(res, ensure_ascii=False))
        if u.path == "/api/backup":
            d = self.jbody(body)
            if d.get("action") == "run":
                if BK["running"]:
                    return self.send(200, json.dumps({"ok": True, "message": "正在備份中"}, ensure_ascii=False))
                COL.bg("backup", lambda: backup_run(manual=True))
                return self.send(200, json.dumps({"ok": True, "message": "開始備份"}, ensure_ascii=False))
            if d.get("action") == "key":             # 換解開密碼（網頁上改：sync＝其他主機也一起改；主要那台同步過來的：不再往外傳）
                if "tz" in d:
                    bk_set_tz(d["tz"])
                ok, msg = bk_set_key(d.get("key"), sync=bool(d.get("sync")))
                return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg, "name": NAME}, ensure_ascii=False))
            if d.get("action") == "tz":              # 網頁告訴主機使用者在哪個時區（備份檔名上的時間用）
                ok = bk_set_tz(d.get("tz"))
                if ok:
                    for p in PEERS:
                        bk_send_key(p)
                return self.send(200 if ok else 400, json.dumps({"ok": ok}))
            if d.get("action") == "link":            # 產生新主機還原用的下載連結
                q = bk_link(d.get("host"))
                return self.send(200 if q else 404, json.dumps({"ok": bool(q), "q": q or "", "hours": BK_LINK_HOURS,
                                                                "message": "" if q else "這台上沒有那台的備份"}, ensure_ascii=False))
            if d.get("action") == "set":
                ok, msg = set_backup(bool(d.get("on")))
                return self.send(200 if ok else 500, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
            return self.send(400, '{"ok":false}')
        if u.path == "/api/keepalive":               # 開關 Oracle 防回收
            ok, msg = set_keepalive(bool(self.jbody(body).get("on")))
            return self.send(200 if ok else 500, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
        if u.path == "/api/pin":                     # 設定、關閉 PIN 碼（已登入才能用）
            d = self.jbody(body)
            if d.get("action") == "set":
                ok, msg = pin_set(d.get("pin"))
            elif d.get("action") == "off":
                ok, msg = pin_off()
            else:
                if d.get("action") == "login":       # 網頁剛用密碼或手機金鑰登入：輸錯次數歸零
                    pin_reset_fails()
                return self.send(200, json.dumps({"ok": True, **pin_status()}))
            return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg, **pin_status()}, ensure_ascii=False))
        if u.path == "/api/token":
            ok, msg, tok = change_token()
            return self.send(200 if ok else 500, json.dumps({"ok": ok, "message": msg, "token": tok}, ensure_ascii=False))
        if u.path == "/api/cloud-login":            # 網頁上已經登入哨兵：直接發雲端硬碟通行證
            if not CLOUD_URL:
                return self.send(404, '{"ok":false}')
            self.send_response(200)
            self.send_header("Set-Cookie", self.cloud_cookie())
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "11")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return
        if u.path == "/api/self":
            try:
                act = json.loads(body or b"{}").get("action")
            except (ValueError, AttributeError):
                act = ""
            if act == "update":
                ok, msg = self_update()
            elif act == "cloud_update":
                ok, msg = cloud_update()
            else:
                return self.send(200, json.dumps({"ok": True, **self_check(act == "check"), "cloud": cloud_check(act == "check")},
                                                 ensure_ascii=False))
            return self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))
        if u.path == "/api/telegram":
            try:
                cfg = json.loads(body or b"{}")
            except ValueError:
                cfg = {}
            ok, res = telegram(cfg if isinstance(cfg, dict) else {})
            out = res if isinstance(res, dict) else {"ok": ok, "message": res}
            return self.send(200 if ok else 400, json.dumps(out, ensure_ascii=False))
        if u.path == "/api/traffic":
            try:
                cfg = json.loads(body or b"{}")
            except ValueError:
                cfg = {}
            ok, msg = set_traffic(cfg if isinstance(cfg, dict) else {})
        elif u.path == "/api/links":
            try:
                items = json.loads(body or b"{}").get("links", [])
            except (ValueError, AttributeError):
                items = None
            ok, msg = set_links(items)
        elif u.path == "/api/rename":
            try:
                new = json.loads(body or b"{}").get("name", "")
            except (ValueError, AttributeError):
                new = ""
            ok, msg = set_name(new)
        else:
            ok, msg = start_update()
            if ok:
                COL.upd_running = True
                COL.add_event("info", "開始系統更新")
        self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))


PAGE = None if watchers() else load_page()       # 被監看的主機不載入完整網頁


def page():
    global PAGE
    if PAGE is None:                              # 取消被監看後第一次打開才載入
        PAGE = load_page()
    return PAGE


def main():
    def stop(*_):
        keep_stop()
        COL.save()
        log("已存檔，結束")
        sys.exit(0)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    threading.Thread(target=COL.loop, daemon=True).start()
    threading.Thread(target=keep_loop, daemon=True).start()       # 只有 Oracle 免費主機才會真的做事
    threading.Thread(target=alert_loop, daemon=True).start()      # 沒設定時也會跑，網頁上一設定好就開始通知
    srv = ThreadingHTTPServer((BIND, PORT), Handler)
    log(f"VPS 哨兵 {VERSION} 已啟動：http://{BIND}:{PORT}  名稱={NAME}  其他主機={len(PEERS)} 台  "
        f"Telegram={'開' if TG_BOT and TG_CHAT else '關'}")
    srv.serve_forever()


if __name__ == "__main__" and sys.argv[1:2] == ["--unwatch"]:      # 忘了密碼時：在主機上取消被監看
    print(pair_unwatch()[1])
    sys.exit(0)
if __name__ == "__main__" and sys.argv[1:2] == ["--pair-code"]:   # 安裝畫面用：產生配對暗號
    ok, out = pair_code(sys.argv[2] if len(sys.argv) > 2 else "")
    print(out)
    sys.exit(0 if ok else 1)
if __name__ == "__main__":
    main()
