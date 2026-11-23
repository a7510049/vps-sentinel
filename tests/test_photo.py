"""相簿的色彩、HEIC、HDR、相機原始檔（photo.py）：顏色不能偏、亮部倍數跟原檔一樣"""
import ast
import http.client
import json
import os
import re
import shutil
import struct
import subprocess
import tempfile
import time
import unittest
import zlib

from test_smoke import TOKEN, Server

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = tempfile.mkdtemp(prefix="vs-photo-")


def load():
    """把 photo.py（和它用到的 album.py 兩個小工具）載進一個字典"""
    G = {"struct": struct, "os": os, "re": re, "zlib": zlib}
    with open(os.path.join(ROOT, "album.py"), encoding="utf-8") as f:
        tree = ast.parse(f.read())
    for n in tree.body:
        if (isinstance(n, ast.FunctionDef) and n.name == "alb_boxes") or (isinstance(n, ast.Assign) and any(getattr(t, "id", "") == "TIFF_SZ" for t in n.targets)):
            exec(compile(ast.Module([n], []), "album.py", "exec"), G)   # noqa: S102
    with open(os.path.join(ROOT, "photo.py"), encoding="utf-8") as f:
        exec(compile(f.read(), "photo.py", "exec"), G)                 # noqa: S102
    return G


P = load()

# ── 色彩換算（量色差用）：RGB（有曲線）→ 線性 → XYZ(D50) → Lab ──


