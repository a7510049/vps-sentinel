"""冒煙測試：用測試設定把哨兵跑起來，確認網頁和主要 API 都有正常回應。

只用 Python 內建模組。執行方式：python3 -m unittest discover -s tests -v
"""
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

from seal_util import conf_get

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = "test-token-123"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Server(unittest.TestCase):
    """每個測試類別各自跑一個哨兵（用暫存資料夾，不會動到正式設定）"""
    STATE = None                                   # 啟動前先放好的存檔內容
    EXTRA = ""                                     # 額外的設定（每行一個）
    ENV = {}                                       # 額外的環境變數

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.port = free_port()
        cls.conf = conf = os.path.join(cls.tmp.name, "test.conf")
        data = os.path.join(cls.tmp.name, "data")
        with open(conf, "w", encoding="utf-8") as f:
            f.write(f"BIND=127.0.0.1\nPORT={cls.port}\nTOKEN={TOKEN}\nNAME=測試主機\nDATA_DIR={data}\n{cls.EXTRA}")
        if cls.STATE is not None:
            os.makedirs(data)
            with open(os.path.join(data, "state.json"), "w", encoding="utf-8") as f:
                json.dump(cls.STATE, f)
        env = {k: v for k, v in os.environ.items() if not k.startswith("SENTINEL_")}
        env["SENTINEL_CONF"] = conf
        env.update(cls.ENV)
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
        self.assertNotIn("/*@fly.js*/", html)
        self.assertNotIn("/*@flyv*/", html)
        # 機場起降的 fly.js 不放在首頁，另外下載（網址帶版本）
        with open(os.path.join(ROOT, "web", "fly.js"), encoding="utf-8") as f:
            fly = f.read()
        self.assertNotIn(fly.splitlines()[1], html)
        v = re.search(r'const FLYV = "([0-9a-f]{12})"', html).group(1)
        code, headers, body = self.request("/fly.js?v=" + v)
        self.assertEqual(code, 200)
        self.assertIn("javascript", headers["Content-Type"])
        self.assertEqual(body.decode("utf-8"), fly)
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/fly.js?v={v}", headers={"If-None-Match": headers["ETag"]})
        with self.assertRaises(urllib.error.HTTPError) as e:   # 沒改：瀏覽器用存的那份
            urllib.request.urlopen(req, timeout=15)
        self.assertEqual(e.exception.code, 304)
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
        code, headers, body = self.request("/font.woff2")      # 英數字型：主機自己給，不用等 Google
        self.assertEqual(code, 200)
        self.assertEqual(headers["Content-Type"], "font/woff2")
        self.assertTrue(body.startswith(b"wOF2"))
        self.assertIn("max-age=2592000", headers["Cache-Control"])
        for bad in ("/flag/JP.png", "/flag/jpn.png", "/flag/../x.png"):   # 國旗只認兩個小寫字母
            with self.subTest(path=bad):
                self.assertEqual(self.request(bad)[0], 404)

    def test_api_needs_token(self):
        for path in ("/api/status", "/api/all", "/api/history"):
            with self.subTest(path=path):
                code, _, _ = self.request(path)
                self.assertEqual(code, 401)
                code, _, _ = self.request(path, token="wrong")
                self.assertEqual(code, 401)
        code, _, _ = self.request("/api/rename", method="POST", data=b'{"name":"x"}')
        self.assertEqual(code, 401)

    def test_api_opensky(self):
        """設定 → OpenSky 帳號：網頁要問得到（不能被當成不存在的網址）"""
        code, _, _ = self.request("/api/opensky", method="POST", data=b'{"action":"status"}')
        self.assertEqual(code, 401)
        code, _, body = self.request("/api/opensky", token=TOKEN, method="POST", data=b'{"action":"status"}')
        self.assertEqual(code, 200, body)
        self.assertFalse(json.loads(body)["on"])

    def test_fly_logo(self):
        """標誌圖：主機存好的直接給（不用登入、官網的圖不能跑程式），清單外的不給"""
        d = os.path.join(self.tmp.name, "data", "fly-logos")
        os.makedirs(d, exist_ok=True)
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
        with open(os.path.join(d, "BR"), "wb") as f:
            f.write(png)
        code, headers, body = self.request("/api/fly-logo?k=BR")
        self.assertEqual(code, 200)
        self.assertEqual(body, png)
        self.assertEqual(headers["Content-Type"], "image/png")
        self.assertIn("sandbox", headers["Content-Security-Policy"])
        with open(os.path.join(d, "flag-JP"), "wb") as f:   # 國旗：@國家代碼
            f.write(png)
        self.assertEqual(self.request("/api/fly-logo?k=%40JP")[:3:2], (200, png))
        for k in ("ZZ", "..%2Fstate", "", "%40ZZ", "%40J"):
            with self.subTest(k=k):
                self.assertEqual(self.request("/api/fly-logo?k=" + k)[0], 404)

    def test_api_status(self):
        code, headers, body = self.request("/api/status", token=TOKEN)
        self.assertEqual(code, 200)
        self.assertIn("application/json", headers["Content-Type"])
        self.assertIsInstance(json.loads(body), dict)

    def test_api_all(self):
        code, _, body = self.request("/api/all", token=TOKEN)
        self.assertEqual(code, 200)
        self.assertIsInstance(json.loads(body), (dict, list))

    def test_api_all_panel_data(self):
        """電腦總覽要用的：30 天上線紀錄、磁碟讀寫／負載／連線的曲線、處理器型號、吃資源的程式"""
        me = json.loads(self.request("/api/all", token=TOKEN)[2])[0]
        self.assertEqual(len(me["up30"]), 30)
        for k in ("t", "cpu", "mem", "rx", "tx", "rd", "wr", "ld", "cn"):
            self.assertIn(k, me["hist"])
        self.assertIsInstance(me["top"], list)
        self.assertIsInstance(me["cpum"], str)
        h = json.loads(self.request("/api/history?range=24h", token=TOKEN)[2])
        self.assertIn("rd", h)

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


