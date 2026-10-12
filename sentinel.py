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
import ipaddress
import html
import json
import os
import re
import shutil
import ssl
import shlex
import signal
import socket
import subprocess
import tempfile
import sys
import threading
import time
from datetime import date, datetime, timedelta
import urllib.parse
import urllib.error
import urllib.request
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.9"

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


def cloud_cookie_value():
    return _sign("cloud-cookie:v1")


def cloud_login_url():
    """10 分鐘內有效的一鍵登入網址（每次讀狀態都會重新產生）"""
    base = CLOUD_URL[:-len("cloud/")] if CLOUD_URL.endswith("cloud/") else CLOUD_URL.rstrip("/") + "/"
    exp = (int(time.time()) // 300 + 3) * 300     # 每 5 分鐘才換一次網址（10～15 分鐘內有效），畫面不用一直重畫
    return f"{base}cloud-sso?e={exp}&s={_sign(f'cloud-sso:{exp}')}"


def cloud_info():
    if not CLOUD_URL:
        return None
    info = {"url": CLOUD_URL, "login": cloud_login_url()}
    if os.path.ismount(CLOUD_DIR):
        st = os.statvfs(CLOUD_DIR)
        total, free = st.f_blocks * st.f_frsize, st.f_bavail * st.f_frsize
        info.update(total=total, used=total - free, pct=round((total - free) / total * 100, 1) if total else 0)
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
        # 容錯：直接貼上手機用的網址（含 ?t=密碼）也可以
        u = urllib.parse.urlsplit(url)
        qtok = urllib.parse.parse_qs(u.query).get("t", [""])[0]
        path = u.path.rstrip("/")
        for tail in ("/api/status", "/api/all", "/index.html"):
            if path.endswith(tail):
                path = path[: -len(tail)]
        peers.append({"name": name.strip(), "url": f"{u.scheme}://{u.netloc}{path}",
                      "token": tok.strip() or qtok or TOKEN})
    return peers


PEERS = parse_peers(C.get("PEERS", ""))
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

BUILD = hashlib.sha1(open(os.path.abspath(__file__), "rb").read()).hexdigest()[:7]   # 這份程式的指紋，用來判斷是不是最新版
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
                _, new_src, _ = git(d, "show", "@{u}:sentinel.py")
                new_build = hashlib.sha1(new_src.encode("utf-8")).hexdigest()[:7] if new_src else ""
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
cd {q} && git -c safe.directory='*' fetch origin && git -c safe.directory='*' reset --hard '@{{u}}' \
  && echo "__RESULT__ ok $(date +%s)" > /tmp/vps-sentinel-selfupdate.result \
  || echo "__RESULT__ fail $(date +%s)" > /tmp/vps-sentinel-selfupdate.result
if grep -q ok /tmp/vps-sentinel-selfupdate.result; then bash install.sh || echo "__RESULT__ fail $(date +%s)" > /tmp/vps-sentinel-selfupdate.result; fi
cat /tmp/vps-sentinel-selfupdate.result"""
    try:
        if os.path.getsize(SELF_LOG) > 1_000_000:
            open(SELF_LOG, "w").close()
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
    urls = [x["url"] for x in all_links()]
    for u in list(LINK_STATE):
        if u not in urls:
            del LINK_STATE[u]
    # 雲端硬碟直接在本機檢查（從主機連自己的公開 IP，有些雲端主機會連不到，造成誤報）
    targets = [f"http://127.0.0.1:{CLOUD_PORT}/cloud/health" if x.get("fixed") else x["url"] for x in all_links()]
    for u, (up, ms, err) in zip(urls, POOL.map(check_link, targets)):
        st = LINK_STATE.setdefault(u, {"fails": 0})
        st["fails"] = 0 if up else st["fails"] + 1
        st.update(up=True if up else (None if st["fails"] < 2 else False), ms=ms, err=err)   # 連續 2 次失敗才算掛掉，避免偶爾慢一下就誤報


def links_status():
    return [{**x, **{k: v for k, v in LINK_STATE.get(x["url"], {}).items() if k != "fails"}} for x in all_links()]


# ───────────────────────── 改名 ─────────────────────────

def write_conf(values):
    """把多個設定寫回設定檔（有就取代，沒有就加在最後）"""
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
    with open(tmp, "w", encoding="utf-8") as f:
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
    new = re.sub(r"[\x00-\x1f\x7f]", "", str(new or "")).strip().strip('"').strip("'")
    if not new:
        return False, "名稱不能是空白"
    if len(new) > 40:
        return False, "名稱太長了（最多 40 個字）"
    try:
        with open(CONF_PATH, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        text = ""
    line = f"NAME={new}"
    if re.search(r"(?m)^NAME=.*$", text):
        text = re.sub(r"(?m)^NAME=.*$", lambda _: line, text, count=1)
    else:
        text = text.rstrip("\n") + "\n" + line + "\n"
    try:
        tmp = CONF_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.chmod(tmp, 0o600)
        os.replace(tmp, CONF_PATH)
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


# ───────────────────────── 背景收集 ─────────────────────────

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
        self.load()

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
            if st.get("prev_keys") is not None:
                self.prev_keys = {k: tuple(v) for k, v in st["prev_keys"].items()}
            log(f"已讀取存檔：歷史 {len(self.hist)}/{len(self.h24)}/{len(self.h7d)} 筆、事件 {len(self.events)} 筆、流量 {len(self.traffic['days'])} 天")
        except (TypeError, ValueError, IndexError, AttributeError) as e:
            log("存檔格式有問題，略過：", e)

    def save(self):
        with self.lock:
            st = {"v": 1, "saved": time.time(), "hist": list(self.hist), "h24": list(self.h24), "h7d": list(self.h7d),
                  "events": list(self.events), "traffic": self.traffic,
                  "prev_keys": self.prev_keys, "peer_seen": dict(PEER_SEEN),
                  "tg_sent": dict(TG_SENT), "tg_msgs": list(TG_MSGS)}
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            tmp = self.state_path() + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(st, f, ensure_ascii=False, separators=(",", ":"))
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
        last_cpu = cpu_times()
        last_net, last_t = net_bytes(), time.time()
        tick = 0
        while True:
            time.sleep(2)
            now_cpu, now_net, now_t = cpu_times(), net_bytes(), time.time()
            dt_total = now_cpu[0] - last_cpu[0]
            dt_idle = now_cpu[1] - last_cpu[1]
            dt = max(now_t - last_t, 0.001)
            with self.lock:
                if dt_total > 0:
                    self.cpu_pct = round(100 * (1 - dt_idle / dt_total), 1)
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
            if tick % 900 == 0 or recheck:            # 每 30 分鐘：可更新套件數
                u = apt_updates()
                with self.lock:
                    self.updates = u
            if tick % 150 == 3:                       # 每 5 分鐘：IPv6 還能不能用
                a = ipv6_addr()
                ok = ipv6_ok() if a else None
                with self.lock:
                    v = self.v6
                    v["fails"] = 0 if ok or not a else v["fails"] + 1
                    v.update(addr=a, ok=None if not a else (True if ok else (False if v["fails"] >= 2 else v["ok"])))
                    v["seen"] = v["seen"] or bool(a)
            if tick % 5400 == 10:                     # 每 3 小時：GitHub 上有沒有新版的哨兵（背景查，不卡畫面）
                threading.Thread(target=self_check, daemon=True).start()
                threading.Thread(target=cloud_check, daemon=True).start()
            if all_links() and tick % 30 == 0:              # 每 1 分鐘：常用連結打不打得開
                try:
                    check_links()
                except Exception as e:  # noqa: BLE001
                    log("檢查連結失敗：", e)
            if tick % 10800 == 0:                     # 每 6 小時：IP 所在國家
                g = lookup_geo()
                if g:
                    with self.lock:
                        self.geo = g
            tick += 1

    def add_event(self, kind, text):
        with self.lock:
            self.events.append((round(time.time()), kind, text))

    def track_events(self):
        """比較這次和上次的問題，記錄「發生」與「恢復」"""
        snap = self.snapshot()
        cur = {}
        for t in snap["problems"]:
            cur[re.sub(r"[\s（(]*[\d.]+\s*%?[）)]?", "", t)] = ("bad", t)
        for t in snap["notices"]:
            cur[re.sub(r"[\d.]+\s*", "", t)] = ("warn", t)
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

        traffic = self.traffic_info()
        notices = []
        if traffic["limit"]:
            if traffic["used"] >= traffic["limit"]:
                problems.append("本月流量已經用完")
            elif traffic["pct"] >= 90:
                notices.append(f"本月流量已用 {traffic['pct']:.0f}%")
            elif (traffic["projected"] and traffic["projected"] > traffic["limit"]
                  and traffic["days_left"] < traffic["cycle_days"] - 3):   # 週期剛開始幾天不預估，免得誤報
                notices.append("照目前速度，本月流量會超過上限")
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

        return {
            "name": NAME, "node": "", "online": True, "version": VERSION, "time": time.time(), "links": links_status(), "build": BUILD, "self_has": bool(SELF["has"] or (CLOUD_URL and CLOUDUP["has"])),
            "os": os_name(), "kernel": os.uname().release,
            "uptime": float(read("/proc/uptime", "0").split()[0] or 0),
            "cores": os.cpu_count() or 1, "cpu": cpu, "load": [round(x, 2) for x in load],
            "ipv6": {"addr": v6["addr"], "ok": v6["ok"]} if v6["addr"] or v6["seen"] else None,
            "cloud": cloud,
            "conns": tcp_conns(), "conns_avg": round(sum(self.conn_hist) / len(self.conn_hist), 1) if len(self.conn_hist) >= 30 else None, "procs": int((read("/proc/loadavg", "0 0 0 0/0").split()[3:4] or ["0/0"])[0].split("/")[-1] or 0),
            "mem": mem, "disks": disks, "net": net,
            "containers": containers, "services": services,
            "updates": updates, "reboot": reboot, "geo": geo, "update": upd, "events": events, "traffic": traffic,
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
                "problems": ["連不上"], "error": peer_error(e, p["url"]), "last_seen": PEER_SEEN.get(p["name"])}


def peer_error(e, url):
    """把連線錯誤翻成看得懂的中文"""
    text = str(e)
    if isinstance(e, urllib.error.HTTPError):
        if e.code == 401:
            return "密碼不對：請在 PEERS 網址後面加上「|那台的密碼」"
        if e.code == 404:
            return f"這個網址不是 VPS 哨兵（{url}），請確認網址和連接埠"
        return f"對方回應錯誤（代碼 {e.code}）"
    if isinstance(e, ValueError):          # 回傳的不是哨兵的資料
        return f"這個網址打得開，但不是 VPS 哨兵（{url}）。請確認網址後面的連接埠，例如 https://網域:9443"
    if "timed out" in text or "timeout" in text.lower():
        return "等太久沒有回應：請確認對方開著，防火牆有開放這個連接埠"
    if "refused" in text:
        return "對方拒絕連線：請確認對方有安裝哨兵，或連接埠打錯了"
    if "Name or service not known" in text or "getaddrinfo" in text or "nodename" in text:
        return "找不到這個網域：請確認網址有沒有打錯"
    if "CERTIFICATE" in text.upper() or "SSL" in text.upper():
        return "加密憑證有問題：對方可能還在申請憑證，等幾分鐘再看看"
    return text[:150]


POOL = ThreadPoolExecutor(max_workers=8)


def all_status():
    peers = list(POOL.map(fetch_peer, PEERS)) if PEERS else []
    return [COL.snapshot()] + peers


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
            return None, "這個機器人已經被其他程式（例如 n8n）拿去接收訊息，沒辦法自動尋找。建議另外建一個新的機器人，或直接手動填聊天編號"
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
        return False, "「要傳到哪裡」這格貼成機器人密碼了。這格可以留空，直接按「自動尋找」就好"
    if not re.fullmatch(r"-?\d{3,}|@\w{4,}", chat):
        return False, "聊天編號格式不對，應該是一串數字（群組是 - 開頭）。不確定的話，這格留空，直接按「自動尋找」"
    text = f"✅ VPS 哨兵：「{NAME}」的通知會傳到這裡" if act == "save" else f"🔔 這是 VPS 哨兵的測試通知（來自「{NAME}」）"
    sent, err = tg_api(token, "sendMessage", {"chat_id": chat, "text": text})
    if err:
        return False, err
    if act == "test":
        where = "到「" + picked["name"] + "」" if picked else ""
        return True, {"ok": True, "chat": chat, "message": f"測試通知已送出{where}，去 Telegram 看看有沒有收到"}
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
        return "❌ 系統更新失敗，可以到網頁上再試一次"
    if t.startswith("已恢復："):
        return f"✅ 已解決：{t[4:]}"
    return {"bad": "🔴 ", "warn": "🟠 "}.get(k, "• ") + t


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
            if TG_BOT and TG_CHAT:
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
                    evs = sorted(s.get("events") or [], key=lambda e: e.get("t", 0))
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
            tg_cleanup()
        except Exception as e:  # noqa: BLE001
            log("通知檢查失敗：", e)
        time.sleep(30)


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

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json; charset=utf-8", cache=False):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=86400" if cache else "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def authed(self):
        given = self.headers.get("X-Token", "")
        return bool(given) and hmac.compare_digest(given.encode(), TOKEN.encode())

    # ── /cloud/ 開頭：整個轉給本機的雲端硬碟（沒有網域時，雲端硬碟就跟哨兵用同一個連接埠） ──
    HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"}

    def is_cloud(self):
        p = urllib.parse.urlsplit(self.path).path
        return bool(CLOUD_URL) and (p == "/cloud" or p.startswith("/cloud/") or p == "/cloud-sso")

    def cloud_authed(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == "vs_cloud" and hmac.compare_digest(v, cloud_cookie_value()):
                return True
        return False

    def cloud_cookie(self):
        secure = "; Secure" if (self.headers.get("X-Forwarded-Proto") or "").lower() == "https" else ""
        return f"vs_cloud={cloud_cookie_value()}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax{secure}"

    def proxy_cloud(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path == "/cloud-sso":                     # 從哨兵點進來：檢查簽章，發一張 30 天的通行證，再進雲端硬碟
            q = urllib.parse.parse_qs(u.query)
            e, sig = (q.get("e") or ["0"])[0], (q.get("s") or [""])[0]
            ok = e.isdigit() and int(e) > time.time() and hmac.compare_digest(sig, _sign(f"cloud-sso:{e}"))
            self.send_response(302)
            if ok:
                self.send_header("Set-Cookie", self.cloud_cookie())
            self.send_header("Location", "/cloud/" if ok else "/?go=cloud")
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
                    spool.write(self.rfile.read(n))
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
            return self.send(200, PAGE, "text/html; charset=utf-8")
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
                    return self.send(502, json.dumps({"error": f"連不上：{e}"[:150]}, ensure_ascii=False))
            return self.send(200, json.dumps(COL.history(rng)))
        if path in ("/api/status", "/api/all"):
            if not self.authed():
                time.sleep(1)
                return self.send(401, '{"error":"密碼錯誤"}')
            data = COL.snapshot() if path == "/api/status" else all_status()
            return self.send(200, json.dumps(data, ensure_ascii=False))
        self.send(404, '{"error":"找不到"}')

    def do_POST(self):
        if self.is_cloud():
            return self.proxy_cloud()
        u = urllib.parse.urlsplit(self.path)
        if u.path not in ("/api/update", "/api/rename", "/api/traffic", "/api/telegram", "/api/links", "/api/self", "/api/cloud-login"):
            return self.send(404, '{"error":"找不到"}')
        if not self.authed():
            time.sleep(1)
            return self.send(401, '{"error":"密碼錯誤"}')
        try:
            size = min(int(self.headers.get("Content-Length") or 0), 4096)
            body = self.rfile.read(size) if size else b""
        except (ValueError, OSError):
            body = b""
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
                    return self.send(r.status, r.read())
            except urllib.error.HTTPError as e:
                return self.send(e.code, e.read())
            except Exception as e:  # noqa: BLE001
                return self.send(502, json.dumps({"ok": False, "message": f"連不上：{e}"[:150]},
                                                  ensure_ascii=False))
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


PAGE = r"""<!doctype html>
<html lang="zh-Hant-TW" data-mode="dark" data-accent="blue">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>VPS 哨兵</title>
<link rel="manifest" href="/manifest.webmanifest?v=2">
<link rel="icon" href="/icon.svg?v=2">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="VPS 哨兵">
<meta name="theme-color" content="#06080f">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<script>
/* 先套用設定，避免畫面閃一下 */
document.documentElement.classList.add("booting");
(function(){ try {
  var p = JSON.parse(localStorage.getItem("vps-prefs") || "{}"), h = document.documentElement;
  var t = p.theme || "auto", dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  h.dataset.mode = dark ? "dark" : "light"; h.dataset.accent = p.accent || "blue";
} catch(e){} })();
</script>
<style>
/* ═════════ 色彩：淺色 ═════════ */
:root{
  --font:"Nunito",ui-rounded,"SF Pro Rounded",-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;
  --bg:#eef1f7; --text:#101828; --sub:rgba(16,24,40,.55); --faint:rgba(16,24,40,.35); --line:rgba(16,24,40,.08);
  --ga:.56; --glass:rgba(255,255,255,var(--ga)); --glass2:rgba(255,255,255,calc(var(--ga) * .7));
  --blur:28px; --spec:rgba(255,255,255,.95); --rim:rgba(255,255,255,.6); --edge:rgba(16,24,60,.07);
  --shadow:0 1px 3px rgba(16,24,60,.05),0 14px 36px -16px rgba(30,50,110,.26);
  --hi1:rgba(255,255,255,.95); --hi2:rgba(255,255,255,.55); --hi3:rgba(255,255,255,.22); --hi4:rgba(255,255,255,.6);
  --track:rgba(16,24,60,.07); --veil:rgba(240,243,250,.5);
  --ok:#12b76a; --warn:#f79009; --bad:#f04438;
  --zoom:1; --pad:18px; --gap:16px;
  /* ── 共用規則（所有元件只能用這些值） ── */
  --r-sm:8px; --r-md:14px; --r-lg:20px; --r-xl:30px; --r-pill:999px;          /* 圓角：小元件／中區塊／大區塊／卡片與面板／膠囊 */
  --fs-xs:11.5px; --fs-s:12.5px; --fs-m:13.5px; --fs-l:15.5px; --fs-xl:18px; --fs-2xl:27px; --fs-3xl:36px;   /* 字級 */
  --t-fast:.2s; --t-mid:.35s; --t-slow:.6s;                                   /* 動畫時間：快（按下、淡出）／中（展開、切換）／慢（進場、數字） */
  --ease:cubic-bezier(.22,1,.36,1); --spring:cubic-bezier(.34,1.4,.64,1); --exit:cubic-bezier(.4,0,1,1);   /* 曲線：平順／微彈／離場 */
  --ring:inset 0 0 0 1px var(--line);                                          /* 細邊框 */
  --sh-thumb:0 1px 4px -1px rgba(0,0,0,.3),inset 0 0 0 1px var(--rim);        /* 切換鈕上的小滑塊 */
  --sh-pop:0 16px 40px -14px rgba(0,0,0,.45),inset 0 0 0 1px var(--rim);      /* 浮層（選單、提示框） */
  --sh-accent:0 14px 34px -12px var(--a1);                                     /* 主題色光暈 */
  --inset:var(--glass2);                                                       /* 內嵌區塊的底色 */
}
/* ═════════ 色彩：深色 ═════════ */
[data-mode="dark"]{
  --bg:#06080f; --text:#f1f4fa; --sub:rgba(226,232,245,.58); --faint:rgba(226,232,245,.32); --line:rgba(255,255,255,.075);
  --ga:.07; --glass:rgba(255,255,255,var(--ga)); --glass2:rgba(255,255,255,calc(var(--ga) * .75));
  --spec:rgba(255,255,255,.26); --rim:rgba(255,255,255,.09); --edge:rgba(0,0,0,.5);
  --shadow:0 2px 6px -2px rgba(0,0,0,.35),0 24px 50px -24px rgba(0,0,0,.9);
  --hi1:rgba(255,255,255,.34); --hi2:rgba(255,255,255,.09); --hi3:rgba(255,255,255,.03); --hi4:rgba(255,255,255,.13);
  --track:rgba(255,255,255,.07); --veil:rgba(4,6,12,.55);
  --ok:#32d583; --warn:#fdb022; --bad:#f97066;
}
/* ═════════ 主題色 ═════════ */
[data-accent="blue"]  {--a1:#38bdf8; --a2:#6366f1; --a3:#22d3ee}
[data-accent="purple"]{--a1:#a78bfa; --a2:#d946ef; --a3:#818cf8}
[data-accent="green"] {--a1:#34d399; --a2:#14b8a6; --a3:#a3e635}
[data-accent="orange"]{--a1:#fbbf24; --a2:#f97316; --a3:#fb7185}
[data-accent="pink"]  {--a1:#f472b6; --a2:#f43f5e; --a3:#c084fc}
[data-accent="flag"]  {--a1:#38bdf8; --a2:#6366f1; --a3:#22d3ee}
:root{--accent:var(--a2); --grad:linear-gradient(135deg,var(--a1),var(--a2))}
@property --a1{syntax:"<color>";inherits:true;initial-value:#38bdf8}
@property --a2{syntax:"<color>";inherits:true;initial-value:#6366f1}
@property --a3{syntax:"<color>";inherits:true;initial-value:#22d3ee}
:root{transition:--a1 var(--t-slow) var(--ease),--a2 var(--t-slow) var(--ease),--a3 var(--t-slow) var(--ease)}
:root.qacc{transition-duration:var(--t-fast);transition-timing-function:var(--ease)}  /* 切換主機：顏色在舊內容淡出時就換好 */
[data-motion="off"]{transition:none}

*{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent}
html{background:var(--bg);transition:background var(--t-mid)}
body{color:var(--text);min-height:100vh;font:15px/1.5 var(--font);zoom:var(--zoom);
  padding:0 16px calc(env(safe-area-inset-bottom) + 40px);-webkit-font-smoothing:antialiased;overflow-x:hidden;transition:color var(--t-mid)}
button{font:inherit;color:inherit}
.wrap{max-width:980px;margin:0 auto;position:relative;z-index:1}
.num,.tab{font-variant-numeric:tabular-nums}

/* ═════════ 背景 ═════════ */
.bgfx{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.aurora{position:absolute;inset:-20vmax;transition:opacity var(--t-slow)}
.aurora i{position:absolute;width:60vmax;height:60vmax;border-radius:50%;will-change:transform}
.aurora i:nth-child(1){background:radial-gradient(circle,var(--a1) 0%,color-mix(in srgb,var(--a1) 45%,transparent) 30%,transparent 68%);left:2%;top:-2%;animation:d1 26s ease-in-out infinite alternate}
.aurora i:nth-child(2){background:radial-gradient(circle,var(--a2) 0%,color-mix(in srgb,var(--a2) 45%,transparent) 30%,transparent 68%);right:-4%;top:18%;animation:d2 32s ease-in-out infinite alternate}
.aurora i:nth-child(3){background:radial-gradient(circle,var(--a3) 0%,color-mix(in srgb,var(--a3) 45%,transparent) 30%,transparent 68%);left:18%;bottom:-8%;animation:d3 24s ease-in-out infinite alternate}
.aurora i:nth-child(4){background:radial-gradient(circle,var(--a1) 0%,color-mix(in srgb,var(--a1) 45%,transparent) 30%,transparent 68%);right:14%;bottom:8%;animation:d1 38s ease-in-out infinite alternate-reverse}
[data-mode="dark"] .aurora{opacity:.42}
[data-mode="light"] .aurora{opacity:.38}
@keyframes d1{to{transform:translate(18vmax,12vmax) scale(1.15)}}
@keyframes d2{to{transform:translate(-20vmax,10vmax) scale(.9)}}
@keyframes d3{to{transform:translate(12vmax,-16vmax) scale(1.2)}}
[data-bg="mesh"] .aurora i{animation:none}
[data-bg="plain"] .aurora{opacity:0!important}
.grain{position:absolute;inset:0;opacity:.045;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

/* ═════════ 液態玻璃 ═════════ */
.glass{position:relative;background:var(--glass);
  -webkit-backdrop-filter:blur(var(--blur)) saturate(170%);backdrop-filter:blur(var(--blur)) saturate(170%);
  box-shadow:var(--shadow)}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(150deg,rgba(255,255,255,.14) 0%,rgba(255,255,255,0) 32%,rgba(255,255,255,0) 72%,rgba(255,255,255,.05) 100%)}
/* 光邊：上亮下淡的漸層，用遮罩只留 1px 邊，轉角會平滑反鋸齒 */
.glass::after,.host.on::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
  background:linear-gradient(165deg,var(--hi1) 0%,var(--hi2) 28%,var(--hi3) 68%,var(--hi4) 100%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
  mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}

/* ═════════ 共用小元件 ═════════ */
.sub{color:var(--sub);font-size:var(--fs-s)}
.grow{flex:1}
.dot{width:8px;height:8px;border-radius:50%;flex:none;position:relative;background:var(--faint)}
.dot.ok{background:var(--ok);color:var(--ok)}.dot.warn{background:var(--warn);color:var(--warn)}.dot.bad{background:var(--bad);color:var(--bad)}
.dot.off{background:var(--faint)}
.dot.pulse::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid currentColor;opacity:0;animation:ring 2.8s ease-out infinite}
.dot.pulse.bad::after{animation-duration:var(--t-slow)}
@keyframes ring{0%{transform:scale(.55);opacity:.7}100%{transform:scale(1.9);opacity:0}}
.ico{width:30px;height:30px;border-radius:var(--r-sm);display:grid;place-items:center;flex:none;color:#fff;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 4px 10px -4px rgba(0,0,0,.35)}
.ico svg{width:17px;height:17px}
/* 一個概念＝一個圖示＋一個顏色，曲線、圖例、長條都用同一個顏色 */
:root{--c-cpu:#0a84ff;--c-mem:#bf5af2;--c-disk:#ff9f0a;--c-load:#30d158;--c-rx:#32c5e6;--c-tx:#ff375f;
  --c-month:#ffcc00;--c-box:#5e5ce6;--c-bell:#ff453a;--c-info:#8e8e93}
.ico.cpu{background:linear-gradient(160deg,#5ac8fa,var(--c-cpu))}
.ico.mem{background:linear-gradient(160deg,#da8fff,var(--c-mem))}
.ico.disk{background:linear-gradient(160deg,#ffc04d,var(--c-disk))}
.ico.load{background:linear-gradient(160deg,#6ee68a,var(--c-load))}
.ico.down{background:linear-gradient(160deg,#7fe0f5,var(--c-rx))}
.ico.up{background:linear-gradient(160deg,#ff7a95,var(--c-tx))}
.ico.net{background:linear-gradient(135deg,var(--c-rx) 15%,var(--c-tx) 85%)}
.ico.trend{background:linear-gradient(135deg,var(--c-cpu) 15%,var(--c-mem) 85%)}
.ico.month{background:linear-gradient(160deg,#ffe066,#ffb300);color:#3a2a00}
.ico.box{background:linear-gradient(160deg,#8e8cff,var(--c-box))}
.ico.bell{background:linear-gradient(160deg,#ff7a70,var(--c-bell))}
.ico.info{background:linear-gradient(160deg,#aeaeb2,#636366)}
.ico.theme{background:var(--grad)}
.ico.sm{width:24px;height:24px;border-radius:var(--r-sm)}.ico.sm svg{width:14px;height:14px}
.flag{width:24px;height:18px;object-fit:cover;border-radius:var(--r-sm);flex:none;box-shadow:0 0 0 1px rgba(127,127,127,.25),0 3px 8px -3px rgba(0,0,0,.4)}
.emoji{font-size:var(--fs-xl);line-height:1}
.iconbtn{border:0;background:transparent;color:var(--sub);cursor:pointer;padding:6px;border-radius:var(--r-md);display:inline-grid;place-items:center;
  transition:background var(--t-fast),color var(--t-fast),transform var(--t-mid) var(--spring)}
.iconbtn:hover{background:var(--track);color:var(--text)}.iconbtn:active{transform:scale(.86)}
.iconbtn svg{width:16px;height:16px}
.cap{border:0;cursor:pointer;border-radius:var(--r-pill);padding:9px 16px;font-size:var(--fs-m);font-weight:700;display:inline-flex;align-items:center;gap:7px;
  transition:transform var(--t-mid) var(--spring)}
.cap svg{width:16px;height:16px}.cap:active{transform:scale(.93)}
.ubtn{border:0;cursor:pointer;border-radius:var(--r-pill);padding:10px 17px;font-size:var(--fs-m);font-weight:800;color:#fff;background:var(--grad);
  display:inline-flex;align-items:center;gap:7px;letter-spacing:.2px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 10px 24px -10px var(--a2);transition:transform var(--t-mid) var(--spring),opacity var(--t-mid),filter var(--t-mid)}
.ubtn:hover{filter:brightness(1.06)}.ubtn:active{transform:scale(.94)}.ubtn[disabled]{opacity:.5;cursor:default;filter:saturate(.7)}
.ubtn.ghost{background:var(--inset);color:var(--text);box-shadow:var(--ring)}
.spin{width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
@keyframes rise{from{opacity:0;transform:translateY(18px) scale(.975)}}
@keyframes fadeIn{from{opacity:0}}
@keyframes fadeOut{to{opacity:0}}

/* ═════════ 進度條 ═════════ */
.track{height:8px;background:var(--track);border-radius:var(--r-pill);overflow:hidden;contain:strict;width:100%}
.fill{height:100%;border-radius:var(--r-pill);background:var(--grad);position:relative;overflow:hidden;min-width:8px;
  transition:width var(--t-slow) var(--ease);animation:grow var(--t-slow) var(--ease) both;transform-origin:left}
.fill.w{background:linear-gradient(90deg,#fbbf24,#f97316)}.fill.b{background:linear-gradient(90deg,#fb7185,#e11d48)}
.fill::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);
  transform:translateX(-100%);animation:sweep 3s linear infinite}
@keyframes grow{from{transform:scaleX(0)}}
@keyframes sweep{to{transform:translateX(250%)}}

/* ═════════ 圖表 ═════════ */
.chart{width:100%;display:block;overflow:visible}
.gl{stroke:var(--line);stroke-width:1;vector-effect:non-scaling-stroke;stroke-dasharray:3 5}
.wait{display:grid;place-items:center;color:var(--sub);font-size:var(--fs-s)}
.xl{display:flex;justify-content:space-between;color:var(--faint);font-size:var(--fs-xs);margin-top:6px;font-weight:600}
.legend{display:flex;gap:14px;font-size:var(--fs-s);color:var(--sub);flex-wrap:wrap}
.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.legend b{color:var(--text);font-weight:800;margin-left:4px;display:inline-block;min-width:3.2em;font-variant-numeric:tabular-nums}
.legend b.num{min-width:5.8em}

/* ═════════ 頂部（手機） ═════════ */
.bar{position:sticky;top:0;z-index:5;margin:0 -16px;padding:calc(env(safe-area-inset-top) + 10px) 16px 10px;
  display:flex;align-items:center;gap:8px;transition:background var(--t-mid),box-shadow var(--t-mid)}
.scrolled .bar{background:var(--inset);-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);box-shadow:0 1px 0 var(--line)}
.bar .mini{font-weight:800;font-size:var(--fs-l);opacity:0;transform:translateY(6px);transition:var(--t-mid) var(--ease)}
.scrolled .bar .mini{opacity:1;transform:none}
.hero{padding:4px 2px 18px;animation:rise var(--t-slow) var(--ease) both}
.hello{font-size:var(--fs-l);color:var(--sub);font-weight:700}
.hero h1{font-size:var(--fs-2xl);font-weight:900;letter-spacing:.2px;line-height:1.2;margin-top:2px}
.hero h1 em{font-style:normal;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.meta{color:var(--faint);font-size:var(--fs-s);margin-top:6px;display:flex;align-items:center;gap:6px;font-weight:600}
.live{width:6px;height:6px;border-radius:50%;background:var(--ok);position:relative;flex:none}
.live::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--ok);animation:live 2.4s ease-out infinite}
.live.off{background:var(--faint);animation:none}
@keyframes live{from{transform:scale(1);opacity:.6}to{transform:scale(3.2);opacity:0}}
.live.off::after{display:none}

/* ═════════ 摘要膠囊 ═════════ */
.summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.pill{border:0;border-radius:var(--r-pill);padding:8px 14px 8px 12px;font-size:var(--fs-m);display:flex;align-items:center;gap:8px;font-weight:700;
  transition:transform var(--t-mid) var(--spring),opacity var(--t-mid)}
.pill[data-filter]{cursor:pointer}.pill[data-filter]:active{transform:scale(.93)}
.pill b{font-weight:900}
.pill{transition:transform var(--t-mid) var(--spring),opacity var(--t-mid) var(--ease),box-shadow var(--t-mid) var(--ease)}
.pill b{transition:color var(--t-mid)}
.summary{position:relative}
.summary.filtering .pill{opacity:.5}
.summary.filtering .pill.on{opacity:1}
.pill.on.ok b,.pill.on.ok{color:var(--ok)}.pill.on.warn,.pill.on.warn b{color:var(--warn)}.pill.on.bad,.pill.on.bad b{color:var(--bad)}
.pill{transition:transform var(--t-mid) var(--spring),opacity var(--t-mid) var(--ease),color var(--t-mid)}
/* 會在三個按鈕之間滑動的光圈 */
.pind{--st:var(--ok);position:absolute;left:0;top:0;width:0;height:0;border-radius:var(--r-pill);pointer-events:none;z-index:2;opacity:0;
  background:color-mix(in srgb,var(--st) 14%,transparent);
  box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--st) 80%,transparent),0 0 20px -3px color-mix(in srgb,var(--st) 70%,transparent);
  transition:transform var(--t-slow) var(--spring),width var(--t-slow) var(--spring),opacity var(--t-mid),background var(--t-mid),box-shadow var(--t-mid)}
.pind.warn{--st:var(--warn)}.pind.bad{--st:var(--bad)}
.pind.show{opacity:1}
.pind.noanim{transition:none}
.empty{text-align:center;color:var(--sub);padding:50px 0;font-size:var(--fs-m);grid-column:1/-1}

/* ═════════ 卡片（手機） ═════════ */
.grid{display:grid;gap:var(--gap);grid-template-columns:repeat(auto-fill,minmax(310px,1fr))}
.card{border-radius:var(--r-xl);padding:var(--pad);animation:rise var(--t-slow) var(--ease) both;animation-delay:calc(var(--i,0) * 90ms)}
.card.bad,.card.warn{--sc:var(--bad);--hi1:color-mix(in srgb,var(--sc) 95%,transparent);--hi2:color-mix(in srgb,var(--sc) 50%,transparent);
  --hi3:color-mix(in srgb,var(--sc) 28%,transparent);--hi4:color-mix(in srgb,var(--sc) 60%,transparent);box-shadow:0 0 44px -16px var(--sc),var(--shadow)}
.card.warn{--sc:var(--warn)}
.head{display:flex;align-items:center;gap:10px}
/* 狀態：國旗本身邊緣發光（綠＝正常、黃＝注意、紅＝異常），不加框 */
.avatar{--st:var(--ok);display:grid;place-items:center;flex:none;width:34px;height:34px}
.avatar.warn{--st:var(--warn)}.avatar.bad{--st:var(--bad)}
/* 發光貼著國旗本身：大小永遠吻合 */
.fw{position:relative;display:grid;place-items:center;border-radius:var(--r-sm);line-height:0}
.fw.round{border-radius:50%}
.fw::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  box-shadow:0 0 0 1px color-mix(in srgb,var(--st) 70%,transparent),0 0 10px 1px color-mix(in srgb,var(--st) 50%,transparent),0 0 22px 2px color-mix(in srgb,var(--st) 22%,transparent);
  opacity:.5;animation:glow 3.6s ease-in-out infinite;will-change:opacity}
.avatar.bad .fw::after{animation-duration:var(--t-slow)}
@keyframes glow{50%{opacity:1}}
.avatar .flag{width:30px;height:22px;border-radius:var(--r-sm);box-shadow:0 1px 3px rgba(0,0,0,.25)}
.avatar .emoji{display:grid;place-items:center;width:30px;height:22px;font-size:var(--fs-xl);border-radius:var(--r-sm)}
.avatar .letter{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:var(--fs-m);line-height:1;color:var(--st);
  background:color-mix(in srgb,var(--st) 16%,transparent)}
/* 大標題旁的狀態標籤 */
.dsub{display:flex;align-items:center;flex-wrap:wrap;gap:0 6px}
.stx{display:inline-flex;align-items:center;gap:7px;font-weight:700;line-height:1}
.stx .dot{width:7px;height:7px;flex:none}
.stx.warn{color:var(--warn)}.stx.bad{color:var(--bad)}
.stchip{--st:var(--ok);display:inline-flex;align-items:center;gap:7px;padding:6px 13px 6px 11px;border-radius:var(--r-pill);font-size:var(--fs-s);font-weight:800;
  color:var(--st);background:color-mix(in srgb,var(--st) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--st) 35%,transparent);white-space:nowrap}
.stchip.warn{--st:var(--warn)}.stchip.bad{--st:var(--bad)}
.stchip .dot{background:var(--st);color:var(--st)}
.head .nm{min-width:0;flex:1}
.head h2{font-size:var(--fs-xl);font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.25;display:flex;align-items:center;gap:4px}
.head h2 span{overflow:hidden;text-overflow:ellipsis}
.head .sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.uptime{font-size:var(--fs-xs);font-weight:700;color:var(--sub);background:var(--track);border-radius:var(--r-pill);padding:4px 10px;white-space:nowrap}
.alerts{margin:14px 0 0;display:flex;flex-direction:column;gap:6px}
.alerts:empty{display:none}
.alert{font-size:var(--fs-m);font-weight:700;padding:9px 12px;border-radius:var(--r-md);display:flex;align-items:center;gap:9px;animation:rise var(--t-mid) var(--ease) both}
.alert svg{width:16px;height:16px;flex:none}
.alert.bad{background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad)}
.alert.warn{background:color-mix(in srgb,var(--warn) 14%,transparent);color:var(--warn)}
.metrics{margin-top:16px;display:flex;flex-direction:column;gap:13px}
.metric{display:grid;grid-template-columns:auto 1fr;gap:4px 11px;align-items:center}
.metric .ico{grid-row:span 2}
.metric .row{display:flex;justify-content:space-between;align-items:baseline;font-size:var(--fs-m);font-weight:700}
.metric .row b{font-size:var(--fs-l);font-weight:900;min-width:3.6ch;text-align:right;font-variant-numeric:tabular-nums}
.metric .row b small{font-size:var(--fs-s);opacity:.6;margin-left:1px}
.metric .row .sub{font-weight:600;margin-left:6px;font-size:var(--fs-s)}
.spark{margin-top:16px;padding:12px 12px 6px;border-radius:var(--r-lg);background:var(--inset);box-shadow:var(--ring)}
.spark .lbl{display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--sub);margin-bottom:6px;font-weight:700}
.spark .lbl i{display:inline-block;width:7px;height:7px;border-radius:50%;margin:0 4px 0 9px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-top:12px}
.stat{border-radius:var(--r-lg);padding:10px 11px;background:var(--inset);box-shadow:var(--ring);display:flex;flex-direction:column;gap:6px}
.stat .k{display:flex;align-items:center;gap:7px;color:var(--sub);font-size:var(--fs-xs);font-weight:700}
.stat .v{font-size:var(--fs-l);font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.more{margin-top:14px;border-top:1px solid var(--line);padding-top:8px}
.more-head{width:100%;font-size:var(--fs-m);color:var(--sub);background:none;border:0;cursor:pointer;padding:6px 0;font-weight:700;
  display:flex;align-items:center;gap:10px;text-align:left}
.more-head b{color:var(--bad);font-weight:800}
.chev{width:18px;height:18px;transition:transform var(--t-mid) var(--ease);margin-left:auto}
.more.open .chev{transform:rotate(180deg)}
.collapse{display:grid;grid-template-rows:0fr;transition:grid-template-rows var(--t-slow) var(--ease)}
.more.open .collapse{grid-template-rows:1fr}
.collapse>div{overflow:hidden}
.list{display:flex;flex-direction:column;gap:2px;padding-top:6px}
.item{display:flex;align-items:center;gap:10px;font-size:var(--fs-m);padding:7px 4px;border-radius:var(--r-md);font-weight:600;
  opacity:0;transform:translateY(-4px);transition:opacity var(--t-mid),transform var(--t-mid) var(--ease),background var(--t-fast)}
.more.open .item,.tbl .item{opacity:1;transform:none}
.item:hover{background:var(--track)}
.item .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .tag{flex:none}
.grp{display:flex;align-items:center;gap:8px;font-size:var(--fs-xs);font-weight:800;color:var(--sub);letter-spacing:.3px;padding:10px 4px 2px;
  opacity:0;transition:opacity var(--t-mid)}
.grp span{margin-left:auto;font-weight:700;color:var(--faint)}
.more.open .grp,.tbl .grp{opacity:1}
.tbl .grp:first-child,.list .grp:first-child{padding-top:2px}
.tag{color:var(--sub);font-size:var(--fs-xs);white-space:nowrap;font-weight:700;padding:3px 8px;border-radius:var(--r-pill);background:var(--track)}
.foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;border-top:1px solid var(--line);padding-top:14px}
.foot .sub{font-weight:600;line-height:1.6}
.offline{display:flex;align-items:center;gap:12px;margin-top:14px;padding:14px;border-radius:var(--r-lg);background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--bad);font-weight:700;font-size:var(--fs-m)}
.offline svg{width:22px;height:22px;flex:none}
.offline .sub{color:var(--sub);font-weight:600;margin-top:2px}

@media (max-width:700px){.grid{display:flex;flex-direction:column}}
/* 緊湊 */
[data-density="compact"]{--pad:14px;--gap:12px}
[data-density="compact"] .metrics{gap:9px;margin-top:12px}
[data-density="compact"] .ico{width:26px;height:26px;border-radius:var(--r-sm)}
[data-density="compact"] .spark,[data-density="compact"] .stats{margin-top:10px}
[data-density="compact"] .card{border-radius:var(--r-lg)}

/* ═════════ 電腦版 ═════════ */
@media (min-width:1024px){ body{padding:0 26px} .wrap{max-width:1480px} }
.dash.d{display:grid;grid-template-columns:304px minmax(0,1fr);gap:22px;padding:24px 0 34px;align-items:start}
.side{position:sticky;top:24px;border-radius:var(--r-xl);padding:20px 14px 14px;display:flex;flex-direction:column;gap:16px;
  max-height:calc(100vh - 48px);animation:rise var(--t-slow) var(--ease) both}
.brand{display:flex;align-items:center;gap:11px;padding:0 6px}
.brand svg{width:38px;height:38px;border-radius:var(--r-sm);flex:none;box-shadow:0 8px 20px -8px var(--a1)}
.brand h1{font-size:var(--fs-xl);font-weight:900;line-height:1.2}
.brand .meta{margin-top:1px}
.greet{padding:0 8px;font-size:var(--fs-m);font-weight:700;color:var(--sub);line-height:1.5}
.greet b{color:var(--text)}
.side .summary{margin:0;padding:0 4px;gap:6px}
.side .pill{padding:6px 11px 6px 10px;font-size:var(--fs-s);gap:6px}
.hosts{display:flex;flex-direction:column;gap:6px;overflow-x:hidden;overflow-y:auto;padding:2px;margin:0 -2px;scrollbar-width:none}
.hosts::-webkit-scrollbar{display:none}
.host{border:0;background:transparent;text-align:left;cursor:pointer;border-radius:var(--r-lg);padding:11px 12px;display:flex;flex-direction:column;gap:9px;
  transition:background var(--t-mid),box-shadow var(--t-mid),transform var(--t-mid) var(--spring)}
.host:hover{background:var(--track)}.host:active{transform:scale(.98)}
.host.on{background:var(--glass);position:relative;box-shadow:0 10px 26px -14px rgba(0,0,0,.5)}
.host .head{gap:11px}.host .avatar .flag{width:26px;height:19px;border-radius:var(--r-sm)}.host .fw{border-radius:var(--r-sm)}.host .fw.round{border-radius:50%}
.host h2{font-size:var(--fs-l)}
.minis{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.minis .k{display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--sub);margin-bottom:4px;font-weight:700}
.minis .k b{color:var(--text);font-weight:900}
.minis .track{height:5px}.minis .fill::after{display:none}
.side-foot{margin-top:auto;display:flex;align-items:center;gap:6px;padding:12px 4px 0;border-top:1px solid var(--line)}
.side-foot .sub{flex:1;padding-left:4px;font-weight:700}

.detail{display:flex;flex-direction:column;gap:18px;min-width:0}
.panel{border-radius:var(--r-xl);padding:20px 22px;animation:rise var(--t-slow) var(--ease) both;animation-delay:calc(var(--i,0) * 70ms)}
.dhead{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.dhead h2{font-size:var(--fs-2xl);font-weight:900}
.dhead .sub{font-size:var(--fs-m);margin-top:2px}
.dhead .act{display:flex;align-items:center;gap:14px;text-align:right;margin-left:auto}
.detail>.alerts{margin:0;flex-direction:row;flex-wrap:wrap}
.dhead .alerts{margin:10px 0 0;flex-direction:row;flex-wrap:wrap;gap:8px}
.dhead .alert{padding:6px 12px;font-size:var(--fs-s);border-radius:var(--r-md)}
.dhead .alert svg{width:15px;height:15px}
.detail .alert{padding:10px 15px}
.ph{display:flex;align-items:center;gap:11px;margin-bottom:14px;flex-wrap:wrap}
.ph h3{font-size:var(--fs-l);font-weight:800}
.ph .legend{margin-left:auto}
.gauges{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.gauge{border-radius:var(--r-xl);padding:18px 18px 20px;display:flex;flex-direction:column;align-items:center}
.gauge .ph{align-self:stretch;margin-bottom:6px}
.gwrap{position:relative;width:148px;height:148px}
.gwrap::before{content:"";position:absolute;inset:20px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--a2) 18%,transparent),transparent 70%)}
.gwrap svg{width:100%;height:100%;transform:rotate(-90deg);position:relative}
.rt{fill:none;stroke:var(--track);stroke-width:12}
.rv{fill:none;stroke:url(#rgN);stroke-width:12;stroke-linecap:round;
  transition:stroke-dashoffset var(--t-slow) var(--ease);animation:ringin var(--t-slow) var(--ease) both}
.rv.w{stroke:url(#rgW)}.rv.b{stroke:url(#rgB)}
@keyframes ringin{from{stroke-dashoffset:var(--c)}}
.gin{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.gin b{font-size:var(--fs-3xl);font-weight:900;line-height:1}
.gin b small{font-size:var(--fs-l);opacity:.5;margin-left:1px}
.gin>span{font-size:var(--fs-s);color:var(--sub);font-weight:700;margin-top:4px}
.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.cbox{height:170px}
.lower{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px;align-items:stretch}
/* 一頁看完：右邊撐滿整個螢幕高度，曲線和下面的清單自動分配剩下的空間；螢幕太矮時才往下捲 */
.dash.d .detail{min-height:calc(100vh - 58px)}
.dash.d .charts{flex:1 1 auto}
.dash.d .lower{flex:1.25 1 auto;min-height:250px}
.charts>.panel{display:flex;flex-direction:column}
.charts .cbox{flex:1 1 auto;height:auto;min-height:100px;position:relative}
.charts .cbox>*{position:absolute;inset:0;height:100%!important;width:100%}
.charts .cbox>.yax{pointer-events:none;left:auto;width:var(--yw)}
.yax span{position:absolute;right:0;transform:translateY(-50%);font-size:var(--fs-xs);font-weight:700;color:var(--faint);white-space:nowrap;
  font-variant-numeric:tabular-nums}
/* 有刻度的曲線：右邊留一條欄位放數字，線條不會蓋到字 */
.cbox:has(.yax){--yw:62px}
.charts .cbox:has(.yax)>svg.chart{right:auto;width:calc(100% - var(--yw) - 8px)}
.charts .panel:has(.yax) .xl{padding-right:70px}   /* 「現在」對齊曲線的右邊 */
.cbox{cursor:crosshair}
#ctip{position:fixed;z-index:60;pointer-events:none;min-width:130px;padding:9px 12px;border-radius:var(--r-md);font-size:var(--fs-s);font-weight:700;

  box-shadow:0 10px 30px -10px rgba(0,0,0,.35),var(--ring);opacity:0;transition:opacity var(--t-fast)}
#ctip .tt{color:var(--sub);font-size:var(--fs-xs);margin-bottom:5px}
#ctip .tr2{display:flex;align-items:center;gap:7px;line-height:1.7}
#ctip .tr2 i{width:7px;height:7px;border-radius:50%;flex:none}
#ctip .tr2 b{margin-left:auto;padding-left:14px;font-weight:900}
#cline{position:fixed;z-index:59;width:0;border-left:1px dashed var(--faint);pointer-events:none;opacity:0;transition:opacity var(--t-fast)}
#ctip.show,#cline.show{opacity:1}
.lower>.panel{display:flex;flex-direction:column;min-height:0}
.lower .trf{grid-column:span 2;container-type:inline-size}
.lower .evs,.lower .tbl{flex:1 1 0;min-height:60px;max-height:none;overflow-y:auto;overflow-x:hidden}
.lower .tbl{grid-template-columns:minmax(0,1fr);align-content:start;margin:-6px -6px 0;padding:6px 6px 10px}
.tgrid{display:grid;gap:4px 26px}
.lower .trf .tgrid{flex:1 1 auto}
.tr{display:flex;flex-direction:column;justify-content:flex-end}
@container (min-width:360px){.tgrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.tr .bars{flex:1 1 0;height:auto;min-height:84px}}
/* 螢幕比較矮：卡片收緊一點，盡量一頁放得下 */
@media (min-width:1024px) and (max-height:1000px){
  .dash.d .detail{gap:14px}.charts,.lower,.gauges{gap:14px}
  .dhead{padding-top:16px;padding-bottom:16px}
  .gauge{padding:14px 16px 16px}.gauge .ph{margin-bottom:2px}
  .gwrap{width:120px;height:120px}.gin b{font-size:var(--fs-2xl)}.gin b small{font-size:var(--fs-m)}
  .charts .ph,.lower .ph{margin-bottom:10px}
  .dash.d .lower{min-height:230px}
}
.gauges{grid-template-columns:repeat(4,minmax(0,1fr))}
.sysp{display:flex;flex-direction:column;min-height:0;border-radius:var(--r-xl);padding:18px 18px 16px}
.sysp .ph{margin-bottom:10px}
.sysp .kv{gap:7px 12px;font-size:var(--fs-s);flex:1 1 0;min-height:0;overflow-y:auto;align-content:start;margin:-4px -2px 0;padding:4px 2px 8px}
.facts2{display:flex;flex-direction:column;gap:10px;flex:1 1 auto;justify-content:center;min-height:0}
.fr{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;column-gap:8px;row-gap:4px}
.fr .k{font-size:var(--fs-xs);color:var(--sub);font-weight:800}
.fr b{font-size:var(--fs-l);font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.fr b small{font-size:var(--fs-xs);color:var(--sub);font-weight:700}
.fr b.ok{color:var(--ok)}.fr b.warn{color:var(--warn)}.fr b.bad{color:var(--bad)}
.fr .d{font-size:var(--fs-xs);color:var(--sub);font-weight:700;white-space:nowrap;text-align:right}
.fr .d.warn{color:var(--warn)}
.fr .org{grid-column:2/-1;text-align:left;margin-top:-4px;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;min-width:0}
.fr .org .on2{overflow:hidden;text-overflow:ellipsis}
.v6{display:inline-flex;align-items:center;gap:5px;flex:none}
.v6 .ld{width:6px;height:6px}
.v6.warn{color:var(--warn)}
.v6.a{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;display:block;cursor:pointer;color:var(--text);font-variant-numeric:tabular-nums}
.v6.a + .on2{display:none}
.lbar{grid-column:2/-1;height:4px;border-radius:var(--r-pill);background:var(--track);overflow:hidden}
.lbar i{display:block;height:100%;border-radius:inherit;background:var(--ok);transition:width var(--t-slow) var(--ease),background var(--t-mid)}
.lbar i.warn{background:var(--warn)}.lbar i.bad{background:var(--bad)}
.ipb{grid-column:2/-1;justify-self:start;font-variant-numeric:tabular-nums;cursor:pointer;filter:blur(6px);user-select:none;transition:filter var(--t-mid) var(--ease)}
.ipb.on{filter:none;user-select:text}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:14px 12px;flex:1 1 auto;align-content:center}
.facts>div{min-width:0}
.facts .k{font-size:var(--fs-xs);color:var(--sub);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.facts b{font-size:var(--fs-xl);font-weight:900;line-height:1.25;white-space:nowrap}
.facts b.warn{color:var(--warn)}.facts b.bad{color:var(--bad)}
.facts small{font-size:var(--fs-xs);color:var(--sub);font-weight:700;margin-left:3px}
.facts .wide{grid-column:1/-1}
.ipc{cursor:pointer;border-radius:var(--r-sm);margin:-2px -4px;padding:2px 4px;transition:background var(--t-fast),color var(--t-fast)}
.ipc:hover{background:var(--track);color:var(--text)}
.fx{font-size:var(--fs-xs);color:var(--sub);font-weight:700;margin-top:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gauges>.sysp{min-height:100%}
/* 側邊欄填滿整個高度 */
.dash.d .side{height:auto}
.hosts{flex:0 1 auto;min-height:0}
.ovw{margin-top:0;border-radius:var(--r-lg);padding:14px;background:var(--inset);box-shadow:var(--ring)}
.ovw h4{font-size:var(--fs-s);font-weight:800;color:var(--sub);letter-spacing:.5px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.ovg{display:grid;grid-template-columns:1fr 1fr;gap:12px 10px}
.ovg .k{font-size:var(--fs-xs);color:var(--sub);font-weight:700}
.ovg b{display:block;font-size:var(--fs-xl);font-weight:900;line-height:1.3;white-space:nowrap}
.ovg b small{font-size:var(--fs-xs);opacity:.55;margin-left:1px}
.tqs{display:flex;flex-direction:column;gap:12px}
.tq .r{display:flex;align-items:baseline;gap:8px;font-size:var(--fs-s);font-weight:800}
.tq .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tq .r b{font-size:var(--fs-m);font-weight:900}
.tq .track{height:5px;margin:5px 0 4px}
.tq .s{font-size:var(--fs-xs);color:var(--sub);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tq .s.warn{color:var(--warn)}
.tqw+.bar2{margin-top:14px}
.ovw .bar2{display:flex;height:6px;border-radius:var(--r-sm);overflow:hidden;margin-top:12px;background:var(--track)}
.ovw .bar2 i{display:block;height:100%;transition:width var(--t-slow) var(--ease)}
.ovw .cap2{display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--sub);font-weight:700;margin-top:6px}
.side-foot{margin-top:0}
.side .empty{padding:18px 0;font-size:var(--fs-m)}
/* 事件紀錄 */
/* 曲線範圍切換 */
.rng{display:inline-flex;background:var(--track);border-radius:var(--r-sm);padding:2px;gap:1px;position:relative;isolation:isolate}
.rng button{border:0;background:transparent;cursor:pointer;border-radius:var(--r-sm);padding:3px 9px;font-size:var(--fs-xs);font-weight:800;color:var(--sub);transition:color var(--t-mid)}
.rng button.on{color:var(--text);background:var(--glass);box-shadow:var(--sh-thumb)}
[data-mode="light"] .rng button.on{background:#fff}
.ph .rng{margin-left:10px}
.spark .lbl{align-items:center}
/* 本月流量 */
.trf .big{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.trf .big b{font-size:var(--fs-2xl);font-weight:900;line-height:1.1}
.trf .big span{color:var(--sub);font-weight:700;font-size:var(--fs-m)}
.trf .track{height:10px;margin:12px 0 8px}
.trf .rows{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;font-size:var(--fs-s);margin-top:12px}
.trf .rows .k{color:var(--sub);font-weight:700;font-size:var(--fs-xs)}
.trf .rows b{font-weight:800;font-size:var(--fs-m)}
.kd{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px}
.trf .note{font-size:var(--fs-xs);color:var(--faint);font-weight:600;margin-top:10px}
.bars{display:block;width:100%;height:64px;margin-top:14px;overflow:visible}
.bars rect{transition:height var(--t-slow) var(--ease),y var(--t-slow) var(--ease)}
.tline{margin-top:12px;padding:12px;border-radius:var(--r-lg);background:var(--inset);box-shadow:var(--ring);cursor:pointer;
  display:flex;flex-direction:column;gap:8px;transition:transform var(--t-mid) var(--spring)}
.tline:active{transform:scale(.98)}
.tline .r1{display:flex;align-items:center;gap:9px;font-size:var(--fs-m);font-weight:700}
.tline .r1 b{margin-left:auto;font-size:var(--fs-l);font-weight:900}
.tline .r1 b small{font-size:var(--fs-xs);color:var(--sub);font-weight:700;margin-left:3px}
.tline .r2{display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--sub);font-weight:700}
.tline .track{height:6px}
.dialog .form{display:flex;flex-direction:column;gap:12px;margin-top:16px;text-align:left}
.dialog .form label{font-size:var(--fs-s);font-weight:800;color:var(--sub);display:flex;flex-direction:column;gap:6px}
.dialog .form .field{margin:0;text-align:left;font-size:var(--fs-l);padding:11px 14px}
.dialog .form select.field{appearance:none;-webkit-appearance:none}
.dialog .form .seg{width:100%}.dialog .form .seg button{flex:1;padding:7px 4px}
.dialog .form .seg button.on{background:var(--glass);color:var(--text);box-shadow:var(--sh-thumb)}
[data-mode="light"] .dialog .form .seg button.on{background:#fff}
.dialog .form small{font-weight:600;color:var(--faint);font-size:var(--fs-xs);line-height:1.5}
.dialog .form small b{color:var(--sub)}
.dialog .form .lbl{font-size:var(--fs-s);font-weight:800;color:var(--sub);display:flex;flex-direction:column;gap:6px}
.tgd{max-width:400px}
.tgd .find{align-self:flex-start;padding:8px 14px;font-size:var(--fs-s);display:inline-flex;align-items:center;gap:6px}
.tgd .find svg{width:14px;height:14px}
.tgd .chats{display:flex;flex-wrap:wrap;gap:6px}
.tgd .chats:empty{display:none}
.tgd .seg.keep{display:flex;width:100%;background:var(--track);border-radius:var(--r-md);padding:3px;gap:2px}
.tgd .seg.keep button{flex:1;border:0;background:none;cursor:pointer;border-radius:var(--r-sm);padding:7px 2px;font-size:var(--fs-s);font-weight:800;color:var(--sub);transition:background var(--t-fast),color var(--t-fast),box-shadow var(--t-fast)}
.tgd .chats button{border:0;cursor:pointer;border-radius:var(--r-pill);padding:7px 12px;font-size:var(--fs-s);font-weight:800;color:var(--text);
  background:var(--inset);box-shadow:var(--ring);transition:background var(--t-fast),box-shadow var(--t-fast),color var(--t-fast)}
.tgd .chats button.on{color:#fff;background:var(--grad);box-shadow:none}
.tgd .msg{min-height:18px;font-size:var(--fs-s);font-weight:700;line-height:1.5;color:var(--sub)}
.tgd .msg.bad{color:var(--bad)}.tgd .msg.ok{color:var(--ok)}
.dialog .btns.three{grid-template-columns:1fr 1fr 1.3fr}
.dialog .btns .spin{width:13px;height:13px;margin-right:6px}
.linkbtn{background:none;border:0;cursor:pointer;color:var(--bad);font-weight:800;font-size:var(--fs-s);margin-top:14px;padding:4px 8px}
.cchip{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:4px 9px 4px 8px;border-radius:var(--r-pill);
  background:var(--inset);box-shadow:var(--ring);color:var(--text);text-decoration:none;font-size:var(--fs-xs);font-weight:800;
  transition:background var(--t-fast),transform var(--t-mid) var(--spring)}
.cchip:hover{background:var(--track)}.cchip:active{transform:scale(.94)}
.cchip svg{width:13px;height:13px;flex:none}.cchip svg:first-child{color:var(--a1)}.cchip svg:last-child{color:var(--faint)}
.cchip.warn span{color:var(--warn)}.cchip.down{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bad) 60%,transparent)}.cchip.down svg:first-child{color:var(--bad)}
.cloudm{display:flex;align-items:center;gap:9px;margin-top:12px;padding:11px 13px;border-radius:var(--r-md);background:var(--inset);box-shadow:var(--ring);
  color:var(--text);text-decoration:none;font-size:var(--fs-m);font-weight:700}
.cloudm svg{width:17px;height:17px;flex:none}.cloudm svg:first-child{color:var(--a1)}.cloudm svg:last-child{color:var(--faint);width:14px;height:14px}
.cloudm b{margin-left:auto;font-weight:900}.cloudm b small{color:var(--sub);font-weight:700;font-size:var(--fs-xs)}
a.plink,button.plink{color:var(--sub);text-decoration:none}
.hostd{max-width:420px}
.lrows{display:flex;flex-direction:column;gap:8px}
.lrow{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.6fr) auto;gap:6px;align-items:center}
.dialog .form .lrow .field{font-size:var(--fs-m);padding:10px 11px}
.lrow .iconbtn{width:30px;height:30px}
.addl{align-self:flex-start;padding:7px 14px;font-size:var(--fs-s)}
.lmenu{position:fixed;z-index:70;min-width:170px;max-width:280px;padding:6px;border-radius:var(--r-md);display:flex;flex-direction:column;
  box-shadow:var(--sh-pop)}
.lmenu a{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:var(--r-md);color:var(--text);text-decoration:none;font-size:var(--fs-m);font-weight:700;transition:background var(--t-fast)}
.lmenu a:hover{background:var(--track)}
.lmenu a svg{width:14px;height:14px;color:var(--faint);flex:none;margin-left:auto}
.lmenu a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;flex-direction:column;min-width:0}
.lmenu a small{font-size:var(--fs-xs);color:var(--sub);font-weight:600}
.ld{width:8px;height:8px;border-radius:50%;flex:none;background:var(--faint)}.ld.ok{background:var(--ok)}.ld.bad{background:var(--bad)}
.plink{position:relative}
.plink.down::after,.hasnew::after{content:"";position:absolute;top:3px;right:3px;width:7px;height:7px;border-radius:50%;background:var(--bad);box-shadow:0 0 0 2px var(--bg)}
.hasnew{position:relative}.hasnew::after{background:var(--a1)}
.linkish{border:0;background:none;color:var(--a1);font:inherit;font-size:var(--fs-s);font-weight:800;cursor:pointer;float:right;padding:0}
.linkish:disabled{color:var(--faint)}
.selfrow{align-items:flex-start}
.selfrow .lab{flex:1;min-width:0}
.selfrow .new{color:var(--a1);font-weight:800}.selfrow .warn{color:var(--warn)}
.selfrow .spin{width:11px;height:11px;margin-right:4px;vertical-align:-1px}
.cl2{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
.cl2.first{border-top:0;padding-top:0;margin-top:8px}
.selfrow .hn{display:block;font-weight:900}
.cl2>span{flex:1;min-width:0;display:block;font-size:var(--fs-m);font-weight:700}
.cl2>span svg{width:14px;height:14px;color:var(--a1);vertical-align:-2px;margin-right:5px;display:inline}
.cl2 small{display:block;font-size:var(--fs-xs);color:var(--sub);font-weight:600}
.chg{margin:6px 0 0;padding-left:16px;font-size:var(--fs-xs);color:var(--sub);font-weight:600;line-height:1.55}
.ubtn.sm{padding:7px 14px;font-size:var(--fs-s);flex:none}
a.plink:hover{color:var(--a1)}
.optbtn{width:100%;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.optbtn .lab{flex:1}
.optbtn .chev{color:var(--faint);display:flex;transform:rotate(-90deg)}
.optbtn .chev svg{width:16px;height:16px}
.tgst.on{color:var(--ok)!important}
.evs{display:flex;flex-direction:column;gap:2px;max-height:330px;overflow-x:hidden;overflow-y:auto;margin:-8px -6px 0;padding:8px 6px 14px}
/* 有最大高度的清單：裡面的項目不能被擠扁（不然展開動畫會卡在一半再彈回來） */
.evs>*,.hosts>*,.list>*,.alerts>*{flex-shrink:0}
/* 可以再捲的那一邊才淡出 */
.ft,.fb,.ft.fb{--t:0px;--b:0px;-webkit-mask:linear-gradient(transparent,#000 var(--t),#000 calc(100% - var(--b)),transparent);mask:linear-gradient(transparent,#000 var(--t),#000 calc(100% - var(--b)),transparent)}
.ft{--t:22px}.fb{--b:30px}
.ev{animation:rise var(--t-mid) var(--ease) both;display:flex;gap:11px;align-items:flex-start;padding:8px 6px;border-radius:var(--r-md);font-size:var(--fs-m);font-weight:700}
.ev:hover{background:var(--track)}
.ev .dot{margin-top:6px}
.ev .dot.info{background:var(--a1)}
.ev .sub{font-size:var(--fs-xs);margin-top:1px}
.calm{color:var(--sub);font-size:var(--fs-m);font-weight:600;padding:20px 0;text-align:center}
.tbl{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:2px 16px}
.tbl .item{padding:8px 10px}
.kv{display:grid;grid-template-columns:auto 1fr;gap:11px 18px;font-size:var(--fs-m);margin:0}
.kv dt{color:var(--sub);font-weight:600}.kv dd{text-align:right;margin:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bigoff{text-align:center;padding:60px 20px;color:var(--sub)}
.bigoff b{display:block;font-size:var(--fs-xl);color:var(--text);margin-bottom:6px}
@media (max-width:1300px){.gwrap{width:118px;height:118px}.gin b{font-size:var(--fs-2xl)}}
@media (max-width:1180px){.gauges{grid-template-columns:repeat(2,minmax(0,1fr))!important}.charts{grid-template-columns:1fr!important}}


/* ═════════ 骨架（第一次載入） ═════════ */
.skel{border-radius:var(--r-xl);height:420px;overflow:hidden}
.skel::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.08) 50%,transparent 70%);
  animation:shim 1.6s linear infinite;background-size:200% 100%}
.skel::after{padding:0;-webkit-mask:none;mask:none}
@keyframes shim{from{background-position:150% 0}to{background-position:-50% 0}}

/* ═════════ 登入 ═════════ */
.login{max-width:360px;margin:16vh auto 0;text-align:center;border-radius:var(--r-xl);padding:32px 24px 26px;animation:rise var(--t-slow) var(--ease) both}
.login .logo{display:block;width:68px;height:68px;border-radius:var(--r-md);margin:0 auto 14px;box-shadow:var(--sh-accent)}
.login h1{font-size:var(--fs-2xl);font-weight:900}
.login p{color:var(--sub);font-size:var(--fs-m);margin-top:4px;font-weight:600}
.field{width:100%;font:inherit;font-size:var(--fs-l);padding:13px 16px;border-radius:var(--r-md);border:0;color:var(--text);
  background:var(--inset);box-shadow:var(--ring);outline:none;transition:box-shadow var(--t-fast)}
.field:focus{box-shadow:inset 0 0 0 2px var(--accent)}
.login .field{margin:20px 0 8px}
.login .ubtn{width:100%;justify-content:center;padding:14px;font-size:var(--fs-l)}
.err{color:var(--bad);font-size:var(--fs-m);min-height:20px;font-weight:700}
.shake{animation:shake var(--t-mid)}
@keyframes shake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}

/* ═════════ 對話框、設定面板、通知 ═════════ */
.veil{position:fixed;inset:0;z-index:50;background:var(--veil);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn var(--t-mid) ease both}
.veil.closing{animation:fadeOut var(--t-mid) ease forwards;pointer-events:none}
.dialog{width:100%;max-width:360px;border-radius:var(--r-xl);padding:24px 22px 18px;text-align:center;animation:pop var(--t-mid) var(--spring) both}
.closing .dialog{animation:popOut var(--t-fast) var(--exit) forwards}
@keyframes popOut{to{opacity:0;transform:scale(.93) translateY(8px)}}
@keyframes pop{from{opacity:0;transform:scale(.9) translateY(10px)}}
.dialog .big{width:52px;height:52px;border-radius:var(--r-md);margin:0 auto 12px}
.dialog .big svg{width:26px;height:26px}
.dialog h3{font-size:var(--fs-xl);font-weight:900}
.dialog p{color:var(--sub);font-size:var(--fs-m);margin-top:6px;white-space:pre-line;font-weight:600}
.dialog .field{margin-top:16px;text-align:center}
.dialog .btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
.dialog .btns button{justify-content:center;padding:12px}

.veil.sheetv{align-items:flex-end;justify-content:flex-end;padding:0}
/* 面板本身不捲動（玻璃的光邊、反光才會固定在邊上），只有裡面的內容捲動 */
.sheet{width:100%;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;border-radius:var(--r-xl) var(--r-xl) 0 0;padding:10px 0 0;
  animation:slideup var(--t-slow) var(--ease) both;will-change:transform}
.sheet.ready{animation:none}
.closing .sheet{animation:sheetDown var(--t-mid) var(--exit) forwards}
.sheet.back{transition:transform var(--t-mid) var(--spring)}
@keyframes slideup{from{transform:translateY(100%)}}
@keyframes sheetDown{to{transform:translateY(105%)}}
@media (min-width:1024px){
  .veil.sheetv{align-items:stretch;padding:16px}
  .sheet{width:400px;max-height:none;border-radius:var(--r-xl);padding:10px 0 0;animation-name:slidein}
  .sheetv .sbody{padding:0 22px 22px}
  .sheetv .sheet .top{padding:0 22px 10px}
  .closing .sheet{animation-name:sheetRight}
  .grab{visibility:hidden}
  @keyframes slidein{from{transform:translateX(110%)}}
  @keyframes sheetRight{to{transform:translateX(110%)}}
}
.grab{width:40px;height:5px;border-radius:var(--r-sm);background:var(--faint);margin:2px auto 10px;touch-action:none;cursor:grab}
.sheet .top{touch-action:none}
.sheet .top{display:flex;align-items:center;justify-content:space-between;margin:6px 0 0;padding:0 18px 10px;flex:none;
  box-shadow:0 1px 0 transparent;transition:box-shadow var(--t-mid)}
.sheet .top.under{box-shadow:0 1px 0 var(--line)}
.sbody{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:0 18px calc(env(safe-area-inset-bottom) + 22px)}
.grab{flex:none}
.sheet h3{font-size:var(--fs-xl);font-weight:900}
.sec{margin-top:18px}
.sec>h4{font-size:var(--fs-s);font-weight:800;color:var(--sub);letter-spacing:.5px;margin:0 6px 8px}
.group{border-radius:var(--r-lg);background:var(--inset);box-shadow:var(--ring);overflow:hidden}
.opt{display:flex;align-items:center;gap:12px;padding:12px 14px;font-size:var(--fs-m);font-weight:700;min-height:52px}
.opt+.opt{border-top:1px solid var(--line)}
.opt .lab{flex:1}
.opt .lab small{display:block;font-size:var(--fs-xs);color:var(--sub);font-weight:600}
.seg{display:flex;background:var(--track);border-radius:var(--r-md);padding:3px;gap:2px;position:relative;isolation:isolate}
.seg .ind{position:absolute;top:3px;bottom:3px;left:0;width:0;border-radius:var(--r-sm);z-index:-1;background:var(--glass);
  box-shadow:var(--sh-thumb);
  transition:transform var(--t-mid) var(--spring),width var(--t-mid) var(--spring)}
.seg.noanim .ind{transition:none}
[data-mode="light"] .seg .ind{background:#fff}
.seg button{border:0;background:transparent;cursor:pointer;border-radius:var(--r-sm);padding:6px 11px;font-size:var(--fs-s);font-weight:800;color:var(--sub);
  transition:color var(--t-mid),transform var(--t-mid) var(--spring)}
.seg button:active{transform:scale(.92)}
.seg button.on{color:var(--text)}
.sw{display:flex;gap:10px;flex-wrap:wrap}
.flagsw span{position:absolute;inset:0;display:grid;place-items:center;font-size:var(--fs-xs);font-weight:900;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.sw button{width:28px;height:28px;border-radius:50%;border:0;cursor:pointer;position:relative;transition:transform var(--t-mid) var(--spring)}
.sw button:active{transform:scale(.85)}
.sw button::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2.5px solid var(--text);opacity:0;transform:scale(.7);
  transition:opacity var(--t-mid),transform var(--t-mid) var(--spring)}
.sw button.on::after{opacity:.85;transform:none}
.tog{appearance:none;-webkit-appearance:none;width:50px;height:30px;border-radius:var(--r-pill);background:var(--track);position:relative;cursor:pointer;flex:none;
  transition:background var(--t-mid);box-shadow:var(--ring)}
.tog::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;
  box-shadow:0 3px 8px rgba(0,0,0,.3);transition:transform var(--t-mid) var(--spring)}
.tog:checked{background:var(--ok)}.tog:checked::after{transform:translateX(20px)}
.slider{width:100%;display:flex;align-items:center;gap:10px;font-size:var(--fs-xs);color:var(--sub);font-weight:700}
.slider input{flex:1;accent-color:var(--a2)}
.reset{margin-top:20px;width:100%;justify-content:center}

.toasts{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 22px);transform:translateX(-50%);z-index:60;
  display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;width:max-content;max-width:92vw}
.toast{border-radius:var(--r-pill);padding:11px 18px 11px 14px;font-size:var(--fs-m);font-weight:700;display:flex;align-items:center;gap:9px;
  animation:toastin var(--t-slow) var(--spring) both}
.toast.out{animation:toastOut var(--t-mid) var(--exit) forwards}
@keyframes toastOut{to{opacity:0;transform:translateY(12px) scale(.94)}}
.toast svg{width:18px;height:18px;flex:none}
.toast.ok svg{color:var(--ok)}.toast.bad svg{color:var(--bad)}
@keyframes toastin{from{opacity:0;transform:translateY(16px) scale(.92)}}

::view-transition-old(root),::view-transition-new(root){animation-duration:var(--t-mid);animation-timing-function:var(--ease)}
/* ═════════ 啟動畫面 ═════════ */
body{overscroll-behavior-y:contain}
.booting #app{opacity:0}
#app{transition:opacity var(--t-mid) ease}
#splash{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;pointer-events:none}
#splash.out{animation:spOut var(--t-slow) var(--ease) forwards}
@keyframes spOut{to{opacity:0;transform:scale(1.08)}}
.sp-logo{position:relative;width:96px;height:96px;display:grid;place-items:center;animation:spIn var(--t-slow) var(--spring) both}
@keyframes spIn{from{opacity:0;transform:scale(.7)}}
.sp-logo svg{width:64px;height:64px;border-radius:var(--r-md);position:relative;z-index:1;box-shadow:var(--sh-accent)}
.sp-ring{position:absolute;inset:0;border-radius:50%;
  background:conic-gradient(from 0deg,transparent 0 55%,var(--a1) 80%,var(--a2) 100%);
  -webkit-mask:radial-gradient(circle,transparent 60%,#000 61%,#000 66%,transparent 67%);mask:radial-gradient(circle,transparent 60%,#000 61%,#000 66%,transparent 67%);
  animation:sp 1.1s linear infinite}
.sp-glow{position:absolute;inset:-30px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--a2) 35%,transparent),transparent 65%);
  animation:breathe 2.2s ease-in-out infinite}
@keyframes breathe{50%{opacity:.45;transform:scale(.92)}}
.sp-title{font-weight:900;font-size:var(--fs-xl);letter-spacing:.5px;animation:rise var(--t-slow) .1s var(--ease) both}
.sp-msg{font-size:var(--fs-m);font-weight:700;color:var(--sub);min-height:20px;animation:rise var(--t-slow) .2s var(--ease) both}
.sp-msg span{display:inline-block;animation:msgIn var(--t-mid) var(--ease) both}
@keyframes msgIn{from{opacity:0;transform:translateY(6px)}}

/* ═════════ 下拉重新整理 ═════════ */
#ptr{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 8px);z-index:30;width:40px;height:40px;margin-left:-20px;border-radius:50%;
  display:grid;place-items:center;color:var(--text);transform:translateY(-70px);opacity:0;pointer-events:none}
#ptr svg{width:19px;height:19px}
#ptr.back{transition:transform var(--t-mid) var(--spring),opacity var(--t-mid)}
#ptr.spin svg{animation:sp .8s linear infinite}
#ptr.done{color:var(--ok)}
.iconbtn.spinning svg{animation:sp .8s linear infinite}

/* ═════════ 捲軸 ═════════ */
/* 內部的捲動區塊不顯示捲軸（滾輪、手指一樣可以捲），動畫時就不會閃出拉條 */
.evs,.sbody,.hosts,.tbl,.list,.kv{scrollbar-width:none}
.evs::-webkit-scrollbar,.kv::-webkit-scrollbar,.sbody::-webkit-scrollbar,.hosts::-webkit-scrollbar,.tbl::-webkit-scrollbar,.list::-webkit-scrollbar{display:none}
/* 整個頁面：先保留捲軸的位置，內容變長變短時寬度不會跳；捲軸本身改成細細淡淡的 */
html{scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--text) 22%,transparent) transparent}
html::-webkit-scrollbar{width:8px}
html::-webkit-scrollbar-track{background:transparent}
html::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--text) 22%,transparent);border-radius:var(--r-sm);border:2px solid transparent;background-clip:padding-box}
/* ═════════ 流暢優先（手機預設） ═════════ */
[data-lite="on"] .aurora i{animation:none}
[data-lite="on"] .grain{display:none}
[data-lite="on"] .fill::after{display:none}
[data-lite="on"] .veil{-webkit-backdrop-filter:none;backdrop-filter:none}
[data-lite="on"] .glass,[data-lite="on"] .scrolled .bar{-webkit-backdrop-filter:none;backdrop-filter:none}
[data-lite="on"] .scrolled .bar{background:color-mix(in srgb,var(--bg) 90%,transparent)}
/* 浮在畫面上的小選單、提示框：跟著「玻璃效果」設定，但底下多墊一層，任何設定下字都看得清楚 */
.glass.pop{background:linear-gradient(var(--glass),var(--glass)),color-mix(in srgb,var(--bg) 68%,transparent)}
[data-lite="on"] .sheet,[data-lite="on"] .dialog,[data-lite="on"] .toast,[data-lite="on"] .pop{background:color-mix(in srgb,var(--bg) 92%,var(--glass))}
[data-lite="on"][data-mode="dark"] .sheet,[data-lite="on"][data-mode="dark"] .dialog,[data-lite="on"][data-mode="dark"] .toast,[data-lite="on"][data-mode="dark"] .pop{background:color-mix(in srgb,#1a1f2e 94%,var(--a2))}
[data-lite="on"] .card,[data-lite="on"] .panel{transform:translateZ(0)}
.xfade{position:fixed;inset:0;z-index:45;pointer-events:none;animation:fadeOut var(--t-mid) var(--ease) forwards}
/* ═════════ 無障礙／關閉動畫 ═════════ */
[data-motion="off"] *,[data-motion="off"] *::before,[data-motion="off"] *::after{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
@media (prefers-reduced-transparency:reduce){.glass,.scrolled .bar{background:var(--bg);-webkit-backdrop-filter:none;backdrop-filter:none}.aurora{display:none}}
</style>
</head>
<body>
<div class="bgfx"><div class="aurora"><i></i><i></i><i></i><i></i></div><div class="grain"></div></div>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="rgN" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--a1)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient>
<linearGradient id="rgW" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f97316"/></linearGradient>
<linearGradient id="rgB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#e11d48"/></linearGradient>
</defs></svg>
<div id="splash"><div class="sp-logo"><span class="sp-glow"></span><span class="sp-ring"></span><svg class="" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lbsp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--a1) 70%,#fff)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient><linearGradient id="lhsp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="lmsp"><rect width="512" height="512" fill="#fff"/><path d="M204 258l36 36 72-76" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="512" height="512" rx="115" fill="url(#lbsp)"/><rect width="512" height="512" rx="115" fill="url(#lhsp)"/><path d="M256 108 371 150c9 3 15 12 15 22v72c0 84-52 140-122 168-5 2-11 2-16 0-70-28-122-84-122-168v-72c0-10 6-19 15-22Z" fill="#fff" mask="url(#lmsp)" transform="translate(256 262) scale(.88) translate(-256 -258)"/></svg></div>
<div class="sp-title">VPS 哨兵</div><div class="sp-msg"><span>正在連線…</span></div></div>
<div id="ptr" class="glass"></div>
<div class="wrap" id="app"></div>
<div id="layer"></div>
<div class="toasts" id="toasts"></div>
<script>
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k) || ""; v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch(e){ return ""; } }
const KEY = "vps-sentinel-token";
function getTok(){ return store(KEY) || window._tok || ""; }
function setTok(t){ store(KEY, t); window._tok = t; }
const u0 = new URL(location.href);
if (u0.searchParams.get("t")) { setTok(u0.searchParams.get("t")); history.replaceState(null, "", "/"); }

/* ═════════ 圖示 ═════════ */
const P = {
  cpu:'<rect x="5" y="5" width="14" height="14" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  mem:'<rect x="2" y="6" width="20" height="11" rx="2"/><path d="M6 17v3M10 17v3M14 17v3M18 17v3M7 10v3M11 10v3M15 10v3"/>',
  disk:'<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>',
  down:'<path d="M12 4v15M18 13l-6 6-6-6"/>', up:'<path d="M12 20V5M6 11l6-6 6 6"/>',
  load:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  info:'<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4M12 8h.01"/>',
  gauge:'<path d="M12 14l3.5-3.5"/><path d="M3.3 17a9.5 9.5 0 1 1 17.4 0"/><circle cx="12" cy="14" r="1.6"/>',
  net:'<path d="M7 20V5M3 9l4-4 4 4"/><path d="M17 4v15M21 15l-4 4-4-4"/>',
  trend:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  month:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M8 17v-3M12 17v-5M16 17v-2"/>',
  bell:'<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  layers:'<path d="m12 2 9.5 5L12 12 2.5 7z"/><path d="m2.5 12 9.5 5 9.5-5"/><path d="m2.5 17 9.5 5 9.5-5"/>',
  flag:'<path d="M4 22V4"/><path d="M4 4h13l-2.5 4.5L17 13H4"/>',
  alert:'<circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  ext:'<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H10"/>',
  cloud:'<path d="M17.5 19a4.5 4.5 0 1 0-1.3-8.8A6 6 0 0 0 4.6 12.5 3.5 3.5 0 0 0 6.5 19Z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chev:'<path d="m6 9 6 6 6-6"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>',
  warn:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
  ok:'<circle cx="12" cy="12" r="9.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  upd:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  off:'<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M2 2l20 20"/>',
};
const I = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;

/* ═════════ 個人設定（存在這台裝置） ═════════ */
const DEF = {theme:"auto", accent:"blue", glass:50, bg:"aurora", motion:true, perf:"auto", density:"cozy", size:"m", refresh:5,
  show:{chart:true, net:true, items:true, info:true, flag:true, traffic:true}};
let PREF = (() => { try { const p = JSON.parse(store("vps-prefs") || "{}"); return {...DEF, ...p, show:{...DEF.show, ...(p.show||{})}}; } catch(e){ return JSON.parse(JSON.stringify(DEF)); } })();
const getP = k => k.split(".").reduce((o,x)=>o && o[x], PREF);
function setP(k, v){ const ks = k.split("."); let o = PREF; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; store("vps-prefs", JSON.stringify(PREF)); }
const DARKQ = matchMedia("(prefers-color-scheme: dark)");
const TOUCH = matchMedia("(pointer: coarse)");
let SLOW = false;   // 實測發現這台裝置畫不動完整效果
try { SLOW = sessionStorage.getItem("vps-slow") === "1"; } catch(e) {}
function isLite(){ return PREF.perf === "lite" || (PREF.perf === "auto" && (TOUCH.matches || innerWidth < 1024 || SLOW)); }
/* 「自動」模式：開啟後量 1.2 秒的實際順暢度，畫不動就自動改用輕量效果 */
function probePerf(){
  if (PREF.perf !== "auto" || isLite() || !PREF.motion) return;
  let n = 0, t0 = 0;
  const f = t => {
    if (!t0) t0 = t;
    n++;
    if (t - t0 < 1200) return requestAnimationFrame(f);
    const fps = n * 1000 / (t - t0);
    if (fps < 40) {
      SLOW = true; try { sessionStorage.setItem("vps-slow", "1"); } catch(e) {}
      applyPrefs();
    }
  };
  setTimeout(() => requestAnimationFrame(f), 1500);     // 等進場動畫跑完再量
}
/* 各國國旗配色：[亮色, 主色, 輔助色] */
const FLAGPAL = {
  JP:["#ff7a8a","#d3002d","#ffb3c1"], HK:["#ff7b6e","#de2910","#ffc4bd"], SG:["#ff6b7a","#ef3340","#ffc2c9"],
  TW:["#ff5a5a","#1f3fbf","#6b8cff"], CN:["#ffde00","#de2910","#ff8a3d"], KR:["#5b9bff","#cd2e3a","#0047a0"],
  US:["#6b8cff","#b22234","#3c3b6e"], GB:["#5b7cff","#c8102e","#012169"], CA:["#ff6b6b","#d80621","#ffb3b3"],
  AU:["#5b7cff","#e4002b","#012169"], NZ:["#5b7cff","#c8102e","#012169"], DE:["#ffce00","#dd0000","#ff8a00"],
  FR:["#5b8cff","#ef4135","#0055a4"], NL:["#ff8a3d","#21468b","#ae1c28"], BE:["#fdda24","#ef3340","#ff9a3d"],
  LU:["#00a1de","#ef3340","#7fd3f5"], CH:["#ff6b5e","#da291c","#ffc2bd"], AT:["#ff6b7a","#ed2939","#ffc2c9"],
  IT:["#4ccf86","#ce2b37","#009246"], ES:["#f1bf00","#aa151b","#ff7a45"], PT:["#ffcc00","#da291c","#046a38"],
  IE:["#ff883e","#169b62","#7fd6a8"], SE:["#fecc00","#006aa7","#4dabff"], NO:["#ff6b7a","#ba0c2f","#00205b"],
  FI:["#7fb2ff","#002f6c","#cfe0ff"], DK:["#ff6b7a","#c8102e","#ffc2cc"], PL:["#ff6b8a","#dc143c","#ffc2cf"],
  CZ:["#5b8cff","#d7141a","#11457e"], UA:["#ffd500","#0057b7","#4d9bff"], RU:["#5b8cff","#d52b1e","#0039a6"],
  TR:["#ff5a63","#e30a17","#ffc2c5"], IL:["#6b9bff","#0038b8","#a8c8ff"], AE:["#4cc38a","#ff0000","#00732f"],
  IN:["#ff9933","#138808","#4dd0a0"], VN:["#ffcd00","#da251d","#ff7a3d"], TH:["#6b7bff","#a51931","#2d2a4a"],
  MY:["#ffcc00","#cc0001","#2b4bd9"], ID:["#ff6b6b","#ce1126","#ffc2c2"], PH:["#fcd116","#0038a8","#ce1126"],
  BR:["#ffdf00","#009c3b","#3e7bff"], MX:["#4cc38a","#ce1126","#006847"], AR:["#74acdf","#2f6fb5","#f6b40e"],
  CL:["#5b8cff","#d52b1e","#0039a6"], ZA:["#ffb612","#007749","#de3831"],
};
const FLAGDEF = ["#38bdf8","#6366f1","#22d3ee"];
let FLAGCC = null, MSEL = "";
function flagCC(){
  const k = DESK.matches ? SEL : (MSEL || SEL);
  const s = LIST.find(x=>keyOf(x)===k) || LIST[0]; return (s && s.geo && s.geo.cc) || "";
}
/* 手機：找出畫面中間的那張卡片 */
let scrollRaf = 0;
function trackCenter(){
  if (DESK.matches || PREF.accent !== "flag") return;
  const mid = innerHeight * 0.45; let best = null, bestD = 1e9;
  document.querySelectorAll("#app .grid > .card").forEach(c => {
    const r = c.getBoundingClientRect();
    const d = (r.top <= mid && r.bottom >= mid) ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (d < bestD) { bestD = d; best = c; }
  });
  const k = best ? best.getAttribute("data-key") : "";
  if (k && k !== MSEL) { MSEL = k; flagAccent(); }
}
let scrollStop = 0;
addEventListener("scroll", () => {
  if (isLite()) { clearTimeout(scrollStop); scrollStop = setTimeout(trackCenter, 140); return; }
  if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; trackCenter(); });
}, {passive:true});
function flagAccent(){
  const h = document.documentElement;
  if (PREF.accent !== "flag") { if (FLAGCC !== null) { ["--a1","--a2","--a3"].forEach(k=>h.style.removeProperty(k)); FLAGCC = null; } return; }
  const cc = flagCC(); if (cc === FLAGCC) return;
  FLAGCC = cc; const p = FLAGPAL[cc] || FLAGDEF;
  h.style.setProperty("--a1", p[0]); h.style.setProperty("--a2", p[1]); h.style.setProperty("--a3", p[2]);
}
function applyPrefs(){
  const h = document.documentElement, dark = PREF.theme === "dark" || (PREF.theme === "auto" && DARKQ.matches), g = PREF.glass / 100;
  h.dataset.mode = dark ? "dark" : "light"; h.dataset.accent = PREF.accent; h.dataset.bg = PREF.bg;
  h.dataset.motion = PREF.motion ? "on" : "off"; h.dataset.density = PREF.density;
  h.style.setProperty("--ga", (dark ? .02 + g * .17 : .22 + g * .62).toFixed(3));
  const lite = isLite(); h.dataset.lite = lite ? "on" : "off";
  h.style.setProperty("--blur", Math.round(lite ? 10 + g * 12 : 14 + g * 26) + "px");
  h.style.setProperty("--zoom", {s:.92, m:1, l:1.1}[PREF.size] || 1);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#06080f" : "#eef1f7";
  try { flagAccent(); } catch(e) {}   /* 第一次執行時主機清單還沒準備好 */
}
DARKQ.addEventListener("change", applyPrefs);
applyPrefs();

/* ═════════ 小工具 ═════════ */
const DESK = matchMedia("(min-width: 1024px)");
let LIST = [], SEL = store("vps-sel"), FILTER = "";
const open = {};
function size(b){ if(!b) return "0 B"; const u=["B","KB","MB","GB","TB"]; let i=0; while(b>=1024&&i<4){b/=1024;i++} return (b<10&&i?b.toFixed(1):Math.round(b))+" "+u[i]; }
const rate = b => size(b)+"/s";
function up(s){ const d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60);
  return d ? `${d} 天 ${h} 小時` : h ? `${h} 小時 ${m} 分` : `${m} 分鐘`; }
const num = (v, d=0) => `<span class="num" data-v="${(+v).toFixed(d)}" data-d="${d}">${(+v).toFixed(d)}</span>`;
const keyOf = s => s.node || s.name || "";
const lvOf = s => s.level || (s.online ? "ok" : "bad");
const tier = p => p>=90 ? "b" : p>=75 ? "w" : "";
const track = pct => `<div class="track"><div class="fill ${tier(pct)}" style="width:${Math.max(0,Math.min(pct,100))}%"></div></div>`;
const STATE = {running:"執行中",exited:"已停止",restarting:"重啟中",paused:"暫停",created:"未啟動",dead:"故障",
  active:"執行中",inactive:"未執行",failed:"失敗",activating:"啟動中",unknown:"未知"};
let REGION; try { REGION = new Intl.DisplayNames(["zh-TW"], {type:"region"}); } catch(e) {}
const FLAGFAIL = {};
function flag(cc){
  if (!/^[A-Z]{2}$/.test(cc||"")) return "";
  const emo = String.fromCodePoint(...[...cc].map(c=>127397+c.charCodeAt(0)));
  if (FLAGFAIL[cc]) return `<span class="emoji">${emo}</span>`;
  return `<img class="flag" src="https://flagcdn.com/w80/${cc.toLowerCase()}.png" alt="${emo}" title="${esc(REGION?REGION.of(cc):cc)}"
    onerror="FLAGFAIL['${cc}']=1;this.outerHTML='<span class=emoji>${emo}</span>'">`;  /* 外層 .fw 會留著，發光不會跑掉 */
}
const place = s => s.geo ? [(REGION&&s.geo.cc)?REGION.of(s.geo.cc):s.geo.cc, s.geo.city].filter(Boolean).join(" ") : "";
function when(t){ const d=new Date(t*1000), now=new Date();
  const hm=d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false});
  return d.toDateString()===now.toDateString() ? `今天 ${hm}` : `${d.getMonth()+1}/${d.getDate()} ${hm}`; }
/* 「3 分鐘前」「昨天 19:42」這種好讀的時間 */
function ago(t){
  const d = Date.now()/1000 - t, dt = new Date(t*1000), now = new Date();
  const hm = dt.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false});
  if (d < 45) return "剛剛";
  if (d < 3600) return `${Math.round(d/60)} 分鐘前`;
  if (d < 6*3600) return `${Math.floor(d/3600)} 小時前`;
  if (dt.toDateString() === now.toDateString()) return `今天 ${hm}`;
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (dt.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${dt.getMonth()+1}/${dt.getDate()} ${hm}`;
}
const seen = s => s.last_seen ? `最後連上：${ago(s.last_seen)}` : "";
function avatar(s){
  const f = PREF.show.flag && s.geo ? flag(s.geo.cc) : "";
  const lv = lvOf(s), tip = {ok:"運作正常", warn:"需要留意", bad:"出問題了"}[lv];
  const inner = f ? `<span class="fw">${f}</span>` : `<span class="fw round"><span class="letter">${esc([...(s.name||"?")][0])}</span></span>`;
  return `<div class="avatar ${lv}" title="${tip}">${inner}</div>`;
}
function stline(s){
  const lv = lvOf(s), t = s.online ? {ok:"運作正常", warn:"需要留意", bad:"出問題了"}[lv] : "連不上這台主機";
  return `<span class="stx ${lv}" data-x><span class="dot pulse ${lv}"></span>${t}</span>`;
}
function stchip(s){
  const lv = lvOf(s), t = s.online ? {ok:"運作正常", warn:"需要留意", bad:"出問題了"}[lv] : "連不上";
  return `<span class="stchip ${lv}" data-x><span class="dot pulse ${lv}"></span>${t}</span>`;
}
const safeUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(u || "") ? u : "";
const linksOf = s => (s.links || (s.panel ? [{name:"管理後台", url:s.panel}] : []))
  .map(x => x.fixed && s.cloud && s.cloud.login ? {...x, url: s.cloud.login} : x).filter(x => safeUrl(x.url));   // 雲端硬碟用一鍵登入網址
const linkSt = x => x.up === false ? `打不開：${x.err || "連不上"}` : x.up ? `正常・${x.ms} 毫秒` : x.err ? "剛剛沒回應，再確認一次中…" : "還沒檢查";
const editBtn = s => { if (!s.online) return ""; const L = linksOf(s);
  return `<button class="iconbtn" title="編輯名稱與常用連結" data-rename="${esc(s.node||"")}" data-name="${esc(s.name)}">${I("edit")}</button>`
  + (L.length === 1 ? `<a class="iconbtn plink ${L[0].up===false?"down":""}" href="${esc(L[0].url)}" target="_blank" rel="noopener noreferrer" title="打開 ${esc(L[0].name)}（${esc(linkSt(L[0]))}）">${I("ext")}</a>`
    : L.length > 1 ? `<button class="iconbtn plink ${L.some(x=>x.up===false)?"down":""}" data-links="${esc(keyOf(s))}" title="常用連結">${I("ext")}</button>` : ""); };
function alerts(s){
  const k = t => esc(String(t).replace(/[\d.]+/g, ""));
  const al = (s.problems||[]).map(p=>`<div class="alert bad" data-key="b:${k(p)}">${I("warn")}${esc(p)}</div>`)
    .concat((s.notices||[]).map(p=>`<div class="alert warn" data-key="w:${k(p)}">${I("alert")}${esc(p)}</div>`));
  return al.length ? `<div class="alerts" data-key="al" data-keyed>${al.join("")}</div>` : "";
}
function itemsOf(s){
  const items = [];
  (s.containers||[]).forEach(c=>{
    const st = /unhealthy/.test(c.status) ? "bad" : c.state==="running" ? "ok"
      : (c.state==="created" || c.state==="paused" || /Exited \(0\)/.test(c.status)) ? "off" : "bad";
    const g = c.project || "", short = g && c.name.startsWith(g + "-") ? c.name.slice(g.length + 1) : c.name;
    items.push({n:c.name, sn:short, g, st, s:STATE[c.state]||c.state, t:"容器"});
  });
  const rank = {bad:0, ok:1, off:2};
  items.sort((a, b) => (a.g === b.g ? 0 : !a.g ? 1 : !b.g ? -1 : a.g.localeCompare(b.g)) || rank[a.st] - rank[b.st] || a.sn.localeCompare(b.sn));
  (s.services||[]).forEach(v=>items.push({n:v.name, sn:v.name, g:"系統服務", st:v.state==="active"?"ok":"bad", s:STATE[v.state]||v.state, t:"服務"}));
  return items;
}
function itemsSummary(items){
  const bad = items.filter(x=>x.st==="bad").length, okn = items.filter(x=>x.st==="ok").length, off = items.length-bad-okn;
  return `${okn} 個正常${off?`・${off} 個沒在用`:""}${bad?`・<b>${bad} 個異常</b>`:""}`;
}
const itemRow = (x,j) => `<div class="item" data-key="${x.t}:${esc(x.n)}" style="transition-delay:${j*35}ms"><span class="dot ${x.st}"></span><span class="n" title="${x.t}：${esc(x.n)}">${esc(x.sn||x.n)}</span><span class="tag">${esc(x.s)}</span></div>`;
/* 有分組（docker compose 專案、系統服務）就加小標題，名稱前面重複的專案名稱拿掉 */
function itemsHTML(items){
  const groups = [...new Set(items.map(x => x.g))];
  const head = groups.length > 1 || groups[0];
  let j = 0, h = "";
  for (const g of groups) {
    const gi = items.filter(x => x.g === g);
    if (head) h += `<div class="grp" data-key="grp:${esc(g)}" style="transition-delay:${j*35}ms">${g ? esc(g) : "其他容器"}<span>${gi.filter(x=>x.st==="ok").length}／${gi.length}</span></div>`;
    h += gi.map(x => itemRow(x, j++)).join("");
  }
  return h;
}
function updateInfo(s){
  const n = s.updates ? s.updates.total : 0, u = s.update;
  if (u && u.running) return n ? `正在安裝 ${n} 個更新…<br>大約 1～5 分鐘，好了會通知你` : `正在檢查有沒有新的更新…<br>有的話會順便裝好，完成會通知你`;
  let info = s.updates ? (n ? `有 ${n} 個套件可以更新${s.updates.security?`（含 ${s.updates.security} 個安全更新）`:""}` : "系統已經是最新的 ✨") : "";
  if (u && u.last) info += `${info?"<br>":""}上次更新${u.last.ok?"成功":`<span style="color:var(--bad)">失敗</span>`}・${when(u.last.time)}`;
  return info;
}
/* 按鈕永遠是同一個樣子（只在進行中變淡、不能按），進度和結果都寫在左邊的說明文字 */
function updateBtn(s){
  const u = s.update, n = s.updates ? s.updates.total : 0;
  if (!u || !u.supported) return "";
  return `<button class="ubtn" data-update="${esc(s.node||"")}" data-label="${esc(s.name)}" data-n="${n}" ${u.running ? "disabled" : ""}>${I("upd").replace("<svg","<svg style=\"width:15px;height:15px\"")}檢查更新</button>`;
}
function greet(n, total){
  const h = new Date().getHours();
  const hi = h < 5 ? "夜深了 🌙" : h < 11 ? "早安 ☀️" : h < 14 ? "午安 🌤️" : h < 18 ? "下午好 ☕" : "晚安 🌙";
  const word = total > 1 ? "所有主機" : "主機";
  const line = n.bad ? `有 ${n.bad} 台<em>出問題了</em>` : n.warn ? `有 ${n.warn} 台<em>需要留意</em>` : `${word}都<em>很健康</em>`;
  return {hi, line};
}

/* ═════════ 曲線圖 ═════════ */
function pathOf(vals, W, H, max){
  if (!vals || vals.length < 2) return null;
  const n = vals.length, y = v => H - Math.max(0, Math.min(v/max, 1)) * (H-4) - 2;
  const d = vals.map((v,i)=>`${i?"L":"M"}${(i/(n-1)*W).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return {line:d, area:`${d} L${W},${H} L0,${H} Z`};
}
/* 換算成固定點數：點多就每段取平均（保留尖峰的一半高度），點少就線性補 */
function resample(v, n){
  if (!v || v.length < 2) return v;
  if (v.length === n) return v;
  const out = new Array(n);
  if (v.length > n) {
    const step = v.length / n;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
      let sum = 0, mx = -Infinity;
      for (let j = a; j < b; j++) { sum += v[j]; if (v[j] > mx) mx = v[j]; }
      out[i] = (sum / (b - a) + mx) / 2;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const p = i * (v.length - 1) / (n - 1), a = Math.floor(p), f = p - a;
      out[i] = v[a] + ((v[a + 1] ?? v[a]) - v[a]) * f;
    }
  }
  return out;
}
/* 刻度用的整齊數字：1、2、5、10… */
function niceMax(v, bin){
  if (bin) { const u = Math.pow(1024, Math.max(0, Math.floor(Math.log(v) / Math.log(1024)))); return niceMax(v / u) * u; }
  const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
const CHD = {};                       // 每張曲線圖的原始資料（滑鼠移上去顯示數值用）
function chart(id, series, o={}){
  const N = o.n || 150, raw = series;
  series = series.map(s => ({...s, data: resample(s.data, N)}));
  const W = 600, H = o.h || 170, all = series.flatMap(s=>s.data||[]);
  if (all.length < 4) return `<div class="wait" style="height:${H}px">收集資料中，約 1 分鐘後出現…</div>`;
  const max = o.max || (o.grid ? niceMax(Math.max(1, ...all) * 1.1, o.bin) : Math.max(1, ...all) * 1.2);
  if (o.t) CHD[id] = {t: o.t, ser: raw, fmt: o.fmt || (v => v)};
  const yax = o.grid && o.fmt ? `<div class="yax">${[.25,.5,.75].map(f=>`<span style="top:${f*100}%">${o.fmt(max*(1-f))}</span>`).join("")}</div>` : "";
  let g = "";
  if (o.grid) for (const f of [.25,.5,.75]) g += `<line class="gl" x1="0" x2="${W}" y1="${(H*f).toFixed(1)}" y2="${(H*f).toFixed(1)}"/>`;
  const defs = series.map((s,i)=>`<linearGradient id="${id}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:${o.fade??.3}"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`).join("");
  const body = series.map((s,i)=>{ const p = pathOf(s.data, W, H, max); if (!p) return "";
    return `<path d="${p.area}" fill="url(#${id}${i})"/><path d="${p.line}" fill="none" style="stroke:${s.color}" stroke-width="${o.sw||2.4}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="miter"/>`; }).join("");
  return `<svg class="chart" ${o.t?`data-cid="${id}"`:""} viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px"><defs>${defs}</defs>${g}${body}</svg>${yax}`;
}
let RANGE = ["30m","24h","7d"].includes(store("vps-range")) ? store("vps-range") : "30m";
const HCACHE = {}, SHOWN = {};
const RLABEL = {"30m":"30 分鐘", "24h":"24 小時", "7d":"7 天"};
function rangeSeg(){
  return `<span class="rng">${[["30m","30分"],["24h","24時"],["7d","7天"]].map(([v,l])=>`<button class="${RANGE===v?"on":""}" data-range="${v}">${l}</button>`).join("")}</span>`;
}
/* 取得要畫的歷史：30 分鐘用即時資料；24 小時／7 天另外抓，快取 1 分鐘 */
function histFor(s){
  const h = histRaw(s);
  if (h && !h.err) SHOWN[keyOf(s)] = h;
  return h || SHOWN[keyOf(s)] || null;      // 新資料還沒到：先留著原本的曲線，到了再直接變形過去
}
function histRaw(s){
  if (RANGE === "30m") return s.hist;
  const k = keyOf(s) + "|" + RANGE, c = HCACHE[k];
  if (!c || Date.now() - c.at > 60000) {
    if (!c || !c.loading) {
      HCACHE[k] = {...(c || {}), loading: true, at: c ? c.at : 0};
      fetch(`/api/history?range=${RANGE}&node=${encodeURIComponent(s.node || "")}`, {headers:{"X-Token":getTok()}})
        .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || "讀取失敗")))
        .then(d => { HCACHE[k] = {at: Date.now(), data: d}; if (LIST.length) render(LIST); })
        .catch(err => { HCACHE[k] = {at: Date.now(), err: String(err)}; if (LIST.length) render(LIST); });
    }
  }
  return c && c.data ? c.data : (c && c.err ? {err: c.err} : null);
}
function xlabel(h){
  if (RANGE === "30m") return `${minutes(h)} 分鐘前`;
  if (!h || !h.t || h.t.length < 2) return RLABEL[RANGE] + "前";
  const hrs = (h.t[h.t.length-1] - h.t[0]) / 3600;
  return hrs >= 36 ? `${Math.round(hrs/24)} 天前` : `${Math.max(1, Math.round(hrs))} 小時前`;
}
function chartOr(h, id, series, o){
  if (!h) return `<div class="wait" style="height:${o.h||170}px">讀取中…</div>`;
  if (h.err) return `<div class="wait" style="height:${o.h||170}px">${esc(h.err)}</div>`;
  if (RANGE !== "30m" && (!h.t || h.t.length < 2)) return `<div class="wait" style="height:${o.h||170}px">資料累積中，${RANGE==="24h"?"約 10 分鐘":"約 1 小時"}後開始出現</div>`;
  return chart(id, series(h), {...o, t: h.t});
}
const minutes = h => (h && h.t && h.t.length > 1) ? Math.max(1, Math.round((h.t[h.t.length-1]-h.t[0])/60)) : 30;
const cid = (s, k) => "g" + Math.abs([...keyOf(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))|0, 7)) + k;
const COL = {cpu:"var(--c-cpu)", mem:"var(--c-mem)", rx:"var(--c-rx)", tx:"var(--c-tx)"};
/* 概念 → [顏色樣式, 圖示] */
const ICO = {cpu:["cpu","cpu"], mem:["mem","mem"], disk:["disk","disk"], load:["load","gauge"], down:["down","down"], up:["up","up"],
  net:["net","net"], trend:["trend","trend"], month:["month","month"], box:["box","box"], bell:["bell","bell"], info:["info","info"],
  layers:["theme","layers"], flag:["theme","flag"]};
const IC = (k, cls="sm") => `<span class="ico ${cls} ${ICO[k][0]}">${I(ICO[k][1])}</span>`;

/* ═════════ 手機版 ═════════ */
function metric(icon, label, pct, detail){
  return `<div class="metric">${IC(icon, "")}
    <div class="row"><span>${label}<span class="sub">${detail}</span></span><b>${num(pct)}<small>%</small></b></div>${track(pct)}</div>`;
}
function mcard(s, i){
  const lv = lvOf(s), key = keyOf(s);
  let h = `<div class="card glass ${lv==="ok"?"":lv}" data-key="${esc(key)}" data-keyed style="--i:${i}"><div class="head" data-key="hd">${avatar(s)}
    <div class="nm"><h2><span>${esc(s.name)}</span>${editBtn(s)}</h2><div class="sub">${s.online ? esc(place(s) || s.os) : (s.last_seen ? `離線・${ago(s.last_seen)}` : "目前連不上")}</div></div>`;
  if (!s.online) return h + `</div><div class="offline" data-key="off">${I("off")}<div>連不上這台主機<div class="sub">${s.last_seen?esc(seen(s))+"<br>":""}${esc(s.error||"")}</div></div></div></div>`;
  h += `<span class="uptime">開機 ${up(s.uptime)}</span></div>` + alerts(s);
  h += `<div class="metrics" data-key="mt">` + metric("cpu", "處理器", s.cpu, `${s.cores} 核`) +
       metric("mem", "記憶體", s.mem.pct, `${size(s.mem.used)} / ${size(s.mem.total)}`) +
       s.disks.map(d=>metric("disk", "磁碟"+(d.path==="/"?"":" "+esc(d.path)), d.pct, `${size(d.used)} / ${size(d.total)}`)).join("") + `</div>`
       + (s.cloud && safeUrl(s.cloud.login || s.cloud.url) ? `<a class="cloudm" data-key="cl" href="${esc(s.cloud.login || s.cloud.url)}" target="_blank" rel="noopener noreferrer">${I("cloud")}<span>雲端硬碟</span>
          ${s.cloud.total ? `<b>${size(s.cloud.used)}<small> / ${size(s.cloud.total)}</small></b>` : ""}${I("ext")}</a>` : "");
  if (PREF.show.chart && s.hist) { const hh = histFor(s);
    h += `<div class="spark" data-key="sp"><div class="lbl"><span><i style="background:${COL.cpu};margin-left:0"></i>處理器<i style="background:${COL.mem}"></i>記憶體</span>${rangeSeg()}</div>
      ${chartOr(hh, cid(s,"m"), x => [{data:x.cpu,color:COL.cpu},{data:x.mem,color:COL.mem}], {max:100, h:64, fade:.25, sw:2, n:100})}</div>`; }
  h += `<div class="stats" data-key="st" data-keyed><div class="stat" data-key="load"><div class="k">${IC("load")}負載</div><div class="v">${num(s.load[0],2)}</div></div>` +
       (PREF.show.net ? `<div class="stat" data-key="down"><div class="k">${IC("down")}下載</div><div class="v num">${rate(s.net.rx)}</div></div>
        <div class="stat" data-key="up"><div class="k">${IC("up")}上傳</div><div class="v num">${rate(s.net.tx)}</div></div>` : "") + `</div>`;
  h += trafficLine(s);
  const items = itemsOf(s);
  if (PREF.show.items && items.length) h += `<div class="more ${open[key]?"open":""}" data-key="mo"><button class="more-head" data-toggle="${esc(key)}">${IC("box")}<span>容器與服務：${itemsSummary(items)}</span><span class="chev">${I("chev")}</span></button>
      <div class="collapse"><div><div class="list" data-keyed>${itemsHTML(items)}</div></div></div></div>`;
  const info = updateInfo(s), btn = updateBtn(s);
  if (info || btn) h += `<div class="foot" data-key="ft"><div class="sub" data-x>${info}</div>${btn}</div>`;
  return h + `</div>`;
}
function summary(n, clickable){
  const p = (k, label) => `<button class="pill glass ${k} ${FILTER===k?"on":""}" ${clickable?`data-filter="${k}"`:""}><span class="dot ${k}"></span>${label} <b class="num">${n[k]}</b></button>`;
  return `<div class="summary ${FILTER&&clickable?"filtering":""}"><span class="pind" data-keep></span>${p("ok","正常")}${p("warn","注意")}${p("bad","異常")}</div>`;
}
function renderMobile(list, n, time){
  const many = true;
  const shown = FILTER ? list.filter(s=>lvOf(s)===FILTER) : list, g = greet(n, list.length);
  return `<div class="dash m" data-key="m"><header class="bar"><span class="mini">VPS 哨兵</span><span class="grow"></span>
    <button class="cap glass ${list.some(s=>s.self_has)?"hasnew":""}" data-settings title="設定">${I("gear")}</button><button class="cap glass" data-logout title="登出">${I("logout")}</button></header>
    <div class="hero"><div class="hello">${g.hi}</div><h1 data-x>${g.line}</h1><div class="meta"><span class="live"></span>更新於 ${time}</div></div>
    ${summary(n, many)}
    <div class="grid" data-keyed>${shown.length ? shown.map(mcard).join("") : `<div class="empty" data-key="empty">這個分類目前沒有主機 👍</div>`}</div></div>`;
}

/* ═════════ 電腦版 ═════════ */
function hostItem(s, on){
  let h = `<button class="host ${on?"on":""}" data-sel="${esc(keyOf(s))}" data-key="${esc(keyOf(s))}"><div class="head">${avatar(s)}
    <div class="nm"><h2><span>${esc(s.name)}</span></h2><div class="sub">${s.online ? esc(place(s) || s.os) : (s.last_seen ? `離線・${ago(s.last_seen)}` : "連不上")}</div></div></div>`;
  if (s.online) h += `<div class="minis"><div><div class="k">處理器<b>${num(s.cpu)}%</b></div>${track(s.cpu)}</div>
    <div><div class="k">記憶體<b>${num(s.mem.pct)}%</b></div>${track(s.mem.pct)}</div></div>`;
  return h + `</button>`;
}
/* 雲端硬碟入口：放在磁碟卡片標題旁，點了直接打開 */
function cloudChip(s){
  const c = s.cloud, href = c && (c.login || c.url); if (!c || !safeUrl(href)) return "";
  const L = (s.links || []).find(x => x.fixed), down = L && L.up === false;
  const use = c.total ? `${size(c.used)} / ${size(c.total)}` : "";
  return `<a class="cchip ${down ? "down" : c.pct >= 90 ? "warn" : ""}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"
    title="打開雲端硬碟${use ? `（已用 ${use}）` : ""}${down ? `・目前打不開：${esc(L.err || "")}` : ""}">${I("cloud")}<span>雲端${c.total ? ` ${num(c.pct)}%` : ""}</span>${I("ext")}</a>`;
}
function ring(icon, label, pct, sub, i, extra = ""){
  const r = 52, Cc = 2*Math.PI*r, off = Cc*(1-Math.max(0,Math.min(pct,100))/100);
  return `<div class="gauge glass panel" style="--i:${i}"><div class="ph">${IC(icon)}<h3>${label}</h3>${extra}</div>
    <div class="gwrap"><svg viewBox="0 0 120 120"><circle class="rt" cx="60" cy="60" r="${r}"/>
    <circle class="rv ${tier(pct)}" cx="60" cy="60" r="${r}" style="--c:${Cc.toFixed(1)};stroke-dasharray:${Cc.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"/></svg>
    <div class="gin"><b>${num(pct)}<small>%</small></b><span>${sub}</span></div></div></div>`;
}
/* 主機概況：只放上面沒出現過、又真的有用的數字 */
/* IPv6：固定一行（有沒有設定都佔同樣位置，每台主機的版面一樣高） */
function v6line(s, shown){
  const v = s.ipv6;
  if (!v) return "";                                       // 沒有 IPv6：不特別顯示
  if (!v.addr) return `<span class="v6 warn">IPv6 位址不見了</span>`;
  const st = v.ok === false ? `<i class="ld bad"></i>連不出去` : v.ok ? `<i class="ld ok"></i>正常` : `<i class="ld"></i>檢查中`;
  return shown ? `<span class="v6 a" data-copy="${esc(v.addr)}" title="點一下複製">${esc(v.addr)}</span>`
    : `<span class="v6 ${v.ok === false ? "warn" : ""}">IPv6 ${st}</span>`;
}
/* 主機概況：每個數字都附上「代表什麼」，一眼看懂 */
const IPSHOW = {};                    // 哪幾台的 IP 目前是顯示狀態（到期自動再遮起來）
function sysPanel(s){
  const l = s.load[0], lr = l / (s.cores || 1);
  const [lw, lt] = lr < .7 ? ["輕鬆", "ok"] : lr < 1 ? ["有點忙", "warn"] : lr < 2 ? ["忙碌", "warn"] : ["超載", "bad"];
  const c = s.conns, avg = s.conns_avg;
  const cw = c == null ? "" : avg == null ? "統計中" : (c > avg * 2 && c - avg > 20) ? "比平常多很多" : (avg > 10 && c < avg * .3) ? "比平常少很多" : "跟平常差不多";
  const ip = s.geo && s.geo.ip, org = s.geo && s.geo.org, k = keyOf(s), shown = IPSHOW[k] > Date.now();
  const extra = s.disks.slice(1).map(d => `磁碟 ${esc(d.path)} ${num(d.pct)}%`)
    .concat(s.mem.swap_total ? [`虛擬記憶體 ${num(s.mem.swap_pct)}%`] : []);
  return `<div class="panel glass sysp" data-key="fp" style="--i:4"><div class="ph">${IC("info")}<h3>主機概況</h3></div>
    <div class="facts2">
      <div class="fr" title="最近 1／5／15 分鐘的平均負載：${s.load.map(x=>x.toFixed(2)).join("／")}（${s.cores} 核心，超過 ${s.cores} 就算忙）">
        <span class="k">負載</span><b class="${lt}">${lw}</b><span class="d">${l.toFixed(2)}／${s.cores} 核</span>
        <div class="lbar"><i class="${lt}" style="width:${Math.min(100, lr / 2 * 100).toFixed(0)}%"></i></div></div>
      <div class="fr" title="這台主機現在有多少條網路連線；「平常」是最近 1 小時的平均${avg != null ? `（約 ${Math.round(avg)} 條）` : ""}">
        <span class="k">連線</span><b>${c == null ? "—" : Number(c).toLocaleString("zh-TW")} <small>條</small></b><span class="d ${cw.includes("多很多") ? "warn" : ""}">${cw}</span></div>
      ${ip ? `<div class="fr"><span class="k">IP</span><b class="ipb ${shown ? "on" : ""}" ${shown ? `data-copy="${esc(ip)}" title="點一下複製（15 秒後會自動遮起來）"` : `data-reveal="${esc(k)}" title="點一下顯示"`}>${esc(ip)}</b>
        ${s.ipv6 || org ? `<span class="d org">${v6line(s, shown)}${org ? `<span class="on2">${s.ipv6 ? "・" : ""}${esc(org)}</span>` : ""}</span>` : ""}</div>` : ""}
    </div>${extra.length ? `<div class="fx">${extra.join("・")}</div>` : ""}</div>`;
}
function detail(s){
  const key = keyOf(s), where = place(s);
  let h = `<div class="detail" data-key="detail" data-keyed><div class="panel glass dhead" data-key="dh" style="--i:0">
      <div style="min-width:0" data-key="dl" data-keyed><h2 class="nmh" data-key="nm" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span>${esc(s.name)}</span>${editBtn(s)}</h2>
      <div class="sub dsub" data-key="ds">${s.online ? `<span title="核心版本 ${esc(s.kernel)}">${where?esc(where)+"・":""}${esc(s.os)}・開機 ${up(s.uptime)}</span>` : `<span>${s.last_seen ? esc(seen(s)) : "目前沒有回應"}</span>`}</div>${s.online ? alerts(s) : ""}</div>
      ${s.online ? `<div class="act"><div class="sub" data-x style="line-height:1.6;font-weight:600">${updateInfo(s)}</div>${updateBtn(s)}</div>` : ""}</div>`;
  if (!s.online) return h + `<div class="panel glass bigoff" data-key="off" style="--i:1"><b>連不上這台主機</b>${esc(s.error||"")}</div></div>`;
  const fp = PREF.show.info ? sysPanel(s) : "";
  const d0 = s.disks[0] || {pct:0, used:0, total:0};
  h += `<div class="gauges" data-key="gg" style="${fp?"":"grid-template-columns:repeat(3,minmax(0,1fr))"}">${ring("cpu", "處理器", s.cpu, `${s.cores} 核心`, 1)}
        ${ring("mem", "記憶體", s.mem.pct, `${size(s.mem.used)} / ${size(s.mem.total)}`, 2)}
        ${ring("disk", "磁碟", d0.pct, `${size(d0.used)} / ${size(d0.total)}`, 3, cloudChip(s))}${fp}</div>`;
  const hs = histFor(s), xl = `<div class="xl" style="align-items:center"><span>${xlabel(hs)}</span>${rangeSeg()}<span>現在</span></div>`;
  const cp = PREF.show.chart ? `<div class="panel glass" data-key="cp" style="--i:4"><div class="ph">${IC("trend")}<h3>處理器與記憶體</h3><div class="legend">
      <span><i style="background:${COL.cpu}"></i>處理器<b>${num(s.cpu)}%</b></span><span><i style="background:${COL.mem}"></i>記憶體<b>${num(s.mem.pct)}%</b></span></div></div>
      <div class="cbox">${chartOr(hs, cid(s,"a"), x => [{data:x.cpu,color:COL.cpu,name:"處理器"},{data:x.mem,color:COL.mem,name:"記憶體"}], {max:100, grid:1, fmt:v=>Math.round(v)+"%"})}</div>${xl}</div>` : "";
  const np = PREF.show.net ? `<div class="panel glass" data-key="np" style="--i:5"><div class="ph">${IC("net")}<h3>網路速度</h3><div class="legend">
      <span><i style="background:${COL.rx}"></i>下載<b class="num">${rate(s.net.rx)}</b></span><span><i style="background:${COL.tx}"></i>上傳<b class="num">${rate(s.net.tx)}</b></span></div></div>
      <div class="cbox">${chartOr(hs, cid(s,"b"), x => [{data:x.rx,color:COL.rx,name:"下載"},{data:x.tx,color:COL.tx,name:"上傳"}], {grid:1, bin:1, fmt:rate})}</div>${xl}</div>` : "";
  if (cp || np) h += `<div class="charts" data-key="ch" data-keyed style="${cp&&np?"":"grid-template-columns:1fr"}">${cp}${np}</div>`;
  const items = itemsOf(s);
  const ip = PREF.show.items ? `<div class="panel glass" data-key="ip" style="--i:6"><div class="ph">${IC("box")}<h3>容器與服務</h3><span class="sub" style="margin-left:auto;font-weight:700">${items.length?itemsSummary(items).replace("<b>",'<b style="color:var(--bad)">'):""}</span></div>
      ${items.length ? `<div class="tbl" data-keyed>${itemsHTML(items)}</div>` : `<div class="sub">沒有偵測到容器或服務</div>`}</div>` : "";
  const ep = eventsPanel(s), tp = trafficPanel(s);
  if (ip || ep || tp) h += `<div class="lower" data-key="lw" data-keyed>${tp}${ep}${ip}</div>`;
  return h + `</div>`;
}
function overview(list){
  const on = list.filter(s => s.online);
  if (!on.length) return "";
  const tr = PREF.show.traffic ? on.filter(s => s.traffic) : [];
  const score = s => s.traffic.limit ? Math.max(s.traffic.pct || 0, s.traffic.projected ? s.traffic.projected / s.traffic.limit * 100 : 0) : -1;
  tr.sort((a, b) => score(b) - score(a));
  const rows = tr.slice(0, 4).map(s => { const t = s.traffic, over = t.limit && t.projected > t.limit;
    return `<div class="tq" data-key="${esc(keyOf(s))}"><div class="r"><span class="nm">${esc(s.name)}</span><b class="num">${t.limit ? num(t.pct) + "%" : size(t.used)}</b></div>
      ${t.limit ? track(t.pct) : ""}<div class="s ${over?"warn":""}">${t.limit ? `${size(t.used)} / ${size(t.limit)}・` : "沒有設定上限・"}${over ? "照目前速度會超過" : `還有 ${t.days_left} 天重置`}</div></div>`; }).join("");
  const items = on.flatMap(itemsOf), ok = items.filter(x=>x.st==="ok").length, bad = items.filter(x=>x.st==="bad").length, off = items.length-ok-bad;
  const pc = v => items.length ? (v / items.length * 100).toFixed(1) : 0;
  if (!rows && !items.length) return "";
  return `<div class="ovw" data-keyed>${rows ? `<div class="tqw" data-key="tqw"><h4>${IC("month")}本月流量</h4><div class="tqs" data-keyed>${rows}</div></div>` : ""}
    ${items.length ? `<div class="bar2" data-key="b2"><i style="width:${pc(ok)}%;background:var(--ok)"></i><i style="width:${pc(off)}%;background:var(--faint)"></i><i style="width:${pc(bad)}%;background:var(--bad)"></i></div>
    <div class="cap2" data-key="c2"><span>全部容器與服務</span><span>${ok} 正常${off?`・${off} 沒在用`:""}${bad?`・${bad} 異常`:""}</span></div>` : ""}</div>`;
}
const CNT = {both:"上傳＋下載", out:"只算上傳", in:"只算下載", max:"取較大的"};
function trafficBars(t, id){
  const W = 600, H = 64, n = Math.max(t.cycle_days, t.daily.length), bw = W / n, gap = Math.min(4, bw * .25);
  const max = Math.max(1, ...t.daily.map(d => d.rx + d.tx));
  const rects = t.daily.map((d, i) => {
    const x = i * bw + gap / 2, w = Math.max(1, bw - gap), hr = d.rx / max * (H - 2), ht = d.tx / max * (H - 2);
    return `<rect x="${x.toFixed(1)}" y="${(H - hr - ht).toFixed(1)}" width="${w.toFixed(1)}" height="${ht.toFixed(1)}" rx="2" style="fill:${COL.tx}"><title>${d.d}：上傳 ${size(d.tx)}</title></rect>`
         + `<rect x="${x.toFixed(1)}" y="${(H - hr).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, hr).toFixed(1)}" rx="2" style="fill:${COL.rx}"><title>${d.d}：下載 ${size(d.rx)}</title></rect>`;
  }).join("");
  const rest = n > t.daily.length ? `<rect x="${(t.daily.length * bw).toFixed(1)}" y="${H-3}" width="${((n - t.daily.length) * bw).toFixed(1)}" height="3" rx="1.5" style="fill:var(--track)"/>` : "";
  return `<svg class="bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${rects}${rest}</svg>`;
}
function trafficPanel(s){
  const t = s.traffic; if (!t || !PREF.show.traffic) return "";
  const pct = t.pct, lim = t.limit;
  const pp = t.projected && lim ? Math.round(t.projected / lim * 100) : null;
  const proj = t.projected ? `${size(t.projected)}${pp != null ? `<div class="sub" style="font-weight:700;${pp>100?"color:var(--warn)":""}">上限的 ${pp}%</div>` : ""}` : "累積中";
  return `<div class="panel glass trf" data-key="tp" style="--i:9"><div class="ph">${IC("month")}<h3>本月流量</h3>
      <span class="sub" style="margin-left:auto;font-weight:700">${CNT[t.count]}</span><button class="iconbtn" data-traffic="${esc(s.node||"")}" data-label="${esc(s.name)}" title="流量設定">${I("gear")}</button></div>
    <div class="tgrid"><div class="tl"><div class="big"><b class="num">${size(t.used)}</b><span>${lim ? `／ ${size(lim)}` : "沒有設定上限"}</span>${pct!=null?`<span style="margin-left:auto;color:var(--text)">${num(pct,1)}%</span>`:""}</div>
    ${lim ? track(pct) : ""}
    <div class="rows"><div><div class="k"><i class="kd" style="background:${COL.rx}"></i>下載</div><b class="num">${size(t.rx)}</b></div><div><div class="k"><i class="kd" style="background:${COL.tx}"></i>上傳</div><b class="num">${size(t.tx)}</b></div>
      <div><div class="k">預估月底</div><b>${proj}</b></div><div><div class="k">${t.reset_day} 號重置</div><b>還有 ${t.days_left} 天</b></div></div></div>
    <div class="tr">${trafficBars(t)}
    <div class="xl"><span>${t.start.slice(5).replace("-","/")}</span><span>${t.prev!=null?`上個週期 ${size(t.prev)}`:""}</span><span>${t.end.slice(5).replace("-","/")}</span></div>
    ${t.partial ? `<div class="note">從 ${new Date(t.since*1000).toLocaleDateString("zh-TW",{month:"numeric",day:"numeric"})} 開始統計，之前的流量沒有算進去</div>` : ""}</div></div></div>`;
}
function trafficLine(s){
  const t = s.traffic; if (!t || !PREF.show.traffic) return "";
  const lim = t.limit;
  return `<div class="tline" data-key="tl" data-traffic="${esc(s.node||"")}" data-label="${esc(s.name)}">
    <div class="r1">${IC("month")}本月流量<b class="num">${size(t.used)}${lim?`<small>／ ${size(lim)}</small>`:""}</b></div>
    ${lim ? track(t.pct) : ""}
    <div class="r2"><span>${t.projected ? `預估月底 ${size(t.projected)}` : "預估累積中"}</span><span>${t.reset_day} 號重置・還有 ${t.days_left} 天</span></div></div>`;
}
async function trafficModal(node, label){
  const s = LIST.find(x => (x.node || "") === node), t = s && s.traffic;
  if (!t) return;
  let mode = t.count;
  const days = Array.from({length:28}, (_, i) => `<option value="${i+1}" ${t.reset_day===i+1?"selected":""}>每月 ${i+1} 號</option>`).join("");
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog glass pop">${IC("month","big")}<h3>「${esc(label)}」流量設定</h3>
    <div class="form">
      <label>每月流量上限（GB）<input class="field" type="number" inputmode="decimal" min="0" step="any" value="${t.limit ? +(t.limit/1073741824).toFixed(3) : ""}" placeholder="不限制就留空"></label>
      <label>每月幾號重置<select class="field">${days}</select></label>
      <label>怎麼計算<div class="seg" style="flex-wrap:wrap">${Object.entries(CNT).map(([k,l])=>`<button type="button" class="${mode===k?"on":""}" data-m="${k}">${l}</button>`).join("")}</div>
        <small>甲骨文等很多主機商只算「上傳」；不確定就選「上傳＋下載」</small></label>
    </div>
    <div class="btns"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-r="1">儲存</button></div></div>`;
  $("#layer").appendChild(v);
  v.querySelectorAll(".seg").forEach(sg => sg.querySelectorAll("button").forEach(b => b.onclick = () => {
    mode = b.dataset.m; sg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); }));
  const ok = await new Promise(res => {
    const done = r => { if (v._d) return; v._d = 1; const val = r ? {limit_gb: +(v.querySelector("input").value || 0), reset_day: +v.querySelector("select").value, count: mode} : null;
      v.classList.add("closing"); setTimeout(() => { v.remove(); res(val); }, 360); };
    v._esc = () => done(0);
    v.addEventListener("click", e => { if (e.target === v) return done(0); const b = e.target.closest("[data-r]"); if (b) done(+b.dataset.r); });
    v.querySelector("input").addEventListener("keydown", e => { if (e.key === "Enter") done(1); });
  });
  if (!ok) return;
  try {
    const r = await fetch("/api/traffic?node=" + encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(ok)});
    const d = await r.json().catch(() => ({}));
    (r.ok && d.ok) ? toast("流量設定已儲存") : toast(d.message || d.error || (r.status === 404 ? "那台主機還沒更新到新版" : "儲存失敗"), "bad");
  } catch(e) { toast("連線失敗，請稍後再試", "bad"); }
  tick();
}
/* 同一件事反覆發生：只留最新一筆，標上次數 */
function mergeEv(ev){
  const m = new Map();
  for (const e of ev) { const k = e.kind + ":" + e.text, x = m.get(k); x ? x.n++ : m.set(k, {...e, n:1}); }
  return [...m.values()];
}
function eventsPanel(s){
  const ev = s.events;
  if (!ev) return "";
  const word = {bad:"異常", warn:"注意", ok:"恢復", info:"通知"};
  return `<div class="panel glass" data-key="ep" style="--i:8"><div class="ph">${IC("bell")}<h3>事件紀錄</h3><span class="sub" style="margin-left:auto;font-weight:700">最近 ${ev.length} 筆</span></div>
    ${ev.length ? `<div class="evs" data-keyed>${mergeEv(ev).map(e=>`<div class="ev" data-key="${e.kind}:${esc(e.text)}"><span class="dot ${e.kind}"></span><div><div>${esc(e.text)}</div><div class="sub">${word[e.kind]||""}・${ago(e.t)}${e.n>1?`・共 ${e.n} 次`:""}</div></div></div>`).join("")}</div>`
      : `<div class="calm">目前沒有事件，一切平靜 ☕</div>`}</div>`;
}
function renderDesk(list, n, time){
  const sel = list.find(s=>keyOf(s)===SEL) || list[0], g = greet(n, list.length);
  return `<div class="dash d" data-key="d"><aside class="side glass">
      <div class="brand"><svg class="" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lbbr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--a1) 70%,#fff)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient><linearGradient id="lhbr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="lmbr"><rect width="512" height="512" fill="#fff"/><path d="M204 258l36 36 72-76" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="512" height="512" rx="115" fill="url(#lbbr)"/><rect width="512" height="512" rx="115" fill="url(#lhbr)"/><path d="M256 108 371 150c9 3 15 12 15 22v72c0 84-52 140-122 168-5 2-11 2-16 0-70-28-122-84-122-168v-72c0-10 6-19 15-22Z" fill="#fff" mask="url(#lmbr)" transform="translate(256 262) scale(.88) translate(-256 -258)"/></svg><div><h1>VPS 哨兵</h1><div class="meta"><span class="live"></span>更新於 ${time}</div></div></div>
      <div class="greet">${g.hi}<br><b>${g.line.replace(/<\/?em>/g,"")}</b></div>
      ${summary(n, true)}
      <div class="hosts" data-keyed>${(FILTER ? list.filter(s=>lvOf(s)===FILTER) : list).map(s=>hostItem(s, s===sel)).join("") || `<div class="empty" data-key="empty">這個分類目前沒有主機 👍</div>`}</div>
      ${overview(list)}
      <div class="side-foot"><span class="sub">${list.length} 台主機</span>
        <button class="iconbtn ${REFRESHING?"spinning":""}" data-refresh title="重新整理">${I("upd")}</button>
        <button class="iconbtn ${list.some(s=>s.self_has)?"hasnew":""}" data-settings title="設定">${I("gear")}</button><button class="iconbtn" data-logout title="登出">${I("logout")}</button></div>
    </aside>${sel ? detail(sel) : ""}</div>`;
}
function skeleton(){
  return DESK.matches
    ? `<div class="dash d" data-key="sk"><aside class="side glass skel" style="height:520px"></aside><div class="detail"><div class="panel glass skel" style="height:96px"></div><div class="panel glass skel" style="height:240px"></div><div class="panel glass skel" style="height:260px"></div></div></div>`
    : `<div class="dash m" data-key="sk"><div class="hero"><div class="hello">連線中…</div><h1>正在讀取<em>主機狀態</em></h1></div><div class="grid"><div class="card glass skel"></div></div></div>`;
}

/* ═════════ 只更新有變動的地方 ═════════ */
/* 曲線變形：兩條路徑的數字一一對應，每一格畫面算一次中間值（iPhone 也能動） */
const NUM = /-?\d+(?:\.\d+)?/g;
function morphPath(el, from, to){
  cancelAnimationFrame(el._praf);
  const cur = el._pcur || from;                 // 上一次還沒變完的話，從目前的樣子接著變
  const a = cur.match(NUM), parts = to.split(NUM), b = to.match(NUM);
  if (!canAnim() || !a || !b || a.length !== b.length) { el._pcur = null; return false; }
  const A = a.map(Number), B = b.map(Number), dur = T.slow;
  let t0 = null;
  const step = now => {
    if (t0 === null) t0 = now;
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    let d = parts[0];
    for (let i = 0; i < B.length; i++) d += (A[i] + (B[i] - A[i]) * e).toFixed(1) + parts[i + 1];
    el.setAttribute("d", d); el._pcur = d;
    if (k < 1) el._praf = requestAnimationFrame(step); else { el.setAttribute("d", to); el._pcur = null; }
  };
  el._praf = requestAnimationFrame(step);
  return true;
}
function tween(el, from, to, d){
  cancelAnimationFrame(el._raf);
  if (!isFinite(from) || !isFinite(to) || !canAnim()) { el.textContent = (+to).toFixed(d); return; }
  let t0 = null; const dur = T.slow;
  const stepf = now => {
    if (t0 === null) t0 = now;                                   // 用第一格畫面當起點，時間不會倒退
    const k = Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (from + (to - from) * e).toFixed(d);
    if (k < 1) el._raf = requestAnimationFrame(stepf); else el.textContent = (+to).toFixed(d);
  };
  el._raf = requestAnimationFrame(stepf);
}
/* 共用動畫規則（跟 CSS 的 --t-*、--ease 一致） */
const T = {fast:200, mid:350, slow:600};
const EASE = "cubic-bezier(.22,1,.36,1)", SPRING = "cubic-bezier(.34,1.4,.64,1)", EXIT = "cubic-bezier(.4,0,1,1)";
const canAnim = () => PREF.motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
/* 讓元素平順地離開：先淡出、收起高度，再移除 */
const BLOCK = ".alert,.item,.grp,.tq,.tqw,.card,.host,.empty,.spark,.ev,.more,.foot,.alerts,.offline,.strip,.charts,.lower,.gauges";
const TILE = ".panel,.stat,.tile,.gauge";
function flipSiblings(parent, change){
  const kids = [...parent.children].filter(c => !c._leaving), r0 = kids.map(c => c.getBoundingClientRect());
  change();
  kids.forEach((c, i) => { if (!c.isConnected) return; const r = c.getBoundingClientRect(), dx = r0[i].left - r.left, dy = r0[i].top - r.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) c.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:"none"}], {duration:T.mid, easing:EASE, id:"ui"}); });
}
const gapOf = el => parseFloat(getComputedStyle(el).rowGap) || 0;
/* 前後有沒有「真正留著」的鄰居，決定要收哪一邊的間距 */
function gapSide(n){
  // 依實際排列（包含正在離開的）決定收哪一邊的間距：同時有進有出時，總間距才會剛好對上，不會跳
  return n.previousElementSibling ? "marginTop" : n.nextElementSibling ? "marginBottom" : null;
}
/* 消失：先淡出，再把空間（含間距）收起來 */
function leaveBlock(n){
  const h = n.offsetHeight, cs = getComputedStyle(n), side = gapSide(n), g = side ? gapOf(n.parentElement) : 0;
  const box = {paddingTop:cs.paddingTop, paddingBottom:cs.paddingBottom, marginTop:cs.marginTop, marginBottom:cs.marginBottom};
  const zero = {paddingTop:"0px", paddingBottom:"0px", marginTop:"0px", marginBottom:"0px"};
  if (side) { box[side] = (parseFloat(box[side]) || 0) + "px"; zero[side] = -g + "px"; }  // 連同和鄰居之間的間距一起收
  n.style.overflow = "hidden"; n.style.pointerEvents = "none"; n.style.animation = "none";
  const dur = Math.min(720, 380 + h * .45);
  n.animate([
    {height:h+"px", opacity:1, ...box, easing:EXIT},
    {height:h+"px", opacity:0, ...box, offset:.35, easing:EASE},
    {height:"0px", opacity:0, ...zero}],
    {duration:dur, easing:"linear", fill:"forwards", id:"ui"}).onfinish = () => n.remove();
}
/* 出現：先把空間撐開，再淡入 */
function enterBlock(el, delay){
  const h = el.offsetHeight, cs = getComputedStyle(el), side = gapSide(el), g = side ? gapOf(el.parentElement) : 0;
  const box = {paddingTop:cs.paddingTop, paddingBottom:cs.paddingBottom, marginTop:cs.marginTop, marginBottom:cs.marginBottom};
  const zero = {paddingTop:"0px", paddingBottom:"0px", marginTop:"0px", marginBottom:"0px"};
  if (side) zero[side] = -g + "px";
  el.style.overflow = "hidden";
  el.getAnimations().forEach(x => { if (x.animationName) x.finish(); });   // 原本的進場動畫直接跳到結尾，之後也不會再重播
  const dur = Math.min(820, 460 + h * .45);
  el.animate([
    {height:"0px", opacity:0, ...zero, easing:EASE},
    {height:h+"px", opacity:0, ...box, offset:.5, easing:EASE},
    {height:h+"px", opacity:1, ...box}],
    {duration:dur, delay, easing:"linear", fill:"backwards", id:"ui"}).onfinish = () => { el.style.overflow = ""; };
}
function leave(n){
  if (n.nodeType !== 1 || !canAnim() || !n.isConnected) return n.remove();
  if (n._leaving) return;
  if (n.matches(TILE)) {
    n._leaving = 1; n.style.pointerEvents = "none";
    n.animate([{opacity:1, transform:"none"}, {opacity:0, transform:"scale(.94)"}], {duration:T.fast, easing:EXIT, id:"ui"})
      .onfinish = () => { const par = n.parentElement; par ? flipSiblings(par, () => n.remove()) : n.remove(); };
    return;
  }
  if (!n.matches(BLOCK)) return n.remove();
  n._leaving = 1;
  leaveBlock(n);
}
/* 按鈕內容換掉時，寬度平滑變化 */
function flipWidth(el, change){
  const w0 = el.offsetWidth; change(); const w1 = el.offsetWidth;
  if (canAnim() && Math.abs(w1 - w0) > 1) el.animate([{width:w0+"px"}, {width:w1+"px"}], {duration:T.mid, easing:EASE});
}
function morph(a, b){
  if (a.nodeType!==b.nodeType || a.nodeName!==b.nodeName ||
      (a.nodeType===1 && (a.getAttribute("data-key")||"")!==(b.getAttribute("data-key")||""))) { a.replaceWith(b); return; }
  if (a.nodeType===3 || a.nodeType===8){ if (a.nodeValue!==b.nodeValue) a.nodeValue=b.nodeValue; return; }
  if (a.nodeType!==1) return;
  if (a.classList.contains("ubtn") && a.innerHTML !== b.innerHTML) {
    return flipWidth(a, () => { patch(a, b); a.animate([{opacity:.35}, {opacity:1}], {duration:T.mid, easing:EASE}); });
  }
  if (a.hasAttribute("data-x") && a.innerHTML !== b.innerHTML) {
    if (!canAnim() || !a.isConnected) return patch(a, b);
    a._xb = b;                                    // 先淡出舊字、再換上新字淡入；高度跟著平順變化
    if (a._xing) return;
    a._xing = true;
    a.animate([{opacity:1}, {opacity:0}], {duration:T.fast, easing:EXIT, fill:"forwards", id:"ui"}).finished.catch(()=>{}).then(() => {
      const h0 = a.offsetHeight; patch(a, a._xb); const h1 = a.offsetHeight; a._xing = false;
      a.getAnimations().forEach(x => x.cancel());
      a.animate([{opacity:0, transform:"translateY(3px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE, id:"ui"});
      if (Math.abs(h1 - h0) > 1) a.animate([{height:h0+"px", overflow:"hidden"}, {height:h1+"px", overflow:"hidden"}], {duration:T.mid, easing:EASE, id:"ui"});
    });
    return;
  }
  patch(a, b);
}
function keyedPatch(a, b){
  const old = new Map();
  [...a.children].forEach(c => { if (!c._leaving) old.set(c.getAttribute("data-key") || "", c); });
  const anim = canAnim(), first = new Map();
  if (anim) old.forEach((c, k) => first.set(k, c.getBoundingClientRect()));
  const keep = [], fresh = []; let prev = null;
  const want = new Set([...b.children].map(c => c.getAttribute("data-key") || ""));
  // 找下一個「真正要留下的」元素：跳過空白、正在離開的、等一下要移除的
  const nextReal = n => { while (n && (n.nodeType !== 1 || n._leaving || !want.has(n.getAttribute("data-key") || ""))) n = n.nextSibling; return n; };
  [...b.children].forEach((nb, i) => {
    const k = nb.getAttribute("data-key") || "";
    let el = old.get(k);
    if (el) { old.delete(k); morph(el, nb); el = el.isConnected ? el : nb; if (el !== nb) keep.push([k, el]); }
    else { el = nb; el.style.setProperty("--i", i); fresh.push(el); }
    const ref = nextReal(prev ? prev.nextSibling : a.firstChild);
    if (el !== ref) a.insertBefore(el, ref || null);
    prev = el;
  });
  const leaving = [...old.values()];
  // 會撐開／收起空間的進出場，留下的項目會跟著空間自然移動，不另外移位
  const flowing = anim && [...leaving, ...fresh].some(x => x.nodeType === 1 && !x.matches(TILE));
  leaving.forEach(c => leave(c));
  if (anim) fresh.forEach((el, j) => {
    if (el.nodeType !== 1) return;
    if (el.matches(TILE)) el.animate([{opacity:0, transform:"scale(.95)"}, {opacity:1, transform:"none"}], {duration:T.mid, delay:j*50, easing:EASE, fill:"backwards", id:"ui"});
    else enterBlock(el, (leaving.length ? 200 : 0) + j*90);   // 有東西要離開時，等它先淡出再進來
  });
  if (anim && !flowing) keep.forEach(([k, el]) => {   // 只有單純換位置時才平滑移位
    const f = first.get(k), l = el.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:"none"}], {duration:T.mid, easing:EASE, id:"ui"});
  });
}
function patch(a, b){
  if (a.hasAttribute("data-keep")) return;     /* 由程式自己控制的元素（例如滑動光圈），不要被重畫蓋掉 */
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of [...b.attributes]) if (a.getAttribute(at.name)!==at.value){
    if (at.name==="data-v") tween(a, parseFloat(a.getAttribute("data-v"))||0, parseFloat(at.value)||0, +b.getAttribute("data-d")||0);
    if (at.name==="d" && a.tagName==="path" && morphPath(a, a.getAttribute("d"), at.value)) continue;
    a.setAttribute(at.name, at.value);
  }
  if (a.hasAttribute("data-v")) return;
  if (a.hasAttribute("data-keyed")) return keyedPatch(a, b);
  const ac=[...a.childNodes].filter(n=>!n._leaving), bc=[...b.childNodes];
  bc.forEach((n,i)=>{ if (ac[i]) morph(ac[i], n); else a.appendChild(n); });
  for (let i=bc.length;i<ac.length;i++) leave(ac[i]);
}
function paint(html){
  const tpl = document.createElement("template"); tpl.innerHTML = html.trim();
  const cur = $("#app .dash");
  if (cur) morph(cur, tpl.content.firstElementChild); else { $("#app").innerHTML = ""; $("#app").appendChild(tpl.content.firstElementChild); }
}
function edgeFades(el){
  const t = el.scrollTop > 2, b = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
  if (el.classList.contains("ft") !== t) el.classList.toggle("ft", t);
  if (el.classList.contains("fb") !== b) el.classList.toggle("fb", b);
}
document.addEventListener("scroll", e => { const el = e.target; if (el.matches && el.matches(".hosts,.evs,.tbl,.kv")) edgeFades(el); }, {capture:true, passive:true});
function placePind(){
  document.querySelectorAll("#app .summary").forEach(sm => {
    const ind = sm.querySelector(".pind"), on = sm.querySelector(".pill.on");
    if (!ind) return;
    const st = c => ["ok","warn","bad"].find(x => ind.classList.contains(x)) || "";
    if (on) {
      const pos = `translate(${on.offsetLeft}px,${on.offsetTop}px)`;
      if (!ind.classList.contains("show")) {         // 第一次出現：直接在原地放大浮現，不要從左邊拉過來
        ind.classList.add("noanim");
        ind.style.width = on.offsetWidth + "px"; ind.style.height = on.offsetHeight + "px";
        ind.style.transform = pos + " scale(.82)"; ind.className = "pind noanim " + on.dataset.filter;
        void ind.offsetWidth; ind.classList.remove("noanim");
      }
      ind.style.width = on.offsetWidth + "px"; ind.style.height = on.offsetHeight + "px";
      ind.style.transform = pos + " scale(1)"; ind.className = "pind show " + on.dataset.filter;
    } else if (ind.classList.contains("show")) {    // 取消篩選：原地縮小淡出
      ind.style.transform = ind.style.transform.replace("scale(1)", "scale(.82)"); ind.className = "pind " + st();
    }
  });
}
function render(list){
  // 更新剛完成：跳通知
  for (const s of list) {
    const old = LIST.find(x => keyOf(x) === keyOf(s));
    if (old && old.update && old.update.running && s.update && !s.update.running) {
      const ok = s.update.last && s.update.last.ok, k = s.update.last && s.update.last.n;
      const msg = !ok ? `「${s.name}」更新失敗，可以再試一次` : k ? `「${s.name}」更新完成，裝好 ${k} 個更新 ✨` : k === 0 ? `「${s.name}」檢查完成，已經是最新的 ✨` : `「${s.name}」更新完成 ✨`;
      setTimeout(() => toast(msg, ok ? "ok" : "bad"), 400);
    }
  }
  LIST = list; flagAccent();
  const n = {ok:0,warn:0,bad:0}; list.forEach(s=>n[lvOf(s)]++);
  const time = new Date().toLocaleTimeString("zh-TW",{hour12:false});
  paint(DESK.matches ? renderDesk(list, n, time) : renderMobile(list, n, time));
  placePind();
  document.querySelectorAll("#app .hosts,#app .evs,#app .tbl,#app .kv").forEach(edgeFades);
  if (TIPX) drawTip(...TIPX);
  trackCenter();
}
DESK.addEventListener("change", () => { applyPrefs(); if (LIST.length) render(LIST); });

/* ═════════ 對話框、通知 ═════════ */
function modal({icon, cls="box", title, text, input, ok="確定", cancel="取消"}){
  return new Promise(res => {
    const v = document.createElement("div"); v.className = "veil";
    v.innerHTML = `<div class="dialog glass pop">${icon?`<div class="ico big ${cls}">${I(icon)}</div>`:""}<h3>${esc(title)}</h3>${text?`<p>${esc(text)}</p>`:""}
      ${input!==undefined?`<input class="field" maxlength="40" value="${esc(input)}">`:""}
      <div class="btns"><button class="ubtn ghost" data-r="0">${cancel}</button><button class="ubtn" data-r="1">${ok}</button></div></div>`;
    $("#layer").appendChild(v);
    const inp = v.querySelector("input");
    const done = r => { if (v._d) return; v._d = 1; v.classList.add("closing"); const val = r ? (inp ? inp.value : true) : null;
      setTimeout(()=>{ v.remove(); res(val); }, 360); };
    v._esc = () => done(0);
    if (inp) { setTimeout(()=>{ inp.focus(); inp.select(); }, 60); inp.addEventListener("keydown", e => { if (e.key==="Enter") done(1); if (e.key==="Escape") done(0); }); }
    v.addEventListener("click", e => { if (e.target === v) return done(0); const b = e.target.closest("[data-r]"); if (b) done(+b.dataset.r); });
  });
}
/* 切換主機：舊內容先淡出，換成全新的一頁，再一塊一塊浮上來（不讓兩台的內容互相變形） */
let SWID = 0;
/* 要動的是每一塊玻璃本身：如果讓外層容器變透明，裡面玻璃的模糊會暫時「看不到」背景而變暗，結束時又突然亮起來 */
function swParts(root){
  const g = [...root.querySelectorAll(".glass")].filter(el => !el.parentElement.closest(".glass"));
  return g.concat([...root.children].filter(c => !c.classList.contains("glass") && !c.querySelector(".glass")));
}
async function switchHost(){
  const id = ++SWID, old = $("#app .detail");
  if (!old || !DESK.matches || !canAnim()) return render(LIST);
  old.setAttribute("data-keep", "");               // 淡出期間左邊選單照常更新，右邊先不動
  const R = document.documentElement; R.classList.add("qacc");
  clearTimeout(R._qacc); R._qacc = setTimeout(() => R.classList.remove("qacc"), 400);
  render(LIST);
  const t0 = performance.now();
  const outs = swParts(old).map(el => {
    const o0 = +getComputedStyle(el).opacity;     // 連點時從目前的透明度接著淡，不要閃回來
    el.getAnimations().forEach(x => x.cancel());
    return el.animate([{opacity:o0, transform:"none"}, {opacity:0, transform:"translateY(-6px)"}],
      {duration:T.fast, easing:EXIT, fill:"forwards", id:"ui"}).finished.catch(()=>{});
  });
  await Promise.all(outs);
  const sel = LIST.find(s => keyOf(s) === SEL);
  if (sel && RANGE !== "30m") {                    // 24 小時／7 天：等新主機的資料一下，避免先看到「讀取中」
    const k = keyOf(sel) + "|" + RANGE;
    while (HCACHE[k] && HCACHE[k].loading && performance.now() - t0 < 600) await new Promise(r => setTimeout(r, 30));
  }
  if (id !== SWID || !old.isConnected) return;     // 又點了別台：交給最新那次處理
  const tpl = document.createElement("template"); tpl.innerHTML = sel ? detail(sel).trim() : "";
  const fresh = tpl.content.firstElementChild;
  if (!fresh) { old.remove(); return render(LIST); }
  old.replaceWith(fresh);
  fresh.getAnimations({subtree:true}).forEach(x => x.animationName === "rise" && x.cancel());  // 不跑第一次載入的浮現，改用下面較快的版本
  render(LIST);
  const parts = swParts(fresh), tops = parts.map(el => Math.round(el.getBoundingClientRect().top / 40));
  const rows = [...new Set(tops)].sort((x, y) => x - y);       // 同一排的一起出現，由上往下
  parts.forEach((el, i) => {
    el.animate([{opacity:0, transform:"translateY(10px)"}, {opacity:1, transform:"none"}],
      {duration:T.mid, delay:rows.indexOf(tops[i]) * 50, easing:EASE, fill:"backwards", id:"ui"});
  });
}
/* 滑鼠移到曲線上：顯示那個時間點的數值 */
let TIPX = null;
function tipEls(){
  let t = $("#ctip");
  if (!t) { t = document.createElement("div"); t.id = "ctip"; t.className = "glass pop"; document.body.appendChild(t);
    const l = document.createElement("div"); l.id = "cline"; document.body.appendChild(l); }
  return [t, $("#cline")];
}
function hideTip(){ TIPX = null; const t = $("#ctip"); if (t) { t.classList.remove("show"); $("#cline").classList.remove("show"); } }
function drawTip(x, y){
  const el = document.elementFromPoint(x, y), box = el && el.closest && el.closest(".cbox");
  const svg = box && box.querySelector("svg.chart[data-cid]"), d = svg && CHD[svg.dataset.cid];
  if (!d || !d.ser[0] || !d.ser[0].data || d.ser[0].data.length < 2) return hideTip();
  TIPX = [x, y];
  const r = svg.getBoundingClientRect(), f = Math.max(0, Math.min(1, (x - r.left) / r.width));
  const n = d.ser[0].data.length, i = Math.round(f * (n - 1)), t = d.t && d.t[i];
  const dt = t ? new Date(t * 1000) : null, hm = dt ? dt.toLocaleTimeString("zh-TW", {hour:"2-digit", minute:"2-digit", hour12:false}) : "";
  const when = !dt ? "" : RANGE === "7d" ? `${dt.getMonth()+1}/${dt.getDate()} ${hm}` : hm;
  const [tip, line] = tipEls();
  tip.innerHTML = `<div class="tt">${when}</div>` + d.ser.map(s => `<div class="tr2"><i style="background:${s.color}"></i>${esc(s.name||"")}<b class="num">${d.fmt(s.data[i] ?? 0)}</b></div>`).join("");
  const lx = r.left + f * r.width;
  line.style.cssText = `left:${lx}px;top:${r.top}px;height:${r.height}px`;
  const w = tip.offsetWidth || 150, left = lx + 14 + w > innerWidth - 8 ? lx - 14 - w : lx + 14;
  tip.style.left = left + "px"; tip.style.top = (r.top + 6) + "px";
  tip.classList.add("show"); line.classList.add("show");
}
document.addEventListener("pointermove", e => {
  if (e.pointerType !== "mouse") return;
  if (e.target.closest && e.target.closest(".cbox")) drawTip(e.clientX, e.clientY); else if (TIPX) hideTip();
}, {passive:true});
addEventListener("scroll", () => { if (TIPX) hideTip(); }, {passive:true});
document.addEventListener("pointerleave", hideTip);
/* 整頁平順切換：支援的瀏覽器會淡入淡出，不支援就直接換 */
function smooth(fn, theme, relayout){
  const motion = PREF.motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!motion) return fn();
  if (isLite()) {                       // 輕量模式：蓋一層舊底色再淡出，便宜又順
    if (theme || relayout) {
      const x = document.createElement("div"); x.className = "xfade";
      x.style.background = getComputedStyle(document.documentElement).backgroundColor;
      if (!theme) x.style.animationDuration = ".38s";
      document.body.appendChild(x); setTimeout(() => x.remove(), 500);
      window._vt = (window._vt || 0) + 1; setTimeout(() => window._vt--, 420);
    }
    return requestAnimationFrame(fn);
  }
  if (!document.startViewTransition) return fn();
  window._vt = (window._vt || 0) + 1;
  document.startViewTransition(fn).finished.finally(() => { window._vt--; });
}
function toast(msg, type="ok"){
  const t = document.createElement("div"); t.className = `toast glass pop ${type}`;
  t.innerHTML = `${I(type==="ok"?"ok":"warn")}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  setTimeout(()=>{ t.classList.add("out"); setTimeout(()=>t.remove(), 400); }, 2600);
}

/* ═════════ 設定面板 ═════════ */
function settingsBody(){
  const seg = (k, opts) => `<div class="seg"><span class="ind"></span>${opts.map(([v,l])=>`<button class="${String(getP(k))===String(v)?"on":""}" data-pref="${k}" data-val="${v}">${l}</button>`).join("")}</div>`;
  const tog = k => `<input type="checkbox" class="tog" data-pref="${k}" ${getP(k)?"checked":""}>`;
  const sw = [["blue","#38bdf8,#6366f1"],["purple","#a78bfa,#d946ef"],["green","#34d399,#14b8a6"],["orange","#fbbf24,#f97316"],["pink","#f472b6,#f43f5e"]]
    .map(([v,c])=>`<button class="${PREF.accent===v?"on":""}" data-pref="accent" data-val="${v}" style="background:linear-gradient(135deg,${c})"></button>`).join("")
    + (() => { const p = FLAGPAL[flagCC()] || FLAGDEF;
      return `<button class="flagsw ${PREF.accent==="flag"?"on":""}" data-pref="accent" data-val="flag" title="跟著國旗" style="background:conic-gradient(${p[1]} 0 33%,${p[0]} 0 66%,${p[2]} 0)"><span>旗</span></button>`; })();
  return `
  <div class="sec"><h4>外觀</h4><div class="group">
    <div class="opt"><span class="lab">主題</span>${seg("theme",[["auto","自動"],["light","淺色"],["dark","深色"]])}</div>
    <div class="opt" style="flex-wrap:wrap"><span class="lab">主題色<small>選「旗」會跟著主機的國旗變色（手機跟著畫面中間的卡片）</small></span><div class="sw" style="flex-basis:100%;padding:4px 2px 2px">${sw}</div></div>
    <div class="opt" style="flex-wrap:wrap"><span class="lab">玻璃效果<small>往左越透明、往右越霧面</small></span>
      <div class="slider" style="flex-basis:100%"><span>清透</span><input type="range" min="0" max="100" value="${PREF.glass}" data-pref="glass"><span>霧面</span></div></div>
    <div class="opt"><span class="lab">背景</span>${seg("bg",[["aurora","流光"],["mesh","漸層"],["plain","純色"]])}</div>
  </div></div>
  <div class="sec"><h4>版面</h4><div class="group">
    <div class="opt"><span class="lab">文字大小</span>${seg("size",[["s","小"],["m","中"],["l","大"]])}</div>
    <div class="opt"><span class="lab">卡片</span>${seg("density",[["cozy","寬鬆"],["compact","緊湊"]])}</div>
    <div class="opt"><span class="lab">動畫效果</span>${tog("motion")}</div>
    <div class="opt" style="flex-wrap:wrap"><span class="lab">效能模式<small>「自動」會在手機、或偵測到畫面不順的電腦上，關掉比較吃效能的效果</small></span>
      <div style="flex-basis:100%">${seg("perf",[["auto","自動"],["lite","流暢優先"],["full","完整效果"]])}</div></div>
  </div></div>
  <div class="sec"><h4>要顯示的內容</h4><div class="group">
    <div class="opt">${IC("trend")}<span class="lab">歷史曲線圖</span>${tog("show.chart")}</div>
    <div class="opt">${IC("net")}<span class="lab">網路速度</span>${tog("show.net")}</div>
    <div class="opt">${IC("box")}<span class="lab">容器與服務</span>${tog("show.items")}</div>
    <div class="opt">${IC("info")}<span class="lab">主機概況<small>電腦版才有</small></span>${tog("show.info")}</div>
    <div class="opt">${IC("flag")}<span class="lab">國旗</span>${tog("show.flag")}</div>
    <div class="opt">${IC("month")}<span class="lab">每月流量</span>${tog("show.traffic")}</div>
  </div></div>
  <div class="sec"><h4>軟體更新<button class="linkish" data-selfcheck>檢查新版</button></h4><div class="group selfbox"><div class="opt"><span class="lab"><small>讀取中…</small></span></div></div></div>
  <div class="sec"><h4>通知</h4><div class="group">
    <button class="opt optbtn" data-tg>${IC("bell")}<span class="lab">Telegram 通知<small class="tgst">讀取中…</small></span><span class="chev">${I("chev")}</span></button>
  </div></div>
  <div class="sec"><h4>資料</h4><div class="group">
    <div class="opt"><span class="lab">自動更新<small>多久抓一次最新狀態</small></span>${seg("refresh",[[3,"3 秒"],[5,"5 秒"],[10,"10 秒"],[30,"30 秒"]])}</div>
  </div></div>
  <button class="ubtn ghost reset" data-reset>恢復預設值</button>
  <p class="sub" style="text-align:center;margin-top:12px">外觀設定只存在這台裝置上；Telegram 通知存在主機上</p>`;
}
function moveInd(seg){
  const on = seg.querySelector("button.on"), ind = seg.querySelector(".ind");
  if (!on || !ind) return;
  ind.style.width = on.offsetWidth + "px"; ind.style.transform = `translateX(${on.offsetLeft}px)`;
}
function initSegs(root){
  root.querySelectorAll(".seg").forEach(sg => { sg.classList.add("noanim"); moveInd(sg); });
  requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll(".seg").forEach(sg => sg.classList.remove("noanim"))));
}
/* 編輯主機：名稱＋管理後台網址 */
function hostModal(name, links){
  return new Promise(res => {
    const v = document.createElement("div"); v.className = "veil";
    const row = (x = {name:"", url:""}) => `<div class="lrow"><input class="field ln" maxlength="30" placeholder="名稱，例如 3x-ui" value="${esc(x.name)}"><input class="field lu" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://你的網域:2053/路徑/" value="${esc(x.url)}"><button type="button" class="iconbtn" data-del title="刪掉這個連結">${I("x")}</button></div>`;
    v.innerHTML = `<div class="dialog glass pop hostd"><div class="ico big theme">${I("edit")}</div><h3>編輯主機</h3>
      <div class="form">
        <label>名稱<input class="field" data-k="name" maxlength="40" value="${esc(name)}"><small>中文、英文、表情符號都可以</small></label>
        <div class="lbl">常用連結
          <small>這台主機上的網頁，例如 3x-ui 後台、n8n。只有一個時，點名稱旁的 ↗ 直接打開；有好幾個時會先出現選單</small>
          <div class="lrows">${(links.length ? links : [{name:"", url:""}]).map(row).join("")}</div>
          <button type="button" class="ubtn ghost addl" data-add>＋ 新增連結</button></div>
      </div>
      <div class="btns"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-r="1">儲存</button></div></div>`;
    $("#layer").appendChild(v);
    const box = v.querySelector(".lrows");
    const sync = () => { v.querySelector("[data-add]").style.display = box.children.length >= 6 ? "none" : ""; };
    const done = ok => { if (v._d) return; v._d = 1; v.classList.add("closing");
      const val = ok ? {name: v.querySelector('[data-k="name"]').value.trim(),
        links: [...box.querySelectorAll(".lrow")].map(r => ({name: r.querySelector(".ln").value.trim(), url: r.querySelector(".lu").value.trim()})).filter(x => x.url)} : null;
      setTimeout(() => { v.remove(); res(val); }, 360); };
    v._esc = () => done(0);
    setTimeout(() => v.querySelector('[data-k="name"]').focus(), 60);
    v.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input")) done(1); });
    v.addEventListener("click", e => {
      if (e.target === v) return done(0);
      const b = e.target.closest("[data-r]"); if (b) return done(+b.dataset.r);
      if (e.target.closest("[data-add]")) { box.insertAdjacentHTML("beforeend", row()); const r = box.lastElementChild;
        if (canAnim()) r.animate([{opacity:0, transform:"translateY(-4px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE});
        r.querySelector(".ln").focus(); return sync(); }
      const d = e.target.closest("[data-del]");
      if (d) { const r = d.closest(".lrow");
        if (box.children.length === 1) { r.querySelectorAll("input").forEach(i => i.value = ""); return; }
        r.remove(); sync(); }
    });
    sync();
  });
}
/* 有好幾個常用連結：點 ↗ 出現小選單 */
function linksMenu(btn, s){
  closeMenu();
  const m = document.createElement("div"); m.className = "lmenu glass pop";
  m.innerHTML = linksOf(s).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><i class="ld ${x.up===false?"bad":x.up?"ok":""}"></i><span>${esc(x.name)}<small>${esc(linkSt(x))}</small></span>${I("ext")}</a>`).join("");
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(), w = m.offsetWidth;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
  m.style.top = (r.bottom + 8) + "px";
  if (canAnim()) m.animate([{opacity:0, transform:"translateY(-6px) scale(.97)"}, {opacity:1, transform:"none"}], {duration:T.fast, easing:EASE});
  window._menu = m;
  setTimeout(() => m.addEventListener("click", () => closeMenu()), 0);
}
function closeMenu(){
  const m = window._menu; if (!m) return; window._menu = null;
  if (!canAnim()) return m.remove();
  m.animate([{opacity:1}, {opacity:0, transform:"translateY(-4px) scale(.98)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}).finished.then(() => m.remove());
}
addEventListener("scroll", closeMenu, {passive:true, capture:true});
addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
/* ═════════ 更新哨兵本身 ═════════ */
async function selfCall(node, action){
  const r = await fetch("/api/self?node=" + encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify({action})});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || (r.status === 404 ? "這台還是舊版，請先手動更新一次" : "讀取失敗"));
  return d;
}
const SELFST = {};
async function selfStatus(root, force){
  const box = root.querySelector(".selfbox"); if (!box) return;
  const hosts = LIST.filter(x => x.online);
  const res = await Promise.all(hosts.map(h => selfCall(h.node || "", force ? "check" : "status").then(d => [h, d]).catch(e => [h, {err: e.message, old: true}])));
  if (!box.isConnected) return;
  res.forEach(([h, d]) => SELFST[keyOf(h)] = d);
  const pend = res.reduce((n, [, d]) => n + (d.has && !d.running ? 1 : 0) + (d.cloud && d.cloud.has && !d.cloud.running ? 1 : 0), 0);
  const rows = res.map(([h, d]) => {
    const node = esc(h.node || "");
    const st = d.running ? `<span class="spin"></span>更新中…` : d.old || d.supported === false ? `<span class="warn">${esc(d.err)}</span>`
      : d.has ? `<span class="new">有新版可以更新</span>` : d.err ? esc(d.err) : "已經是最新版 ✨";
    const ch = d.has && d.changes && d.changes.length ? `<ul class="chg">${d.changes.slice(0, 5).map(c => `<li>${esc(c.split("\n")[0])}</li>`).join("")}</ul>` : "";
    const c = d.cloud;
    const cst = !c ? "" : c.running ? `<span class="spin"></span>更新中…` : c.has ? `<span class="new">官方有新版可以更新</span>` : c.err ? `<span class="warn">${esc(c.err)}</span>` : c.has === false ? "已經是最新版 ✨" : "還沒檢查";
    const crow = c ? `<div class="cl2"><span>${I("cloud")}雲端硬碟<small>${c.version ? `版本 ${esc(c.version)}・` : ""}${cst}</small></span>
      ${c.has && !c.running ? `<button class="ubtn sm" data-cloudup="${node}">更新</button>` : ""}</div>` : "";
    const srow = `<div class="cl2 first"><span>${I("upd")}哨兵<small>${d.version ? `版本 ${esc(d.version)}・${esc(d.build || "")}・` : ""}${st}</small>${ch}</span>
      ${d.has && !d.running ? `<button class="ubtn sm" data-selfup="${node}">更新</button>` : ""}</div>`;
    return `<div class="opt selfrow"><div class="lab"><b class="hn">${esc(h.name)}</b>${srow}${crow}</div></div>`;
  }).join("");
  box.innerHTML = rows + (pend > 1 ? `<div class="opt"><span class="lab"></span><button class="ubtn sm" data-selfup="*">全部更新</button></div>` : "");
}
/* jobs：[{node, kind:"self"|"cloud"}]；不給就是「全部更新」 */
async function selfUpdate(root, jobs){
  if (!jobs) { jobs = [];
    for (const [k, d] of Object.entries(SELFST)) { const node = (LIST.find(x => keyOf(x) === k) || {}).node || "";
      if (d.has && !d.running) jobs.push({node, kind:"self"});
      if (d.cloud && d.cloud.has && !d.cloud.running) jobs.push({node, kind:"cloud"}); } }
  const onlyCloud = jobs.every(j => j.kind === "cloud");
  const ok = await modal({icon:"upd", cls:"theme", title: onlyCloud ? "更新雲端硬碟？" : "開始更新？",
    text: onlyCloud ? "會下載官方最新的穩定版並重新啟動，\n大約 30 秒～1 分鐘，期間暫時打不開，檔案和帳號都會保留。"
      : "會下載新版並自動重新啟動，\n大約 10～60 秒，你的設定和檔案都會保留。", ok:"開始更新"});
  if (!ok) return;
  const okn = [], fail = [];
  jobs.sort((a, b) => (a.node === "" && a.kind === "self") - (b.node === "" && b.kind === "self"));   // 這台的哨兵最後更新（更新完畫面會重新載入）
  for (const j of jobs) {
    const name = ((LIST.find(x => (x.node || "") === j.node) || {}).name || "主機") + (j.kind === "cloud" ? " 的雲端硬碟" : "");
    try { await selfCall(j.node, j.kind === "cloud" ? "cloud_update" : "update"); okn.push(name); } catch(e) { fail.push(`${name}：${e.message}`); }
  }
  if (okn.length) toast(okn.length > 1 ? `已開始更新 ${okn.length} 個項目，大約 1 分鐘內完成` : `已開始更新「${okn[0]}」`);   // 只跳一則
  if (fail.length) setTimeout(() => toast(fail.join("；"), "bad"), okn.length ? 600 : 0);
  setTimeout(() => selfStatus(root), 1500);
  const poll = setInterval(() => { if (!root.isConnected) return clearInterval(poll); selfStatus(root); }, 5000);
  setTimeout(() => clearInterval(poll), 120000);
}
/* ═════════ Telegram 通知設定 ═════════ */
async function tgCall(body){
  const r = await fetch("/api/telegram", {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || (r.status === 404 ? "這台主機還沒更新到新版" : "發生錯誤"));
  return d;
}
async function tgStatus(root){
  const el = root.querySelector(".tgst"); if (!el) return;
  try { const d = await tgCall({action:"status"});
    el.textContent = d.on ? `已開啟・由 ${d.bot || "機器人"} 傳送・${d.keep ? `保留 ${d.keep >= 24 ? Math.round(d.keep/24) + " 天" : d.keep + " 小時"}` : "不自動刪除"}` : d.has_token ? "還沒設定要傳到哪裡" : "還沒設定，點這裡開始";
    el.classList.toggle("on", !!d.on);
  } catch(e) { el.textContent = e.message; }
}
async function tgModal(){
  const st = await tgCall({action:"status"}).catch(() => ({}));
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog glass pop tgd">${IC("bell","big")}<h3>Telegram 通知</h3>
    <p>主機出問題、恢復正常、更新完成時，傳訊息到你的 Telegram</p>
    <div class="form">
      <label>① 機器人密碼<input class="field" data-k="token" autocomplete="off" spellcheck="false" placeholder="${st.has_token ? "已經設定過，不用改就留空" : "123456789:AAH…"}">
        <small>在 Telegram 搜尋 <b>@BotFather</b>，傳送 <b>/newbot</b>，照著取好名字，最後它給你的那一串就是密碼</small></label>
      <div class="lbl">② 要傳到哪裡
        <small>先在 Telegram 傳一句話給你的機器人（要傳到群組，就把機器人加進群組再講一句話），然後按「自動尋找」</small>
        <button type="button" class="ubtn ghost find" data-find>${I("search")}自動尋找</button>
        <div class="chats"></div>
        <input class="field" data-k="chat" inputmode="text" autocomplete="off" placeholder="可以留空，會自動找" value="${esc(st.chat || "")}"></div>
      <div class="lbl">③ 通知保留多久
        <small>時間到了會自動從 Telegram 刪掉，聊天室不會越堆越多（Telegram 最多只能刪 2 天內的訊息）</small>
        <div class="seg keep">${[[0,"不刪除"],[1,"1 小時"],[6,"6 小時"],[24,"1 天"],[47,"2 天"]].map(([h,l])=>`<button type="button" data-keep="${h}" class="${(+st.keep||0)===h?"on":""}">${l}</button>`).join("")}</div></div>
      <div class="msg" aria-live="polite"></div>
    </div>
    <div class="btns three"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn ghost" data-test>測試</button><button class="ubtn" data-save>儲存</button></div>
    ${st.on ? `<button class="linkbtn" data-off>關閉 Telegram 通知</button>` : ""}</div>`;
  $("#layer").appendChild(v);
  const q = k => v.querySelector(`[data-k="${k}"]`), msg = v.querySelector(".msg");
  const say = (t, cls) => { msg.textContent = t || ""; msg.className = "msg " + (cls || ""); };
  const vals = () => ({token: q("token").value.trim(), chat: q("chat").value.trim(), keep: +((v.querySelector("[data-keep].on") || {}).dataset || {keep:0}).keep});
  let busy = false;
  const run = async (btn, label, fn) => {
    if (busy) return; busy = true; const old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${label}`; say("");
    try { await fn(); } catch(e) { say(e.message, "bad"); }
    btn.disabled = false; btn.innerHTML = old; busy = false;
  };
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", e => {
      const t = e.target;
      if (t === v || t.closest("[data-r]")) return done();
      const f = t.closest("[data-find]");
      if (f) return run(f, "尋找中…", async () => {
        const d = await tgCall({action:"find", token: vals().token});
        const box = v.querySelector(".chats");
        box.innerHTML = d.chats.map(c => `<button type="button" data-chat="${esc(c.id)}">${esc(c.name)}</button>`).join("");
        if (d.chats.length === 1) { q("chat").value = d.chats[0].id; box.firstChild.classList.add("on"); }
        say(d.chats.length > 1 ? `找到 ${d.chats.length} 個聊天，點一下要傳去哪裡` : `找到了！通知會傳到「${d.chats[0].name}」`, "ok");
      });
      const kp = t.closest("[data-keep]");
      if (kp) { v.querySelectorAll("[data-keep]").forEach(x => x.classList.toggle("on", x === kp)); return; }
      const c = t.closest("[data-chat]");
      if (c) { q("chat").value = c.dataset.chat; v.querySelectorAll("[data-chat]").forEach(x => x.classList.toggle("on", x === c)); return say(""); }
      const tb = t.closest("[data-test]");
      if (tb) return run(tb, "傳送中…", async () => { const d = await tgCall({action:"test", ...vals()}); if (d.chat) q("chat").value = d.chat; say(d.message, "ok"); });
      const sb = t.closest("[data-save]");
      if (sb) return run(sb, "儲存中…", async () => { const d = await tgCall({action:"save", ...vals()}); toast(d.message); done(); });
      const ob = t.closest("[data-off]");
      if (ob) return run(ob, "關閉中…", async () => { const d = await tgCall({action:"save", off:true}); toast(d.message); done(); });
    });
    q("chat").addEventListener("input", () => v.querySelectorAll("[data-chat]").forEach(x => x.classList.remove("on")));
  });
}
function openSettings(){
  if ($(".sheetv")) return;
  const v = document.createElement("div"); v.className = "veil sheetv";
  v.innerHTML = `<div class="sheet glass pop"><div class="grab"></div><div class="top"><h3>外觀與設定</h3><button class="iconbtn" data-close>${I("x")}</button></div><div class="sbody">${settingsBody()}</div></div>`;
  $("#layer").appendChild(v);
  const sheet = v.querySelector(".sheet"), body = v.querySelector(".sbody"), top = v.querySelector(".top");
  body.addEventListener("scroll", () => top.classList.toggle("under", body.scrollTop > 4), {passive:true});
  initSegs(body);
  tgStatus(body); selfStatus(body);
  sheet.addEventListener("animationend", e => { if (e.target === sheet && !v._d) sheet.classList.add("ready"); });
  const close = () => { if (v._d) return; v._d = 1; sheet.classList.remove("back"); v.classList.add("closing"); setTimeout(()=>v.remove(), 380); };
  v._esc = close;

  v.addEventListener("click", e => {
    if (e.target === v || e.target.closest("[data-close]")) return close();
    if (e.target.closest("[data-tg]")) return tgModal().then(() => tgStatus(body));
    const sc = e.target.closest("[data-selfcheck]");
    if (sc) { sc.disabled = true; sc.textContent = "檢查中…"; return selfStatus(body, true).finally(() => { sc.disabled = false; sc.textContent = "檢查新版"; }); }
    const su = e.target.closest("[data-selfup]");
    if (su) return selfUpdate(body, su.dataset.selfup === "*" ? null : [{node: su.dataset.selfup, kind:"self"}]);
    const cu = e.target.closest("[data-cloudup]");
    if (cu) return selfUpdate(body, [{node: cu.dataset.cloudup, kind:"cloud"}]);
    const b = e.target.closest("[data-val]");
    if (b) {
      const raw = b.dataset.val, k = b.dataset.pref;
      if (String(getP(k)) === raw) return;
      setP(k, /^\d+$/.test(raw) ? +raw : raw);
      const box = b.parentElement;                 // 原地切換，不重畫整個面板
      box.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      if (box.classList.contains("seg")) moveInd(box);
      changed(k);
    }
    if (e.target.closest("[data-reset]")) {
      PREF = JSON.parse(JSON.stringify(DEF)); store("vps-prefs", JSON.stringify(PREF));
      smooth(() => { body.innerHTML = settingsBody(); initSegs(body); applyPrefs(); if (LIST.length) render(LIST); }, true);
      restart(); toast("已恢復預設值");
    }
  });
  v.addEventListener("change", e => { const t = e.target; if (t.classList.contains("tog")) { setP(t.dataset.pref, t.checked); setTimeout(() => changed(t.dataset.pref), 180); } });
  v.addEventListener("input", e => { const t = e.target; if (t.type === "range") { setP("glass", +t.value); applyPrefs(); } });

  // 手機：往下滑關閉
  let y0 = null, dy = 0, t0 = 0;
  const startDrag = e => { if (DESK.matches || e.target.closest("button")) return; y0 = e.clientY; dy = 0; t0 = performance.now();
    sheet.classList.add("ready"); sheet.classList.remove("back"); sheet.style.transition = "none"; sheet.setPointerCapture?.(e.pointerId); };
  const moveDrag = e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`;
    v.style.opacity = String(1 - Math.min(dy / 600, .5)); };
  const endDrag = () => { if (y0 === null) return; y0 = null; sheet.style.transition = "";
    const fast = dy / Math.max(1, performance.now() - t0) > .6;
    if (dy > 120 || (fast && dy > 30)) { v.style.opacity = ""; close(); }
    else { sheet.classList.add("back"); sheet.style.transform = ""; v.style.opacity = ""; } };
  [".grab", ".top"].forEach(sel => sheet.querySelector(sel).addEventListener("pointerdown", startDrag));
  sheet.addEventListener("pointermove", moveDrag); sheet.addEventListener("pointerup", endDrag); sheet.addEventListener("pointercancel", endDrag);

  function changed(k){
    const big = ["theme","accent","bg","size","density","perf"].includes(k) || k.startsWith("show.");
    const run = () => { applyPrefs(); if (LIST.length) render(LIST); };
    // 文字大小、卡片密度會讓整頁重新排版；電腦版開關面板會讓格子重排 → 用淡入淡出蓋過去
    const relayout = ["size","density","perf"].includes(k) || (DESK.matches && k.startsWith("show."));
    big && k !== "accent" ? smooth(run, ["theme","bg"].includes(k), relayout) : run();
    if (k === "refresh") restart();
  }
}
function restart(){ clearTimeout(timer); timer = setTimeout(tick, (PREF.refresh || 5) * 1000); }
addEventListener("keydown", e => { if (e.key === "Escape") { const v = [...document.querySelectorAll("#layer .veil")].pop(); if (v && v._esc) v._esc(); } });

/* ═════════ 登入 ═════════ */
function login(msg){
  $("#app").innerHTML = `<div class="login glass ${msg?"shake":""}"><svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lblg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--a1) 70%,#fff)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient><linearGradient id="lhlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="lmlg"><rect width="512" height="512" fill="#fff"/><path d="M204 258l36 36 72-76" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="512" height="512" rx="115" fill="url(#lblg)"/><rect width="512" height="512" rx="115" fill="url(#lhlg)"/><path d="M256 108 371 150c9 3 15 12 15 22v72c0 84-52 140-122 168-5 2-11 2-16 0-70-28-122-84-122-168v-72c0-10 6-19 15-22Z" fill="#fff" mask="url(#lmlg)" transform="translate(256 262) scale(.88) translate(-256 -258)"/></svg><h1>VPS 哨兵</h1><p>輸入存取密碼就能看到你的主機</p>
    <input id="tok" class="field" type="password" placeholder="存取密碼" autocomplete="current-password">
    <div class="err">${msg||""}</div><button class="ubtn" data-login>進入</button></div>`;
  $("#tok").addEventListener("keydown",e=>{ if(e.key==="Enter"){ setTok(e.target.value.trim()); tick(); }});
}

/* ═════════ 點擊 ═════════ */
document.addEventListener("click", async e => {
  if (e.target.closest("#layer")) return;
  const t = e.target;
  if (t.closest("[data-login]")) { setTok($("#tok").value.trim()); return tick(); }
  if (t.closest("[data-settings]")) return openSettings();
  const rg = t.closest("[data-range]");
  if (rg) { if (RANGE !== rg.dataset.range) { RANGE = rg.dataset.range; store("vps-range", RANGE); render(LIST); } return; }
  const tf = t.closest("[data-traffic]");
  if (tf) return trafficModal(tf.dataset.traffic, tf.dataset.label);
  if (t.closest("[data-refresh]")) return refreshNow(t.closest("[data-refresh]"));
  if (t.closest("[data-logout]")) {
    if (await modal({icon:"logout", cls:"info", title:"要登出嗎？", text:"登出後要重新輸入密碼才能看到主機。", ok:"登出"})) { setTok(""); LIST = []; clearTimeout(timer); login(); }
    return;
  }
  const tg = t.closest("[data-toggle]");
  if (tg) { const k = tg.dataset.toggle; open[k] = !open[k]; tg.parentElement.classList.toggle("open", open[k]); return; }
  const fl = t.closest("[data-filter]");
  if (fl) {
    FILTER = FILTER===fl.dataset.filter ? "" : fl.dataset.filter;
    if (canAnim()) fl.animate([{transform:"scale(1)"}, {transform:"scale(.9)"}, {transform:"scale(1.05)"}, {transform:"scale(1)"}],
                              {duration:T.mid, easing:SPRING});
    return render(LIST);
  }

  const lk = t.closest("[data-links]");
  if (lk) { e.stopPropagation(); const s = LIST.find(x => keyOf(x) === lk.dataset.links); if (window._menu) return closeMenu(); return s && linksMenu(lk, s); }
  if (window._menu && !t.closest(".lmenu")) closeMenu();
  const rn = t.closest("[data-rename]");
  if (rn) {
    e.stopPropagation();
    const old = rn.dataset.name, node = rn.dataset.rename, hs = LIST.find(x => (x.node || "") === node);
    const oldl = hs ? linksOf(hs).filter(x => !x.fixed) : [];
    const r0 = await hostModal(old, oldl);
    if (!r0) return;
    const post = (path, body) => fetch(path + "?node=" + encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)})
      .then(async r => { const d = await r.json().catch(()=>({})); if (!(r.ok && d.ok)) throw new Error(d.message || d.error || (r.status === 404 ? "那台主機還沒更新到新版" : "儲存失敗")); return d; });
    try {
      const msgs = [];
      if (r0.name && r0.name !== old) { await post("/api/rename", {name:r0.name}); msgs.push(`已改名為「${r0.name}」`); }
      if (JSON.stringify(r0.links) !== JSON.stringify(oldl.map(x => ({name:x.name, url:x.url})))) msgs.push((await post("/api/links", {links:r0.links})).message);
      if (msgs.length) toast(msgs.join("，"));
    } catch(err) { toast(err.message === "Failed to fetch" ? "連線失敗，請稍後再試" : err.message, "bad"); }
    return tick();
  }
  const rv = t.closest("[data-reveal]");
  if (rv) {
    const k = rv.dataset.reveal;
    { IPSHOW[k] = Date.now() + 15000; setTimeout(() => { if (IPSHOW[k] <= Date.now()) { delete IPSHOW[k]; render(LIST); } }, 15100); }   // 15 秒後自動再遮起來
    return render(LIST);
  }
  const cp = t.closest("[data-copy]");
  if (cp) {
    const txt = cp.dataset.copy;
    try { await navigator.clipboard.writeText(txt); }
    catch(e) { const ta = document.createElement("textarea"); ta.value = txt; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch(_) {} ta.remove(); }
    return toast(`已複製 ${txt}`);
  }
  const hs = t.closest("[data-sel]");
  if (hs) {
    if (hs.dataset.sel === SEL) return;
    SEL = hs.dataset.sel; store("vps-sel", SEL); scrollTo({top:0, behavior:"smooth"});
    return switchHost();
  }

  const ub = t.closest("[data-update]");
  if (ub) {
    const node = ub.dataset.update, label = ub.dataset.label, n = +ub.dataset.n;
    const ok = await modal({icon:"upd", cls:"theme", title: n ? `更新「${label}」？` : `檢查「${label}」的更新？`,
      text: n ? `會在背景安裝 ${n} 個套件更新，大約 1～5 分鐘。\n期間部分服務可能會短暫重新啟動。` : "目前沒有偵測到更新，\n要重新檢查並安裝最新的更新嗎？", ok: n ? "開始更新" : "檢查"});
    if (!ok) return;
    ub.disabled = true;
    try {
      const r = await fetch("/api/update?node="+encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok()}});
      const d = await r.json().catch(()=>({}));
      if (!(r.ok && d.ok)) toast(d.message || d.error || "無法開始更新", "bad");
    } catch(err) { toast("連線失敗，請稍後再試", "bad"); }
    return tick();
  }
});
addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > 40), {passive:true});

/* ═════════ 定時抓資料 ═════════ */
let timer;
const T0 = performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms));
let BOOTED = false, REFRESHING = false;
function splashMsg(t){ const m = document.querySelector(".sp-msg"); if (m && m.textContent !== t) m.innerHTML = `<span>${esc(t)}</span>`; }
function endSplash(){
  if (BOOTED) return; BOOTED = true;
  probePerf();
  const sp = $("#splash"); document.documentElement.classList.remove("booting");
  if (!sp) return;
  if (!canAnim()) return sp.remove();
  sp.classList.add("out"); setTimeout(() => sp.remove(), 650);
}
/* 預先載入國旗圖片，避免畫面出來後才一個個冒出來 */
function preloadFlags(list){
  if (!PREF.show.flag) return Promise.resolve();
  const ccs = [...new Set(list.map(s => s.geo && s.geo.cc).filter(c => /^[A-Z]{2}$/.test(c || "")))];
  return Promise.all(ccs.map(cc => new Promise(res => {
    const im = new Image(); im.onload = () => (im.decode ? im.decode().catch(()=>{}) : Promise.resolve()).then(res);
    im.onerror = () => { FLAGFAIL[cc] = 1; res(); }; im.src = `https://flagcdn.com/w80/${cc.toLowerCase()}.png`;
  })));
}
/* 等介面動畫（收起、展開、移位）播完再更新畫面，最多等 0.9 秒，避免兩邊搶著動 */
function uiBusy(){ return document.getAnimations().some(a => a.id === "ui" && a.playState === "running"); }
async function settle(){
  const t0 = performance.now();
  while (uiBusy() && performance.now() - t0 < 900) await sleep(60);
  await new Promise(r => requestAnimationFrame(r));       // 對齊下一格畫面再改
}
async function tick(){
  clearTimeout(timer);
  if (!getTok()) { endSplash(); return login(); }
  try {
    if (!BOOTED) splashMsg("讀取主機狀態…");
    const r = await fetch("/api/all", {headers:{"X-Token":getTok()}, cache:"no-store"});
    if (r.status === 401) { setTok(""); LIST = []; endSplash(); return login("密碼不對，再試一次"); }
    const data = await r.json();
    const me = data.find(x => !x.node);
    if (new URLSearchParams(location.search).get("go") === "cloud" && me && me.cloud && !window._goCloud) {   // 從雲端硬碟跳過來登入：登入好了就送回去
      window._goCloud = true;
      await fetch("/api/cloud-login", {method:"POST", headers:{"X-Token":getTok()}}).catch(() => {});
      return location.replace("/cloud/");
    }
    if (me && me.build) {
      if (!window._build) window._build = me.build;
      else if (me.build !== window._build && !window._reloading) {   // 這台的哨兵剛更新好：重新載入換上新畫面
        window._reloading = true; toast("哨兵已更新到新版，重新載入中…");
        setTimeout(() => location.reload(), 1400);
      }
    }
    if (!BOOTED) {
      splashMsg("準備畫面…");
      // 字型和國旗最多等 1.5 秒；啟動畫面至少顯示 0.7 秒，避免一閃而過
      await Promise.race([Promise.all([document.fonts ? document.fonts.ready : null, preloadFlags(data)]), sleep(1500)]);
      const wait = 700 - (performance.now() - T0); if (wait > 0) await sleep(wait);
      endSplash();
    }
    if (BOOTED) await settle();
    render(data);
  } catch(e) {
    if (!BOOTED) splashMsg("連線不上，正在重試…");
    const m = document.querySelector(".meta"); if (m) m.innerHTML = `<span class="live off"></span>連線中斷，重試中…`;
    timer = setTimeout(tick, 3000); return false;
  }
  const busy = LIST.some(s => s.update && s.update.running);   // 更新中就看得勤一點
  timer = setTimeout(tick, busy ? 2000 : (PREF.refresh || 5) * 1000);
  return true;
}
/* 手動重新整理（按鈕或下拉） */
async function refreshNow(btn){
  if (REFRESHING) return; REFRESHING = true;
  btn && btn.classList.add("spinning");
  const [ok] = await Promise.all([tick(), sleep(600)]);
  REFRESHING = false; btn && btn.classList.remove("spinning");
  document.querySelectorAll("[data-refresh]").forEach(b => b.classList.remove("spinning"));
  return ok;
}
/* 手機：下拉重新整理 */
(function(){
  const ptr = $("#ptr"); ptr.innerHTML = I("down");
  let y0 = null, d = 0, armed = false;
  const show = (y, rot) => { ptr.style.transform = `translateY(${y}px) rotate(${rot}deg)`; ptr.style.opacity = String(Math.min(1, (y + 70) / 60)); };
  addEventListener("touchstart", e => {
    if (DESK.matches || scrollY > 0 || REFRESHING || document.querySelector("#layer .veil") || !LIST.length) return;
    y0 = e.touches[0].clientY; d = 0; armed = false; ptr.classList.remove("back","spin","done"); ptr.innerHTML = I("down");
  }, {passive:true});
  addEventListener("touchmove", e => {
    if (y0 === null) return;
    d = Math.max(0, e.touches[0].clientY - y0);
    if (scrollY > 0) { y0 = null; return; }
    const pull = Math.min(110, d * .5);
    armed = pull >= 64;
    show(pull - 70, armed ? 180 : pull * 2.6);
  }, {passive:true});
  addEventListener("touchend", async () => {
    if (y0 === null) return; y0 = null;
    ptr.classList.add("back");
    if (!armed) { show(-70, 0); return; }
    ptr.innerHTML = I("upd"); ptr.classList.add("spin"); show(10, 0);
    const ok = await refreshNow();
    ptr.classList.remove("spin"); if (ok) ptr.classList.add("done");
    ptr.innerHTML = I(ok ? "ok" : "warn");
    setTimeout(() => show(-70, 0), 550);
  });
})();
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) tick(); });
tick();
</script>
</body>
</html>"""


def main():
    def stop(*_):
        COL.save()
        log("已存檔，結束")
        sys.exit(0)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    threading.Thread(target=COL.loop, daemon=True).start()
    threading.Thread(target=alert_loop, daemon=True).start()      # 沒設定時也會跑，網頁上一設定好就開始通知
    srv = ThreadingHTTPServer((BIND, PORT), Handler)
    log(f"VPS 哨兵 {VERSION} 已啟動：http://{BIND}:{PORT}  名稱={NAME}  其他主機={len(PEERS)} 台  "
        f"Telegram={'開' if TG_BOT and TG_CHAT else '關'}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
