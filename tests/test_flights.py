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
    # 聯邦快遞的貨機，不列出來
    {"hex": "899006", "flight": "FDX5300 ", "t": "B77L", "alt_baro": 2800, "gs": 150, "track": 53,
     "baro_rate": -700, "lat": TPE[0] - .06, "lon": TPE[1] - .07, "seen": 1},
    # 從松山剛起飛（就在松山上空往東南爬升），不能算成桃園的
    {"hex": "899005", "flight": "EVA261  ", "alt_baro": 3200, "gs": 170, "track": 147, "baro_rate": 1500,
     "lat": 25.050, "lon": 121.570, "seen": 1},
]
# OpenSky：高雄附近愛好者收不到的，正要降落小港（在機場西邊往東飛、下降中）
SKY = [["8990b5", "EVA850  ", "Taiwan", 0, 0, 120.2387, 22.5805, 502.92, False, 99.85, 91.77, -3.9, None, 586.74, None, False, 0],
       ["780abe", "", "China", 0, 0, 120.341, 22.5733, None, True, 1.54, 115.31, None, None, None, None, False, 0]]


def tw(t):
    """時間戳 → 台灣時間的日期、時刻"""
    x = time.gmtime(t + 8 * 3600)
    return time.strftime("%Y/%m/%d", x), time.strftime("%H:%M:00", x)


def tpe_txt():
    now = time.time()
    rows = []
    for io, al, alz, num, gate, t, pc, en, zh, st in [
        ("A", "BR", "長榮航空", "2196", " C8", now + 600, "NRT", "Tokyo", "東京", "準時ON TIME"),
        ("A", "NH", "全日空", "5800", " C8", now + 600, "NRT", "Tokyo", "東京", "準時ON TIME"),     # 共掛
        ("D", "CI", "中華航空", "  27", " A5", now + 1800, "HKG", "Hong Kong", "香港", "登機BOARDING"),
        ("D", "IT", "台灣虎航", " 200", " D1", now - 3 * 3600, "OKA", "Okinawa", "沖繩", "出發DEPARTED"),   # 太早了
        ("D", "B7", "立榮航空", " 831", " D3", now + 900, "KIX", "Osaka", "大阪", "準時ON TIME"),        # 在地面滑行的那班
        ("A", "MU", "東方航空", "2017", " B6", now + 300, "PVG", "Shanghai", "上海", "準時ON TIME"),
        ("A", "CI", "中華航空", "5225", "D5R", now + 600, "ANC", "Anchorage", "安克拉治", "準時ON TIME"),  # 貨機
    ]:
        d, h = tw(t)
        rows.append(f"2,{io},{al},{alz:20},{num},{gate},{d},{h},{d},{h},{pc},{en},{zh},{st:20},B777-300ER,,,,06 ,    ")
    return "\r\n".join(rows).encode("big5hkscs")