class OldHistoryTest(Server):
    """舊版存的圖表少了磁碟讀寫、負載、連線：讀進來補 0，畫面照常"""
    STATE = {"v": 1, "boot": "x", "events": [], "hist": [[int(time.time()) - 60, 5.0, 20.0, 100, 200]],
             "h24": [[int(time.time()) - 600, 5.0, 20.0, 100, 200]]}

    def test_padded(self):
        h = json.loads(self.request("/api/history?range=24h", token=TOKEN)[2])
        self.assertEqual(h["rd"][0], 0)
        self.assertEqual(h["cpu"][0], 5.0)


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
        self.assertEqual(conf_get(self.conf, "TOKEN"), new)
        with open(self.conf, encoding="utf-8") as f:
            self.assertNotIn(new, f.read())                                  # 設定檔裡是加密過的                       # 重新啟動後也是新密碼


if __name__ == "__main__":
    unittest.main()


class FlagTest(Server):
    """國旗由主機抓一次存起來（測試用本機檔案代替 flagcdn）"""
    @classmethod
    def setUpClass(cls):
        cls.src = tempfile.TemporaryDirectory()
        with open(os.path.join(cls.src.name, "jp.png"), "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\nfake")
        cls.ENV = {"SENTINEL_FLAG_URL": "file://" + cls.src.name + "/{cc}.png"}
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.src.cleanup()

    def test_flag(self):
        code, headers, body = self.request("/flag/jp.png")
        self.assertEqual(code, 200)
        self.assertEqual(headers["Content-Type"], "image/png")
        self.assertTrue(body.startswith(b"\x89PNG"))
        os.remove(os.path.join(self.src.name, "jp.png"))     # 來源不見了：照樣給存著的那份
        self.assertEqual(self.request("/flag/jp.png")[0], 200)
        self.assertEqual(self.request("/flag/xx.png")[0], 404)