def srgb_lin(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def lab(rgb, name):
    m = P["pic_rgb2xyz50"](name)
    if name == "adobe":
        lin = [(c / 255) ** (563 / 256) for c in rgb]
    else:
        lin = [srgb_lin(c) for c in rgb]
    xyz = [sum(m[i][j] * lin[j] for j in range(3)) for i in range(3)]
    wn = P["PIC_D50"]

    def f(t):
        return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116
    fx, fy, fz = (f(xyz[i] / wn[i]) for i in range(3))
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def de(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


PATCH = [(200, 40, 40), (40, 170, 60), (40, 60, 200), (224, 172, 140), (120, 170, 230), (250, 210, 40), (128, 128, 128), (30, 30, 30)]


def patches_rgb(w=8 * 96, h=96):
    row = b"".join(bytes(PATCH[x // 96]) for x in range(w))
    return row * h


def ff(*args, data=None):
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", *args], input=data, capture_output=True, check=True)
    return r.stdout


def mean_patches(rgb, w, h):
    out = []
    for i in range(8):
        acc = [0, 0, 0]
        n = 0
        for y in range(h // 4, h * 3 // 4):
            for x in range(i * 96 + 24, i * 96 + 72):
                p = (y * w + x) * 3
                for c in range(3):
                    acc[c] += rgb[p + c]
                n += 1
        out.append([a / n for a in acc])
    return out


# ── HEIF：自己組一個（拼圖、轉向、Apple 的增益圖、HLG） ──
def box(t, *parts):
    b = b"".join(parts)
    return struct.pack(">I", 8 + len(b)) + t + b


def fbox(t, v, fl, *parts):
    return box(t, bytes([v]) + fl.to_bytes(3, "big"), *parts)


def hevc(color, size, ten=False, gray=False):
    """一格 HEVC（Annex B）→ (hvcC, 長度前綴的資料)"""
    args = ["-f", "lavfi", "-i", f"color=c={color}:s={size}", "-frames:v", "1", "-c:v", "libx265", "-x265-params", "log-level=none"]
    if ten:
        args += ["-pix_fmt", "yuv420p10le", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc"]
    elif gray:
        args += ["-pix_fmt", "gray"]
    else:
        args += ["-pix_fmt", "yuv420p"]
    bs = ff(*args, "-f", "hevc", "-")
    nals = [n for n in re.split(b"\x00\x00\x00\x01|\x00\x00\x01", bs) if n]
    ps = {32: [], 33: [], 34: []}
    data = b""
    for n in nals:
        t = (n[0] >> 1) & 0x3F
        if t in ps:
            ps[t].append(n)
        elif t < 32:
            data += struct.pack(">I", len(n)) + n
    hv = bytes([1]) + b"\0" * 20 + bytes([0xF3, 3])
    for t in (32, 33, 34):
        hv += bytes([t]) + struct.pack(">H", len(ps[t])) + b"".join(struct.pack(">H", len(n)) + n for n in ps[t])
    return hv, data


def heif(items, pitm, refs, props, assoc, idat_items=()):
    """items: [(編號, 類型, 資料)]；refs: [(類型, 從, [到])]；props: [盒子]；assoc: {編號: [屬性序號]}"""
    infe = b"".join(fbox(b"infe", 2, 0, struct.pack(">HH", i, 0), t, b"\0") for i, t, _ in items)
    iinf = fbox(b"iinf", 0, 0, struct.pack(">H", len(items)), infe)
    iref = fbox(b"iref", 0, 0, *(box(t, struct.pack(">HH", f, len(to)), *(struct.pack(">H", x) for x in to)) for t, f, to in refs))
    ipco = box(b"ipco", *props)
    ipma = fbox(b"ipma", 0, 0, struct.pack(">I", len(assoc)), *(struct.pack(">HB", i, len(ps)) + bytes(p | 0x80 if k == 0 else p for k, p in enumerate(ps)) for i, ps in assoc.items()))
    iprp = box(b"iprp", ipco, ipma)
    hdlr = fbox(b"hdlr", 0, 0, b"\0\0\0\0pict" + b"\0" * 12 + b"\0")
    pit = fbox(b"pitm", 0, 0, struct.pack(">H", pitm))
    idat = b"".join(d for i, t, d in items if i in idat_items)

    def build(mdat_at):
        ents, off, ioff = [], mdat_at + 8, 0
        for i, t, d in items:
            if i in idat_items:
                ents.append(struct.pack(">HHHHII", i, 1, 0, 1, ioff, len(d)))
                ioff += len(d)
            else:
                ents.append(struct.pack(">HHHHII", i, 0, 0, 1, off, len(d)))
                off += len(d)
        iloc = fbox(b"iloc", 1, 0, bytes([0x44, 0x00]), struct.pack(">H", len(items)), *ents)
        meta = fbox(b"meta", 0, 0, hdlr, pit, iinf, iref, iprp, iloc, box(b"idat", idat))
        return meta
    ftyp = box(b"ftyp", b"heic", b"\0\0\0\0", b"mif1heic")
    meta = build(0)
    meta = build(len(ftyp) + len(meta))
    mdat = box(b"mdat", *(d for i, t, d in items if i not in idat_items))
    return ftyp + meta + mdat


def ispe(w, h):
    return fbox(b"ispe", 0, 0, struct.pack(">II", w, h))


def apple_exif(a33, a48):
    """Exif（大端序）：IFD0 → Exif IFD → MakerNote（Apple iOS，標籤 33、48 是分數）"""
    mk_ifd = struct.pack(">H", 2)
    vals = b""
    base_vals = 14 + 2 + 2 * 12 + 4
    for k, (tag, v) in enumerate(((0x21, a33), (0x30, a48))):
        mk_ifd += struct.pack(">HHII", tag, 10, 1, base_vals + 8 * k)
        vals += struct.pack(">ii", int(v * 1000000), 1000000)
    mk = b"Apple iOS\0\0\x01MM" + mk_ifd + b"\0\0\0\0" + vals
    # TIFF：IFD0（1 格：Exif 指標）→ Exif IFD（1 格：MakerNote）→ MakerNote
    t = b"MM\0\x2a" + struct.pack(">I", 8)
    t += struct.pack(">H", 1) + struct.pack(">HHII", 0x8769, 4, 1, 8 + 18) + b"\0\0\0\0"
    t += struct.pack(">H", 1) + struct.pack(">HHII", 0x927C, 7, len(mk), 26 + 18) + b"\0\0\0\0"
    t += mk
    return struct.pack(">I", 6) + b"Exif\0\0" + t


def rw2(jpeg):
    """很像 Panasonic RW2 的檔案：IIU、IFD0 的 0x2E 是整張 JPEG"""
    t = b"IIU\0" + struct.pack("<I", 8) + struct.pack("<H", 1) + struct.pack("<HHII", 0x2E, 7, len(jpeg), 8 + 18) + b"\0\0\0\0"
    return t + jpeg


def ifd(ents, at, e="<"):
    """一個 IFD（ents: [(標籤, 型別, 值)]，值是 int、str 或 bytes），放在 at；回傳 (IFD, 後面的資料)"""
    n = len(ents)
    data = b""
    head = struct.pack(e + "H", n)
    dat_at = at + 2 + n * 12 + 4
    for tag, typ, val in ents:
        if isinstance(val, str):
            raw = val.encode() + b"\0"
        elif isinstance(val, bytes):
            raw = val
        elif typ == 3:
            raw = struct.pack(e + "H", val)
        else:
            raw = struct.pack(e + "I", val)
        cnt = len(raw) // {3: 2, 4: 4, 5: 8, 8: 2, 9: 4}.get(typ, 1)
        if len(raw) <= 4:
            head += struct.pack(e + "HHI", tag, typ, cnt) + raw.ljust(4, b"\0")
        else:
            head += struct.pack(e + "HHII", tag, typ, cnt, dat_at + len(data))
            data += raw
            data += b"\0" * (len(data) % 2)
    return head + b"\0\0\0\0" + data


def mk_exif(make, note):
    """Exif（小端序）：IFD0 有 Make、Exif IFD；Exif IFD 只有 MakerNote；note(開始位置) 回傳 MakerNote 位元組"""
    i0 = ifd([(0x010F, 2, make), (0x8769, 4, 0)], 8)
    ex_at = 8 + len(i0)
    mn_at = ex_at + 2 + 12 + 4
    mn = note(mn_at)
    i0 = ifd([(0x010F, 2, make), (0x8769, 4, ex_at)], 8)
    ex = struct.pack("<H", 1) + struct.pack("<HHII", 0x927C, 7, len(mn), mn_at) + b"\0\0\0\0"
    return b"II*\0" + struct.pack("<I", 8) + i0 + ex + mn


class PhotoUnit(unittest.TestCase):
    """不用 ffmpeg 的部分：描述檔、增益圖的換算、Ultra HDR 的結構"""

    def test_icc_p3_matches_apple(self):
        """自己算的 Display P3 跟 Apple 內建的描述檔一樣（小數點後四位）"""
        m = P["pic_rgb2xyz50"]("p3")
        apple = [[0.5151, 0.2920, 0.1571], [0.2412, 0.6922, 0.0666], [-0.0011, 0.0419, 0.7841]]
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(m[i][j], apple[i][j], places=3)
        icc = P["pic_icc_make"]("p3")
        self.assertEqual(struct.unpack(">I", icc[:4])[0], len(icc))
        self.assertEqual(icc[36:40], b"acsp")
        self.assertEqual(P["pic_icc_name"](icc), "Display P3")
        self.assertEqual(P["pic_icc_name"](P["pic_icc_make"]("adobe")), "Adobe RGB")

    def test_icc_put(self):
        """ICC 放進 JPEG（換掉原本的），讀得回來"""
        jpg = b"\xff\xd8" + b"\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\xff\xda\x00\x02" + b"\x00" * 10 + b"\xff\xd9"
        icc = P["pic_icc_make"]("p3")
        out = P["pic_icc_put"](jpg, icc)
        self.assertEqual(P["pic_jpeg_icc"](out), icc)
        out2 = P["pic_icc_put"](out, P["pic_icc_make"]("adobe"))
        self.assertEqual(P["pic_icc_name"](P["pic_jpeg_icc"](out2)), "Adobe RGB")
        self.assertEqual(out2.count(b"ICC_PROFILE"), 1)

    def test_apple_stops(self):
        """Apple 公開的算法：33、48 → 亮幾級"""
        self.assertAlmostEqual(P["pic_apple_stops"](1.0255, 0.0016857), -70 * 0.0016857 + 3.0, places=6)
        self.assertAlmostEqual(P["pic_apple_stops"](0.5, 0.5), -0.101 * 0.5 + 1.601, places=6)
        self.assertEqual(P["pic_apple_stops"](1.5, 20), 0.0)

    def test_apple_lut_reverse(self):
        """Apple 的增益圖換成 Ultra HDR 後，反算回去的亮度倍數一樣（差不到 2%）"""
        st = 2.88
        lut = P["pic_apple_lut"](st)
        hr = 2 ** st
        for v in range(0, 256, 5):
            x = v / 255
            g = x / 4.5 if x < 0.081 else ((x + 0.099) / 1.099) ** (1 / 0.45)
            apple = 1 + (hr - 1) * g                          # Apple：線性倍數
            uhdr = 2 ** (lut[v] / 255 * st)                   # Ultra HDR：2 的（復原值 × 最大級數）次方
            self.assertLess(abs(uhdr / apple - 1), 0.02, v)

    def test_uhdr_roundtrip(self):
        """Ultra HDR：XMP、ISO 21496-1、MPF 都對，讀得回同一組參數、增益圖位置正確"""
        base = b"\xff\xd8" + b"\xff\xdb\x00\x04\x00\x00" + b"\xff\xda\x00\x02" + b"\x11" * 40 + b"\xff\xd9"
        gm = b"\xff\xd8" + b"\xff\xe0\x00\x04\x00\x00" + b"\xff\xda\x00\x02" + b"\x22" * 20 + b"\xff\xd9"
        g = {"mn": 0.0, "mx": 2.5, "ga": 1.0, "os": 1 / 64, "oh": 1 / 64, "cn": 0.0, "cx": 2.5}
        out = P["pic_uhdr"](base, gm, g)
        imgs = P["pic_mpf_imgs"](out)
        self.assertEqual(len(imgs), 1)
        s, n = imgs[0]
        self.assertEqual(s + n, len(out))
        sec = out[s:s + n]
        for parse in (P["pic_gm_xmp"](P["pic_jpeg_xmp"](sec)), P["pic_iso_meta"](P["pic_jpeg_iso"](sec))):
            for k, v in g.items():
                self.assertAlmostEqual(parse[k], v, places=3)
        self.assertIn(b"Item:Length=\"%d\"" % n, out[:s])
        self.assertTrue(sec.endswith(b"\x22" * 20 + b"\xff\xd9"))

    def test_iso_common_denominator(self):
        """ISO 21496-1 共用分母的寫法（iPhone 用的）也讀得懂"""
        d = struct.pack(">HHB", 0, 0, 0x08) + struct.pack(">III", 1000, 0, 2300) + struct.pack(">iiIii", 0, 2300, 1000, 15, 15)
        g = P["pic_iso_meta"](d)
        self.assertAlmostEqual(g["mx"], 2.3)
        self.assertAlmostEqual(g["cx"], 2.3)
        self.assertAlmostEqual(g["os"], 0.015)
    def test_makernote(self):
        """相機的風格設定：松下（L.單色D＋紅色濾鏡、LUT、Dual I.S. 2）、富士、Sony、Canon、Nikon；表上沒有的數值不寫"""
        def maker(b):
            return P["pic_maker"](b, P["pic_exif_more"](b))
        pana = mk_exif("Panasonic", lambda at: b"Panasonic\0\0\0" + ifd([(0x07, 3, 7), (0x1A, 3, 11), (0x51, 2, "LUMIX S 20-60/F3.5-5.6"),
                       (0x44, 3, 5600), (0x89, 3, 15), (0xAC, 3, 3), (0xD2, 3, 3), (0xE9, 3, 12), (0xF1, 2, "Teal Orange"), (0xF3, 1, b"\x50")], at + 12))
        self.assertEqual(maker(pana), {"sl": "相片風格", "st": "L.單色D", "fx": ["紅色濾鏡", "粒子 強"], "lut": "Teal Orange 80%",
                                       "is": "Dual I.S. 2", "af": "連續對焦", "sub": "飛機", "ln": "LUMIX S 20-60/F3.5-5.6", "k": 5600})
        odd = mk_exif("Panasonic", lambda at: b"Panasonic\0\0\0" + ifd([(0x89, 3, 1), (0xAC, 3, 3)], at + 12))
        self.assertEqual(maker(odd), {})               # 1 是「標準或自訂」分不出來，彩色時濾鏡也不算
        fuji = mk_exif("FUJIFILM", lambda at: b"FUJIFILM" + struct.pack("<I", 12) + ifd([(0x1047, 4, 64), (0x1401, 3, 0x600)], 12))
        self.assertEqual(maker(fuji), {"sl": "底片模擬", "st": "經典正片 CLASSIC CHROME", "fx": ["粒子 強"]})
        acros = mk_exif("FUJIFILM", lambda at: b"FUJIFILM" + struct.pack("<I", 12) + ifd([(0x1003, 3, 0x501), (0x1401, 3, 0)], 12))
        self.assertEqual(maker(acros)["st"], "ACROS＋紅色濾鏡")
        sony = mk_exif("SONY", lambda at: b"SONY DSC \0\0\0" + ifd([(0xB020, 2, "FL")], at + 12))
        self.assertEqual(maker(sony), {"sl": "創意外觀", "st": "FL"})
        pi = struct.pack("<" + "h" * 12, 24, *([0] * 9), 0x83, 0)
        canon = mk_exif("Canon", lambda at: ifd([(0xA0, 3, pi)], at))
        self.assertEqual(maker(canon), {"sl": "相片風格", "st": "風景"})
        pc = b"0200" + b"FLAT".ljust(20, b"\0") + b"FLAT".ljust(20, b"\0")
        nikon = mk_exif("NIKON CORPORATION", lambda at: b"Nikon\0\x02\x10\0\0" + b"II*\0" + struct.pack("<I", 8) + ifd([(0x23, 7, pc)], 8))
        self.assertEqual(maker(nikon), {"sl": "優化校準", "st": "平面"})

    def test_focus_bracket(self):
        """對焦點：松下（比例）、Sony（像素＋參考大小）、富士（像素）；手動對焦不算；包圍曝光幾張"""
        def maker(b):
            return P["pic_maker"](b, P["pic_exif_more"](b))
        rat = struct.pack("<IIII", 3, 10, 7, 10)
        pana = mk_exif("Panasonic", lambda at: b"Panasonic\0\0\0" + ifd([(0x07, 3, 7), (0x45, 3, 4), (0x4D, 5, rat), (0x89, 3, 3)], at + 12))
        m = maker(pana)
        self.assertEqual((round(m["fp"][0], 2), round(m["fp"][1], 2), m["fp"][2:]), (.3, .7, (1, 1)))
        self.assertEqual(m["bk"], 5)
        mf = mk_exif("Panasonic", lambda at: b"Panasonic\0\0\0" + ifd([(0x07, 3, 2), (0x4D, 5, rat), (0x89, 3, 3)], at + 12))
        self.assertNotIn("fp", maker(mf))
        sony = mk_exif("SONY", lambda at: b"SONY DSC \0\0\0" + ifd([(0x2027, 3, struct.pack("<HHHH", 6000, 4000, 1500, 1000))], at + 12))
        self.assertEqual(maker(sony), {"fp": (1500, 1000, 6000, 4000)})
        fuji = mk_exif("FUJIFILM", lambda at: b"FUJIFILM" + struct.pack("<I", 12) + ifd([(0x1031, 3, struct.pack("<HH", 300, 200)), (0x1100, 3, 1)], 12))
        self.assertEqual(maker(fuji), {"sl": "底片模擬", "fp": (300, 200, 0, 0), "bk": 1})

    def test_focal_and_afp(self):
        """等效焦距：用感光元件解析度算、沒有就查型號；對焦點照轉向換成轉正後的位置"""
        import math
        import re
        src = open(os.path.join(ROOT, "album.py"), encoding="utf-8").read()
        G = {"math": math, "re": re}
        for n in ast.parse(src).body:
            if (isinstance(n, ast.FunctionDef) and n.name in ("alb_crop", "alb_afp", "_rat")) or \
               (isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "ALB_CROP"):
                exec(compile(ast.Module([n], []), "album.py", "exec"), G)   # noqa: S102
        crop, afp = G["alb_crop"], G["alb_afp"]
        # 一吋（13.2×8.8 mm）5472×3648：每公分 4145 點 → 約 2.73 倍
        t = {"fpx": (41454, 10), "fpy": (41454, 10), "fpu": 3, "pw": 5472, "ph": 3648}
        self.assertAlmostEqual(crop(t, {}), 2.73, places=1)
        self.assertEqual(crop({}, {"mk": "Panasonic", "md": "DC-S5M2X"}), 1.0)
        self.assertEqual(crop({}, {"mk": "Panasonic", "md": "DC-GH6"}), 2.0)
        self.assertEqual(crop({}, {"mk": "FUJIFILM", "md": "X-T5"}), 1.53)
        self.assertEqual(crop({}, {"mk": "FUJIFILM", "md": "GFX100S"}), .79)
        self.assertEqual(crop({}, {"mk": "SONY", "md": "ILCE-7M4"}), 1.0)
        self.assertEqual(crop({}, {"mk": "SONY", "md": "ILCE-6700"}), 1.53)
        self.assertEqual(crop({}, {"mk": "Canon", "md": "Canon EOS R7"}), 1.6)
        self.assertEqual(crop({}, {"mk": "Canon", "md": "Canon EOS R5"}), 1.0)
        self.assertIsNone(crop({}, {"mk": "Apple", "md": "iPhone 16 Pro"}))
        self.assertEqual(afp({}, {"fp": (.3, .7, 1, 1)}, 1, 0, 6000, 4000), [.3, .7, .1])
        self.assertEqual(afp({}, {"fp": (.3, .7, 1, 1)}, 6, 0, 6000, 4000), [.3, .3, .1])   # 轉 90 度：(1−y, x)
        self.assertEqual(afp({}, {"fp": (.3, .7, 1, 1)}, 1, 3, 6000, 4000), [.3, .3, .1])   # HEIC 的 irot 3＝順時針 90 度
        self.assertEqual(afp({"pw": 4032, "ph": 3024}, {}, 1, 0, 4032, 3024)is None, True)
        self.assertEqual(afp({"sa": [2016, 1512, 2217, 1330], "pw": 4032, "ph": 3024}, {}, 1, 0, 4032, 3024), None)   # 中間一大塊：不是對焦點
        self.assertEqual(afp({"sa": [1008, 756, 400, 300], "pw": 4032, "ph": 3024}, {}, 1, 0, 4032, 3024), [.25, .25, .099])
        self.assertEqual(afp({}, {"fp": (300, 200, 0, 0)}, 1, 0, 600, 400), [.5, .5, .1])


    def test_wb_shift_faces(self):
        """白平衡微調（松下 B 是正的要反過來、Canon、富士一格 20）和相機偵測到的臉"""
        def maker(b):
            return P["pic_maker"](b, P["pic_exif_more"](b))
        fd = struct.pack("<9H", 2, 160, 120, 40, 50, 80, 60, 20, 20)
        pana = mk_exif("Panasonic", lambda at: b"Panasonic\0\0\0" + ifd([(0x46, 8, struct.pack("<h", -2)), (0x47, 8, struct.pack("<h", 1)), (0x4E, 7, fd), (0x89, 3, 3), (0x9F, 3, 1)], at + 12))
        m = maker(pana)
        self.assertEqual(m["sh"], "e")                          # 電子快門
        self.assertEqual(m["ws"], [2, 1, "ab"])                 # 往琥珀 2、往綠 1
        self.assertEqual(m["fc"], [(160, 132.5, 52.0, 65.0), (80, 65.0, 26.0, 26.0)])   # 記的是眼睛：往下移一點、放大到整張臉
        self.assertEqual(m["fcr"], (320, -1))
        fuji = mk_exif("FUJIFILM", lambda at: b"FUJIFILM" + struct.pack("<I", 12) + ifd([(0x100A, 9, struct.pack("<ii", 40, -20)), (0x1050, 3, 3),
                       (0x4100, 3, 1), (0x4103, 3, struct.pack("<4H", 100, 200, 300, 500))], 12))
        m = maker(fuji)
        self.assertEqual(m["ws"], [2, -1, "rb"])
        self.assertEqual(m["sh"], "efc")                        # 電子前簾
        self.assertEqual(m["fc"], [(200, 350, 200, 300)])
        pi = struct.pack("<" + "h" * 14, 28, *([0] * 9), 0x83, 0, 3, -2)
        canon = mk_exif("Canon", lambda at: ifd([(0xA0, 3, pi)], at))
        self.assertEqual(maker(canon)["ws"], [3, -2, "ab"])
        zero = mk_exif("Panasonic", lambda at: b"Panasonic\0\0\0" + ifd([(0x46, 8, struct.pack("<h", 0)), (0x47, 8, struct.pack("<h", 0)), (0x89, 3, 3)], at + 12))
        self.assertNotIn("ws", maker(zero))
        src = open(os.path.join(ROOT, "album.py"), encoding="utf-8").read()
        G = {}
        for n in ast.parse(src).body:
            if isinstance(n, ast.FunctionDef) and n.name == "alb_faces":
                exec(compile(ast.Module([n], []), "album.py", "exec"), G)   # noqa: S102
        f = G["alb_faces"]
        self.assertEqual(f({}, {"fc": [(160, 120, 32, 48)], "fcr": (320, 240)}, 1, 0, 6000, 4000), [[.5, .5, .1, .2]])
        self.assertEqual(f({}, {"fc": [(80, 60, 32, 48)], "fcr": (320, 240)}, 6, 0, 6000, 4000), [[.75, .25, .2, .1]])   # 轉 90 度：寬高對調
        self.assertEqual(f({}, {"fc": [(160, 64, 32, 32)], "fcr": (320, -1)}, 1, 0, 6000, 4000), [[.5, .3, .1, .15]])   # 3:2：320×213
        self.assertIsNone(f({}, {"fc": [(0, 0, 0, 0)], "fcr": (320, 240)}, 1, 0, 6000, 4000))

    def test_canon_nikon_af(self):
        """Canon AFInfo2（畫面中間是原點、往上是正，對準的點用位元標）、Nikon Z 系列 AFInfo2（左上角原點）"""
        n = 3                                           # 三個點：左上、中間（對準）、右下（對準）
        w = [0, 2, n, n, 6000, 4000, 6000, 4000, *[200] * n, *[200] * n, -1000, 0, 1000, 1000, 0, -1000, 0b110, 0]
        cf = P["pic_canon_af"](struct.pack("<%dh" % len(w), *w), "<")
        self.assertEqual(cf[:4], (3500, 2500, 6000, 4000))   # 中間（3000,2000）和右下（4000,3000）合起來的中心
        self.assertAlmostEqual(cf[4], 1200 / 4000)
        w[1] = 0
        self.assertIsNone(P["pic_canon_af"](struct.pack("<%dh" % len(w), *w), "<"))   # 手動對焦
        d = bytearray(0x50)
        d[:4], d[7] = b"0400", 1
        struct.pack_into(">6H", d, 0x3E, 8256, 5504, 2064, 4128, 500, 500)
        self.assertEqual(P["pic_nikon_af"](bytes(d), ">")[:4], (2064, 4128, 8256, 5504))
        d[7] = 0
        self.assertIsNone(P["pic_nikon_af"](bytes(d), ">"))   # 沒有座標（只有點的編號）

    def test_camera_clock(self):
        """相機時間：時區沒換的照手機換成當地時間；跟手機拍到很像的畫面兩組以上、差的時間一致，整台相機照手機調"""
        import bisect
        import calendar
        src = open(os.path.join(ROOT, "album.py"), encoding="utf-8").read()
        G = {"re": re, "time": time, "calendar": calendar, "bisect": bisect}
        for n in ast.parse(src).body:
            if (isinstance(n, ast.FunctionDef) and n.name in ("alb_clock", "alb_oz_s")) or \
               (isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "ALB_PHONE"):
                exec(compile(ast.Module([n], []), "album.py", "exec"), G)   # noqa: S102
        ph = lambda i, dt, dh: {"i": i, "n": i, "dh": dh, "x": {"mk": "Apple", "md": "iPhone 16", "dt": dt, "oz": "+09:00"}}
        cam = lambda i, dt, dh, oz=None: {"i": i, "n": i, "dh": dh, "x": {"mk": "Panasonic", "md": "DC-S5M2X", "dt": dt, **({"oz": oz} if oz else {})}}
        out = G["alb_clock"]([ph("p1", "2026:05:01 10:00:00", "00ff00ff00ff00ff"), ph("p2", "2026:05:01 15:00:00", "ffff0000ffff0000"),
                              cam("c1", "2026:05:01 09:56:40", "00ff00ff00ff00fe"), cam("c2", "2026:05:01 14:56:45", "ffff0000ffff0001"),
                              cam("c3", "2026:05:01 12:00:00", "123456789abcdef0")])
        x = {o["i"]: o["x"] for o in out}
        self.assertEqual(x["c3"]["dt"], "2026:05:01 12:03:18")   # 慢 3 分 18 秒（兩組的中位數）
        self.assertEqual(x["c3"]["dtc"][0], 198)
        self.assertEqual(x["c3"]["oz"], "+09:00")
        self.assertEqual([o["i"] for o in out], ["c1", "p1", "c3", "p2", "c2"])
        out = G["alb_clock"]([ph("p1", "2026:05:01 10:00:00", None), cam("c1", "2026:05:01 09:10:00", None, "+08:00")])
        c = next(o for o in out if o["i"] == "c1")["x"]
        self.assertEqual((c["dt"], c["oz"], c["dtc"]), ("2026:05:01 10:10:00", "+09:00", [0, "2026:05:01 09:10:00", "+08:00"]))
        out = G["alb_clock"]([ph("p1", "2026:05:01 10:00:00", "00ff00ff00ff00ff"), cam("c1", "2026:05:01 09:56:40", "00ff00ff00ff00fe")])
        self.assertNotIn("dtc", out[1]["x"] if out[1]["i"] == "c1" else out[0]["x"])   # 只有一組：不調

    def test_gps_timezone(self):
        """沒寫時區的照片（很多相機）：用定位附帶的世界標準時間算出時區，差 5 分鐘內才算"""
        src = open(os.path.join(ROOT, "album.py"), encoding="utf-8").read()
        tree = ast.parse(src)
        from datetime import datetime, timedelta
        G = {"datetime": datetime, "timedelta": timedelta}
        for n in tree.body:
            if isinstance(n, ast.FunctionDef) and n.name == "alb_gps_oz":
                exec(compile(ast.Module([n], []), "album.py", "exec"), G)   # noqa: S102
        oz = G["alb_gps_oz"]
        self.assertEqual(oz("2026:11:10 07:30:15", "2026:11:09", [(22, 1), (30, 1), (15, 1)]), "+09:00")
        self.assertEqual(oz("2026:07:01 10:00:00", "2026:07:01", [(14, 1), (30, 1), (2, 1)]), "-04:30")
        self.assertEqual(oz("2026:07:01 10:00:00", "2026:07:01", [(1, 1), (22, 1), (30, 1)]), "")   # 差 8 小時 37 分半：相機時間沒對準，不算
        self.assertEqual(oz("2026:07:01 10:00:00", None, None), "")


def shot(c, code, want, timeout=90):
    deadline, ps = time.time() + timeout, {}
    while time.time() < deadline:
        c.request("GET", f"/a/{code}/m")
        ps = {p["n"]: p for p in json.loads(c.getresponse().read())["photos"]}
        if want(ps):
            return ps
        time.sleep(0.5)
    raise AssertionError(f"等太久：{ps}")


def get(c, path):
    c.request("GET", path)
    r = c.getresponse()
    return r.status, r.read()


@unittest.skipUnless(shutil.which("ffmpeg"), "沒有 ffmpeg")
class PhotoAlbum(Server):
    ENV = {"SENTINEL_ALB_E": "0", "SENTINEL_ALB_DIR": ROOT_DIR, "SENTINEL_ALB_GEO": "http://127.0.0.1:9/none", "SENTINEL_ALB_WX": "http://127.0.0.1:9/none", "SENTINEL_ALB_WX2": "http://127.0.0.1:9/none"}

    @classmethod
    def setUpClass(cls):
        d = os.path.join(ROOT_DIR, "色彩")
        os.makedirs(d, exist_ok=True)
        raw = patches_rgb()
        jpg = ff("-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "768x96", "-i", "-", "-q:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "-", data=raw)
        with open(os.path.join(d, "p3.jpg"), "wb") as f:                     # 手機的 Display P3
            f.write(P["pic_icc_put"](jpg, P["pic_icc_make"]("p3")))
        t = (b"II*\0" + struct.pack("<I", 8) + struct.pack("<H", 1) + struct.pack("<HHII", 0x8769, 4, 1, 26) + b"\0\0\0\0"
             + struct.pack("<H", 2) + struct.pack("<HHII", 0xA001, 3, 1, 0xFFFF) + struct.pack("<HHII", 0xA005, 4, 1, 26 + 30) + b"\0\0\0\0"
             + struct.pack("<H", 1) + struct.pack("<HHI", 1, 2, 4) + b"R03\0" + b"\0\0\0\0")
        app1 = b"Exif\0\0" + t
        with open(os.path.join(d, "_DSC0001.jpg"), "wb") as f:              # 相機設 Adobe RGB：沒放描述檔，只在 EXIF 標
            f.write(jpg[:2] + b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1 + jpg[2:])
        with open(os.path.join(d, "P1000001.RW2"), "wb") as f:              # Panasonic 原始檔（同名的 JPEG 也在）
            f.write(rw2(jpg))
        with open(os.path.join(d, "P1000001.JPG"), "wb") as f:
            f.write(jpg)
        with open(os.path.join(d, "P1000002.RW2"), "wb") as f:              # 只有原始檔
            f.write(rw2(jpg))
        # HEIC：2×2 拼圖（左上紅、右上綠、左下藍、右下白），轉 90 度，Apple 的增益圖（一片灰 128）
        tiles = [hevc(c, "256x256") for c in ("red", "lime", "blue", "white")]
        gmv = hevc("gray", "256x256", gray=True)
        icc = P["pic_icc_make"]("p3")
        props = [box(b"hvcC", tiles[0][0]), ispe(256, 256), ispe(512, 512), box(b"irot", b"\x01"),
                 box(b"colr", b"prof", icc), box(b"hvcC", gmv[0]), fbox(b"auxC", 0, 0, P["PIC_APPLE_GM"].encode() + b"\0"), box(b"hvcC", tiles[1][0]),
                 box(b"hvcC", tiles[2][0]), box(b"hvcC", tiles[3][0])]
        items = [(1, b"hvc1", tiles[0][1]), (2, b"hvc1", tiles[1][1]), (3, b"hvc1", tiles[2][1]), (4, b"hvc1", tiles[3][1]),
                 (5, b"grid", bytes([0, 0, 1, 1]) + struct.pack(">HH", 512, 512)), (6, b"hvc1", gmv[1]), (7, b"Exif", apple_exif(1.0255, 0.0016857))]
        assoc = {1: [1, 2], 2: [8, 2], 3: [9, 2], 4: [10, 2], 5: [3, 4, 5], 6: [6, 2, 4, 7]}
        with open(os.path.join(d, "IMG_0001.HEIC"), "wb") as f:
            f.write(heif(items, 5, [(b"dimg", 5, [1, 2, 3, 4]), (b"auxl", 6, [5]), (b"cdsc", 7, [5])], props, assoc, idat_items=(5,)))
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(ROOT_DIR, ignore_errors=True)

    def album(self, c, folder):
        c.request("POST", "/api/album", body=json.dumps({"action": "add", "dir": folder}), headers={"X-Token": TOKEN})
        return next(x for x in json.loads(c.getresponse().read())["list"] if x["dir"] == folder)["code"]

    def test_color(self):
        """色差：做出來的大圖照它自己的描述檔看，跟原檔幾乎一樣（ΔE < 1.5）；以前丟掉描述檔時差很多"""
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        code = self.album(c, "色彩")
        ps = shot(c, code, lambda ps: {"p3.jpg", "_DSC0001.jpg", "IMG_0001.HEIC", "P1000001.JPG", "P1000002.RW2"} <= set(ps) and all("qs" in p for p in ps.values()))
        self.assertEqual(ps["p3.jpg"]["cs"], "Display P3")
        self.assertEqual(ps["_DSC0001.jpg"]["cs"], "Adobe RGB")
        src = patches_rgb()
        for name, space in (("p3.jpg", "p3"), ("_DSC0001.jpg", "adobe")):
            st, big = get(c, f"/a/{code}/i/{ps[name]['i']}/l")
            self.assertEqual(st, 200)
            self.assertEqual(P["pic_icc_name"](P["pic_jpeg_icc"](big)), {"p3": "Display P3", "adobe": "Adobe RGB"}[space])
            out = ff("-f", "mjpeg", "-i", "-", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-", data=big)
            a, b = mean_patches(src, 768, 96), mean_patches(out, 768, 96)
            worst = max(de(lab(x, space), lab(y, space)) for x, y in zip(a, b))
            strip = max(de(lab(x, space), lab(y, "srgb")) for x, y in zip(a, b))   # 以前：描述檔被丟掉，瀏覽器當 sRGB 看
            print(f"\n  {name}：色差 {worst:.2f}（以前丟掉描述檔 {strip:.1f}）", end="")
            self.assertLess(worst, 1.5, f"{name} 色差 {worst:.2f}")
            self.assertGreater(strip, 3)

    def test_heic_grid_hdr(self):
        """HEIC：拼圖拼對、轉向對、Display P3、Apple 增益圖換成 Ultra HDR（倍數跟原檔一樣）"""
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        code = self.album(c, "色彩")
        ps = shot(c, code, lambda ps: "qs" in ps.get("IMG_0001.HEIC", {}))
        p = ps["IMG_0001.HEIC"]
        self.assertEqual(p["cs"], "Display P3")
        st = P["pic_apple_stops"](1.0255, 0.0016857)
        self.assertAlmostEqual(p["hdr"], round(st, 2))
        _, big = get(c, f"/a/{code}/i/{p['i']}/l")
        out = ff("-f", "mjpeg", "-i", "-", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-", data=big)
        self.assertEqual(len(out), 512 * 512 * 3)

        def px(x, y):
            o = (y * 512 + x) * 3
            return out[o:o + 3]
        # 逆時針轉 90 度：右上（綠）到左上、右下（白）到右上、左上（紅）到左下、左下（藍）到右下
        tl, tr, bl, br = px(128, 128), px(384, 128), px(128, 384), px(384, 384)
        self.assertGreater(tl[1], 200)
        self.assertLess(tl[0], 80)
        self.assertGreater(min(tr), 200)
        self.assertGreater(bl[0], 200)
        self.assertLess(bl[1], 80)
        self.assertGreater(br[2], 200)
        self.assertLess(br[0], 80)
        imgs = P["pic_mpf_imgs"](big)
        self.assertEqual(len(imgs), 1)
        sec = big[imgs[0][0]:sum(imgs[0])]
        g = P["pic_iso_meta"](P["pic_jpeg_iso"](sec))
        self.assertAlmostEqual(g["mx"], st, places=3)
        gm = ff("-f", "mjpeg", "-i", "-", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-", data=sec)
        v = sorted(gm)[len(gm) // 2]
        # 增益圖一片 128：Apple 算出來的倍數，跟 Ultra HDR 反算的一樣
        x = 128 / 255
        lin = ((x + 0.099) / 1.099) ** (1 / 0.45)
        apple = 1 + (2 ** st - 1) * lin
        self.assertLess(abs(2 ** (v / 255 * g["mx"]) / apple - 1), 0.05)
        _, small = get(c, f"/a/{code}/i/{p['i']}/s")
        self.assertEqual(P["pic_mpf_imgs"](small), [])                      # 小圖不帶增益圖

    def test_raw(self):
        """相機原始檔：同名的 JPEG 在就收在它底下（標 RW2），只有原始檔的用相機的預覽做小圖"""
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        code = self.album(c, "色彩")
        ps = shot(c, code, lambda ps: "qs" in ps.get("P1000002.RW2", {}))
        self.assertNotIn("P1000001.RW2", ps)
        self.assertEqual(ps["P1000001.JPG"]["rw"], "RW2")
        self.assertEqual(ps["P1000002.RW2"]["rw"], "RW2")
        st, s = get(c, f"/a/{code}/i/{ps['P1000002.RW2']['i']}/s")
        self.assertEqual(st, 200)
        self.assertEqual(s[:2], b"\xff\xd8")


if __name__ == "__main__":
    unittest.main()
