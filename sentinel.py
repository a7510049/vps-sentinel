#!/usr/bin/env python3
"""
VPS 哨兵 精簡版
- 單一檔案，只用 Python 內建模組（不用另外安裝任何套件）
- VPS 上直接跑，手機打開網頁就能看狀態，可加到主畫面當 App 用
- 可選：異常時直接推 Telegram
- 可選：一台當「總覽」，順便顯示其他 VPS
設定檔：/etc/vps-sentinel-lite.conf（可用環境變數 SENTINEL_CONF 指定別的位置）
"""
import hmac
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.3"

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
BIND = C.get("BIND", "0.0.0.0")
PORT = int(C.get("PORT", "8787"))
TOKEN = C.get("TOKEN", "")
SERVICES = [s.strip() for s in C.get("SERVICES", "").split(",") if s.strip()]
DISKS = [d.strip() for d in C.get("DISKS", "/").split(",") if d.strip()]
TG_BOT = C.get("TG_BOT_TOKEN", "")
TG_CHAT = C.get("TG_CHAT_ID", "")
ALERT_CPU = float(C.get("ALERT_CPU", "90"))
ALERT_MEM = float(C.get("ALERT_MEM", "90"))
ALERT_DISK = float(C.get("ALERT_DISK", "90"))
CPU_MINUTES = float(C.get("ALERT_CPU_MINUTES", "5"))


def parse_peers(raw):
    """PEERS=東京=http://100.x.x.x:8787,大阪=http://100.y.y.y:8787|另一組密碼"""
    peers = []
    for item in raw.split(","):
        item = item.strip()
        if "=" not in item:
            continue
        name, rest = item.split("=", 1)
        url, _, tok = rest.partition("|")
        peers.append({"name": name.strip(), "url": url.strip().rstrip("/"),
                      "token": tok.strip() or TOKEN})
    return peers


PEERS = parse_peers(C.get("PEERS", ""))

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


def net_bytes():
    rx = tx = 0
    for line in read("/proc/net/dev").splitlines()[2:]:
        if ":" not in line:
            continue
        iface, data = line.split(":", 1)
        iface = iface.strip()
        if iface == "lo" or iface.startswith(("docker", "veth", "br-")):
            continue
        f = data.split()
        rx += int(f[0])
        tx += int(f[8])
    return rx, tx


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
                     "{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Image}}"], 10)
    if code != 0:
        return None
    items = []
    for line in out.strip().splitlines():
        p = line.split("\t")
        if len(p) >= 4:
            items.append({"name": p[0], "state": p[1], "status": p[2], "image": p[3]})
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


# ───────────────────────── 改名 ─────────────────────────

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
    if C.get("COUNTRY"):                       # 設定檔可以手動指定
        return {"cc": C["COUNTRY"].upper(), "city": C.get("CITY", ""), "org": ""}
    for url in ("https://ipinfo.io/json", "https://api.country.is/"):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "vps-sentinel-lite",
                                                       "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=8) as r:
                d = json.loads(r.read())
            cc = (d.get("country") or "").upper()
            if len(cc) == 2:
                return {"cc": cc, "city": d.get("city", ""),
                        "org": re.sub(r"^AS\d+\s+", "", d.get("org", ""))}
        except Exception:  # noqa: BLE001
            pass
    return None


# ───────────────────────── 系統更新 ─────────────────────────

