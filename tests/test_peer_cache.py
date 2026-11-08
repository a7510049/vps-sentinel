"""主機多的時候首頁也要快：其他主機在背景問好，網頁拿現成的；網頁沒改就不重新下載"""
import json
import socket
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from test_smoke import Server, TOKEN

HITS = []


class Slow(BaseHTTPRequestHandler):
    """很慢才回應的另一台主機"""
    def log_message(self, *a):
        pass

    def do_GET(self):
        HITS.append(time.time())
        time.sleep(1.5)
        body = json.dumps({"name": "慢慢", "online": True, "level": "ok", "problems": []}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


SLOW = ThreadingHTTPServer(("127.0.0.1", 0), Slow)
threading.Thread(target=SLOW.serve_forever, daemon=True).start()
with socket.socket() as _s:                       # 關著的連接埠：連不上的主機
    _s.bind(("127.0.0.1", 0))
    DEAD = _s.getsockname()[1]


class PeerCacheTest(Server):
    EXTRA = f"PEERS=slow=http://127.0.0.1:{SLOW.server_address[1]},dead=http://127.0.0.1:{DEAD}\n"

    def timed(self):
        t = time.time()
        code, _, body = self.request("/api/all", TOKEN)
        self.assertEqual(code, 200)
        return time.time() - t, json.loads(body)

    def test_all_uses_cache(self):
        _, first = self.timed()                   # 第一次要等每一台回來
        self.assertEqual([h.get("online") for h in first], [True, True, False])
        self.assertEqual(first[1]["name"], "慢慢")
        n = len(HITS)
        for _ in range(4):                        # 之後網頁更新不用等慢的那台
            took, d = self.timed()
            self.assertLess(took, 1.0)
            self.assertEqual(len(d), 3)
            self.assertFalse(d[2]["online"])
            time.sleep(0.3)
        time.sleep(3)
        self.timed()
        self.assertLessEqual(len(HITS) - n, 3)    # 同一台不會同時被問好幾次

    def test_page_not_modified(self):
        code, h, body = self.request("/")
        self.assertEqual(code, 200)
        tag = h.get("ETag")
        self.assertTrue(tag and body)
        self.assertEqual(h.get("Cache-Control"), "no-cache")
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/", headers={"If-None-Match": tag[2:-1] + '-gzip"'})
        try:
            urllib.request.urlopen(req, timeout=10)
            self.fail("網頁沒改應該回 304")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 304)
            self.assertEqual(e.read(), b"")
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/", headers={"If-None-Match": 'W/"old"'})
        with urllib.request.urlopen(req, timeout=10) as r:
            self.assertEqual(r.status, 200)


if __name__ == "__main__":
    unittest.main()
