# ruff: noqa: F821
"""照片解碼的細節（相簿用，`pic_` 開頭）：
- 色彩：讀出照片的色彩描述檔（ICC），做小圖大圖時照原樣放回去；沒放描述檔、只在 EXIF 標 Adobe RGB 的相機照片補上 Adobe RGB
- HEIC／HEIF：自己拆拼圖（iPhone 的照片是 512×512 一塊一塊），交給 ffmpeg 解 HEVC 再拼回來（ffmpeg 6 打不開 HEIC）
- HDR：iPhone（HEIC／JPEG）的增益圖、Android Ultra HDR、ISO 21496-1，做成大圖時一起帶著（Ultra HDR JPEG：XMP＋ISO＋MPF）
- 相機原始檔：取出相機放在裡面的全尺寸 JPEG 預覽
sentinel.py 用 include("photo.py") 載入（在 album.py 前面），跟它共用同一組變數"""

import math as _pm
import struct
import zlib as _pz

# ── 色彩描述檔（ICC） ──
PIC_PRIM = {                                       # 原色和白點（CIE xy）
    "p3": ((0.680, 0.320), (0.265, 0.690), (0.150, 0.060)),
    "adobe": ((0.640, 0.330), (0.210, 0.710), (0.150, 0.060)),
    "2020": ((0.708, 0.292), (0.170, 0.797), (0.131, 0.046)),
    "srgb": ((0.640, 0.330), (0.300, 0.600), (0.150, 0.060)),
}
PIC_D65 = (0.3127, 0.3290)
PIC_D50 = (0.9642, 1.0, 0.8249)
PIC_CSN = {"p3": "Display P3", "adobe": "Adobe RGB", "2020": "Rec. 2020"}
PIC_ICC = {}


