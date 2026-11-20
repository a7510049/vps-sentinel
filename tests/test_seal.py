"""存在主機上的資料加密：舊的明碼自動換成加密的、程式照常讀得到、--unseal 換得回來。只用 Python 內建模組。"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

from seal_util import ROOT, conf_get, read_text, seal_mod

SECRETS = {"TOKEN": "tok-abc-123", "TG_BOT_TOKEN": "123:secret-bot", "BACKUP_KEY": "my-backup-key",
           "PEERS": "B=https://b.example|vsk_peerkey", "OPENSKY_SECRET": "sky-secret"}


class SealTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = os.path.join(self.tmp.name, "data")
        os.makedirs(self.data)
        self.conf = os.path.join(self.tmp.name, "test.conf")
        with open(self.conf, "w", encoding="utf-8") as f:
            f.write("".join(f"{k}={v}\n" for k, v in SECRETS.items()) + f"PORT=1\nNAME=測試\nDATA_DIR={self.data}\n")
        for name, body in (("pin.json", '{"hash": "pin-hash-xyz", "salt": "00"}'), ("yt-cookies.txt", "youtube.com\tTRUE\t/\tcookie-xyz\n"),
                           ("pairing.json", '{"pending": {"s": "pair-secret-xyz"}}')):
            with open(os.path.join(self.data, name), "w", encoding="utf-8") as f:
                f.write(body)
        self.g = seal_mod(self.conf)

    def tearDown(self):
        self.tmp.cleanup()

    def raw(self):
        out = open(self.conf, encoding="utf-8").read()
        for n in os.listdir(self.data):
            out += open(os.path.join(self.data, n), "rb").read().decode("latin-1")
        return out

    def test_seal_and_unseal(self):
        self.assertEqual(self.g["seal_all"](self.data), 4)
        raw = self.raw()
        for v in list(SECRETS.values()) + ["pin-hash-xyz", "cookie-xyz", "pair-secret-xyz"]:
            self.assertNotIn(v, raw)                                   # 硬碟上找不到任何一個明碼
        self.assertIn("NAME=測試", raw)                                # 不是秘密的設定照舊（安裝畫面要讀）
        key = os.path.splitext(self.conf)[0] + ".key"
        self.assertEqual(os.stat(key).st_mode & 0o077, 0)            # 鑰匙只有自己讀得到
        for k, v in SECRETS.items():
            self.assertEqual(conf_get(self.conf, k), v)
        self.assertEqual(json.loads(read_text(self.conf, os.path.join(self.data, "pin.json")))["hash"], "pin-hash-xyz")
        self.assertEqual(self.g["seal_all"](self.data), 0)            # 已經加密過的不再動
        # 安裝畫面用的指令
        r = subprocess.run([sys.executable, os.path.join(ROOT, "sentinel.py"), "--conf-get", "TOKEN"],
                           env=dict(os.environ, SENTINEL_CONF=self.conf), capture_output=True, text=True, timeout=30)
        self.assertEqual(r.stdout.strip(), SECRETS["TOKEN"])
        # 退回舊版前換回明碼
        r = subprocess.run([sys.executable, os.path.join(ROOT, "sentinel.py"), "--unseal"],
                           env=dict(os.environ, SENTINEL_CONF=self.conf), capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        raw = self.raw()
        for k, v in SECRETS.items():
            self.assertIn(f"{k}={v}\n", raw)
        self.assertIn("pin-hash-xyz", raw)

    def test_tamper_and_wrong_field(self):
        v = self.g["seal_val"]("TOKEN", "abc")
        self.assertEqual(self.g["unseal_val"]("TOKEN", v), "abc")
        self.assertEqual(self.g["unseal_val"]("TG_BOT_TOKEN", v), "")   # 搬到別的欄位就解不開
        bad = v[:-3] + ("A" if v[-3] != "A" else "B") + v[-2:]
        self.assertEqual(self.g["unseal_val"]("TOKEN", bad), "")       # 被改過也解不開
        p = os.path.join(self.data, "x.json")
        self.g["sec_dump"](p, {"a": 1})
        os.rename(p, os.path.join(self.data, "pin.json"))
        with self.assertRaises(ValueError):                             # 換檔名也解不開
            self.g["sec_read"](os.path.join(self.data, "pin.json"))

    def test_server_migrates_and_works(self):
        """哨兵啟動時把舊的明碼換掉，照樣用原本的密碼登入"""
        import urllib.request
        import socket
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        text = open(self.conf, encoding="utf-8").read().replace("PORT=1", f"PORT={port}\nBIND=127.0.0.1").replace("PEERS=B=https://b.example|vsk_peerkey\n", "")
        with open(self.conf, "w", encoding="utf-8") as f:
            f.write(text)
        p = subprocess.Popen([sys.executable, os.path.join(ROOT, "sentinel.py")], env=dict(os.environ, SENTINEL_CONF=self.conf),
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            import time
            for _ in range(100):
                try:
                    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/status", headers={"X-Token": SECRETS["TOKEN"]})
                    with urllib.request.urlopen(req, timeout=2) as r:
                        self.assertEqual(r.status, 200)
                        break
                except OSError:
                    time.sleep(.2)
            else:
                self.fail("哨兵沒有起來")
            self.assertNotIn(SECRETS["TOKEN"], open(self.conf, encoding="utf-8").read())
            self.assertNotIn("pin-hash-xyz", open(os.path.join(self.data, "pin.json"), "rb").read().decode("latin-1"))
        finally:
            p.terminate()
            p.wait(10)


if __name__ == "__main__":
    unittest.main()
