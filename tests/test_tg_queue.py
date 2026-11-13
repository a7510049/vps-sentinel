"""通知不漏掉：Telegram 傳不出去先排隊補傳；主要主機失聯時，被監看的主機自己通知，「主要主機不見了」只派一台講。"""
import json
import unittest

from test_passkey import load_sentinel

S = load_sentinel()


class TgQueue(unittest.TestCase):
    def setUp(self):
        S.TG_QUEUE.clear()
        S.TG_MSGS.clear()
        S.TG_BOT, S.TG_CHAT, S.TG_KEEP = "1:x", "9", 0.0
        self.sent, self.fail = [], ""
        S.tg_api = lambda bot, m, d: (None, self.fail) if self.fail else (self.sent.append(d["text"]) or ({"result": {"message_id": 1}}, ""))

    def test_retry_in_order(self):
        """連不上：先排隊，連得上了照順序補傳；晚很多才送到的註明幾點"""
        self.fail = "連不上 Telegram，請確認這台主機能連外網"
        S.tg_send("🔴 第一則")
        S.tg_send("🟠 第二則")
        self.assertEqual(self.sent, [])
        self.assertEqual(len(S.TG_QUEUE), 2)
        S.TG_QUEUE[0][0] -= 600                   # 第一則是 10 分鐘前的
        self.fail = ""
        S.tg_flush()
        self.assertEqual(len(self.sent), 2)
        self.assertTrue(self.sent[0].startswith("🔴 第一則") and "的通知）" in self.sent[0], self.sent[0])
        self.assertEqual(self.sent[1], "🟠 第二則")
        self.assertEqual(S.TG_QUEUE, [])

    def test_busy_retry(self):
        """Telegram 回 429、502：也等一下再傳（用真的 tg_api）"""
        S2 = load_sentinel()
        S2.TG_BOT, S2.TG_CHAT = "1:x", "9"
        real = S2.urllib.request.urlopen

        def boom(*a, **k):
            raise S2.urllib.error.HTTPError("u", 502, "Bad Gateway", {}, None)
        S2.urllib.request.urlopen = boom
        try:
            S2.tg_send("🔴 測試")
        finally:
            S2.urllib.request.urlopen = real
        self.assertEqual(len(S2.TG_QUEUE), 1)

    def test_bad_token_dropped(self):
        """密碼錯、被封鎖：傳幾次都一樣，不留著一直傳"""
        self.fail = "機器人密碼不對，請重新複製 @BotFather 給你的那一串"
        S.tg_send("🔴 測試")
        self.assertEqual(S.TG_QUEUE, [])

    def test_old_dropped(self):
        """超過一天還傳不出去就算了"""
        S.TG_QUEUE.append([S.time.time() - S.TG_QUEUE_KEEP - 5, "", "🔴 太舊"])
        S.tg_flush()
        self.assertEqual(self.sent, [])
        self.assertEqual(S.TG_QUEUE, [])

    def test_saved(self):
        """還沒傳出去的會存檔，重新啟動後接著傳"""
        self.fail = "連不上 Telegram，請確認這台主機能連外網"
        S.tg_send("🔴 存起來")
        S.COL.save()
        with open(S.COL.state_path(), encoding="utf-8") as f:
            st = json.load(f)
        self.assertEqual([q[2] for q in st["tg_queue"]], ["🔴 存起來"])


class Takeover(unittest.TestCase):
    def setUp(self):
        S.TG_QUEUE.clear()
        S.PEERS[:] = []
        S.PAIR_SEEN.clear()
        S.COL.events.clear()
        self.sent = []
        S.tg_api = lambda bot, m, d: (self.sent.append((bot, d["text"])) or ({"result": {"message_id": 1}}, ""))

    def tearDown(self):
        S.WATCH.update(down=False, t0=S.time.time())
        S.pair_save({})

    def gone(self, lead):
        S.pair_save({"keys": [{"id": "k1", "name": "主要主機", "hash": "x"}], "tg": {"bot": "1:w", "chat": "9"}})
        S.pair_beat_store({"bot": "1:w", "chat": "9"}, lead)
        S.WATCH.update(down=False, t0=S.time.time() - 3600)
        S.PAIR_SEEN["k1"] = S.time.time() - S.WATCH_SILENT - 5

    def test_own_events_while_main_gone(self):
        """主要主機失聯：這台自己的事件自己傳（用主要主機給的 Telegram），之後回來的主要主機知道傳到哪"""
        self.gone(True)
        S.watch_check()
        self.assertEqual(len(self.sent), 1)
        self.assertTrue(self.sent[0][1].startswith("🔌"))
        S.COL.add_event("bad", "磁碟 / 剩下不多（95%）")
        S.watch_check()
        self.assertEqual(self.sent[-1][0], "1:w")
        self.assertIn("磁碟", self.sent[-1][1])
        S.watch_check()
        self.assertEqual(len(self.sent), 2)        # 同一筆不重發
        self.assertTrue(S.COL.snapshot()["tg_self"] > 0)

    def test_only_lead_says_main_gone(self):
        """不是被派到的那台：不說「主要主機不見了」，但自己的事一樣通知"""
        self.gone(False)
        S.watch_check()
        self.assertEqual(self.sent, [])
        S.COL.add_event("bad", "服務 nginx 沒在執行")
        S.watch_check()
        self.assertEqual(len(self.sent), 1)
        self.assertIn("nginx", self.sent[0][1])

    def test_main_up_no_self_alerts(self):
        """主要主機還在：照舊由它通知，這台不自己傳"""
        self.gone(True)
        S.PAIR_SEEN["k1"] = S.time.time()
        S.COL.add_event("bad", "服務 nginx 沒在執行")
        S.watch_check()
        self.assertEqual(self.sent, [])

    def test_lead_picked(self):
        """主要主機這邊：心跳裡只有一台被派去講「主要主機不見了」，挑連得上的"""
        S.PEERS[:] = [{"name": "b", "url": "http://b", "token": "vsk_b"}, {"name": "c", "url": "http://c", "token": "vsk_c"}]
        S.PEER_CACHE.clear()
        S.PEER_CACHE[S.peer_key(S.PEERS[0])] = {"d": {"online": False}}
        S.PEER_CACHE[S.peer_key(S.PEERS[1])] = {"d": {"online": True}}
        S.BEAT_SENT.clear()
        bodies = {}
        real = S.urllib.request.urlopen

        class R:
            def close(self):
                pass

        def grab(req, timeout=0):
            bodies[req.full_url] = json.loads(req.data)
            return R()
        S.urllib.request.urlopen = grab
        try:
            S.peer_beats()
        finally:
            S.urllib.request.urlopen = real
            S.PEERS[:] = []
            S.PEER_CACHE.clear()
        self.assertFalse(bodies["http://b/api/pair"]["lead"])
        self.assertTrue(bodies["http://c/api/pair"]["lead"])


if __name__ == "__main__":
    unittest.main()
