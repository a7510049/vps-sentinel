"""遠端下載的測試：下載到資料夾、檔名、同名加編號、接續下載、空間不夠、取消，以及不能下載本機或內部網路的東西。
用一個本機的假檔案伺服器，不連外面的網路。"""
import http.server
import os
import tempfile
import threading
import time
import unittest

DATA = os.urandom(300_000)
BIG = os.urandom(20 * 1024 * 1024)
RANGES = []


FAKE_YT = """#!/usr/bin/env python3
import os, sys
url = sys.argv[-1]
if "youtube" in url and "--cookies" not in sys.argv:
    print("ERROR: [youtube] x: Sign in to confirm you're not a bot", flush=True)
    sys.exit(1)
if "--cookies" in sys.argv and "SID" not in open(sys.argv[sys.argv.index("--cookies") + 1]).read():
    sys.exit(2)
if url.endswith("bad"):
    print("ERROR: [youtube] bad: Video unavailable", flush=True)
    sys.exit(1)
tmpl = sys.argv[sys.argv.index("-o") + 1]
path = tmpl.replace("%(title).80s", "測試影片").replace("%(id)s", "abc").replace("%(ext)s", "mp4")
print("VSN abc 測試影片", flush=True)
for n in (1000, 3000, 5000):
    print(f"VSP {n} 5000 NA 1000.5", flush=True)
open(path, "wb").write(b"x" * 5000)
print("VSF " + path, flush=True)
"""


class Files(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/big"):               # 支援分段的大檔案
            rg = self.headers.get("Range")
            a, b = 0, len(BIG) - 1
            if rg:
                x, y = rg.split("=")[1].split("-")
                a, b = int(x), int(y) if y else len(BIG) - 1
                RANGES.append((a, b))
            body = BIG[a:b + 1]
            self.send_response(206 if rg else 200)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                if "slow" in self.path:                # 慢慢給：讓先下載完的連線有機會去幫忙
                    for i in range(0, len(body), 256 * 1024):
                        self.wfile.write(body[i:i + 256 * 1024])
                        time.sleep(.01)
                else:
                    self.wfile.write(body)
            except OSError:
                pass
            return
        if self.path.startswith("/watch"):           # 網頁：裡面有影片
            body = b"<html>video</html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
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

    def test_segmented(self):
        """大檔案分成 4 段同時下載，結果要跟原檔一模一樣"""
        RANGES.clear()
        url = self.base + "/big.bin"
        self.S.dl_add(url)
        j = self.wait(url)
        self.assertEqual(j["st"], "ok", j["err"])
        self.assertEqual(len(RANGES), 3)                   # 第一段用第一條連線，另外 3 段各開一條
        with open(os.path.join(self.dir, "big.bin"), "rb") as f:
            self.assertEqual(f.read(), BIG)

    def test_segmented_resume(self):
        """分段下載到一半（哨兵重新啟動）：每段從斷掉的地方接著下載"""
        n = len(BIG)
        step = n // 4
        segs = [[i * step, n if i == 3 else (i + 1) * step, 0] for i in range(4)]
        part = os.path.join(self.dir, "half.bin" + self.S.DL_PART)
        with open(part, "wb") as f:
            f.truncate(n)
            for s in segs:
                s[2] = 1000 * (segs.index(s) + 1)
                f.seek(s[0])
                f.write(BIG[s[0]:s[0] + s[2]])
        RANGES.clear()
        want = [s[0] + s[2] for s in segs]
        url = self.base + "/big.bin?resume"
        self.S.DL.append({"id": "s1", "url": url, "name": "half.bin", "st": "wait", "done": 0, "total": n, "segs": segs,
                          "bps": 0, "err": "", "t": time.time(), "t_end": 0, "stop": False})
        self.S.dl_kick()
        self.assertEqual(self.wait(url)["st"], "ok")
        self.assertEqual(sorted(a for a, _ in RANGES), want)
        with open(os.path.join(self.dir, "half.bin"), "rb") as f:
            self.assertEqual(f.read(), BIG)

    def test_segment_steal(self):
        """先下載完的連線會把還剩很多的那段切一半來幫忙"""
        n = len(BIG)
        segs = [[0, 1, 0], [1, n, 0]]
        with open(os.path.join(self.dir, "steal.bin" + self.S.DL_PART), "wb") as f:
            f.truncate(n)
        RANGES.clear()
        url = self.base + "/big.bin?slow"
        self.S.DL.append({"id": "s2", "url": url, "name": "steal.bin", "st": "wait", "done": 0, "total": n, "segs": segs,
                          "bps": 0, "err": "", "t": time.time(), "t_end": 0, "stop": False})
        self.S.dl_kick()
        j = self.wait(url)
        self.assertEqual(j["st"], "ok", j["err"])
        self.assertGreater(len(segs), 2)
        with open(os.path.join(self.dir, "steal.bin"), "rb") as f:
            self.assertEqual(f.read(), BIG)

    def test_video(self):
        """網頁連結交給 yt-dlp（用一支假的），讀得到進度、檔名，下載好的檔案在資料夾裡"""
        fake = os.path.join(tempfile.mkdtemp(), "yt-dlp")
        with open(fake, "w") as f:
            f.write(FAKE_YT)
        os.chmod(fake, 0o755)
        os.environ["SENTINEL_YTDLP"] = fake
        try:
            url = self.base + "/watch?v=abc"
            self.S.dl_add(url)
            j = self.wait(url)
            self.assertEqual((j["st"], j["kind"], j["name"]), ("ok", "video", "測試影片 [abc].mp4"), j["err"])
            self.assertEqual(os.path.getsize(os.path.join(self.dir, j["name"])), 5000)
            url = self.base + "/watch?v=bad"
            self.S.dl_add(url)
            self.assertEqual(self.wait(url)["err"], "影片看不到了")
            S = self.S
            self.assertFalse(S.yt_cookies_set("hello")[0])
            yurl = "https://www.youtube.com/watch?v=abc"
            S.DL.append({"id": "y1", "url": yurl, "name": "", "st": "wait", "done": 0, "total": 0,
                         "bps": 0, "err": "", "t": time.time(), "t_end": 0, "stop": False})
            S.dl_kick()
            self.assertEqual(self.wait(yurl)["err"], "YouTube 擋了這台主機，請開 WARP 或貼上登入資料")
            ok, _ = S.yt_cookies_set(".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tx")
            self.assertTrue(ok)
            self.assertTrue(S.dl_retry("y1")[0])
            j = self.wait(yurl)
            self.assertEqual(j["st"], "ok", j["err"])                # 被擋 → 自動改用登入資料再試一次
            self.assertTrue(S.yt_cookies_set("")[0])
            self.assertFalse(os.path.exists(S.YT_COOKIES))
        finally:
            os.environ.pop("SENTINEL_YTDLP", None)
        self.assertTrue(self.S.yt_site("https://www.youtube.com/watch?v=x"))
        self.assertTrue(self.S.yt_site("https://youtu.be/x"))
        self.assertFalse(self.S.yt_site("https://notyoutube.com/x"))

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
