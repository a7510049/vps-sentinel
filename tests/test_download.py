"""遠端下載的測試：下載到資料夾、檔名、同名加編號、接續下載、空間不夠、取消，以及不能下載本機或內部網路的東西。
用一個本機的假檔案伺服器，不連外面的網路。"""
import http.server
import os
import tempfile
import threading
import time
import unittest

DATA = os.urandom(300_000)


class Files(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/go"):
            self.send_response(302)
            self.send_header("Location", "/file.bin")
            return self.end_headers()
        if self.path.startswith("/slow"):
            self.send_response(200)
            self.send_header("Content-Length", str(len(DATA) * 50))
            self.end_headers()
            try:
                for _ in range(500):
                    self.wfile.write(DATA[:30000])
                    time.sleep(.05)
            except OSError:
                pass
            return
        if self.path.startswith("/missing"):
            self.send_response(404)
            self.send_header("Content-Length", "0")
            return self.end_headers()
        start = 0
        rg = self.headers.get("Range")
        if rg and self.path.startswith("/file.bin"):
            start = int(rg.split("=")[1].rstrip("-"))
        body = DATA[start:]
        self.send_response(206 if start else 200)
        self.send_header("Content-Length", str(len(body)))
        if self.path.startswith("/named"):
            self.send_header("Content-Disposition", "attachment; filename=\"x.bin\"; filename*=UTF-8''%E4%B8%AD%E6%96%87%20%E6%AA%94.zip")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


class Download(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp()
        os.environ["SENTINEL_DL_DIR"] = cls.dir
        os.environ["SENTINEL_DL_LOCAL"] = "1"
        from test_passkey import load_sentinel
        cls.S = load_sentinel()
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Files)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        os.environ.pop("SENTINEL_DL_DIR", None)
        os.environ.pop("SENTINEL_DL_LOCAL", None)

    def wait(self, url):
        for _ in range(200):
            j = next(x for x in self.S.DL if x["url"] == url)
            if j["st"] in ("ok", "bad"):
                return j
            time.sleep(.05)
        self.fail("下載沒有結束")

    def test_download_and_names(self):
        ok, msg = self.S.dl_add(self.base + "/file.bin")
        self.assertTrue(ok, msg)
        j = self.wait(self.base + "/file.bin")
        self.assertEqual(j["st"], "ok", j["err"])
        with open(os.path.join(self.dir, "file.bin"), "rb") as f:
            self.assertEqual(f.read(), DATA)
        self.assertTrue(any(e[2].startswith("下載好了：file.bin") for e in self.S.COL.events))
        self.S.dl_add(self.base + "/go")                       # 轉址後同一個檔名：加上 (2)
        self.assertEqual(self.wait(self.base + "/go")["name"], "file (2).bin")
        self.S.dl_add(self.base + "/named?a=1")
        self.assertEqual(self.wait(self.base + "/named?a=1")["name"], "中文 檔.zip")
        self.assertFalse([f for f in os.listdir(self.dir) if f.endswith(self.S.DL_PART)])

    def test_resume(self):
        with open(os.path.join(self.dir, "resume.bin" + self.S.DL_PART), "wb") as f:
            f.write(DATA[:1000])
        url = self.base + "/file.bin?r"
        self.S.DL.append({"id": "r1", "url": url, "name": "resume.bin", "st": "wait", "done": 1000, "total": 0,
                          "bps": 0, "err": "", "t": time.time(), "t_end": 0, "stop": False})
        self.S.dl_kick()
        self.assertEqual(self.wait(url)["st"], "ok")
        with open(os.path.join(self.dir, "resume.bin"), "rb") as f:
            self.assertEqual(f.read(), DATA)

    def test_errors(self):
        self.S.dl_add(self.base + "/missing")
        j = self.wait(self.base + "/missing")
        self.assertEqual((j["st"], j["err"]), ("bad", "找不到這個檔案（404）"))
        self.assertEqual(self.S.ev_line({"kind": "bad", "text": "下載失敗：x（y）"})[:1], "❌")
        self.assertFalse(self.S.dl_add("ftp://example.com/a")[0])
        self.assertFalse(self.S.dl_add("file:///etc/passwd")[0])
        room = self.S.dl_room
        self.S.dl_room = lambda d: 10
        try:
            self.S.dl_add(self.base + "/file.bin?big")
            self.assertTrue(self.wait(self.base + "/file.bin?big")["err"].startswith("空間不夠"))
        finally:
            self.S.dl_room = room

    def test_cancel(self):
        url = self.base + "/slow"
        self.S.dl_add(url)
        for _ in range(100):
            j = next(x for x in self.S.DL if x["url"] == url)
            if j["done"]:
                break
            time.sleep(.05)
        self.assertTrue(self.S.dl_stop(j["id"])[0])
        for _ in range(100):
            if j not in self.S.DL:
                break
            time.sleep(.05)
        self.assertNotIn(j, self.S.DL)
        self.assertFalse(os.path.exists(os.path.join(self.dir, j["name"] + self.S.DL_PART)))

    def test_private_addresses_blocked(self):
        S = self.S
        S.DL_LOCAL = False
        try:
            for host in ("127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "100.64.0.1", "localhost"):
                with self.subTest(host=host), self.assertRaises(S.DlErr):
                    S.dl_addrs(host, 80)
            self.assertFalse(S.dl_add(self.base + "/file.bin?x")[0])
            self.assertEqual(S.dl_addrs("1.1.1.1", 443), ["1.1.1.1"])
        finally:
            S.DL_LOCAL = True


if __name__ == "__main__":
    unittest.main()
