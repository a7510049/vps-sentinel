"""VPS 哨兵：相簿分享（`alb_` 開頭）。
雲端硬碟裡選一個資料夾，做成一頁照片牆的連結給朋友看：小圖、大圖由主機做好（加密存著），
朋友打開 /a/十碼 就能看、左右滑、看相機資訊和地點、下載原圖。
sentinel.py 用 include("album.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）"""
import struct
import zipfile

ALB_FILE = os.path.join(DATA_DIR, "albums.json")                  # 相簿清單（加密，SEAL_FILES）
ALB_CACHE = os.path.join(DATA_DIR, "album-cache")                 # 小圖、大圖、照片資訊（每個檔案都加密；不備份，重做得出來）
ALB_PLACES = os.path.join(DATA_DIR, "album-places.json")          # 座標 → 地名（加密，SEAL_FILES）
ALB_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".avif"}
ALB_SHOW = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}    # 做不出小圖時，瀏覽器直接看得了原圖的
ALB_TIMES = (86400, 7 * 86400, 30 * 86400, 0)                     # 能選的期限（0 = 不會過期）
ALB_MAX = 2000                                                    # 一本最多幾張
ALB_PW_TRY = (5, 15 * 60)                                         # 同一個來源 15 分鐘錯 5 次先鎖住
ALB_COOKIE_H = 12                                                 # 輸對密碼後這個瀏覽器能看幾小時
ALB_LOCK = threading.Lock()
ALB_FAILS = {}                                                    # (相簿, 來源) → [輸錯的時間…]
ALB = {"d": None, "q": [], "ff": None, "busy": set(), "geo_t": 0}
ALB_GEN = threading.BoundedSemaphore(2)                           # 同時最多做兩張（另外一個背景慢慢做）
ALB_KEY_RE = re.compile(r"[A-Za-z0-9]{10}")


# ── 相簿清單 ──
def alb_all():
    if ALB["d"] is None:
        try:
            d = sec_load(ALB_FILE)
        except (OSError, ValueError):
            d = {}
        ALB["d"] = d if isinstance(d, dict) else {}
    now = time.time()
    return {k: v for k, v in ALB["d"].items() if isinstance(v, dict) and (not v.get("exp") or v["exp"] > now)}


def alb_save(d):
    ALB["d"] = d
    os.makedirs(DATA_DIR, exist_ok=True)
    sec_dump(ALB_FILE, d)


def alb_root():
    """雲端硬碟的根目錄（沒有雲端硬碟就 None）"""
    test = os.environ.get("SENTINEL_ALB_DIR")
    if test:
        return os.path.realpath(test)
    if not (CLOUD_URL and os.path.ismount(CLOUD_DIR)):
        return None
    return os.path.realpath(CLOUD_DIR)


def alb_path(rel):
    """雲端硬碟裡的資料夾（不能跑到外面，也不能是捷徑）"""
    root = alb_root()
    if not root:
        return None
    rel = str(rel or "").strip("/")
    if "\x00" in rel or any(p in ("..", ".") for p in rel.split("/") if p):
        return None
    p = os.path.realpath(os.path.join(root, rel))
    return p if (p == root or p.startswith(root + os.sep)) and os.path.isdir(p) else None


def alb_count():
    try:
        return len(alb_all())
    except Exception:  # noqa: BLE001
        return 0


def alb_photos_in(p):
    out = []
    try:
        with os.scandir(p) as it:
            for e in it:
                if e.name.startswith(".") or os.path.splitext(e.name)[1].lower() not in ALB_EXT:
                    continue
                try:
                    if e.is_file(follow_symlinks=False):
                        st = e.stat(follow_symlinks=False)
                        out.append((e.name, st.st_size, int(st.st_mtime)))
                except OSError:
                    pass
    except OSError:
        pass
    return out


def alb_folders(rel):
    """資料夾裡的子資料夾（各有幾張照片），給網頁選"""
    p = alb_path(rel)
    if not p:
        return None
    root = alb_root()
    subs = []
    try:
        with os.scandir(p) as it:
            for e in it:
                if e.name.startswith(".") or not e.is_dir(follow_symlinks=False):
                    continue
                n = len(alb_photos_in(e.path))
                try:
                    with os.scandir(e.path) as it2:
                        more = any(x.is_dir(follow_symlinks=False) and not x.name.startswith(".") for x in it2)
                except OSError:
                    more = False
                subs.append({"name": e.name, "n": n, "sub": more})
    except OSError:
        pass
    subs.sort(key=lambda x: x["name"].lower())
    rel = os.path.relpath(p, root).replace(os.sep, "/")
    return {"dir": "" if rel == "." else rel, "n": len(alb_photos_in(p)), "subs": subs[:500]}


def alb_new_code():
    return "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(10))


def alb_pw_hash(pw):
    salt = os.urandom(16)
    return {"s": salt.hex(), "h": hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200000).hex()}


def alb_pw_ok(a, pw):
    p = a.get("pw")
    if not p:
        return True
    try:
        h = hashlib.pbkdf2_hmac("sha256", str(pw or "").encode(), bytes.fromhex(p["s"]), 200000).hex()
    except (ValueError, KeyError, TypeError):
        return False
    return hmac.compare_digest(h, p["h"])


def alb_clean_name(s, dflt=""):
    s = re.sub(r"[\x00-\x1f<>]", "", str(s or "")).strip()[:40]
    return s or dflt