def _m3(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def _inv3(m):
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    return [[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
            [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
            [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]]


def _xyz(xy):
    return [xy[0] / xy[1], 1.0, (1 - xy[0] - xy[1]) / xy[1]]


def pic_rgb2xyz50(name):
    """這組原色換成 D50 的 XYZ（Bradford，ICC 規定的做法）"""
    p = PIC_PRIM[name]
    cols = [_xyz(c) for c in p]
    m = [[cols[j][i] for j in range(3)] for i in range(3)]
    w = _xyz(PIC_D65)
    s = [sum(r * w2 for r, w2 in zip(row, w)) for row in _inv3(m)]
    m = [[m[i][j] * s[j] for j in range(3)] for i in range(3)]
    return _m3(pic_chad(), m)


def pic_chad():
    ba = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]]
    ws, wd = _xyz(PIC_D65), PIC_D50
    cs = [sum(ba[i][k] * ws[k] for k in range(3)) for i in range(3)]
    cd = [sum(ba[i][k] * wd[k] for k in range(3)) for i in range(3)]
    d = [[cd[i] / cs[i] if i == j else 0 for j in range(3)] for i in range(3)]
    return _m3(_inv3(ba), _m3(d, ba))


def _s15(v):
    return struct.pack(">i", int(round(v * 65536)))


def pic_icc_make(name):
    """自己做一份 ICC v4 的描述檔（Display P3、Adobe RGB）"""
    if name in PIC_ICC:
        return PIC_ICC[name]
    m = pic_rgb2xyz50(name)

    def mluc(s):
        u = s.encode("utf-16-be")
        return b"mluc\0\0\0\0" + struct.pack(">II", 1, 12) + b"enUS" + struct.pack(">II", len(u), 28) + u

    def xyz(v):
        return b"XYZ \0\0\0\0" + b"".join(_s15(x) for x in v)
    if name == "adobe":
        trc = b"para\0\0\0\0" + struct.pack(">HH", 0, 0) + _s15(563 / 256)
    elif name == "2020":                           # Rec.709／2020 的曲線
        trc = b"para\0\0\0\0" + struct.pack(">HH", 3, 0) + b"".join(_s15(x) for x in (1 / 0.45, 1 / 1.099, 0.099 / 1.099, 1 / 4.5, 0.081))
    else:                                          # sRGB 那條曲線（Display P3 也用這條）
        trc = b"para\0\0\0\0" + struct.pack(">HH", 3, 0) + b"".join(_s15(x) for x in (2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045))
    tags = [(b"desc", mluc(PIC_CSN[name])), (b"cprt", mluc("No copyright, use freely")), (b"wtpt", xyz(PIC_D50)),
            (b"chad", b"sf32\0\0\0\0" + b"".join(_s15(x) for r in pic_chad() for x in r)),
            (b"rXYZ", xyz([m[0][0], m[1][0], m[2][0]])), (b"gXYZ", xyz([m[0][1], m[1][1], m[2][1]])),
            (b"bXYZ", xyz([m[0][2], m[1][2], m[2][2]])), (b"rTRC", trc), (b"gTRC", trc), (b"bTRC", trc)]
    off = 128 + 4 + 12 * len(tags)
    table, body, seen = [], b"", {}
    for sig, data in tags:
        if data in seen:
            table.append((sig, *seen[data]))
            continue
        while (off + len(body)) % 4:
            body += b"\0"
        seen[data] = (off + len(body), len(data))
        table.append((sig, off + len(body), len(data)))
        body += data
    while len(body) % 4:
        body += b"\0"
    size = off + len(body)
    hdr = (struct.pack(">I", size) + b"\0\0\0\0" + struct.pack(">I", 0x04300000) + b"mntrRGB XYZ " + struct.pack(">6H", 2024, 1, 1, 0, 0, 0)
           + b"acsp" + b"\0" * 24 + struct.pack(">I", 0) + b"".join(_s15(x) for x in PIC_D50) + b"\0" * 4 + b"\0" * 16 + b"\0" * 28)
    out = hdr + struct.pack(">I", len(tags)) + b"".join(s + struct.pack(">II", o, n) for s, o, n in table) + body
    PIC_ICC[name] = out
    return out


def pic_icc_name(icc):
    """描述檔叫什麼（給網頁看的）：sRGB 回空字串"""
    if not icc or len(icc) < 132:
        return ""
    try:
        n = struct.unpack(">I", icc[128:132])[0]
        for i in range(min(n, 64)):
            sig, o, ln = struct.unpack(">4sII", icc[132 + i * 12:144 + i * 12])
            if sig != b"desc":
                continue
            t = icc[o:o + ln]
            if t[:4] == b"mluc":
                cnt, rs = struct.unpack(">II", t[8:16])
                if cnt:
                    sl, so = struct.unpack(">II", t[20:28])
                    s = t[so:so + sl].decode("utf-16-be", "replace")
                else:
                    s = ""
            elif t[:4] == b"desc":
                cnt = struct.unpack(">I", t[8:12])[0]
                s = t[12:12 + cnt].split(b"\0")[0].decode("latin-1")
            else:
                s = ""
            s = s.strip()
            low = s.lower()
            if "srgb" in low or "iec61966" in low:
                return ""
            if "p3" in low:
                return "Display P3"
            if "adobe" in low or "1998" in low:
                return "Adobe RGB"
            if "2020" in low:
                return "Rec. 2020"
            if "prophoto" in low or "romm" in low:
                return "ProPhoto RGB"
            return s[:40]
    except (struct.error, ValueError):
        pass
    return ""


def pic_jpeg_segs(b, limit=None):
    """JPEG 的每一段：(標記, 內容開始, 內容結束)，到 SOS 為止"""
    p, n = 2, len(b) if limit is None else min(len(b), limit)
    while p + 4 <= n and b[p] == 0xFF:
        mk = b[p + 1]
        if mk == 0xFF:
            p += 1
            continue
        if mk in (0xD8, 0x01) or 0xD0 <= mk <= 0xD7:
            p += 2
            continue
        ln = struct.unpack(">H", b[p + 2:p + 4])[0]
        yield mk, p + 4, p + 2 + ln
        if mk == 0xDA:
            return
        p += 2 + ln


def pic_jpeg_icc(b):
    """JPEG 裡的 ICC（APP2 ICC_PROFILE，可能分好幾段）"""
    parts = {}
    for mk, s, e in pic_jpeg_segs(b):
        if mk == 0xE2 and b[s:s + 12] == b"ICC_PROFILE\0":
            parts[b[s + 12]] = b[s + 14:e]
    return b"".join(parts[k] for k in sorted(parts)) if parts else None


def pic_icc_put(jpeg, icc):
    """把 ICC 放進 ffmpeg 做出來的 JPEG（拿掉原本的，放在 SOI／JFIF 後面）"""
    if not jpeg or jpeg[:2] != b"\xff\xd8":
        return jpeg
    keep, at = [], 2
    for mk, s, e in pic_jpeg_segs(jpeg):
        if mk == 0xE0 and at == s - 4:
            at = e
        if mk == 0xE2 and jpeg[s:s + 12] == b"ICC_PROFILE\0":
            keep.append((s - 4, e))
    out, p = b"", 0
    for s, e in keep:
        out += jpeg[p:s]
        p = e
    out += jpeg[p:]
    at -= sum(e - s for s, e in keep if s < at)
    if not icc:
        return out
    n = (len(icc) + 65518) // 65519
    seg = b""
    for i in range(n):
        c = icc[i * 65519:(i + 1) * 65519]
        seg += b"\xff\xe2" + struct.pack(">H", 2 + 14 + len(c)) + b"ICC_PROFILE\0" + bytes([i + 1, n]) + c
    return out[:at] + seg + out[at:]


def pic_png_icc(path):
    try:
        with open(path, "rb") as f:
            b = f.read(1 << 20)
    except OSError:
        return None
    p = 8
    while p + 8 <= len(b):
        ln, typ = struct.unpack(">I4s", b[p:p + 8])
        if typ == b"iCCP":
            d = b[p + 8:p + 8 + ln]
            z = d.find(b"\0")
            try:
                return _pz.decompress(d[z + 2:])
            except (_pz.error, ValueError):
                return None
        if typ in (b"IDAT", b"IEND"):
            return None
        p += 12 + ln
    return None


def pic_webp_icc(path):
    try:
        with open(path, "rb") as f:
            b = f.read(1 << 20)
    except OSError:
        return None
    p = 12
    while p + 8 <= len(b):
        typ, ln = b[p:p + 4], struct.unpack("<I", b[p + 4:p + 8])[0]
        if typ == b"ICCP":
            return b[p + 8:p + 8 + ln]
        if typ in (b"VP8 ", b"VP8L", b"ANIM"):
            return None
        p += 8 + ln + (ln & 1)
    return None


# ── TIFF（EXIF）的每一格：給相機專屬資訊、色彩空間、Apple 的 HDR 數值用 ──
def pic_tiff_walk(b, base=0, e=None, off=None, depth=0, kind="0"):
    """走過 TIFF 的 IFD：產生 (哪一層, 標籤, 型別, 個數, 值在 b 的位置)；e 是位元組順序"""
    if e is None:
        if len(b) < base + 8 or b[base:base + 2] not in (b"II", b"MM"):
            return
        e = "<" if b[base:base + 2] == b"II" else ">"
        off = struct.unpack_from(e + "I", b, base + 4)[0]
    seen = 0
    while off and depth < 6 and seen < 4:
        p0 = base + off
        if not 0 <= p0 < len(b) - 2:
            return
        n = struct.unpack_from(e + "H", b, p0)[0]
        if n > 1024 or p0 + 2 + n * 12 > len(b):
            return
        for i in range(n):
            p = p0 + 2 + i * 12
            tag, typ, cnt = struct.unpack_from(e + "HHI", b, p)
            sz = TIFF_SZ.get(typ, 0) * cnt
            vo = p + 8 if sz <= 4 else base + struct.unpack_from(e + "I", b, p + 8)[0]
            if not sz or vo + sz > len(b):
                continue
            yield kind, tag, typ, cnt, vo, e
            sub = {0x8769: "x", 0x8825: "g", 0xA005: "i"}.get(tag)
            if sub and typ in (4, 13):
                yield from pic_tiff_walk(b, base, e, struct.unpack_from(e + "I", b, vo)[0], depth + 1, sub)
            elif tag == 0x014A and kind == "0":    # SubIFDs（相機原始檔的大圖在這裡）
                for j in range(min(cnt, 8)):
                    yield from pic_tiff_walk(b, base, e, struct.unpack_from(e + "I", b, vo + 4 * j)[0], depth + 1, "s")
        if kind != "0":
            return
        p = p0 + 2 + n * 12
        off = struct.unpack_from(e + "I", b, p)[0] if p + 4 <= len(b) else 0
        kind, seen = "1", seen + 1


def pic_tval(b, typ, cnt, vo, e):
    """一格的值（數字、分數變小數、文字）"""
    if typ == 2:
        return b[vo:vo + cnt].split(b"\0")[0].decode("utf-8", "replace").strip()
    if typ in (5, 10):
        r = [struct.unpack_from(e + ("II" if typ == 5 else "ii"), b, vo + 8 * j) for j in range(min(cnt, 16))]
        r = [x / y if y else 0.0 for x, y in r]
    elif typ in (3, 8):
        r = list(struct.unpack_from(e + ("H" if typ == 3 else "h") * min(cnt, 64), b, vo))
    elif typ in (4, 9, 13):
        r = list(struct.unpack_from(e + ("I" if typ in (4, 13) else "i") * min(cnt, 64), b, vo))
    elif typ == 11:
        r = list(struct.unpack_from(e + "f" * min(cnt, 64), b, vo))
    elif typ == 12:
        r = list(struct.unpack_from(e + "d" * min(cnt, 64), b, vo))
    elif typ in (1, 6, 7):
        return b[vo:vo + cnt]
    else:
        return None
    return r[0] if len(r) == 1 else r


def pic_exif_more(b):
    """EXIF 裡 album.py 沒讀的：色彩空間、Apple 的 HDR 數值、製造商資料（MakerNote）的位置"""
    out = {}
    for kind, tag, typ, cnt, vo, e in pic_tiff_walk(b):
        if kind == "x" and tag == 0xA001:
            out["csp"] = pic_tval(b, typ, cnt, vo, e)
        elif kind == "i" and tag == 0x0001:
            out["iop"] = pic_tval(b, typ, cnt, vo, e)
        elif kind == "x" and tag == 0x927C:
            out["mkn"] = (vo, cnt)
        elif kind == "0" and tag == 0x010F:
            out["make"] = pic_tval(b, typ, cnt, vo, e)
    mk = out.get("mkn")
    if mk and b[mk[0]:mk[0] + 9] == b"Apple iOS":         # Apple：「Apple iOS\0」＋版本＋位元組順序，IFD 的位置從 MakerNote 開頭算
        s = mk[0]
        e = "<" if b[s + 12:s + 14] == b"II" else ">"
        for kind, tag, typ, cnt, vo, e2 in pic_tiff_walk(b, s, e, 14, 1, "a"):
            if tag in (0x21, 0x30):
                v = pic_tval(b, typ, cnt, vo, e2)
                if isinstance(v, (int, float)):
                    out[f"a{tag}"] = float(v)
    return out


# ── 製造商資料（MakerNote）：相機的風格設定；標籤和數值照 ExifTool 整理的表，表上沒有的一律不寫 ──
PIC_PANA_ST = {0: "自動", 2: "鮮豔", 3: "自然", 4: "單色", 5: "風景", 6: "人像", 8: "Cinelike D", 9: "Cinelike V",
               11: "L.單色", 12: "Like709", 15: "L.單色D", 17: "V-Log", 18: "Cinelike D2"}
PIC_PANA_IS = {2: "光學防手震", 3: "關", 5: "光學防手震・追焦", 6: "機身防手震", 7: "機身防手震・追焦",
               9: "Dual I.S.", 10: "Dual I.S.・追焦", 11: "Dual I.S. 2", 12: "Dual I.S. 2・追焦"}
PIC_PANA_AF = {1: "自動對焦", 2: "手動對焦", 6: "單次對焦", 7: "連續對焦", 8: "彈性對焦"}
PIC_PANA_SUB = {1: "人（眼、臉、身體）", 2: "動物", 3: "人（眼、臉）", 4: "動物身體", 5: "動物（眼、身體）", 6: "汽車", 7: "機車",
                8: "汽車", 9: "機車", 10: "火車", 11: "火車", 12: "飛機", 13: "飛機"}
PIC_PANA_MF = {1: "黃色濾鏡", 2: "橘色濾鏡", 3: "紅色濾鏡", 4: "綠色濾鏡"}
PIC_PANA_BK = {1: 3, 2: 3, 3: 5, 4: 5, 5: 7, 6: 7}    # 包圍曝光：幾張
PIC_PANA_GR = {1: "粒子 弱", 2: "粒子 標準", 3: "粒子 強"}
PIC_FUJI_FM = {0x000: "PROVIA／標準", 0x120: "ASTIA／柔和", 0x200: "Velvia／鮮豔", 0x400: "Velvia", 0x500: "PRO Neg. Std",
               0x501: "PRO Neg. Hi", 0x600: "經典正片 CLASSIC CHROME", 0x700: "ETERNA／電影", 0x800: "經典負片 CLASSIC Neg.",
               0x900: "ETERNA 漂白效果", 0xa00: "懷舊負片 NOSTALGIC Neg.", 0xb00: "REALA ACE"}
PIC_FUJI_BW = {0x300: "單色", 0x301: "單色＋紅色濾鏡", 0x302: "單色＋黃色濾鏡", 0x303: "單色＋綠色濾鏡", 0x310: "棕褐色",
               0x500: "ACROS", 0x501: "ACROS＋紅色濾鏡", 0x502: "ACROS＋黃色濾鏡", 0x503: "ACROS＋綠色濾鏡"}
PIC_FUJI_GR = {16: "粒子 弱・小", 32: "粒子 弱", 48: "粒子 強・小", 64: "粒子 強"}
PIC_FUJI_CC = {32: "色彩效果 弱", 64: "色彩效果 強"}
PIC_SONY_ST = {"Standard": "標準", "Vivid": "鮮豔", "Portrait": "人像", "Landscape": "風景", "Sunset": "日落", "Nightview": "夜景",
               "BW": "黑白", "Neutral": "中性", "Clear": "清晰", "Deep": "深色", "Light": "淺色", "Autumnleaves": "秋葉",
               "Sepia": "棕褐色", "VV2": "VV2", "FL": "FL", "IN": "IN", "SH": "SH"}
PIC_CANON_ST = {0x81: "標準", 0x82: "人像", 0x83: "風景", 0x84: "中性", 0x85: "忠實", 0x86: "單色", 0x87: "自動", 0x88: "細緻",
                0x21: "使用者自訂 1", 0x22: "使用者自訂 2", 0x23: "使用者自訂 3"}
PIC_NIKON_ST = {"STANDARD": "標準", "NEUTRAL": "中性", "VIVID": "鮮豔", "MONOCHROME": "單色", "PORTRAIT": "人像",
                "LANDSCAPE": "風景", "FLAT": "平面", "AUTO": "自動", "RICH TONE PORTRAIT": "豐富色調人像",
                "FLAT MONOCHROME": "平面單色", "DEEP TONE MONOCHROME": "深色調單色"}


def pic_maker(b, more):
    """回傳 {"sl": 這家怎麼叫, "st": 風格, "fx": [效果], "lut": LUT, "is": 防手震, "af": 對焦, "sub": 辨識, "ln": 鏡頭}；讀不到的不放"""
    mk = more.get("mkn")
    make = (more.get("make") or "").upper()
    if not mk or len(b) < 8:
        return {}
    s, n = mk
    e0 = "<" if b[:2] == b"II" else ">"
    v, raw = {}, {}
    try:
        if b[s:s + 9] == b"Panasonic":
            walk = pic_tiff_walk(b, 0, e0, s + 12, 1, "m")
            name = "pana"
        elif b[s:s + 8] == b"FUJIFILM":
            walk = pic_tiff_walk(b, s, "<", struct.unpack_from("<I", b, s + 8)[0], 1, "m")
            name = "fuji"
        elif b[s:s + 6] == b"Nikon\0" and b[s + 10:s + 12] in (b"II", b"MM"):
            e = "<" if b[s + 10:s + 12] == b"II" else ">"
            walk = pic_tiff_walk(b, s + 10, e, struct.unpack_from(e + "I", b, s + 14)[0], 1, "m")
            name = "nikon"
        elif b[s:s + 9] in (b"SONY DSC ", b"SONY CAM "):
            walk = pic_tiff_walk(b, 0, e0, s + 12, 1, "m")
            name = "sony"
        elif make.startswith("CANON"):
            walk = pic_tiff_walk(b, 0, e0, s, 1, "m")
            name = "canon"
        else:
            return {}
        for kind, tag, typ, cnt, vo, e in walk:
            if vo + TIFF_SZ.get(typ, 0) * cnt > s + n + (1 << 16):   # 跑出製造商資料太遠的不算
                continue
            v[tag] = (typ, pic_tval(b, typ, cnt, vo, e))
            if tag in (0x26, 0x3C, 0xB7) and name in ("canon", "nikon"):   # 對焦點的整段資料（比 pic_tval 讀的 64 格長）
                raw[tag] = (b[vo:vo + TIFF_SZ.get(typ, 0) * cnt], e)
    except (struct.error, IndexError, ValueError):
        return {}

    def num(tag, typs=(3, 4, 8, 9)):
        t = v.get(tag)
        return t[1] if t and t[0] in typs and isinstance(t[1], int) else None

    def txt(tag):
        t = v.get(tag)
        return t[1].strip() if t and t[0] == 2 and isinstance(t[1], str) else ""

    def arr(tag, e):                                   # 一串 16 位元整數（有的相機標成 undefined，自己拆）
        t = v.get(tag)
        if not t:
            return []
        if isinstance(t[1], bytes):
            return list(struct.unpack_from(e + "H" * (len(t[1]) // 2), t[1]))
        return t[1] if isinstance(t[1], list) else [t[1]] if isinstance(t[1], int) else []

    def s16(n):
        return n - 65536 if isinstance(n, int) and n > 32767 else n
    out, fx, kv = {}, [], None
    if name == "pana":
        out["sl"] = "相片風格"
        st = num(0x89)
        if st in PIC_PANA_ST:
            out["st"] = PIC_PANA_ST[st]
        if st in (4, 11, 15):                          # 單色才有濾鏡、粒子
            if num(0xAC) in PIC_PANA_MF:
                fx.append(PIC_PANA_MF[num(0xAC)])
            if num(0xD2) in PIC_PANA_GR:
                fx.append(PIC_PANA_GR[num(0xD2)])
        luts = []
        for nt, ot in ((0xF1, 0xF3), (0xF4, 0xF5)):
            ln, op = txt(nt), v.get(ot)
            op = op[1] if op else None
            op = op[0] if isinstance(op, bytes) and len(op) == 1 else op if isinstance(op, int) else None   # int8u 讀出來是位元組
            if ln and op:
                luts.append(f"{ln[:40]} {op}%" if op != 100 else ln[:40])
        if luts:
            out["lut"] = "＋".join(luts)
        if num(0x1A) in PIC_PANA_IS:
            out["is"] = PIC_PANA_IS[num(0x1A)]
        if num(0x07) in PIC_PANA_AF:
            out["af"] = PIC_PANA_AF[num(0x07)]
        if num(0xE9) in PIC_PANA_SUB:
            out["sub"] = PIC_PANA_SUB[num(0xE9)]
        if num(0xD4) == 1:
            out["hlg"] = 1
        kv = num(0x44)
        if txt(0x51):
            out["ln"] = txt(0x51)[:80]
        t = v.get(0x4D)                                # AFPointPosition：對焦點（0～1 的比例），手動對焦不算
        if num(0x07) != 2 and t and t[0] == 5 and isinstance(t[1], list) and len(t[1]) == 2:
            out["fp"] = (t[1][0], t[1][1], 1, 1)
        if num(0x45) in PIC_PANA_BK:                   # BracketSettings：包圍曝光幾張
            out["bk"] = PIC_PANA_BK[num(0x45)]
        ab, gm = s16(num(0x46)), s16(num(0x47))        # WBShiftAB（正的往藍）、WBShiftGM（正的往綠）
        if isinstance(ab, int) and isinstance(gm, int) and (ab or gm) and abs(ab) <= 9 and abs(gm) <= 9:
            out["ws"] = [-ab, gm, "ab"]
        fd = arr(0x4E, e0)                             # FaceDetInfo：幾張臉，每張 X、Y 和寬、高（寬 320、高照照片比例的畫面）
        if fd and 0 < fd[0] <= 5 and len(fd) >= 1 + 4 * fd[0]:
            # 拿使用者 S5IIX 的照片核對過：X、Y 是眼睛（跟對焦點同一點），框比整張臉小一點：往下移一點、放大 1.3 倍才包住額頭到下巴
            out["fc"] = [(f[0], f[1] + f[3] * .25, f[2] * 1.3, f[3] * 1.3) for f in (fd[1 + 4 * k:5 + 4 * k] for k in range(fd[0]))]
            out["fcr"] = (320, -1)
    elif name == "fuji":
        out["sl"] = "底片模擬"
        sat = num(0x1003)
        if sat in PIC_FUJI_BW:
            out["st"] = PIC_FUJI_BW[sat]
        elif num(0x1401) in PIC_FUJI_FM:
            out["st"] = PIC_FUJI_FM[num(0x1401)]
        if num(0x1047) in PIC_FUJI_GR:
            fx.append(PIC_FUJI_GR[num(0x1047)])
        if num(0x1048) in PIC_FUJI_CC:
            fx.append(PIC_FUJI_CC[num(0x1048)])
        kv = num(0x1005) if num(0x1002) == 0xFF0 else None   # 富士只有白平衡設成「色溫」時才寫
        t = v.get(0x1031)                              # FocusPixel：對焦點（照片的像素位置）
        if t and t[0] == 3 and isinstance(t[1], list) and len(t[1]) == 2:
            out["fp"] = (t[1][0], t[1][1], 0, 0)
        if num(0x1100) == 1:                           # AutoBracketing
            out["bk"] = 1
        t = v.get(0x100A)                              # WhiteBalanceFineTune：紅、藍各偏多少（一格是 20）
        if t and t[0] in (8, 9) and isinstance(t[1], list) and len(t[1]) == 2 and any(t[1]):
            u = 20 if all(n % 20 == 0 for n in t[1]) else 10 if all(n % 10 == 0 for n in t[1]) else 1
            r_, b_ = t[1][0] // u, t[1][1] // u
            if abs(r_) <= 9 and abs(b_) <= 9:
                out["ws"] = [r_, b_, "rb"]
        n_ = num(0x4100)                               # FacesDetected＋FacePositions：每張臉的左、上、右、下（照片本身的像素）
        fp_ = arr(0x4103, "<")
        if n_ and 0 < n_ <= 5 and len(fp_) >= 4 * n_:
            out["fc"] = [((fp_[4 * k] + fp_[4 * k + 2]) / 2, (fp_[4 * k + 1] + fp_[4 * k + 3]) / 2, fp_[4 * k + 2] - fp_[4 * k], fp_[4 * k + 3] - fp_[4 * k + 1]) for k in range(n_)]
            out["fcr"] = (0, 0)
    elif name == "sony":
        cs = txt(0xB020)
        if cs in PIC_SONY_ST:
            out["sl"] = "創意外觀" if cs in ("VV2", "FL", "IN", "SH") else "創意風格"
            out["st"] = PIC_SONY_ST[cs]
        kv = num(0xB021)                               # 0 是自動（沒寫幾 K）
        t = v.get(0x2027)                              # FocusLocation：寬、高、對焦點 X、Y
        if t and t[0] == 3 and isinstance(t[1], list) and len(t[1]) == 4 and t[1][0] and t[1][1]:
            out["fp"] = (t[1][2], t[1][3], t[1][0], t[1][1])
    elif name == "canon":
        t = v.get(0xA0)
        if t and t[0] == 3 and isinstance(t[1], list) and len(t[1]) > 10 and t[1][10] in PIC_CANON_ST:
            out["sl"] = "相片風格"
            out["st"] = PIC_CANON_ST[t[1][10]]
        if t and t[0] == 3 and isinstance(t[1], list) and len(t[1]) > 9:
            kv = t[1][9]
        if t and t[0] in (3, 8) and isinstance(t[1], list) and len(t[1]) > 13:   # ProcessingInfo 12／13：WBShiftAB（正的往琥珀）、WBShiftGM（正的往綠）
            ab, gm = s16(t[1][12]), s16(t[1][13])
            if (ab or gm) and abs(ab) <= 9 and abs(gm) <= 9:
                out["ws"] = [ab, gm, "ab"]
        if txt(0x95):
            out["ln"] = txt(0x95)[:80]
        t = v.get(0x04)                                # ShotInfo：對焦距離的上下限（公分，655.35 公尺以上是無限遠）
        if t and t[0] == 3 and isinstance(t[1], list) and len(t[1]) > 20 and t[1][19]:
            up, lo = t[1][19] / 100, t[1][20] / 100
            if up < 655:
                out["fd"] = round((up + lo) / 2 if 0 < lo <= up else up, 2)
        fp = pic_canon_af(*(raw.get(0x26) or raw.get(0x3C) or (b"", "<")))
        if fp:
            out["fp"] = fp
    elif name == "nikon":
        t = v.get(0x23)
        if t and t[0] == 7 and isinstance(t[1], bytes) and t[1][:2] in (b"01", b"02", b"03"):
            o = 8 if t[1][:2] == b"03" else 4
            pc = t[1][o:o + 20].split(b"\0")[0].decode("ascii", "replace").strip().upper()
            if pc in PIC_NIKON_ST:
                out["sl"] = "優化校準"
                out["st"] = PIC_NIKON_ST[pc]
        fp = pic_nikon_af(*(raw.get(0xB7) or (b"", "<")))
        if fp:
            out["fp"] = fp
    if fx:
        out["fx"] = fx
    if isinstance(kv, int) and 1800 <= kv <= 15000:   # 拍攝時的白平衡色溫（K）
        out["k"] = kv
    if list(out) in (["sl"], []):
        return {}
    return out


def pic_canon_af(d, e):
    """Canon AFInfo2／AFInfo3：對準的那幾個對焦點合起來的中心和大小；座標以畫面中間為原點、往上是正"""
    if len(d) < 16:
        return None
    w = list(struct.unpack_from(e + "%dh" % (len(d) // 2), d))
    n, aw, ah = w[2], w[6], w[7]
    if w[1] == 0 or not 0 < n <= 1024 or aw <= 0 or ah <= 0 or len(w) < 8 + 4 * n + (n + 15) // 16:
        return None                                    # 手動對焦
    ws, hs, xs, ys = (w[8 + k * n:8 + (k + 1) * n] for k in range(4))
    bits = w[8 + 4 * n:8 + 4 * n + (n + 15) // 16]
    on = [i for i in range(n) if (bits[i // 16] >> (i % 16)) & 1 and ws[i] > 0]
    if not on:
        return None
    x0 = min(xs[i] - ws[i] / 2 for i in on) + aw / 2
    x1 = max(xs[i] + ws[i] / 2 for i in on) + aw / 2
    y0 = ah / 2 - max(ys[i] + hs[i] / 2 for i in on)
    y1 = ah / 2 - min(ys[i] - hs[i] / 2 for i in on)
    return ((x0 + x1) / 2, (y0 + y1) / 2, aw, ah, max(.04, min(.3, max(x1 - x0, y1 - y0) / min(aw, ah))))


PIC_NIKON_AF = {b"0100": (0x10, 1), b"0101": (0x46, 1), b"0300": (0x2A, 0), b"0301": (0x2A, 0),
                b"0400": (0x3E, 0), b"0401": (0x3E, 0), b"0402": (0x3E, 0)}   # 版本 → (寬高、位置、框大小那段的位置, 只有反差對焦才有)


def pic_nikon_af(d, e):
    """Nikon AFInfo2：對焦框的中心和大小（左上角是原點）；Z 系列要「有座標」那一格是 1"""
    o = PIC_NIKON_AF.get(d[:4])
    if not o or len(d) < o[0] + 12:
        return None
    if (d[4] != 1) if o[1] else (d[7] != 1):           # 單眼的觀景窗對焦只有點的編號，沒有座標
        return None
    iw, ih, x, y, bw, bh = struct.unpack_from(e + "6H", d, o[0])
    if not (iw and ih and x and y):
        return None
    return (x, y, iw, ih, max(.04, min(.3, max(bw, bh) / min(iw, ih))) if bw and bh else .1)


def pic_cs(icc, more):
    """照片的色彩空間：(ICC 位元組, 名稱)；sRGB 回 (None, "")"""
    if icc:
        n = pic_icc_name(icc)
        return (icc, n) if n else (None, "")
    if more.get("csp") == 0xFFFF and more.get("iop") == "R03":   # 相機設 Adobe RGB：EXIF 色彩空間「未校正」＋ R03
        return pic_icc_make("adobe"), "Adobe RGB"
    return None, ""


# ── HEIF／HEIC：拆項目、拼圖 ──
def pic_heif(path):
    """讀 HEIF 的項目表；回傳 dict 或 None"""
    try:
        with open(path, "rb") as f:
            size = os.path.getsize(path)
            meta = next(((s, e) for t, s, e in alb_boxes(f, 0, min(size, 1 << 26)) if t == "meta"), None)
            if not meta or meta[1] - meta[0] > 8 << 20:
                return None
            f.seek(meta[0])
            mb = f.read(meta[1] - meta[0])
    except OSError:
        return None
    return pic_heif_meta(mb)


def _bx(b, s, e):
    while s + 8 <= e:
        sz, t = struct.unpack_from(">I4s", b, s)
        hl = 8
        if sz == 1:
            sz, hl = struct.unpack_from(">Q", b, s + 8)[0], 16
        elif sz == 0:
            sz = e - s
        if sz < hl or s + sz > e:
            return
        yield t.decode("latin-1"), s + hl, s + sz
        s += sz


def pic_heif_meta(mb):
    H = {"it": {}, "ref": {}, "pitm": None, "idat": b"", "props": []}
    try:
        kids = {t: (s, e) for t, s, e in _bx(mb, 4, len(mb))}
        if "pitm" in kids:
            s = kids["pitm"][0]
            H["pitm"] = struct.unpack_from(">H" if mb[s] == 0 else ">I", mb, s + 4)[0]
        if "iinf" in kids:
            s, e = kids["iinf"]
            for t, bs, be in _bx(mb, s + (6 if mb[s] == 0 else 8), e):
                if t != "infe" or mb[bs] < 2:
                    continue
                v = mb[bs]
                iid, typ = (struct.unpack_from(">H", mb, bs + 4)[0], mb[bs + 8:bs + 12]) if v == 2 else (struct.unpack_from(">I", mb, bs + 4)[0], mb[bs + 10:bs + 14])
                H["it"][iid] = {"t": typ.decode("latin-1"), "p": [], "ext": [], "cm": 0}
        if "iref" in kids:
            s, e = kids["iref"]
            v = mb[s]
            w = ">H" if v == 0 else ">I"
            n = 2 if v == 0 else 4
            for t, bs, be in _bx(mb, s + 4, e):
                fr = struct.unpack_from(w, mb, bs)[0]
                c = struct.unpack_from(">H", mb, bs + n)[0]
                H["ref"].setdefault(t, {})[fr] = [struct.unpack_from(w, mb, bs + n + 2 + n * j)[0] for j in range(c)]
        if "idat" in kids:
            H["idat"] = mb[kids["idat"][0]:kids["idat"][1]]
        if "iloc" in kids:
            s, e = kids["iloc"]
            v = mb[s]
            osz, lsz, bsz, isz = mb[s + 4] >> 4, mb[s + 4] & 15, mb[s + 5] >> 4, mb[s + 5] & 15
            p = s + 6
            cnt = struct.unpack_from(">H" if v < 2 else ">I", mb, p)[0]
            p += 2 if v < 2 else 4

            def num(k):
                nonlocal p
                r = int.from_bytes(mb[p:p + k], "big") if k else 0
                p += k
                return r
            for _ in range(min(cnt, 8192)):
                iid = num(2 if v < 2 else 4)
                cm = num(2) & 15 if v in (1, 2) else 0
                num(2)
                base = num(bsz)
                ext = []
                for _ in range(num(2)):
                    if v in (1, 2) and isz:
                        num(isz)
                    ext.append((base + num(osz), num(lsz)))
                if iid in H["it"]:
                    H["it"][iid]["ext"], H["it"][iid]["cm"] = ext, cm
        if "iprp" in kids:
            ip = {t: (s, e) for t, s, e in _bx(mb, *kids["iprp"])}
            if "ipco" in ip:
                H["props"] = [(t, mb[s:e]) for t, s, e in _bx(mb, *ip["ipco"])]
            if "ipma" in ip:
                s, e = ip["ipma"]
                v, fl = mb[s], int.from_bytes(mb[s + 1:s + 4], "big")
                p = s + 4
                n = struct.unpack_from(">I", mb, p)[0]
                p += 4
                for _ in range(min(n, 8192)):
                    iid = struct.unpack_from(">H" if v < 1 else ">I", mb, p)[0]
                    p += 2 if v < 1 else 4
                    c = mb[p]
                    p += 1
                    for _ in range(c):
                        if fl & 1:
                            ix = struct.unpack_from(">H", mb, p)[0] & 0x7FFF
                            p += 2
                        else:
                            ix = mb[p] & 0x7F
                            p += 1
                        if iid in H["it"] and 1 <= ix <= len(H["props"]):
                            H["it"][iid]["p"].append(H["props"][ix - 1])
    except (struct.error, IndexError, ValueError):
        return None
    return H if H["it"] else None


def pic_heif_prop(H, iid, typ):
    return next((d for t, d in H["it"].get(iid, {}).get("p", []) if t == typ), None)


def pic_heif_data(f, H, iid, cap=64 << 20):
    it = H["it"].get(iid)
    if not it:
        return b""
    out = b""
    for off, ln in it["ext"]:
        if it["cm"] == 1:
            out += H["idat"][off:off + ln] if ln else H["idat"][off:]
        else:
            f.seek(off)
            out += f.read(ln if ln else cap)
        if len(out) > cap:
            return b""
    return out


def pic_heif_target(H, iid):
    """iden（換個說法的同一張）就跟過去"""
    for _ in range(4):
        it = H["it"].get(iid)
        if it and it["t"] == "iden":
            iid = (H["ref"].get("dimg", {}).get(iid) or [None])[0]
        else:
            return iid
    return iid


def pic_hvcc_ps(hv):
    """hvcC 裡的 VPS／SPS／PPS（Annex B 格式），NAL 長度用幾個位元組"""
    if not hv or len(hv) < 23:
        return b"", 4
    nl = (hv[21] & 3) + 1
    p, out = 23, b""
    for _ in range(hv[22]):
        if p + 3 > len(hv):
            break
        n = struct.unpack_from(">H", hv, p + 1)[0]
        p += 3
        for _ in range(n):
            ln = struct.unpack_from(">H", hv, p)[0]
            out += b"\0\0\0\1" + hv[p + 2:p + 2 + ln]
            p += 2 + ln
    return out, nl


def pic_annexb(data, nl):
    out, p = [], 0
    while p + nl <= len(data):
        ln = int.from_bytes(data[p:p + nl], "big")
        p += nl
        if ln <= 0 or p + ln > len(data):
            break
        out.append(b"\0\0\0\1" + data[p:p + ln])
        p += ln
    return b"".join(out)


def pic_heif_hevc(path, H, iid):
    """一張（單張或拼圖）→ {"bs": HEVC 位元組, "c": 幾欄, "r": 幾列, "w": 寬, "h": 高, "vf": 裁切轉向}；做不到回 None"""
    iid = pic_heif_target(H, iid)
    it = H["it"].get(iid)
    if not it:
        return None
    try:
        with open(path, "rb") as f:
            if it["t"] == "hvc1":
                tiles, cols, rows = [iid], 1, 1
                isp = pic_heif_prop(H, iid, "ispe")
                ow, oh = struct.unpack_from(">II", isp, 4) if isp else (0, 0)
            elif it["t"] == "grid":
                g = pic_heif_data(f, H, iid)
                if len(g) < 8:
                    return None
                big = g[1] & 1
                rows, cols = g[2] + 1, g[3] + 1
                ow, oh = struct.unpack_from(">II" if big else ">HH", g, 4)
                tiles = H["ref"].get("dimg", {}).get(iid) or []
                if len(tiles) != rows * cols or any(H["it"].get(t, {}).get("t") != "hvc1" for t in tiles):
                    return None
            else:
                return None
            bs = []
            for t in tiles:
                ps, nl = pic_hvcc_ps(pic_heif_prop(H, t, "hvcC"))
                d = pic_heif_data(f, H, t)
                if not ps or not d:
                    return None
                bs.append(ps + pic_annexb(d, nl))
    except OSError:
        return None
    vf = []
    if it["t"] == "grid" or len(tiles) == 1:
        vf.append(f"crop={ow}:{oh}:0:0" if it["t"] == "grid" else "")
    for t, d in it["p"]:                            # 裁切、轉向、鏡像照 HEIF 規定的順序
        if t == "clap" and len(d) >= 32:
            wn, wd, hn, hd, xn, xd, yn, yd = struct.unpack(">IIIIiIiI", d[:32])
            if wd and hd and xd and yd:
                cw, ch = wn // wd, hn // hd
                x0 = int((ow - 1) / 2 + xn / xd - (cw - 1) / 2)
                y0 = int((oh - 1) / 2 + yn / yd - (ch - 1) / 2)
                if 0 < cw <= ow and 0 < ch <= oh:
                    vf.append(f"crop={cw}:{ch}:{max(0, x0)}:{max(0, y0)}")
        elif t == "irot" and d:
            vf.append({1: "transpose=2", 2: "hflip,vflip", 3: "transpose=1"}.get(d[0] & 3, ""))
        elif t == "imir" and d:
            vf.append("vflip" if d[0] & 1 else "hflip")
    tile = f"tile={cols}x{rows}" if cols * rows > 1 else ""
    return {"bs": b"".join(bs), "c": cols, "r": rows, "w": ow, "h": oh, "vf": ",".join(x for x in [tile, *vf] if x)}


def pic_heif_colr(H, iid):
    """HEIF 的色彩：(ICC 位元組, nclx (原色, 轉換曲線, 矩陣, 全範圍))"""
    iid = pic_heif_target(H, iid)
    cands = [iid] + ((H["ref"].get("dimg", {}).get(iid) or [])[:1])
    icc = nclx = None
    for c in cands:
        for t, d in H["it"].get(c, {}).get("p", []):
            if t != "colr" or len(d) < 4:
                continue
            if d[:4] in (b"prof", b"rICC") and not icc:
                icc = d[4:]
            elif d[:4] == b"nclx" and len(d) >= 11 and not nclx:
                nclx = struct.unpack(">HHHB", d[4:11])
    return icc, nclx


def pic_heif_aux(H, master, urn):
    for a, tos in H["ref"].get("auxl", {}).items():
        if master in tos:
            c = pic_heif_prop(H, a, "auxC")
            if c and c[4:].split(b"\0")[0].decode("latin-1") == urn:
                return a
    return None


# ── HDR 增益圖 ──
PIC_APPLE_GM = "urn:com:apple:photo:2020:aux:hdrgainmap"
PIC_ISO = b"urn:iso:std:iso:ts:21496:-1\0"


def pic_apple_stops(a33, a48):
    """Apple 公開的算法：MakerNote 33、48 → HDR 比 SDR 亮幾級"""
    if a33 is None or a48 is None:
        return None
    if a33 < 1.0:
        st = -20.0 * a48 + 1.8 if a48 <= 0.01 else -0.101 * a48 + 1.601
    else:
        st = -70.0 * a48 + 3.0 if a48 <= 0.01 else -0.303 * a48 + 2.303
    return max(st, 0.0)


def pic_apple_lut(stops):
    """Apple 的增益圖（Rec.709 曲線、線性倍數 1＋(H−1)g）換成 Ultra HDR 的（log2，0～最大級數）：256 格對照表"""
    hr = 2.0 ** stops
    out = bytearray(256)
    for v in range(256):
        x = v / 255
        g = x / 4.5 if x < 0.081 else ((x + 0.099) / 1.099) ** (1 / 0.45)
        out[v] = max(0, min(255, int(_pm.log2(1 + (hr - 1) * g) / stops * 255 + 0.5))) if stops > 0 else 0
    return bytes(out)


def pic_gm_xmp(xmp):
    """Ultra HDR（Adobe hdrgm）XMP → 增益圖參數（log2 單位）"""
    def one(k, dv):
        m = re.search(r"hdrgm:" + k + r"\s*=\s*\"([-0-9.eE+]+)\"", xmp) or re.search(r"<hdrgm:" + k + r">\s*([-0-9.eE+]+)\s*<", xmp)
        if not m:
            m2 = re.search(r"<hdrgm:" + k + r">\s*<rdf:Seq>(.*?)</rdf:Seq>", xmp, re.S)
            if m2:
                vs = re.findall(r"<rdf:li>\s*([-0-9.eE+]+)\s*</rdf:li>", m2[1])
                if vs:
                    return sum(float(v) for v in vs) / len(vs)
            return dv
        return float(m[1])
    if "hdrgm:Version" not in xmp and "hdrgm:GainMapMax" not in xmp:
        return None
    try:
        g = {"mn": one("GainMapMin", 0.0), "mx": one("GainMapMax", None), "ga": one("Gamma", 1.0),
             "os": one("OffsetSDR", 1 / 64), "oh": one("OffsetHDR", 1 / 64),
             "cn": one("HDRCapacityMin", 0.0), "cx": one("HDRCapacityMax", None)}
    except ValueError:
        return None
    if g["mx"] is None or re.search(r"hdrgm:BaseRenditionIsHDR\s*=\s*\"True\"", xmp):
        return None
    if g["cx"] is None:
        g["cx"] = g["mx"]
    return g if g["mx"] > g["mn"] and g["ga"] > 0 and g["cx"] > g["cn"] else None


def pic_iso_meta(d):
    """ISO 21496-1 的二進位資料 → 增益圖參數（多聲道取平均；反方向〔底圖是 HDR〕的不處理）"""
    try:
        if len(d) < 5:
            return None
        fl = d[4]
        if fl & 0x04:
            return None
        ch = 3 if fl & 0x80 else 1
        p = 5
        if fl & 0x08:                              # 共用一個分母
            cd = struct.unpack_from(">I", d, p)[0]
            bn, an = struct.unpack_from(">II", d, p + 4)
            p += 12
            bd = ad = cd
            vals = []
            for _ in range(ch):
                mn, mx, ga, os_, oh = struct.unpack_from(">iiIii", d, p)
                vals.append((mn, cd, mx, cd, ga, cd, os_, cd, oh, cd))
                p += 20
        else:
            bn, bd, an, ad = struct.unpack_from(">IIII", d, p)
            p += 16
            vals = []
            for _ in range(ch):
                vals.append(struct.unpack_from(">iIiIIIiIiI", d, p))
                p += 40
        avg = [sum(v[i] / v[i + 1] for v in vals) / ch for i in (0, 2, 4, 6, 8)]
        g = {"mn": avg[0], "mx": avg[1], "ga": avg[2], "os": avg[3], "oh": avg[4], "cn": bn / bd, "cx": an / ad}
    except (struct.error, ZeroDivisionError):
        return None
    if not (g["mx"] > g["mn"] and g["ga"] > 0 and g["cx"] > g["cn"]):
        return None
    return g


def _frac(v, signed):
    d = 10000
    n = int(round(v * d))
    if not signed:
        n = max(0, n)
    return n, d


def pic_iso_bytes(g):
    out = struct.pack(">HHB", 0, 0, 0x40)
    out += struct.pack(">II", *_frac(g["cn"], False)) + struct.pack(">II", *_frac(g["cx"], False))
    out += struct.pack(">iI", *_frac(g["mn"], True)) + struct.pack(">iI", *_frac(g["mx"], True))
    out += struct.pack(">II", *_frac(g["ga"], False))
    out += struct.pack(">iI", *_frac(g["os"], True)) + struct.pack(">iI", *_frac(g["oh"], True))
    return out


def _app(mk, data):
    return bytes([0xFF, mk]) + struct.pack(">H", len(data) + 2) + data


def pic_uhdr(base, gm, g):
    """底圖＋增益圖 → Ultra HDR JPEG（Chrome、Android、新的 iPhone 都看得到 HDR；看不了的就是底圖）"""
    if not (base and gm and base[:2] == b"\xff\xd8" and gm[:2] == b"\xff\xd8"):
        return base
    ns = b"http://ns.adobe.com/xap/1.0/\0"
    gx = ('<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.2"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
          '<rdf:Description rdf:about="" xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:Version="1.0"'
          f' hdrgm:GainMapMin="{g["mn"]:.6f}" hdrgm:GainMapMax="{g["mx"]:.6f}" hdrgm:Gamma="{g["ga"]:.6f}"'
          f' hdrgm:OffsetSDR="{g["os"]:.6f}" hdrgm:OffsetHDR="{g["oh"]:.6f}" hdrgm:HDRCapacityMin="{g["cn"]:.6f}"'
          f' hdrgm:HDRCapacityMax="{g["cx"]:.6f}" hdrgm:BaseRenditionIsHDR="False"/></rdf:RDF></x:xmpmeta>').encode()
    sec = b"\xff\xd8" + _app(0xE1, ns + gx) + _app(0xE2, PIC_ISO + pic_iso_bytes(g))
    for mk, s, e in pic_jpeg_segs(gm):            # 增益圖原本的 APP 段都拿掉
        if 0xE0 <= mk <= 0xEF:
            continue
        sec += gm[s - 4:e]
        if mk == 0xDA:
            sec += gm[e:]
            break
    px = ('<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.2"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
          '<rdf:Description xmlns:Container="http://ns.google.com/photos/1.0/container/" xmlns:Item="http://ns.google.com/photos/1.0/container/item/"'
          ' xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:Version="1.0"><Container:Directory><rdf:Seq>'
          '<rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="Primary" Item:Mime="image/jpeg"/></rdf:li>'
          f'<rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="GainMap" Item:Mime="image/jpeg" Item:Length="{len(sec)}"/></rdf:li>'
          '</rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta>').encode()
    sos = next((s - 4 for mk, s, e in pic_jpeg_segs(base) if mk == 0xDA), None)
    if sos is None:
        return base
    jfif = next((base[s - 4:e] for mk, s, e in pic_jpeg_segs(base) if mk == 0xE0), b"")
    icc = b"".join(base[s - 4:e] for mk, s, e in pic_jpeg_segs(base) if mk == 0xE2 and base[s:s + 12] == b"ICC_PROFILE\0")
    other = b"".join(base[s - 4:e] for mk, s, e in pic_jpeg_segs(base) if not (0xE0 <= mk <= 0xEF) and mk != 0xDA)
    pre = b"\xff\xd8" + jfif + _app(0xE1, ns + px) + icc + _app(0xE2, PIC_ISO + b"\0\0\0\0") + other
    mpf_len = 2 + 4 + 4 + 4 + 2 + 3 * 12 + 4 + 2 * 16       # APP2 長度欄位＋「MPF\0」＋內容
    prim = len(pre) + 2 + mpf_len + (len(base) - sos)
    tiff_at = len(pre) + 2 + 2 + 4                 # MPF 的 TIFF 開頭（偏移從這裡算）
    body = b"MM\0\x2a" + struct.pack(">I", 8) + struct.pack(">H", 3)
    body += struct.pack(">HHI", 0xB000, 7, 4) + b"0100"
    body += struct.pack(">HHII", 0xB001, 4, 1, 2)
    body += struct.pack(">HHII", 0xB002, 7, 32, 8 + 2 + 36 + 4) + struct.pack(">I", 0)
    body += struct.pack(">IIIHH", 0x030000, prim, 0, 0, 0)
    body += struct.pack(">IIIHH", 0, len(sec), prim - tiff_at, 0, 0)
    mpf = _app(0xE2, b"MPF\0" + body)
    out = pre + mpf + base[sos:] + sec
    return out if len(pre) + len(mpf) + len(base) - sos == prim else base


def pic_mpf_imgs(b):
    """JPEG 後面接的其他張（MPF）：[(開始, 長度)]（不含第一張）"""
    for mk, s, e in pic_jpeg_segs(b):
        if mk == 0xE2 and b[s:s + 4] == b"MPF\0":
            t = s + 4
            try:
                e2 = "<" if b[t:t + 2] == b"II" else ">"
                off = struct.unpack_from(e2 + "I", b, t + 4)[0]
                n = struct.unpack_from(e2 + "H", b, t + off)[0]
                for i in range(min(n, 32)):
                    tag, typ, cnt, vo = struct.unpack_from(e2 + "HHII", b, t + off + 2 + 12 * i)
                    if tag == 0xB002:
                        out = []
                        for j in range(min(cnt // 16, 8)):
                            at, sz, of, _, _ = struct.unpack_from(e2 + "IIIHH", b, t + vo + 16 * j)
                            if of and t + of + sz <= len(b) and b[t + of:t + of + 2] == b"\xff\xd8":
                                out.append((t + of, sz))
                        return out
            except struct.error:
                return []
    return []


def pic_jpeg_xmp(b):
    for mk, s, e in pic_jpeg_segs(b):
        if mk == 0xE1 and b[s:s + 29] == b"http://ns.adobe.com/xap/1.0/\0":
            return b[s + 29:e].decode("utf-8", "replace")
    return ""


def pic_jpeg_iso(b):
    for mk, s, e in pic_jpeg_segs(b):
        if mk == 0xE2 and b[s:s + len(PIC_ISO)] == PIC_ISO:
            return b[s + len(PIC_ISO):e]
    return None


def pic_jpeg_gm(path, apple_stops=None):
    """JPEG 照片裡的增益圖：(增益圖 JPEG, 參數, 是不是 Apple 的)；沒有回 None"""
    try:
        with open(path, "rb") as f:
            b = f.read(64 << 20)
    except OSError:
        return None
    for s, n in pic_mpf_imgs(b):
        gm = b[s:s + n]
        iso = pic_jpeg_iso(gm)
        g = pic_iso_meta(iso) if iso and len(iso) > 8 else None
        if not g:
            g = pic_gm_xmp(pic_jpeg_xmp(gm))
        if g:
            return gm, g, False
        x = pic_jpeg_xmp(gm)
        if "HDRGainMap" in x and apple_stops:
            return gm, {"mn": 0.0, "mx": apple_stops, "ga": 1.0, "os": 0.0, "oh": 0.0, "cn": 0.0, "cx": apple_stops}, True
    return None


# ── 相機原始檔：拿出相機放在裡面的全尺寸 JPEG 預覽 ──
PIC_RAW = {".rw2", ".arw", ".cr2", ".cr3", ".nef", ".nrw", ".raf", ".orf", ".dng", ".pef", ".srw", ".rwl", ".3fr", ".iiq", ".x3f", ".srf", ".sr2", ".erf", ".kdc", ".mrw", ".raw"}


def pic_raw_jpeg(path):
    """回傳 (開始, 長度) 或 None：挑最大的那張 JPEG"""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            head = f.read(1 << 20)
            cands = []
            if head[:15] == b"FUJIFILMCCD-RAW":           # Fuji RAF：檔頭第 84 個位元組寫 JPEG 在哪
                o, n = struct.unpack_from(">II", head, 84)
                cands.append((o, n))
            elif head[4:8] == b"ftyp" and head[8:12] == b"crx ":   # Canon CR3：第一個軌道就是全尺寸 JPEG
                cands += pic_cr3_jpeg(f, size)
            elif head[:2] in (b"II", b"MM"):
                b = head if size <= len(head) else head + f.read(min(size, 4 << 20) - len(head))
                offs, lens = {}, {}
                for kind, tag, typ, cnt, vo, e in pic_tiff_walk(b):
                    v = pic_tval(b, typ, cnt, vo, e)
                    if tag == 0x2E and typ == 7 and cnt > 1024:   # Panasonic RW2：JpgFromRaw
                        cands.append((vo, cnt))
                    elif tag in (0x201, 0x111) and isinstance(v, int):
                        offs[(kind, tag)] = v
                    elif tag in (0x202, 0x117) and isinstance(v, int):
                        lens[(kind, {0x202: 0x201, 0x117: 0x111}[tag])] = v
                for k, o in offs.items():
                    if k in lens:
                        cands.append((o, lens[k]))
            good = []
            for o, n in cands:
                if 0 < o and n > 512 and o + n <= size:
                    f.seek(o)
                    if f.read(3) == b"\xff\xd8\xff":
                        good.append((n, o))
            if good:
                n, o = max(good)
                return o, n
    except (OSError, struct.error):
        pass
    return None


def pic_cr3_jpeg(f, size):
    out = []
    moov = next(((s, e) for t, s, e in alb_boxes(f, 0, size) if t == "moov"), None)
    if not moov:
        return out
    trak = next(((s, e) for t, s, e in alb_boxes(f, *moov) if t == "trak"), None)
    if not trak:
        return out

    def find(rng, path):
        for t, s, e in alb_boxes(f, *rng):
            if t == path[0]:
                return (s, e) if len(path) == 1 else find((s, e), path[1:])
        return None
    stbl = find(trak, ["mdia", "minf", "stbl"])
    if not stbl:
        return out
    kids = {t: (s, e) for t, s, e in alb_boxes(f, *stbl)}
    if "stsz" in kids and ("co64" in kids or "stco" in kids):
        f.seek(kids["stsz"][0])
        b = f.read(16)
        n = struct.unpack(">I", b[4:8])[0] or struct.unpack(">I", b[12:16])[0]
        if "co64" in kids:
            f.seek(kids["co64"][0] + 8)
            o = struct.unpack(">Q", f.read(8))[0]
        else:
            f.seek(kids["stco"][0] + 8)
            o = struct.unpack(">I", f.read(4))[0]
        out.append((o, n))
    return out


def pic_jpeg_hdr(path, apple_stops=None):
    """建清單用（只讀檔頭）：這張 JPEG 有 HDR 增益圖嗎；有就回傳最多亮幾級"""
    try:
        with open(path, "rb") as f:
            b = f.read(256 << 10)
            mp = None
            for mk, s, e in pic_jpeg_segs(b):
                if mk == 0xE2 and b[s:s + 4] == b"MPF\0":
                    mp = (s, e)
                    break
            if not mp:
                return None
            t = mp[0] + 4
            e2 = "<" if b[t:t + 2] == b"II" else ">"
            off = struct.unpack_from(e2 + "I", b, t + 4)[0]
            n = struct.unpack_from(e2 + "H", b, t + off)[0]
            for i in range(min(n, 32)):
                tag, typ, cnt, vo = struct.unpack_from(e2 + "HHII", b, t + off + 2 + 12 * i)
                if tag != 0xB002:
                    continue
                for j in range(min(cnt // 16, 8)):
                    at, sz, of, _, _ = struct.unpack_from(e2 + "IIIHH", b, t + vo + 16 * j)
                    if not of:
                        continue
                    f.seek(t + of)
                    gm = f.read(min(sz, 128 << 10))
                    if gm[:2] != b"\xff\xd8":
                        continue
                    iso = pic_jpeg_iso(gm)
                    g = pic_iso_meta(iso) if iso and len(iso) > 8 else None
                    g = g or pic_gm_xmp(pic_jpeg_xmp(gm))
                    if g:
                        return round(g["cx"], 2)
                    if "HDRGainMap" in pic_jpeg_xmp(gm) and apple_stops:
                        return round(apple_stops, 2)
    except (OSError, struct.error):
        pass
    return None
