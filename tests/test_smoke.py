"""冒煙測試：用測試設定把哨兵跑起來，確認網頁和主要 API 都有正常回應。

只用 Python 內建模組。執行方式：python3 -m unittest discover -s tests -v
"""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = "test-token-123"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Server(unittest.TestCase):
    """每個測試類別各自跑一個哨兵（用暫存資料夾，不會動到正式設定）"""
    STATE = None                                   # 啟動前先放好的存檔內容

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.port = free_port()
        cls.conf = conf = os.path.join(cls.tmp.name, "test.conf")
        data = os.path.join(cls.tmp.name, "data")
        with open(conf, "w", encoding="utf-8") as f:
            f.write(f"BIND=127.0.0.1\nPORT={cls.port}\nTOKEN={TOKEN}\nNAME=測試主機\nDATA_DIR={data}\n")
        if cls.STATE is not None:
            os.makedirs(data)
            with open(os.path.join(data, "state.json"), "w", encoding="utf-8") as f:
                json.dump(cls.STATE, f)
        env = {k: v for k, v in os.environ.items() if not k.startswith("SENTINEL_")}
        env["SENTINEL_CONF"] = conf
        cls.log = open(os.path.join(cls.tmp.name, "server.log"), "w+", encoding="utf-8")
        cls.proc = subprocess.Popen([sys.executable, os.path.join(ROOT, "sentinel.py")], cwd=cls.tmp.name,
                                    env=env, stdout=cls.log, stderr=subprocess.STDOUT)
        deadline = time.time() + 20
        while time.time() < deadline:
            if cls.proc.poll() is not None:
                cls.tearDownClass()
                raise RuntimeError("哨兵啟動失敗")
            try:
                with socket.create_connection(("127.0.0.1", cls.port), timeout=0.5):
                    return
            except OSError:
                time.sleep(0.2)
        cls.tearDownClass()
        raise RuntimeError("哨兵 20 秒內沒有開始服務")

    @classmethod
    def tearDownClass(cls):
        if cls.proc.poll() is None:
            cls.proc.terminate()
            try:
                cls.proc.wait(10)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
                cls.proc.wait()
        cls.log.seek(0)
        out = cls.log.read()
        if out.strip():
            print("\n── 哨兵輸出 ──\n" + out, file=sys.stderr)
        cls.log.close()
        cls.tmp.cleanup()

    def request(self, path, token=None, method="GET", data=None):
        headers = {"X-Token": token} if token else {}
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()


class SmokeTest(Server):
    def test_page(self):
        code, headers, body = self.request("/")
        self.assertEqual(code, 200)
        self.assertIn("text/html", headers["Content-Type"])
        html = body.decode("utf-8")
        self.assertIn("<html", html.lower())
        # 樣式和畫面程式要已經塞進網頁裡，不能留下記號
        self.assertNotIn("/*@style.css*/", html)
        self.assertNotIn("/*@app.js*/", html)
        with open(os.path.join(ROOT, "web", "app.js"), encoding="utf-8") as f:
            first_line = next(line for line in f if line.strip())
        self.assertIn(first_line.strip(), html)
        # 不讓別的網站把哨兵嵌進去
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])

    def test_static_files(self):
        for path, ctype in [("/manifest.webmanifest", "application/manifest+json"),
                            ("/icon.svg", "image/svg+xml"),
                            ("/favicon.ico", "image/svg+xml"),
                            ("/apple-touch-icon.png", "image/png"),
                            ("/icon-512.png", "image/png")]:
            with self.subTest(path=path):
                code, headers, body = self.request(path)
                self.assertEqual(code, 200)
                self.assertEqual(headers["Content-Type"], ctype)
                self.assertTrue(body)
        _, _, body = self.request("/manifest.webmanifest")
        json.loads(body)
        _, _, body = self.request("/icon-512.png")
        self.assertTrue(body.startswith(b"\x89PNG"))

    def test_api_needs_token(self):
        for path in ("/api/status", "/api/all", "/api/history"):
            with self.subTest(path=path):
                code, _, _ = self.request(path)
                self.assertEqual(code, 401)
                code, _, _ = self.request(path, token="wrong")
                self.assertEqual(code, 401)
        code, _, _ = self.request("/api/rename", method="POST", data=b'{"name":"x"}')
        self.assertEqual(code, 401)

    def test_api_status(self):
        code, headers, body = self.request("/api/status", token=TOKEN)
        self.assertEqual(code, 200)
        self.assertIn("application/json", headers["Content-Type"])
        self.assertIsInstance(json.loads(body), dict)

    def test_api_all(self):
        code, _, body = self.request("/api/all", token=TOKEN)
        self.assertEqual(code, 200)
        self.assertIsInstance(json.loads(body), (dict, list))

    def test_api_history(self):
        for rng in ("1h", "24h", "7d"):
            with self.subTest(range=rng):
                code, _, body = self.request(f"/api/history?range={rng}", token=TOKEN)
                self.assertEqual(code, 200)
                json.loads(body)

    def test_not_found(self):
        code, _, _ = self.request("/no-such-page")
        self.assertEqual(code, 404)
        code, _, _ = self.request("/api/no-such-api", token=TOKEN, method="POST", data=b"{}")
        self.assertEqual(code, 404)
        code, _, _ = self.request("/api/history?node=no-such-host", token=TOKEN)
        self.assertEqual(code, 404)


class RebootAndTokenTest(Server):
    STATE = {"v": 1, "boot": "上一次開機", "events": []}
    tok = TOKEN                                    # 換密碼的測試跑過後，其他測試要用新密碼

    def test_reboot_event(self):
        _, _, body = self.request("/api/status", token=type(self).tok)
        self.assertIn("主機重新開機了", [e["text"] for e in json.loads(body)["events"]])

    def test_change_token(self):
        code, headers, body = self.request("/api/token", token=TOKEN, method="POST", data=b"")
        self.assertEqual(code, 200)
        new = json.loads(body)["token"]
        self.assertTrue(new and new != TOKEN)
        self.assertEqual(self.request("/api/status", token=TOKEN)[0], 401)   # 舊密碼不能用了
        self.assertEqual(self.request("/api/status", token=new)[0], 200)
        type(self).tok = new
        with open(self.conf, encoding="utf-8") as f:
            self.assertIn(f"TOKEN={new}\n", f.read())                       # 重新啟動後也是新密碼


if __name__ == "__main__":
    unittest.main()
