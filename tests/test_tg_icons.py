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
    ("info", "「主要主機」開始監看這台主機"), ("info", "解除了「主要主機」的配對"), ("info", "開始監看「新主機」"),
    ("info", "不再監看「新主機」"), ("bad", "重新開機失敗"), ("info", "已取消被「主要主機」監看"), ("warn", "處理器太閒，Oracle 可能會收回這台"), ("info", "下載好了：a.zip（1.0 GB）"), ("bad", "下載失敗：a.zip，找不到這個檔案（404）"), ("bad", "哨兵更新到 3.1 失敗，已退回 3.0"), ("ok", "其他好消息"), ("info", "其他一般消息"), ("weird", "不認得的種類"),
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

    def test_similar_problems_stay_apart(self):
        """名稱只差一個數字的容器、磁碟是兩件事；百分比變了還是同一件事"""
        self.assertNotEqual(S.ev_key("容器 app-worker-1 停止"), S.ev_key("容器 app-worker-2 停止"))
        self.assertNotEqual(S.ev_key("磁碟 /data1 剩下不多（91%）"), S.ev_key("磁碟 /data2 剩下不多（91%）"))
        self.assertEqual(S.ev_key("記憶體 91%"), S.ev_key("記憶體 95.5%"))
        self.assertEqual(S.ev_key("3 個安全更新"), S.ev_key("12 個安全更新"))

    def test_pairing_icon(self):
        self.assertEqual(S.ev_line({"kind": "info", "text": "開始監看「新主機」"}), "🔗 開始監看「新主機」")
        self.assertEqual(S.ev_line({"kind": "info", "text": "哨兵開始監看這台主機"}), "")

    def test_reboot_lines(self):
        self.assertEqual(S.ev_line({"kind": "info", "text": "從網頁重新開機"}), "")   # 重開前已經直接傳過了
        self.assertEqual(S.ev_line({"kind": "bad", "text": "重新開機失敗"}), "❌ 重新開機失敗")


if __name__ == "__main__":
    unittest.main()
