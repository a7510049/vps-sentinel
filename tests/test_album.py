"""相簿分享：選資料夾、做連結、相機資訊和地點、密碼、拿掉定位、打包下載、收回。只用 Python 內建模組。"""
import base64
import http.client
import io
import json
import os
import shutil
import struct
import tempfile
import time
import unittest
import urllib.parse
import zipfile

from seal_util import seal_mod
from test_smoke import TOKEN, Server

# 8×6 的小 JPEG（ffmpeg 做的），測試時在前面塞自己寫的 EXIF
JPG = base64.b64decode("/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/"
                       "xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABQYQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAAGAAgDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCdAVQB/9k=")


def tiff(ifd0, exif, gps):
    """小端序 TIFF：IFD0（帶 Exif、GPS 的指標）、Exif、GPS 三組"""
    out = bytearray(b"II*\x00\x08\x00\x00\x00")

    def put(entries, at):
        """回傳 (IFD 那一段, 放在後面的值)"""
        n = len(entries)
        head = bytearray(struct.pack("<H", n))
        data = bytearray()
        vat = at + 2 + n * 12 + 4
        for tag, typ, val in sorted(entries, key=lambda e: e[0]):
            if typ == 2:
                raw = val.encode() + b"\x00"
                cnt = len(raw)
            elif typ == 3:
                raw, cnt = struct.pack("<H", val), 1
            elif typ == 4:
                raw, cnt = struct.pack("<I", val), 1
            elif typ == 5:
                vs = val if isinstance(val, list) else [val]
                raw, cnt = b"".join(struct.pack("<II", *v) for v in vs), len(vs)
            elif typ == 1:
                raw, cnt = bytes(val), len(val)
            if len(raw) <= 4:
                head += struct.pack("<HHI", tag, typ, cnt) + raw.ljust(4, b"\x00")
            else:
                head += struct.pack("<HHII", tag, typ, cnt, vat + len(data))
                data += raw + (b"\x00" if len(raw) % 2 else b"")
        head += b"\x00\x00\x00\x00"
        return head, data

    # 先算各段的位置：IFD0 → Exif → GPS
    p0 = 8
    h0, d0 = put(ifd0 + [(0x8769, 4, 0), (0x8825, 4, 0)], p0)
    pe = p0 + len(h0) + len(d0)
    he, de = put(exif, pe)
    pg = pe + len(he) + len(de)
    h0, d0 = put(ifd0 + [(0x8769, 4, pe), (0x8825, 4, pg)], p0)
    hg, dg = put(gps, pg)
    out += h0 + d0 + he + de + hg + dg
    return bytes(out)


def photo(ori=1, gps=True, dt="2026:11:03 14:22:10"):
    t = tiff([(0x010F, 2, "Apple"), (0x0110, 2, "iPhone 15 Pro"), (0x0112, 3, ori), (0x0131, 2, "18.1")],
             [(0x829A, 5, (1, 120)), (0x829D, 5, (178, 100)), (0x8827, 3, 50), (0x9003, 2, dt), (0x9011, 2, "+08:00"),
              (0x920A, 5, (6765, 1000)), (0xA405, 3, 24), (0xA434, 2, "iPhone 15 Pro back triple camera 6.765mm f/1.78")],
             [(1, 2, "N"), (2, 5, [(25, 1), (2, 1), (2400, 100)]), (3, 2, "E"), (4, 5, [(121, 1), (33, 1), (4200, 100)]),
              (5, 1, [0]), (6, 5, (35, 1))] if gps else [])
    app1 = b"Exif\x00\x00" + t
    return JPG[:2] + b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1 + JPG[2:]


ROOT_DIR = tempfile.mkdtemp()
os.makedirs(os.path.join(ROOT_DIR, "旅行", "台北"))
os.makedirs(os.path.join(ROOT_DIR, "空的"))
for i in range(3):
    with open(os.path.join(ROOT_DIR, "旅行", "台北", f"IMG_{i}.jpg"), "wb") as f:
        f.write(photo(ori=6 if i == 1 else 1, dt=f"2026:11:0{3 + i} 1{i}:00:00"))
with open(os.path.join(ROOT_DIR, "旅行", "台北", "說明.txt"), "w") as f:
    f.write("不是照片")


