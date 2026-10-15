"""Oracle 防回收的測試：哪些時段要補、7 天第 95 百分位怎麼算、提醒、網頁開關。"""
import json
import os
import time
import unittest
from datetime import datetime

from test_passkey import load_sentinel
from test_smoke import TOKEN, Server

S = load_sentinel()


class Unit(unittest.TestCase):
    def setUp(self):
        S.KEEP["days"].clear()
        S.KEEP.update(oracle=True, shape="VM.Standard.A1.Flex")

    def test_window(self):
        at = lambda h, m: S.keep_window(datetime(2026, 10, 15, h, m))
        self.assertEqual(S.KEEP_HOURS, [1, 7, 13, 19])
        self.assertFalse(at(0, 54))
        self.assertTrue(at(0, 55))
        self.assertTrue(at(1, 30))
        self.assertTrue(at(2, 4))
        self.assertFalse(at(2, 5))
        self.assertFalse(at(10, 0))
        old = S.KEEP_HOURS
        try:
            S.KEEP_HOURS = [0]                         # 跨午夜
            self.assertTrue(at(23, 56))
            self.assertTrue(at(0, 30))
            self.assertFalse(at(23, 50))
        finally:
            S.KEEP_HOURS = old

    def test_only_free_oracle(self):
        self.assertTrue(S.keep_free())
        S.KEEP["shape"] = "VM.Standard.E2.1.Micro"
        self.assertTrue(S.keep_free())
        S.KEEP["shape"] = ""                           # 問不到機型：寧可多補
        self.assertTrue(S.keep_free())
        S.KEEP["shape"] = "VM.Standard.E4.Flex"        # 付費機型不用
        self.assertFalse(S.keep_free())
        self.assertIsNone(S.keep_info())
        S.KEEP.update(oracle=False, shape="")
        self.assertFalse(S.keep_free())
        self.assertEqual(S.keep_notice(), "")

    def test_p95_and_notice(self):
        self.assertEqual(S.keep_p95(), (None, 0))
        for _ in range(2880):                          # 兩天都只有 3%
            S.keep_record(3)
        self.assertEqual(S.keep_p95()[0], 3)
        self.assertEqual(S.ev_line({"kind": "warn", "text": S.keep_notice()}), "🟠 處理器太閒，Oracle 可能會收回這台")
        for _ in range(300):                           # 每天補幾小時就夠：超過 5% 的時間在 25% 以上
            S.keep_record(25.6)
        self.assertEqual(S.keep_p95()[0], 25)
        self.assertEqual(S.keep_notice(), "")
        self.assertEqual(S.keep_info()["p95"], 25)

    def test_keeps_8_days(self):
        for d in range(1, 13):
            S.keep_record(10, day=f"2026-10-{d:02d}")
        self.assertEqual(sorted(S.KEEP["days"])[0], "2026-10-05")
        self.assertEqual(len(S.KEEP["days"]), 8)


class Live(Server):
    """假裝是 Oracle 免費主機、每個整點都要補：補的程式要開起來，網頁可以關掉它"""
    EXTRA = "ORACLE_SHAPE=VM.Standard.A1.Flex\nKEEPALIVE_HOURS=" + ",".join(map(str, range(24))) + "\n"

    def status(self):
        return json.loads(self.request("/api/status", token=TOKEN)[2])

    def wait(self, cond):
        end = time.time() + 15
        while time.time() < end:
            k = self.status().get("keep")
            if k and cond(k):
                return k
            time.sleep(0.5)
        self.fail(f"等不到：{self.status().get('keep')}")

    def test_toggle(self):
        k = self.wait(lambda k: k["now"])
        self.assertTrue(k["on"])
        code, _, body = self.request("/api/keepalive", token=TOKEN, method="POST", data=b'{"on":false}')
        self.assertEqual(code, 200, body)
        self.wait(lambda k: not k["on"] and not k["now"])
        with open(self.conf, encoding="utf-8") as f:
            self.assertIn("KEEPALIVE=off", f.read())
        self.request("/api/keepalive", token=TOKEN, method="POST", data=b'{"on":true}')
        self.wait(lambda k: k["on"] and k["now"])


class NotOracle(Server):
    EXTRA = "ORACLE_SHAPE=none\n"

    def test_hidden(self):
        st = json.loads(self.request("/api/status", token=TOKEN)[2])
        self.assertIsNone(st["keep"])


if __name__ == "__main__":
    unittest.main()
