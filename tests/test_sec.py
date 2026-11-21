"""安全檢查頁：放 SSH 金鑰、關密碼登入（沒金鑰時不准關）、錯太多次封鎖、自動安全更新。只用 Python 內建模組。"""
import base64
import json
import os
import tempfile
import time
import unittest
import urllib.error
import urllib.request

from test_smoke import TOKEN, Server

TMP = tempfile.mkdtemp()
ETC, HOME = os.path.join(TMP, "ssh"), os.path.join(TMP, "home")
FW, LOG, APT = os.path.join(TMP, "fw.log"), os.path.join(TMP, "auth.log"), os.path.join(TMP, "20auto-upgrades")
os.makedirs(ETC)
os.makedirs(os.path.join(HOME, "ubuntu"))
with open(os.path.join(ETC, "sshd_config"), "w", encoding="utf-8") as f:
    f.write("Port 22\nPasswordAuthentication yes\n")
blob = b"\0\0\0\x0bssh-ed25519\0\0\0\x20" + bytes(range(32))
PUB = "ssh-ed25519 " + base64.b64encode(blob).decode() + " me@phone"


class Sec(Server):
    ENV = {"SENTINEL_SSH_ETC": ETC, "SENTINEL_SSH_HOME": HOME, "SENTINEL_GUARD_FW": FW, "SENTINEL_GUARD_LOG": LOG,
           "SENTINEL_GUARD_EVERY": "0.3", "SENTINEL_AUTOUPD": APT,
           "SENTINEL_SSHD_T": "port 22\npermitrootlogin yes\npasswordauthentication yes\npermitemptypasswords no\n"}

    def call(self, body):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/sec", data=json.dumps(body).encode(),
                                     headers={"X-Token": TOKEN, "Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_1_no_key_no_lock(self):
        c, d = self.call({"action": "info"})
        self.assertEqual(c, 200)
        self.assertIs(d["sec"]["sshpw"], False)
        self.assertIs(d["sec"]["sshroot"], False)
        self.assertEqual(d["users"], ["ubuntu"])
        c, d = self.call({"action": "fix", "item": "sshpw"})
        self.assertEqual(c, 400)                                  # 沒有金鑰：不准關，免得進不來
        self.assertFalse(os.path.exists(os.path.join(ETC, "sshd_config.d", "00-vps-sentinel.conf")))

    def test_2_key_then_lock(self):
        c, d = self.call({"action": "key", "user": "ubuntu", "key": "亂打的"})
        self.assertEqual(c, 400)
        c, d = self.call({"action": "key", "user": "ubuntu", "key": PUB})
        self.assertEqual(c, 200, d)
        self.assertEqual([k["name"] for k in d["keys"]], ["me@phone"])
        self.call({"action": "key", "user": "ubuntu", "key": PUB})       # 同一把不會重複
        with open(os.path.join(HOME, "ubuntu", ".ssh", "authorized_keys"), encoding="utf-8") as f:
            self.assertEqual(f.read().count("ssh-ed25519"), 1)
        c, d = self.call({"action": "fix", "item": "sshpw"})
        self.assertEqual(c, 200, d)
        self.assertIs(d["sec"]["sshpw"], True)
        c, d = self.call({"action": "fix", "item": "sshroot"})
        self.assertIs(d["sec"]["sshroot"], True)
        with open(os.path.join(ETC, "sshd_config.d", "00-vps-sentinel.conf"), encoding="utf-8") as f:
            t = f.read()
        self.assertIn("PasswordAuthentication no", t)
        self.assertIn("PermitRootLogin prohibit-password", t)
        with open(os.path.join(ETC, "sshd_config"), encoding="utf-8") as f:
            self.assertTrue(f.read().startswith("Include "))       # 舊系統沒有讀 sshd_config.d：補上
        c, d = self.call({"action": "undo", "item": "sshpw"})
        self.assertIs(d["sec"]["sshpw"], False)

    def test_3_guard(self):
        ok = "Accepted publickey for ubuntu from 52.10.20.9 port 5000 ssh2\n"
        bad = "".join(f"Invalid user admin{i} from 45.33.10.7 port {4000 + i}\n" for i in range(5))
        mine = "".join(f"Failed password for ubuntu from 52.10.20.9 port {4100 + i} ssh2\n" for i in range(6))
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(ok + bad + mine)
        for _ in range(50):
            if os.path.exists(FW) and "45.33.10.7" in open(FW, encoding="utf-8").read():
                break
            time.sleep(0.2)
        with open(FW, encoding="utf-8") as f:
            t = f.read()
        self.assertIn("add 45.33.10.7 3600", t)
        self.assertNotIn("52.10.20.9", t)                         # 成功登入過的 IP 不封
        c, d = self.call({"action": "info"})
        self.assertEqual(d["bans"], 1)
        self.assertIs(d["sec"]["guard"], True)

    def test_4_autoupd(self):
        c, d = self.call({"action": "info"})
        self.assertIs(d["sec"]["autoupd"], False)
        c, d = self.call({"action": "fix", "item": "autoupd"})
        self.assertEqual(c, 200, d)
        self.assertIs(d["sec"]["autoupd"], True)
        with open(APT, encoding="utf-8") as f:
            self.assertIn('Unattended-Upgrade "1"', f.read())


if __name__ == "__main__":
    unittest.main()