UPDATE_UNIT = "vps-sentinel-update"
UPDATE_LOG = "/var/log/vps-sentinel-update.log"
UPDATE_SCRIPT = r"""set -u
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1
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
    for line in reversed(lines):
        if line.startswith("__RESULT__"):
            parts = line.split()
            try:
                return {"ok": parts[1] == "ok", "time": float(parts[2])}
            except (IndexError, ValueError):
                return None
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
    return True, "已開始更新"


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
        self.upd_running = False
        self.upd_last = update_last()

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
                    threading.Thread(target=tg_send, daemon=True, args=(
                        f"{'✅' if ok else '❌'} {NAME} 系統更新{'完成' if ok else '失敗'}",)).start()
                self.upd_running = now
            if tick % 900 == 0 or recheck:            # 每 30 分鐘：可更新套件數
                u = apt_updates()
                with self.lock:
                    self.updates = u
            if tick % 10800 == 0:                     # 每 6 小時：IP 所在國家
                g = lookup_geo()
                if g:
                    with self.lock:
                        self.geo = g
            tick += 1

    def snapshot(self):
        with self.lock:
            cpu, net = self.cpu_pct, dict(self.net)
            containers, services, updates = self.containers, list(self.services), self.updates
            high_since = self.cpu_high_since
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

        notices = []
        if reboot:
            notices.append("需要重新開機")
        if updates and updates["security"]:
            notices.append(f"{updates['security']} 個安全更新")

        return {
            "name": NAME, "node": "", "online": True, "version": VERSION, "time": time.time(),
            "os": os_name(), "kernel": os.uname().release,
            "uptime": float(read("/proc/uptime", "0").split()[0] or 0),
            "cores": os.cpu_count() or 1, "cpu": cpu, "load": [round(x, 2) for x in load],
            "mem": mem, "disks": disks, "net": net,
            "containers": containers, "services": services,
            "updates": updates, "reboot": reboot, "geo": geo, "update": upd,
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
        return data
    except Exception as e:  # noqa: BLE001
        return {"name": p["name"], "node": p["name"], "online": False, "level": "bad",
                "problems": ["連不上"], "error": str(e)[:120]}


POOL = ThreadPoolExecutor(max_workers=8)


def all_status():
    peers = list(POOL.map(fetch_peer, PEERS)) if PEERS else []
    return [COL.snapshot()] + peers


# ───────────────────────── Telegram 通知 ─────────────────────────

def tg_send(text):
    if not (TG_BOT and TG_CHAT):
        return
    try:
        body = urllib.parse.urlencode({"chat_id": TG_CHAT, "text": text}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{TG_BOT}/sendMessage",
                               data=body, timeout=10).read()
    except Exception as e:  # noqa: BLE001
        log("Telegram 傳送失敗：", e)


def alert_loop():
    time.sleep(40)                     # 等第一輪資料收集完
    known = {}                         # 伺服器名稱 → 目前的問題集合
    offline_count = {}
    tg_send(f"🛡️ VPS 哨兵已啟動：{NAME}")
    while True:
        for s in all_status():
            name = s["name"]
            if not s.get("online"):
                offline_count[name] = offline_count.get(name, 0) + 1
                if offline_count[name] < 3:   # 連續 3 次（約 3 分鐘）才算斷線
                    continue
            else:
                offline_count[name] = 0
            now = set(s.get("problems", []))
            before = known.get(name, set())
            new, gone = now - before, before - now
            if new:
                tg_send(f"⚠️ {name}\n" + "\n".join(f"• {x}" for x in sorted(new)))
            if gone and before:
                tg_send(f"✅ {name} 已恢復\n" + "\n".join(f"• {x}" for x in sorted(gone)))
            known[name] = now
        time.sleep(60)


# ───────────────────────── 網頁伺服器 ─────────────────────────

ICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        '<rect width="512" height="512" rx="112" fill="#0f172a"/>'
        '<path d="M256 96 384 144v96c0 88-56 152-128 176-72-24-128-88-128-176v-96z" '
        'fill="none" stroke="#38bdf8" stroke-width="28" stroke-linejoin="round"/>'
        '<path d="m200 256 40 40 76-84" fill="none" stroke="#4ade80" stroke-width="32" '
        'stroke-linecap="round" stroke-linejoin="round"/></svg>')

MANIFEST = json.dumps({
    "name": "VPS 哨兵", "short_name": "VPS 哨兵", "start_url": "/", "display": "standalone",
    "background_color": "#05070d", "theme_color": "#05070d",
    "icons": [{"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml"}],
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

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/":
            return self.send(200, PAGE, "text/html; charset=utf-8")
        if path == "/manifest.webmanifest":
            return self.send(200, MANIFEST, "application/manifest+json", cache=True)
        if path in ("/icon.svg", "/favicon.ico"):
            return self.send(200, ICON, "image/svg+xml", cache=True)
        if path in ("/api/status", "/api/all"):
            if not self.authed():
                time.sleep(1)
                return self.send(401, '{"error":"密碼錯誤"}')
            data = COL.snapshot() if path == "/api/status" else all_status()
            return self.send(200, json.dumps(data, ensure_ascii=False))
        self.send(404, '{"error":"找不到"}')

    def do_POST(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path not in ("/api/update", "/api/rename"):
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
        if u.path == "/api/rename":
            try:
                new = json.loads(body or b"{}").get("name", "")
            except (ValueError, AttributeError):
                new = ""
            ok, msg = set_name(new)
        else:
            ok, msg = start_update()
            if ok:
                COL.upd_running = True
        self.send(200 if ok else 400, json.dumps({"ok": ok, "message": msg}, ensure_ascii=False))


PAGE = r"""<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>VPS 哨兵</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon.svg">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="VPS 哨兵">
<meta name="theme-color" content="#05070d" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#eef2f8" media="(prefers-color-scheme: light)">
<style>
/* ───── 色彩 ───── */
:root{
  --bg:#eef2f8; --text:#0b1220; --sub:rgba(20,30,50,.58); --line:rgba(20,30,60,.10);
  --glass:rgba(255,255,255,.52); --glass2:rgba(255,255,255,.42);
  --spec:rgba(255,255,255,.95); --rim:rgba(255,255,255,.55); --edge:rgba(15,25,50,.10);
  --shadow:0 18px 40px -18px rgba(30,50,90,.35);
  --track:rgba(20,40,80,.08);
  --ok:#16a34a; --warn:#d97706; --bad:#e11d48; --accent:#2563eb;
  --b1:#7dd3fc; --b2:#c4b5fd; --b3:#a5f3fc; --b4:#fbcfe8;
  --fill:linear-gradient(90deg,#38bdf8,#6366f1);
}
@media (prefers-color-scheme:dark){:root{
  --bg:#05070d; --text:#eef3fb; --sub:rgba(220,230,250,.56); --line:rgba(255,255,255,.08);
  --glass:rgba(255,255,255,.065); --glass2:rgba(255,255,255,.05);
  --spec:rgba(255,255,255,.28); --rim:rgba(255,255,255,.10); --edge:rgba(0,0,0,.55);
  --shadow:0 24px 50px -22px rgba(0,0,0,.85);
  --track:rgba(255,255,255,.07);
  --ok:#4ade80; --warn:#fbbf24; --bad:#fb7185; --accent:#60a5fa;
  --b1:#1d4ed8; --b2:#6d28d9; --b3:#0e7490; --b4:#9d174d;
  --fill:linear-gradient(90deg,#38bdf8,#818cf8);
}}
*{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent}
html{background:var(--bg)}
body{color:var(--text);min-height:100vh;font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;
  padding:0 16px calc(env(safe-area-inset-bottom) + 40px);-webkit-font-smoothing:antialiased;overflow-x:hidden}
.wrap{max-width:980px;margin:0 auto;position:relative;z-index:1}

/* ───── 流動背景（讓玻璃有東西可以透） ───── */
.aurora{position:fixed;inset:-20vmax;z-index:0;pointer-events:none;filter:blur(70px) saturate(140%);opacity:.9}
.aurora i{position:absolute;width:55vmax;height:55vmax;border-radius:50%;mix-blend-mode:normal;opacity:.55}
.aurora i:nth-child(1){background:radial-gradient(circle,var(--b1),transparent 65%);left:5%;top:0;animation:d1 26s ease-in-out infinite alternate}
.aurora i:nth-child(2){background:radial-gradient(circle,var(--b2),transparent 65%);right:0;top:20%;animation:d2 31s ease-in-out infinite alternate}
.aurora i:nth-child(3){background:radial-gradient(circle,var(--b3),transparent 65%);left:20%;bottom:-5%;animation:d3 23s ease-in-out infinite alternate}
.aurora i:nth-child(4){background:radial-gradient(circle,var(--b4),transparent 65%);right:15%;bottom:10%;opacity:.3;animation:d1 37s ease-in-out infinite alternate-reverse}
@keyframes d1{to{transform:translate(18vmax,12vmax) scale(1.15)}}
@keyframes d2{to{transform:translate(-20vmax,10vmax) scale(.9)}}
@keyframes d3{to{transform:translate(12vmax,-16vmax) scale(1.2)}}
.grain{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.05;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

/* ───── 液態玻璃材質 ───── */
.glass{position:relative;background:var(--glass);
  -webkit-backdrop-filter:blur(28px) saturate(175%);backdrop-filter:blur(28px) saturate(175%);
  box-shadow:inset 0 1px 0 var(--spec),inset 0 0 0 1px var(--rim),0 0 0 1px var(--edge),var(--shadow)}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(140deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,0) 32%,rgba(255,255,255,0) 70%,rgba(255,255,255,.07) 100%);
  mix-blend-mode:overlay}
.glass::after{content:"";position:absolute;left:12%;right:12%;top:0;height:1px;border-radius:1px;pointer-events:none;
  background:linear-gradient(90deg,transparent,var(--spec),transparent);opacity:.9}

/* ───── 頂部列：捲動時變成玻璃工具列 ───── */
.bar{position:sticky;top:0;z-index:5;margin:0 -16px;padding:calc(env(safe-area-inset-top) + 10px) 16px 10px;
  display:flex;align-items:center;justify-content:space-between;transition:background .35s,box-shadow .35s}
.scrolled .bar{background:var(--glass2);-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);
  box-shadow:0 1px 0 var(--line)}