class Album(Server):
    ENV = {"SENTINEL_ALB_DIR": ROOT_DIR, "SENTINEL_ALB_GEO": "http://127.0.0.1:9/none", "SENTINEL_ALB_WX": "http://127.0.0.1:9/none", "SENTINEL_ALB_WX2": "http://127.0.0.1:9/none", "SENTINEL_ALB_FF": "none",
           "SENTINEL_ALB_TILE": "http://127.0.0.1:9/{z}/{x}/{y}.png"}

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(ROOT_DIR, ignore_errors=True)

    def req(self, method, path, body=None, hdr=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=20)
        c.request(method, path, body=json.dumps(body).encode() if isinstance(body, dict) else body, headers=hdr or {})
        r = c.getresponse()
        out = r.status, r.read(), dict(r.getheaders())
        c.close()
        return out

    def call(self, body):
        s, b, _ = self.req("POST", "/api/album", body, {"X-Token": TOKEN, "Content-Type": "application/json"})
        return s, json.loads(b)

    def test_1_flow(self):
        self.assertEqual(self.req("POST", "/api/album", {"action": "list"})[0], 401)        # 要登入
        s, d = self.call({"action": "folders", "dir": ""})
        self.assertEqual(s, 200, d)
        self.assertEqual({x["name"]: x["sub"] for x in d["subs"]}, {"旅行": True, "空的": False})
        s, d = self.call({"action": "folders", "dir": "旅行/台北"})
        self.assertEqual(d["n"], 3)
        self.assertEqual(self.call({"action": "folders", "dir": "../.."})[0], 400)      # 不能跑出雲端硬碟
        self.assertEqual(self.call({"action": "add", "dir": "空的"})[0], 400)
        s, d = self.call({"action": "add", "dir": "旅行/台北", "name": "台北一日遊", "secs": 86400})
        self.assertEqual(s, 200, d)
        a = next(x for x in d["list"] if x["id"] == d["id"])
        self.assertEqual((a["name"], a["n"], a["pw"]), ("台北一日遊", 3, False))
        code = a["code"]
        self.assertRegex(code, r"^[A-Za-z0-9]{10}$")
        with open(os.path.join(self.tmp.name, "data", "albums.json"), "rb") as f:
            self.assertNotIn(code.encode(), f.read())                                  # 清單加密存

        s, b, h = self.req("GET", f"/a/{code}")
        self.assertEqual(s, 200)
        self.assertIn("Content-Security-Policy", h)
        self.assertIn('og:title" content="台北一日遊"', b.decode())                    # 傳到聊天室：預覽有相簿名稱、相簿自己的圖示
        self.assertRegex(b.decode(), r'og:image" content="http://127\.0\.0\.1:\d+/a/icon-512\.png')
        for u, ct in (("/a/icon.svg", "image/svg+xml"), ("/a/icon-180.png", "image/png"), ("/a/icon-512.png", "image/png")):
            s2, b2, h2 = self.req("GET", u)
            self.assertEqual((s2, h2.get("Content-Type", "").split(";")[0]), (200, ct))
        s, b, _ = self.req("GET", f"/a/{code}/m")
        m = json.loads(b)
        self.assertEqual(m["name"], "台北一日遊")
        self.assertEqual([p["n"] for p in m["photos"]], ["IMG_0.jpg", "IMG_1.jpg", "IMG_2.jpg"])   # 照拍攝時間排
        p0, p1 = m["photos"][0], m["photos"][1]
        self.assertEqual((p0["w"], p0["h"]), (8, 6))
        self.assertEqual((p1["w"], p1["h"]), (6, 8))                                   # 轉 90 度的照片寬高對調
        x = p0["x"]
        self.assertEqual((x["mk"], x["md"], x["iso"], x["f"], x["et"], x["f35"], x["dt"], x["oz"]),
                         ("Apple", "iPhone 15 Pro", 50, 1.78, [1, 120], 24, "2026:11:03 10:00:00", "+08:00"))
        self.assertIn("triple camera", x["ln"])
        self.assertAlmostEqual(p0["g"][0], 25 + 2 / 60 + 24 / 3600, places=4)
        self.assertAlmostEqual(p0["g"][1], 121 + 33 / 60 + 42 / 3600, places=4)
        self.assertEqual(p0["g"][2], 35)
        if p0.get("p"):                                                                # 地名查不到時用最近的機場城市，帶國家給城市分類
            self.assertTrue(p0["p"]["c"])
            self.assertEqual(p0["p"]["cc"], "TW")
        self.assertEqual(self.req("GET", "/a/AAAAAAAAAA/m")[0], 404)

        # 沒有 ffmpeg：瀏覽器看得了的原圖直接給；看的照片一律加密送出，直接抓網址拿到的是亂碼
        s, b, h = self.req("GET", f"/a/{code}")
        self.assertEqual(s, 200)
        self.assertIn("default-src 'none'", h.get("Content-Security-Policy", ""))
        self.assertNotIn("https:", h.get("Content-Security-Policy", ""))
        s, b, h = self.req("GET", f"/a/{code}/i/{p0['i']}/s")
        self.assertEqual(s, 200)
        self.assertNotEqual(b[:2], b"\xff\xd8")
        self.assertEqual((h["Content-Type"], h["X-Alb-T"]), ("application/octet-stream", "image/jpeg"))
        self.assertTrue(h["X-Alb-E"].startswith("0-"))
        self.assertEqual(self.req("GET", f"/a/{code}/k", hdr={"Sec-Fetch-Dest": "document", "Sec-Fetch-Site": "none"})[0], 403)
        k = json.loads(self.req("GET", f"/a/{code}/k", hdr={"Sec-Fetch-Site": "same-origin"})[1])
        self.assertEqual(k["id"], h["X-Alb-E"])
        g = seal_mod(self.conf)
        self.assertTrue(g["_seal_lib"]())
        aad = f"/a/{code}/i/{p0['i']}/s".encode()
        plain = g["_gcm"](True, base64.b64decode(k["k"]), b[:12], b[12:], aad)
        self.assertEqual(plain[:2], b"\xff\xd8")
        # 一般瀏覽器或下載工具傳 ?pl=1 不能繞過加密
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=20)
        c.request("GET", f"/a/{code}/m?pl=1", headers={"User-Agent": "Mozilla/5.0 Chrome/130.0"})
        r = c.getresponse()
        r.read()
        ck_chr = "; ".join(x.split(";")[0] for x in r.msg.get_all("Set-Cookie"))
        c.close()
        self.assertNotIn("vsap_", ck_chr)
        s, b, h = self.req("GET", f"/a/{code}/i/{p0['i']}/s", hdr={"Cookie": ck_chr, "User-Agent": "Mozilla/5.0 Chrome/130.0"})
        self.assertEqual(h["Content-Type"], "application/octet-stream")
        # 只有 LINE 等內建瀏覽器才允許 ?pl=1 降級為一般圖片；且把 cookie 搬去一般瀏覽器依然加密
        line_ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Line/14.12.0"
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=20)
        c.request("GET", f"/a/{code}/m?pl=1", headers={"User-Agent": line_ua})
        r = c.getresponse()
        r.read()
        ck = "; ".join(x.split(";")[0] for x in r.msg.get_all("Set-Cookie"))
        c.close()
        self.assertIn("vsap_", ck)
        s, b, h = self.req("GET", f"/a/{code}/i/{p0['i']}/s", hdr={"Cookie": ck, "User-Agent": line_ua})
        self.assertEqual((b[:2], h["Content-Type"]), (b"\xff\xd8", "image/jpeg"))
        s, b, h = self.req("GET", f"/a/{code}/i/{p0['i']}/s", hdr={"Cookie": ck, "User-Agent": "Mozilla/5.0 Chrome/130.0"})
        self.assertEqual(h["Content-Type"], "application/octet-stream")
        k2 = json.loads(self.req("GET", f"/a/{code}/k", hdr={"Cookie": ck, "Sec-Fetch-Site": "same-origin"})[1])
        self.assertNotEqual(k2["k"], k["k"])                                             # 每支手機的鑰匙不一樣
        s, b, h = self.req("GET", f"/a/{code}/i/{p0['i']}/o")
        self.assertIn("attachment", h["Content-Disposition"])
        with open(os.path.join(ROOT_DIR, "旅行", "台北", "IMG_0.jpg"), "rb") as f:
            self.assertEqual(b, f.read())                                              # 顯示地點：原圖原封不動

        # 藏起地點：清單沒有座標，下載的原圖定位清成 0（大小不變）
        self.assertEqual(self.call({"action": "edit", "id": a["id"], "loc": False})[0], 200)
        m = json.loads(self.req("GET", f"/a/{code}/m")[1])
        self.assertNotIn("g", m["photos"][0])
        s, b, _ = self.req("GET", f"/a/{code}/i/{p0['i']}/o")
        self.assertEqual(len(b), len(photo(dt="2026:11:03 10:00:00")))
        self.assertNotIn(struct.pack("<II", 2400, 100), b)                              # 秒數那個分數不見了
        self.assertIn(b"iPhone 15 Pro", b)                                             # 相機資訊留著
        s, b, _ = self.req("GET", f"/a/{code}/zip")
        z = zipfile.ZipFile(io.BytesIO(b))
        self.assertEqual(sorted(z.namelist()), ["IMG_0.jpg", "IMG_1.jpg", "IMG_2.jpg"])
        self.assertNotIn(struct.pack("<II", 4200, 100), z.read("IMG_2.jpg"))

        # 不能下載
        self.call({"action": "edit", "id": a["id"], "dl": False})
        self.assertEqual(self.req("GET", f"/a/{code}/i/{p0['i']}/o")[0], 403)
        self.assertEqual(self.req("GET", f"/a/{code}/zip")[0], 403)

        # 密碼：輸對才拿得到通行證（只給這本的路徑），錯太多次先鎖住
        self.call({"action": "edit", "id": a["id"], "pw": "abcd1234"})
        self.assertEqual(self.req("GET", f"/a/{code}/m")[0], 401)
        self.assertNotIn("台北一日遊", self.req("GET", f"/a/{code}")[1].decode())         # 有密碼的預覽不露出名稱
        self.assertEqual(self.req("GET", f"/a/{code}/i/{p0['i']}/s")[0], 401)
        s, b, h = self.req("POST", f"/a/{code}/open", {"pw": "abcd1234"}, {"X-Forwarded-For": "1.2.3.4"})
        self.assertEqual(s, 200)
        ck = h["Set-Cookie"]
        self.assertIn(f"Path=/a/{code}", ck)
        self.assertIn("HttpOnly", ck)
        cookie = ck.split(";")[0]
        self.assertEqual(self.req("GET", f"/a/{code}/m", hdr={"Cookie": cookie})[0], 200)
        self.assertEqual(self.req("GET", f"/a/{code}/m", hdr={"Cookie": cookie[:-3] + "xyz"})[0], 401)
        codes = [self.req("POST", f"/a/{code}/open", {"pw": "nope"})[0] for _ in range(6)]
        self.assertEqual(codes[:5], [401] * 5)
        self.assertEqual(codes[5], 429)
        self.call({"action": "edit", "id": a["id"], "pw": "zzzz9999"})                   # 換密碼：之前的通行證失效
        self.assertEqual(self.req("GET", f"/a/{code}/m", hdr={"Cookie": cookie})[0], 401)

        # 收回：連結立刻打不開
        s, d = self.call({"action": "del", "id": a["id"]})
        self.assertEqual(s, 200)
        self.assertEqual(self.req("GET", f"/a/{code}/m")[0], 404)
        self.assertEqual(self.call({"action": "list"})[1]["list"], [])

    def test_2_perms(self):
        """限定手機數、踢掉、挑照片、不給下載、主人預覽、地圖圖塊連不到"""
        s, d = self.call({"action": "add", "dir": "旅行/台北", "dev": 1, "dl": 0})
        a = next(x for x in d["list"] if x["id"] == d["id"])
        code, aid = a["code"], a["id"]
        self.assertEqual((a["dev"], a["dl"]), (1, 0))
        s, _, h = self.req("GET", f"/a/{code}/m", hdr={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"})
        self.assertEqual(s, 200)
        ck = h["Set-Cookie"].split(";")[0]
        self.assertTrue(ck.startswith(f"vsad_{aid}="))
        self.assertIn("HttpOnly", h["Set-Cookie"])
        s, b, _ = self.req("GET", f"/a/{code}/m")                                       # 第二支：名額滿了
        self.assertEqual((s, json.loads(b).get("full")), (403, True))
        s, b, _ = self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})
        m = json.loads(b)
        pid = m["photos"][0]["i"]
        self.assertEqual(self.req("GET", f"/a/{code}/i/{pid}/s")[0], 403)               # 沒登記的手機拿不到照片
        self.assertEqual(self.req("GET", f"/a/{code}/i/{pid}/o", hdr={"Cookie": ck})[0], 403)   # 不給下載就沒有原圖
        self.assertEqual(self.req("GET", f"/a/{code}/zip", hdr={"Cookie": ck})[0], 403)

        s, d = self.call({"action": "devs", "id": aid})
        self.assertEqual([x["n"] for x in d["devs"]], ["iPhone"])
        self.call({"action": "edit", "id": aid, "hide": [pid]})                          # 挑照片：藏起第一張
        s, b, _ = self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})
        self.assertNotIn(pid, [p["i"] for p in json.loads(b)["photos"]])
        s, d = self.call({"action": "photos", "id": aid})
        self.assertEqual([p["hid"] for p in d["photos"]], [True, False, False])
        own = d["own"]
        self.assertEqual(self.req("GET", f"/a/{code}/i/{pid}/o?own={own}")[0], 403)      # 主人預覽也只看不能拿原圖
        self.assertEqual(self.req("GET", f"/a/{code}/i/{pid}/s?own=x.y")[0], 403)

        self.call({"action": "edit", "id": aid, "kick": self.call({"action": "devs", "id": aid})[1]["devs"][0]["h"]})
        s, b, _ = self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})                   # 踢掉：這支再也打不開
        self.assertEqual((s, json.loads(b).get("ban")), (403, True))
        s, _, h = self.req("GET", f"/a/{code}/m")                                       # 名額空出來給別支
        self.assertEqual(s, 200)
        ck2 = h["Set-Cookie"].split(";")[0]
        self.assertEqual(self.req("GET", f"/a/{code}/t/3/6/3", hdr={"Cookie": ck2})[0], 404)                 # 地圖圖塊連不到
        self.assertFalse(json.loads(self.req("POST", f"/a/{code}/snap", hdr={"Cookie": ck2})[1])["lock"])   # 沒開「截圖就鎖住」：不鎖
        self.call({"action": "edit", "id": aid, "snap": True})
        self.assertTrue(json.loads(self.req("POST", f"/a/{code}/snap", hdr={"Cookie": ck2})[1])["lock"])
        s, b, _ = self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck2})
        self.assertEqual((s, json.loads(b).get("lock")), (403, True))
        self.assertEqual(self.req("GET", f"/a/{code}/i/{pid}/s", hdr={"Cookie": ck2})[0], 403)     # 照片也拿不到
        d = self.call({"action": "devs", "id": aid})[1]["devs"]
        self.assertTrue(d[0].get("lk"))
        self.call({"action": "edit", "id": aid, "unlock": d[0]["h"]})                    # 主人解除
        self.assertEqual(self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck2})[0], 200)
        self.call({"action": "del", "id": aid})


    def test_3_talk(self):
        """朋友按愛心、留言、刪自己的；主人看得到、刪得掉；關掉就不能留"""
        s, d = self.call({"action": "add", "dir": "旅行/台北"})
        a = next(x for x in d["list"] if x["id"] == d["id"])
        code, aid = a["code"], a["id"]
        s, b, h = self.req("GET", f"/a/{code}/m")
        ck = h["Set-Cookie"].split(";")[0]
        pid = json.loads(b)["photos"][0]["i"]
        post = lambda body, c=ck: self.req("POST", f"/a/{code}/talk", body, {"Cookie": c, "Content-Type": "application/json"} if c else {})
        self.assertEqual(post({"i": pid, "like": True}, "")[0], 403)                   # 沒打開過相簿的不能按
        s, b, _ = post({"i": pid, "like": True})
        self.assertEqual((s, json.loads(b)["lk"], json.loads(b)["me"]), (200, 1, True))
        self.assertEqual(post({"i": pid, "s": "好看", "n": ""})[0], 400)                 # 要寫名字
        for bad in ("看這裡 https://evil.com", "去 evil . com", "javascript:alert(1)", "www.x.tw"):
            self.assertEqual(post({"i": pid, "s": bad, "n": "小明"})[0], 400)            # 留言不能放連結
        self.assertEqual(post({"i": pid, "s": "好看", "n": "bit.ly/x"})[0], 400)
        s, b, _ = post({"i": pid, "s": "好看\u202e<script>", "n": "小明"})
        c = json.loads(b)["cm"][0]
        self.assertEqual((c["n"], c["s"], c["me"]), ("小明", "好看 <script>", True))
        self.assertEqual(post({"i": pid, "s": "再一則", "n": "小明"})[0], 429)            # 太快
        time.sleep(3.1)
        s, b, _ = post({"i": pid, "s": "同意", "n": "小明", "re": c["id"]})          # 回覆那一則
        self.assertEqual(json.loads(b)["cm"][-1].get("r"), c["id"])
        time.sleep(3.1)
        s, b, _ = post({"i": pid, "s": "再回", "n": "小明", "re": json.loads(b)["cm"][-1]["id"]})   # 回覆回覆：掛在同一串
        self.assertEqual(json.loads(b)["cm"][-1].get("r"), c["id"])
        s, b, _ = post({"i": pid, "rx": "😂"})                                         # 其他表情：一支手機一個
        self.assertEqual((s, json.loads(b)["rx"], json.loads(b)["mr"]), (200, {"😂": 1}, "😂"))
        s, b, _ = post({"i": pid, "rx": "👍"})                                         # 換一個
        self.assertEqual((json.loads(b)["rx"], json.loads(b)["mr"]), ({"👍": 1}, "👍"))
        s, b, _ = post({"i": pid, "rx": "💩"})                                         # 不認得的：當成拿掉
        self.assertEqual((json.loads(b)["rx"], json.loads(b)["mr"]), ({}, ""))
        post({"i": pid, "rx": "🥹"})
        s, b, _ = self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})
        p = json.loads(b)["photos"][0]
        self.assertEqual((p["lk"], p["me"], len(p["cm"])), (1, True, 3))
        self.assertEqual((p["rx"], p["mr"], p["lk"]), ({"🥹": 1}, "🥹", 1))
        s, b, _ = self.req("GET", f"/a/{code}/m")                                       # 別支手機：看得到，但不是自己的
        p = json.loads(b)["photos"][0]
        self.assertEqual((p["me"], p["cm"][0]["me"]), (False, False))
        s, t = self.call({"action": "talk", "id": aid})
        self.assertEqual(([x["s"] for x in t["c"]], t["likes"][0]["n"]), (["再回", "同意", "好看 <script>"], 1))
        self.assertEqual(next(x for x in self.call({"action": "devs", "id": aid})[1]["devs"] if x.get("nm"))["nm"], "小明")
        s, t = self.call({"action": "talkdel", "id": aid, "i": pid, "cid": c["id"]})
        self.assertEqual([x["s"] for x in t["c"]], ["再回", "同意"])                  # 回覆留著
        self.assertEqual(json.loads(self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})[1])["photos"][0]["lkn"], ["小明"])   # 誰按了愛心
        self.assertEqual(post({"i": "_gb", "like": True})[0], 400)                    # 留言簿只能留言
        time.sleep(3.1)
        s, b, _ = post({"i": "_gb", "s": "謝謝分享", "n": "小明"})
        self.assertEqual((s, json.loads(b)["cm"][0]["s"]), (200, "謝謝分享"))
        m = json.loads(self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})[1])
        self.assertEqual((m["gb"][0]["s"], m["gb"][0]["me"]), ("謝謝分享", True))
        self.assertNotIn("d", m["gb"][0])                                              # 不給手機的代號
        self.assertEqual(json.loads(self.req("GET", f"/a/{code}/m")[1])["gb"][0]["me"], False)
        s, t = self.call({"action": "talk", "id": aid})
        self.assertTrue(any(x.get("gb") and x["s"] == "謝謝分享" for x in t["c"]))
        s, d = self.call({"action": "edit", "id": aid, "intro": "看 www.x.tw"})        # 介紹不能放連結
        self.assertFalse(d.get("ok", s == 200))
        s, d = self.call({"action": "edit", "id": aid, "intro": " 第一行\n\n\n\n第二行\u202e "})
        self.assertEqual(next(x for x in d["list"] if x["id"] == aid)["intro"], "第一行\n\n第二行")
        self.assertEqual(json.loads(self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})[1])["intro"], "第一行\n\n第二行")
        for _ in range(61):                                                            # 看過的手機記滿了：剛打開的這支不能被擠掉
            h = self.req("GET", f"/a/{code}/m")[2]
        self.assertEqual(post({"i": "_gb", "s": "最後一支", "n": "阿華"}, h["Set-Cookie"].split(";")[0])[0], 200)
        self.assertIn("阿華", [x.get("nm") for x in self.call({"action": "devs", "id": aid})[1]["devs"]])
        self.call({"action": "edit", "id": aid, "talk": False})
        self.assertEqual(post({"i": pid, "like": False})[0], 403)
        with open(os.path.join(self.tmp.name, "data", "album-talk.json"), "rb") as f:
            self.assertEqual(f.read(4), b"VSE1")
        self.call({"action": "del", "id": aid})


    def test_4_upload(self):
        """朋友上傳：沒開不能放、要確認的先藏起來、主人確認／刪掉、朋友刪自己的；勾選下載只打包選到的"""
        s, d = self.call({"action": "add", "dir": "旅行/台北"})
        a = next(x for x in d["list"] if x["id"] == d["id"])
        code, aid = a["code"], a["id"]
        self.assertEqual(a["up"], 0)
        s, b, h = self.req("GET", f"/a/{code}/m")
        ck = h["Set-Cookie"].split(";")[0]
        pids = [p["i"] for p in json.loads(b)["photos"]]
        up = lambda name, body, c=ck, who="小美": self.req("POST", f"/a/{code}/up?n={urllib.parse.quote(name)}&w={urllib.parse.quote(who)}", body, {"Cookie": c} if c else {})
        self.assertEqual(up("a.jpg", photo())[0], 403)                                 # 沒開放
        self.call({"action": "edit", "id": aid, "up": 1})
        self.assertEqual(up("a.jpg", photo(), "")[0], 403)                             # 沒打開過相簿
        self.assertEqual(up("a.jpg", photo(), who="")[0], 400)                         # 要寫名字
        self.assertEqual(up("a.txt", b"hello")[0], 415)                                # 不是照片
        self.assertEqual(up("a.jpg", b"<html>not a photo</html>")[0], 415)             # 副檔名騙人
        bomb = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", 20000, 20000) + b"\x08\x02\x00\x00\x00" + b"\x00" * 64
        self.assertEqual(up("b.png", bomb)[0], 415)                                    # 炸彈圖（4 億像素）
        self.assertFalse(os.path.exists(os.path.join(ROOT_DIR, "旅行", "台北", "朋友放的", "小美", "b.png")))
        self.assertEqual(up("IMG_0.jpg", photo(dt="2026:11:09 10:00:00"))[0], 200)      # 放進「朋友放的／小美」
        self.assertEqual(up("IMG_0.jpg", photo(dt="2026:11:09 10:00:00"))[0], 200)      # 同名：不蓋掉
        mine = os.path.join(ROOT_DIR, "旅行", "台北", "朋友放的", "小美")
        names = sorted(os.listdir(mine))
        self.assertEqual(names, ["IMG_0 (2).jpg", "IMG_0.jpg"])
        self.assertIn("IMG_0.jpg", os.listdir(os.path.join(ROOT_DIR, "旅行", "台北")))    # 主人原本的還在
        s, b, h3 = self.req("GET", f"/a/{code}/m")                                     # 別支手機也叫小美：分開一個資料夾
        ck3 = h3["Set-Cookie"].split(";")[0]
        self.assertEqual(up("z.jpg", photo(), ck3)[0], 200)
        self.assertTrue(os.path.isfile(os.path.join(ROOT_DIR, "旅行", "台北", "朋友放的", "小美 2", "z.jpg")))
        s, b, _ = self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})
        m = json.loads(b)
        self.assertEqual((m["up"], len(m["photos"])), (1, 3))                         # 等主人確認：還看不到
        s, d = self.call({"action": "photos", "id": aid})
        self.assertEqual(sum(1 for p in d["photos"] if p["pend"]), 3)
        keep = next(p["i"] for p in d["photos"] if p["pend"] and p["u"] == "小美")
        self.call({"action": "edit", "id": aid, "noup": [p["i"] for p in d["photos"] if p["pend"] and p["i"] != keep]})
        self.assertFalse(os.path.exists(os.path.join(ROOT_DIR, "旅行", "台北", "朋友放的", "小美 2")))   # 空了的資料夾拿掉
        s, d = self.call({"action": "photos", "id": aid})
        new = next(p for p in d["photos"] if p["pend"])
        self.assertEqual(new["ub"], "小美")
        self.assertEqual(next(x for x in self.call({"action": "edit", "id": aid})[1]["list"] if x["id"] == aid)["npend"], 1)
        self.assertEqual(self.req("GET", f"/a/{code}/i/{new['i']}/s", hdr={"Cookie": ck})[0], 404)
        self.call({"action": "edit", "id": aid, "okup": [new["i"]]})                    # 主人確認
        s, b, _ = self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})
        p = next(x for x in json.loads(b)["photos"] if x["i"] == new["i"])
        self.assertEqual((p["ub"], p.get("um"), p["u"]), ("小美", 1, "小美"))
        self.assertNotIn("u", next(x for x in json.loads(b)["photos"] if x["i"] == pids[0]))
        self.assertNotIn("g", p)                                                        # 朋友放的照片不給別人看到定位
        self.assertIn("g", next(x for x in json.loads(b)["photos"] if x["i"] == pids[0]))
        s, b, h2 = self.req("GET", f"/a/{code}/m")                                     # 別支手機：看得到誰放的，但不能刪
        ck2 = h2["Set-Cookie"].split(";")[0]
        self.assertNotIn("um", next(x for x in json.loads(b)["photos"] if x["i"] == new["i"]))
        dl = lambda pid, c: self.req("POST", f"/a/{code}/up", {"del": pid}, {"Cookie": c, "Content-Type": "application/json"})
        self.assertEqual(dl(new["i"], ck2)[0], 403)
        self.assertEqual(dl(pids[0], ck)[0], 403)                                       # 主人原本的不能刪
        self.call({"action": "edit", "id": aid, "up": 2})                               # 直接放上去
        s, b, _ = up("b.jpg", photo())
        b2 = json.loads(b)
        self.assertFalse(b2["pend"])
        s, b, _ = self.req("GET", f"/a/{code}/m", hdr={"Cookie": ck})
        self.assertIn(b2["i"], [x["i"] for x in json.loads(b)["photos"]])
        self.assertEqual(dl(new["i"], ck)[0], 200)                                      # 刪自己的
        self.assertEqual(os.listdir(mine), ["b.jpg"])
        self.call({"action": "edit", "id": aid, "up": 1})
        s, b, _ = up("c.jpg", photo())
        self.call({"action": "edit", "id": aid, "noup": [json.loads(b)["i"], pids[1]]})  # 主人不要：刪檔（原本的不會被刪）
        self.assertNotIn("c.jpg", os.listdir(mine))
        self.assertIn("IMG_1.jpg", os.listdir(os.path.join(ROOT_DIR, "旅行", "台北")))
        s, b, _ = self.req("GET", f"/a/{code}/zip?ids={pids[0]},{pids[2]}", hdr={"Cookie": ck})   # 勾選下載
        self.assertEqual(sorted(zipfile.ZipFile(io.BytesIO(b)).namelist()), ["IMG_0.jpg", "IMG_2.jpg"])
        self.assertEqual(self.req("GET", f"/a/{code}/zip?ids=zz", hdr={"Cookie": ck})[0], 400)
        shutil.rmtree(os.path.join(ROOT_DIR, "旅行", "台北", "朋友放的"))
        self.call({"action": "del", "id": aid})


