"""每台裝置自己的登入：密碼換鑰匙、清單、登出一台、換密碼全部登出；網頁只跑自己的程式；沒設定 Telegram 的提醒。只用 Python 內建模組。"""
import base64
import hashlib
import json
import re
import unittest
import urllib.error
import urllib.request

from test_smoke import TOKEN, Server


class SessionTest(Server):
    def call(self, path, body, token=None):
        headers = {"Content-Type": "application/json", **({"X-Token": token} if token else {})}
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
        with open(f"{self.tmp.name}/data/sessions.json", encoding="utf-8") as f:
            raw = f.read()
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
        code, t = self.call("/api/token", {}, a)
        self.assertEqual(code, 200, t)
        self.assertTrue(t["sess"].startswith("vss_"))
        self.assertEqual(self.request("/api/status", token=a)[0], 401)
        self.assertEqual(self.request("/api/status", token=d2)[0], 401)
        self.assertEqual(self.request("/api/status", token=t["sess"])[0], 200)
        self.assertEqual(self.login("iPhone・Safari")[0], 401)                    # 舊密碼不能換鑰匙了
        self.assertEqual(self.login("iPhone・Safari", pw=t["token"])[0], 200)
        _, d = self.call("/api/sessions", {"action": "list"}, t["sess"])
        self.assertEqual(next(x for x in d["list"] if x["me"])["dev"], "iPhone・Safari")


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
