"""機場起降：用假的飛機資料來源，確認看板會分成抵達、出發、地面，機場也找得到。"""
import json
import threading
import time
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TPE = (25.0777, 121.2330)
AC = [
    # 從東京來、正在下降（在機場西南邊，朝東北飛）
    {"hex": "899001", "flight": "EVA2196 ", "r": "B-16781", "t": "B77W", "alt_baro": 3000, "gs": 160, "track": 53,
     "baro_rate": -800, "lat": TPE[0] - .08, "lon": TPE[1] - .1, "seen": 1},
    # 剛起飛（往東北飛遠）
    {"hex": "899002", "flight": "CAL101  ", "r": "B-18918", "t": "A359", "alt_baro": 4000, "gs": 200, "track": 53,
     "baro_rate": 2000, "lat": TPE[0] + .05, "lon": TPE[1] + .06, "seen": 1},
    # 在地面滑行
    {"hex": "899003", "flight": "UIA831  ", "r": "B-17881", "t": "A321", "alt_baro": "ground", "gs": 12, "track": 140,
     "lat": TPE[0] + .005, "lon": TPE[1], "seen": 1},
    # 緊急狀況
    {"hex": "899004", "flight": "CES2017 ", "r": "B-1234", "t": "A21N", "alt_baro": 2500, "gs": 150, "track": 53,
     "baro_rate": -700, "squawk": "7700", "lat": TPE[0] - .05, "lon": TPE[1] - .06, "seen": 1},
]


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, obj):
        b = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/cs/"):             # adsbdb：一班一班問
            if self.path == "/cs/CAL101":
                return self.reply({"response": {"flightroute": {"origin": {"iata_code": "TPE", "municipality": "Taipei"},
                                                                "destination": {"iata_code": "NRT", "municipality": "Tokyo"}}}})
            self.send_response(404)
            self.end_headers()
            return
        self.reply({"ac": AC + [{"hex": "bad", "lat": "x"}, "怪怪的", {"hex": "bad2", "lat": 25, "lon": 121, "alt_baro": 3000, "gs": "快"}]})

    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"]))
        self.reply([{"callsign": "EVA2196", "plausible": 1, "_airports": [{"iata": "NRT", "location": "Tokyo"}, {"iata": "TPE", "location": "Taipei"}]}])


class Flights(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from test_passkey import load_sentinel
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{cls.srv.server_port}"
        cls.S = S = load_sentinel()
        S.FLY_SRC = [("測試", base + "/lat/{lat}/lon/{lon}/dist/{d}", "")]
        S.FLY_ROUTE = base + "/route"
        S.FLY_ROUTE2 = base + "/cs/"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def get(self, q):
        return self.S.fly_api(urllib.parse.parse_qs(q, keep_blank_values=True))

    def test_board(self):
        self.get("ap=TPE")
        for _ in range(50):                   # 航線在背景查，查到之後下一次就有
            if self.S.FLY["routes"].get("EVA2196") and "CAL101" in self.S.FLY["routes"]:
                break
            time.sleep(.1)
        self.S.FLY["cache"].clear()
        d = self.get("ap=TPE")
        self.assertTrue(d["ok"], d)
        self.assertEqual(d["ap"]["name"], "桃園機場")
        arr = {p["fn"]: p for p in d["arr"]}
        self.assertIn("BR2196", arr)
        self.assertEqual(arr["BR2196"]["al"], "長榮航空")
        self.assertEqual(arr["BR2196"]["model"], "777-300ER")
        self.assertEqual(arr["BR2196"]["org"]["name"], "東京")
        dep = {p["fn"]: p for p in d["dep"]}
        self.assertEqual(dep["CI101"]["dst"], {"code": "NRT", "name": "東京"})      # adsb.lol 沒有的，adsbdb 補上
        self.assertEqual([p["fn"] for p in d["gnd"]], ["B7831"])
        self.assertEqual(d["gnd"][0]["st"], "滑行中")
        self.assertTrue(arr["MU2017"]["emg"])
        self.assertEqual(arr["MU2017"]["st"], "緊急狀況")

    def test_search(self):
        d = self.get("q=")
        self.assertEqual([a["code"] for a in d["pin"]], ["TPE", "TSA", "RMQ", "KHH"])
        self.assertEqual(self.get("q=nrt")["list"][0]["code"], "NRT")
        self.assertIn("LHR", [a["code"] for a in self.get("q=london")["list"]])
        self.assertIn("NRT", [a["code"] for a in self.get("q=東京")["list"]])

    def test_source_down(self):
        S = self.S
        old, S.FLY_SRC = S.FLY_SRC, [("壞掉", "http://127.0.0.1:9/{lat}{lon}{d}", "")]
        try:
            d = self.get("ap=KHH")
        finally:
            S.FLY_SRC = old
        self.assertFalse(d["ok"])
        self.assertIn("暫時拿不到", d["error"])


if __name__ == "__main__":
    unittest.main()
