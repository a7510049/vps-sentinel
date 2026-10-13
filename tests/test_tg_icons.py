"""Telegram 通知的測試：每一種事件傳出去時，開頭都要有狀態符號（不能只有一個小黑點或什麼都沒有）。"""
import unittest

from test_passkey import load_sentinel

S = load_sentinel()

EVENTS = [
    ("ok", "系統更新完成"), ("bad", "系統更新失敗"), ("ok", "已恢復：磁碟快滿了"),
    ("ok", "「主站」的安全憑證已自動續期"), ("bad", "「主站」的安全憑證自動續期失敗"),
    ("warn", "主機重新開機了"), ("info", "root 從 1.2.3.4 登入了主機（SSH）"),
    ("info", "存取密碼已換新"), ("info", "登記了手機金鑰「iPhone」"), ("info", "刪除了手機金鑰「iPhone」"),
    ("info", "PIN 碼登入已設定"), ("info", "PIN 碼登入已關閉"), ("warn", "PIN 碼連續輸錯 5 次，暫停 15 分鐘"),
    ("bad", "PIN 碼累計輸錯 20 次，已自動關閉"), ("warn", "安全憑證再 7 天到期"), ("bad", "記憶體不夠了"),
    ("ok", "其他好消息"), ("info", "其他一般消息"), ("weird", "不認得的種類"),
]


class TgIcons(unittest.TestCase):
    def test_every_event_has_icon(self):
        for kind, text in EVENTS:
            line = S.ev_line({"kind": kind, "text": text})
            icon = line.partition(" ")[0]
            with self.subTest(text=text):
                self.assertTrue(icon and not icon.isalnum() and icon != "•", line)

    def test_single_line_message(self):
        msg = S.tg_host_msg("主機A", [S.ev_line({"kind": "info", "text": "存取密碼已換新"})])
        self.assertEqual(msg, "🔐 <b>主機A</b>　存取密碼已換新")


if __name__ == "__main__":
    unittest.main()