def alb_add(d):
    p = alb_path(d.get("dir"))
    if not p:
        return False, "找不到這個資料夾", {}
    n = len(alb_photos_in(p))
    if not n:
        return False, "這個資料夾裡沒有照片", {}
    secs = int(d.get("secs") or 0) if str(d.get("secs") or 0).isdigit() and int(d.get("secs") or 0) in ALB_TIMES else 7 * 86400
    pw = str(d.get("pw") or "")
    if pw and not 4 <= len(pw) <= 64:
        return False, "密碼要 4～64 個字", {}
    now = time.time()
    root = alb_root()
    a = {"id": secrets.token_hex(6), "code": alb_new_code(), "name": alb_clean_name(d.get("name"), os.path.basename(p) or "相簿"),
         "dir": os.path.relpath(p, root).replace(os.sep, "/"), "pw": alb_pw_hash(pw) if pw else None, "exp": now + secs if secs else 0,
         "t0": now, "loc": d.get("loc", True) is not False, "dl": d.get("dl", True) is not False, "views": 0, "last": 0,
         "k": secrets.token_hex(16)}
    if a["dir"] == ".":
        a["dir"] = ""
    with ALB_LOCK:
        all_ = alb_all()
        if len(all_) >= 100:
            return False, "相簿太多了，先收回幾本", {}
        all_[a["id"]] = a
        alb_save(all_)
    try:
        alb_index(a)                                   # 先把照片清單做好（只讀檔頭，很快），網頁馬上看得到幾張、封面
    except Exception as e:  # noqa: BLE001
        log(f"相簿照片清單做不出來（{str(e)[:120]}）")
    alb_kick(a["id"])
    log(f"分享相簿「{a['name']}」（{n} 張）")
    return True, "好了", {"id": a["id"]}


def alb_edit(d):
    with ALB_LOCK:
        all_ = alb_all()
        a = all_.get(str(d.get("id") or ""))
        if not a:
            return False, "這本已經收回了"
        if "name" in d:
            a["name"] = alb_clean_name(d.get("name"), a["name"])
        for k in ("loc", "dl"):
            if k in d:
                a[k] = bool(d[k])
        if "pw" in d:
            pw = str(d.get("pw") or "")
            if pw and not 4 <= len(pw) <= 64:
                return False, "密碼要 4～64 個字"
            a["pw"] = alb_pw_hash(pw) if pw else None
            a["k"] = secrets.token_hex(16)                 # 換密碼：之前輸對的瀏覽器要重輸
        if "secs" in d and str(d["secs"]).isdigit() and int(d["secs"]) in ALB_TIMES:
            s = int(d["secs"])
            a["exp"] = time.time() + s if s else 0
        alb_save(all_)
    if a["loc"]:
        alb_kick(a["id"])
    return True, "改好了"


def alb_del(aid):
    with ALB_LOCK:
        all_ = alb_all()
        a = all_.pop(str(aid or ""), None)
        if not a:
            return False, "這本已經收回了"
        alb_save(all_)
    try:
        os.remove(os.path.join(ALB_CACHE, f"idx-{a['id']}.json"))
    except OSError:
        pass
    threading.Thread(target=alb_gc, daemon=True).start()
    log(f"收回相簿「{a['name']}」")
    return True, "收回了，連結已經打不開"


def alb_base():
    dom = C.get("DOMAIN")
    if dom:
        port = C.get("HTTPS_PORT") or "443"
        return f"https://{dom}" + ("" if port == "443" else f":{port}")
    return ""


def alb_list():
    out = []
    for a in sorted(alb_all().values(), key=lambda x: -x.get("t0", 0)):
        idx = alb_index(a, scan=False)
        ph = idx.get("order") or []
        out.append({"id": a["id"], "code": a["code"], "name": a["name"], "dir": a["dir"], "exp": a["exp"], "t0": a["t0"],
                    "pw": bool(a.get("pw")), "loc": a["loc"], "dl": a["dl"], "views": a.get("views", 0), "last": a.get("last", 0),
                    "n": len(ph), "cover": ph[0] if ph else "", "ready": alb_ready(a, idx)})
    return {"ok": True, "list": out, "base": alb_base(), "cloud": bool(alb_root()), "times": ALB_TIMES}


def alb_find(code):
    if not ALB_KEY_RE.fullmatch(str(code or "")):
        return None
    for a in alb_all().values():
        if hmac.compare_digest(a["code"], code):
            return a
    return None


# ── 照片資訊（EXIF、大小、方向）：只讀檔頭，不用解開整張 ──
EXIF_T = {0x010F: "mk", 0x0110: "md", 0x0112: "ori", 0x0131: "sw", 0x0132: "dt0", 0x829A: "et", 0x829D: "f", 0x8822: "ep",
          0x8827: "iso", 0x9003: "dt", 0x9011: "oz", 0x9010: "oz0", 0x9204: "ev", 0x9207: "mm", 0x9209: "fla", 0x920A: "fl",
          0xA405: "f35", 0xA402: "em", 0xA403: "wb", 0xA433: "lmk", 0xA434: "ln", 0xA406: "sc", 0xA002: "pw", 0xA003: "ph"}
GPS_T = {1: "latr", 2: "lat", 3: "lonr", 4: "lon", 5: "altr", 6: "alt", 0x10: "dirr", 0x11: "dir"}
TIFF_SZ = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}