def khh_json(io):
    t = time.time() + 900
    d, h = tw(t)
    if io == "arr":
        return [{"FDATE": d, "STA": f"{d.replace('/', '-')} {h}", "ATA": "", "arrtime": "", "airLineIATA": "BR", "airLineNum": "BR850",
                 "CodeShare": "", "DepartureAirportIATA": "HKG", "airPlaneType": "333", "Bay": "", "statusarr": 1, "notearr": ""},
                {"FDATE": d, "STA": f"{d.replace('/', '-')} {h}", "ATA": "", "arrtime": "", "airLineIATA": "CI", "airLineNum": "CI840",
                 "CodeShare": "PG4905;AE5320", "DepartureAirportIATA": "BKK", "airPlaneType": "32Q", "Bay": "", "statusarr": 1, "notearr": ""}]
    return [{"FDATE": d, "STD": f"{d.replace('/', '-')} {h}", "ATD": "", "deptime": "", "airLineIATA": "UO", "airLineNum": "UO135",
             "CodeShare": "", "ArrivalAirportIATA": "HKG", "airPlaneType": "320", "Bay": "", "statusdep": 3, "notedep": ""}]


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
        if self.path == "/tpe":
            b = tpe_txt()
            self.send_response(200)
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            return self.wfile.write(b)
        if self.path == "/slow":                     # 官網很慢：等 2 秒才回
            time.sleep(2)
            b = tpe_txt()
            self.send_response(200)
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            return self.wfile.write(b)
        if self.path.startswith("/khh/"):
            return self.reply(khh_json(self.path[5:8]))
        if self.path.startswith("/sky"):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            t = int(time.time())
            return self.reply({"time": t, "states": [[*x[:3], t, t, *x[5:]] for x in SKY] if float(q["lamin"][0]) < 23 else None})
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
        S.FLY_SKY = base + "/sky?lamin={la0}&lomin={lo0}&lamax={la1}&lomax={lo1}"
        cls.night, S.fly_night = S.fly_night, lambda ap, now=None: False      # 測試不管現在幾點
        S.FLY_FIDS_URL.update({"TPE": base + "/tpe", "KHH": base + "/khh/", "RMQ": "http://127.0.0.1:9/", "TSA": "http://127.0.0.1:9/"})

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
        self.assertEqual(self.S.fly_route("CAL101", *TPE)[1], {"code": "NRT", "name": "東京"})      # adsb.lol 沒有的，adsbdb 補上
        self.assertNotIn("CI101", [p["fn"] for p in d["dep"]])       # 官網表上沒有的不列
        self.assertEqual([p["fn"] for p in d["gnd"]], ["B7831"])
        self.assertEqual((d["gnd"][0]["st"], d["gnd"][0]["al"], d["gnd"][0]["dst"]["name"]), ("滑行中", "立榮航空", "大阪"))
        every = [p["fn"] for p in d["arr"] + d["dep"] + d["gnd"] + d["over"]]
        self.assertNotIn("CI5225", every)                          # 貨機不列
        self.assertNotIn("FX5300", every)
        self.assertTrue(arr["MU2017"]["emg"])
        self.assertEqual(arr["MU2017"]["st"], "緊急狀況")
        self.assertNotIn("BR261", [p["fn"] for p in d["arr"] + d["dep"] + d["gnd"]])   # 松山的
        self.assertEqual([x[0] for x in d["srcs"]], ["桃園機場官網", "測試"])
        br = arr["BR2196"]                    # 官網的表定時間、登機門，加上收得到的即時位置
        self.assertTrue(br["fids"] and br["live"])
        self.assertEqual((br["gate"], br["share"], br["id"]), ("C8", ["NH5800"], "899001"))
        self.assertEqual(br["term"], "第二航廈")
        self.assertNotIn("NH5800", arr)
        cdep = {p["fn"]: p for p in d["dep"]}
        self.assertEqual((cdep["CI27"]["st"], cdep["CI27"]["dst"]["name"]), ("登機", "香港"))
        self.assertNotIn("IT200", cdep)       # 三小時前就飛走的不顯示

    def test_opensky(self):
        S = self.S
        S.FLY_SKYS["cache"].clear()
        d = self.get("ap=KHH")                # 愛好者那邊只有桃園附近的飛機
        self.assertTrue(d["ok"], d)
        br = [p for p in d["arr"] if p["fn"] == "BR850"][0]
        self.assertTrue(br["live"])
        self.assertEqual(br["model"], "A330-300")                # OpenSky 沒有機型：用官網的
        self.assertEqual(d["gnd"], [])            # 沒名字的停機不顯示
        self.assertEqual([x[0] for x in d["srcs"]], ["高雄機場官網", "測試", "OpenSky"])
        ci = [p for p in d["arr"] if p["fn"] == "CI840"][0]
        self.assertEqual((ci["org"]["code"], ci["share"], ci["st"]), ("BKK", ["PG4905", "AE5320"], "準時"))
        self.assertEqual([p["st"] for p in d["dep"] if p["fn"] == "UO135"], ["登機"])

    def test_search(self):
        d = self.get("q=")
        self.assertEqual([a["code"] for a in d["pin"]], ["TPE", "TSA", "RMQ", "KHH"])
        self.assertEqual([a["code"] for a in self.get("q=nrt")["list"]], ["TPE", "TSA", "RMQ", "KHH"])   # 只有台灣的機場
        self.S.FLY["cache"].clear()
        self.assertEqual(self.get("ap=NRT")["ap"]["code"], "TPE")                   # 國外機場換成桃園

    def test_fn(self):
        f = self.S.fly_fn
        self.assertEqual([f("CI054"), f("BR015"), f("CI504D"), f("B78690")], ["CI54", "BR15", "CI504D", "B78690"])   # 呼號補的 0 拿掉才對得上官網表

    def test_geo(self):
        d = self.get("geo=TPE")
        self.assertTrue(d["coast"].startswith("M"))                                  # 雷達底圖有海岸線
        self.assertIn("桃園", [t[0] for t in d["towns"]])
        self.assertIn("高雄", [t[0] for t in self.get("geo=KHH")["towns"]])
        self.assertNotIn("高雄", [t[0] for t in d["towns"]])                          # 太遠的地名不放
        self.assertIn("大園", [t[0] for t in d["towns"] if t[3] == 2])               # 放大後才出現的鄉鎮
        self.assertIn("TSA", [a[0] for a in d["aps"]])                               # 附近的機場
        self.assertNotIn("TPE", [a[0] for a in d["aps"]])

    def test_share(self):
        S = self.S
        code, secs = S.share_new()
        self.assertEqual(secs, 3600)
        self.assertFalse(S.share_ok(code + ":"))
        dev, left = S.share_claim(code, "")                         # 第一支手機打開
        self.assertTrue(dev and left > 3500)
        self.assertTrue(S.share_ok(code + ":" + dev))
        self.assertEqual(S.share_claim(code, dev)[0], dev)          # 同一支手機再打開
        self.assertEqual(S.share_claim(code, ""), (None, "這個連結已經在別的手機打開過"))
        self.assertIsNone(S.share_claim(code, "別人的")[0])
        self.assertFalse(S.share_ok(code + ":別人的"))
        self.assertEqual(S.share_claim("fs_亂打", ""), (None, "連結已經失效"))
        d = S.share_load()
        for e in d.values():
            e["exp"] = time.time() - 1                              # 過了一小時
        S.share_save(d)
        self.assertFalse(S.share_ok(code + ":" + dev))

    def test_night(self):
        S, night = self.S, type(self).night
        ap = S.fly_db()["KHH"]
        day = 1793016000 - 1793016000 % 86400
        noon, three = day + 4 * 3600, day + 19 * 3600       # 台灣時間中午 12 點、半夜 3 點
        self.assertFalse(night(ap, noon))
        self.assertTrue(night(ap, three))
        self.assertFalse(night(S.fly_db()["TPE"], three))           # 桃園半夜也有班機
        self.assertFalse(night(S.fly_db()["NRT"], three))

    def test_fids_wait(self):
        """官網表第一次還沒抓到：先回「等一下」，抓到了才一次給全部（不會先秀幾架、等一下又冒出一大堆）"""
        S = self.S
        S.FLY_FIDS.pop("TPE", None)
        S.FLY["cache"].clear()
        old = S.FLY_FIDS_URL["TPE"]
        S.FLY_FIDS_URL["TPE"] = old.rsplit("/", 1)[0] + "/slow"
        try:
            d = self.get("ap=TPE")
            self.assertTrue(d["ok"] and d.get("loading"), d)
            self.assertEqual(d["arr"], [])
            for _ in range(40):
                d = self.get("ap=TPE")
                if not d.get("loading"):
                    break
                time.sleep(.2)
            self.assertFalse(d.get("loading"))
            self.assertTrue(d["fids"] and d["arr"], d)
        finally:
            S.FLY_FIDS_URL["TPE"] = old

    def test_source_down(self):
        S = self.S
        old, S.FLY_SRC = S.FLY_SRC, [("壞掉", "http://127.0.0.1:9/{lat}{lon}{d}", "")]
        sky, S.FLY_SKY = S.FLY_SKY, "http://127.0.0.1:9/{la0}{lo0}{la1}{lo1}"
        S.FLY_SKYS["cache"].clear()
        S.FLY["cache"].clear()
        try:
            d = self.get("ap=RMQ")                # 台中官網也連不上
        finally:
            S.FLY_SRC, S.FLY_SKY = old, sky
            S.FLY_SKYS["until"] = 0
        self.assertFalse(d["ok"])
        self.assertIn("暫時拿不到", d["error"])


if __name__ == "__main__":
    unittest.main()


class Kinds(unittest.TestCase):
    def test_kind(self):
        from test_passkey import load_sentinel
        k = load_sentinel().fly_kind
        for t, m, c, want in [("B77W", "", "", "wb"), ("A388", "", "", "q4"), ("A21N", "", "", "nb"), ("AT76", "", "", "tp"),
                              ("EC35", "", "", "heli"), ("C172", "", "", "ga"), ("", "B777-300", "", "wb"), ("", "ATR72", "", "tp"),
                              ("", "", "A7", "heli"), ("ZZZZ", "", "", "")]:
            self.assertEqual(k(t, m, c), want, (t, m, c))
