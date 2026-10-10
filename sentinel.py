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

VERSION = "1.2"

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
    "background_color": "#0b1120", "theme_color": "#0b1120",
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
<meta name="theme-color" content="#0b1120">
<style>
:root{--bg:#f2f4f7;--card:#fff;--text:#0f172a;--sub:#64748b;--line:#e2e8f0;--track:#e8edf3;
--ok:#16a34a;--warn:#d97706;--bad:#dc2626;--accent:#0284c7}
@media (prefers-color-scheme:dark){:root{--bg:#0b1120;--card:#141c2f;--text:#e5edf7;--sub:#8b9ab3;
--line:#22304a;--track:#1f2a40;--ok:#4ade80;--warn:#fbbf24;--bad:#f87171;--accent:#38bdf8}}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,"PingFang TC","Noto Sans TC",
"Microsoft JhengHei",sans-serif;padding:calc(env(safe-area-inset-top) + 16px) 16px 40px;-webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin:0 auto}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
h1{font-size:26px;font-weight:700;letter-spacing:.5px}
.meta{color:var(--sub);font-size:13px}
.summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.pill{background:var(--card);border-radius:999px;padding:6px 12px;font-size:13px;display:flex;align-items:center;gap:6px}
.dot{width:9px;height:9px;border-radius:50%;flex:none}
.ok{background:var(--ok)}.warn{background:var(--warn)}.bad{background:var(--bad)}.off{background:var(--sub);opacity:.6}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.card{background:var(--card);border-radius:18px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.card.bad{box-shadow:0 0 0 2px var(--bad)}.card.warn{box-shadow:0 0 0 1.5px var(--warn)}
.top{display:flex;align-items:center;gap:10px}
.top h2{font-size:18px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sub{color:var(--sub);font-size:12.5px}
.alerts{margin:10px 0 4px;display:flex;flex-direction:column;gap:4px}
.alert{font-size:13px;padding:6px 10px;border-radius:10px}
.alert.bad{background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad)}
.alert.warn{background:color-mix(in srgb,var(--warn) 14%,transparent);color:var(--warn)}
.bars{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.bar .row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px}
.bar .row b{font-variant-numeric:tabular-nums}
.track{height:7px;background:var(--track);border-radius:9px;overflow:hidden}
.fill{height:100%;border-radius:9px;background:var(--accent);transition:width .6s}
.fill.w{background:var(--warn)}.fill.b{background:var(--bad)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.stat{background:var(--bg);border-radius:12px;padding:8px 10px}
.stat .k{color:var(--sub);font-size:11.5px}.stat .v{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
details{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}
summary{cursor:pointer;font-size:13.5px;color:var(--sub);list-style:none;display:flex;justify-content:space-between}
summary::-webkit-details-marker{display:none}
summary::after{content:"展開";font-size:12px}details[open] summary::after{content:"收合"}
.list{margin-top:8px;display:flex;flex-direction:column;gap:6px}
.item{display:flex;align-items:center;gap:8px;font-size:13.5px}
.item .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .s{color:var(--sub);font-size:12px;white-space:nowrap}
.login{max-width:360px;margin:20vh auto 0;text-align:center}
.login input{width:100%;font-size:16px;padding:12px 14px;border-radius:12px;border:1px solid var(--line);
background:var(--card);color:var(--text);margin:16px 0 10px}
.login button,.btn{font-size:15px;padding:11px 18px;border-radius:12px;border:0;background:var(--accent);color:#fff;cursor:pointer}
.btn{padding:6px 12px;font-size:13px;background:var(--card);color:var(--sub)}
.flag{width:24px;height:18px;object-fit:cover;border-radius:4px;flex:none;box-shadow:0 0 0 1px rgba(127,127,127,.25)}
.emoji{font-size:20px;line-height:1}
.edit{border:0;background:transparent;color:var(--sub);cursor:pointer;padding:4px;margin:-4px 0 -4px -4px;border-radius:8px;
display:inline-flex;opacity:.7}.edit:hover{opacity:1;background:var(--bg)}.edit svg{width:15px;height:15px}
.top h2{flex:0 1 auto}.top .grow{flex:1}
.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px;
border-top:1px solid var(--line);padding-top:12px}
.ubtn{font:inherit;font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:11px;cursor:pointer;
border:1.5px solid var(--accent);background:transparent;color:var(--accent);display:inline-flex;align-items:center;gap:7px}
.ubtn:active{transform:scale(.97)}.ubtn[disabled]{opacity:.7;cursor:default}
.spin{width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;
animation:sp .8s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
.err{color:var(--bad);font-size:13px;min-height:20px}
.offline{color:var(--sub);font-size:13px;margin-top:10px}
</style>
</head>
<body>
<div class="wrap" id="app"></div>
<script>
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const KEY = "vps-sentinel-token";
function getTok(){ try { return localStorage.getItem(KEY) || ""; } catch(e){ return window._tok || ""; } }
function setTok(t){ try { t ? localStorage.setItem(KEY,t) : localStorage.removeItem(KEY); } catch(e){} window._tok = t; }

const u = new URL(location.href);
if (u.searchParams.get("t")) { setTok(u.searchParams.get("t")); history.replaceState(null, "", "/"); }

function size(b){ if(!b) return "0 B"; const u=["B","KB","MB","GB","TB"]; let i=0; while(b>=1024&&i<4){b/=1024;i++} return (b<10&&i?b.toFixed(1):Math.round(b))+" "+u[i]; }
function rate(b){ return size(b)+"/s"; }
function up(s){ const d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60);
  return d ? `${d} 天 ${h} 小時` : h ? `${h} 小時 ${m} 分` : `${m} 分鐘`; }
function bar(label, pct, detail){
  const c = pct>=90 ? "b" : pct>=75 ? "w" : "";
  return `<div class="bar"><div class="row"><span>${label}</span><b>${pct.toFixed(0)}%<span class="sub"> ${detail}</span></b></div>
  <div class="track"><div class="fill ${c}" style="width:${Math.min(pct,100)}%"></div></div></div>`;
}
const STATE = {running:"執行中",exited:"已停止",restarting:"重啟中",paused:"暫停",created:"未啟動",dead:"故障",
  active:"執行中",inactive:"未執行",failed:"失敗",activating:"啟動中",unknown:"未知"};

const open = {};
let REGION; try { REGION = new Intl.DisplayNames(["zh-TW"], {type:"region"}); } catch(e) {}
function flag(cc){
  if (!/^[A-Z]{2}$/.test(cc||"")) return "";
  const emo = String.fromCodePoint(...[...cc].map(c=>127397+c.charCodeAt(0)));
  return `<img class="flag" src="https://flagcdn.com/w80/${cc.toLowerCase()}.png" alt="${emo}" title="${esc(REGION?REGION.of(cc):cc)}"
    onerror="this.outerHTML='<span class=emoji>${emo}</span>'">`;
}
function when(t){ const d=new Date(t*1000), now=new Date();
  const hm=d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false});
  return d.toDateString()===now.toDateString() ? `今天 ${hm}` : `${d.getMonth()+1}/${d.getDate()} ${hm}`; }
function card(s){
  const lv = s.level || (s.online ? "ok" : "bad");
  let h = `<div class="card ${lv==="ok"?"":lv}"><div class="top"><span class="dot ${lv}"></span>${flag(s.geo&&s.geo.cc)}<h2>${esc(s.name)}</h2>`;
  if (s.online) h += `<button class="edit" title="改名稱" data-rename="${esc(s.node||"")}" data-name="${esc(s.name)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>`;
  h += `<span class="grow"></span>`;
  if (!s.online) return h + `</div><div class="offline">⚠️ 連不上這台主機<br><span class="sub">${esc(s.error||"")}</span></div></div>`;
  h += `<span class="sub">開機 ${up(s.uptime)}</span></div><div class="sub">${s.geo ? esc([(REGION&&s.geo.cc)?REGION.of(s.geo.cc):s.geo.cc, s.geo.city].filter(Boolean).join(" "))+"・" : ""}${esc(s.os)}</div>`;
  const al = (s.problems||[]).map(p=>`<div class="alert bad">${esc(p)}</div>`).concat((s.notices||[]).map(p=>`<div class="alert warn">${esc(p)}</div>`));
  if (al.length) h += `<div class="alerts">${al.join("")}</div>`;
  h += `<div class="bars">` + bar("處理器", s.cpu, `${s.cores} 核`) +
       bar("記憶體", s.mem.pct, `${size(s.mem.used)} / ${size(s.mem.total)}`) +
       s.disks.map(d=>bar("磁碟 "+(d.path==="/"?"":d.path), d.pct, `${size(d.used)} / ${size(d.total)}`)).join("") + `</div>`;
  h += `<div class="stats"><div class="stat"><div class="k">負載</div><div class="v">${s.load[0]}</div></div>
        <div class="stat"><div class="k">下載</div><div class="v">${rate(s.net.rx)}</div></div>
        <div class="stat"><div class="k">上傳</div><div class="v">${rate(s.net.tx)}</div></div></div>`;
  const items = [];
  // 狀態：ok 正常（綠）、off 沒在用（灰，不算異常）、bad 異常（紅）
  (s.containers||[]).forEach(c=>{
    const st = /unhealthy/.test(c.status) ? "bad"
      : c.state==="running" ? "ok"
      : (c.state==="created" || c.state==="paused" || /Exited \(0\)/.test(c.status)) ? "off" : "bad";
    items.push({n:c.name, st, s:STATE[c.state]||c.state, t:"容器"});
  });
  (s.services||[]).forEach(v=>items.push({n:v.name, st:v.state==="active"?"ok":"bad", s:STATE[v.state]||v.state, t:"服務"}));
  if (items.length){
    const bad = items.filter(i=>i.st==="bad").length, okn = items.filter(i=>i.st==="ok").length,
          off = items.length-bad-okn, id = s.name;
    h += `<details data-id="${esc(id)}" ${open[id]?"open":""}><summary><span>容器與服務：${okn} 正常${off?`，${off} 未使用`:""}${bad?`，<b style="color:var(--bad);font-weight:600">${bad} 異常</b>`:""}</span></summary><div class="list">` +
      items.map(i=>`<div class="item"><span class="dot ${i.st}"></span><span class="n">${esc(i.n)}</span><span class="s">${i.t}・${esc(i.s)}</span></div>`).join("") + `</div></details>`;
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

function render(list){
  const n = {ok:0,warn:0,bad:0}; list.forEach(s=>n[s.level||(s.online?"ok":"bad")]++);
  $("#app").innerHTML = `<header><div><h1>VPS 哨兵</h1><div class="meta">更新於 ${new Date().toLocaleTimeString("zh-TW",{hour12:false})}</div></div>
    <button class="btn" onclick="logout()">登出</button></header>
    <div class="summary"><span class="pill"><span class="dot ok"></span>正常 ${n.ok}</span>
    <span class="pill"><span class="dot warn"></span>注意 ${n.warn}</span><span class="pill"><span class="dot bad"></span>異常 ${n.bad}</span></div>
    <div class="grid">${list.map(card).join("")}</div>`;
  document.querySelectorAll("details").forEach(d=>d.addEventListener("toggle",()=>open[d.dataset.id]=d.open));
}

function login(msg){
  $("#app").innerHTML = `<div class="login"><h1>VPS 哨兵</h1><input id="tok" type="password" placeholder="輸入存取密碼" autocomplete="current-password">
    <div class="err">${msg||""}</div><button onclick="setTok($('#tok').value.trim());tick()">進入</button></div>`;
  $("#tok").addEventListener("keydown",e=>{ if(e.key==="Enter"){ setTok(e.target.value.trim()); tick(); }});
}
function logout(){ setTok(""); login(); }

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-rename]"); if (!b) return;
  const old = b.dataset.name, name = prompt("輸入新的名稱：", old);
  if (name === null || name.trim() === "" || name.trim() === old) return;
  try {
    const r = await fetch("/api/rename?node="+encodeURIComponent(b.dataset.rename),
      {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify({name:name.trim()})});
    const d = await r.json().catch(()=>({}));
    if (!r.ok || !d.ok) alert(d.message || d.error || "改名失敗");
  } catch(err) { alert("連線失敗，請稍後再試"); }
  tick();
});

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-update]"); if (!b) return;
  const node = b.dataset.update, label = b.dataset.label, n = +b.dataset.n;
  const msg = n ? `確定要更新「${label}」嗎？\n\n會在背景安裝 ${n} 個套件更新，大約 1～5 分鐘。\n期間部分服務可能會短暫重新啟動。`
                : `「${label}」目前沒有偵測到更新。\n要重新檢查並安裝最新更新嗎？`;
  if (!confirm(msg)) return;
  b.disabled = true; b.innerHTML = `<span class="spin"></span>開始中…`;
  try {
    const r = await fetch("/api/update?node="+encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok()}});
    const d = await r.json().catch(()=>({}));
    if (!r.ok || !d.ok) alert(d.message || d.error || "無法開始更新");
  } catch(err) { alert("連線失敗，請稍後再試"); }
  tick();
});

let timer;
async function tick(){
  clearTimeout(timer);
  if (!getTok()) return login();
  try {
    const r = await fetch("/api/all", {headers:{"X-Token":getTok()}, cache:"no-store"});
    if (r.status === 401) { setTok(""); return login("密碼錯誤"); }
    render(await r.json());
  } catch(e) {
    const m = document.querySelector(".meta"); if (m) m.textContent = "連線中斷，重試中…";
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
