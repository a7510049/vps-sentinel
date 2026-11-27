"""主機多的時候省流量：圖表資料只傳新的那一段、回應有壓縮；重新啟動後其他主機先用上次的狀態"""
import gzip
import json
import os
import tempfile
import unittest
import urllib.parse
import urllib.request

from test_passkey import load_sentinel
from test_smoke import Server, TOKEN

S = load_sentinel()


def snap(ts):
    return {"name": "甲", "online": True, "hist": {"t": list(ts), "cpu": [float(t) for t in ts], "mem": [1.0] * len(ts),
                                                   "rx": [0] * len(ts), "tx": [0] * len(ts)}}


class HistParts(unittest.TestCase):
    def test_cut_keeps_only_new(self):
        d = S.hist_cut(snap([10, 20, 30, 40]), 20)
        self.assertEqual(d["hist"]["t"], [30, 40])
        self.assertEqual(d["hist"]["cpu"], [30.0, 40.0])
        self.assertTrue(d["hist"]["part"])
        self.assertEqual(S.hist_cut(snap([10]), 0)["hist"]["t"], [10])          # 沒說從哪裡開始：整段給
        self.assertNotIn("part", S.hist_cut(snap([10]), None)["hist"])

    def test_join_appends_and_trims(self):
        old = snap(range(0, 1800, 10))                                      # 0 … 1790
        new = S.hist_cut(snap(range(0, 1830, 10)), 1790)                    # 只傳 1800、1810、1820
        m = S.hist_join(old, new)["hist"]
        self.assertNotIn("part", m)
        self.assertEqual(m["t"][-1], 1820)
        self.assertEqual(m["t"][0], 20)                                     # 只留最近 30 分鐘
        self.assertEqual(len(m["t"]), len(m["cpu"]))

    def test_join_full_replaces(self):
        """舊版主機不認得 since，照樣整段給：直接換掉"""
        self.assertEqual(S.hist_join(snap([1, 2]), snap([5, 6]))["hist"]["t"], [5, 6])


class LitePoll(Server):
    def get(self, path, gz=False):
        h = {"X-Token": TOKEN}
        if gz:
            h["Accept-Encoding"] = "gzip"
        with urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{self.port}" + path, headers=h), timeout=10) as r:
            raw = r.read()
            return r.headers, gzip.decompress(raw) if r.headers.get("Content-Encoding") == "gzip" else raw, len(raw)

    def test_since_and_gzip(self):
        _, body, _ = self.get("/api/all")
        me = json.loads(body)[0]
        last = me["hist"]["t"][-1] if me["hist"]["t"] else 0
        q = urllib.parse.quote(json.dumps({"@self": last + 9e9}))
        _, body, _ = self.get("/api/all?since=" + q)
        h = json.loads(body)[0]["hist"]
        self.assertTrue(h["part"])
        self.assertEqual(h["t"], [])
        _, body, _ = self.get("/api/all?since=%7Bbad")                     # 看不懂的就當沒給
        self.assertNotIn("part", json.loads(body)[0]["hist"])
        hd, page, n = self.get("/", gz=True)
        self.assertEqual(hd.get("Content-Encoding"), "gzip")
        self.assertIn(b"<html", page)
        self.assertLess(n, len(page) / 2)
        hd, _, _ = self.get("/")
        self.assertIsNone(hd.get("Content-Encoding"))                       # 沒說看得懂壓縮就不壓


class PeerCacheFile(unittest.TestCase):
    def test_save_and_load(self):
        with tempfile.TemporaryDirectory() as d:
            S.DATA_DIR = d
            p = {"name": "乙", "url": "http://127.0.0.1:9", "token": "x"}
            S.PEERS[:] = [p]
            S.PEER_CACHE.clear()
            S.PEER_CACHE[S.peer_key(p)] = {"t": 1, "d": {"name": "乙", "online": True}}
            S.peer_cache_save()
            self.assertTrue(os.path.exists(S.peer_cache_path()))
            S.PEER_CACHE.clear()
            S.all_status = lambda *a, **k: []                               # 不真的去問
            S.peer_cache_load()
            self.assertEqual(S.PEER_CACHE[S.peer_key(p)]["d"]["name"], "乙")
            S.PEERS[:] = [{**p, "url": "http://127.0.0.1:10"}]              # 網址改了：不用舊的
            S.PEER_CACHE.clear()
            S.peer_cache_load()
            self.assertEqual(S.PEER_CACHE, {})


if __name__ == "__main__":
    unittest.main()
