"""配對暗號的測試：新主機產生暗號，主要主機貼上就加進來；暗號用一次就失效，鑰匙可以解除。"""
import json
import os
import subprocess
import sys
import unittest
import urllib.parse

from test_passkey import load_sentinel
from test_smoke import ROOT, Server, TOKEN

S = load_sentinel()


class Crypto(unittest.TestCase):
    def test_hkdf_rfc5869(self):
        """跟 RFC 5869 的標準測試資料一致"""
        okm = S.hkdf(bytes([0x0b] * 22), bytes(range(13)), bytes(range(0xf0, 0xfa)), 42)
        self.assertEqual(okm.hex(), "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865")

    def test_code_roundtrip(self):
        ok, code = S.pair_code("https://example.com:9443/")
        self.assertTrue(ok)
        self.assertTrue(code.startswith("VS-"))
        url, secret = S.pair_decode(" " + code[:20] + "\n" + code[20:] + " ")     # 複製時多了空白、換行也能用
        self.assertEqual(url, "https://example.com:9443")
        self.assertEqual(len(secret), 16)
        self.assertEqual(S.pair_load()["pending"]["s"], secret.hex())
        bad = code[:-4] + ("A" if code[-4] != "A" else "B") + code[-3:]
        self.assertIsNone(S.pair_decode(bad))                                       # 少抄錯一個字也看得出來
        self.assertIsNone(S.pair_decode("亂打的"))

    def test_watch_alert(self):
        """被監看的主機：主要主機太久沒連進來就通知，回來了再通知一次"""
        sent = []
        S.tg_api = lambda bot, m, d: (sent.append(d["text"]) or ({}, ""))
        S.PEERS[:] = []
        S.pair_save({"keys": [{"id": "k1", "name": "主要主機", "hash": "x"}], "tg": {"bot": "1:x", "chat": "9"}})
        S.WATCH.update(down=False, t0=S.time.time() - 3600)        # 哨兵早就開著了
        S.PAIR_SEEN["k1"] = S.time.time()
        S.watch_check()
        self.assertEqual(sent, [])
        S.PAIR_SEEN["k1"] = S.time.time() - S.WATCH_SILENT - 5
        S.watch_check()
        S.watch_check()
        self.assertEqual(len(sent), 1)
        self.assertTrue(sent[0].startswith("🔌 <b>主要主機</b>"), sent[0])
        S.PAIR_SEEN["k1"] = S.time.time()
        S.watch_check()
        self.assertTrue(sent[-1].startswith("✅"), sent[-1])
        S.pair_save({})

    def test_bad_url(self):
        self.assertFalse(S.pair_code("ftp://x")[0])
        self.assertFalse(S.pair_code("")[0])

    def test_watch_alert_after_restart(self):
        """被監看的主機重新開機時，主要主機剛好也掛了：從啟動時算起 5 分鐘一樣會通知"""
        sent = []
        S.tg_api = lambda bot, m, d: (sent.append(d["text"]) or ({}, ""))
        S.PEERS[:] = []
        S.PAIR_SEEN.clear()
        S.WATCH.update(down=False, t0=S.time.time() - S.WATCH_SILENT - 5)
        S.pair_save({"keys": [{"id": "k9", "name": "主要主機", "hash": "x"}], "tg": {"bot": "1:x", "chat": "9"}})
        S.watch_check()
        self.assertEqual(len(sent), 1)
        self.assertTrue(sent[0].startswith("🔌"), sent[0])
        S.WATCH.update(down=False, t0=S.time.time())
        S.pair_save({})

    def test_no_alert_right_after_pairing(self):
        """剛重新配對好（主要主機還沒用新鑰匙連進來）：不能誤報主要主機失聯"""
        sent = []
        S.tg_api = lambda bot, m, d: (sent.append(d["text"]) or ({}, ""))
        S.PEERS[:] = []
        S.PAIR_SEEN.clear()
        S.WATCH.update(down=False, t0=S.time.time() - 3600)
        S.pair_save({"keys": [{"id": "new", "name": "主要主機", "hash": "x", "t": int(S.time.time())}], "tg": {"bot": "1:x", "chat": "9"}})
        S.watch_check()
        self.assertEqual(sent, [])
        S.WATCH.update(t0=S.time.time())
        S.pair_save({})

    def test_own_code_refused(self):
        """把這台自己的暗號貼回這台：直接擋下來，不會把自己加成另一台"""
        ok, code = S.pair_code("https://example.com:9443")
        self.assertTrue(ok)
        ok, msg = S.peer_add(code)
        self.assertFalse(ok)
        self.assertIn("自己", msg)
        S.pair_save({})


