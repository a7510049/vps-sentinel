"""每台裝置自己的登入：密碼換鑰匙、清單、登出一台、換密碼全部登出；網頁只跑自己的程式；沒設定 Telegram 的提醒。只用 Python 內建模組。"""
import base64
import hashlib
import hmac
import json
import re
import unittest
import urllib.error
import urllib.request

from seal_util import read_text
from test_smoke import TOKEN, Server


class SessionTest(Server):
    def call(self, path, body, token=None, again=None):
        headers = {"Content-Type": "application/json", **({"X-Token": token} if token else {})}
        if again is not None:                        # 再確認一次是你：base64 的 JSON
            headers["X-Recheck"] = base64.urlsafe_b64encode(json.dumps(again).encode()).decode().rstrip("=")
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=json.dumps(body).encode(), method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def login(self, dev, keep=True, pw=TOKEN):
        return self.call("/api/login", {"pw": pw, "keep": keep, "dev": dev})

    def test_sessions(self):
        self.assertEqual(self.login("壞人", pw="猜猜看")[0], 401)
        code, a = self.login("iPhone・Safari")
        self.assertEqual(code, 200, a)
        a = a["token"]
        self.assertTrue(a.startswith("vss_") and a != TOKEN)
        b = self.login("Mac・Chrome", keep=False)[1]["token"]
        self.assertEqual(self.request("/api/status", token=a)[0], 200)
        self.assertEqual(self.request("/api/status", token="vss_wrongkey")[0], 401)

        # 清單：看得到兩台、標出哪台是自己；檔案裡只有雜湊
        code, d = self.call("/api/sessions", {"action": "list"}, a)
        self.assertEqual(code, 200, d)
        devs = {x["dev"]: x for x in d["list"]}
        self.assertEqual(set(devs), {"iPhone・Safari", "Mac・Chrome"})
        self.assertTrue(devs["iPhone・Safari"]["me"])
        self.assertFalse(devs["Mac・Chrome"]["me"])
        self.assertEqual(devs["iPhone・Safari"]["how"], "密碼")
        raw = read_text(self.conf, f"{self.tmp.name}/data/sessions.json")
        self.assertNotIn(a, raw)
        self.assertNotIn(b, raw)

        # 登出另一台：那台馬上不能用，這台照樣能用
        code, d = self.call("/api/sessions", {"action": "del", "id": devs["Mac・Chrome"]["id"]}, a)
        self.assertEqual([x["dev"] for x in d["list"]], ["iPhone・Safari"])
        self.assertEqual(self.request("/api/status", token=b)[0], 401)
        self.assertEqual(self.request("/api/status", token=a)[0], 200)

        # 登出自己
        c = self.login("Windows 電腦・Edge")[1]["token"]
        self.call("/api/sessions", {"action": "out"}, c)
        self.assertEqual(self.request("/api/status", token=c)[0], 401)

        # 換密碼：所有裝置都登出，按的那台直接拿到新鑰匙
        d2 = self.login("iPad・Safari")[1]["token"]
        code, t = self.call("/api/token", {}, a, again={"pw": TOKEN})
        self.assertEqual(code, 200, t)
        self.assertTrue(t["sess"].startswith("vss_"))
        self.assertEqual(self.request("/api/status", token=a)[0], 401)
        self.assertEqual(self.request("/api/status", token=d2)[0], 401)
        self.assertEqual(self.request("/api/status", token=t["sess"])[0], 200)
        self.assertEqual(self.login("iPhone・Safari")[0], 401)                    # 舊密碼不能換鑰匙了
        self.assertEqual(self.login("iPhone・Safari", pw=t["token"])[0], 200)
        _, d = self.call("/api/sessions", {"action": "list"}, t["sess"])
        self.assertEqual(next(x for x in d["list"] if x["me"])["dev"], "iPhone・Safari")


class RecheckTest(Server):
    call, login = SessionTest.call, SessionTest.login

    def test_recheck(self):
        """已經登入的裝置：關 PIN 碼、換 PIN 碼、換密碼、改 Telegram、加刪手機金鑰、產生配對暗號前都要再確認一次"""
        self.assertEqual(self.call("/api/pin", {"action": "set", "pin": "4826"}, TOKEN)[0], 200)   # 存取密碼本身（主機之間）不用
        a = self.login("iPhone・Safari")[1]["token"]
        for path, body in (("/api/pin", {"action": "off"}), ("/api/pin", {"action": "set", "pin": "5091"}), ("/api/token", {}),
                           ("/api/telegram", {"action": "save", "off": True}), ("/api/passkey", {"action": "begin"}),
                           ("/api/passkey", {"action": "delete", "id": "x"}), ("/api/pair-admin", {"action": "code", "url": "http://x/"}),
                           ("/api/backup", {"action": "key", "key": "新的備份密碼 2026"})):
            code, d = self.call(path, body, a)
            self.assertEqual((code, d.get("recheck")), (403, True), path)
        self.assertTrue(self.call("/api/pin", {"action": "status"}, a)[1]["on"])            # 沒確認：PIN 碼還在
        self.assertEqual(self.call("/api/pin", {"action": "status"}, a)[0], 200)              # 看狀態不用確認
        code, d = self.call("/api/pin", {"action": "off"}, a, again={"pw": "猜猜看"})
        self.assertEqual((code, d.get("recheck")), (403, True))
        _, b = self.call("/api/pin-login", {"action": "begin"})                               # 現在的 PIN 碼（網頁算好的答案）
        h = hashlib.pbkdf2_hmac("sha256", b"4826", bytes.fromhex(b["salt"]), b["n"]).hex()
        proof = hmac.new(h.encode(), b["nonce"].encode(), hashlib.sha256).hexdigest()
        code, d = self.call("/api/pin", {"action": "off"}, a, again={"pin": {"nonce": b["nonce"], "proof": proof}})
        self.assertEqual(code, 200, d)
        self.assertFalse(d["on"])
        self.assertEqual(self.call("/api/pin", {"action": "set", "pin": "5091"}, a)[0], 200)   # 5 分鐘內同一台不用再問
        c = self.login("Mac・Chrome")[1]["token"]
        self.assertEqual(self.call("/api/pin", {"action": "off"}, c)[0], 403)                 # 別台照樣要問


class PageGuardTest(Server):
    def test_csp(self):
        """網頁的每一段程式都有登記指紋，別的程式（例如名稱裡夾帶的）瀏覽器不會跑"""
        code, headers, body = self.request("/")
        self.assertEqual(code, 200)
        csp = headers["Content-Security-Policy"]
        self.assertIn("script-src 'self' 'sha256-", csp)
        self.assertNotIn("unsafe-inline' 'self'", csp)
        self.assertNotRegex(csp.split("script-src")[1].split(";")[0], "unsafe")
        scripts = re.findall(rb"<script>(.*?)</script>", body, re.S)
        self.assertGreaterEqual(len(scripts), 3)
        for s in scripts:
            self.assertIn("'sha256-" + base64.b64encode(hashlib.sha256(s).digest()).decode() + "'", csp)
        self.assertNotRegex(body.decode("utf-8"), r"""\son(error|click|load)=["']""")   # 寫在標籤上的程式會被擋

    def test_tg_hint(self):
        _, _, body = self.request("/api/status", token=TOKEN)
        self.assertTrue(json.loads(body)["tg_off"])


if __name__ == "__main__":
    unittest.main()