.bar .mini{font-weight:650;font-size:16px;opacity:0;transform:translateY(6px);transition:.35s cubic-bezier(.22,1,.36,1)}
.scrolled .bar .mini{opacity:1;transform:none}
.hero{padding:6px 2px 18px}
.hero h1{font-size:34px;font-weight:750;letter-spacing:.3px;line-height:1.15}
.hero .meta{color:var(--sub);font-size:13.5px;margin-top:2px;display:flex;align-items:center;gap:6px}
.live{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 var(--ok);animation:live 2.4s ease-out infinite}
.live.off{background:var(--sub);animation:none}
@keyframes live{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--ok) 60%,transparent)}100%{box-shadow:0 0 0 9px transparent}}

.cap{font:inherit;font-size:13.5px;font-weight:600;color:var(--text);border:0;cursor:pointer;border-radius:999px;padding:8px 15px;
  transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.cap:active{transform:scale(.94)}

/* ───── 摘要膠囊 ───── */
.summary{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.pill{border-radius:999px;padding:8px 14px 8px 12px;font-size:13.5px;display:flex;align-items:center;gap:8px;font-weight:550}
.pill b{font-variant-numeric:tabular-nums;font-weight:700}

/* ───── 卡片 ───── */
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(310px,1fr))}
.card{border-radius:30px;padding:18px 18px 16px;animation:rise .8s cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--i,0) * 80ms)}
@keyframes rise{from{opacity:0;transform:translateY(22px) scale(.97);filter:blur(6px)}}
.card.bad{box-shadow:inset 0 1px 0 var(--spec),inset 0 0 0 1.5px color-mix(in srgb,var(--bad) 70%,transparent),0 0 0 1px var(--edge),0 0 40px -12px var(--bad),var(--shadow)}
.card.warn{box-shadow:inset 0 1px 0 var(--spec),inset 0 0 0 1.5px color-mix(in srgb,var(--warn) 60%,transparent),0 0 0 1px var(--edge),0 0 36px -14px var(--warn),var(--shadow)}
.top{display:flex;align-items:center;gap:9px}
.top h2{font-size:19px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;letter-spacing:.2px}
.grow{flex:1}
.sub{color:var(--sub);font-size:12.5px}
.loc{margin:2px 0 0 1px}
.dot{width:9px;height:9px;border-radius:50%;flex:none;position:relative}
.dot.ok{background:var(--ok)}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}
.dot.off{background:var(--sub);opacity:.6}
.top .dot::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid currentColor;opacity:0;animation:ring 2.6s ease-out infinite}
.top .dot.ok{color:var(--ok)}.top .dot.warn{color:var(--warn)}.top .dot.bad{color:var(--bad);}
.top .dot.bad::after{animation-duration:1.3s}
@keyframes ring{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.8);opacity:0}}
.flag{width:24px;height:18px;object-fit:cover;border-radius:5px;flex:none;box-shadow:0 0 0 1px rgba(127,127,127,.3),0 2px 6px -2px rgba(0,0,0,.4)}
.emoji{font-size:20px;line-height:1}
.edit{border:0;background:transparent;color:var(--sub);cursor:pointer;padding:5px;margin:-5px 0;border-radius:10px;display:inline-flex;
  transition:background .2s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.edit:active{transform:scale(.88)}.edit:hover{background:var(--track)}.edit svg{width:15px;height:15px}

.alerts{margin:12px 0 2px;display:flex;flex-direction:column;gap:6px}
.alert{font-size:13px;font-weight:550;padding:8px 12px;border-radius:14px;display:flex;align-items:center;gap:8px;animation:rise .5s cubic-bezier(.22,1,.36,1) both}
.alert::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.alert.bad{background:color-mix(in srgb,var(--bad) 15%,transparent);color:var(--bad)}
.alert.warn{background:color-mix(in srgb,var(--warn) 15%,transparent);color:var(--warn)}

/* ───── 進度條：漸層 + 掃光 ───── */
.bars{margin-top:14px;display:flex;flex-direction:column;gap:12px}
.bar-row{display:flex;justify-content:space-between;align-items:baseline;font-size:13.5px;margin-bottom:6px}
.bar-row b{font-variant-numeric:tabular-nums;font-weight:700;font-size:14.5px}
.bar-row .sub{margin-left:5px;font-weight:500}
.track{height:8px;background:var(--track);border-radius:9px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.18)}
.fill{height:100%;border-radius:9px;background:var(--fill);position:relative;overflow:hidden;min-width:8px;
  transition:width 1s cubic-bezier(.22,1,.36,1),background .6s;animation:grow 1.2s cubic-bezier(.22,1,.36,1) both;transform-origin:left;
  box-shadow:0 0 12px -2px color-mix(in srgb,#60a5fa 60%,transparent)}
.fill.w{background:linear-gradient(90deg,#fbbf24,#f97316);box-shadow:0 0 12px -2px rgba(251,146,60,.6)}
.fill.b{background:linear-gradient(90deg,#fb7185,#e11d48);box-shadow:0 0 12px -2px rgba(244,63,94,.6)}
.fill::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.55) 50%,transparent 100%);
  transform:translateX(-100%);animation:sweep 2.8s linear infinite}
@keyframes grow{from{transform:scaleX(0)}}
@keyframes sweep{to{transform:translateX(250%)}}

/* ───── 小數字磚 ───── */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:14px}
.stat{border-radius:18px;padding:9px 12px;background:var(--glass2);box-shadow:inset 0 1px 0 var(--rim),inset 0 0 0 1px var(--line)}
.stat .k{color:var(--sub);font-size:11.5px;font-weight:550}
.stat .v{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}

/* ───── 容器與服務：滑順展開 ───── */
.more{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
.more-head{width:100%;font:inherit;font-size:13.5px;color:var(--sub);background:none;border:0;cursor:pointer;padding:4px 0;
  display:flex;justify-content:space-between;align-items:center;text-align:left}
.more-head b{color:var(--bad);font-weight:650}
.chev{width:18px;height:18px;transition:transform .45s cubic-bezier(.22,1,.36,1)}
.more.open .chev{transform:rotate(180deg)}
.collapse{display:grid;grid-template-rows:0fr;transition:grid-template-rows .5s cubic-bezier(.22,1,.36,1)}
.more.open .collapse{grid-template-rows:1fr}
.collapse>div{overflow:hidden}
.list{display:flex;flex-direction:column;gap:7px;padding-top:8px}
.item{display:flex;align-items:center;gap:9px;font-size:13.5px;opacity:0;transform:translateY(-4px);transition:.4s cubic-bezier(.22,1,.36,1)}
.more.open .item{opacity:1;transform:none}
.item .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .s{color:var(--sub);font-size:12px;white-space:nowrap}

/* ───── 底部：更新 ───── */
.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px;border-top:1px solid var(--line);padding-top:13px}
.ubtn{font:inherit;font-size:13.5px;font-weight:650;padding:9px 16px;border-radius:999px;cursor:pointer;border:0;color:#fff;
  background:linear-gradient(135deg,#3b82f6,#6366f1);display:inline-flex;align-items:center;gap:7px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 8px 20px -8px rgba(79,70,229,.8);transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .3s}
.ubtn:active{transform:scale(.94)}.ubtn[disabled]{opacity:.75;cursor:default}
.spin{width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

.offline{color:var(--sub);font-size:13.5px;margin-top:12px}

/* ───── 登入 ───── */
.login{max-width:360px;margin:18vh auto 0;text-align:center;border-radius:32px;padding:30px 24px 26px;animation:rise .8s cubic-bezier(.22,1,.36,1) both}
.login .logo{width:64px;height:64px;border-radius:18px;margin:0 auto 14px;box-shadow:0 10px 30px -10px rgba(56,189,248,.7)}
.login h1{font-size:26px}
.login input{width:100%;font:inherit;font-size:16px;padding:13px 16px;border-radius:16px;border:0;margin:18px 0 8px;color:var(--text);
  background:var(--glass2);box-shadow:inset 0 0 0 1px var(--line),inset 0 2px 4px rgba(0,0,0,.08);outline:none;transition:box-shadow .25s}
.login input:focus{box-shadow:inset 0 0 0 2px var(--accent)}
.login .ubtn{width:100%;justify-content:center;padding:13px;font-size:15.5px}
.err{color:var(--bad);font-size:13px;min-height:20px}
.shake{animation:shake .45s}
@keyframes shake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}

/* ───── 無障礙：減少動態／減少透明度 ───── */
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
@media (prefers-reduced-transparency:reduce){
  .glass,.scrolled .bar{background:var(--bg);-webkit-backdrop-filter:none;backdrop-filter:none}.aurora{display:none}}
</style>
</head>
<body>
<div class="aurora"><i></i><i></i><i></i><i></i></div><div class="grain"></div>
<div class="wrap" id="app"></div>
<script>
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const KEY = "vps-sentinel-token";
function getTok(){ try { return localStorage.getItem(KEY) || window._tok || ""; } catch(e){ return window._tok || ""; } }
function setTok(t){ try { t ? localStorage.setItem(KEY,t) : localStorage.removeItem(KEY); } catch(e){} window._tok = t; }

const u0 = new URL(location.href);
if (u0.searchParams.get("t")) { setTok(u0.searchParams.get("t")); history.replaceState(null, "", "/"); }

function size(b){ if(!b) return "0 B"; const u=["B","KB","MB","GB","TB"]; let i=0; while(b>=1024&&i<4){b/=1024;i++} return (b<10&&i?b.toFixed(1):Math.round(b))+" "+u[i]; }
function rate(b){ return size(b)+"/s"; }
function up(s){ const d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60);
  return d ? `${d} 天 ${h} 小時` : h ? `${h} 小時 ${m} 分` : `${m} 分鐘`; }
function num(v, d=0){ return `<span data-v="${(+v).toFixed(d)}" data-d="${d}">${(+v).toFixed(d)}</span>`; }
function bar(label, pct, detail){
  const c = pct>=90 ? "b" : pct>=75 ? "w" : "";
  return `<div><div class="bar-row"><span>${label}</span><span><b>${num(pct)}%</b><span class="sub">${detail}</span></span></div>
  <div class="track"><div class="fill ${c}" style="width:${Math.max(0,Math.min(pct,100))}%"></div></div></div>`;
}
const STATE = {running:"執行中",exited:"已停止",restarting:"重啟中",paused:"暫停",created:"未啟動",dead:"故障",
  active:"執行中",inactive:"未執行",failed:"失敗",activating:"啟動中",unknown:"未知"};
const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

let REGION; try { REGION = new Intl.DisplayNames(["zh-TW"], {type:"region"}); } catch(e) {}
const FLAGFAIL = {};
function flag(cc){
  if (!/^[A-Z]{2}$/.test(cc||"")) return "";
  const emo = String.fromCodePoint(...[...cc].map(c=>127397+c.charCodeAt(0)));
  if (FLAGFAIL[cc]) return `<span class="emoji">${emo}</span>`;
  return `<img class="flag" src="https://flagcdn.com/w80/${cc.toLowerCase()}.png" alt="${emo}" title="${esc(REGION?REGION.of(cc):cc)}"
    onerror="FLAGFAIL['${cc}']=1;this.outerHTML='<span class=emoji>${emo}</span>'">`;
}
function when(t){ const d=new Date(t*1000), now=new Date();
  const hm=d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false});
  return d.toDateString()===now.toDateString() ? `今天 ${hm}` : `${d.getMonth()+1}/${d.getDate()} ${hm}`; }

const open = {};
function card(s, i){
  const lv = s.level || (s.online ? "ok" : "bad"), key = s.node || s.name || "";
  let h = `<div class="card glass ${lv==="ok"?"":lv}" data-key="${esc(key)}" style="--i:${i}"><div class="top"><span class="dot ${lv}"></span>${flag(s.geo&&s.geo.cc)}<h2>${esc(s.name)}</h2>`;
  if (s.online) h += `<button class="edit" title="改名稱" data-rename="${esc(s.node||"")}" data-name="${esc(s.name)}">${ICON_EDIT}</button>`;
  h += `<span class="grow"></span>`;
  if (!s.online) return h + `</div><div class="offline">⚠️ 連不上這台主機<br><span class="sub">${esc(s.error||"")}</span></div></div>`;
  h += `<span class="sub">開機 ${up(s.uptime)}</span></div>`;
  const where = s.geo ? [(REGION&&s.geo.cc)?REGION.of(s.geo.cc):s.geo.cc, s.geo.city].filter(Boolean).join(" ") : "";
  h += `<div class="sub loc">${where ? esc(where)+"・" : ""}${esc(s.os)}</div>`;
  const al = (s.problems||[]).map(p=>`<div class="alert bad">${esc(p)}</div>`).concat((s.notices||[]).map(p=>`<div class="alert warn">${esc(p)}</div>`));
  if (al.length) h += `<div class="alerts">${al.join("")}</div>`;
  h += `<div class="bars">` + bar("處理器", s.cpu, `${s.cores} 核`) +
       bar("記憶體", s.mem.pct, `${size(s.mem.used)} / ${size(s.mem.total)}`) +
       s.disks.map(d=>bar("磁碟 "+(d.path==="/"?"":esc(d.path)), d.pct, `${size(d.used)} / ${size(d.total)}`)).join("") + `</div>`;
  h += `<div class="stats"><div class="stat"><div class="k">負載</div><div class="v">${num(s.load[0],2)}</div></div>
        <div class="stat"><div class="k">下載</div><div class="v">${rate(s.net.rx)}</div></div>
        <div class="stat"><div class="k">上傳</div><div class="v">${rate(s.net.tx)}</div></div></div>`;
  const items = [];
  (s.containers||[]).forEach(c=>{
    const st = /unhealthy/.test(c.status) ? "bad" : c.state==="running" ? "ok"
      : (c.state==="created" || c.state==="paused" || /Exited \(0\)/.test(c.status)) ? "off" : "bad";
    items.push({n:c.name, st, s:STATE[c.state]||c.state, t:"容器"});
  });
  (s.services||[]).forEach(v=>items.push({n:v.name, st:v.state==="active"?"ok":"bad", s:STATE[v.state]||v.state, t:"服務"}));
  if (items.length){
    const bad = items.filter(x=>x.st==="bad").length, okn = items.filter(x=>x.st==="ok").length, off = items.length-bad-okn;
    h += `<div class="more ${open[key]?"open":""}"><button class="more-head" data-toggle="${esc(key)}"><span>容器與服務：${okn} 正常${off?`，${off} 未使用`:""}${bad?`，<b>${bad} 異常</b>`:""}</span>${ICON_CHEV}</button>
      <div class="collapse"><div><div class="list">` +
      items.map((x,j)=>`<div class="item" style="transition-delay:${j*35}ms"><span class="dot ${x.st}"></span><span class="n">${esc(x.n)}</span><span class="s">${x.t}・${esc(x.s)}</span></div>`).join("") +
      `</div></div></div></div>`;
  }
  const u = s.update, n = s.updates ? s.updates.total : 0;
  let info = s.updates ? `可更新套件 ${n} 個${s.updates.security?`（安全更新 ${s.updates.security} 個）`:""}` : "";
  if (u && u.last) info += `${info?"<br>":""}上次更新：${u.last.ok?"成功":`<span style="color:var(--bad)">失敗</span>`}・${when(u.last.time)}`;
  let btn = "";
  if (u && u.supported) btn = u.running
    ? `<button class="ubtn" disabled><span class="spin"></span>更新中…</button>`
    : `<button class="ubtn" data-update="${esc(s.node||"")}" data-label="${esc(s.name)}" data-n="${n}">${n?`更新系統（${n}）`:"檢查更新"}</button>`;
  if (info || btn) h += `<div class="foot"><div class="sub">${info}</div>${btn}</div>`;
  return h + `</div>`;
}

/* 只更新有變動的地方：讓進度條、數字能平順地動，不會整頁閃一下 */
function tween(el, from, to, d){
  const t0 = performance.now(), dur = 700;
  cancelAnimationFrame(el._raf);
  const stepf = now => { const k = Math.min(1,(now-t0)/dur), e = 1-Math.pow(1-k,3);
    el.textContent = (from+(to-from)*e).toFixed(d); if (k<1) el._raf = requestAnimationFrame(stepf); };
  el._raf = requestAnimationFrame(stepf);
}
function morph(a, b){
  if (a.nodeType!==b.nodeType || a.nodeName!==b.nodeName ||
      (a.nodeType===1 && (a.getAttribute("data-key")||"")!==(b.getAttribute("data-key")||""))) { a.replaceWith(b); return; }
  if (a.nodeType===3 || a.nodeType===8){ if (a.nodeValue!==b.nodeValue) a.nodeValue=b.nodeValue; return; }
  if (a.nodeType!==1) return;
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of [...b.attributes]) if (a.getAttribute(at.name)!==at.value){
    if (at.name==="data-v") tween(a, parseFloat(a.getAttribute("data-v"))||0, parseFloat(at.value)||0, +b.getAttribute("data-d")||0);
    a.setAttribute(at.name, at.value);
  }
  if (a.hasAttribute("data-v")) return;
  const ac=[...a.childNodes], bc=[...b.childNodes];
  bc.forEach((n,i)=>{ if (ac[i]) morph(ac[i], n); else a.appendChild(n); });
  for (let i=bc.length;i<ac.length;i++) ac[i].remove();
}

