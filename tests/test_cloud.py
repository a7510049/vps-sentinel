"""雲端硬碟轉接的測試：沒登入要先去哨兵、簽章連結發通行證、通行證會過期、外面偽造的「主人」標頭會被丟掉。只用 Python 內建模組。"""
import hashlib
import hmac
import http.client
import http.server
import json
import threading
import time
import unittest

from test_smoke import TOKEN, Server, free_port


def sign(msg):
    return hmac.new(TOKEN.encode(), msg.encode(), hashlib.sha256).hexdigest()


class FakeCloud(http.server.BaseHTTPRequestHandler):
    """假的雲端硬碟：把收到的「主人」標頭原樣回報"""
    def do_GET(self):
        body = json.dumps({"user": self.headers.get("X-Sentinel-User"), "path": self.path}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


class CloudTest(Server):
    @classmethod
    def setUpClass(cls):
        cls.cloud = http.server.ThreadingHTTPServer(("127.0.0.1", free_port()), FakeCloud)
        threading.Thread(target=cls.cloud.serve_forever, daemon=True).start()
        cls.EXTRA = f"CLOUD_URL=http://127.0.0.1/cloud/\nCLOUD_PORT={cls.cloud.server_address[1]}\n"
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.cloud.shutdown()

    def get(self, path, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        c.request("GET", path, headers=headers or {})
        r = c.getresponse()
        body = r.read()
        c.close()
        return r, body

    def user(self, cookie=None, extra=None):
        h = {"Accept": "application/json", **(extra or {})}
        if cookie:
            h["Cookie"] = f"vs_cloud={cookie}"
        r, body = self.get("/cloud/api/x", h)
        self.assertEqual(r.status, 200)
        return json.loads(body)["user"]

    def test_need_login_first(self):
        r, _ = self.get("/cloud/", {"Accept": "text/html"})
        self.assertEqual(r.status, 302)
        self.assertEqual(r.getheader("Location"), "/?go=cloud")

    def test_forged_header_dropped(self):
        self.assertIsNone(self.user(extra={"X-Sentinel-User": "owner"}))

    def test_sso_and_cookie(self):
        exp = int(time.time()) + 600
        r, _ = self.get(f"/cloud-sso?e={exp}&s={sign(f'cloud-sso:{exp}')}")
        self.assertEqual(r.status, 302)
        self.assertEqual(r.getheader("Location"), "/cloud/")
        cookie = r.getheader("Set-Cookie").split(";")[0].split("=", 1)[1]
        self.assertEqual(self.user(cookie), "owner")
        # 簽章不對、過期的連結：不發通行證，回哨兵登入
        r, _ = self.get(f"/cloud-sso?e={exp}&s=bad")
        self.assertIsNone(r.getheader("Set-Cookie"))
        old = int(time.time()) - 10
        r, _ = self.get(f"/cloud-sso?e={old}&s={sign(f'cloud-sso:{old}')}")
        self.assertIsNone(r.getheader("Set-Cookie"))

    def test_cookie_expires(self):
        old = int(time.time()) - 10
        self.assertIsNone(self.user(f"{old}.{sign(f'cloud-cookie:v2:{old}')}"))      # 過期的通行證
        exp = int(time.time()) + 600
        self.assertIsNone(self.user(f"{exp}.{sign(f'cloud-cookie:v2:{exp - 1}')}"))  # 改了到期時間
        self.assertIsNone(self.user(sign("cloud-cookie:v1")))                         # 舊版永久有效的通行證
        self.assertEqual(self.user(f"{exp}.{sign(f'cloud-cookie:v2:{exp}')}"), "owner")


if __name__ == "__main__":
    unittest.main()