def alb_tiff(b):
    """讀 TIFF 格式的 EXIF；回傳 (資料, 定位資料在 b 裡的位置〔要拿掉時整段清成 0〕)"""
    if len(b) < 8 or b[:2] not in (b"II", b"MM"):
        return {}, []
    e = "<" if b[:2] == b"II" else ">"
    out, spans = {}, []

    def ifd(off, names, gps=False, depth=0):
        if depth > 3 or not 8 <= off < len(b) - 2:
            return
        n = struct.unpack_from(e + "H", b, off)[0]
        if n > 512 or off + 2 + n * 12 > len(b):
            return
        if gps:
            spans.append((off, 2 + n * 12))
        for i in range(n):
            p = off + 2 + i * 12
            tag, typ, cnt = struct.unpack_from(e + "HHI", b, p)
            sz = TIFF_SZ.get(typ, 0) * cnt
            if not sz or cnt > 4096:
                continue
            vo = p + 8 if sz <= 4 else struct.unpack_from(e + "I", b, p + 8)[0]
            if vo + sz > len(b):
                continue
            if gps and sz > 4:
                spans.append((vo, sz))
            if tag == 0x8769 and not gps:
                ifd(struct.unpack_from(e + "I", b, vo)[0], EXIF_T, False, depth + 1)
                continue
            if tag == 0x8825 and not gps:
                ifd(struct.unpack_from(e + "I", b, vo)[0], GPS_T, True, depth + 1)
                continue
            k = names.get(tag)
            if not k:
                continue
            raw = b[vo:vo + sz]
            if typ == 2:
                v = raw.split(b"\x00")[0].decode("utf-8", "replace").strip()
            elif typ in (5, 10):
                f = e + ("I" if typ == 5 else "i") * 2
                v = [struct.unpack_from(f, raw, j * 8) for j in range(cnt)]
                v = [(x, y) for x, y in v]
            elif typ in (3, 8):
                v = list(struct.unpack_from(e + ("H" if typ == 3 else "h") * cnt, raw))
            elif typ in (4, 9):
                v = list(struct.unpack_from(e + ("I" if typ == 4 else "i") * cnt, raw))
            elif typ in (1, 7):
                v = list(raw)
            else:
                continue
            if isinstance(v, list) and len(v) == 1:
                v = v[0]
            out[("g:" if gps else "") + k] = v

    ifd(struct.unpack_from(e + "I", b, 4)[0], EXIF_T)
    return out, spans


def _rat(v):
    if isinstance(v, list):
        v = v[0] if v else None
    if isinstance(v, tuple):
        return v[0] / v[1] if v[1] else None
    return float(v) if isinstance(v, (int, float)) else None


def alb_exif_tidy(t):
    """EXIF 的原始值換成網頁要的"""
    x = {}
    for k in ("mk", "md", "sw", "lmk", "ln"):
        if isinstance(t.get(k), str) and t[k]:
            x[k] = t[k][:80]
    dt = t.get("dt") or t.get("dt0")
    if isinstance(dt, str) and re.match(r"\d{4}:\d\d:\d\d \d\d:\d\d", dt):
        x["dt"] = dt[:19]
        oz = t.get("oz") or t.get("oz0")
        if isinstance(oz, str) and re.fullmatch(r"[+-]\d\d:\d\d", oz):
            x["oz"] = oz
    et = t.get("et")
    if isinstance(et, tuple) and et[0] and et[1]:
        x["et"] = [et[0], et[1]]
    for k in ("f", "fl", "ev"):
        v = _rat(t.get(k))
        if v is not None and abs(v) < 100000:
            x[k] = round(v, 2)
    for k in ("iso", "f35", "fla", "wb", "mm", "ep", "em", "sc"):
        v = t.get(k)
        if isinstance(v, list):
            v = v[0] if v else None
        if isinstance(v, int):
            x[k] = v
    g = None

    def deg(v, ref):
        if not isinstance(v, list) or len(v) != 3:
            return None
        a = [(_rat(p) or 0) for p in v]
        d = a[0] + a[1] / 60 + a[2] / 3600
        return -d if ref in ("S", "W") else d
    lat, lon = deg(t.get("g:lat"), t.get("g:latr")), deg(t.get("g:lon"), t.get("g:lonr"))
    if lat is not None and lon is not None and (lat or lon) and abs(lat) <= 90 and abs(lon) <= 180:
        g = [round(lat, 6), round(lon, 6)]
        alt = _rat(t.get("g:alt"))
        if alt is not None:
            g.append(round(-alt if t.get("g:altr") in (1, [1]) else alt, 1))
        else:
            g.append(None)
        dr = _rat(t.get("g:dir"))
        g.append(round(dr) % 360 if dr is not None else None)
    ori = t.get("ori")
    return x, g, ori if isinstance(ori, int) and 1 <= ori <= 8 else 1


def alb_jpeg(f):
    """JPEG：大小、EXIF（TIFF 在檔案裡的位置）"""
    f.seek(2)
    w = h = 0
    exif = None
    while True:
        m = f.read(4)
        if len(m) < 4 or m[0] != 0xFF:
            break
        mk, ln = m[1], struct.unpack(">H", m[2:])[0]
        if mk in (0xD8, 0x01) or 0xD0 <= mk <= 0xD7:
            f.seek(-2, 1)
            continue
        pos = f.tell()
        if mk == 0xE1 and exif is None:
            seg = f.read(ln - 2)
            if seg[:6] == b"Exif\x00\x00":
                exif = (pos + 6, seg[6:])
        elif mk in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            seg = f.read(5)
            h, w = struct.unpack(">HH", seg[1:5])
            break
        elif mk == 0xDA:
            break
        f.seek(pos + ln - 2)
    return w, h, exif


def alb_boxes(f, start, end):
    """ISO BMFF（HEIC）的一層盒子"""
    p = start
    while p + 8 <= end:
        f.seek(p)
        hd = f.read(16)
        if len(hd) < 8:
            return
        sz, typ = struct.unpack(">I4s", hd[:8])
        hl = 8
        if sz == 1:
            sz, hl = struct.unpack(">Q", hd[8:16])[0], 16
        elif sz == 0:
            sz = end - p
        if sz < hl:
            return
        yield typ.decode("latin-1"), p + hl, p + sz
        p += sz


