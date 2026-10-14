"""從網頁重新開機的測試：要有 Telegram 收到的一次性驗證碼才會重開，輸錯、過期、重複用都不行；
沒設定 Telegram 的主機改用它自己的密碼或 PIN 碼。開兩個哨兵：A（有 Telegram）設定了 B（沒有），也試從 A 轉給 B。
重開的指令換成寫一個檔案，不會真的重開。"""
import http.server
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

from test_backup import start
from test_smoke import TOKEN, free_port

SENT, DELETED = [], []                                       # 假的 Telegram 收到的訊息、被刪掉的訊息編號


class FakeTG(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = urllib.parse.parse_qs(self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode())
        mid = 500 + len(SENT)
        if self.path.endswith("/sendMessage"):
            SENT.append(body["text"][0])
        if self.path.endswith("/deleteMessage"):
            DELETED.append(int(body["message_id"][0]))
        out = json.dumps({"ok": True, "result": {"message_id": mid}}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


class RebootTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.tg = http.server.ThreadingHTTPServer(("127.0.0.1", free_port()), FakeTG)
        threading.Thread(target=cls.tg.serve_forever, daemon=True).start()
        cls.mark = {n: os.path.join(cls.tmp, f"rebooted-{n}") for n in "AB"}
        env = lambda n: {"SENTINEL_TG_API": f"http://127.0.0.1:{cls.tg.server_address[1]}/bot",   # noqa: E731
                         "SENTINEL_REBOOT_CMD": f"touch {cls.mark[n]}"}
        cls.b = start(cls.tmp, "B", "", env("B"))
        cls.a = start(cls.tmp, "A", f"PEERS=B=http://127.0.0.1:{cls.b[1]}\nTG_BOT_TOKEN=123:abc\nTG_CHAT_ID=42\n", env("A"))
        cls.procs = [cls.a, cls.b]

    @classmethod
    def tearDownClass(cls):
        for p, _, _, log in cls.procs:
            p.terminate()
            p.wait(10)
            log.seek(0)
            out = log.read()
            if "Traceback" in out:
                print("\n── 哨兵輸出 ──\n" + out, file=sys.stderr)
            log.close()
        cls.tg.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def call(self, port, body, query=""):
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/reboot{query}", data=json.dumps(body).encode(),
                                     headers={"X-Token": TOKEN, "Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def wait_file(self, f):
        for _ in range(50):
            if os.path.exists(f):
                return True
            time.sleep(0.1)
        return False

    def test_1_code_from_telegram(self):
        port = self.a[1]
        st, d = self.call(port, {"action": "go", "code": "123456"})
        self.assertEqual(st, 400, d)                            # 還沒要驗證碼就不能重開
        st, d = self.call(port, {"action": "ask"})
        self.assertEqual((st, d.get("mode")), (200, "tg"), d)
        msg = SENT[-1]
        self.assertTrue(msg.startswith("🔐 "), msg)
        code = re.search(r"<code>(\d{6})</code>", msg).group(1)
        n = len(SENT)
        st, d = self.call(port, {"action": "ask"})               # 連按：不會再傳一次
        self.assertEqual(len(SENT), n)
        wrong = "000000" if code != "000000" else "111111"
        st, d = self.call(port, {"action": "go", "code": wrong})
        self.assertEqual(st, 400)
        self.assertFalse(os.path.exists(self.mark["A"]))
        st, d = self.call(port, {"action": "go", "code": code})
        self.assertEqual(st, 200, d)
        self.assertTrue(self.wait_file(self.mark["A"]))
        time.sleep(0.3)
        self.assertTrue(any(t.startswith("🔄 ") and "從網頁重新開機" in t for t in SENT), SENT)
        self.assertIn(500 + n - 1, DELETED)                     # 用過的驗證碼訊息會刪掉

    def test_2_no_telegram_uses_password(self):
        port = self.a[1]
        st, d = self.call(port, {"action": "ask"}, "?node=B")
        self.assertEqual(d.get("mode"), "pw", d)                 # B 沒有 Telegram：要輸入 B 的密碼
        st, d = self.call(port, {"action": "go", "code": "wrong"}, "?node=B")
        self.assertEqual(st, 400)
        self.assertFalse(os.path.exists(self.mark["B"]))
        st, d = self.call(port, {"action": "go", "code": TOKEN}, "?node=B")
        self.assertEqual(st, 200, d)
        self.assertTrue(self.wait_file(self.mark["B"]))
        st, d = self.call(port, {"action": "go", "code": TOKEN}, "?node=B")
        self.assertEqual(st, 400)                               # 已經在重開了

    def test_3_tries_limit(self):
        S = __import__("test_passkey").load_sentinel()
        S.TG_BOT, S.TG_CHAT = "x", "1"
        S.REBOOT.update(code="123456", t=time.time(), tries=0)
        for _ in range(S.REBOOT_TRIES - 1):
            self.assertFalse(S.reboot_check("654321")[0])
        ok, msg = S.reboot_check("654321")
        self.assertFalse(ok)
        self.assertIn("失效", msg)
        self.assertFalse(S.reboot_check("123456")[0])         # 輸錯太多次，對的也不行了
        S.REBOOT.update(code="123456", t=time.time() - S.REBOOT_MIN * 60 - 1, tries=0)
        self.assertIn("過期", S.reboot_check("123456")[1])
        S.REBOOT.update(code="123456", t=time.time(), tries=0)
        self.assertTrue(S.reboot_check("123456")[0])
        self.assertFalse(S.reboot_check("123456")[0])         # 用一次就失效


if __name__ == "__main__":
    unittest.main()
