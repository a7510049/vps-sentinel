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
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.0"

# ───────────────────────── 設定 ─────────────────────────

def load_config():
    path = os.environ.get("SENTINEL_CONF", "/etc/vps-sentinel-lite.conf")
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
            if tick % 900 == 0:       # 每 30 分鐘：系統更新
                u = apt_updates()
                with self.lock:
                    self.updates = u
            tick += 1

    def snapshot(self):
        with self.lock:
            cpu, net = self.cpu_pct, dict(self.net)
            containers, services, updates = self.containers, list(self.services), self.updates
            high_since = self.cpu_high_since
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
            "name": NAME, "online": True, "version": VERSION, "time": time.time(),
            "os": os_name(), "kernel": os.uname().release,
            "uptime": float(read("/proc/uptime", "0").split()[0] or 0),
            "cores": os.cpu_count() or 1, "cpu": cpu, "load": [round(x, 2) for x in load],
            "mem": mem, "disks": disks, "net": net,
            "containers": containers, "services": services,
            "updates": updates, "reboot": reboot,
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
        data["name"] = p["name"] or data.get("name")
        return data
    except Exception as e:  # noqa: BLE001
        return {"name": p["name"], "online": False, "level": "bad",
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
.ok{background:var(--ok)}.warn{background:var(--warn)}.bad{background:var(--bad)}
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
function card(s){
  const lv = s.level || (s.online ? "ok" : "bad");
  let h = `<div class="card ${lv==="ok"?"":lv}"><div class="top"><span class="dot ${lv}"></span><h2>${esc(s.name)}</h2>`;
  if (!s.online) return h + `</div><div class="offline">⚠️ 連不上這台主機<br><span class="sub">${esc(s.error||"")}</span></div></div>`;
  h += `<span class="sub">開機 ${up(s.uptime)}</span></div><div class="sub">${esc(s.os)}</div>`;
  const al = (s.problems||[]).map(p=>`<div class="alert bad">${esc(p)}</div>`).concat((s.notices||[]).map(p=>`<div class="alert warn">${esc(p)}</div>`));
  if (al.length) h += `<div class="alerts">${al.join("")}</div>`;
  h += `<div class="bars">` + bar("處理器", s.cpu, `${s.cores} 核`) +
       bar("記憶體", s.mem.pct, `${size(s.mem.used)} / ${size(s.mem.total)}`) +
       s.disks.map(d=>bar("磁碟 "+(d.path==="/"?"":d.path), d.pct, `${size(d.used)} / ${size(d.total)}`)).join("") + `</div>`;
  h += `<div class="stats"><div class="stat"><div class="k">負載</div><div class="v">${s.load[0]}</div></div>
        <div class="stat"><div class="k">下載</div><div class="v">${rate(s.net.rx)}</div></div>
        <div class="stat"><div class="k">上傳</div><div class="v">${rate(s.net.tx)}</div></div></div>`;
  const items = [];
  (s.containers||[]).forEach(c=>items.push({n:c.name, ok:c.state==="running"&&!/unhealthy/.test(c.status), s:STATE[c.state]||c.state, t:"容器"}));
  (s.services||[]).forEach(v=>items.push({n:v.name, ok:v.state==="active", s:STATE[v.state]||v.state, t:"服務"}));
  if (items.length){
    const bad = items.filter(i=>!i.ok).length, id = s.name;
    h += `<details data-id="${esc(id)}" ${open[id]?"open":""}><summary><span>容器與服務：${items.length-bad} 正常${bad?`，<b style="color:var(--bad);font-weight:600">${bad} 異常</b>`:""}</span></summary><div class="list">` +
      items.map(i=>`<div class="item"><span class="dot ${i.ok?"ok":"bad"}"></span><span class="n">${esc(i.n)}</span><span class="s">${i.t}・${esc(i.s)}</span></div>`).join("") + `</div></details>`;
  }
  if (s.updates) h += `<div class="sub" style="margin-top:10px">可更新套件 ${s.updates.total} 個（安全更新 ${s.updates.security} 個）・核心 ${esc(s.kernel)}</div>`;
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
