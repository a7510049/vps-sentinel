"""加密筆記（Joplin 同步）：/notes/ 的 WebDAV、帳號密碼、錯太多次擋掉、只收 https。只用 Python 內建模組。"""
import base64
import http.client
import json
import os
import unittest
import urllib.error
import urllib.request

from test_smoke import TOKEN, Server


class Notes(Server):
    def call(self, body):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/notes", data=json.dumps(body).encode(),
                                     headers={"X-Token": TOKEN, "Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def dav(self, method, path, body=None, pw=None, hdr=None, https=True, ip=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        h = dict(hdr or {})
        if https:
            h["X-Forwarded-Proto"] = "https"              # 像經過本機的 Caddy
        if ip:
            h["X-Forwarded-For"] = ip
        if pw is not None:
            h["Authorization"] = "Basic " + base64.b64encode(f"joplin:{pw}".encode()).decode()
        c.request(method, path, body=body, headers=h)
        r = c.getresponse()
        out = r.status, r.read(), dict(r.getheaders())
        c.close()
        return out

    def test_1_flow(self):
        c, d = self.call({})
        self.assertEqual(c, 200)
        self.assertFalse(d["on"])
        self.assertEqual(self.dav("PROPFIND", "/notes/", pw="x")[0], 404)       # 還沒打開
        c, d = self.call({"action": "on"})
        self.assertEqual(c, 200, d)
        pw = d["pw"]
        self.assertGreaterEqual(len(pw), 20)
        with open(os.path.join(self.tmp.name, "data", "notes.json"), "rb") as f:
            self.assertNotIn(pw.encode(), f.read())                             # 密碼加密存
        self.assertEqual(self.dav("PROPFIND", "/notes/", pw=pw, https=False)[0], 403)   # 只收 https
        self.assertEqual(self.dav("PROPFIND", "/notes/")[0], 401)
        s, b, _ = self.dav("PROPFIND", "/notes/", pw=pw, hdr={"Depth": "1"})
        self.assertEqual(s, 207)
        self.assertIn(b"<d:collection/>", b)
        self.assertEqual(self.dav("MKCOL", "/notes/.resource", pw=pw)[0], 201)
        self.assertEqual(self.dav("MKCOL", "/notes/.resource", pw=pw)[0], 405)
        self.assertEqual(self.dav("PUT", "/notes/a/b.md", b"x", pw=pw)[0], 409)  # 上一層不在
        self.assertEqual(self.dav("PUT", "/notes/%E7%AD%86.md", "加密過的".encode(), pw=pw)[0], 201)
        self.assertEqual(self.dav("PUT", "/notes/%E7%AD%86.md", b"v2", pw=pw)[0], 204)
        s, b, h = self.dav("GET", "/notes/%E7%AD%86.md", pw=pw)
        self.assertEqual((s, b), (200, b"v2"))
        s, b, _ = self.dav("PROPFIND", "/notes/", pw=pw, hdr={"Depth": "1"})
        self.assertIn(b"/notes/%E7%AD%86.md", b)
        self.assertIn(b"/notes/.resource/", b)
        self.assertIn(b"<d:getcontentlength>2</d:getcontentlength>", b)
        s, b, _ = self.dav("PROPFIND", "/notes/%E7%AD%86.md", pw=pw, hdr={"Depth": "0"})
        self.assertEqual(s, 207)
        self.assertIn(b"getlastmodified", b)
        mv = {"Destination": f"http://127.0.0.1:{self.port}/notes/.resource/r1", "Overwrite": "T"}
        self.assertEqual(self.dav("MOVE", "/notes/%E7%AD%86.md", pw=pw, hdr=mv)[0], 201)
        self.assertEqual(self.dav("GET", "/notes/%E7%AD%86.md", pw=pw)[0], 404)
        self.assertEqual(self.dav("GET", "/notes/.resource/r1", pw=pw)[1], b"v2")
        out = {"Destination": f"http://127.0.0.1:{self.port}/api/x"}
        self.assertEqual(self.dav("MOVE", "/notes/.resource/r1", pw=pw, hdr=out)[0], 400)   # 不能搬出去
        self.assertEqual(self.dav("GET", "/notes/../notes.json", pw=pw)[0], 400)
        self.assertEqual(self.dav("GET", "/notes/%2e%2e/notes.json", pw=pw)[0], 400)
        self.assertEqual(self.dav("DELETE", "/notes/", pw=pw)[0], 403)
        self.assertEqual(self.dav("DELETE", "/notes/.resource/r1", pw=pw)[0], 204)
        self.assertEqual(self.dav("PUT", "/notes/info.json", b"{}", pw=pw)[0], 201)
        c, d = self.call({"action": "info"})
        self.assertTrue(d["on"])
        self.assertEqual(d["files"], 1)
        self.assertNotIn("pw", d)
        self.assertGreater(d["last"], 0)
        c, d = self.call({"action": "show"})
        self.assertEqual(d["pw"], pw)
        c, d = self.call({"action": "new"})
        self.assertNotEqual(d["pw"], pw)
        self.assertEqual(self.dav("GET", "/notes/info.json", pw=pw)[0], 401)       # 舊密碼立刻失效
        self.assertEqual(self.dav("GET", "/notes/info.json", pw=d["pw"])[0], 200)
        c, d = self.call({"action": "off"})
        self.assertEqual(c, 200)
        self.assertEqual(self.dav("GET", "/notes/info.json", pw="x")[0], 404)
        self.assertTrue(os.path.exists(os.path.join(self.tmp.name, "data", "notes", "info.json")))   # 筆記留著

    def test_2_ban(self):
        c, d = self.call({"action": "on"})
        pw = d["pw"]
        ip = "203.0.113.9"
        for _ in range(10):
            self.assertEqual(self.dav("PROPFIND", "/notes/", pw="猜猜看", ip=ip)[0], 401)
        self.assertEqual(self.dav("PROPFIND", "/notes/", pw=pw, ip=ip)[0], 429)     # 對的也先擋
        self.assertEqual(self.dav("PROPFIND", "/notes/", pw=pw, ip="203.0.113.10")[0], 207)


if __name__ == "__main__":
    unittest.main()