@unittest.skipUnless(shutil.which("ffmpeg"), "沒有 ffmpeg")
class AlbumThumbs(Server):
    ENV = {"SENTINEL_ALB_E": "0", "SENTINEL_ALB_DIR": ROOT_DIR + "-t", "SENTINEL_ALB_GEO": "http://127.0.0.1:9/none", "SENTINEL_ALB_WX": "http://127.0.0.1:9/none", "SENTINEL_ALB_WX2": "http://127.0.0.1:9/none"}

    @classmethod
    def setUpClass(cls):
        os.makedirs(os.path.join(ROOT_DIR + "-t", "相簿"), exist_ok=True)
        import subprocess
        p = os.path.join(ROOT_DIR + "-t", "相簿", "big.jpg")
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=3000x2000", "-frames:v", "1", "-y", p], check=True)
        with open(p, "rb") as f:
            b = f.read()
        with open(p, "wb") as f:                       # 轉 90 度
            t = tiff([(0x0112, 3, 6)], [], [])
            app1 = b"Exif\x00\x00" + t
            f.write(b[:2] + b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1 + b[2:])
        d = os.path.join(ROOT_DIR + "-t", "影片")
        os.makedirs(d, exist_ok=True)
        ff = ["ffmpeg", "-v", "error", "-y"]
        subprocess.run([*ff, "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=25:d=4", "-f", "lavfi", "-i", "sine=d=4", "-c:v", "libx264", "-c:a", "aac", "-shortest",
                        "-metadata", "location=+25.0330+121.5654/", "-metadata", "creation_time=2026-11-03T06:00:00Z", os.path.join(d, "VID_1.mov")], check=True)
        subprocess.run([*ff, "-f", "lavfi", "-i", "testsrc2=s=640x480", "-frames:v", "1", os.path.join(d, "IMG_2.jpg")], check=True)
        subprocess.run([*ff, "-f", "lavfi", "-i", "testsrc2=s=640x480:r=25:d=2", "-c:v", "libx264", os.path.join(d, "IMG_2.mov")], check=True)
        subprocess.run([*ff, "-f", "lavfi", "-i", "sine=d=2", os.path.join(d, "歌.mp3")], check=True)
        d = os.path.join(ROOT_DIR + "-t", "動圖")
        os.makedirs(d, exist_ok=True)
        src = ["-f", "lavfi", "-i", "testsrc2=s=160x120:r=10:d=1"]
        subprocess.run([*ff, *src, "-loop", "0", os.path.join(d, "a.gif")], check=True)
        subprocess.run([*ff, *src, "-plays", "0", "-f", "apng", os.path.join(d, "b.png")], check=True)
        subprocess.run([*ff, *src, "-loop", "0", "-c:v", "libwebp", "-f", "webp", os.path.join(d, "c.webp")], check=True)
        subprocess.run([*ff, *src, "-frames:v", "1", os.path.join(d, "d.gif")], check=True)
        d = os.path.join(ROOT_DIR + "-t", "智慧")
        os.makedirs(d, exist_ok=True)
        subprocess.run([*ff, "-f", "lavfi", "-i", "testsrc2=s=1600x1200", "-frames:v", "1", os.path.join(d, "a.jpg")], check=True)
        subprocess.run([*ff, "-f", "lavfi", "-i", "testsrc2=s=1600x1200", "-frames:v", "1", "-vf", "gblur=sigma=8", os.path.join(d, "b.jpg")], check=True)
        subprocess.run([*ff, "-f", "lavfi", "-i", "testsrc2=s=1600x1200", "-frames:v", "1", "-vf", "eq=brightness=-0.45", os.path.join(d, "c.jpg")], check=True)
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(ROOT_DIR + "-t", ignore_errors=True)

    def test_smart(self):
        """主機替每張打分數：清楚、曝光正常的比拍糊、太暗的高；長得像的指紋只差幾格"""
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        c.request("POST", "/api/album", body=json.dumps({"action": "add", "dir": "智慧"}), headers={"X-Token": TOKEN})
        code = next(x for x in json.loads(c.getresponse().read())["list"] if x["dir"] == "智慧")["code"]
        deadline, ps = time.time() + 40, {}
        while time.time() < deadline:
            c.request("GET", f"/a/{code}/m")
            ps = {p["n"]: p for p in json.loads(c.getresponse().read())["photos"]}
            if len(ps) == 3 and all("qs" in p for p in ps.values()):
                break
            time.sleep(0.5)
        else:
            self.fail(f"分數沒有算出來：{ps}")
        a, b, k = ps["a.jpg"], ps["b.jpg"], ps["c.jpg"]
        self.assertGreater(a["qs"], b["qs"] + 10)                                     # 拍糊的分數低
        self.assertGreater(a["qs"], k["qs"] + 10)                                     # 太暗的分數低
        ham = bin(int(a["dh"], 16) ^ int(b["dh"], 16)).count("1")
        self.assertLessEqual(ham, 10)                                                  # 同一個畫面：指紋幾乎一樣
        self.assertTrue(any(f.endswith("-a.json") for f in os.listdir(os.path.join(self.tmp.name, "data", "album-cache"))))

    def test_thumbs(self):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        c.request("POST", "/api/album", body=json.dumps({"action": "add", "dir": "相簿"}), headers={"X-Token": TOKEN})
        d = json.loads(c.getresponse().read())
        code = d["list"][0]["code"]
        c.request("GET", f"/a/{code}/m")
        m = json.loads(c.getresponse().read())
        p = m["photos"][0]
        self.assertEqual((p["w"], p["h"]), (2000, 3000))
        sizes = {}
        for k in "sl":
            c.request("GET", f"/a/{code}/i/{p['i']}/{k}")
            r = c.getresponse()
            b = r.read()
            self.assertEqual(r.status, 200)
            i = b.index(b"\xff\xc0")
            h, w = struct.unpack(">HH", b[i + 5:i + 9])
            sizes[k] = (w, h)
            self.assertNotIn(b"Exif", b[:200])                                         # 小圖不帶任何 EXIF
        self.assertEqual(sizes["s"][1], 480)
        self.assertLess(sizes["s"][0], sizes["s"][1])                                  # 轉正了（直的）
        self.assertEqual(max(sizes["l"]), 2048)
        deadline = time.time() + 20
        while time.time() < deadline:
            c.request("GET", f"/a/{code}/m")
            if json.loads(c.getresponse().read())["photos"][0]["q"]:
                break
            time.sleep(0.3)
        else:
            self.fail("模糊預覽沒有做出來")
        for f in os.listdir(os.path.join(self.tmp.name, "data", "album-cache")):
            if f.endswith(".jpg"):
                with open(os.path.join(self.tmp.name, "data", "album-cache", f), "rb") as fh:
                    self.assertEqual(fh.read(4), b"VSE1")                              # 存在主機上的小圖是加密的


    def test_anim(self):
        """會動的 GIF、PNG 轉成會動的那段；會動的 WebP 直接給；放上來打不開的刪掉"""
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        c.request("POST", "/api/album", body=json.dumps({"action": "add", "dir": "動圖", "up": 2}), headers={"X-Token": TOKEN})
        d = json.loads(c.getresponse().read())
        a = next(x for x in d["list"] if x["dir"] == "動圖")
        self.assertEqual((a["up"], a["uq"]), (2, 1))
        code = a["code"]
        deadline, m = time.time() + 60, {}
        while time.time() < deadline:
            c.request("GET", f"/a/{code}/m")
            r = c.getresponse()
            ck = (r.getheader("Set-Cookie") or "").split(";")[0] or locals().get("ck", "")
            m = {p["n"]: p for p in json.loads(r.read())["photos"]}
            if m.get("a.gif", {}).get("gf") and m.get("b.png", {}).get("gf"):
                break
            time.sleep(0.5)
        else:
            self.fail(f"動圖沒有轉好：{m}")
        self.assertEqual((m["a.gif"]["gf"], m["b.png"]["gf"], m["c.webp"]["gf"]), (1, 1, 2))
        self.assertNotIn("gf", m["d.gif"])                                              # 只有一格的不算
        c.request("GET", f"/a/{code}/i/{m['c.webp']['i']}/a")
        r = c.getresponse()
        b = r.read()
        self.assertEqual((r.status, b[:4], b[8:12], b"ANIM" in b), (200, b"RIFF", b"WEBP", True))
        c.request("GET", f"/a/{code}/i/{m['c.webp']['i']}/s")                           # 會動的 WebP 也做得出小圖
        self.assertEqual(c.getresponse().read()[:2], b"\xff\xd8")
        c.request("GET", f"/a/{code}/i/{m['a.gif']['i']}/a")
        self.assertEqual(c.getresponse().status, 404)
        fake = b"\xff\xd8\xff\xe0" + os.urandom(4000)                                  # 檔頭像 JPEG，其實打不開
        c.request("POST", f"/a/{code}/up?n=x.jpg&w=%E5%B0%8F%E7%BE%8E", body=fake, headers={"Cookie": ck})
        r = c.getresponse()
        self.assertEqual(r.status, 415)
        r.read()
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        self.assertFalse(os.path.exists(os.path.join(ROOT_DIR + "-t", "動圖", "朋友放的", "小美", "x.jpg")))
        with open(os.path.join(ROOT_DIR + "-t", "動圖", "a.gif"), "rb") as f:
            c.request("POST", f"/a/{code}/up?n=g.gif&w=%E5%B0%8F%E7%BE%8E", body=f.read(), headers={"Cookie": ck})
        r = c.getresponse()
        self.assertEqual(r.status, 200, r.read())
        self.assertTrue(os.path.isfile(os.path.join(ROOT_DIR + "-t", "動圖", "朋友放的", "小美", "g.gif")))
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        with open(os.path.join(ROOT_DIR + "-t", "動圖", "c.webp"), "rb") as f:               # 會動的 WebP 也收
            c.request("POST", f"/a/{code}/up?n=w.webp&w=%E5%B0%8F%E7%BE%8E", body=f.read(), headers={"Cookie": ck})
        r = c.getresponse()
        self.assertEqual(r.status, 200, r.read())
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        c.request("POST", f"/a/{code}/up?n=g2.gif&w=x", body=b"GIF89a" + b"0" * 100, headers={"Cookie": ck, "Sec-Fetch-Site": "cross-site"})
        r = c.getresponse()
        self.assertEqual(r.status, 403)                                                # 別的網站送來的不收

    def test_video(self):
        """影片轉成 720p、原況照片掛在照片上、背景音樂、iPhone 要的分段"""
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        c.request("POST", "/api/album", body=json.dumps({"action": "add", "dir": "影片", "dl": 1}), headers={"X-Token": TOKEN})
        d = json.loads(c.getresponse().read())
        a = next(x for x in d["list"] if x["dir"] == "影片")
        self.assertEqual((a["n"], a["nv"], a["mu"]), (2, 1, "歌.mp3"))                 # 原況那段不另外列
        code = a["code"]
        deadline, m = time.time() + 90, {}
        while time.time() < deadline:
            c.request("GET", f"/a/{code}/m")
            m = json.loads(c.getresponse().read())
            if all(p.get("vr", 1) == 1 for p in m["photos"]) and any(p.get("lv") for p in m["photos"]):
                break
            time.sleep(0.5)
        else:
            self.fail(f"影片沒有轉好：{m}")
        v = next(p for p in m["photos"] if p.get("vd"))
        self.assertEqual((v["w"], v["h"], v["x"]["dt"], v["g"][:2]), (1920, 1080, time.strftime("%Y:%m:%d %H:%M:%S", time.localtime(1793685600)), [25.033, 121.5654]))
        self.assertAlmostEqual(v["vd"], 4, delta=0.2)
        self.assertTrue(m["mu"])
        c.request("GET", f"/a/{code}/i/{v['i']}/v", headers={"Range": "bytes=0-99"})
        r = c.getresponse()
        b = r.read()
        self.assertEqual((r.status, len(b), b[4:8]), (206, 100, b"ftyp"))
        total = int(r.getheader("Content-Range").split("/")[1])
        c.request("GET", f"/a/{code}/i/{v['i']}/v", headers={"Range": f"bytes={total - 10}-"})
        r = c.getresponse()
        self.assertEqual((r.status, len(r.read())), (206, 10))
        c.request("GET", f"/a/{code}/i/{v['i']}/v")
        r = c.getresponse()
        b = r.read()
        self.assertEqual(len(b), total)
        self.assertNotIn(b"121.5654", b)                                               # 轉過的影片沒有定位
        c.request("GET", f"/a/{code}/i/{v['i']}/o")                                    # 只給壓縮的：下載的也是轉過的
        r = c.getresponse()
        self.assertEqual((r.status, len(r.read())), (200, total))
        self.assertIn(".mp4", r.getheader("Content-Disposition"))
        lv = next(p for p in m["photos"] if p.get("lv"))
        c.request("GET", f"/a/{code}/i/{lv['i']}/m")
        r = c.getresponse()
        self.assertEqual((r.status, r.read()[4:8]), (200, b"ftyp"))
        c.request("GET", f"/a/{code}/music", headers={"Range": "bytes=0-"})
        r = c.getresponse()
        self.assertEqual((r.status, r.getheader("Content-Type")), (206, "audio/mpeg"))
        r.read()
        for f in os.listdir(os.path.join(self.tmp.name, "data", "album-cache")):
            if f.endswith(".bin"):
                with open(os.path.join(self.tmp.name, "data", "album-cache", f), "rb") as fh:
                    self.assertEqual(fh.read(4), b"VSE1")                              # 影片也是加密存的
        # 不開放下載時：擋掉直接開分頁下載影片／音樂，但相簿內播放器照常能播
        c.request("POST", "/api/album", body=json.dumps({"action": "edit", "id": a["id"], "dl": 0}), headers={"X-Token": TOKEN})
        self.assertEqual(c.getresponse().status, 200)
        c.request("GET", f"/a/{code}/i/{v['i']}/v", headers={"Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "same-origin"})
        r = c.getresponse()
        r.read()
        self.assertEqual(r.status, 403)
        c.request("GET", f"/a/{code}/music", headers={"Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "same-origin"})
        r = c.getresponse()
        r.read()
        self.assertEqual(r.status, 403)
        c.request("GET", f"/a/{code}/i/{v['i']}/v", headers={"Sec-Fetch-Dest": "video", "Sec-Fetch-Site": "same-origin", "Range": "bytes=0-15"})
        r = c.getresponse()
        r.read()
        self.assertEqual(r.status, 206)
        c.request("GET", f"/a/{code}/music", headers={"Sec-Fetch-Dest": "audio", "Sec-Fetch-Site": "same-origin", "Range": "bytes=0-15"})
        r = c.getresponse()
        r.read()
        self.assertEqual(r.status, 206)


if __name__ == "__main__":
    unittest.main()