def alb_heic(f, size):
    """HEIC／AVIF：主圖的大小、轉向，EXIF 在檔案裡的位置"""
    meta = next(((s, e) for t, s, e in alb_boxes(f, 0, min(size, 1 << 26)) if t == "meta"), None)
    if not meta:
        return 0, 0, None, 0
    s0, e0 = meta[0] + 4, meta[1]
    kids = {t: (s, e) for t, s, e in alb_boxes(f, s0, e0)}

    def rd(rng):
        f.seek(rng[0])
        return f.read(min(rng[1] - rng[0], 1 << 20))
    prim = exif_id = None
    if "pitm" in kids:
        b = rd(kids["pitm"])
        prim = struct.unpack(">H", b[4:6])[0] if b[0] == 0 else struct.unpack(">I", b[4:8])[0]
    if "iinf" in kids:
        s, e = kids["iinf"]
        f.seek(s)
        v = f.read(1)[0]
        for t, bs, be in alb_boxes(f, s + (6 if v == 0 else 8), e):
            if t != "infe":
                continue
            f.seek(bs)
            b = f.read(min(be - bs, 64))
            if b[0] >= 2:
                iid, typ = (struct.unpack(">H", b[4:6])[0], b[8:12]) if b[0] == 2 else (struct.unpack(">I", b[4:8])[0], b[10:14])
                if typ == b"Exif":
                    exif_id = iid
    loc = {}
    if "iloc" in kids:
        b = rd(kids["iloc"])
        v = b[0]
        osz, lsz, bsz, isz = b[4] >> 4, b[4] & 15, b[5] >> 4, b[5] & 15
        p = 6
        cnt = struct.unpack_from(">H" if v < 2 else ">I", b, p)[0]
        p += 2 if v < 2 else 4

        def num(n):
            nonlocal p
            if not n:
                return 0
            r = int.from_bytes(b[p:p + n], "big")
            p += n
            return r
        try:
            for _ in range(min(cnt, 4096)):
                iid = num(2 if v < 2 else 4)
                if v in (1, 2):
                    num(2)
                num(2)
                base = num(bsz)
                ext = []
                for _ in range(num(2)):
                    if v in (1, 2) and isz:
                        num(isz)
                    ext.append((base + num(osz), num(lsz)))
                loc[iid] = ext
        except (IndexError, ValueError):
            pass
    w = h = rot = 0
    if "iprp" in kids:
        ip = {t: (s, e) for t, s, e in alb_boxes(f, *kids["iprp"])}
        props = list(alb_boxes(f, *ip["ipco"])) if "ipco" in ip else []
        mine = []
        if "ipma" in ip:
            b = rd(ip["ipma"])
            v, fl = b[0], int.from_bytes(b[1:4], "big")
            p = 4
            n = struct.unpack_from(">I", b, p)[0]
            p += 4
            for _ in range(min(n, 4096)):
                if p + 3 > len(b):
                    break
                iid = struct.unpack_from(">H" if v < 1 else ">I", b, p)[0]
                p += 2 if v < 1 else 4
                c = b[p]
                p += 1
                for _ in range(c):
                    if fl & 1:
                        ix = struct.unpack_from(">H", b, p)[0] & 0x7FFF
                        p += 2
                    else:
                        ix = b[p] & 0x7F
                        p += 1
                    if iid == prim:
                        mine.append(ix)
        for ix in mine:
            if 1 <= ix <= len(props):
                t, s, e = props[ix - 1]
                f.seek(s)
                b = f.read(min(e - s, 16))
                if t == "ispe" and len(b) >= 12:
                    w, h = struct.unpack(">II", b[4:12])
                elif t == "irot" and b:
                    rot = b[0] & 3
    exif = None
    if exif_id in loc and loc[exif_id]:
        off, ln = loc[exif_id][0]
        f.seek(off)
        b = f.read(min(ln, 1 << 20))
        if len(b) > 4:
            skip = struct.unpack(">I", b[:4])[0] + 4
            if b[skip:skip + 6] == b"Exif\x00\x00":
                skip += 6
            exif = (off + skip, b[skip:])
    return w, h, exif, rot