function render(list){
  const n = {ok:0,warn:0,bad:0}; list.forEach(s=>n[s.level||(s.online?"ok":"bad")]++);
  const time = new Date().toLocaleTimeString("zh-TW",{hour12:false});
  const html = `<div class="dash"><header class="bar"><span class="mini">VPS 哨兵</span><span class="grow"></span>
    <button class="cap glass" data-logout>登出</button></header>
    <div class="hero"><h1>VPS 哨兵</h1><div class="meta"><span class="live"></span>更新於 ${time}</div></div>
    <div class="summary"><span class="pill glass"><span class="dot ok"></span>正常 <b>${n.ok}</b></span>
    <span class="pill glass"><span class="dot warn"></span>注意 <b>${n.warn}</b></span><span class="pill glass"><span class="dot bad"></span>異常 <b>${n.bad}</b></span></div>
    <div class="grid">${list.map(card).join("")}</div></div>`;
  const tpl = document.createElement("template"); tpl.innerHTML = html.trim();
  const cur = $("#app .dash");
  if (cur) morph(cur, tpl.content.firstElementChild); else { $("#app").innerHTML = ""; $("#app").appendChild(tpl.content.firstElementChild); }
}

function login(msg){
  $("#app").innerHTML = `<div class="login glass ${msg?"shake":""}"><img class="logo" src="/icon.svg" alt=""><h1>VPS 哨兵</h1>
    <input id="tok" type="password" placeholder="輸入存取密碼" autocomplete="current-password">
    <div class="err">${msg||""}</div><button class="ubtn" data-login>進入</button></div>`;
  $("#tok").addEventListener("keydown",e=>{ if(e.key==="Enter"){ setTok(e.target.value.trim()); tick(); }});
}

