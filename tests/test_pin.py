"""PIN 碼登入的測試：設定、登入、太好猜的不收、輸錯暫停、累計輸錯自動關閉。只用 Python 內建模組。"""
import json
import os
import unittest
import urllib.error
import urllib.request

from test_smoke import TOKEN, Server


class PinTest(Server):
    def call(self, path, body, token=None):
        headers = {"Content-Type": "application/json", **({"X-Token": token} if token else {})}
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=json.dumps(body).encode(), method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def pin_file(self):
        return os.path.join(self.tmp.name, "data", "pin.json")

    def test_pin(self):
        # 沒登入不能設定；還沒設定時不能用 PIN 碼登入
        self.assertEqual(self.call("/api/pin", {"action": "set", "pin": "4826"})[0], 401)
        self.assertEqual(self.call("/api/pin-login", {"pin": "4826"})[0], 401)
        self.assertFalse(self.call("/api/passkey-login", {"action": "has"})[1]["pin"])

        # 太短、不是數字、太好猜的都不收
        for bad in ("123", "12ab", "0000", "1234", "987654", "123456789"):
            with self.subTest(pin=bad):
                self.assertEqual(self.call("/api/pin", {"action": "set", "pin": bad}, TOKEN)[0], 400)

        code, d = self.call("/api/pin", {"action": "set", "pin": "4826"}, TOKEN)
        self.assertEqual(code, 200, d)
        self.assertTrue(d["on"])
        self.assertTrue(self.call("/api/passkey-login", {"action": "has"})[1]["pin"])
        with open(self.pin_file(), encoding="utf-8") as f:
            self.assertNotIn("4826", f.read())                     # 存的是雜湊，不是 PIN 碼本身

        code, d = self.call("/api/pin-login", {"pin": "4826"})
        self.assertEqual(code, 200)
        self.assertEqual(d["token"], TOKEN)

        # 連續輸錯 5 次：暫停，連對的也不能用
        for i in range(4):
            code, d = self.call("/api/pin-login", {"pin": "1111"})
            self.assertEqual(code, 401)
            self.assertIn(f"再錯 {4 - i} 次", d["message"])
        code, d = self.call("/api/pin-login", {"pin": "1111"})
        self.assertIn("分鐘後再試", d["message"])
        self.assertEqual(self.call("/api/pin-login", {"pin": "4826"})[0], 401)
        self.assertGreater(self.call("/api/pin", {"action": "status"}, TOKEN)[1]["locked"], 0)

        # 用密碼登入後，暫停解除
        self.call("/api/pin", {"action": "login"}, TOKEN)
        self.assertEqual(self.call("/api/pin-login", {"pin": "4826"})[0], 200)

        # 累計輸錯 10 次：自動關閉
        with open(self.pin_file(), encoding="utf-8") as f:
            p = json.load(f)
        p["fails"] = 9
        with open(self.pin_file(), "w", encoding="utf-8") as f:
            json.dump(p, f)
        code, d = self.call("/api/pin-login", {"pin": "1111"})
        self.assertIn("自動關閉", d["message"])
        self.assertFalse(os.path.exists(self.pin_file()))
        self.assertEqual(self.call("/api/pin-login", {"pin": "4826"})[0], 401)
        _, d = self.call("/api/pin", {"action": "status"}, TOKEN)
        self.assertFalse(d["on"])

        # 重新設定、再關閉
        self.assertEqual(self.call("/api/pin", {"action": "set", "pin": "5091"}, TOKEN)[0], 200)
        code, d = self.call("/api/pin", {"action": "off"}, TOKEN)
        self.assertEqual(code, 200)
        self.assertFalse(d["on"])


if __name__ == "__main__":
    unittest.main()