def clean_env(conf):
    env = {k: v for k, v in os.environ.items() if not k.startswith("SENTINEL_") and "proxy" not in k.lower()}
    env["SENTINEL_CONF"] = conf
    return env


class Pairing(unittest.TestCase):
    """跑兩個哨兵：B 產生暗號，A 貼上"""

    @classmethod
    def setUpClass(cls):
        os.environ.update({"no_proxy": "127.0.0.1,localhost", "NO_PROXY": "127.0.0.1,localhost"})
        cls.B = type("B", (Server,), {"EXTRA": ""})
        cls.A = type("A", (Server,), {"EXTRA": ""})
        cls.B.setUpClass()
        cls.A.setUpClass()
        cls.b, cls.a = cls.B("run"), cls.A("run")      # 用來呼叫 request()

    @classmethod
    def tearDownClass(cls):
        cls.A.tearDownClass()
        cls.B.tearDownClass()

    btok = TOKEN                            # 新主機目前的登入密碼

    def post(self, srv, path, body):
        code, _, data = srv.request(path, token=self.btok if srv is self.b else TOKEN, method="POST", data=json.dumps(body).encode())
        return code, json.loads(data or b"{}")

    def new_code(self):
        code, d = self.post(self.b, "/api/pair-admin", {"action": "code", "url": f"http://127.0.0.1:{self.B.port}/"})
        self.assertEqual(code, 200, d)
        return d["code"]

    def peers(self):
        with open(self.A.conf, encoding="utf-8") as f:
            line = next((x for x in f if x.startswith("PEERS=")), "PEERS=")
        return line.strip()[6:]

    def test_1_pair_and_remove(self):
        code = self.new_code()
        st, d = self.post(self.a, "/api/peer", {"action": "add", "code": code})
        self.assertEqual(st, 200, d)
        self.assertIn("已新增", d["message"])

        # 新主機進入被監看模式：網頁只剩說明頁，主要主機照樣拿得到資料
        _, _, page = self.b.request("/")
        self.assertIn("監看中", page.decode())
        self.assertNotIn("/*@app.js*/", page.decode())
        self.assertLess(len(page), 20000)
        peers = self.peers()
        self.assertIn(f"http://127.0.0.1:{self.B.port}|vsk_", peers)
        key = peers.split("|", 1)[1]
        self.assertNotIn(key, open(os.path.join(self.B.tmp.name, "data", "pairing.json"), encoding="utf-8").read())  # 新主機只存雜湊

        # 主要主機看得到新主機
        _, _, body = self.a.request("/api/all", token=TOKEN)
        hosts = json.loads(body)
        self.assertEqual(len(hosts), 2)
        self.assertTrue(hosts[1]["online"], hosts[1])

        # 新主機看得到是誰配對的；暗號用過就失效
        _, d = self.post(self.b, "/api/pair-admin", {"action": "status"})
        self.assertEqual(len(d["keys"]), 1)
        self.assertEqual(d["pending"], 0)
        st, d = self.post(self.a, "/api/peer", {"action": "add", "code": code})
        self.assertEqual(st, 400)
        self.assertIn("失效", d["message"])

        # 新主機換登入密碼，配對照樣能用
        st, d = self.post(self.a, "/api/token?node=" + urllib.parse.quote(hosts[1]["node"]), {})
        self.assertEqual(st, 200)
        type(self).btok = d["token"]
        self.assertEqual(self.peers(), peers)
        _, _, body = self.a.request("/api/all", token=TOKEN)
        self.assertTrue(json.loads(body)[1]["online"])

        # 移除：那台的鑰匙也跟著作廢
        st, d = self.post(self.a, "/api/peer", {"action": "remove", "name": hosts[1]["node"]})
        self.assertEqual(st, 200, d)
        self.assertEqual(self.peers(), "")
        code2, _, _ = self.b.request("/api/status", token=key)
        self.assertEqual(code2, 401)
        _, _, page = self.b.request("/")
        self.assertNotIn("監看中", page.decode())                # 移除後網頁恢復

    def test_2_wrong_secret(self):
        code = self.new_code()
        url, secret = S.pair_decode(code)
        raw = b"\x01" + bytes(16) + url.encode()               # 網址對、密鑰錯
        fake = "VS-" + S.b64u(raw + S.hashlib.sha256(raw).digest()[:3])
        st, d = self.post(self.a, "/api/peer", {"action": "add", "code": fake})
        self.assertEqual(st, 400)
        self.assertIn("暗號不對", d["message"])
        self.assertEqual(self.peers(), "")

    def test_3_revoke_from_new_host(self):
        st, d = self.post(self.a, "/api/peer", {"action": "add", "code": self.new_code()})
        self.assertEqual(st, 200, d)
        key = self.peers().split("|", 1)[1]
        self.assertEqual(self.b.request("/api/status", token=key)[0], 200)
        _, d = self.post(self.b, "/api/pair-admin", {"action": "status"})
        st, d = self.post(self.b, "/api/pair-admin", {"action": "revoke", "id": d["keys"][0]["id"]})
        self.assertEqual(st, 200, d)
        self.assertEqual(self.b.request("/api/status", token=key)[0], 401)
        _, _, body = self.a.request("/api/all", token=TOKEN)
        self.assertIn("重新配對", json.loads(body)[1]["error"])


    def test_4_unwatch(self):
        st, d = self.post(self.a, "/api/peer", {"action": "add", "code": self.new_code()})
        self.assertEqual(st, 200, d)
        key = self.peers().split("|", 1)[1]
        # 主要主機的心跳：帶 Telegram 設定（只有拿配對鑰匙的才收）
        beat = json.dumps({"action": "beat", "tg": {"bot": "1:x", "chat": "9"}}).encode()
        self.assertEqual(self.b.request("/api/pair", token="wrong", method="POST", data=beat)[0], 401)
        self.assertEqual(self.b.request("/api/pair", token=key, method="POST", data=beat)[0], 200)
        with open(os.path.join(self.B.tmp.name, "data", "pairing.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["tg"], {"bot": "1:x", "chat": "9"})
        # 在新主機上取消被監看：密碼不對不行
        bad = json.dumps({"action": "unwatch", "pw": "nope"}).encode()
        self.assertEqual(self.b.request("/api/pair", method="POST", data=bad)[0], 401)
        good = json.dumps({"action": "unwatch", "pw": self.btok}).encode()
        code, _, body = self.b.request("/api/pair", method="POST", data=good)
        self.assertEqual(code, 200, body)
        self.assertEqual(self.b.request("/api/status", token=key)[0], 401)
        self.assertNotIn("監看中", self.b.request("/")[2].decode())
        self.post(self.a, "/api/peer", {"action": "remove", "name": json.loads(self.a.request("/api/all", token=TOKEN)[2])[1]["node"]})


class Cli(unittest.TestCase):
    def test_pair_code_cli(self):
        """安裝畫面用的指令"""
        tmp = S.tempfile.mkdtemp()
        conf = os.path.join(tmp, "t.conf")
        with open(conf, "w", encoding="utf-8") as f:
            f.write(f"TOKEN=x\nDATA_DIR={tmp}\n")
        out = subprocess.run([sys.executable, os.path.join(ROOT, "sentinel.py"), "--pair-code", "https://example.com:9443"],
                             env=clean_env(conf), capture_output=True, text=True, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(S.pair_decode(out.stdout.strip())[0], "https://example.com:9443")

if __name__ == "__main__":
    unittest.main()