document.addEventListener("click", async e => {
  const t = e.target;
  if (t.closest("[data-login]")) { setTok($("#tok").value.trim()); return tick(); }
  if (t.closest("[data-logout]")) { setTok(""); clearTimeout(timer); return login(); }
  const tg = t.closest("[data-toggle]");
  if (tg) { const k = tg.dataset.toggle; open[k] = !open[k]; tg.parentElement.classList.toggle("open", open[k]); return; }

  const rn = t.closest("[data-rename]");
  if (rn) {
    const old = rn.dataset.name, name = prompt("輸入新的名稱：", old);
    if (name === null || name.trim() === "" || name.trim() === old) return;
    try {
      const r = await fetch("/api/rename?node="+encodeURIComponent(rn.dataset.rename),
        {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify({name:name.trim()})});
      const d = await r.json().catch(()=>({}));
      if (!r.ok || !d.ok) alert(d.message || d.error || "改名失敗");
    } catch(err) { alert("連線失敗，請稍後再試"); }
    return tick();
  }

  const ub = t.closest("[data-update]");
  if (ub) {
    const node = ub.dataset.update, label = ub.dataset.label, n = +ub.dataset.n;
    const msg = n ? `確定要更新「${label}」嗎？\n\n會在背景安裝 ${n} 個套件更新，大約 1～5 分鐘。\n期間部分服務可能會短暫重新啟動。`
                  : `「${label}」目前沒有偵測到更新。\n要重新檢查並安裝最新更新嗎？`;
    if (!confirm(msg)) return;
    ub.disabled = true; ub.innerHTML = `<span class="spin"></span>開始中…`;
    try {
      const r = await fetch("/api/update?node="+encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok()}});
      const d = await r.json().catch(()=>({}));
      if (!r.ok || !d.ok) alert(d.message || d.error || "無法開始更新");
    } catch(err) { alert("連線失敗，請稍後再試"); }
    return tick();
  }
});

addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > 40), {passive:true});

let timer;
async function tick(){
  clearTimeout(timer);
  if (!getTok()) return login();
  try {
    const r = await fetch("/api/all", {headers:{"X-Token":getTok()}, cache:"no-store"});
    if (r.status === 401) { setTok(""); return login("密碼錯誤"); }
    render(await r.json());
  } catch(e) {
    const m = document.querySelector(".hero .meta"); if (m) m.innerHTML = `<span class="live off"></span>連線中斷，重試中…`;
  }
  timer = setTimeout(tick, 5000);
}
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) tick(); });
tick();
</script>
</body>
</html>"""


def main():
    threading.Thread(target=COL.loop, daemon=True).start()
    if TG_BOT and TG_CHAT:
        threading.Thread(target=alert_loop, daemon=True).start()
    srv = ThreadingHTTPServer((BIND, PORT), Handler)
    log(f"VPS 哨兵 {VERSION} 已啟動：http://{BIND}:{PORT}  名稱={NAME}  其他主機={len(PEERS)} 台  "
        f"Telegram={'開' if TG_BOT and TG_CHAT else '關'}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