def alb_meta(path):
    """一張照片的資訊：{w, h, x: 相機資訊, g: [緯度, 經度, 高度, 方向], ori, tx: EXIF 在檔案裡的位置, gs: 定位資料的位置}"""
    ext = os.path.splitext(path)[1].lower()
    w = h = 0
    exif = None
    rot = 0
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            head = f.read(32)
            if head[:2] == b"\xff\xd8":
                w, h, exif = alb_jpeg(f)
            elif head[:8] == b"\x89PNG\r\n\x1a\n":
                w, h = struct.unpack(">II", head[16:24])
            elif head[:6] in (b"GIF87a", b"GIF89a"):
                w, h = struct.unpack("<HH", head[6:10])
            elif head[:4] == b"RIFF" and head[8:12] == b"WEBP":
                f.seek(12)
                b = f.read(1 << 16)
                if b[:4] == b"VP8X":
                    w, h = int.from_bytes(b[12:15], "little") + 1, int.from_bytes(b[15:18], "little") + 1
                    p = 0
                    while p + 8 <= len(b):
                        typ, ln = b[p:p + 4], struct.unpack("<I", b[p + 4:p + 8])[0]
                        if typ == b"EXIF":
                            d = b[p + 8:p + 8 + ln]
                            skip = 6 if d[:6] == b"Exif\x00\x00" else 0
                            exif = (12 + p + 8 + skip, d[skip:])
                            break
                        p += 8 + ln + (ln & 1)
                elif b[:4] == b"VP8 ":
                    w, h = struct.unpack("<HH", b[14:18])
                    w, h = w & 0x3FFF, h & 0x3FFF
                elif b[:4] == b"VP8L":
                    v = int.from_bytes(b[9:13], "little")
                    w, h = (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
            elif head[4:8] == b"ftyp":
                w, h, exif, rot = alb_heic(f, size)
    except (OSError, struct.error, IndexError, ValueError):
        pass
    t, spans = alb_tiff(exif[1]) if exif else ({}, [])
    x, g, ori = alb_exif_tidy(t)
    if ext in (".heic", ".heif", ".avif"):
        if rot in (1, 3):
            w, h = h, w
        ori = 1                                        # HEIC 的轉向寫在 irot，解開時就轉好了
    elif ori >= 5:
        w, h = h, w
    if not (w and h):
        w, h = int(t.get("pw") or 0) or 4, int(t.get("ph") or 0) or 3
    return {"w": w, "h": h, "x": x, "g": g, "ori": ori,
            "gs": [[exif[0] + a, n] for a, n in spans] if exif else []}


# ── 每本相簿的照片清單（照拍攝時間排，資訊記著，檔案沒變就不重讀） ──
def alb_pid(name):
    return hashlib.sha256(name.encode()).hexdigest()[:12]


def alb_index(a, scan=True):
    fn = os.path.join(ALB_CACHE, f"idx-{a['id']}.json")
    try:
        idx = sec_load(fn)
    except (OSError, ValueError):
        idx = {}
    if not isinstance(idx, dict):
        idx = {}
    if not scan:
        return idx
    p = alb_path(a["dir"])
    files = alb_photos_in(p) if p else []
    old = idx.get("ph") or {}
    ph, changed = {}, len(old) != len(files)
    for name, size, mt in files[:ALB_MAX]:
        pid = alb_pid(name)
        o = old.get(pid)
        if o and o.get("sz") == size and o.get("mt") == mt and o.get("n") == name:
            ph[pid] = o
            continue
        m = alb_meta(os.path.join(p, name))
        m.update(n=name, sz=size, mt=mt)
        ph[pid] = m
        changed = True
    if changed or "order" not in idx:
        def key(i):
            m = ph[i]
            return (m["x"].get("dt") or time.strftime("%Y:%m:%d %H:%M:%S", time.localtime(m["mt"])), m["n"].lower())
        idx = {"ph": ph, "order": sorted(ph, key=key)}
        os.makedirs(ALB_CACHE, mode=0o700, exist_ok=True)
        sec_dump(fn, idx)
    return idx


def alb_ckey(a, pid, m):
    root = alb_root() or ""
    return hashlib.sha256(f"{root}/{a['dir']}/{m['n']}|{m['sz']}|{m['mt']}".encode()).hexdigest()[:24]


def alb_cfile(ck, kind):
    return os.path.join(ALB_CACHE, f"{ck}-{kind}.jpg")


def alb_ready(a, idx=None):
    idx = idx or alb_index(a, scan=False)
    ph = idx.get("ph") or {}
    if not ph:
        return 1
    done = sum(1 for pid, m in ph.items() if m.get("bad") or os.path.exists(alb_cfile(alb_ckey(a, pid, m), "s")))
    return round(done / len(ph), 2)


# ── 小圖、大圖：交給 ffmpeg（主機上的，沒有就借雲端硬碟容器裡的） ──
def alb_ff():
    if ALB["ff"] is not None:
        return ALB["ff"]
    env = os.environ.get("SENTINEL_ALB_FF")
    if env:
        ALB["ff"] = (None if env == "none" else (env.split(), None))
        return ALB["ff"]
    ff = shutil.which("ffmpeg")
    if ff:
        ALB["ff"] = ([ff], None)
    elif shutil.which("docker"):
        try:
            ok = subprocess.run(["docker", "exec", "vps-cloud", "ffmpeg", "-version"], capture_output=True, timeout=20).returncode == 0
        except (OSError, subprocess.SubprocessError):
            ok = False
        ALB["ff"] = (["docker", "exec", "-i", "vps-cloud", "ffmpeg"], "/folder") if ok else None
    else:
        ALB["ff"] = None
    return ALB["ff"]


ALB_ROT = {2: "hflip,", 3: "hflip,vflip,", 4: "vflip,", 5: "transpose=0,", 6: "transpose=1,", 7: "transpose=3,", 8: "transpose=2,"}


def alb_run_ff(args, data=None, src=None, timeout=120):
    ff = alb_ff()
    if not ff:
        return None
    cmd, mount = ff
    if src:
        if mount:                                       # 容器裡看到的雲端硬碟在 /folder
            src = mount + src[len(alb_root()):]
        args = [a if a != "{src}" else src for a in args]
    try:
        r = subprocess.run(["nice", "-n", "15", *cmd, "-v", "error", "-nostdin" if data is None else "-y", *args],
                           input=data, capture_output=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 and r.stdout[:2] == b"\xff\xd8" else None


def alb_make(a, pid, m):
    """做大圖（長邊 2560）、小圖（高 480）、模糊預覽（寬 24）；不留任何 EXIF"""
    p = alb_path(a["dir"])
    if not p:
        return False
    ck = alb_ckey(a, pid, m)
    if os.path.exists(alb_cfile(ck, "s")):
        return True
    src = os.path.join(p, m["n"])
    ext = os.path.splitext(m["n"])[1].lower()
    rot = ALB_ROT.get(m.get("ori", 1), "") if ext in (".jpg", ".jpeg") else ""
    out = ["-map_metadata", "-1", "-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "-pix_fmt", "yuvj420p"]
    big = alb_run_ff((["-noautorotate"] if ext in (".jpg", ".jpeg") else []) + ["-i", "{src}", "-vf",
                     rot + "scale='if(gt(iw,ih),min(2560,iw),-2)':'if(gt(iw,ih),-2,min(2560,ih))':flags=lanczos", *out, "-q:v", "3", "-"], src=src, timeout=180)
    if not big:
        return False
    small = alb_run_ff(["-f", "mjpeg", "-i", "pipe:0", "-vf", "scale=-2:'min(480,ih)':flags=lanczos", *out, "-q:v", "4", "-"], data=big)
    tiny = alb_run_ff(["-f", "mjpeg", "-i", "pipe:0", "-vf", "scale=24:-2:flags=area", *out, "-q:v", "6", "-"], data=small or big)
    if not small:
        return False
    os.makedirs(ALB_CACHE, mode=0o700, exist_ok=True)
    for kind, b in (("l", big), ("q", tiny or b""), ("s", small)):   # 小圖最後寫：有小圖就代表三個都好了
        if b:
            sec_write(alb_cfile(ck, kind), b)
    return True


def alb_get(a, pid, kind):
    """回傳 (bytes 或 None, 檔名)；照片還沒做好就現在做"""
    idx = alb_index(a, scan=False)
    m = (idx.get("ph") or {}).get(pid)
    if not m:
        return None, ""
    ck = alb_ckey(a, pid, m)
    fn = alb_cfile(ck, kind)
    if not os.path.exists(fn) and not m.get("bad"):
        with ALB_GEN:
            if not os.path.exists(fn) and not alb_make(a, pid, m):
                alb_mark_bad(a, pid)
    try:
        return sec_read(fn), m["n"]
    except (OSError, ValueError):
        return None, m["n"]


def alb_mark_bad(a, pid):
    fn = os.path.join(ALB_CACHE, f"idx-{a['id']}.json")
    with ALB_LOCK:
        idx = alb_index(a, scan=False)
        if pid in (idx.get("ph") or {}):
            idx["ph"][pid]["bad"] = 1
            sec_dump(fn, idx)


def alb_kick(aid):
    """背景把這本的照片都先做好（還有查地名）"""
    with ALB_LOCK:
        if aid in ALB["q"]:
            return
        ALB["q"].append(aid)
        if len(ALB["q"]) > 1:
            return
    threading.Thread(target=alb_worker, daemon=True).start()


def alb_worker():
    while True:
        with ALB_LOCK:
            if not ALB["q"]:
                return
            aid = ALB["q"][0]
        try:
            a = alb_all().get(aid)
            if a:
                idx = alb_index(a)
                for pid in idx.get("order", []):
                    if aid not in alb_all():
                        break
                    m = idx["ph"][pid]
                    if not m.get("bad") and not os.path.exists(alb_cfile(alb_ckey(a, pid, m), "s")):
                        with ALB_GEN:
                            ok = alb_make(a, pid, m)
                        if not ok:
                            alb_mark_bad(a, pid)
                if a.get("loc"):
                    for pid in idx.get("order", []):
                        g = idx["ph"][pid].get("g")
                        if g:
                            alb_place(g[0], g[1], wait=True)
        except Exception as e:  # noqa: BLE001  相簿出錯不影響監控
            log(f"相簿小圖做不出來（{str(e)[:120]}）")
        with ALB_LOCK:
            ALB["q"].pop(0)


def alb_gc():
    """清掉已經沒有相簿用到的小圖"""
    keep = set()
    for a in alb_all().values():
        idx = alb_index(a, scan=False)
        for pid, m in (idx.get("ph") or {}).items():
            keep.add(alb_ckey(a, pid, m))
    try:
        for fn in os.listdir(ALB_CACHE):
            m = re.fullmatch(r"([0-9a-f]{24})-[slq]\.jpg", fn)
            if m and m[1] not in keep:
                os.remove(os.path.join(ALB_CACHE, fn))
    except OSError:
        pass


# ── 地名：OpenStreetMap 的 Nominatim（一秒最多問一次，問過的記著）；問不到用最近的機場城市 ──
ALB_PL = {"d": None, "lock": threading.Lock()}


def alb_places():
    if ALB_PL["d"] is None:
        try:
            d = sec_load(ALB_PLACES)
        except (OSError, ValueError):
            d = {}
        ALB_PL["d"] = d if isinstance(d, dict) else {}
    return ALB_PL["d"]


def alb_near_city(lat, lon):
    best = None
    try:
        with open(os.path.join(HERE, "data", "airports.tsv"), encoding="utf-8") as f:
            for line in f:
                x = line.rstrip("\n").split("\t")
                if len(x) < 8 or not x[7]:
                    continue
                try:
                    d = (float(x[4]) - lat) ** 2 + ((float(x[5]) - lon) * math.cos(math.radians(lat))) ** 2
                except ValueError:
                    continue
                if best is None or d < best[0]:
                    best = (d, x[7])
    except OSError:
        pass
    return {"n": best[1], "a": ""} if best and best[0] < 1 else None


def alb_place_fmt(j):
    ad = j.get("address") or {}
    city = ad.get("city") or ad.get("town") or ad.get("village") or ad.get("county") or ""
    area = ad.get("suburb") or ad.get("city_district") or ad.get("quarter") or ad.get("neighbourhood") or ""
    spot = j.get("name") if j.get("category") in ("tourism", "historic", "leisure", "amenity", "natural", "building", "aeroway", "railway", "shop") else ""
    state, country = ad.get("state") or "", ad.get("country") or ""
    top = spot or area or city or state or country
    rest = [s for s in (area if spot else "", city, state if state != city else "", country) if s and s != top]
    seen = []
    for s in rest:
        if s not in seen:
            seen.append(s)
    return {"n": top[:40], "a": "・".join(seen[:3])[:60], "c": city or state}


def alb_place(lat, lon, wait=False):
    k = f"{lat:.3f},{lon:.3f}"
    d = alb_places()
    if k in d:
        return d[k]
    if not wait:
        return None
    with ALB_PL["lock"]:
        if k in d:
            return d[k]
        gap = 1.1 - (time.time() - ALB["geo_t"])
        if gap > 0:
            time.sleep(gap)
        ALB["geo_t"] = time.time()
        url = os.environ.get("SENTINEL_ALB_GEO") or "https://nominatim.openstreetmap.org/reverse"
        q = urllib.parse.urlencode({"format": "jsonv2", "lat": f"{lat:.5f}", "lon": f"{lon:.5f}", "zoom": 17, "accept-language": "zh-TW,zh"})
        res = None
        try:
            req = urllib.request.Request(url + "?" + q, headers={"User-Agent": f"vps-sentinel/{VERSION} (+https://github.com/a7510049/vps-sentinel)"})
            with urllib.request.urlopen(req, timeout=10) as r:
                j = json.loads(r.read(1 << 20))
            if isinstance(j, dict) and j.get("address"):
                res = alb_place_fmt(j)
        except Exception:  # noqa: BLE001
            res = None
        if not res:
            res = alb_near_city(lat, lon)
            if not res:
                return None
            res["tmp"] = 1                              # 之後再問一次
        if res.get("tmp") and k in d:
            return d[k]
        d[k] = res
        if len(d) > 20000:
            for x in list(d)[:5000]:
                d.pop(x)
        try:
            sec_dump(ALB_PLACES, d)
        except OSError:
            pass
        return res


# ── 朋友那邊：網頁、照片清單、圖、下載 ──
def alb_page():
    try:
        with open(os.path.join(HERE, "web", "album.html"), encoding="utf-8") as f:
            h = f.read()
        with open(os.path.join(HERE, "web", "album.css"), encoding="utf-8") as f:
            css = f.read()
        with open(os.path.join(HERE, "web", "album.js"), encoding="utf-8") as f:
            js = f.read()
        return h.replace("/*@album.css*/", css).replace("/*@album.js*/", js)
    except OSError:
        return "<meta charset=utf-8><p>找不到相簿的網頁檔案，請重新執行 bash install.sh</p>"


def alb_manifest(a):
    idx = alb_index(a)
    ph = idx.get("ph") or {}
    out, places = [], {}
    for pid in idx.get("order", []):
        m = ph[pid]
        ck = alb_ckey(a, pid, m)
        q = ""
        try:
            q = base64.b64encode(sec_read(alb_cfile(ck, "q"))).decode()
        except (OSError, ValueError):
            pass
        it = {"i": pid, "w": m["w"], "h": m["h"], "n": m["n"], "sz": m["sz"], "x": m["x"], "v": ck[:8], "q": q}
        if m.get("bad"):
            it["raw"] = os.path.splitext(m["n"])[1].lower() in ALB_SHOW
        if not it["x"].get("dt"):
            it["x"] = {**it["x"], "dt": time.strftime("%Y:%m:%d %H:%M:%S", time.localtime(m["mt"])), "dtf": 1}
        if a["loc"] and m.get("g"):
            it["g"] = m["g"]
            pl = alb_place(m["g"][0], m["g"][1])
            if pl:
                it["p"] = {"n": pl["n"], "a": pl.get("a", "")}
                c = pl.get("c") or pl["n"]
                places[c] = places.get(c, 0) + 1
        out.append(it)
    if alb_ready(a, idx) < 1 or (a["loc"] and any("g" in x and "p" not in x for x in out)):
        alb_kick(a["id"])
    return {"ok": True, "name": a["name"], "photos": out, "dl": a["dl"], "loc": a["loc"], "exp": a["exp"],
            "places": [k for k, _ in sorted(places.items(), key=lambda x: -x[1])][:6], "ready": alb_ready(a, idx)}


def alb_cookie_name(a):
    return "vsa_" + a["id"]


def alb_cookie_val(a, exp):
    exp = int(exp)
    return f"{exp}.{hmac.new(a["k"].encode(), (a["id"] + "|" + str(exp)).encode(), hashlib.sha256).hexdigest()[:40]}"


def alb_cookie_ok(h, a):
    if not a.get("pw"):
        return True
    for part in (h.headers.get("Cookie") or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == alb_cookie_name(a):
            exp = v.split(".")[0]
            if exp.isdigit() and int(exp) > time.time() and hmac.compare_digest(v, alb_cookie_val(a, exp)):
                return True
    return False


def alb_strip_gps(f, spans, out, total):
    """送原圖：定位資料那幾段換成 0（檔案大小不變）"""
    spans = sorted((int(s), int(n)) for s, n in spans)
    pos = 0
    for s, n in spans:
        if s < pos:
            continue
        while pos < s:
            b = f.read(min(1 << 20, s - pos))
            if not b:
                return
            out.write(b)
            pos += len(b)
        f.read(n)
        out.write(b"\x00" * n)
        pos += n
    shutil.copyfileobj(f, out, 1 << 20)


def alb_http(h, method):
    """/a/十碼 開頭的網址；回傳 True 表示處理好了"""
    path = urllib.parse.urlsplit(h.path).path
    m = re.fullmatch(r"/a/([A-Za-z0-9]{10})(/.*)?", path)
    if not m:
        return False
    code, rest = m[1], m[2] or ""
    if rest == "" and method == "GET":
        return h.send(200, alb_page(), "text/html; charset=utf-8", etag=True) or True
    a = alb_find(code)
    if not a:
        time.sleep(1)
        return h.send(404, json.dumps({"ok": False, "gone": True}), cache=False) or True
    if rest == "/open" and method == "POST":
        ip, now = h.client_ip(), time.time()
        key = (a["id"], ip)
        with ALB_LOCK:
            tries = [t for t in ALB_FAILS.get(key, []) if now - t < ALB_PW_TRY[1]]
            ALB_FAILS[key] = tries
        if len(tries) >= ALB_PW_TRY[0]:
            left = int(ALB_PW_TRY[1] - (now - tries[0])) // 60 + 1
            return h.send(429, json.dumps({"ok": False, "message": f"錯太多次，{left} 分鐘後再試"}, ensure_ascii=False)) or True
        try:
            n = min(int(h.headers.get("Content-Length") or 0), 1024)
        except ValueError:
            n = 0
        pw = h.jbody(h.rfile.read(n) if n else b"").get("pw")
        if not alb_pw_ok(a, pw):
            with ALB_LOCK:
                ALB_FAILS.setdefault(key, []).append(now)
                if len(ALB_FAILS) > 5000:
                    ALB_FAILS.clear()
            time.sleep(1)
            return h.send(401, json.dumps({"ok": False, "message": "密碼不對"}, ensure_ascii=False)) or True
        exp = now + ALB_COOKIE_H * 3600
        if a.get("exp"):
            exp = min(exp, a["exp"])
        h.send_response(200)
        h.send_header("Content-Type", "application/json")
        h.send_header("Cache-Control", "no-store")
        h.send_header("Set-Cookie", f"{alb_cookie_name(a)}={alb_cookie_val(a, exp)}; Path=/a/{code}; Max-Age={int(exp - now)}; HttpOnly; SameSite=Strict"
                      + ("; Secure" if h.https() else ""))
        h.send_header("Content-Length", "11")
        h.end_headers()
        h.wfile.write(b'{"ok":true}')
        return True
    if method != "GET":
        return h.send(404, '{"error":"找不到"}') or True
    if not alb_cookie_ok(h, a):
        return h.send(401, json.dumps({"ok": False, "pw": True}), cache=False) or True
    if rest == "/m":
        with ALB_LOCK:
            all_ = alb_all()
            if a["id"] in all_ and time.time() - all_[a["id"]].get("last", 0) > 1800:   # 半小時內同一本再打開不重算
                all_[a["id"]]["views"] = all_[a["id"]].get("views", 0) + 1
                all_[a["id"]]["last"] = time.time()
                try:
                    alb_save(all_)
                except OSError:
                    pass
        return h.send(200, json.dumps(alb_manifest(a), ensure_ascii=False, separators=(",", ":"))) or True
    m = re.fullmatch(r"/i/([0-9a-f]{12})/([slqo])", rest)
    if m:
        pid, kind = m[1], m[2]
        idx = alb_index(a, scan=False)
        meta = (idx.get("ph") or {}).get(pid)
        if not meta:
            return h.send(404, '{"error":"找不到"}') or True
        if kind == "o" or meta.get("bad"):            # 原圖（下載；或做不出小圖時直接看）
            if kind == "o" and not a["dl"]:
                return h.send(403, '{"error":"不能下載"}') or True
            p = alb_path(a["dir"])
            src = os.path.join(p, meta["n"]) if p else ""
            try:
                st = os.stat(src)
                f = open(src, "rb")  # noqa: SIM115
            except OSError:
                return h.send(404, '{"error":"找不到"}') or True
            with f:
                ext = os.path.splitext(meta["n"])[1].lower()
                ct = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
                      ".heic": "image/heic", ".heif": "image/heif", ".avif": "image/avif"}.get(ext, "application/octet-stream")
                h.send_response(200)
                h.send_header("Content-Type", ct)
                h.send_header("Content-Length", str(st.st_size))
                h.send_header("Cache-Control", "private, max-age=3600")
                h.send_header("X-Content-Type-Options", "nosniff")
                h.send_header("Content-Security-Policy", "sandbox")
                if kind == "o":
                    h.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(meta["n"]))
                h.end_headers()
                try:
                    if a["loc"] or not meta.get("gs"):
                        shutil.copyfileobj(f, h.wfile, 1 << 20)
                    else:
                        alb_strip_gps(f, meta["gs"], h.wfile, st.st_size)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    pass
            return True
        b, _ = alb_get(a, pid, kind)
        if not b:
            return h.send(404, '{"error":"找不到"}') or True
        h.send_response(200)
        h.send_header("Content-Type", "image/jpeg")
        h.send_header("Content-Length", str(len(b)))
        h.send_header("Cache-Control", "private, max-age=604800, immutable")
        h.send_header("X-Content-Type-Options", "nosniff")
        h.end_headers()
        try:
            h.wfile.write(b)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        return True
    if rest == "/zip":                                 # 全部原圖打包（不壓縮，邊讀邊送）
        if not a["dl"]:
            return h.send(403, '{"error":"不能下載"}') or True
        idx = alb_index(a, scan=False)
        p = alb_path(a["dir"])
        if not p:
            return h.send(404, '{"error":"找不到"}') or True
        h.close_connection = True
        h.send_response(200)
        h.send_header("Content-Type", "application/zip")
        h.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(a["name"] + ".zip"))
        h.send_header("Cache-Control", "no-store")
        h.send_header("Connection", "close")
        h.end_headers()
        try:
            with zipfile.ZipFile(h.wfile, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
                for pid in idx.get("order", []):
                    meta = idx["ph"][pid]
                    src = os.path.join(p, meta["n"])
                    try:
                        zi = zipfile.ZipInfo(meta["n"], time.localtime(meta["mt"])[:6])
                        with open(src, "rb") as f, z.open(zi, "w", force_zip64=True) as w:
                            if a["loc"] or not meta.get("gs"):
                                shutil.copyfileobj(f, w, 1 << 20)
                            else:
                                alb_strip_gps(f, meta["gs"], w, meta["sz"])
                    except (FileNotFoundError, PermissionError):
                        continue
        except (BrokenPipeError, ConnectionResetError, OSError, ValueError):
            pass
        return True
    return h.send(404, '{"error":"找不到"}') or True


def alb_api(d):
    """主人那邊（/api/album）：看清單、選資料夾、新增、修改、收回"""
    act = d.get("action")
    if act == "folders":
        r = alb_folders(d.get("dir"))
        if r is None:
            return 400, {"ok": False, "message": "這台沒有雲端硬碟" if not alb_root() else "找不到這個資料夾"}
        return 200, {"ok": True, **r}
    if act == "add":
        ok, msg, extra = alb_add(d)
        return (200 if ok else 400), {**alb_list(), **extra, "ok": ok, "message": msg}
    if act == "edit":
        ok, msg = alb_edit(d)
        return (200 if ok else 400), {**alb_list(), "ok": ok, "message": msg}
    if act == "del":
        ok, msg = alb_del(d.get("id"))
        return (200 if ok else 400), {**alb_list(), "ok": ok, "message": msg}
    return 200, alb_list()
