"""自動測試用的假主機：回答 App 會問的 API，數字每次都會變一點"""
import json
import math
import random
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

T0 = time.time()
TOKEN = "demo"


def wav(base, amp, t, sp=60):
    return max(0.0, min(100.0, base + amp * math.sin(t / sp) + random.uniform(-amp / 3, amp / 3)))


def hist(base, n=180, step=10):
    now = time.time()
    return {"t": [int(now - (n - i) * step) for i in range(n)],
            "cpu": [round(wav(base, 12, i * 7), 1) for i in range(n)],
            "mem": [round(wav(base + 30, 4, i * 3, 90), 1) for i in range(n)],
            "rx": [abs(30000 + 25000 * math.sin(i / 9)) for i in range(n)],
            "tx": [abs(12000 + 9000 * math.cos(i / 7)) for i in range(n)]}


def host(name, node, cc, city, org, cpu, mem, disk, level, problems, notices, extra=None):
    t = time.time()
    h = {
        "name": name, "node": node, "online": True, "version": "3.0", "time": t, "links": [],
        "os": "Ubuntu 24.04 LTS", "kernel": "6.8.0", "uptime": 86400 * 12 + (t - T0), "cores": 4,
        "cpu": round(wav(cpu, 10, t, 8), 1), "load": [round(cpu / 40, 2), 0.5, 0.4],
        "ipv6": {"addr": "2001:db8::1", "ok": True} if cc == "JP" else None,
        "conns": random.randint(80, 140), "conns_avg": 100, "procs": 180,
        "mem": {"total": 24 * 2**30, "used": int(24 * 2**30 * mem / 100), "pct": round(wav(mem, 2, t, 20), 1), "swap_total": 0, "swap_used": 0, "swap_pct": 0},
        "disks": [{"path": "/", "total": 200 * 2**30, "used": int(200 * 2**30 * disk / 100), "pct": disk}],
        "net": {"rx": random.uniform(20000, 90000), "tx": random.uniform(5000, 40000)},
        "containers": [
            {"name": "n8n", "state": "running", "status": "Up 3 days", "image": "n8n", "project": ""},
            {"name": "filebrowser", "state": "running", "status": "Up 3 days", "image": "fb", "project": ""},
        ],
        "services": [{"name": "caddy", "state": "active"}, {"name": "x-ui", "state": "active"}],
        "geo": {"cc": cc, "city": city, "ip": "203.0.113.5", "org": org},
        "events": [
            {"t": int(t - 600), "kind": "ok", "text": "已恢復：處理器持續偏高"},
            {"t": int(t - 900), "kind": "bad", "text": "處理器持續偏高 93%"},
            {"t": int(t - 86400 - 300), "kind": "info", "text": "每日備份完成"},
        ],
        "traffic": {"rx": 0, "tx": 0, "used": 412 * 2**30, "limit": 1024 * 2**30, "pct": 40.2, "projected": 850 * 2**30,
                    "reset_day": 1, "days_left": 13, "cycle_days": 31},
        "hist": hist(cpu, 60, 5), "problems": problems, "notices": notices, "level": level,
    }
    h.update(extra or {})
    return h


def all_hosts():
    return [
        host("Oracle Cloud", "", "JP", "Osaka", "Oracle Corporation", 22, 46, 38, "ok", [], []),
        host("Microsoft Azure", "azure", "HK", "Hong Kong", "Microsoft", 64, 81, 77, "warn", [], ["需要重新開機"]),
        {"name": "Google Cloud", "node": "gcp", "online": False, "level": "bad", "problems": ["連不上"],
         "error": "等太久沒有回應：請確認對方開著", "last_seen": time.time() - 1800},
    ]


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def out(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def authed(self):
        return self.headers.get("X-Token") == TOKEN

    def do_GET(self):
        p = self.path.split("?")[0]
        if not self.authed():
            time.sleep(0.5)
            return self.out(401, {"error": "密碼錯誤"})
        if p == "/api/all":
            return self.out(200, all_hosts())
        if p == "/api/status":
            return self.out(200, all_hosts()[0])
        if p == "/api/history":
            time.sleep(0.8)
            return self.out(200, hist(40, 288, 300))
        self.out(404, {"error": "找不到"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        d = json.loads(self.rfile.read(n) or b"{}")
        if self.path == "/api/passkey-login":
            return self.out(200, {"has": False, "pin": True})
        if self.path == "/api/pin-login":
            if d.get("pin") == "1234":
                return self.out(200, {"ok": True, "token": TOKEN})
            time.sleep(0.5)
            return self.out(401, {"ok": False, "message": "PIN 碼不對"})
        self.out(404, {"error": "找不到"})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
