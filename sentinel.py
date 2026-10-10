#!/usr/bin/env python3
"""
VPS 哨兵：用手機或電腦隨時查看 VPS 狀態
- 單一檔案，只用 Python 內建模組（不用另外安裝任何套件）
- 網頁儀表板：電腦版、手機版各自設計，可加到手機主畫面當 App 用
- 即時狀態、30 分鐘歷史曲線、Docker 容器與系統服務、一鍵更新系統
- 可選：Telegram 通知、多台 VPS 一起看
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
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.5"

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
        self.hist = deque(maxlen=180)          # 最近 30 分鐘，每 10 秒一筆
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
            if tick % 5 == 0:                         # 每 10 秒記一筆歷史
                m = meminfo()
                with self.lock:
                    self.hist.append((round(now_t), self.cpu_pct, m["pct"],
                                      round(self.net["rx"]), round(self.net["tx"])))

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
            hist = list(self.hist)
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
        return data
    except Exception as e:  # noqa: BLE001
        return {"name": p["name"], "node": p["name"], "online": False, "level": "bad",
                "problems": ["連不上"], "error": peer_error(e, p["url"])}


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
    "background_color": "#06080f", "theme_color": "#06080f",
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
<html lang="zh-Hant-TW" data-mode="dark" data-accent="blue">
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
<meta name="theme-color" content="#06080f">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<script>
/* 先套用設定，避免畫面閃一下 */
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
  --shadow:0 1px 2px rgba(16,24,60,.04),0 12px 32px -14px rgba(30,50,110,.22);
  --track:rgba(16,24,60,.07); --veil:rgba(240,243,250,.5);
  --ok:#12b76a; --warn:#f79009; --bad:#f04438;
  --zoom:1; --pad:18px; --gap:16px;
}
/* ═════════ 色彩：深色 ═════════ */
[data-mode="dark"]{
  --bg:#06080f; --text:#f1f4fa; --sub:rgba(226,232,245,.58); --faint:rgba(226,232,245,.32); --line:rgba(255,255,255,.075);
  --ga:.07; --glass:rgba(255,255,255,var(--ga)); --glass2:rgba(255,255,255,calc(var(--ga) * .75));
  --spec:rgba(255,255,255,.26); --rim:rgba(255,255,255,.09); --edge:rgba(0,0,0,.5);
  --shadow:0 1px 2px rgba(0,0,0,.3),0 22px 48px -22px rgba(0,0,0,.9);
  --track:rgba(255,255,255,.07); --veil:rgba(4,6,12,.55);
  --ok:#32d583; --warn:#fdb022; --bad:#f97066;
}
/* ═════════ 主題色 ═════════ */
[data-accent="blue"]  {--a1:#38bdf8; --a2:#6366f1; --a3:#22d3ee}
[data-accent="purple"]{--a1:#a78bfa; --a2:#d946ef; --a3:#818cf8}
[data-accent="green"] {--a1:#34d399; --a2:#14b8a6; --a3:#a3e635}
[data-accent="orange"]{--a1:#fbbf24; --a2:#f97316; --a3:#fb7185}
[data-accent="pink"]  {--a1:#f472b6; --a2:#f43f5e; --a3:#c084fc}
:root{--accent:var(--a2); --grad:linear-gradient(135deg,var(--a1),var(--a2))}

*{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent}
html{background:var(--bg);transition:background .5s}
body{color:var(--text);min-height:100vh;font:15px/1.5 var(--font);zoom:var(--zoom);
  padding:0 16px calc(env(safe-area-inset-bottom) + 40px);-webkit-font-smoothing:antialiased;overflow-x:hidden;transition:color .4s}
button{font:inherit;color:inherit}
.wrap{max-width:980px;margin:0 auto;position:relative;z-index:1}
.num,.tab{font-variant-numeric:tabular-nums}

/* ═════════ 背景 ═════════ */
.bgfx{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.aurora{position:absolute;inset:-20vmax;filter:blur(80px) saturate(135%);transition:opacity .8s}
.aurora i{position:absolute;width:55vmax;height:55vmax;border-radius:50%}
.aurora i:nth-child(1){background:radial-gradient(circle,var(--a1),transparent 62%);left:2%;top:-2%;animation:d1 26s ease-in-out infinite alternate}
.aurora i:nth-child(2){background:radial-gradient(circle,var(--a2),transparent 62%);right:-4%;top:18%;animation:d2 32s ease-in-out infinite alternate}
.aurora i:nth-child(3){background:radial-gradient(circle,var(--a3),transparent 62%);left:18%;bottom:-8%;animation:d3 24s ease-in-out infinite alternate}
.aurora i:nth-child(4){background:radial-gradient(circle,var(--a1),transparent 62%);right:14%;bottom:8%;animation:d1 38s ease-in-out infinite alternate-reverse}
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
  box-shadow:inset 0 1px 0 var(--spec),inset 0 0 0 1px var(--rim),0 0 0 1px var(--edge),var(--shadow)}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(150deg,rgba(255,255,255,.2) 0%,rgba(255,255,255,0) 30%,rgba(255,255,255,0) 72%,rgba(255,255,255,.06) 100%);mix-blend-mode:overlay}

/* ═════════ 共用小元件 ═════════ */
.sub{color:var(--sub);font-size:12.5px}
.grow{flex:1}
.dot{width:8px;height:8px;border-radius:50%;flex:none;position:relative;background:var(--faint)}
.dot.ok{background:var(--ok);color:var(--ok)}.dot.warn{background:var(--warn);color:var(--warn)}.dot.bad{background:var(--bad);color:var(--bad)}
.dot.off{background:var(--faint)}
.dot.pulse::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid currentColor;opacity:0;animation:ring 2.8s ease-out infinite}
.dot.pulse.bad::after{animation-duration:1.3s}
@keyframes ring{0%{transform:scale(.55);opacity:.7}100%{transform:scale(1.9);opacity:0}}
.ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;color:#fff;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 4px 10px -4px rgba(0,0,0,.35)}
.ico svg{width:17px;height:17px}
.ico.cpu{background:linear-gradient(135deg,#38bdf8,#2563eb)}
.ico.mem{background:linear-gradient(135deg,#c084fc,#7c3aed)}
.ico.disk{background:linear-gradient(135deg,#fbbf24,#f97316)}
.ico.down{background:linear-gradient(135deg,#2dd4bf,#0891b2)}
.ico.up{background:linear-gradient(135deg,#f472b6,#db2777)}
.ico.load{background:linear-gradient(135deg,#4ade80,#16a34a)}
.ico.box{background:linear-gradient(135deg,#60a5fa,#4f46e5)}
.ico.info{background:linear-gradient(135deg,#94a3b8,#475569)}
.ico.sm{width:24px;height:24px;border-radius:7px}.ico.sm svg{width:14px;height:14px}
.flag{width:24px;height:18px;object-fit:cover;border-radius:5px;flex:none;box-shadow:0 0 0 1px rgba(127,127,127,.25),0 3px 8px -3px rgba(0,0,0,.4)}
.emoji{font-size:19px;line-height:1}
.iconbtn{border:0;background:transparent;color:var(--sub);cursor:pointer;padding:6px;border-radius:11px;display:inline-grid;place-items:center;
  transition:background .25s,color .25s,transform .3s cubic-bezier(.34,1.56,.64,1)}
.iconbtn:hover{background:var(--track);color:var(--text)}.iconbtn:active{transform:scale(.86)}
.iconbtn svg{width:16px;height:16px}
.cap{border:0;cursor:pointer;border-radius:999px;padding:9px 16px;font-size:13.5px;font-weight:700;display:inline-flex;align-items:center;gap:7px;
  transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.cap svg{width:16px;height:16px}.cap:active{transform:scale(.93)}
.ubtn{border:0;cursor:pointer;border-radius:999px;padding:10px 17px;font-size:13.5px;font-weight:800;color:#fff;background:var(--grad);
  display:inline-flex;align-items:center;gap:7px;letter-spacing:.2px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 10px 24px -10px var(--a2);transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .3s,filter .3s}
.ubtn:hover{filter:brightness(1.06)}.ubtn:active{transform:scale(.94)}.ubtn[disabled]{opacity:.7;cursor:default}
.ubtn.ghost{background:var(--glass2);color:var(--text);box-shadow:inset 0 0 0 1px var(--line)}
.spin{width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
@keyframes rise{from{opacity:0;transform:translateY(18px) scale(.975);filter:blur(5px)}}
@keyframes fade{from{opacity:0}}

/* ═════════ 進度條 ═════════ */
.track{height:8px;background:var(--track);border-radius:99px;overflow:hidden}
.fill{height:100%;border-radius:99px;background:var(--grad);position:relative;overflow:hidden;min-width:8px;
  transition:width 1.1s cubic-bezier(.22,1,.36,1);animation:grow 1.3s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
.fill.w{background:linear-gradient(90deg,#fbbf24,#f97316)}.fill.b{background:linear-gradient(90deg,#fb7185,#e11d48)}
.fill::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);
  transform:translateX(-100%);animation:sweep 3s linear infinite}
@keyframes grow{from{transform:scaleX(0)}}
@keyframes sweep{to{transform:translateX(250%)}}

/* ═════════ 圖表 ═════════ */
.chart{width:100%;display:block;overflow:visible}
.chart path{transition:d .9s cubic-bezier(.22,1,.36,1)}
.gl{stroke:var(--line);stroke-width:1;vector-effect:non-scaling-stroke;stroke-dasharray:3 5}
.wait{display:grid;place-items:center;color:var(--sub);font-size:12.5px}
.xl{display:flex;justify-content:space-between;color:var(--faint);font-size:11.5px;margin-top:6px;font-weight:600}
.legend{display:flex;gap:14px;font-size:12.5px;color:var(--sub);flex-wrap:wrap}
.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.legend b{color:var(--text);font-weight:800;margin-left:4px}

/* ═════════ 頂部（手機） ═════════ */
.bar{position:sticky;top:0;z-index:5;margin:0 -16px;padding:calc(env(safe-area-inset-top) + 10px) 16px 10px;
  display:flex;align-items:center;gap:8px;transition:background .35s,box-shadow .35s}
.scrolled .bar{background:var(--glass2);-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);box-shadow:0 1px 0 var(--line)}
.bar .mini{font-weight:800;font-size:16px;opacity:0;transform:translateY(6px);transition:.4s cubic-bezier(.22,1,.36,1)}
.scrolled .bar .mini{opacity:1;transform:none}
.hero{padding:4px 2px 18px;animation:rise .8s cubic-bezier(.22,1,.36,1) both}
.hello{font-size:15px;color:var(--sub);font-weight:700}
.hero h1{font-size:30px;font-weight:900;letter-spacing:.2px;line-height:1.2;margin-top:2px}
.hero h1 em{font-style:normal;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.meta{color:var(--faint);font-size:12px;margin-top:6px;display:flex;align-items:center;gap:6px;font-weight:600}
.live{width:6px;height:6px;border-radius:50%;background:var(--ok);animation:live 2.4s ease-out infinite}
.live.off{background:var(--faint);animation:none}
@keyframes live{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--ok) 60%,transparent)}100%{box-shadow:0 0 0 8px transparent}}

/* ═════════ 摘要膠囊 ═════════ */
.summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.pill{border:0;border-radius:999px;padding:8px 14px 8px 12px;font-size:13.5px;display:flex;align-items:center;gap:8px;font-weight:700;
  transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .3s}
.pill[data-filter]{cursor:pointer}.pill[data-filter]:active{transform:scale(.93)}
.pill b{font-weight:900}
.summary.filtering .pill{opacity:.45}
.summary.filtering .pill.on{opacity:1;box-shadow:inset 0 1px 0 var(--spec),inset 0 0 0 1.5px var(--accent),0 0 0 1px var(--edge),var(--shadow)}
.empty{text-align:center;color:var(--sub);padding:50px 0;font-size:14px;grid-column:1/-1}

/* ═════════ 卡片（手機） ═════════ */
.grid{display:grid;gap:var(--gap);grid-template-columns:repeat(auto-fill,minmax(310px,1fr))}
.card{border-radius:30px;padding:var(--pad);animation:rise .8s cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--i,0) * 90ms)}
.card.bad{box-shadow:inset 0 1px 0 var(--spec),inset 0 0 0 1.5px color-mix(in srgb,var(--bad) 65%,transparent),0 0 0 1px var(--edge),0 0 42px -14px var(--bad),var(--shadow)}
.card.warn{box-shadow:inset 0 1px 0 var(--spec),inset 0 0 0 1.5px color-mix(in srgb,var(--warn) 55%,transparent),0 0 0 1px var(--edge),0 0 38px -16px var(--warn),var(--shadow)}
.head{display:flex;align-items:center;gap:10px}
.avatar{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;flex:none;position:relative;
  background:var(--glass2);box-shadow:inset 0 0 0 1px var(--line),inset 0 1px 0 var(--rim)}
.avatar .flag{width:26px;height:19px}
/* 狀態：頭像邊緣發光（綠＝正常、黃＝注意、紅＝異常） */
.avatar{--st:var(--ok);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--st) 75%,transparent),0 0 12px -3px color-mix(in srgb,var(--st) 60%,transparent);
  animation:glow 3.2s ease-in-out infinite}
.avatar.warn{--st:var(--warn)}.avatar.bad{--st:var(--bad);animation-duration:1.3s}
.avatar .flag{box-shadow:0 0 0 1px rgba(127,127,127,.2),0 0 10px -2px color-mix(in srgb,var(--st) 70%,transparent)}
@keyframes glow{50%{box-shadow:inset 0 0 0 2px var(--st),0 0 22px 1px color-mix(in srgb,var(--st) 65%,transparent)}}
.avatar .letter{font-weight:900;font-size:17px;color:var(--sub)}
.head .nm{min-width:0;flex:1}
.head h2{font-size:18px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.25;display:flex;align-items:center;gap:4px}
.head h2 span{overflow:hidden;text-overflow:ellipsis}
.head .sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.uptime{font-size:11.5px;font-weight:700;color:var(--sub);background:var(--track);border-radius:99px;padding:4px 10px;white-space:nowrap}
.alerts{margin:14px 0 0;display:flex;flex-direction:column;gap:6px}
.alert{font-size:13px;font-weight:700;padding:9px 12px;border-radius:14px;display:flex;align-items:center;gap:9px;animation:rise .5s cubic-bezier(.22,1,.36,1) both}
.alert svg{width:16px;height:16px;flex:none}
.alert.bad{background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad)}
.alert.warn{background:color-mix(in srgb,var(--warn) 14%,transparent);color:var(--warn)}
.metrics{margin-top:16px;display:flex;flex-direction:column;gap:13px}
.metric{display:grid;grid-template-columns:auto 1fr;gap:4px 11px;align-items:center}
.metric .ico{grid-row:span 2}
.metric .row{display:flex;justify-content:space-between;align-items:baseline;font-size:13.5px;font-weight:700}
.metric .row b{font-size:16px;font-weight:900}
.metric .row b small{font-size:12px;opacity:.6;margin-left:1px}
.metric .row .sub{font-weight:600;margin-left:6px;font-size:12px}
.spark{margin-top:16px;padding:12px 12px 6px;border-radius:18px;background:var(--glass2);box-shadow:inset 0 0 0 1px var(--line)}
.spark .lbl{display:flex;justify-content:space-between;font-size:11.5px;color:var(--sub);margin-bottom:6px;font-weight:700}
.spark .lbl i{display:inline-block;width:7px;height:7px;border-radius:50%;margin:0 4px 0 9px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-top:12px}
.stat{border-radius:18px;padding:10px 11px;background:var(--glass2);box-shadow:inset 0 0 0 1px var(--line);display:flex;flex-direction:column;gap:6px}
.stat .k{display:flex;align-items:center;gap:7px;color:var(--sub);font-size:11.5px;font-weight:700}
.stat .v{font-size:15px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.more{margin-top:14px;border-top:1px solid var(--line);padding-top:8px}
.more-head{width:100%;font-size:13.5px;color:var(--sub);background:none;border:0;cursor:pointer;padding:6px 0;font-weight:700;
  display:flex;align-items:center;gap:10px;text-align:left}
.more-head b{color:var(--bad);font-weight:800}
.chev{width:18px;height:18px;transition:transform .5s cubic-bezier(.22,1,.36,1);margin-left:auto}
.more.open .chev{transform:rotate(180deg)}
.collapse{display:grid;grid-template-rows:0fr;transition:grid-template-rows .55s cubic-bezier(.22,1,.36,1)}
.more.open .collapse{grid-template-rows:1fr}
.collapse>div{overflow:hidden}
.list{display:flex;flex-direction:column;gap:2px;padding-top:6px}
.item{display:flex;align-items:center;gap:10px;font-size:13.5px;padding:7px 4px;border-radius:12px;font-weight:600;
  opacity:0;transform:translateY(-4px);transition:opacity .4s,transform .45s cubic-bezier(.22,1,.36,1),background .2s}
.more.open .item,.tbl .item{opacity:1;transform:none}
.item:hover{background:var(--track)}
.item .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tag{color:var(--sub);font-size:11.5px;white-space:nowrap;font-weight:700;padding:3px 8px;border-radius:99px;background:var(--track)}
.foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;border-top:1px solid var(--line);padding-top:14px}
.foot .sub{font-weight:600;line-height:1.6}
.offline{display:flex;align-items:center;gap:12px;margin-top:14px;padding:14px;border-radius:18px;background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--bad);font-weight:700;font-size:13.5px}
.offline svg{width:22px;height:22px;flex:none}
.offline .sub{color:var(--sub);font-weight:600;margin-top:2px}

/* 緊湊 */
[data-density="compact"]{--pad:14px;--gap:12px}
[data-density="compact"] .metrics{gap:9px;margin-top:12px}
[data-density="compact"] .ico{width:26px;height:26px;border-radius:8px}
[data-density="compact"] .spark,[data-density="compact"] .stats{margin-top:10px}
[data-density="compact"] .card{border-radius:24px}

/* ═════════ 電腦版 ═════════ */
@media (min-width:1024px){ body{padding:0 26px} .wrap{max-width:1480px} }
.dash.d{display:grid;grid-template-columns:304px minmax(0,1fr);gap:22px;padding:24px 0 34px;align-items:start}
.side{position:sticky;top:24px;border-radius:32px;padding:20px 14px 14px;display:flex;flex-direction:column;gap:16px;
  max-height:calc(100vh - 48px);animation:rise .8s cubic-bezier(.22,1,.36,1) both}
.brand{display:flex;align-items:center;gap:11px;padding:0 6px}
.brand img{width:38px;height:38px;border-radius:12px;box-shadow:0 8px 20px -8px var(--a1)}
.brand h1{font-size:19px;font-weight:900;line-height:1.2}
.brand .meta{margin-top:1px}
.greet{padding:0 8px;font-size:13.5px;font-weight:700;color:var(--sub);line-height:1.5}
.greet b{color:var(--text)}
.side .summary{margin:0;padding:0 4px;gap:6px}
.side .pill{padding:6px 11px 6px 10px;font-size:12.5px;gap:6px}
.hosts{display:flex;flex-direction:column;gap:6px;overflow:auto;padding:2px;margin:0 -2px}
.host{border:0;background:transparent;text-align:left;cursor:pointer;border-radius:22px;padding:11px 12px;display:flex;flex-direction:column;gap:9px;
  transition:background .3s,box-shadow .3s,transform .3s cubic-bezier(.34,1.56,.64,1)}
.host:hover{background:var(--track)}.host:active{transform:scale(.98)}
.host.on{background:var(--glass);box-shadow:inset 0 1px 0 var(--spec),inset 0 0 0 1px var(--rim),0 10px 26px -14px rgba(0,0,0,.5)}
.host .head{gap:10px}.host .avatar{width:36px;height:36px;border-radius:12px}.host .avatar .flag{width:22px;height:16px}
.host h2{font-size:14.5px}
.minis{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.minis .k{display:flex;justify-content:space-between;font-size:11px;color:var(--sub);margin-bottom:4px;font-weight:700}
.minis .k b{color:var(--text);font-weight:900}
.minis .track{height:5px}.minis .fill::after{display:none}
.side-foot{margin-top:auto;display:flex;align-items:center;gap:6px;padding:12px 4px 0;border-top:1px solid var(--line)}
.side-foot .sub{flex:1;padding-left:4px;font-weight:700}

.detail{display:flex;flex-direction:column;gap:18px;min-width:0}
.panel{border-radius:30px;padding:20px 22px;animation:rise .8s cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--i,0) * 70ms)}
.dhead{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.dhead .avatar{width:56px;height:56px;border-radius:18px}.dhead .avatar .flag{width:34px;height:25px;border-radius:7px}.dhead .avatar .emoji{font-size:28px}
.dhead h2{font-size:27px;font-weight:900}
.dhead .sub{font-size:13px;margin-top:2px}
.dhead .act{display:flex;align-items:center;gap:14px;text-align:right;margin-left:auto}
.detail>.alerts{margin:0;flex-direction:row;flex-wrap:wrap}
.detail .alert{padding:10px 15px}
.ph{display:flex;align-items:center;gap:11px;margin-bottom:14px;flex-wrap:wrap}
.ph h3{font-size:15.5px;font-weight:800}
.ph .legend{margin-left:auto}
.gauges{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.gauge{border-radius:30px;padding:18px 18px 20px;display:flex;flex-direction:column;align-items:center}
.gauge .ph{align-self:stretch;margin-bottom:6px}
.gwrap{position:relative;width:148px;height:148px}
.gwrap::before{content:"";position:absolute;inset:20px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--a2) 18%,transparent),transparent 70%)}
.gwrap svg{width:100%;height:100%;transform:rotate(-90deg);position:relative}
.rt{fill:none;stroke:var(--track);stroke-width:12}
.rv{fill:none;stroke:url(#rgN);stroke-width:12;stroke-linecap:round;
  transition:stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1);animation:ringin 1.7s cubic-bezier(.22,1,.36,1) both}
.rv.w{stroke:url(#rgW)}.rv.b{stroke:url(#rgB)}
@keyframes ringin{from{stroke-dashoffset:var(--c)}}
.gin{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.gin b{font-size:36px;font-weight:900;line-height:1}
.gin b small{font-size:16px;opacity:.5;margin-left:1px}
.gin>span{font-size:12px;color:var(--sub);font-weight:700;margin-top:4px}
.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.cbox{height:170px}
.lower{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:18px;align-items:start}
.tbl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 16px}
.tbl .item{padding:8px 10px}
.kv{display:grid;grid-template-columns:auto 1fr;gap:11px 18px;font-size:13.5px;margin:0}
.kv dt{color:var(--sub);font-weight:600}.kv dd{text-align:right;margin:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bigoff{text-align:center;padding:60px 20px;color:var(--sub)}
.bigoff b{display:block;font-size:20px;color:var(--text);margin-bottom:6px}
@media (max-width:1300px){.charts{grid-template-columns:1fr}.lower{grid-template-columns:1fr}}
@media (max-width:1180px){.gwrap{width:124px;height:124px}.gin b{font-size:30px}}

/* ═════════ 骨架（第一次載入） ═════════ */
.skel{border-radius:30px;height:420px;overflow:hidden}
.skel::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.08) 50%,transparent 70%);
  animation:shim 1.6s linear infinite;background-size:200% 100%}
@keyframes shim{from{background-position:150% 0}to{background-position:-50% 0}}

/* ═════════ 登入 ═════════ */
.login{max-width:360px;margin:16vh auto 0;text-align:center;border-radius:34px;padding:32px 24px 26px;animation:rise .8s cubic-bezier(.22,1,.36,1) both}
.login .logo{width:68px;height:68px;border-radius:20px;margin:0 auto 14px;box-shadow:0 14px 34px -12px var(--a1)}
.login h1{font-size:26px;font-weight:900}
.login p{color:var(--sub);font-size:13.5px;margin-top:4px;font-weight:600}
.field{width:100%;font:inherit;font-size:16px;padding:13px 16px;border-radius:16px;border:0;color:var(--text);
  background:var(--glass2);box-shadow:inset 0 0 0 1px var(--line);outline:none;transition:box-shadow .25s}
.field:focus{box-shadow:inset 0 0 0 2px var(--accent)}
.login .field{margin:20px 0 8px}
.login .ubtn{width:100%;justify-content:center;padding:14px;font-size:15.5px}
.err{color:var(--bad);font-size:13px;min-height:20px;font-weight:700}
.shake{animation:shake .45s}
@keyframes shake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}

/* ═════════ 對話框、設定面板、通知 ═════════ */
.veil{position:fixed;inset:0;z-index:50;background:var(--veil);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;padding:20px;animation:fade .3s both}
.veil.closing{animation:fade .25s reverse both}
.dialog{width:100%;max-width:360px;border-radius:30px;padding:24px 22px 18px;text-align:center;animation:pop .45s cubic-bezier(.34,1.4,.64,1) both}
.closing .dialog{animation:pop .25s reverse both}
@keyframes pop{from{opacity:0;transform:scale(.9) translateY(10px)}}
.dialog .big{width:52px;height:52px;border-radius:16px;margin:0 auto 12px}
.dialog .big svg{width:26px;height:26px}
.dialog h3{font-size:18px;font-weight:900}
.dialog p{color:var(--sub);font-size:13.5px;margin-top:6px;white-space:pre-line;font-weight:600}
.dialog .field{margin-top:16px;text-align:center}
.dialog .btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
.dialog .btns button{justify-content:center;padding:12px}

.veil.sheetv{align-items:flex-end;justify-content:flex-end;padding:0}
.sheet{width:100%;max-height:88vh;overflow:auto;border-radius:30px 30px 0 0;padding:10px 18px calc(env(safe-area-inset-bottom) + 22px);
  animation:slideup .55s cubic-bezier(.22,1,.36,1) both}
.closing .sheet{animation:slideup .3s reverse both}
@keyframes slideup{from{transform:translateY(100%)}}
@media (min-width:1024px){
  .veil.sheetv{align-items:stretch;padding:16px}
  .sheet{width:400px;max-height:none;border-radius:30px;padding:10px 22px 22px;animation-name:slidein}
  @keyframes slidein{from{transform:translateX(110%)}}
}
.grab{width:40px;height:5px;border-radius:9px;background:var(--faint);margin:2px auto 10px}
.sheet .top{display:flex;align-items:center;justify-content:space-between;margin:6px 0 10px}
.sheet h3{font-size:22px;font-weight:900}
.sec{margin-top:18px}
.sec>h4{font-size:12px;font-weight:800;color:var(--sub);letter-spacing:.5px;margin:0 6px 8px}
.group{border-radius:20px;background:var(--glass2);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.opt{display:flex;align-items:center;gap:12px;padding:12px 14px;font-size:14px;font-weight:700;min-height:52px}
.opt+.opt{border-top:1px solid var(--line)}
.opt .lab{flex:1}
.opt .lab small{display:block;font-size:11.5px;color:var(--sub);font-weight:600}
.seg{display:flex;background:var(--track);border-radius:12px;padding:3px;gap:2px}
.seg button{border:0;background:transparent;cursor:pointer;border-radius:9px;padding:6px 11px;font-size:12.5px;font-weight:800;color:var(--sub);
  transition:background .3s,color .3s,box-shadow .3s}
.seg button.on{background:var(--glass);color:var(--text);box-shadow:0 2px 8px -2px rgba(0,0,0,.25),inset 0 0 0 1px var(--rim)}
[data-mode="light"] .seg button.on{background:#fff}
.sw{display:flex;gap:10px}
.sw button{width:28px;height:28px;border-radius:50%;border:0;cursor:pointer;position:relative;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.sw button:active{transform:scale(.85)}
.sw button.on::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2.5px solid var(--text);opacity:.85}
.tog{appearance:none;-webkit-appearance:none;width:50px;height:30px;border-radius:99px;background:var(--track);position:relative;cursor:pointer;flex:none;
  transition:background .3s;box-shadow:inset 0 0 0 1px var(--line)}
.tog::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;
  box-shadow:0 3px 8px rgba(0,0,0,.3);transition:transform .35s cubic-bezier(.34,1.4,.64,1)}
.tog:checked{background:var(--ok)}.tog:checked::after{transform:translateX(20px)}
.slider{width:100%;display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--sub);font-weight:700}
.slider input{flex:1;accent-color:var(--a2)}
.reset{margin-top:20px;width:100%;justify-content:center}

.toasts{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 22px);transform:translateX(-50%);z-index:60;
  display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;width:max-content;max-width:92vw}
.toast{border-radius:999px;padding:11px 18px 11px 14px;font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:9px;
  animation:toastin .55s cubic-bezier(.34,1.4,.64,1) both}
.toast.out{animation:toastin .3s reverse both}
.toast svg{width:18px;height:18px;flex:none}
.toast.ok svg{color:var(--ok)}.toast.bad svg{color:var(--bad)}
@keyframes toastin{from{opacity:0;transform:translateY(16px) scale(.92)}}

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
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  chev:'<path d="m6 9 6 6 6-6"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>',
  warn:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
  ok:'<circle cx="12" cy="12" r="9.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  upd:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  off:'<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M2 2l20 20"/>',
};
const I = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;

/* ═════════ 個人設定（存在這台裝置） ═════════ */
const DEF = {theme:"auto", accent:"blue", glass:50, bg:"aurora", motion:true, density:"cozy", size:"m", refresh:5,
  show:{chart:true, net:true, items:true, info:true, flag:true}};
let PREF = (() => { try { const p = JSON.parse(store("vps-prefs") || "{}"); return {...DEF, ...p, show:{...DEF.show, ...(p.show||{})}}; } catch(e){ return JSON.parse(JSON.stringify(DEF)); } })();
const getP = k => k.split(".").reduce((o,x)=>o && o[x], PREF);
function setP(k, v){ const ks = k.split("."); let o = PREF; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; store("vps-prefs", JSON.stringify(PREF)); }
const DARKQ = matchMedia("(prefers-color-scheme: dark)");
function applyPrefs(){
  const h = document.documentElement, dark = PREF.theme === "dark" || (PREF.theme === "auto" && DARKQ.matches), g = PREF.glass / 100;
  h.dataset.mode = dark ? "dark" : "light"; h.dataset.accent = PREF.accent; h.dataset.bg = PREF.bg;
  h.dataset.motion = PREF.motion ? "on" : "off"; h.dataset.density = PREF.density;
  h.style.setProperty("--ga", (dark ? .02 + g * .17 : .22 + g * .62).toFixed(3));
  h.style.setProperty("--blur", Math.round(14 + g * 26) + "px");
  h.style.setProperty("--zoom", {s:.92, m:1, l:1.1}[PREF.size] || 1);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#06080f" : "#eef1f7";
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
    onerror="FLAGFAIL['${cc}']=1;this.outerHTML='<span class=emoji>${emo}</span>'">`;
}
const place = s => s.geo ? [(REGION&&s.geo.cc)?REGION.of(s.geo.cc):s.geo.cc, s.geo.city].filter(Boolean).join(" ") : "";
function when(t){ const d=new Date(t*1000), now=new Date();
  const hm=d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false});
  return d.toDateString()===now.toDateString() ? `今天 ${hm}` : `${d.getMonth()+1}/${d.getDate()} ${hm}`; }
function avatar(s){
  const f = PREF.show.flag && s.geo ? flag(s.geo.cc) : "";
  const lv = lvOf(s), tip = {ok:"運作正常", warn:"需要留意", bad:"出問題了"}[lv];
  return `<div class="avatar ${lv}" title="${tip}">${f || `<span class="letter">${esc([...(s.name||"?")][0])}</span>`}</div>`;
}
const editBtn = s => s.online ? `<button class="iconbtn" title="改名稱" data-rename="${esc(s.node||"")}" data-name="${esc(s.name)}">${I("edit")}</button>` : "";
function alerts(s){
  const al = (s.problems||[]).map(p=>`<div class="alert bad">${I("warn")}${esc(p)}</div>`)
    .concat((s.notices||[]).map(p=>`<div class="alert warn">${I("info")}${esc(p)}</div>`));
  return al.length ? `<div class="alerts">${al.join("")}</div>` : "";
}
function itemsOf(s){
  const items = [];
  (s.containers||[]).forEach(c=>{
    const st = /unhealthy/.test(c.status) ? "bad" : c.state==="running" ? "ok"
      : (c.state==="created" || c.state==="paused" || /Exited \(0\)/.test(c.status)) ? "off" : "bad";
    items.push({n:c.name, st, s:STATE[c.state]||c.state, t:"容器"});
  });
  (s.services||[]).forEach(v=>items.push({n:v.name, st:v.state==="active"?"ok":"bad", s:STATE[v.state]||v.state, t:"服務"}));
  return items;
}
function itemsSummary(items){
  const bad = items.filter(x=>x.st==="bad").length, okn = items.filter(x=>x.st==="ok").length, off = items.length-bad-okn;
  return `${okn} 個正常${off?`・${off} 個沒在用`:""}${bad?`・<b>${bad} 個異常</b>`:""}`;
}
const itemRow = (x,j) => `<div class="item" style="transition-delay:${j*35}ms"><span class="dot ${x.st}"></span><span class="n">${esc(x.n)}</span><span class="tag">${x.t}・${esc(x.s)}</span></div>`;
function updateInfo(s){
  const n = s.updates ? s.updates.total : 0, u = s.update;
  let info = s.updates ? (n ? `有 ${n} 個套件可以更新${s.updates.security?`（含 ${s.updates.security} 個安全更新）`:""}` : "系統已經是最新的 ✨") : "";
  if (u && u.last) info += `${info?"<br>":""}上次更新${u.last.ok?"成功":`<span style="color:var(--bad)">失敗</span>`}・${when(u.last.time)}`;
  return info;
}
function updateBtn(s){
  const u = s.update, n = s.updates ? s.updates.total : 0;
  if (!u || !u.supported) return "";
  return u.running ? `<button class="ubtn" disabled><span class="spin"></span>更新中…</button>`
    : `<button class="ubtn" data-update="${esc(s.node||"")}" data-label="${esc(s.name)}" data-n="${n}">${I("upd").replace("<svg","<svg style=\"width:15px;height:15px\"")}${n?`更新（${n}）`:"檢查更新"}</button>`;
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
function chart(id, series, o={}){
  const W = 600, H = o.h || 170, all = series.flatMap(s=>s.data||[]);
  if (all.length < 4) return `<div class="wait" style="height:${H}px">收集資料中，約 1 分鐘後出現…</div>`;
  const max = o.max || Math.max(1, ...all) * 1.2;
  let g = "";
  if (o.grid) for (const f of [.25,.5,.75]) g += `<line class="gl" x1="0" x2="${W}" y1="${(H*f).toFixed(1)}" y2="${(H*f).toFixed(1)}"/>`;
  const defs = series.map((s,i)=>`<linearGradient id="${id}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:${o.fade??.3}"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`).join("");
  const body = series.map((s,i)=>{ const p = pathOf(s.data, W, H, max); if (!p) return "";
    return `<path d="${p.area}" fill="url(#${id}${i})"/><path d="${p.line}" fill="none" style="stroke:${s.color}" stroke-width="${o.sw||2.4}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="miter"/>`; }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px"><defs>${defs}</defs>${g}${body}</svg>`;
}
const minutes = h => (h && h.t && h.t.length > 1) ? Math.max(1, Math.round((h.t[h.t.length-1]-h.t[0])/60)) : 30;
const cid = (s, k) => "g" + Math.abs([...keyOf(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))|0, 7)) + k;
const COL = {cpu:"var(--a1)", mem:"var(--a2)", rx:"#2dd4bf", tx:"#f472b6"};

/* ═════════ 手機版 ═════════ */
function metric(icon, label, pct, detail){
  return `<div class="metric"><span class="ico ${icon}">${I(icon)}</span>
    <div class="row"><span>${label}<span class="sub">${detail}</span></span><b>${num(pct)}<small>%</small></b></div>${track(pct)}</div>`;
}
function mcard(s, i){
  const lv = lvOf(s), key = keyOf(s);
  let h = `<div class="card glass ${lv==="ok"?"":lv}" data-key="${esc(key)}" style="--i:${i}"><div class="head">${avatar(s)}
    <div class="nm"><h2><span>${esc(s.name)}</span>${editBtn(s)}</h2><div class="sub">${s.online ? esc(place(s) || s.os) : "目前連不上"}</div></div>`;
  if (!s.online) return h + `</div><div class="offline">${I("off")}<div>連不上這台主機<div class="sub">${esc(s.error||"")}</div></div></div></div>`;
  h += `<span class="uptime">開機 ${up(s.uptime)}</span></div>` + alerts(s);
  h += `<div class="metrics">` + metric("cpu", "處理器", s.cpu, `${s.cores} 核`) +
       metric("mem", "記憶體", s.mem.pct, `${size(s.mem.used)} / ${size(s.mem.total)}`) +
       s.disks.map(d=>metric("disk", "磁碟"+(d.path==="/"?"":" "+esc(d.path)), d.pct, `${size(d.used)} / ${size(d.total)}`)).join("") + `</div>`;
  if (PREF.show.chart && s.hist) h += `<div class="spark"><div class="lbl"><span>最近 ${minutes(s.hist)} 分鐘</span><span><i style="background:${COL.cpu}"></i>處理器<i style="background:${COL.mem}"></i>記憶體</span></div>
      ${chart(cid(s,"m"), [{data:s.hist.cpu,color:COL.cpu},{data:s.hist.mem,color:COL.mem}], {max:100, h:64, fade:.25, sw:2})}</div>`;
  h += `<div class="stats"><div class="stat"><div class="k"><span class="ico sm load">${I("load")}</span>負載</div><div class="v">${num(s.load[0],2)}</div></div>` +
       (PREF.show.net ? `<div class="stat"><div class="k"><span class="ico sm down">${I("down")}</span>下載</div><div class="v num">${rate(s.net.rx)}</div></div>
        <div class="stat"><div class="k"><span class="ico sm up">${I("up")}</span>上傳</div><div class="v num">${rate(s.net.tx)}</div></div>` : "") + `</div>`;
  const items = itemsOf(s);
  if (PREF.show.items && items.length) h += `<div class="more ${open[key]?"open":""}"><button class="more-head" data-toggle="${esc(key)}"><span class="ico sm box">${I("box")}</span><span>容器與服務：${itemsSummary(items)}</span><span class="chev">${I("chev")}</span></button>
      <div class="collapse"><div><div class="list">${items.map(itemRow).join("")}</div></div></div></div>`;
  const info = updateInfo(s), btn = updateBtn(s);
  if (info || btn) h += `<div class="foot"><div class="sub">${info}</div>${btn}</div>`;
  return h + `</div>`;
}
function summary(n, clickable){
  const p = (k, label) => `<button class="pill glass ${FILTER===k?"on":""}" ${clickable?`data-filter="${k}"`:""}><span class="dot ${k}"></span>${label} <b class="num">${n[k]}</b></button>`;
  return `<div class="summary ${FILTER&&clickable?"filtering":""}">${p("ok","正常")}${p("warn","注意")}${p("bad","異常")}</div>`;
}
function renderMobile(list, n, time){
  const many = list.length > 1;
  if (!many) FILTER = "";
  const shown = FILTER ? list.filter(s=>lvOf(s)===FILTER) : list, g = greet(n, list.length);
  return `<div class="dash m" data-key="m"><header class="bar"><span class="mini">VPS 哨兵</span><span class="grow"></span>
    <button class="cap glass" data-settings title="設定">${I("gear")}</button><button class="cap glass" data-logout title="登出">${I("logout")}</button></header>
    <div class="hero"><div class="hello">${g.hi}</div><h1>${g.line}</h1><div class="meta"><span class="live"></span>更新於 ${time}</div></div>
    ${summary(n, many)}
    <div class="grid">${shown.length ? shown.map(mcard).join("") : `<div class="empty">這個分類目前沒有主機 👍</div>`}</div></div>`;
}

/* ═════════ 電腦版 ═════════ */
function hostItem(s, on){
  let h = `<button class="host ${on?"on":""}" data-sel="${esc(keyOf(s))}" data-key="${esc(keyOf(s))}"><div class="head">${avatar(s)}
    <div class="nm"><h2><span>${esc(s.name)}</span></h2><div class="sub">${s.online ? esc(place(s) || s.os) : "連不上"}</div></div></div>`;
  if (s.online) h += `<div class="minis"><div><div class="k">處理器<b>${num(s.cpu)}%</b></div>${track(s.cpu)}</div>
    <div><div class="k">記憶體<b>${num(s.mem.pct)}%</b></div>${track(s.mem.pct)}</div></div>`;
  return h + `</button>`;
}
function ring(icon, label, pct, sub, i){
  const r = 52, Cc = 2*Math.PI*r, off = Cc*(1-Math.max(0,Math.min(pct,100))/100);
  return `<div class="gauge glass panel" style="--i:${i}"><div class="ph"><span class="ico sm ${icon}">${I(icon)}</span><h3>${label}</h3></div>
    <div class="gwrap"><svg viewBox="0 0 120 120"><circle class="rt" cx="60" cy="60" r="${r}"/>
    <circle class="rv ${tier(pct)}" cx="60" cy="60" r="${r}" style="--c:${Cc.toFixed(1)};stroke-dasharray:${Cc.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"/></svg>
    <div class="gin"><b>${num(pct)}<small>%</small></b><span>${sub}</span></div></div></div>`;
}
function detail(s){
  const key = keyOf(s), where = place(s);
  let h = `<div class="detail" data-key="d-${esc(key)}"><div class="panel glass dhead" style="--i:0">${avatar(s)}
      <div style="min-width:0"><h2 class="nmh" style="display:flex;align-items:center;gap:6px"><span>${esc(s.name)}</span>${editBtn(s)}</h2>
      <div class="sub">${s.online ? `${where?esc(where)+"・":""}${esc(s.os)}・開機 ${up(s.uptime)}` : "連不上這台主機"}</div></div>
      ${s.online ? `<div class="act"><div class="sub" style="line-height:1.6;font-weight:600">${updateInfo(s)}</div>${updateBtn(s)}</div>` : ""}</div>`;
  if (!s.online) return h + `<div class="panel glass bigoff" style="--i:1"><b>連不上這台主機</b>${esc(s.error||"")}</div></div>`;
  h += alerts(s);
  const d0 = s.disks[0] || {pct:0, used:0, total:0};
  h += `<div class="gauges">${ring("cpu", "處理器", s.cpu, `${s.cores} 核心`, 1)}
        ${ring("mem", "記憶體", s.mem.pct, `${size(s.mem.used)} / ${size(s.mem.total)}`, 2)}
        ${ring("disk", "磁碟", d0.pct, `${size(d0.used)} / ${size(d0.total)}`, 3)}</div>`;
  const hs = s.hist || {}, mins = minutes(hs), xl = `<div class="xl"><span>${mins} 分鐘前</span><span>現在</span></div>`;
  const cp = PREF.show.chart ? `<div class="panel glass" style="--i:4"><div class="ph"><span class="ico sm cpu">${I("load")}</span><h3>處理器與記憶體</h3><div class="legend">
      <span><i style="background:${COL.cpu}"></i>處理器<b>${num(s.cpu)}%</b></span><span><i style="background:${COL.mem}"></i>記憶體<b>${num(s.mem.pct)}%</b></span></div></div>
      <div class="cbox">${chart(cid(s,"a"), [{data:hs.cpu,color:COL.cpu},{data:hs.mem,color:COL.mem}], {max:100, grid:1})}</div>${xl}</div>` : "";
  const np = PREF.show.net ? `<div class="panel glass" style="--i:5"><div class="ph"><span class="ico sm down">${I("down")}</span><h3>網路流量</h3><div class="legend">
      <span><i style="background:${COL.rx}"></i>下載<b class="num">${rate(s.net.rx)}</b></span><span><i style="background:${COL.tx}"></i>上傳<b class="num">${rate(s.net.tx)}</b></span></div></div>
      <div class="cbox">${chart(cid(s,"b"), [{data:hs.rx,color:COL.rx},{data:hs.tx,color:COL.tx}], {grid:1})}</div>${xl}</div>` : "";
  if (cp || np) h += `<div class="charts" style="${cp&&np?"":"grid-template-columns:1fr"}">${cp}${np}</div>`;
  const items = itemsOf(s);
  const ip = PREF.show.items ? `<div class="panel glass" style="--i:6"><div class="ph"><span class="ico sm box">${I("box")}</span><h3>容器與服務</h3><span class="sub" style="margin-left:auto;font-weight:700">${items.length?itemsSummary(items).replace("<b>",'<b style="color:var(--bad)">'):""}</span></div>
      ${items.length ? `<div class="tbl">${items.map(itemRow).join("")}</div>` : `<div class="sub">沒有偵測到容器或服務</div>`}</div>` : "";
  const fp = PREF.show.info ? `<div class="panel glass" style="--i:7"><div class="ph"><span class="ico sm info">${I("info")}</span><h3>系統資訊</h3></div><dl class="kv">
      <dt>作業系統</dt><dd>${esc(s.os)}</dd><dt>核心版本</dt><dd>${esc(s.kernel)}</dd>
      ${where?`<dt>位置</dt><dd>${esc(where)}</dd>`:""}${s.geo&&s.geo.org?`<dt>供應商</dt><dd>${esc(s.geo.org)}</dd>`:""}
      <dt>負載（1／5／15 分）</dt><dd class="num">${s.load.map(x=>x.toFixed(2)).join(" / ")}</dd>
      <dt>開機時間</dt><dd>${up(s.uptime)}</dd>
      ${s.disks.map(d=>`<dt>磁碟 ${esc(d.path)}</dt><dd class="num">${size(d.used)} / ${size(d.total)}</dd>`).join("")}
      ${s.mem.swap_total?`<dt>虛擬記憶體</dt><dd class="num">${size(s.mem.swap_used)} / ${size(s.mem.swap_total)}</dd>`:""}
    </dl></div>` : "";
  if (ip || fp) h += `<div class="lower" style="${ip&&fp?"":"grid-template-columns:1fr"}">${ip}${fp}</div>`;
  return h + `</div>`;
}
function renderDesk(list, n, time){
  const sel = list.find(s=>keyOf(s)===SEL) || list[0], g = greet(n, list.length);
  return `<div class="dash d" data-key="d"><aside class="side glass">
      <div class="brand"><img src="/icon.svg" alt=""><div><h1>VPS 哨兵</h1><div class="meta"><span class="live"></span>更新於 ${time}</div></div></div>
      <div class="greet">${g.hi}<br><b>${g.line.replace(/<\/?em>/g,"")}</b></div>
      ${summary(n, false)}
      <div class="hosts">${list.map(s=>hostItem(s, s===sel)).join("")}</div>
      <div class="side-foot"><span class="sub">${list.length} 台主機</span>
        <button class="iconbtn" data-settings title="設定">${I("gear")}</button><button class="iconbtn" data-logout title="登出">${I("logout")}</button></div>
    </aside>${sel ? detail(sel) : ""}</div>`;
}
function skeleton(){
  return DESK.matches
    ? `<div class="dash d" data-key="sk"><aside class="side glass skel" style="height:520px"></aside><div class="detail"><div class="panel glass skel" style="height:96px"></div><div class="panel glass skel" style="height:240px"></div><div class="panel glass skel" style="height:260px"></div></div></div>`
    : `<div class="dash m" data-key="sk"><div class="hero"><div class="hello">連線中…</div><h1>正在讀取<em>主機狀態</em></h1></div><div class="grid"><div class="card glass skel"></div></div></div>`;
}

/* ═════════ 只更新有變動的地方 ═════════ */
function tween(el, from, to, d){
  const t0 = performance.now(), dur = 750;
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
function paint(html){
  const tpl = document.createElement("template"); tpl.innerHTML = html.trim();
  const cur = $("#app .dash");
  if (cur) morph(cur, tpl.content.firstElementChild); else { $("#app").innerHTML = ""; $("#app").appendChild(tpl.content.firstElementChild); }
}
function render(list){
  LIST = list;
  const n = {ok:0,warn:0,bad:0}; list.forEach(s=>n[lvOf(s)]++);
  const time = new Date().toLocaleTimeString("zh-TW",{hour12:false});
  paint(DESK.matches ? renderDesk(list, n, time) : renderMobile(list, n, time));
}
DESK.addEventListener("change", () => LIST.length ? render(LIST) : null);

/* ═════════ 對話框、通知 ═════════ */
function modal({icon, cls="box", title, text, input, ok="確定", cancel="取消"}){
  return new Promise(res => {
    const v = document.createElement("div"); v.className = "veil";
    v.innerHTML = `<div class="dialog glass">${icon?`<div class="ico big ${cls}">${I(icon)}</div>`:""}<h3>${esc(title)}</h3>${text?`<p>${esc(text)}</p>`:""}
      ${input!==undefined?`<input class="field" maxlength="40" value="${esc(input)}">`:""}
      <div class="btns"><button class="ubtn ghost" data-r="0">${cancel}</button><button class="ubtn" data-r="1">${ok}</button></div></div>`;
    $("#layer").appendChild(v);
    const inp = v.querySelector("input");
    const done = r => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(()=>v.remove(), 260); res(r ? (inp ? inp.value : true) : null); };
    if (inp) { setTimeout(()=>{ inp.focus(); inp.select(); }, 60); inp.addEventListener("keydown", e => { if (e.key==="Enter") done(1); if (e.key==="Escape") done(0); }); }
    v.addEventListener("click", e => { if (e.target === v) return done(0); const b = e.target.closest("[data-r]"); if (b) done(+b.dataset.r); });
  });
}
function toast(msg, type="ok"){
  const t = document.createElement("div"); t.className = `toast glass ${type}`;
  t.innerHTML = `${I(type==="ok"?"ok":"warn")}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  setTimeout(()=>{ t.classList.add("out"); setTimeout(()=>t.remove(), 300); }, 2600);
}

/* ═════════ 設定面板 ═════════ */
function settingsBody(){
  const seg = (k, opts) => `<div class="seg">${opts.map(([v,l])=>`<button class="${String(getP(k))===String(v)?"on":""}" data-pref="${k}" data-val="${v}">${l}</button>`).join("")}</div>`;
  const tog = k => `<input type="checkbox" class="tog" data-pref="${k}" ${getP(k)?"checked":""}>`;
  const sw = [["blue","#38bdf8,#6366f1"],["purple","#a78bfa,#d946ef"],["green","#34d399,#14b8a6"],["orange","#fbbf24,#f97316"],["pink","#f472b6,#f43f5e"]]
    .map(([v,c])=>`<button class="${PREF.accent===v?"on":""}" data-pref="accent" data-val="${v}" style="background:linear-gradient(135deg,${c})" title="${v}"></button>`).join("");
  return `
  <div class="sec"><h4>外觀</h4><div class="group">
    <div class="opt"><span class="lab">主題</span>${seg("theme",[["auto","自動"],["light","淺色"],["dark","深色"]])}</div>
    <div class="opt"><span class="lab">主題色</span><div class="sw">${sw}</div></div>
    <div class="opt" style="flex-wrap:wrap"><span class="lab">玻璃效果<small>往左越透明、往右越霧面</small></span>
      <div class="slider" style="flex-basis:100%"><span>清透</span><input type="range" min="0" max="100" value="${PREF.glass}" data-pref="glass"><span>霧面</span></div></div>
    <div class="opt"><span class="lab">背景</span>${seg("bg",[["aurora","流光"],["mesh","漸層"],["plain","純色"]])}</div>
  </div></div>
  <div class="sec"><h4>版面</h4><div class="group">
    <div class="opt"><span class="lab">文字大小</span>${seg("size",[["s","小"],["m","中"],["l","大"]])}</div>
    <div class="opt"><span class="lab">卡片</span>${seg("density",[["cozy","寬鬆"],["compact","緊湊"]])}</div>
    <div class="opt"><span class="lab">動畫效果</span>${tog("motion")}</div>
  </div></div>
  <div class="sec"><h4>要顯示的內容</h4><div class="group">
    <div class="opt"><span class="ico sm cpu">${I("load")}</span><span class="lab">歷史曲線圖</span>${tog("show.chart")}</div>
    <div class="opt"><span class="ico sm down">${I("down")}</span><span class="lab">網路流量</span>${tog("show.net")}</div>
    <div class="opt"><span class="ico sm box">${I("box")}</span><span class="lab">容器與服務</span>${tog("show.items")}</div>
    <div class="opt"><span class="ico sm info">${I("info")}</span><span class="lab">系統資訊<small>電腦版才有</small></span>${tog("show.info")}</div>
    <div class="opt"><span class="ico sm disk">${I("ok")}</span><span class="lab">國旗</span>${tog("show.flag")}</div>
  </div></div>
  <div class="sec"><h4>資料</h4><div class="group">
    <div class="opt"><span class="lab">自動更新<small>多久抓一次最新狀態</small></span>${seg("refresh",[[3,"3 秒"],[5,"5 秒"],[10,"10 秒"],[30,"30 秒"]])}</div>
  </div></div>
  <button class="ubtn ghost reset" data-reset>恢復預設值</button>
  <p class="sub" style="text-align:center;margin-top:12px">這些設定只會存在這台裝置上</p>`;
}
function openSettings(){
  if ($(".sheetv")) return;
  const v = document.createElement("div"); v.className = "veil sheetv";
  v.innerHTML = `<div class="sheet glass"><div class="grab"></div><div class="top"><h3>外觀與設定</h3><button class="iconbtn" data-close>${I("x")}</button></div><div class="sbody">${settingsBody()}</div></div>`;
  $("#layer").appendChild(v);
  const close = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(()=>v.remove(), 300); };
  v.addEventListener("click", e => {
    if (e.target === v || e.target.closest("[data-close]")) return close();
    const b = e.target.closest("[data-val]");
    if (b) { const raw = b.dataset.val; setP(b.dataset.pref, /^\d+$/.test(raw) ? +raw : raw); changed(b.dataset.pref); }
    if (e.target.closest("[data-reset]")) { PREF = JSON.parse(JSON.stringify(DEF)); store("vps-prefs", JSON.stringify(PREF)); changed("all"); toast("已恢復預設值"); }
  });
  v.addEventListener("change", e => { const t = e.target; if (t.classList.contains("tog")) { setP(t.dataset.pref, t.checked); changed(t.dataset.pref); } });
  v.addEventListener("input", e => { const t = e.target; if (t.type === "range") { setP("glass", +t.value); applyPrefs(); } });
  function changed(k){
    applyPrefs();
    v.querySelector(".sbody").innerHTML = settingsBody();
    if (k === "refresh" || k === "all") { clearTimeout(timer); timer = setTimeout(tick, PREF.refresh*1000); }
    if (LIST.length) render(LIST);
  }
}

/* ═════════ 登入 ═════════ */
function login(msg){
  $("#app").innerHTML = `<div class="login glass ${msg?"shake":""}"><img class="logo" src="/icon.svg" alt=""><h1>VPS 哨兵</h1><p>輸入存取密碼就能看到你的主機</p>
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
  if (t.closest("[data-logout]")) {
    if (await modal({icon:"logout", cls:"info", title:"要登出嗎？", text:"登出後要重新輸入密碼才能看到主機。", ok:"登出"})) { setTok(""); LIST = []; clearTimeout(timer); login(); }
    return;
  }
  const tg = t.closest("[data-toggle]");
  if (tg) { const k = tg.dataset.toggle; open[k] = !open[k]; tg.parentElement.classList.toggle("open", open[k]); return; }
  const fl = t.closest("[data-filter]");
  if (fl) { FILTER = FILTER===fl.dataset.filter ? "" : fl.dataset.filter; return render(LIST); }

  const rn = t.closest("[data-rename]");
  if (rn) {
    e.stopPropagation();
    const old = rn.dataset.name;
    const name = await modal({icon:"edit", cls:"box", title:"幫主機取個名字", text:"中文、英文、表情符號都可以", input:old, ok:"儲存"});
    if (name === null || !name.trim() || name.trim() === old) return;
    try {
      const r = await fetch("/api/rename?node="+encodeURIComponent(rn.dataset.rename),
        {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify({name:name.trim()})});
      const d = await r.json().catch(()=>({}));
      (r.ok && d.ok) ? toast(`已改名為「${name.trim()}」`) : toast(d.message || d.error || "改名失敗", "bad");
    } catch(err) { toast("連線失敗，請稍後再試", "bad"); }
    return tick();
  }
  const hs = t.closest("[data-sel]");
  if (hs) { SEL = hs.dataset.sel; store("vps-sel", SEL); scrollTo({top:0, behavior:"smooth"}); return render(LIST); }

  const ub = t.closest("[data-update]");
  if (ub) {
    const node = ub.dataset.update, label = ub.dataset.label, n = +ub.dataset.n;
    const ok = await modal({icon:"upd", cls:"cpu", title: n ? `更新「${label}」？` : `檢查「${label}」的更新？`,
      text: n ? `會在背景安裝 ${n} 個套件更新，大約 1～5 分鐘。\n期間部分服務可能會短暫重新啟動。` : "目前沒有偵測到更新，\n要重新檢查並安裝最新的更新嗎？", ok: n ? "開始更新" : "檢查"});
    if (!ok) return;
    ub.disabled = true; ub.innerHTML = `<span class="spin"></span>開始中…`;
    try {
      const r = await fetch("/api/update?node="+encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok()}});
      const d = await r.json().catch(()=>({}));
      (r.ok && d.ok) ? toast("已開始更新，完成後畫面會顯示結果") : toast(d.message || d.error || "無法開始更新", "bad");
    } catch(err) { toast("連線失敗，請稍後再試", "bad"); }
    return tick();
  }
});
addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > 40), {passive:true});

/* ═════════ 定時抓資料 ═════════ */
let timer;
async function tick(){
  clearTimeout(timer);
  if (!getTok()) return login();
  if (!LIST.length && !$("#app .dash")) paint(skeleton());
  try {
    const r = await fetch("/api/all", {headers:{"X-Token":getTok()}, cache:"no-store"});
    if (r.status === 401) { setTok(""); LIST = []; return login("密碼不對，再試一次"); }
    render(await r.json());
  } catch(e) {
    const m = document.querySelector(".meta"); if (m) m.innerHTML = `<span class="live off"></span>連線中斷，重試中…`;
  }
  timer = setTimeout(tick, (PREF.refresh || 5) * 1000);
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
