"""擋廣告 DNS（AdGuard Home）：打開時跑設定精靈、只開加密 DNS、讀統計、iPhone 描述檔、關掉。
用假的 AdGuard Home（SENTINEL_AB_API）和 SENTINEL_AB_FAKE（不真的下載、不動 systemd／防火牆／Caddy）。只用 Python 內建模組。"""
import base64
import json
import os
import plistlib
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from test_smoke import TOKEN, Server

GOT = {"configure": None, "tls": None, "auth": [], "dns": None, "login": 0, "filters": [], "rules": []}


class FakeAGH(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def authed(self):
        c = GOT["configure"]
        want = "Basic " + base64.b64encode(f"{c['username']}:{c['password']}".encode()).decode() if c else None
        return want and self.headers.get("Authorization") == want

    def do_GET(self):
        if self.path == "/china.conf":
            b = "".join(f"server=/{d}/114.114.114.114\n" for d in ("example.cn", "bad..x", "foo-china.com")).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            return self.wfile.write(b)
        if self.path == "/control/install/get_addresses":
            return self.reply(200, {"web_port": 3000, "dns_port": 53, "interfaces": {}})
        if not self.authed():
            return self.reply(401, {})
        if self.path == "/control/status":
            return self.reply(200, {"running": True, "version": "v0.107.99"})
        if self.path == "/control/filtering/status":
            return self.reply(200, {"filters": [{"url": u} for u in GOT["filters"]], "user_rules": GOT["rules"]})
        if self.path == "/control/proxied?x=1":
            return self.reply(200, {"cookie": self.headers.get("Cookie") or ""})
        if self.path == "/control/stats":
            return self.reply(200, {"num_dns_queries": 2000, "num_blocked_filtering": 500, "avg_processing_time": 0.012,
                                    "top_blocked_domains": [{"ads.example.com": 300}, {"track.example.net": 100}],
                                    "blocked_filtering": [1, 2, 3]})
        if self.path.startswith("/control/querylog?"):
            return self.reply(200, {"data": [{"question": {"name": "ads.example.com"}, "time": "2026-11-21T08:00:05.123456789+08:00"},
                                             {"question": {"name": "ads.example.com"}, "time": "2026-11-21T07:59:00Z"},
                                             {"question": {"name": "pix.example.org"}, "time": "2026-11-21T07:58:00Z"}]})
        self.reply(404, {})

    def body(self):
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")

    def do_POST(self):
        d = self.body()
        if self.path == "/control/install/configure":
            GOT["configure"] = d
            return self.reply(200, {})
        if self.path == "/control/login":
            GOT["login"] += 1
            self.send_response(200)
            self.send_header("Set-Cookie", "agh_session=abc; Path=/; HttpOnly")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        if not self.authed():
            return self.reply(401, {})
        if self.path == "/control/dns_config":
            GOT["dns"] = d
            with open(d["upstream_dns_file"], encoding="utf-8") as f:
                GOT["upfile"] = f.read()
            return self.reply(200, {})
        if self.path == "/control/filtering/add_url":
            GOT["filters"].append(d["url"])
            return self.reply(200, {})
        if self.path == "/control/filtering/set_rules":
            GOT["rules"] = d["rules"]
            return self.reply(200, {})
        if self.path == "/control/tls/configure":
            GOT["tls"] = d
            return self.reply(200, {})
        self.reply(200, {})

    def do_PUT(self):
        self.body()
        self.reply(200 if self.authed() else 401, {})


class NoRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


class Adblock(Server):
    @classmethod
    def setUpClass(cls):
        cls.fake = ThreadingHTTPServer(("127.0.0.1", 0), FakeAGH)
        threading.Thread(target=cls.fake.serve_forever, daemon=True).start()
        cls.certs = tempfile.TemporaryDirectory()
        d = os.path.join(cls.certs.name, "acme", "dns.example.test")
        os.makedirs(d)
        for x in ("crt", "key"):
            with open(os.path.join(d, f"dns.example.test.{x}"), "w") as f:
                f.write("x")
        cls.abdir = tempfile.TemporaryDirectory()
        cls.EXTRA = "DOMAIN=dns.example.test\nHTTPS_PORT=9443\n"
        cls.ENV = {"SENTINEL_AB_FAKE": "1", "SENTINEL_AB_API": f"http://127.0.0.1:{cls.fake.server_port}",
                   "SENTINEL_AB_CERTS": cls.certs.name, "SENTINEL_AB_DIR": cls.abdir.name, "SENTINEL_AB_EVERY": "1",
                   "SENTINEL_AB_CNLIST": f"http://127.0.0.1:{cls.fake.server_port}/china.conf", "NO_PROXY": "127.0.0.1", "no_proxy": "127.0.0.1"}
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.fake.shutdown()
        cls.certs.cleanup()
        cls.abdir.cleanup()

    def call(self, path, body):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=json.dumps(body).encode(),
                                     headers={"X-Token": TOKEN, "Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_flow(self):
        c, d = self.call("/api/adblock", {})
        self.assertEqual(c, 200)
        self.assertFalse(d["on"])
        self.assertTrue(d["cert"])
        self.assertEqual(d["doh"], "https://dns.example.test:9443/dns-query")
        self.assertEqual(d["dot"], "dns.example.test")
        c, d = self.call("/api/adblock", {"action": "on"})
        self.assertEqual(c, 200, d)
        for _ in range(100):
            c, d = self.call("/api/adblock", {})
            if not d["job"]:
                break
            time.sleep(0.1)
        self.assertTrue(d["on"], d)
        self.assertEqual(d["err"], "")
        cf = GOT["configure"]
        self.assertEqual(cf["web"], {"ip": "127.0.0.1", "port": 3053})       # 管理網頁只給本機
        self.assertGreaterEqual(len(cf["password"]), 24)
        t = GOT["tls"]
        self.assertFalse(t["serve_plain_dns"])                                 # 不開一般 DNS（不會變成公開 DNS）
        self.assertEqual((t["port_dns_over_tls"], t["port_https"], t["server_name"]), (853, 0, "dns.example.test"))
        self.assertTrue(t["certificate_path"].endswith("dns.example.test.crt"))
        with open(os.path.join(self.tmp.name, "data", "adblock.json"), "rb") as f:
            self.assertNotIn(cf["password"].encode(), f.read())               # 密碼加密存
        for _ in range(50):
            c, d = self.call("/api/adblock", {})
            if d.get("stats"):
                break
            time.sleep(0.1)
        self.assertEqual(d["stats"]["pct"], 25)
        self.assertEqual(d["stats"]["top"][0], ["ads.example.com", 300])
        self.assertEqual(d["stats"]["recent"], [["ads.example.com", 1795219205], ["pix.example.org", 1795247880]])   # 最近擋的，同一個只留最新
        with urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{self.port}/api/status", headers={"X-Token": TOKEN}), timeout=15) as r:
            st = json.loads(r.read())
        self.assertEqual(st["adblock"]["on"], True)

        # iPhone 描述檔：只給自己（或配對的主機）的網址，一次性
        c, x = self.call("/api/adblock-profile", {"url": "https://evil.example/dns-query"})
        self.assertEqual(c, 400)
        c, x = self.call("/api/adblock-profile", {"url": d["doh"], "name": "測試"})
        self.assertEqual(c, 200, x)
        u = f"http://127.0.0.1:{self.port}/dns.mobileconfig?k={x['k']}"
        with urllib.request.urlopen(u, timeout=15) as r:
            self.assertEqual(r.headers["Content-Type"], "application/x-apple-aspen-config")
            p = plistlib.loads(r.read())
        self.assertEqual(p["PayloadContent"][0]["DNSSettings"], {"DNSProtocol": "TLS", "ServerName": "dns.example.test"})
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(u, timeout=15)

        # 大陸連進來拿當地的位址：查詢交給國際 DNS，帶上手機的網段
        self.assertEqual(GOT["dns"]["edns_cs_enabled"], True)
        self.assertTrue(GOT["dns"]["cache_optimistic"])                       # 快取過期先給舊答案
        self.assertTrue(GOT["dns"]["enable_dnssec"])
        up = GOT["upfile"].splitlines()
        self.assertIn("https://dns.google/dns-query", up)
        cn = [u for u in up if "alidns" in u or "doh.pub" in u or "360.cn" in u]
        self.assertTrue(cn and all(u.startswith("[/") and "/qq.com/" in u for u in cn))   # 大陸 DNS 只給大陸網站
        self.assertTrue(all("/example.cn/" in u and "/foo-china.com/" in u and "bad..x" not in u for u in cn))   # 下載的完整清單也加進去
        self.assertIn("https://adguardteam.github.io/HostlistsRegistry/assets/filter_21.txt", GOT["filters"])   # 中文廣告清單
        self.assertIn("https://adguardteam.github.io/HostlistsRegistry/assets/filter_44.txt", GOT["filters"])   # 威脅情報

        # 擋錯了一鍵放行、恢復擋
        c, x = self.call("/api/adblock", {"action": "allow", "domain": "ads.example.com"})
        self.assertEqual(c, 200, x)
        self.assertEqual(x["allow"], ["ads.example.com"])
        self.assertIn("@@||ads.example.com^$important", GOT["rules"])
        c, x = self.call("/api/adblock", {"action": "allow", "domain": "bad domain^x"})
        self.assertEqual(c, 400)
        c, x = self.call("/api/adblock", {"action": "unallow", "domain": "ads.example.com"})
        self.assertEqual((c, x["allow"], GOT["rules"]), (200, [], []))

        # 管理頁：沒通行證進不去；驗證過拿登入票換通行證，哨兵自己帶 AdGuard Home 的帳號轉過去
        base = f"http://127.0.0.1:{self.port}"
        no = urllib.request.build_opener(NoRedir)
        with self.assertRaises(urllib.error.HTTPError) as e:
            no.open(base + "/adguard/control/proxied?x=1", timeout=15)
        self.assertEqual(e.exception.code, 401)
        c, x = self.call("/api/adguard-open", {"pw": "wrong"})
        self.assertEqual(c, 401)
        c, x = self.call("/api/adguard-open", {"pw": TOKEN})
        self.assertEqual(c, 200, x)
        self.assertTrue(x["login"].endswith("/adguard-sso"))
        sso = urllib.request.Request(base + "/adguard-sso", data=f"t={x['ticket']}".encode(), method="POST")
        with self.assertRaises(urllib.error.HTTPError) as e:
            no.open(sso, timeout=15)
        self.assertEqual(e.exception.code, 303)
        ck = e.exception.headers["Set-Cookie"].split(";")[0]
        self.assertTrue(ck.startswith("vs_agh="))
        with self.assertRaises(urllib.error.HTTPError) as e:      # 同一張票不能用第二次
            no.open(urllib.request.Request(base + "/adguard-sso", data=f"t={x['ticket']}".encode(), method="POST"), timeout=15)
        self.assertIsNone(e.exception.headers["Set-Cookie"])
        with no.open(urllib.request.Request(base + "/adguard/control/proxied?x=1", headers={"Cookie": ck}), timeout=15) as r:
            self.assertEqual(json.loads(r.read())["cookie"], "agh_session=abc")
        self.assertGreaterEqual(GOT["login"], 1)

        # 別台請這台從外面試連 853：網域不對不幫忙；連不上要回原因
        c, x = self.call("/api/ab-probe", {"host": "bad host"})
        self.assertEqual(c, 400)
        c, x = self.call("/api/ab-probe", {"host": "localhost.localdomain"})
        self.assertEqual(c, 200, x)
        self.assertTrue(x["err"])

        c, d = self.call("/api/adblock", {"action": "off"})
        self.assertEqual(c, 200)
        self.assertFalse(d["on"])


class Pick(unittest.TestCase):
    """下載的壓縮檔：路徑前面有沒有「./」都要找得到程式"""
    def test_pick(self):
        import io
        import tarfile
        from test_passkey import load_sentinel
        S = load_sentinel()
        for name in ("AdGuardHome/AdGuardHome", "./AdGuardHome/AdGuardHome"):
            b = io.BytesIO()
            with tarfile.open(fileobj=b, mode="w:gz") as t:
                for n, data in ((name.replace("AdGuardHome/AdGuardHome", "AdGuardHome/README.md"), b"r"), (name, b"bin")):
                    ti = tarfile.TarInfo(n)
                    ti.size = len(data)
                    t.addfile(ti, io.BytesIO(data))
            b.seek(0)
            with tarfile.open(fileobj=b) as t:
                m = S.ab_pick(t)
                self.assertEqual(t.extractfile(m).read(), b"bin")


if __name__ == "__main__":
    unittest.main()
