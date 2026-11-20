"""SSH 的門：允許密碼登入時提醒、root 能用密碼登入算異常。只用 Python 內建模組。"""
import json
import unittest
import urllib.request

from test_smoke import TOKEN, Server


class SshOpen(Server):
    ENV = {"SENTINEL_SSHD_T": "port 22\npermitrootlogin yes\npasswordauthentication yes\npermitemptypasswords no\n"}

    def test_flags(self):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/status", headers={"X-Token": TOKEN})
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.loads(r.read())
        self.assertIn("root 能用密碼登入 SSH", d["problems"])
        self.assertNotIn("SSH 能用密碼登入", d["notices"])          # 同一件事只說一次


class SshKeysOnly(Server):
    ENV = {"SENTINEL_SSHD_T": "permitrootlogin prohibit-password\npasswordauthentication no\n"}

    def test_quiet(self):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/status", headers={"X-Token": TOKEN})
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.loads(r.read())
        self.assertFalse([x for x in d["problems"] + d["notices"] if "SSH" in x])


if __name__ == "__main__":
    unittest.main()
