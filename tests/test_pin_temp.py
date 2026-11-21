"""臨時 PIN 碼：第一次安裝給一組隨機的，登入後一定要先換掉才能用其他功能。只用 Python 內建模組。"""
import hashlib
import json
import os
import subprocess
import sys
import unittest
import urllib.error
import urllib.request

from test_smoke import ROOT, TOKEN, Server


class PinTemp(Server):
    def call(self, path, body=None, token=None):
        headers = {"Content-Type": "application/json", **({"X-Token": token} if token else {})}
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", headers=headers,
                                     data=None if body is None else json.dumps(body).encode(), method="GET" if body is None else "POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def cli(self, arg):
        env = {k: v for k, v in os.environ.items() if not k.startswith("SENTINEL_")}
        env["SENTINEL_CONF"] = self.conf
        return subprocess.run([sys.executable, os.path.join(ROOT, "sentinel.py"), arg], env=env, cwd=self.tmp.name,
                              capture_output=True, text=True, timeout=30).stdout.strip()

    def test_temp_pin(self):
        pin = self.cli("--first-pin")
        self.assertRegex(pin, r"^[0-9]{8}$")
        self.assertEqual(self.cli("--first-pin"), "")              # 已經有 PIN 碼：不換
        self.assertTrue(self.call("/api/passkey-login", {"action": "has"})[1]["temp"])
        c, d = self.call("/api/pin-login", {"pin": pin, "dev": "手機"})
        self.assertEqual(c, 200, d)
        tok = d["token"]
        c, d = self.call("/api/all", token=tok)
        self.assertEqual(c, 403)
        self.assertTrue(d["mustpin"])                               # 還沒換掉：其他都不給
        self.assertEqual(self.call("/api/sec", {"action": "info"}, tok)[0], 403)
        self.assertEqual(self.call("/api/all", token=TOKEN)[0], 200)   # 主機之間用的存取密碼不擋
        self.assertTrue(self.call("/api/pin", {"action": "status"}, tok)[1]["temp"])
        salt = "00112233445566778899aabbccddeeff"
        h = hashlib.pbkdf2_hmac("sha256", b"582914", bytes.fromhex(salt), 200000).hex()
        c, d = self.call("/api/pin", {"action": "set", "pin": {"salt": salt, "n": 200000, "hash": h}}, tok)
        self.assertEqual(c, 200, d)                                 # 換掉臨時的不用再確認一次
        self.assertFalse(d["temp"])
        self.assertEqual(self.call("/api/all", token=tok)[0], 200)
        c, d = self.call("/api/pin-login", {"pin": pin})
        self.assertEqual(c, 401)                                    # 臨時的不能再用
        self.assertIn("臨時 PIN 碼：", self.cli("--new-pin"))       # 忘了 PIN 碼：在主機上換一組臨時的
        self.assertEqual(self.call("/api/all", token=tok)[0], 403)


if __name__ == "__main__":
    unittest.main()
