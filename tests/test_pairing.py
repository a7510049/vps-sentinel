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

    def test_bad_url(self):
        self.assertFalse(S.pair_code("ftp://x")[0])
        self.assertFalse(S.pair_code("")[0])


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
