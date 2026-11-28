"""哨站：相簿分享（`alb_` 開頭）。
雲端硬碟裡選一個資料夾，做成一頁照片牆的連結給朋友看：小圖、大圖由主機做好（加密存著），
朋友打開 /a/十碼 就能看、左右滑、看相機資訊和地點、下載原圖。
sentinel.py 用 include("album.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）"""
import calendar
import resource
import struct
import zipfile

ALB_FILE = os.path.join(DATA_DIR, "albums.json")                  # 相簿清單（加密，SEAL_FILES）
ALB_CACHE = os.path.join(DATA_DIR, "album-cache")                 # 小圖、大圖、照片資訊（每個檔案都加密；不備份，重做得出來）
ALB_PLACES = os.path.join(DATA_DIR, "album-places.json")          # 座標 → 地名（加密，SEAL_FILES）
ALB_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".avif"}
ALB_EXT2 = {".hif"} | PIC_RAW                                       # 只在雲端硬碟裡看得到的：相機的 HEIF、原始檔（朋友不能上傳）
ALB_HEIF = {".heic", ".heif", ".hif", ".avif"}
ALB_VV = 2                                                        # 影片轉檔的做法版本：轉不出來的影片換新做法後再試一次
ALB_XL = 3840                                                     # 大螢幕看大圖的清晰版：長邊幾點（有人在大螢幕打開才做）
ALB_MV = 9                                                        # 照片資訊的格式版本（舊的重讀一次：色彩空間、HDR、原始檔、XMP／PNG 定位）
ALB_SHOW = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}    # 做不出小圖時，瀏覽器直接看得了原圖的
ALB_VID = {".mp4", ".mov", ".m4v", ".webm", ".3gp", ".mkv"}        # 影片（主機轉成 720p 的 H.264 給朋友看）
ALB_AUD = {".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".wav"}   # 資料夾裡放一首歌：幻燈片的背景音樂
ALB_VMAX = 20 * 60                                                # 影片最長幾秒（太長的不放）
ALB_LIVE = 3.6                                                    # 跟照片同名、這麼短的影片算原況照片會動的那段
ALB_VCH = 1 << 20                                                 # 影片分段加密，每段 1 MB（拖進度條只解要的那幾段）
ALB_TALK = os.path.join(DATA_DIR, "album-talk.json")              # 朋友的愛心、留言（加密，SEAL_FILES；跟著備份）
ALB_TALK_MAX = (300, 20, 200, 3000)                               # 一則留言幾個字、名字幾個字、一張最多幾則、一本最多幾則
ALB_RX = ("😂", "😮", "👍", "🥹")                                # 愛心以外能按的表情
ALB_GB = "_gb"                                                    # 留言簿（整本的留言）存在 album-talk.json 這個代號底下
ALB_INTRO = 300                                                   # 相簿介紹最多幾個字
ALB_TIMES = (86400, 7 * 86400, 30 * 86400, 0)                     # 能選的期限（0 = 不會過期）
ALB_MAX = 2000                                                    # 一本最多幾張
ALB_PW_TRY = (5, 15 * 60)                                         # 同一個來源 15 分鐘錯 5 次先鎖住
ALB_COOKIE_H = 12                                                 # 輸對密碼後這個瀏覽器能看幾小時
ALB_DEVS = (0, 1, 3)                                              # 幾支手機能看（0 = 不限）
ALB_DEVKEEP = 60                                                  # 看過的手機最多記幾支
ALB_DLS = (0, 1, 2)                                               # 下載：不給、只給壓縮圖、給原圖
ALB_UPDIR = "朋友放的"                                             # 朋友上傳的放這個資料夾下面，一支手機一個資料夾
ALB_UPS = (0, 1, 2)                                               # 朋友上傳：不開放、要主人確認、直接放上去
ALB_UP_MAX = 500 << 20                                            # 朋友一次上傳一個影片最大多少
ALB_UP_PIC = 50 << 20                                             # 照片、動圖最大多少
ALB_UQ = (1, 5, 20)                                               # 朋友總共最多放幾 GB（主人選；一個人最多四分之一）
ALB_UP_HOST = 2 << 30                                             # 主機本身至少留這麼多（轉影片、小圖放在主機上）
ALB_UP_PAR = 3                                                    # 一本相簿同時最多幾個人在放
ALB_UP_PX = 100_000_000                                           # 照片最多幾個像素（太大的「炸彈圖」解開會吃光記憶體）
ALB_UP_DAY = 300                                                  # 一支手機一天最多放幾個
ALB_UP_SPARE = 1 << 30                                            # 雲端硬碟至少留這麼多
ALB_UP_EV = 120                                                   # 同一個人連續上傳，停下來這麼久才記一筆（傳 Telegram）
ALB_ZIP_MAX = 500                                                 # 勾選下載一次最多幾個
ALB_OWN_S = 900                                                   # 主人挑照片時看小圖的通行證（15 分鐘）
ALB_LOCK = threading.Lock()
ALB_IDX_LOCK = threading.Lock()
ALB_FAILS = {}                                                    # (相簿, 來源) → [輸錯的時間…]
ALB = {"d": None, "q": [], "again": set(), "ff": None, "geo_t": 0, "talk": None, "tpost": {}, "rx_t": {}, "di_t": {},
       "upev": {}, "upfl": {}, "idx": {}, "qcache": {}, "assets": {}, "ap": None, "req": 0}
ALB_GEN = threading.BoundedSemaphore(2)                           # 同時最多做兩張（另外一個背景慢慢做）
ALB_ZIP_GATE = threading.BoundedSemaphore(2)                      # 同時最多兩個打包下載，避免把主機頻寬和硬碟塞爆
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


def alb_talk_all():
    """{相簿: {照片: {"l": [手機…], "c": [{id, d: 手機, n: 名字, s: 留言, t}]}}}"""
    if ALB["talk"] is None:
        try:
            d = sec_load(ALB_TALK)
        except (OSError, ValueError):
            d = {}
        ALB["talk"] = d if isinstance(d, dict) else {}
    return ALB["talk"]


def alb_talk_save():
    os.makedirs(DATA_DIR, exist_ok=True)
    sec_dump(ALB_TALK, ALB["talk"] or {})


def alb_talk_of(a, th=""):
    """這本每張照片的愛心數、自己按了沒、留言"""
    out, devs = {}, a.get("devs") or {}
    for pid, t in (alb_talk_all().get(a["id"]) or {}).items():
        nms = []                                        # 誰按了愛心：留過名字的手機才寫得出名字
        for h in reversed(t.get("l") or []):
            nm = (devs.get(h) or {}).get("nm")
            if nm and nm not in nms:
                nms.append(nm)
        rx = {}
        for e in (t.get("r") or {}).values():
            rx[e] = rx.get(e, 0) + 1
        out[pid] = {"lk": len(t.get("l") or []), "me": th in (t.get("l") or []), "rx": rx, "mr": (t.get("r") or {}).get(th, ""), "lkn": nms[:6],
                    "cm": [{"id": c["id"], "n": c["n"], "s": c["s"], "t": int(c["t"]), "me": c["d"] == th, **({"r": c["r"]} if c.get("r") else {})} for c in t.get("c") or []]}
    return out


def alb_clean_txt(s, n):
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]", " ", str(s or ""))).strip()[:n]


ALB_LINK = re.compile(r"(?:\b(?:javascript|data|vbscript|file|mailto|intent|blob):|[a-z][a-z0-9+.-]*:/|www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)*\s*[.。．]\s*(?:com|net|org|info|biz|io|co|me|tw|cn|hk|jp|kr|us|uk|ru|ly|gl|gg|cc|tv|xyz|top|app|dev|link|site|online|club|shop|vip|tk|ml|ga|cf|to|im|ai)\b|[a-z0-9]+\.[a-z]{2,}/)", re.I)


def alb_has_link(s):
    """留言、名字只能是文字、表情符號：看起來像網址的一律不收"""
    return bool(ALB_LINK.search(s or ""))


def alb_talk_post(a, th, d):
    """朋友按愛心、留言、刪自己的留言；回傳 (狀態碼, 內容)"""
    pid = str(d.get("i") or "")
    idx = alb_index(a, scan=False)
    if pid == ALB_GB:                                    # 留言簿：給整本留一句話（只能留言，不能按愛心、表情）
        if d.get("rx") is not None or d.get("like") is not None:
            return 400, {"ok": False, "message": "留言簿只能留言"}
    elif pid not in (idx.get("order") or []) or pid in alb_hid(a):
        return 404, {"ok": False, "message": "找不到這張"}
    now = time.time()
    with ALB_LOCK:
        talk = alb_talk_all()
        t = talk.setdefault(a["id"], {}).setdefault(pid, {"l": [], "c": []})
        if d.get("rx") is not None or d.get("like") is not None or d.get("del"):
            rk = (a["id"], th)
            hits = [x for x in ALB["rx_t"].get(rk, []) if now - x < 10]
            if len(hits) >= 30:
                return 429, {"ok": False, "message": "慢一點，等幾秒再試"}
            hits.append(now)
            ALB["rx_t"][rk] = hits
            if len(ALB["rx_t"]) > 5000:
                ALB["rx_t"] = {k: v for k, v in ALB["rx_t"].items() if v and now - v[-1] < 10}
        if d.get("rx") is not None:                      # 其他表情：一支手機一個，再按一次同一個就拿掉
            rs = t.setdefault("r", {})
            e = str(d["rx"])
            if e in ALB_RX and rs.get(th) != e:
                rs[th] = e
                while len(rs) > 500:
                    rs.pop(next(iter(rs)))
            else:
                rs.pop(th, None)
        elif d.get("like") is not None:
            ls = t.setdefault("l", [])
            if d["like"] and th not in ls:
                ls.append(th)
                del ls[:-500]
            elif not d["like"] and th in ls:
                ls.remove(th)
        elif d.get("del"):
            t["c"] = [c for c in t.get("c") or [] if not (c["id"] == d["del"] and c["d"] == th)]
        else:
            txt, name = alb_clean_txt(d.get("s"), ALB_TALK_MAX[0]), alb_clean_txt(d.get("n"), ALB_TALK_MAX[1])
            if not txt:
                return 400, {"ok": False, "message": "還沒寫字"}
            if not name:
                return 400, {"ok": False, "message": "先寫你的名字"}
            if alb_has_link(txt) or alb_has_link(name):
                return 400, {"ok": False, "message": "留言不能放連結"}
            if now - ALB["tpost"].get((a["id"], th), 0) < 3:
                return 429, {"ok": False, "message": "慢一點，等幾秒再留"}
            ALB["tpost"][(a["id"], th)] = now
            if len(ALB["tpost"]) > 5000:
                ALB["tpost"] = {k: v for k, v in ALB["tpost"].items() if now - v < 60}
            cs = t.setdefault("c", [])
            c = {"id": secrets.token_hex(4), "d": th, "n": name, "s": txt, "t": now}
            pa = next((x for x in cs if x["id"] == str(d.get("re") or "")), None)   # 回覆某一則：只有一層，回覆別人的回覆就掛在同一串
            if pa:
                c["r"] = pa.get("r") or pa["id"]
            cs.append(c)
            del cs[:-ALB_TALK_MAX[2]]
            if sum(len(x.get("c") or []) for x in talk[a["id"]].values()) > ALB_TALK_MAX[3]:
                alls = sorted(((c["t"], q) for q, x in talk[a["id"]].items() for c in x.get("c") or []))
                for _, q in alls[:max(0, len(alls) - ALB_TALK_MAX[3])]:   # 整本太多：最早的先拿掉
                    talk[a["id"]][q]["c"].pop(0)
            all_ = alb_all()                               # 名字記在看過的手機上（主人看得到是誰）
            dv = (all_.get(a["id"]) or {}).get("devs", {}).get(th)
            if dv is not None and dv.get("nm") != name:
                dv["nm"] = name
                alb_save(all_)
        alb_talk_save()
    return 200, {"ok": True, **alb_talk_of(a, th).get(pid, {"lk": 0, "me": False, "rx": {}, "mr": "", "cm": []})}


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


def alb_pending():
    """給 /api/status：所有相簿裡等著確認的朋友上傳數"""
    try:
        return sum(len(a.get("pend") or ()) for a in alb_all().values())
    except Exception:  # noqa: BLE001
        return 0


def alb_dl(a):
    """下載：0 不給、1 只給壓縮圖、2 給原圖（舊版存的是 True／False）"""
    v = a.get("dl", 2)
    return 2 if v is True else 0 if v is False or v not in ALB_DLS else v


def alb_ua_name(ua):
    """看過的手機叫什麼：機型＋瀏覽器（看不出來就寫電腦、手機）"""
    ua = ua or ""
    dev = "iPhone" if "iPhone" in ua else "iPad" if "iPad" in ua else ""
    if not dev and "Android" in ua:
        m = re.search(r"Android [\d.]+;(?: [a-z]{2}[-_][A-Za-z]{2};)? ([^;)]+?)(?: Build/[^;)]*)?\)", ua)
        dev = m[1].strip() if m and m[1].strip() not in ("K", "wv") else "Android 手機"
    if not dev:
        dev = "Mac" if "Macintosh" in ua else "Windows 電腦" if "Windows" in ua else "Linux 電腦" if "Linux" in ua else "裝置"
    for k, n in (("Line/", "LINE"), ("Instagram", "Instagram"), ("FBAN", "Facebook"), ("FB_IAB", "Facebook"), ("MicroMessenger", "微信"),
                 ("Barcelona", "Threads"), ("musical_ly", "抖音／TikTok"), ("BytedanceWebview", "抖音／TikTok"), ("Telegram", "Telegram"), (" GSA/", "Google App"),
                 ("EdgA/", "Edge"), ("EdgiOS/", "Edge"), ("Edg/", "Edge"), ("OPR/", "Opera"), ("OPT/", "Opera"), ("OPX/", "Opera"), ("Vivaldi/", "Vivaldi"),
                 ("YaBrowser/", "Yandex"), ("DuckDuckGo/", "DuckDuckGo"), ("Ddg/", "DuckDuckGo"),
                 ("SamsungBrowser", "三星瀏覽器"), ("HuaweiBrowser", "華為瀏覽器"), ("MiuiBrowser", "小米瀏覽器"), ("HeyTapBrowser", "OPPO 瀏覽器"),
                 ("VivoBrowser", "vivo 瀏覽器"), ("UCBrowser", "UC 瀏覽器"), ("QQBrowser", "QQ 瀏覽器"), ("Firefox/", "Firefox"), ("FxiOS", "Firefox"),
                 ("CriOS", "Chrome"), ("Chrome/", "Chrome"), ("Safari/", "Safari")):
        if k in ua:
            return f"{dev}・{n}"[:60]
    return dev[:60]


def alb_dev_tok(h, a):
    for part in (h.headers.get("Cookie") or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == f"vsad_{a['id']}" and re.fullmatch(r"[0-9a-f]{32}", v):
            return v
    return ""


def alb_dev_hash(tok):
    return hashlib.sha256(tok.encode()).hexdigest()[:24]


ALB_E = os.environ.get("SENTINEL_ALB_E", "1") != "0"     # 照片加密傳送（測試可關掉）
ALB_KEY_ROT = 86400                                       # 照片解密鑰匙每天自動輪換一次（換密碼也會立刻失效）
ALB_WEBVIEW_UA = re.compile(r"Line/|FBAN|FBAV|Instagram|MicroMessenger|Threads|Twitter|Snapchat|KAKAOTALK|BytedanceWebview|TikTok|;\s*wv\)", re.I)
ALB_CSP = ("; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'"
           "; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'"
           "; connect-src 'self'; worker-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'")


def alb_webview(h):
    """是不是不支援背景解密的 App 內建瀏覽器（像 LINE、FB、IG、微信）"""
    return bool(ALB_WEBVIEW_UA.search(h.headers.get("User-Agent") or ""))


def alb_key_ep():
    return int(time.time() // ALB_KEY_ROT)


def alb_kid(th, ep):
    return f"{th[:8] or '0'}-{ep}"


def alb_ekey(a, th, ep=None):
    """這支手機看這本相簿的照片鑰匙（AES-256-GCM）：每天輪換、換密碼立即作廢"""
    ep = alb_key_ep() if ep is None else ep
    pw = (a.get("pw") or {}).get("h", "")[:16]
    return hmac.new((a["k"] + "|e").encode(), f"{a['id']}|{th}|{ep}|{pw}".encode(), hashlib.sha256).digest()


def alb_pl_val(a, th):
    return hmac.new((a["k"] + "|pl").encode(), (a["id"] + "|" + th).encode(), hashlib.sha256).hexdigest()[:32]


def alb_th(h, a):
    tok = alb_dev_tok(h, a)
    return alb_dev_hash(tok) if tok else ""


def alb_plain_ok(h, a, th):
    """只有真的不能在背景解開的 App 內建瀏覽器（例如 LINE）才允許明文傳圖，一般瀏覽器一律強制加密"""
    if not alb_webview(h):
        return False
    for part in (h.headers.get("Cookie") or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == f"vsap_{a['id']}":
            return hmac.compare_digest(v, alb_pl_val(a, th))
    return False


def alb_media_ok(h, a):
    """影片、原況照片、背景音樂：擋掉跨站讀取；不開放下載的相簿也擋掉直接開分頁下載"""
    sfs = h.headers.get("Sec-Fetch-Site") or ""
    if sfs in ("cross-site", "same-site"):
        return False
    if alb_dl(a) == 0:
        sfd = h.headers.get("Sec-Fetch-Dest") or ""
        sfm = h.headers.get("Sec-Fetch-Mode") or ""
        if sfd in ("document", "iframe", "object", "embed") or sfm == "navigate":
            return False
    return True


def alb_img_out(h, a, b, ct, cache="private, max-age=86400", own=False):
    """看的照片一律加密送出（album-sw.js 在看的人的瀏覽器裡解開）；直接抓網址、用下載工具拿到的是亂碼"""
    extra = []
    if ALB_E and not own and _seal_lib():
        th = alb_th(h, a)
        if not alb_plain_ok(h, a, th):
            ep = alb_key_ep()
            iv = secrets.token_bytes(12)
            aad = urllib.parse.urlsplit(h.path).path.encode()
            b = iv + _gcm(False, alb_ekey(a, th, ep), iv, b, aad)
            extra = [("X-Alb-E", alb_kid(th, ep)), ("X-Alb-T", ct)]
            ct = "application/octet-stream"
    h.send_response(200)
    h.send_header("Content-Type", ct)
    h.send_header("Content-Length", str(len(b)))
    h.send_header("Cache-Control", cache)
    h.send_header("X-Content-Type-Options", "nosniff")
    h.send_header("X-Frame-Options", "DENY")
    h.send_header("Referrer-Policy", "no-referrer")
    for k, v in extra:
        h.send_header(k, v)
    h.end_headers()
    try:
        h.wfile.write(b)
    except (BrokenPipeError, ConnectionResetError, OSError):
        pass
    return True


def alb_dev_check(h, a, register):
    """這支手機能不能看；register＝打開相簿那一下（要記下來、可能佔一個名額）。回傳 (能不能看, 原因, 要給的新 cookie)"""
    tok, new = alb_dev_tok(h, a), ""
    lim = a.get("dev") or 0
    strict = bool(lim or a.get("ban") or a.get("lock"))
    if not tok:
        if not register:
            return not strict, "full", ""
        tok = new = secrets.token_hex(16)
    th = alb_dev_hash(tok)
    if th in (a.get("ban") or []):
        return False, "ban", ""
    if th in (a.get("lock") or {}):                    # 按了截圖鍵被鎖住：等主人解除
        return False, "lock", ""
    if not register:
        return (not strict) or th in (a.get("devs") or {}), "full", ""
    now = time.time()
    with ALB_LOCK:
        all_ = alb_all()
        b = all_.get(a["id"])
        if not b:
            return False, "gone", ""
        devs = b.setdefault("devs", {})
        d = devs.get(th)
        dirty = False
        if not d:
            if lim and len(devs) >= lim:
                return False, "full", ""
            d = devs[th] = {"n": alb_ua_name(h.headers.get("User-Agent")), "t0": now, "t": 0, "c": 0}
            dirty = True
            if len(devs) > ALB_DEVKEEP:
                for k in sorted((x for x in devs if x != th), key=lambda x: devs[x].get("t", 0))[:len(devs) - ALB_DEVKEEP]:   # 剛打開的這支不能被擠掉
                    devs.pop(k, None)
        if now - d.get("t", 0) > 1800:                 # 半小時內同一支再打開不重算
            d["c"] = d.get("c", 0) + 1
            b["views"] = b.get("views", 0) + 1
            dirty = True
        if dirty or now - d.get("t", 0) >= 60:         # 一分鐘內同一支重刷不重複寫硬碟
            d["t"] = b["last"] = now
            try:
                alb_save(all_)
            except OSError:
                pass
        else:
            d["t"] = b["last"] = now
    return True, "", new


def alb_own_val(a, exp):
    exp = int(exp)
    return f"{exp}.{hmac.new((a['k'] + '|own').encode(), (a['id'] + '|' + str(exp)).encode(), hashlib.sha256).hexdigest()[:32]}"


def alb_own_ok(h, a):
    """主人挑照片時看小圖（帶短時間的通行證，不用密碼、不佔手機名額）"""
    v = (urllib.parse.parse_qs(urllib.parse.urlsplit(h.path).query).get("own") or [""])[0]
    exp = v.split(".")[0]
    return exp.isdigit() and time.time() < int(exp) and hmac.compare_digest(v, alb_own_val(a, exp))


ALB_FONT = {"f": None}


def alb_font(text):
    """浮水印用的字型（主機上要有；中文要有中文字型）；沒有就回空字串"""
    if ALB_FONT["f"] is None:
        f = {"cjk": "", "any": ""}
        env = os.environ.get("SENTINEL_ALB_FONT")
        if env is not None:
            f = {"cjk": env, "any": env}
        else:
            try:
                r = subprocess.run(["fc-list", ":lang=zh-tw", "file"], capture_output=True, text=True, timeout=10)
                fs = sorted(x.split(":")[0].strip() for x in r.stdout.splitlines() if x.strip())
                f["cjk"] = next((x for x in fs if re.search(r"(?i)(sans|hei|gothic)", x)), fs[0] if fs else "")
                r = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold"], capture_output=True, text=True, timeout=10)
                f["any"] = f["cjk"] or r.stdout.strip()
            except (OSError, subprocess.SubprocessError):
                pass
        ALB_FONT["f"] = f
    f = ALB_FONT["f"]
    font = f["any"] if text.isascii() else f["cjk"]
    return font if font and os.path.exists(font) and "'" not in font and ":" not in font else ""


def alb_wm_bake(a):
    """浮水印能不能直接印在照片上（要主機上的 ffmpeg 和字型；在雲端硬碟容器裡做的看不到主機的字型）"""
    wm = a.get("wm") or ""
    ff = alb_ff()
    return bool(wm and ff and not ff[1] and alb_font(wm))


def alb_photos_in(p):
    out = []
    try:
        with os.scandir(p) as it:
            for e in it:
                if e.name.startswith(".") or os.path.splitext(e.name)[1].lower() not in ALB_EXT | ALB_EXT2 | ALB_VID:
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


def alb_up_files(p):
    """朋友放的：相簿資料夾裡「朋友放的／某人／」的照片、影片（檔名帶著這兩層）"""
    out, root = [], os.path.join(p, ALB_UPDIR)
    try:
        with os.scandir(root) as it:
            subs = [e for e in it if not e.name.startswith(".") and e.is_dir(follow_symlinks=False)]
    except OSError:
        return out
    for e in subs:
        out += [(f"{ALB_UPDIR}/{e.name}/{n}", sz, mt) for n, sz, mt in alb_photos_in(e.path)]
    return out


def alb_uq(a):
    v = a.get("uq", 1)
    return v if v in ALB_UQ else 1


def alb_up_used(a, th=""):
    """朋友總共放了多少、這支手機放了多少（位元組）"""
    sub = (a.get("ufd") or {}).get(th) if th else None
    tot = mine = 0
    for m in (alb_index(a, scan=False).get("ph") or {}).values():
        w = alb_up_who(m.get("n", ""))
        if w:
            tot += m.get("sz", 0)
            if sub and w == sub:
                mine += m.get("sz", 0)
    return tot, mine


def alb_up_who(n):
    """朋友放的檔案是誰的資料夾（不是朋友放的回空字串）"""
    k = n.split("/")
    return k[1] if len(k) == 3 and k[0] == ALB_UPDIR else ""


def alb_up_folder(a, th, who):
    """這支手機的資料夾名稱：第一次放照片時照名字取，名字一樣的別支手機加編號"""
    ufd = a.setdefault("ufd", {})
    if th in ufd:
        return ufd[th]
    base = re.sub(r'[\x00-\x1f\x7f/\\:*?"<>|\u200b-\u200f\u202a-\u202e\u2066-\u2069]', "", who).strip().lstrip(".")[:20] or "朋友"
    p = alb_path(a["dir"]) or ""
    for k, v in list(ufd.items()):                     # 資料夾已經被整理掉的：名字讓出來（那支手機下次放再重取）
        if not os.path.isdir(os.path.join(p, ALB_UPDIR, v)):
            ufd.pop(k)
    used, n, k = set(ufd.values()), base, 2
    while n in used:
        n, k = f"{base} {k}", k + 1
    ufd[th] = n
    return n


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


def alb_hid(a):
    """朋友看不到的：主人挑掉的、朋友上傳還沒確認的"""
    return set(a.get("hide") or []) | set(a.get("pend") or [])


def alb_up(a):
    v = a.get("up", 0)
    return v if v in ALB_UPS else 0


def alb_sniff(head, ext):
    """上傳的檔案真的是照片、影片嗎（看檔頭，不看副檔名）"""
    if head[:2] == b"\xff\xd8":
        return ext in (".jpg", ".jpeg")
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return ext == ".png"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return ext == ".gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ext == ".webp"
    if head[4:8] == b"ftyp":
        return ext in (".heic", ".heif", ".avif", ".mp4", ".mov", ".m4v", ".3gp")
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return ext in (".webm", ".mkv")
    return False


def alb_up_name(p, name, ext=""):
    """朋友上傳的檔名：拿掉怪字、保留驗證過的副檔名、不蓋掉原本的檔案"""
    stem0, ext0 = os.path.splitext(os.path.basename(str(name or "")))
    ext = (ext or ext0).lower()
    stem = re.sub(r'[\x00-\x1f\x7f/\\:*?"<>|\u200b-\u200f\u202a-\u202e\u2066-\u2069]', "", stem0).strip().lstrip(".")[:110]
    stem = stem or time.strftime("上傳-%Y%m%d-%H%M%S")
    for k in range(1, 1000):
        n = f"{stem}{'' if k == 1 else f' ({k})'}{ext}"
        if not os.path.lexists(os.path.join(p, n)):
            return n
    return f"{stem}-{secrets.token_hex(3)}{ext}"


def alb_up_note(a, th, who, pend):
    """朋友上傳：停下來一陣子才記一筆（一次放好幾張只通知一次）"""
    key = (a["id"], th)
    with ALB_LOCK:
        e = ALB["upev"].setdefault(key, {"n": 0})
        e["n"] += 1
        e.update(who=who, pend=pend, name=a["name"])
        if e.get("tm"):
            e["tm"].cancel()
        e["tm"] = threading.Timer(ALB_UP_EV, alb_up_flush, (key,))
        e["tm"].daemon = True
        e["tm"].start()


def alb_snap_lock(a, th):
    """鎖住按了截圖鍵的手機，記一筆（會傳 Telegram）；已經鎖住或未登記的裝置不重記、不擠掉既有名單"""
    with ALB_LOCK:
        all_ = alb_all()
        b = all_.get(a["id"])
        devs = (b or {}).get("devs") or {}
        if not b or th not in devs or th in (b.get("ban") or []) or th in (b.get("lock") or {}):
            return False
        lk = b.setdefault("lock", {})
        lk[th] = time.time()
        while len(lk) > 200:
            lk.pop(min(lk, key=lk.get))
        nm = devs.get(th) or {}
        who = nm.get("nm") or nm.get("n") or "一支手機"
        try:
            alb_save(all_)
        except OSError:
            return False
    COL.add_event("warn", f"相簿截圖：{who} 在「{b['name']}」按了截圖，已鎖住")
    return True


def alb_dev_info(a, th, d):
    """朋友那頁送來這台的型號、系統、瀏覽器、螢幕（主人「看過的設備」看得到）；只收短字，拿掉控制字元"""
    if not isinstance(d, dict):
        return False
    cl = lambda v, n: re.sub(r"[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>]", "", str(v or ""))[:n].strip()
    i = {k: cl(d.get(k), n) for k, n in (("m", 48), ("os", 24), ("br", 24), ("sc", 16))}
    i = {k: v for k, v in i.items() if v}
    now = time.time()
    with ALB_LOCK:
        all_ = alb_all()
        dv = ((all_.get(a["id"]) or {}).get("devs") or {}).get(th)
        if not dv:
            return False
        if dv.get("i") != i:
            dk = (a["id"], th)
            if now - ALB["di_t"].get(dk, 0) < 5:
                return True
            ALB["di_t"][dk] = now
            if len(ALB["di_t"]) > 5000:
                ALB["di_t"] = {k: v for k, v in ALB["di_t"].items() if now - v < 60}
            dv["i"] = i
            try:
                alb_save(all_)
            except OSError:
                return False
    return True


def alb_up_flush(key):
    with ALB_LOCK:
        e = ALB["upev"].pop(key, None)
    if e and e["n"]:
        COL.add_event("info", f"相簿上傳：{e['who']} 在「{e['name']}」放了 {e['n']} 個" + ("，等你確認" if e["pend"] else ""))


def alb_upload(h, a, code):
    """朋友上傳一個檔案（POST /a/十碼/up?n=檔名&w=名字，內容就是檔案本身）"""
    h.close_connection = True                          # 上傳完（或沒收下）就斷線，沒讀的資料不會留在連線上
    mode = alb_up(a)
    ok, _, _ = alb_dev_check(h, a, False)
    tok = alb_dev_tok(h, a)
    if not mode:
        return 403, {"ok": False, "message": "這本相簿沒開放上傳"}
    if not (alb_cookie_ok(h, a) and ok and tok):
        return 403, {"ok": False, "message": "重新打開相簿再試"}
    th = alb_dev_hash(tok)
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(h.path).query)
    who = alb_clean_txt((q.get("w") or [""])[0], ALB_TALK_MAX[1])
    if not who:
        return 400, {"ok": False, "message": "先寫你的名字"}
    if alb_has_link(who):
        return 400, {"ok": False, "message": "名字不能放連結"}
    try:
        n = int(h.headers.get("Content-Length") or -1)
    except ValueError:
        n = -1
    if n <= 0:
        return 411, {"ok": False, "message": "檔案是空的"}
    p = alb_path(a["dir"])
    if not p:
        return 404, {"ok": False, "message": "主機上找不到這本相簿的資料夾"}
    name = os.path.basename((q.get("n") or [""])[0])
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALB_EXT | ALB_VID:
        return 415, {"ok": False, "message": "只能放照片、影片"}
    lim = ALB_UP_MAX if ext in ALB_VID else ALB_UP_PIC
    if n > lim:
        return 413, {"ok": False, "message": f"檔案太大（{'影片' if ext in ALB_VID else '照片'}最多 {lim >> 20} MB）"}
    with ALB_LOCK:                                     # 同時在放的：一本最多 ALB_UP_PAR 個、一支手機一次一個，空間先算進去
        fl = ALB["upfl"].setdefault(a["id"], {})
        if th in fl:
            return 429, {"ok": False, "message": "上一個還在放"}
        if len(fl) >= ALB_UP_PAR:
            return 429, {"ok": False, "message": "大家正在放，等一下再試"}
        busy = sum(fl.values())
        fl[th] = n
    try:
        return alb_upload_go(h, a, mode, th, who, n, p, name, ext, busy)
    finally:
        with ALB_LOCK:
            fl.pop(th, None)


def alb_upload_go(h, a, mode, th, who, n, p, name, ext, busy):
    tot, mine = alb_up_used(a, th)
    tot += busy
    cap = alb_uq(a) << 30
    if tot + n > cap:
        return 409, {"ok": False, "message": "相簿滿了"}
    if mine + n > cap // 4:
        return 409, {"ok": False, "message": "你放的已經到上限了"}
    now = time.time()
    with ALB_LOCK:
        upd = (alb_all().get(a["id"]) or {}).get("upd") or {}
        today = sum(1 for u in upd.values() if u.get("by") == th and now - u.get("t", 0) < 86400)
    if today >= ALB_UP_DAY:
        return 429, {"ok": False, "message": "今天放太多了，明天再來"}
    if len(alb_index(a, scan=False).get("ph") or {}) >= ALB_MAX:
        return 409, {"ok": False, "message": "相簿滿了"}
    for d, keep in ((p, ALB_UP_SPARE), (DATA_DIR, ALB_UP_HOST)):    # 雲端硬碟、主機本身都要留空間
        try:
            st = os.statvfs(d)
            if st.f_bavail * st.f_frsize - n < keep:
                return 507, {"ok": False, "message": "相簿滿了"}
        except OSError:
            pass
    with ALB_LOCK:
        all_ = alb_all()
        b = all_.get(a["id"])
        if not b:
            return 404, {"ok": False, "message": "這本相簿已經看不到了"}
        sub = alb_up_folder(b, th, who)
        alb_save(all_)
    dst = os.path.join(p, ALB_UPDIR, sub)
    try:
        for d in (os.path.join(p, ALB_UPDIR), dst):
            if not os.path.isdir(d):
                os.mkdir(d, 0o755)
                if os.geteuid() == 0:
                    os.chown(d, 1000, 1000)
    except OSError:
        return 500, {"ok": False, "message": "沒放上去，再試一次"}
    if os.path.islink(os.path.join(p, ALB_UPDIR)) or os.path.islink(dst):
        return 500, {"ok": False, "message": "沒放上去，再試一次"}
    tmp = os.path.join(dst, f".vsup-{secrets.token_hex(6)}.part")
    try:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        try:
            if os.geteuid() == 0:
                os.fchown(fd, 1000, 1000)              # 雲端硬碟程式用 1000 在跑，要是它的才改得動
        except OSError:
            pass
        left, head = n, b""
        with os.fdopen(fd, "wb") as f:
            while left:
                b = h.rfile.read(min(left, 1 << 20))
                if not b:
                    raise OSError("斷線了")
                if len(head) < 32:
                    head += b[:32 - len(head)]
                    if len(head) >= 12 and not alb_sniff(head, ext):
                        raise ValueError("不是照片或影片")
                f.write(b)
                left -= len(b)
        if not alb_sniff(head, ext):
            raise ValueError("不是照片或影片")
        with ALB_LOCK:
            final = alb_up_name(dst, name, ext)
            os.rename(tmp, os.path.join(dst, final))
        final = f"{ALB_UPDIR}/{sub}/{final}"
    except ValueError as e:
        h.close_connection = True
        try:
            os.remove(tmp)
        except OSError:
            pass
        return 415, {"ok": False, "message": str(e)}
    except OSError:
        h.close_connection = True
        try:
            os.remove(tmp)
        except OSError:
            pass
        return 500, {"ok": False, "message": "沒放上去，再試一次"}
    pid = alb_pid(final)
    m = alb_meta(os.path.join(p, final))
    m.update(n=final, sz=n, mt=int(os.path.getmtime(os.path.join(p, final))))
    bad = ""
    if not m.get("vid") and m.get("w", 0) * m.get("h", 0) > ALB_UP_PX:
        bad = "照片太大（最多 1 億像素）"                   # 炸彈圖：檔案小、解開很大
    elif alb_ff():                                     # 真的打開一次：做不出小圖就不是照片、影片
        if os.path.splitext(final)[1].lower() in (".gif", ".png", ".webp"):
            m["anim"] = alb_anim(os.path.join(p, final))
        with ALB_GEN:
            if not alb_make(a, pid, m):
                bad = "打不開這個檔案"
    if bad:
        try:
            os.remove(os.path.join(p, final))
        except OSError:
            pass
        return 415, {"ok": False, "message": bad}
    with ALB_LOCK:
        all_ = alb_all()
        b = all_.get(a["id"])
        if b:
            b.setdefault("upd", {})[pid] = {"by": th, "n": who, "t": now, "f": final}
            if mode == 1:
                b["pend"] = (b.get("pend") or [])[-(ALB_MAX - 1):] + [pid]
            alb_save(all_)
            a = b
    try:
        alb_index(a)
    except Exception:  # noqa: BLE001
        pass
    alb_kick(a["id"])
    alb_up_note(a, th, who, mode == 1)
    return 200, {"ok": True, "i": pid, "pend": mode == 1}


def alb_up_del(h, a):
    """朋友刪掉自己放的那張"""
    ok, _, _ = alb_dev_check(h, a, False)
    tok = alb_dev_tok(h, a)
    if not (alb_cookie_ok(h, a) and ok and tok):
        return 403, {"ok": False, "message": "重新打開相簿再試"}
    raw = h.read_body(1024)
    if raw is None:
        return 400, {"ok": False, "message": "請求格式不對"}
    pid = str(h.jbody(raw).get("del") or "")
    th = alb_dev_hash(tok)
    with ALB_LOCK:
        all_ = alb_all()
        b = all_.get(a["id"])
        u = ((b or {}).get("upd") or {}).get(pid)
        if not (b and u and u.get("by") == th):
            return 403, {"ok": False, "message": "只能刪自己放的"}
        if not alb_up_drop(b, [pid]):
            return 404, {"ok": False, "message": "已經不在了"}
        b["upd"].pop(pid, None)
        b["pend"] = [x for x in b.get("pend") or [] if x != pid]
        alb_save(all_)
    try:
        alb_index(b)
    except Exception:  # noqa: BLE001
        pass
    return 200, {"ok": True}


def alb_up_drop(a, pids):
    """刪掉朋友上傳的檔案（主人不要、或朋友刪自己的）"""
    p = alb_path(a["dir"])
    idx = alb_index(a, scan=False).get("ph") or {}
    gone = []
    for pid in pids:
        m = idx.get(pid)
        u = (a.get("upd") or {}).get(pid)
        if not (m and u and p) or m.get("n") != u.get("f"):    # 只刪朋友上傳的那個檔案
            continue
        for fn in [m["n"]] + ([m["lv"]["n"]] if m.get("lv") else []):
            try:
                os.remove(os.path.join(p, fn))
            except OSError:
                pass
        if alb_up_who(m["n"]):                         # 那個人的資料夾空了就拿掉
            try:
                os.rmdir(os.path.join(p, os.path.dirname(m["n"])))
            except OSError:
                pass
        gone.append(pid)
    return gone


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
         "t0": now, "loc": d.get("loc", True) is not False, "dl": alb_dl({"dl": d.get("dl", 2)}), "views": 0, "last": 0,
         "k": secrets.token_hex(16), "dev": d.get("dev") if d.get("dev") in ALB_DEVS else 0, "devs": {}, "ban": [], "hide": [],
         "wm": alb_clean_wm(d.get("wm")), "talk": d.get("talk", True) is not False, "shy": d.get("shy", True) is not False, "snap": d.get("snap") is True, "lock": {},
         "up": d.get("up") if d.get("up") in ALB_UPS else 0, "upd": {}, "pend": [], "uq": d.get("uq") if d.get("uq") in ALB_UQ else 1}
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


def alb_clean_wm(s):
    return re.sub(r"[\x00-\x1f\x7f]", "", str(s or "")).strip()[:24]


def alb_edit(d):
    regen = False
    with ALB_LOCK:
        all_ = alb_all()
        a = all_.get(str(d.get("id") or ""))
        if not a:
            return False, "這本已經收回了"
        if "name" in d:
            a["name"] = alb_clean_name(d.get("name"), a["name"])
        if "intro" in d:                                   # 相簿介紹：可以換行，最多空一行
            t = re.sub(r"[\x00-\x09\x0b-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]", " ", str(d.get("intro") or ""))
            t = re.sub(r"\n{3,}", "\n\n", "\n".join(re.sub(r"[ \t]+", " ", x).strip() for x in t.replace("\r", "").split("\n"))).strip()[:ALB_INTRO]
            if alb_has_link(t):
                return False, "介紹不能放連結"
            a["intro"] = t
        if "loc" in d:
            a["loc"] = bool(d["loc"])
        if "talk" in d:
            a["talk"] = bool(d["talk"])
        if "shy" in d:
            a["shy"] = bool(d["shy"])
        if "snap" in d:
            a["snap"] = bool(d["snap"])
        if "unlock" in d:                                 # 解除截圖鎖住的手機
            (a.get("lock") or {}).pop(str(d["unlock"]), None)
        if "dl" in d:
            a["dl"] = alb_dl({"dl": d["dl"]})
        if d.get("uq") in ALB_UQ:
            a["uq"] = d["uq"]
        if "up" in d and d["up"] in ALB_UPS:
            a["up"] = d["up"]
            if a["up"] == 2:                           # 改成直接放上去：等著確認的也一起放上去
                a["pend"] = []
        if isinstance(d.get("okup"), list):            # 主人確認朋友上傳的：放上去
            ok = set(map(str, d["okup"]))
            a["pend"] = [x for x in a.get("pend") or [] if x not in ok]
        if isinstance(d.get("noup"), list):            # 主人不要：刪掉檔案
            gone = set(alb_up_drop(a, [str(x) for x in d["noup"]][:ALB_MAX]))
            a["pend"] = [x for x in a.get("pend") or [] if x not in gone]
            for x in gone:
                (a.get("upd") or {}).pop(x, None)
            regen = regen or bool(gone)
        if "dev" in d and d["dev"] in ALB_DEVS:
            a["dev"] = d["dev"]
            devs = a.get("devs") or {}
            if a["dev"] and len(devs) > a["dev"]:          # 名額變少：留最近看的那幾支
                keep = sorted(devs, key=lambda x: -devs[x].get("t", 0))[:a["dev"]]
                a["devs"] = {k: devs[k] for k in keep}
        if "kick" in d:                                   # 踢掉一支手機：之後這支打不開
            th = str(d["kick"])
            if th in (a.get("devs") or {}):
                a["devs"].pop(th)
                a["ban"] = (a.get("ban") or [])[-199:] + [th]
        if "hide" in d and isinstance(d["hide"], list):
            idx = alb_index(a, scan=False)
            a["hide"] = [x for x in d["hide"] if isinstance(x, str) and x in (idx.get("ph") or {})][:ALB_MAX]
        if "wm" in d:
            wm = alb_clean_wm(d["wm"])
            regen = regen or wm != (a.get("wm") or "")
            a["wm"] = wm
        if "pw" in d:
            pw = str(d.get("pw") or "")
            if pw and not 4 <= len(pw) <= 64:
                return False, "密碼要 4～64 個字"
            a["pw"] = alb_pw_hash(pw) if pw else None
            a["k"] = secrets.token_hex(16)                 # 換密碼：之前輸對的瀏覽器要重輸
        if "secs" in d and str(d["secs"]).isdigit() and int(d["secs"]) in ALB_TIMES:
            s = int(d["secs"])
            a["exp"] = time.time() + s if s else 0
            a["es"] = time.time()                          # 這次的期限從什麼時候算（朋友那頁畫剩下多少）
        alb_save(all_)
    if isinstance(d.get("noup"), list):
        try:
            alb_index(a)
        except Exception:  # noqa: BLE001
            pass
    if a["loc"] or regen:
        alb_kick(a["id"])
    return True, "改好了"


def alb_del(aid):
    with ALB_LOCK:
        all_ = alb_all()
        a = all_.pop(str(aid or ""), None)
        if not a:
            return False, "這本已經收回了"
        alb_save(all_)
    with ALB_IDX_LOCK:
        ALB["idx"].pop(a["id"], None)
    try:
        os.remove(os.path.join(ALB_CACHE, f"idx-{a['id']}.json"))
    except OSError:
        pass
    with ALB_LOCK:
        if alb_talk_all().pop(a["id"], None) is not None:
            alb_talk_save()
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
        hid = alb_hid(a)
        out.append({"id": a["id"], "code": a["code"], "name": a["name"], "dir": a["dir"], "exp": a["exp"], "t0": a["t0"],
                    "pw": bool(a.get("pw")), "loc": a["loc"], "dl": alb_dl(a), "views": a.get("views", 0), "last": a.get("last", 0),
                    "n": len([x for x in ph if x not in hid]), "all": len(ph), "cv": alb_cover(a, idx), "ready": alb_ready(a, idx),
                    "dev": a.get("dev") or 0, "ndev": len(a.get("devs") or {}), "wm": a.get("wm") or "", "wmok": not a.get("wm") or alb_wm_bake(a),
                    "talk": a.get("talk", True), "shy": a.get("shy", True), "snap": bool(a.get("snap")), "nlock": len(a.get("lock") or {}), "mu": (idx.get("mu") or {}).get("n", ""), "up": alb_up(a), "intro": a.get("intro", ""),
                    "npend": len([x for x in a.get("pend") or [] if x in (idx.get("ph") or {})]),
                    "uq": alb_uq(a), "uused": alb_up_used(a)[0],
                    "nup": len([m for m in (idx.get("ph") or {}).values() if alb_up_who(m.get("n", "")) and not m.get("of")]),
                    "nv": len([x for x in ph if x not in hid and (idx.get("ph") or {}).get(x, {}).get("vid")]),
                    "nlk": sum(len(t.get("l") or []) for t in (alb_talk_all().get(a["id"]) or {}).values()),
                    "ncm": sum(len(t.get("c") or []) for t in (alb_talk_all().get(a["id"]) or {}).values())})
    return {"ok": True, "list": out, "base": alb_base(), "cloud": bool(alb_root()), "times": ALB_TIMES}


def alb_cover(a, idx):
    """主人清單的封面：直接帶小圖（有密碼的相簿用連結會被擋；別台主機也不用另外連）"""
    hid = alb_hid(a)
    order = [x for x in idx.get("order") or [] if x not in hid]
    for pid in order[:6]:
        m = (idx.get("ph") or {}).get(pid)
        if not m or m.get("bad"):
            continue
        fn = alb_cfile(alb_ckey(a, pid, m), "s")
        try:
            return "data:image/jpeg;base64," + base64.b64encode(sec_read(fn)).decode()
        except (OSError, ValueError):
            continue
    return ""


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
          0xA405: "f35", 0xA402: "em", 0xA403: "wb", 0xA432: "lsp", 0xA433: "lmk", 0xA434: "ln", 0xA406: "sc", 0xA002: "pw", 0xA003: "ph",
          0x9214: "sa", 0x9206: "sd", 0xA20E: "fpx", 0xA20F: "fpy", 0xA210: "fpu", 0x9286: "uc"}
GPS_T = {1: "latr", 2: "lat", 3: "lonr", 4: "lon", 5: "altr", 6: "alt", 7: "gts", 0x10: "dirr", 0x11: "dir", 0x1D: "gds"}
TIFF_SZ = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}


def alb_tiff(b):
    """讀 TIFF 格式的 EXIF；回傳 (資料, 定位資料在 b 裡的位置〔要拿掉時整段清成 0〕)"""
    if len(b) < 8 or b[:2] not in (b"II", b"MM"):
        return {}, []
    e = "<" if b[:2] == b"II" else ">"
    out, spans, vis, left = {}, [], set(), [2048]

    def ifd(off, names, gps=False, depth=0):
        if depth > 3 or left[0] <= 0 or (off, gps) in vis or not 8 <= off < len(b) - 2:
            return
        vis.add((off, gps))
        n = struct.unpack_from(e + "H", b, off)[0]
        if n > 512 or off + 2 + n * 12 > len(b):
            return
        if gps:
            spans.append((off, 2 + n * 12))
        did_exif = did_gps = False
        for i in range(n):
            if left[0] <= 0:
                return
            left[0] -= 1
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
                if not did_exif and vo + 4 <= len(b):
                    did_exif = True
                    ifd(struct.unpack_from(e + "I", b, vo)[0], EXIF_T, False, depth + 1)
                continue
            if tag == 0x8825 and not gps:
                if not did_gps and vo + 4 <= len(b):
                    did_gps = True
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


def alb_gps_oz(dt, gds, gts):
    """當地時間減掉定位的世界標準時間＝時區（取到 15 分鐘；差太多的不算）"""
    try:
        if not (isinstance(gds, str) and isinstance(gts, list) and len(gts) == 3):
            return ""
        sec = sum((a / b if b else 0) * m for (a, b), m in zip(gts, (3600, 60, 1)))
        utc = datetime.strptime(gds[:10], "%Y:%m:%d") + timedelta(seconds=sec)
        loc = datetime.strptime(dt[:19], "%Y:%m:%d %H:%M:%S")
        d = (loc - utc).total_seconds() / 60
        q = round(d / 15) * 15
        if abs(d - q) > 5 or abs(q) > 14 * 60:
            return ""
        return f"{'+' if q >= 0 else '-'}{abs(q) // 60:02d}:{abs(q) % 60:02d}"
    except (ValueError, TypeError, ZeroDivisionError, OverflowError):
        return ""


ALB_CROP = [                                      # 型號 → 換算倍率（相機沒寫感光元件大小時用）
    (r"PANASONIC.*DC-S\d|LEICA.*(SL|Q|M1\d|M\d{2})|SONY.*(ILCE-[179]|ILCE-1\b|ZV-E1\b)|CANON.*EOS R([13568]|P)?\b|CANON.*5D|CANON.*6D|NIKON.*Z ?[5-9]\b|NIKON.*Z ?F\b|NIKON.*D[78]\d0\b|SIGMA.*FP", 1.0),
    (r"FUJIFILM.*GFX|HASSELBLAD", 0.79),
    (r"FUJIFILM.*X|SONY.*(ILCE-[56]\d|NEX|ZV-E10)|NIKON.*Z ?(30|50|FC)|NIKON.*D[357]\d{3}|PENTAX.*K-?\d|RICOH.*GR|LEICA.*(CL|TL)", 1.53),
    (r"CANON.*(EOS R(7|10|50|100)|EOS M|\d{2,4}D)", 1.6),
    (r"PANASONIC.*(DC-G|DMC-G|DC-GH|DC-GX|DC-G9)|OLYMPUS|OM DIGITAL|OM SYSTEM|DJI.*(FC|L\d)", 2.0),
    (r"SONY.*DSC-RX(100|10\b)|CANON.*G\d X|PANASONIC.*(DC-ZS200|DMC-LX10|DC-TZ2\d\d)", 2.7),
]


def alb_crop(t, x):
    """換算成全片幅的倍率：先用 EXIF 的感光元件解析度算，沒有再查型號；算不出來回 None"""
    try:
        u = {2: 25.4, 3: 10.0, 4: 1.0, 5: .001}.get(t.get("fpu") if isinstance(t.get("fpu"), int) else 2)
        rx, ry = _rat(t.get("fpx")), _rat(t.get("fpy"))
        pw, ph = int(t.get("pw") or 0), int(t.get("ph") or 0)
        if u and rx and ry and pw > 200 and ph > 200:
            d = math.hypot(pw / rx * u, ph / ry * u)
            cf = 43.27 / d if d else 0
            if .5 <= cf <= 12:
                return round(cf, 2)
    except (TypeError, ValueError, ZeroDivisionError):
        pass
    nm = f"{x.get('mk', '')} {x.get('md', '')}".upper()
    for rx, cf in ALB_CROP:
        if re.search(rx, nm):
            return cf
    return None


def alb_afp(t, ms, ori, irot, w, h):
    """對焦的位置：[x, y, 框的大小]（照片轉正後的比例 0～1）；相機沒記就回 None"""
    fp = ms.pop("fp", None)
    pt = None
    if fp:                                             # 製造商資料：(x, y, 參考寬, 參考高)；比例的參考是 1，0 代表照片本身的大小
        fx, fy, rw, rh = fp[:4]
        rw, rh = rw or int(t.get("pw") or 0) or w, rh or int(t.get("ph") or 0) or h
        if rw and rh:
            pt = [fx / rw, fy / rh, fp[4] if len(fp) > 4 else .1]
    sa = t.get("sa")
    if not pt and isinstance(sa, list) and len(sa) in (2, 3, 4):   # EXIF 的 SubjectArea（手機、部分相機）
        rw, rh = int(t.get("pw") or 0) or w, int(t.get("ph") or 0) or h
        if rw and rh:
            bw = sa[2] / rw if len(sa) == 4 else sa[2] / min(rw, rh) if len(sa) == 3 else .1
            bh = sa[3] / rh if len(sa) == 4 else bw
            if bw <= .45 and bh <= .45:               # 一大塊在中間的不是對焦點
                pt = [sa[0] / rw, sa[1] / rh, max(.04, min(.3, max(bw, bh) if len(sa) == 4 else bw))]
    if not pt or not (.005 < pt[0] < .995 and .005 < pt[1] < .995):
        return None
    x, y = pt[0], pt[1]
    r = {1: 8, 2: 3, 3: 6}.get(irot) or ori
    if r == 6:
        x, y = 1 - y, x
    elif r == 8:
        x, y = y, 1 - x
    elif r == 3:
        x, y = 1 - x, 1 - y
    return [round(x, 4), round(y, 4), round(pt[2], 3)]


def alb_faces(t, ms, ori, irot, w, h):
    """相機偵測到的臉：[[x, y, 寬, 高], …]（照片轉正後的比例 0～1，x、y 是中心）；沒記就回 None"""
    fc, ref = ms.pop("fc", None), ms.pop("fcr", None)
    if not fc or not ref:
        return None
    pw, ph = int(t.get("pw") or 0) or w, int(t.get("ph") or 0) or h
    if not pw or not ph:
        return None
    rw = ref[0] or pw
    rh = rw * ph / pw if ref[1] == -1 else ref[1] or ph   # -1：高照照片的比例（松下 3:2 是 320×213）
    r = {1: 8, 2: 3, 3: 6}.get(irot) or ori
    out = []
    for f in fc[:5]:
        x, y, fw, fh = f[0] / rw, f[1] / rh, f[2] / rw, f[3] / rh
        if not (0 < x < 1 and 0 < y < 1 and .01 < fw < .9 and .01 < fh < .9):
            continue
        if r == 6:
            x, y, fw, fh = 1 - y, x, fh, fw
        elif r == 8:
            x, y, fw, fh = y, 1 - x, fh, fw
        elif r == 3:
            x, y = 1 - x, 1 - y
        out.append([round(x, 4), round(y, 4), round(fw, 4), round(fh, 4)])
    return out or None


def alb_exif_tidy(t):
    """EXIF 的原始值換成網頁要的"""
    x = {}
    for k in ("mk", "md", "sw", "lmk", "ln"):
        if isinstance(t.get(k), str) and t[k]:
            x[k] = t[k][:80]
    uc = t.get("uc")                                   # iPhone 的螢幕截圖：使用者註解寫「Screenshot」
    if isinstance(uc, list) and b"screenshot" in bytes(v & 255 for v in uc[:64] if isinstance(v, int)).lower():
        x["ss"] = 1
    dt = t.get("dt") or t.get("dt0")
    if isinstance(dt, str) and re.match(r"\d{4}:\d\d:\d\d \d\d:\d\d", dt):
        x["dt"] = dt[:19]
        oz = t.get("oz") or t.get("oz0")
        if isinstance(oz, str) and re.fullmatch(r"[+-]\d\d:\d\d", oz):
            x["oz"] = oz
        elif alb_gps_oz(x["dt"], t.get("g:gds"), t.get("g:gts")):   # 沒寫時區：拿定位附帶的世界標準時間算
            x["oz"] = alb_gps_oz(x["dt"], t.get("g:gds"), t.get("g:gts"))
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
    lsp = t.get("lsp")                                 # LensSpecification：變焦鏡頭的最短、最長焦距（手機寫的是幾顆鏡頭合起來，不算）
    if isinstance(lsp, list) and len(lsp) == 4 and (x.get("mk") or "").lower().split(" ")[0] not in ALB_PHONE:
        a, b_ = _rat(lsp[0]), _rat(lsp[1])
        if a and b_ and 0 < a < b_ < 2000 and b_ / a >= 1.15:
            x["zr"] = [round(a, 1), round(b_, 1)]
    if not x.get("f35") and x.get("fl"):              # 沒寫等效焦距：照感光元件大小換算（手機的 6 mm 不會被當成超廣角）
        cf = alb_crop(t, x)
        if cf:
            x["f35"], x["f35e"] = round(x["fl"] * cf), 1
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


ALB_XMP_GPS = re.compile(rb'(?:exif:GPS\w+=(?:"[^"]*"|\'[^\']*\')|<exif:GPS\w+[^>]*>[^<]*</exif:GPS\w+>)')


def alb_jpeg(f):
    """JPEG：大小、EXIF（TIFF 在檔案裡的位置）、XMP 裡的定位片段"""
    f.seek(2)
    w = h = 0
    exif = None
    xgs = []
    while True:
        b = f.read(1)
        if not b or b[0] != 0xFF:
            break
        while b == b"\xFF":
            b = f.read(1)
        if not b:
            break
        mk = b[0]
        if mk in (0xD8, 0x01) or 0xD0 <= mk <= 0xD7:
            continue
        if mk in (0xD9, 0xDA):
            break
        lnb = f.read(2)
        if len(lnb) < 2:
            break
        ln = struct.unpack(">H", lnb)[0]
        if ln < 2:
            break
        pos = f.tell()
        if mk == 0xE1:
            seg = f.read(ln - 2)
            if exif is None and seg[:6] == b"Exif\x00\x00":
                exif = (pos + 6, seg[6:])
            elif seg.startswith(b"http://ns.adobe.com/xap/1.0/\x00"):
                for m in ALB_XMP_GPS.finditer(seg, 29):
                    xgs.append([pos + m.start(), m.end() - m.start(), 1])
        elif mk in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            seg = f.read(5)
            if len(seg) == 5:
                h, w = struct.unpack(">HH", seg[1:5])
            break
        f.seek(pos + ln - 2)
    return w, h, exif, xgs


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
            if len(hd) < 16:
                return
            sz, hl = struct.unpack(">Q", hd[8:16])[0], 16
        elif sz == 0:
            sz = end - p
        if sz < hl:
            return
        yield typ.decode("latin-1"), p + hl, p + sz
        p += sz


def alb_heic(f, size):
    """HEIC／AVIF：共用 pic_heif_meta 讀主圖的大小、轉向與 EXIF 位置"""
    meta = next(((s, e) for t, s, e in alb_boxes(f, 0, min(size, 1 << 26)) if t == "meta"), None)
    if not meta or meta[1] - meta[0] > 8 << 20:
        return 0, 0, None, 0, None
    f.seek(meta[0])
    H = pic_heif_meta(f.read(meta[1] - meta[0]))
    if not H:
        return 0, 0, None, 0, None
    w = h = rot = 0
    prim = H["pitm"]
    ispe = pic_heif_prop(H, prim, "ispe")
    if ispe and len(ispe) >= 12:
        w, h = struct.unpack(">II", ispe[4:12])
    irot = pic_heif_prop(H, prim, "irot")
    if irot:
        rot = irot[0] & 3
    exif = None
    exif_id = next((iid for iid, it in H["it"].items() if it["t"] == "Exif" and it["ext"] and it["cm"] == 0), None)
    if exif_id is not None:
        off, ln = H["it"][exif_id]["ext"][0]
        if 0 <= off < size:
            f.seek(off)
            b = f.read(min(ln, 1 << 20))
            if len(b) > 4:
                skip = struct.unpack(">I", b[:4])[0] + 4
                if b[skip:skip + 6] == b"Exif\x00\x00":
                    skip += 6
                exif = (off + skip, b[skip:])
    return w, h, exif, rot, H


def alb_vmeta(path):
    """影片的資訊：交給 ffmpeg 讀檔頭（長度、大小、轉向、拍攝時間、地點、哪支手機）"""
    info = alb_ff_info(path)
    m = re.search(r"Duration: (\d+):(\d\d):(\d\d(?:\.\d+)?)", info)
    v = re.search(r"Stream #[^\n]*Video: [^\n]*?, (\d{2,5})x(\d{2,5})[ ,\[]", info)
    if not (m and v):
        return {"w": 4, "h": 3, "x": {}, "g": None, "ori": 1, "gs": [], "vid": 1, "dur": 0, "bad": 1, "mv": ALB_MV}
    dur = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    w, h = int(v[1]), int(v[2])
    r = re.search(r"(?:rotate\s*:\s*|rotation of )(-?\d+)", info)
    if r and abs(int(r[1])) % 180 == 90:
        w, h = h, w
    x = {}
    d = re.search(r"com\.apple\.quicktime\.creationdate\s*:\s*(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?([+-]\d\d):?(\d\d)?", info)
    if d and d[1] > "1971":
        x["dt"] = f"{d[1]}:{d[2]}:{d[3]} {d[4]}:{d[5]}:{d[6]}"
        x["oz"] = f"{d[7]}:{d[8] or '00'}"
    else:
        d = re.search(r"creation_time\s*:\s*(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)", info)
        if d and d[1] > "1971":                        # 這個是世界標準時間：換成主機的時區
            try:
                t = datetime(*map(int, d.groups()), tzinfo=timezone.utc).astimezone()
                x["dt"] = t.strftime("%Y:%m:%d %H:%M:%S")
            except (ValueError, OverflowError, OSError):
                pass
    for k, pat in (("mk", r"com\.apple\.quicktime\.make\s*:\s*([^\n]+)"), ("md", r"com\.apple\.quicktime\.model\s*:\s*([^\n]+)"),
                   ("sw", r"com\.apple\.quicktime\.software\s*:\s*([^\n]+)")):
        mm = re.search(pat, info)
        if mm:
            x[k] = mm[1].strip()[:60]
    g = None
    loc = re.search(r"(?:com\.apple\.quicktime\.location\.ISO6709|location)\s*:\s*([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?", info)
    if loc:
        try:
            lat, lon = float(loc[1]), float(loc[2])
            if -90 <= lat <= 90 and -180 <= lon <= 180 and (lat or lon):
                g = [round(lat, 6), round(lon, 6), round(float(loc[3]), 1) if loc[3] else None, None]
        except ValueError:
            pass
    vl = re.search(r"Stream #[^\n]*Video: ([^\n]*)", info)
    if vl:                                             # 編碼、位元深度、色度取樣、格率、位元率（專業一點的人會看）
        vl = vl[1]
        cn = {"hevc": "HEVC", "h264": "H.264", "prores": "ProRes", "av1": "AV1", "vp9": "VP9", "mpeg4": "MPEG-4", "mjpeg": "Motion JPEG"}.get(vl.split(" ")[0].strip(","))
        if cn:
            pr = re.match(r"\S+ \(([^)]+)\)", vl)
            if cn == "ProRes" and pr and pr[1] not in ("apcn", "apch", "apcs", "apco", "ap4h"):
                cn += " " + pr[1].split(")")[0]
            pf = re.search(r"\byuv(4\d\d)p(\d\d)?", vl)
            x["vc"] = cn + (f" {pf[2]} bit" if pf and pf[2] else "") + (f" {pf[1][0]}:{pf[1][1]}:{pf[1][2]}" if pf and pf[1] != "420" else "")
        fps = re.search(r", ([\d.]+) fps", vl)
        if fps:
            try:
                fv = float(fps[1])
                if 0 < fv <= 1000:
                    x["fps"] = round(fv, 3)
            except ValueError:
                pass
        br = re.search(r", (\d+) kb/s", vl) or re.search(r"bitrate: (\d+) kb/s", info)
        if br and int(br[1]) >= 100:
            x["vb"] = round(int(br[1]) / 1000, 1)
    sx = os.path.splitext(path)[0] + "M01.XML"           # Sony 的影片旁邊一個 XML：拍的時候用哪一種 Log
    try:
        if os.path.getsize(sx) < 1 << 16:
            with open(sx, encoding="utf-8", errors="replace") as f:
                gm = re.search(r'CaptureGammaEquation"?\s+value="([^"]+)"', f.read())
            if gm and gm[1].lower().startswith("s-log"):
                x["gm"] = "S-Log" + gm[1][5:6]
    except OSError:
        pass
    out = {"w": w, "h": h, "x": x, "g": g, "ori": 1, "gs": [], "vid": 1, "dur": round(dur, 2), "mv": ALB_MV}
    if v and re.search(r"arib-std-b67|smpte2084", v[0]):   # HDR 影片（iPhone 的 HLG／杜比視界、相機的 HLG）
        out["hdr"] = "hlg" if "arib" in v[0] else "pq"
    return out


def alb_meta(path):
    """一張照片的資訊：{w, h, x: 相機資訊, g: [緯度, 經度, 高度, 方向], ori, tx: EXIF 在檔案裡的位置, gs: 定位資料的位置}"""
    ext = os.path.splitext(path)[1].lower()
    if ext in ALB_VID:
        return alb_vmeta(path)
    w = h = 0
    exif = None
    xgs = []
    heif = None
    rot = 0
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            head = f.read(32)
            if head[:2] == b"\xff\xd8":
                w, h, exif, xgs = alb_jpeg(f)
            elif head[:8] == b"\x89PNG\r\n\x1a\n":
                w, h = struct.unpack(">II", head[16:24])
                p = 8
                f.seek(p)
                while p < min(size, 4 << 20):
                    ch = f.read(8)
                    if len(ch) < 8:
                        break
                    ln, ct = struct.unpack(">I4s", ch)
                    if ct == b"eXIf" and ln <= 1 << 20:
                        d = f.read(ln)
                        skip = 6 if d[:6] == b"Exif\x00\x00" else 0
                        exif = (p + 8 + skip, d[skip:])
                        break
                    if ct == b"IEND":
                        break
                    p += 12 + ln
                    f.seek(p)
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
            elif head[4:8] == b"ftyp" and ext not in PIC_RAW:
                w, h, exif, rot, heif = alb_heic(f, size)
    except (OSError, struct.error, IndexError, ValueError, OverflowError):
        pass
    raw = None
    if ext in PIC_RAW:                                 # 相機原始檔：大小、EXIF 照相機放在裡面的預覽，再補上原始檔本身的
        raw = alb_raw_meta(path)
        if raw:
            w, h, exif = raw["w"], raw["h"], raw["exif"]
    t, spans = alb_tiff(exif[1]) if exif else ({}, [])
    if raw and raw.get("t"):
        t = {**t, **{k: v for k, v in raw["t"].items() if v not in (None, "", 0)}}
        spans = []                                     # 原始檔的定位不在預覽裡：不給下載原圖時本來就不給原始檔
    x, g, ori = alb_exif_tidy(t)
    try:
        more = pic_exif_more(exif[1]) if exif else {}
    except (struct.error, IndexError, ValueError, OverflowError):
        more = {}
    hd = pic_apple_stops(more.get("a33"), more.get("a48"))
    cs, hdr = alb_color_probe(path, ext, more, hd, heif=heif)
    try:
        ms = pic_maker(exif[1], more) if exif else {}
    except (struct.error, IndexError, ValueError, OverflowError):
        ms = {}
    afp = alb_afp(t, ms, ori, rot if ext in ALB_HEIF else 0, w, h)
    if afp:
        x["afp"] = afp
    fcs = alb_faces(t, ms, ori, rot if ext in ALB_HEIF else 0, w, h)
    if fcs:
        x["fcs"] = fcs
    fd = ms.pop("fd", None) or _rat(t.get("sd"))        # 對焦距離（公尺）：製造商資料優先，再看 EXIF 的 SubjectDistance
    if isinstance(fd, (int, float)) and .02 <= fd < 1000:
        x["fd"] = round(fd, 2)
    if list(ms) == ["sl"]:
        ms = {}
    if ms:
        if ms.get("ln") and not x.get("ln"):
            x["ln"] = ms["ln"]
        ms.pop("ln", None)
        x["ms"] = ms
    if ext in ALB_HEIF:
        if rot in (1, 3):
            w, h = h, w
        ori = 1                                        # HEIC 的轉向寫在 irot，解開時就轉好了
    elif ori >= 5:
        w, h = h, w
    if not (w and h):
        w, h = int(t.get("pw") or 0) or 4, int(t.get("ph") or 0) or 3
    gs = [[exif[0] + a, n] for a, n in spans] if exif and not raw else []
    if xgs and not raw:
        gs.extend(xgs)
    out = {"w": w, "h": h, "x": x, "g": g, "ori": ori, "mv": ALB_MV, "gs": gs}
    if cs:
        out["cs"] = cs
    if hdr:
        out["hdr"] = hdr
    if hd:
        out["hd"] = round(hd, 4)
    if ext in PIC_RAW:
        out["rw"] = 1
        if not raw:
            out["bad"] = 1
    return out


def alb_raw_meta(path):
    """相機原始檔：裡面那張預覽 JPEG 的大小、EXIF，加上原始檔本身 TIFF 裡的相機資料"""
    rj = pic_raw_jpeg(path)
    if not rj:
        return None
    try:
        with open(path, "rb") as f:
            f.seek(rj[0])
            pv = f.read(min(rj[1], 1 << 20))
            f.seek(0)
            head = f.read(4 << 20)
    except OSError:
        return None
    w = h = 0
    exif = None
    for mk, s, e in pic_jpeg_segs(pv):
        if mk == 0xE1 and pv[s:s + 6] == b"Exif\x00\x00" and exif is None:
            exif = (rj[0] + s + 6, pv[s + 6:e])
        elif mk in (0xC0, 0xC1, 0xC2) and e - s >= 5:
            h, w = struct.unpack(">HH", pv[s + 1:s + 5])
    t = alb_tiff(head)[0] if head[:2] in (b"II", b"MM") else {}
    if not (w and h):
        return None
    return {"w": w, "h": h, "exif": exif, "t": t}


def alb_color_probe(path, ext, more, hd, heif=None):
    """建清單時看一下：色彩空間名稱（sRGB 不寫）、HDR 最多亮幾級"""
    cs = hdr = None
    try:
        if ext in (".jpg", ".jpeg"):
            with open(path, "rb") as f:
                b = f.read(512 << 10)
            cs = pic_cs(pic_jpeg_icc(b), more)[1]
            hdr = pic_jpeg_hdr(path, hd)
        elif ext in PIC_RAW:
            cs = pic_cs(None, more)[1]
        elif ext in ALB_HEIF:
            H = heif if heif is not None else pic_heif(path)
            if H and H["pitm"] is not None:
                icc, nclx = pic_heif_colr(H, H["pitm"])
                cs = alb_heif_cs(icc, nclx)[1]
                if nclx and nclx[1] in (16, 18):       # 相機拍的 HLG／PQ：整張本身就是 HDR
                    hdr = "hlg" if nclx[1] == 18 else "pq"
                elif hd and pic_heif_aux(H, pic_heif_target(H, H["pitm"]), PIC_APPLE_GM):
                    hdr = round(hd, 2)
        elif ext == ".png":
            cs = pic_cs(pic_png_icc(path), more)[1]
        elif ext == ".webp":
            cs = pic_cs(pic_webp_icc(path), more)[1]
    except (OSError, struct.error, ValueError, IndexError):
        pass
    return cs or None, hdr


def alb_heif_cs(icc, nclx):
    """HEIF 的色彩：(ICC, 名稱)"""
    if icc:
        return pic_cs(icc, {})
    if nclx:
        name = {12: "p3", 11: "p3", 9: "2020"}.get(nclx[0])
        if name:
            return pic_icc_make(name), PIC_CSN[name]
    return None, ""


# ── 每本相簿的照片清單（照拍攝時間排，資訊記著，檔案沒變就不重讀） ──
def alb_pid(name):
    return hashlib.sha256(name.encode()).hexdigest()[:12]


def alb_index(a, scan=True):
    aid = a["id"]
    fn = os.path.join(ALB_CACHE, f"idx-{aid}.json")
    with ALB_IDX_LOCK:
        idx = ALB["idx"].get(aid)
    if idx is None:
        try:
            idx = sec_load(fn)
        except (OSError, ValueError):
            idx = {}
        if not isinstance(idx, dict):
            idx = {}
        with ALB_IDX_LOCK:
            ALB["idx"].setdefault(aid, idx)
            idx = ALB["idx"][aid]
    if not scan:
        return idx
    p = alb_path(a["dir"])
    files = (alb_photos_in(p) + alb_up_files(p)) if p else []
    old = idx.get("ph") or {}
    ph, changed = {}, len(old) != len(files)
    for name, size, mt in files[:ALB_MAX]:
        pid = alb_pid(name)
        o = old.get(pid)
        if o and o.get("sz") == size and o.get("mt") == mt and o.get("n") == name and o.get("mv") == ALB_MV:
            ph[pid] = o
            continue
        m = alb_meta(os.path.join(p, name))
        m.update(n=name, sz=size, mt=mt)
        ph[pid] = m
        changed = True
    # 原況照片：跟照片同名的短影片掛在照片上（不另外列）
    stems = {os.path.splitext(m["n"])[0].lower(): pid for pid, m in ph.items() if not m.get("vid")}
    for pid, m in ph.items():
        if m.get("vid"):
            of = stems.get(os.path.splitext(m["n"])[0].lower()) if 0 < m.get("dur", 0) <= ALB_LIVE else None
            if m.get("of") != of:
                m["of"] = of
                changed = True
    # 相機原始檔：有同名的 JPEG／HEIF 就收在那張底下（不另外列），那張標「RAW」
    pics = {}
    for pid, m in ph.items():
        if not m.get("vid") and not m.get("rw"):
            pics.setdefault(os.path.splitext(m["n"])[0].lower(), pid)
    for pid, m in ph.items():
        if m.get("rw"):
            twin = pics.get(os.path.splitext(m["n"])[0].lower())
            if m.get("twin") != twin:
                m["twin"] = twin
                changed = True
    raws = {m["twin"]: os.path.splitext(m["n"])[1][1:].upper() for m in ph.values() if m.get("twin")}
    for pid, m in ph.items():
        if not m.get("rw") and m.get("rwx") != raws.get(pid):
            m["rwx"] = raws.get(pid)
            changed = True
    for pid, m in ph.items():
        if os.path.splitext(m["n"])[1].lower() in (".gif", ".png", ".webp") and "anim" not in m:
            m["anim"] = alb_anim(os.path.join(p, m["n"]))
            changed = True
    by_of = {v["of"]: {"n": v["n"], "sz": v["sz"], "mt": v["mt"]} for v in ph.values() if v.get("of")}
    for pid, m in ph.items():
        if m.get("anim") == 1:                              # 會動的 GIF：自己就是會動的那段（轉成影片放）
            lv = {"n": m["n"], "sz": m["sz"], "mt": m["mt"]}
            if m.get("lv") != lv:
                m["lv"] = lv
                changed = True
        elif not m.get("vid"):
            lv = by_of.get(pid)
            if m.get("lv") != lv:
                m["lv"] = lv
                changed = True
    mu = alb_music_in(p) if p else None
    if mu != idx.get("mu"):
        changed = True
    if changed or "order" not in idx:
        def key(i):
            m = ph[i]
            return (m["x"].get("dt") or time.strftime("%Y:%m:%d %H:%M:%S", time.localtime(m["mt"])), m["n"].lower())
        show = [i for i in ph if not ph[i].get("of") and not ph[i].get("twin") and not (ph[i].get("vid") and not 0 < ph[i].get("dur", 0) <= ALB_VMAX)]
        with ALB_IDX_LOCK:
            cur_ph = (ALB["idx"].get(aid) or {}).get("ph") or {}
            for pid, m in ph.items():                      # 保留掃描期間背景標上的壞圖記號
                cm = cur_ph.get(pid)
                if cm and cm.get("sz") == m.get("sz") and cm.get("mt") == m.get("mt"):
                    if cm.get("bad") and not m.get("bad"):
                        m["bad"] = cm["bad"]
                    if cm.get("vbad", 0) > m.get("vbad", 0):
                        m["vbad"] = cm["vbad"]
            idx = {"ph": ph, "order": sorted(show, key=key), "mu": mu}
            os.makedirs(ALB_CACHE, mode=0o700, exist_ok=True)
            sec_dump(fn, idx)
            ALB["idx"][aid] = idx
    return idx


def alb_anim(path):
    """會動的圖嗎：GIF（好幾格）、APNG（會動的 PNG）回 1（轉成影片放），會動的 WebP 回 2（直接給瀏覽器放）"""
    try:
        with open(path, "rb") as f:
            b = f.read(32 << 20)
    except OSError:
        return 0
    if b[:6] in (b"GIF87a", b"GIF89a"):
        return 1 if b.count(b"\x21\xf9\x04") > 1 else 0
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        i, d = b.find(b"acTL"), b.find(b"IDAT")
        return 1 if 0 < i < (d if d > 0 else len(b)) else 0
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP" and b[12:16] == b"VP8X":
        return 2 if b[20] & 0x02 else 0
    return 0


def alb_webp_still(path):
    """會動的 WebP 的第一格，包成一張普通的 WebP（ffmpeg 讀不了會動的 WebP）"""
    try:
        with open(path, "rb") as f:
            b = f.read(64 << 20)
    except OSError:
        return None
    if b[:4] != b"RIFF" or b[8:12] != b"WEBP":
        return None
    p = 12
    while p + 8 <= len(b):
        t, n = b[p:p + 4], struct.unpack("<I", b[p + 4:p + 8])[0]
        if t == b"ANMF":
            d = b[p + 8:p + 8 + n]
            fw, fh = int.from_bytes(d[6:9], "little") + 1, int.from_bytes(d[9:12], "little") + 1
            sub, q, out, alpha = d[16:], 0, b"", False
            while q + 8 <= len(sub):
                st, sn = sub[q:q + 4], struct.unpack("<I", sub[q + 4:q + 8])[0]
                if st == b"ALPH":
                    alpha = True
                if st in (b"ALPH", b"VP8 ", b"VP8L"):
                    out += sub[q:q + 8 + sn + (sn & 1)]
                q += 8 + sn + (sn & 1)
            if alpha:
                out = b"VP8X" + struct.pack("<I", 10) + bytes([0x10, 0, 0, 0]) + (fw - 1).to_bytes(3, "little") + (fh - 1).to_bytes(3, "little") + out
            return b"RIFF" + struct.pack("<I", 4 + len(out)) + b"WEBP" + out if out else None
        p += 8 + n + (n & 1)
    return None


def alb_webp_clean(path):
    """會動的 WebP 給朋友看：拿掉 EXIF、XMP（可能有定位）"""
    with open(path, "rb") as f:
        b = f.read(64 << 20)
    out, p = [], 12
    while p + 8 <= len(b):
        t, n = b[p:p + 4], struct.unpack("<I", b[p + 4:p + 8])[0]
        c = b[p:p + 8 + n + (n & 1)]
        if t == b"VP8X" and len(c) > 8:
            c = c[:8] + bytes([c[8] & ~0x0C]) + c[9:]  # 拿掉「有 EXIF、XMP」的旗子
        if t not in (b"EXIF", b"XMP "):
            out.append(c)
        p += 8 + n + (n & 1)
    body = b"".join(out)
    return b"RIFF" + struct.pack("<I", 4 + len(body)) + b"WEBP" + body


def alb_png_clean(path):
    """PNG 藏起地點給朋友看：拿掉 eXIf 跟可能帶定位的 XMP／EXIF 文字區塊"""
    with open(path, "rb") as f:
        b = f.read(64 << 20)
    if b[:8] != b"\x89PNG\r\n\x1a\n":
        return b
    out, p = [b[:8]], 8
    while p + 12 <= len(b):
        n = struct.unpack_from(">I", b, p)[0]
        t = b[p + 4:p + 8]
        end = p + 12 + n
        if end > len(b):
            out.append(b[p:])
            break
        if t == b"eXIf" or (t in (b"iTXt", b"tEXt", b"zTXt") and b[p + 8:p + 25].lower().startswith((b"xml:com.adobe.xmp", b"raw profile type "))):
            p = end
            continue
        out.append(b[p:end])
        p = end
    return b"".join(out)


def alb_clean_orig(src, ext, sz):
    """藏起地點時需要重組容器拿掉中繼資料的格式（WebP／PNG）"""
    if sz > 64 << 20:
        return None
    if ext == ".webp":
        return alb_webp_clean(src)
    if ext == ".png":
        return alb_png_clean(src)
    return None


def alb_music_in(p):
    """資料夾裡第一首歌（照檔名排）：幻燈片的背景音樂"""
    try:
        with os.scandir(p) as it:
            songs = sorted((e.name, e.stat(follow_symlinks=False).st_size) for e in it
                           if not e.name.startswith(".") and os.path.splitext(e.name)[1].lower() in ALB_AUD and e.is_file(follow_symlinks=False))
    except OSError:
        return None
    return {"n": songs[0][0], "sz": songs[0][1]} if songs else None


def alb_ckey(a, pid, m, root=None, wm=None):
    root = (alb_root() or "") if root is None else root
    wm = ((a.get("wm") or "") if alb_wm_bake(a) else "") if wm is None else wm
    return hashlib.sha256(f"{root}/{a['dir']}/{m['n']}|{m['sz']}|{m['mt']}|2048|{wm}{('|t' if m.get('hdr') else '') if m.get('vid') else '|c2'}".encode()).hexdigest()[:24]


def alb_cfile(ck, kind):
    return os.path.join(ALB_CACHE, f"{ck}-{kind}.jpg")


def alb_q_b64(ck):
    """模糊預覽圖的 base64：記在記憶體裡，不用每次開相簿都從硬碟一張張解密"""
    q = ALB["qcache"].get(ck)
    if q is not None:
        return q
    try:
        q = base64.b64encode(sec_read(alb_cfile(ck, "q"))).decode()
    except (OSError, ValueError):
        return ""
    if len(ALB["qcache"]) > 4000:
        for k in list(ALB["qcache"])[:1000]:
            ALB["qcache"].pop(k, None)
    ALB["qcache"][ck] = q
    return q


def alb_ready_n(a, idx=None):
    idx = idx or alb_index(a, scan=False)
    ph = idx.get("ph") or {}
    order = idx.get("order") or []
    if not ph or not order:
        return 0, 0
    root = alb_root() or ""
    wm = (a.get("wm") or "") if alb_wm_bake(a) else ""
    done = sum(1 for pid in order if ph[pid].get("bad") or os.path.exists(alb_cfile(alb_ckey(a, pid, ph[pid], root, wm), "s")))
    return done, len(order)


def alb_ready(a, idx=None):
    done, total = alb_ready_n(a, idx)
    return 1 if not total else round(done / total, 2)


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


ALB_FF_UID = 1000                                                 # ffmpeg 用雲端硬碟那個一般帳號跑
ALB_FF_MEM = 3 << 30                                              # ffmpeg 最多用這麼多記憶體


def alb_ff_pre():
    """主機上的 ffmpeg：記憶體有上限、不用最高權限跑（惡意的照片、影片就算打穿 ffmpeg 也拿不到整台主機）；
    檔案由哨兵打開後交給它（fd:），所以它自己不用讀得到雲端硬碟"""
    root = os.geteuid() == 0

    def pre():
        resource.setrlimit(resource.RLIMIT_AS, (ALB_FF_MEM, ALB_FF_MEM))
        if root:
            os.setgroups([])
            os.setgid(ALB_FF_UID)
            os.setuid(ALB_FF_UID)
    return pre


def alb_ff_give(path):
    """給一般帳號用的暫存檔（浮水印的字）：改成它的"""
    if os.geteuid() == 0 and not alb_ff()[1]:
        try:
            os.chown(path, ALB_FF_UID, ALB_FF_UID)
        except OSError:
            pass


def alb_run_ff(args, data=None, src=None, timeout=120, raw=0):
    ff = alb_ff()
    if not ff:
        return None
    cmd, mount = ff
    fin = None
    try:
        if src:
            if mount:                                   # 容器裡看到的雲端硬碟在 /folder
                args = [a if a != "{src}" else mount + src[len(alb_root()):] for a in args]
            else:
                fin = open(src, "rb")                   # noqa: SIM115  哨兵打開，ffmpeg 只拿到這個檔案
                args = [a if a != "{src}" else "fd:" for a in args]
        r = subprocess.run(["nice", "-n", "15", *cmd, "-v", "error", "-y", *args], stdin=fin, input=None if fin else data,
                           capture_output=True, timeout=timeout, preexec_fn=None if mount else alb_ff_pre())
    except (OSError, subprocess.SubprocessError):
        return None
    finally:
        if fin:
            fin.close()
    if raw:                                             # 要的是原始像素：長度對才算（-1：有多少算多少）
        return r.stdout if r.returncode == 0 and (len(r.stdout) == raw or raw < 0 and r.stdout) else None
    return r.stdout if r.returncode == 0 and r.stdout[:2] == b"\xff\xd8" else None


def alb_vpick(src, dur):
    """影片封面：前面一段平均抽 8 格（96×96 灰階），挑最清楚、不太暗不過曝的那一格；回傳秒數"""
    d0 = min(1.0, dur / 3)
    if dur < 1.5:
        return d0
    t0, w, k, n = min(.3, dur / 10), min(8.0, dur * .6), 8, 96
    px = alb_run_ff(["-ss", f"{t0:.2f}", "-t", f"{w:.2f}", "-i", "{src}", "-an", "-vf", f"fps={k / w:.4f},scale={n}:{n}:flags=area,format=gray",
                     "-frames:v", str(k), "-f", "rawvideo", "-pix_fmt", "gray", "-"], src=src, timeout=120, raw=-1)
    if not px or len(px) < n * n:
        return d0
    best, bt = -1.0, d0
    for j in range(min(k, len(px) // (n * n))):
        f = px[j * n * n:(j + 1) * n * n]
        mean = sum(f) / len(f)
        if not 25 <= mean <= 225:                      # 全黑（片頭）、一片白的不要
            continue
        v = 0.0
        for y in range(1, n - 1, 2):
            r, u, dn = f[y * n:(y + 1) * n], f[(y - 1) * n:y * n], f[(y + 1) * n:(y + 2) * n]
            v += sum((4 * c - a - b - e - g) ** 2 for c, a, b, e, g in zip(r[1:-1], r[:-2], r[2:], u[1:-1], dn[1:-1]))
        if v > best:
            best, bt = v, t0 + (j + .5) * w / k
    return round(bt, 2)


def alb_ff_src(src):
    ff = alb_ff()
    if not ff:
        return None, None
    cmd, mount = ff
    return cmd, (mount + src[len(alb_root()):] if mount else src)


def alb_ff_info(src):
    """ffmpeg -i 印出來的檔案資訊（沒有輸出檔，所以它會說失敗，照樣讀得到）"""
    cmd, s2 = alb_ff_src(src)
    if not cmd:
        return ""
    mount = alb_ff()[1]
    try:
        with open(os.devnull if mount else src, "rb") as fin:
            r = subprocess.run(["nice", "-n", "15", *cmd, "-hide_banner", "-nostdin", "-i", s2 if mount else "fd:"], stdin=fin,
                               capture_output=True, timeout=60, preexec_fn=None if mount else alb_ff_pre())
    except (OSError, subprocess.SubprocessError):
        return ""
    return r.stderr.decode("utf-8", "replace")


def alb_safe_open(path):
    """安全打開降權暫存檔：不跟隨符號連結、只開一般檔案（避免被攻破的轉檔程式用捷徑偷讀主機檔案）"""
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise OSError("not a regular file")
        return os.fdopen(fd, "rb")
    except BaseException:
        os.close(fd)
        raise


def alb_safe_read(path, limit):
    with alb_safe_open(path) as f:
        b = f.read(limit + 1)
    return b if len(b) <= limit else b""


def alb_make(a, pid, m, edge=2048):
    """做大圖（長邊 2048）、小圖（高 480）、模糊預覽（寬 24）；不留任何 EXIF，但照原樣留著色彩描述檔、HDR 增益圖
    edge=ALB_XL 時只做大螢幕用的清晰版 x（有人在大螢幕打開才做）"""
    p = alb_path(a["dir"])
    if not p:
        return False
    ck = alb_ckey(a, pid, m)
    xl = edge != 2048
    if os.path.exists(alb_cfile(ck, "x" if xl else "s")):
        return True
    src = os.path.join(p, m["n"])
    ext = os.path.splitext(m["n"])[1].lower()
    jpg = ext in (".jpg", ".jpeg") or ext in PIC_RAW
    rot = ALB_ROT.get(m.get("ori", 1), "") if jpg else ""
    pre = ["-ss", f"{alb_vpick(src, m.get('dur', 0)) if not xl else min(1.0, m.get('dur', 0) / 3):.2f}"] if m.get("vid") else []   # 影片：前幾秒裡最清楚的一格當封面
    out = ["-map_metadata", "-1", "-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "-pix_fmt", "yuvj420p"]
    scale = f"scale='if(gt(iw,ih),min({edge},iw),-2)':'if(gt(iw,ih),-2,min({edge},ih))':flags=lanczos"
    vf, tf = rot + scale, None
    hv = H = rawb = None
    if ext in ALB_HEIF and not m.get("vid"):           # HEIC：自己拆拼圖交給 ffmpeg 解（ffmpeg 6 打不開 HEIC）
        H = pic_heif(src)
        hv = pic_heif_hevc(src, H, H["pitm"]) if H and H["pitm"] is not None else None
        if hv and hv["vf"]:
            vf = hv["vf"] + "," + scale
    elif ext in PIC_RAW:                               # 相機原始檔：用相機放在裡面的全尺寸預覽
        rj = pic_raw_jpeg(src)
        if not rj:
            return False
        try:
            with open(src, "rb") as f:
                f.seek(rj[0])
                rawb = f.read(rj[1])
        except OSError:
            return False
    hdr_tm = ""
    if H and hv:
        icc, nclx = pic_heif_colr(H, H["pitm"])
        if nclx and nclx[1] in (16, 18) and alb_ff_has("zscale"):   # 相機的 HLG／PQ：先壓成一般亮度的底圖（Display P3）
            hdr_tm = (f"zscale=t=linear:npl=203:tin={'arib-std-b67' if nclx[1] == 18 else 'smpte2084'}:pin=2020:min=2020_ncl,format=gbrpf32le,"
                      "zscale=p=smpte432,tonemap=hable:desat=0,zscale=t=iec61966-2-1:m=bt709:r=full,")
            icc = pic_icc_make("p3")
        else:
            icc = alb_heif_cs(icc, nclx)[0]
        vf = hdr_tm + vf
    elif rawb:
        icc = pic_cs(pic_jpeg_icc(rawb), {"csp": 0xFFFF, "iop": "R03"} if m.get("cs") == "Adobe RGB" else {})[0]
    else:
        icc = alb_src_icc(src, ext, m)
    if alb_wm_bake(a):                                 # 浮水印：右下角半透明白字
        tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")  # noqa: SIM115
        tf.write(a["wm"])
        tf.close()
        alb_ff_give(tf.name)
        vf += (f",drawtext=fontfile='{alb_font(a['wm'])}':textfile='{tf.name}':expansion=none:fontcolor=white@0.6:fontsize='min(w,h)*0.042'"
               ":x='w-tw-min(w,h)*0.035':y='h-th-min(w,h)*0.035':shadowcolor=black@0.35:shadowx=2:shadowy=2")
    still = alb_webp_still(src) if m.get("anim") == 2 else None
    big = small = tiny = qa_px = None
    in_args = (["-f", "webp_pipe", "-i", "pipe:0"] if still else
               ["-f", "hevc", "-i", "pipe:0"] if hv else
               ["-noautorotate", "-f", "mjpeg", "-i", "pipe:0"] if rawb else
               (["-noautorotate"] if jpg else []) + pre + ["-i", "{src}"])
    in_data = still if still else hv["bs"] if hv else rawb if rawb else None
    in_src = None if in_data is not None else src
    tmo = 240 if hv else 180
    ff = alb_ff()
    try:
        if not xl and ff and not ff[1]:                # 本機 ffmpeg：讀一次原圖同時產出大圖、小圖、模糊圖、畫質評分（省掉 3 次重複啟動與解碼）
            tdir = tempfile.mkdtemp(prefix="vsalb-")
            alb_ff_give(tdir)
            try:
                need_qa = not m.get("vid")
                fc = (f"[0:v]{vf},split={4 if need_qa else 3}[b0][s0][q0]{'[a0]' if need_qa else ''};"
                      f"[s0]scale=-2:'min(480,ih)':flags=lanczos[s];[q0]scale=24:-2:flags=area[q]"
                      + (f";[a0]scale={ALB_QA_N}:{ALB_QA_N}:flags=area,format=gray[a]" if need_qa else ""))
                fl, fs, fq, fa = (os.path.join(tdir, x) for x in ("l.jpg", "s.jpg", "q.jpg", "a.raw"))
                jout = ["-map_metadata", "-1", "-frames:v", "1", "-c:v", "mjpeg", "-pix_fmt", "yuvj420p"]
                margs = [*(a_ if a_ != "{src}" else "fd:" for a_ in in_args), "-filter_complex", fc,
                         "-map", "[b0]", *jout, "-q:v", "4", fl,
                         "-map", "[s]", *jout, "-q:v", "4", fs,
                         "-map", "[q]", *jout, "-q:v", "6", fq,
                         *(["-map", "[a]", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", fa] if need_qa else [])]
                cmd_m = ["nice", "-n", "17", *ff[0], "-v", "error", "-nostdin", "-y", *margs]
                if in_src:
                    with open(in_src, "rb") as fin:
                        r = subprocess.run(cmd_m, stdin=fin, capture_output=True, timeout=tmo, preexec_fn=alb_ff_pre())
                else:
                    r = subprocess.run(cmd_m, input=in_data, capture_output=True, timeout=tmo, preexec_fn=alb_ff_pre())
                if r.returncode == 0 and os.path.lexists(fl) and os.path.lexists(fs):
                    b0 = alb_safe_read(fl, 32 << 20)
                    s0 = alb_safe_read(fs, 32 << 20)
                    if b0.startswith(b"\xff\xd8") and s0.startswith(b"\xff\xd8"):
                        big, small = b0, s0
                        if os.path.lexists(fq):
                            q0 = alb_safe_read(fq, 1 << 20)
                            if q0.startswith(b"\xff\xd8"):
                                tiny = q0
                        if need_qa and os.path.lexists(fa):
                            a0 = alb_safe_read(fa, ALB_QA_N * ALB_QA_N)
                            if len(a0) == ALB_QA_N * ALB_QA_N:
                                qa_px = a0
            except (OSError, subprocess.SubprocessError):
                big = small = tiny = qa_px = None
            finally:
                shutil.rmtree(tdir, ignore_errors=True)
        if not big:
            big = alb_run_ff([*in_args, "-vf", vf, *out, "-q:v", "4", "-"], src=in_src, data=in_data, timeout=tmo)
    finally:
        if tf:
            try:
                os.remove(tf.name)
            except OSError:
                pass
    if not big:
        return False
    if xl:
        if icc:
            big = pic_icc_put(big, icc)
        if m.get("hdr"):
            try:
                big = alb_hdr_put(big, src, ext, m, H, hv, rot, hdr_tm) or big
            except (OSError, ValueError, struct.error, IndexError, ZeroDivisionError, OverflowError):
                pass
        os.makedirs(ALB_CACHE, mode=0o700, exist_ok=True)
        sec_write(alb_cfile(ck, "x"), big)
        return True
    if not small:
        small = alb_run_ff(["-f", "mjpeg", "-i", "pipe:0", "-vf", "scale=-2:'min(480,ih)':flags=lanczos", *out, "-q:v", "4", "-"], data=big)
    if not tiny:
        tiny = alb_run_ff(["-f", "mjpeg", "-i", "pipe:0", "-vf", "scale=24:-2:flags=area", *out, "-q:v", "6", "-"], data=small or big)
    if not small:
        return False
    if icc:                                            # 色彩描述檔照原樣放回去（像素沒動，瀏覽器才知道該怎麼顯示）
        big, small, tiny = pic_icc_put(big, icc), pic_icc_put(small, icc), pic_icc_put(tiny, icc) if tiny else tiny
    sdr = big
    if m.get("hdr") and not m.get("vid"):              # HDR：增益圖跟著大圖一起放（HDR 螢幕上亮部照樣亮）
        try:
            big = alb_hdr_put(big, src, ext, m, H, hv, rot, hdr_tm) or big
        except (OSError, ValueError, struct.error, IndexError, ZeroDivisionError, OverflowError):
            big = sdr
    os.makedirs(ALB_CACHE, mode=0o700, exist_ok=True)
    for kind, b in (("l", big), ("q", tiny or b""), ("s", small)):   # 小圖最後寫：有小圖就代表三個都好了
        if b:
            sec_write(alb_cfile(ck, kind), b)
    alb_qa_make(a, pid, m, sdr, px=qa_px)
    return True


ALB_FFHAS = {}


def alb_ff_has(name):
    """這個 ffmpeg 有沒有某個濾鏡（zscale 要 libzimg）"""
    if name not in ALB_FFHAS:
        ff = alb_ff()
        ok = False
        if ff:
            try:
                r = subprocess.run([*ff[0], "-hide_banner", "-filters"], capture_output=True, timeout=30)
                ok = re.search(rb"\s" + name.encode() + rb"\s", r.stdout) is not None
            except (OSError, subprocess.SubprocessError):
                ok = False
        ALB_FFHAS[name] = ok
    return ALB_FFHAS[name]


def alb_src_icc(src, ext, m):
    """JPEG、PNG、WebP 原檔的色彩描述檔（sRGB 回 None）"""
    try:
        if ext in (".jpg", ".jpeg"):
            with open(src, "rb") as f:
                b = f.read(512 << 10)
            return pic_cs(pic_jpeg_icc(b), {"csp": 0xFFFF, "iop": "R03"} if m.get("cs") == "Adobe RGB" else {})[0]
        if ext == ".png":
            return pic_cs(pic_png_icc(src), {})[0]
        if ext == ".webp":
            return pic_cs(pic_webp_icc(src), {})[0]
    except OSError:
        pass
    return None


def alb_jpeg_wh(b):
    for mk, s, e in pic_jpeg_segs(b):
        if mk in (0xC0, 0xC1, 0xC2) and e - s >= 5:
            h, w = struct.unpack(">HH", b[s + 1:s + 5])
            return w, h
    return 0, 0


def alb_hdr_put(big, src, ext, m, H, hv, rot, hdr_tm):
    """做 HDR 增益圖（大圖一半的大小），接在大圖後面變成 Ultra HDR JPEG"""
    bw, bh = alb_jpeg_wh(big)
    if not (bw and bh):
        return None
    gw, gh = max(2, bw // 2 // 2 * 2), max(2, bh // 2 // 2 * 2)
    gray = ["-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    lut, g = None, None
    if hdr_tm:                                         # 相機 HLG／PQ：自己算 HDR 比底圖亮幾倍
        return alb_hdr_from_hlg(big, hv, gw, gh, hdr_tm)
    if H and hv:
        aux = pic_heif_aux(H, pic_heif_target(H, H["pitm"]), PIC_APPLE_GM)
        st = m.get("hd")
        if not aux or not st:
            return None
        gv = pic_heif_hevc(src, H, aux)
        if not gv:
            return None
        px = alb_run_ff(["-f", "hevc", "-i", "pipe:0", "-vf", (gv["vf"] + "," if gv["vf"] else "") + f"scale={gw}:{gh}:flags=bicubic,format=gray", *gray],
                        data=gv["bs"], timeout=120, raw=gw * gh)
        lut, g = pic_apple_lut(st), {"mn": 0.0, "mx": st, "ga": 1.0, "os": 0.0, "oh": 0.0, "cn": 0.0, "cx": st}
    else:
        got = pic_jpeg_gm(src, m.get("hd"))
        if not got:
            return None
        gmj, g, apple = got
        px = alb_run_ff(["-noautorotate", "-f", "mjpeg", "-i", "pipe:0", "-vf", f"{rot}scale={gw}:{gh}:flags=bicubic,format=gray", *gray],
                        data=gmj, timeout=120, raw=gw * gh)
        if apple:
            lut = pic_apple_lut(g["mx"])
    if not px:
        return None
    if lut:
        px = px.translate(lut)
    gm = alb_run_ff(["-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{gw}x{gh}", "-i", "pipe:0", "-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg",
                     "-pix_fmt", "yuvj420p", "-q:v", "3", "-"], data=px)
    return pic_uhdr(big, gm, g) if gm else None


def alb_hdr_from_hlg(big, hv, gw, gh, hdr_tm):
    """HLG／PQ 的相機照片：一次解開 HEVC 同時算 HDR（線性、203 尼特＝1）和底圖（線性）的亮度，比值就是增益圖"""
    base = (hv["vf"] + "," if hv["vf"] else "")
    tin = "arib-std-b67" if "arib" in hdr_tm else "smpte2084"
    mix = "colorchannelmixer=.2289746:.6917385:.0792869:0:.2289746:.6917385:.0792869:0:.2289746:.6917385:.0792869,format=grayf32le"
    fc = (f"[0:v]{base}scale={gw}:{gh}:flags=bicubic,split=2[h0][s0];"
          f"[h0]zscale=t=linear:npl=203:tin={tin}:pin=2020:min=2020_ncl,format=gbrpf32le,zscale=p=smpte432,{mix}[hl];"
          f"[s0]{hdr_tm}zscale=t=linear,format=gbrpf32le,{mix}[sl];[hl][sl]vstack=inputs=2[o]")
    n = gw * gh
    both = alb_run_ff(["-f", "hevc", "-i", "pipe:0", "-filter_complex", fc, "-map", "[o]", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "grayf32le", "-"],
                      data=hv["bs"], timeout=240, raw=n * 8)
    if not both:
        return None
    hdr, sdr = both[:n * 4], both[n * 4:]
    hv_, sv = struct.unpack(f"<{n}f", hdr), struct.unpack(f"<{n}f", sdr)
    off = 1 / 64
    lg = [math.log2((max(h, 0) + off) / (max(s, 0) + off)) for h, s in zip(hv_, sv)]
    so = sorted(lg)
    mx = max(0.1, min(6.0, so[int(n * 0.999)]))
    mn = max(-1.0, min(0.0, so[int(n * 0.001)]))
    px = bytes(max(0, min(255, int((v - mn) / (mx - mn) * 255 + 0.5))) for v in lg)
    gm = alb_run_ff(["-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{gw}x{gh}", "-i", "pipe:0", "-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg",
                     "-pix_fmt", "yuvj420p", "-q:v", "3", "-"], data=px)
    g = {"mn": mn, "mx": mx, "ga": 1.0, "os": off, "oh": off, "cn": 0.0, "cx": mx}
    return pic_uhdr(big, gm, g) if gm else None


# ── 智慧挑照片：清不清楚、曝光好不好（給每張打分數），長得像不像（給每張一個指紋） ──
ALB_QA_N = 384                                    # 縮成 384×384 的灰階來算
ALB_QAK = {}                                      # 相簿 → 上次補算分數的時間
ALB_QA = {}                                       # 快取鍵 → {"s": 分數, "h": 指紋}（讀過的記在記憶體，不用每次解密）
ALB_QAV = 2                                       # 分數的算法版本：2 起看對焦點（有對焦點的舊分數重算）


def alb_qa_calc(big, afp=None, px=None):
    """回傳 {"s": 0～100 分, "h": 16 碼指紋, "f": 對焦處清楚的程度 0～100（相機有記對焦點才有）}；算不出來回 None"""
    n = ALB_QA_N
    if px is None or len(px) != n * n:
        px = alb_run_ff(["-f", "mjpeg", "-i", "pipe:0", "-vf", f"scale={n}:{n}:flags=area,format=gray", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], data=big, raw=n * n)
    if not px:
        return None
    rows = [px[y * n:(y + 1) * n] for y in range(n)]
    g, cs = 6, n // 6                             # 清不清楚：切成 6×6 格，每格算邊緣的變化量，拿最清楚的三格（背景模糊的人像也算清楚）
    sm, sq, ct = [0.0] * (g * g), [0.0] * (g * g), [0] * (g * g)
    for y in range(1, n - 1):
        r, u, d, gy = rows[y], rows[y - 1], rows[y + 1], min(g - 1, y // cs) * g
        lap = [4 * c - a - b - e - f for c, a, b, e, f in zip(r[1:-1], r[:-2], r[2:], u[1:-1], d[1:-1])]
        for k in range(g):
            seg = lap[max(0, k * cs - 1):(k + 1) * cs - 1]
            sm[gy + k] += sum(seg)
            sq[gy + k] += sum(v * v for v in seg)
            ct[gy + k] += len(seg)
    var = sorted((sq[k] / ct[k] - (sm[k] / ct[k]) ** 2 for k in range(g * g) if ct[k]), reverse=True)
    v = sum(var[:3]) / 3 if len(var) >= 3 else 0
    fv = None
    if afp:                                       # 對焦點那一塊（至少 1/16 寬）：對到的地方糊了就是跑焦，背景再清楚也不算
        rr = max(12, int(n * max(afp[2], .06) / 2))
        cx, cy = int(afp[0] * n), int(afp[1] * n)
        a1, a2, cnt = 0.0, 0.0, 0
        for y in range(max(1, cy - rr), min(n - 1, cy + rr)):
            r, u, d = rows[y], rows[y - 1], rows[y + 1]
            for xx in range(max(1, cx - rr), min(n - 1, cx + rr)):
                lv = 4 * r[xx] - r[xx - 1] - r[xx + 1] - u[xx] - d[xx]
                a1 += lv
                a2 += lv * lv
                cnt += 1
        if cnt > 100:
            fv = a2 / cnt - (a1 / cnt) ** 2
    hist = [px.count(i) for i in range(256)]
    tot = n * n
    mean = sum(i * c for i, c in enumerate(hist)) / tot
    std = (sum(c * (i - mean) ** 2 for i, c in enumerate(hist)) / tot) ** .5
    clip = (sum(hist[:6]) + sum(hist[251:])) / tot   # 全黑、過曝的比例
    sh = min(1, max(0, (math.log10(max(v, 1)) - 2) / 1.6))   # 2048 大圖輕微手震約 1000、拍糊約 100～400、清楚的 3000 以上
    fs = None if fv is None else min(1, max(0, (math.log10(max(fv, 1)) - 2) / 1.6))
    miss = fs is not None and fs < .45 and sh - fs > .3   # 別的地方清楚、對焦的地方糊：跑焦（整張都糊是手震，不算）
    if fs is not None:
        sh = .7 * fs + .3 * sh
    ex = (1 - min(1, abs(mean - 120) / 105) ** 2) * (1 - min(1, max(0, clip - .02) * 4))
    co = min(1, std / 60)
    bits = 0                                      # 指紋：縮成 9×8 格，每格跟右邊那格比亮暗
    for y in range(8):
        ys = range(y * n // 8, (y + 1) * n // 8, 4)
        cells = []
        for x in range(9):
            xs = range(x * n // 9, (x + 1) * n // 9, 4)
            cells.append(sum(rows[yy][xx] for yy in ys for xx in xs))
        for x in range(8):
            bits = bits << 1 | (cells[x] > cells[x + 1])
    out = {"s": round(100 * (.5 * sh + .3 * ex + .2 * co)), "h": f"{bits:016x}", "v": ALB_QAV}
    if fs is not None:
        out["f"] = round(100 * fs)
    if miss:
        out["fm"] = 1
    return out


def alb_qa_get(ck):
    if ck in ALB_QA:
        return ALB_QA[ck]
    try:
        q = json.loads(sec_read(os.path.join(ALB_CACHE, f"{ck}-a.json")))
    except (OSError, ValueError):
        return None
    if len(ALB_QA) > 20000:
        ALB_QA.clear()
    ALB_QA[ck] = q
    return q


def alb_qa_make(a, pid, m, big=None, px=None):
    """算這張的分數、指紋（影片不算）；big 沒給就拿做好的大圖"""
    if m.get("vid") or m.get("bad"):
        return
    ck = alb_ckey(a, pid, m)
    fn = os.path.join(ALB_CACHE, f"{ck}-a.json")
    afp = (m.get("x") or {}).get("afp")
    if os.path.exists(fn) and (not afp or (alb_qa_get(ck) or {}).get("v") == ALB_QAV):
        return
    if big is None and px is None:
        try:
            big = sec_read(alb_cfile(ck, "l"))
        except (OSError, ValueError):
            return
    q = alb_qa_calc(big, afp, px=px)
    if q:
        sec_write(fn, json.dumps(q).encode())
        ALB_QA[ck] = q


def alb_get(a, pid, kind, meta=None):
    """回傳 (bytes 或 None, 檔名)；照片還沒做好就現在做"""
    m = meta if meta is not None else (alb_index(a, scan=False).get("ph") or {}).get(pid)
    if not m:
        return None, ""
    ck = alb_ckey(a, pid, m)
    if kind == "x" and (m.get("bad") or m.get("vid") or max(m["w"], m["h"]) < ALB_XL * .7):
        kind = "l"                                     # 原本就不大：給一般的大圖
    fn = alb_cfile(ck, kind)
    if kind == "x" and not os.path.exists(fn):
        if not os.path.exists(alb_cfile(ck, "s")):
            return alb_get(a, pid, "l", meta=m)
        with ALB_LOCK:
            ALB["req"] += 1
        try:
            with ALB_GEN:
                if not os.path.exists(fn) and not alb_make(a, pid, m, ALB_XL):
                    fn = alb_cfile(ck, "l")
        finally:
            with ALB_LOCK:
                ALB["req"] = max(0, ALB["req"] - 1)
    elif not os.path.exists(fn) and not m.get("bad"):
        with ALB_LOCK:
            ALB["req"] += 1
        try:
            with ALB_GEN:
                if not os.path.exists(fn) and not alb_make(a, pid, m):
                    alb_mark_bad(a, pid)
        finally:
            with ALB_LOCK:
                ALB["req"] = max(0, ALB["req"] - 1)
    try:
        return sec_read(fn), m["n"]
    except (OSError, ValueError):
        return None, m["n"]


# ── 影片：轉成 720p 的 H.264（每支手機都放得了、省流量、不帶定位），分段加密存著 ──
def alb_vfile(ck, kind):
    return os.path.join(ALB_CACHE, f"{ck}-{kind}.json")


def alb_vpart(ck, kind, i):
    return os.path.join(ALB_CACHE, f"{ck}-{kind}-{i}.bin")


def alb_vinfo(ck, kind):
    try:
        d = json.loads(sec_read(alb_vfile(ck, kind)))
        return d if isinstance(d, dict) and d.get("sz") else None
    except (OSError, ValueError):
        return None


def alb_vread(ck, kind, start, end):
    """回傳 start～end（含）這一段，一次一個分段解開"""
    ch = ALB_VCH
    for i in range(start // ch, end // ch + 1):
        b = sec_read(alb_vpart(ck, kind, i))
        lo = max(start - i * ch, 0)
        hi = min(end - i * ch + 1, len(b))
        if lo < hi:
            yield b[lo:hi]


def alb_vmake(a, pid, m, kind):
    """kind v＝影片本身、m＝原況照片會動的那段（沒有聲音）"""
    p = alb_path(a["dir"])
    if not p:
        return False
    ck = alb_ckey(a, pid, m)
    if alb_vinfo(ck, kind):
        return True
    name = m["n"] if kind == "v" else (m.get("lv") or {}).get("n")
    if not name:
        return False
    cmd, src = alb_ff_src(os.path.join(p, name))
    if not cmd:
        return False
    tries = [(1, 1, 0), (0, 1, 0), (0, 0, 1)] if m.get("hdr") and kind == "v" and alb_ff_has("zscale") else [(0, 1, 0), (0, 0, 1)]
    if kind == "v" and alb_ff_has("loudnorm"):         # 音量拉平（跟串流平台一樣 −16 LUFS）：先試，不行照原本的音量
        tries = [(h, 2 if s else 0, ln) for h, s, ln in tries[:1]] + tries
    for hdr, snd, lean in tries:                       # 轉不出來時退一步再試：不壓 HDR、不要聲音、少用幾條執行緒
        ok, err = alb_vrun(a, ck, p, name, kind, cmd, src, hdr, snd if kind == "v" else 0, lean, m.get("dur", 4))
        if ok:
            return True
    log(f"相簿影片轉不出來（{name}：{err[-160:] or '不明原因'}）")
    return False


def alb_vrun(a, ck, p, name, kind, cmd, src, hdr, snd, lean, dur):
    """真的叫 ffmpeg 轉一次；回 (成功, 錯誤訊息)"""
    vf, tf = "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',pad=ceil(iw/2)*2:ceil(ih/2)*2", None
    if hdr:                                            # HDR 影片：先縮小再好好壓成一般亮度（不然顏色又淡又灰；縮小後算得快很多）
        vf = ("scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',zscale=t=linear:npl=203,format=gbrpf32le,"
              "zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,pad=ceil(iw/2)*2:ceil(ih/2)*2")
    if alb_wm_bake(a):
        tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")  # noqa: SIM115
        tf.write(a["wm"])
        tf.close()
        alb_ff_give(tf.name)
        vf += (f",drawtext=fontfile='{alb_font(a['wm'])}':textfile='{tf.name}':expansion=none:fontcolor=white@0.6:fontsize='min(w,h)*0.042'"
               ":x='w-tw-min(w,h)*0.035':y='h-th-min(w,h)*0.035':shadowcolor=black@0.35:shadowx=2:shadowy=2")
    mount = alb_ff()[1]
    tdir = cdir = None
    if mount:
        r0 = subprocess.run(["docker", "exec", "-u", "1000", "vps-cloud", "mktemp", "-d", "/tmp/vsalb-XXXXXX"], capture_output=True, text=True, timeout=15)  # noqa: S607
        cdir = r0.stdout.strip() if r0.returncode == 0 else ""
        if not cdir.startswith("/tmp/vsalb-"):
            return False, "無法建立暫存目錄"
        tmp = cdir + "/o.mp4"
    else:                                              # 一般帳號寫得進去的暫存資料夾（只有它和 root 看得到）
        tdir = tempfile.mkdtemp(prefix="vsalb-")
        alb_ff_give(tdir)
        tmp, src = os.path.join(tdir, "o.mp4"), "fd:"
    args = [*(["-threads", "1", "-filter_threads", "1"] if lean else []), "-i", src, "-map", "0:v:0", *(["-map", "0:a:0?"] if snd else ["-an"]),
            "-map_metadata", "-1", "-vf", vf,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p", "-threads", "1" if lean else "2",
            *(["-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000"] if snd == 2 else []),
            *(["-c:a", "aac", "-b:a", "96k", "-ac", "2"] if snd else []), "-movflags", "+faststart", "-f", "mp4", tmp]
    os.makedirs(ALB_CACHE, mode=0o700, exist_ok=True)
    ok, err = False, ""
    try:
        with open(os.devnull if mount else os.path.join(p, name), "rb") as fin:
            r = subprocess.run(["nice", "-n", "17", *cmd, "-v", "error", "-nostdin", "-y", *args], stdin=fin, capture_output=True,
                               timeout=max(300, dur * 6), preexec_fn=None if mount else alb_ff_pre())
        err = r.stderr.decode("utf-8", "replace").strip().replace("\n", " ")
        if r.returncode == 0:
            if mount:                                  # 容器裡做的：倒出來再刪掉
                pr = subprocess.Popen(["docker", "exec", "-u", "1000", "vps-cloud", "cat", tmp], stdout=subprocess.PIPE)  # noqa: S607
                try:
                    ok = alb_vstore(ck, kind, pr.stdout)
                    pr.wait(timeout=60)
                    ok = ok and pr.returncode == 0
                finally:
                    if pr.stdout:
                        pr.stdout.close()
                    if pr.poll() is None:
                        pr.kill()
                        pr.wait()
            else:
                with alb_safe_open(tmp) as f:
                    ok = alb_vstore(ck, kind, f)
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        err = str(e)
    finally:
        for x in [tf.name] if tf else []:
            try:
                os.remove(x)
            except OSError:
                pass
        try:
            if mount and cdir:
                subprocess.run(["docker", "exec", "-u", "1000", "vps-cloud", "rm", "-rf", cdir], capture_output=True, timeout=30)  # noqa: S607
            elif tdir:
                shutil.rmtree(tdir, ignore_errors=True)
        except (OSError, subprocess.SubprocessError):
            pass
    return ok, err


def alb_vstore(ck, kind, f):
    """一段一段加密寫進去，最後寫清單（有清單就代表整支好了）"""
    n = sz = 0
    while True:
        b = f.read(ALB_VCH)
        while b and len(b) < ALB_VCH:                  # 管線一次給不滿
            more = f.read(ALB_VCH - len(b))
            if not more:
                break
            b += more
        if not b:
            break
        sec_write(alb_vpart(ck, kind, n), b)
        n += 1
        sz += len(b)
    if not sz:
        return False
    sec_dump(alb_vfile(ck, kind), {"n": n, "sz": sz})
    return True


def alb_mark_bad(a, pid, key="bad", val=1):
    aid = a["id"]
    fn = os.path.join(ALB_CACHE, f"idx-{aid}.json")
    with ALB_IDX_LOCK:
        idx = ALB["idx"].get(aid)
        if idx is None:
            try:
                idx = sec_load(fn)
            except (OSError, ValueError):
                idx = {}
            if not isinstance(idx, dict):
                idx = {}
            ALB["idx"][aid] = idx
        if pid in (idx.get("ph") or {}):
            idx["ph"][pid][key] = val
            sec_dump(fn, idx)


def alb_kick(aid):
    """背景把這本的照片都先做好（還有查地名）"""
    with ALB_LOCK:
        if aid in ALB["q"]:
            if ALB["q"] and ALB["q"][0] == aid:        # 正在跑這本時又來新的事（上傳、改浮水印）：跑完再補跑一次
                ALB["again"].add(aid)
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
            ALB["again"].discard(aid)
        try:
            a = alb_all().get(aid)
            if a:
                idx = alb_index(a)
                ph = idx.get("ph") or {}
                order = list(idx.get("order", []))
                cov = next((pid for pid in order if ph[pid]["w"] > ph[pid]["h"] * 1.15 and not ph[pid].get("bad") and not alb_other(ph[pid])), None)
                if cov and cov != order[0]:
                    order.remove(cov)
                    order.insert(0, cov)
                for pid in order:
                    if aid not in alb_all():
                        break
                    m = ph[pid]
                    if not m.get("bad") and not os.path.exists(alb_cfile(alb_ckey(a, pid, m), "s")):
                        for _ in range(40):
                            if not ALB["req"]:
                                break
                            time.sleep(0.05)
                        with ALB_GEN:
                            ok = alb_make(a, pid, m)
                        if not ok:
                            alb_mark_bad(a, pid)
                for pid in idx.get("order", []):        # 以前做好的小圖：補算分數、指紋
                    if aid not in alb_all():
                        break
                    m = idx["ph"][pid]
                    if os.path.exists(alb_cfile(alb_ckey(a, pid, m), "s")):
                        alb_qa_make(a, pid, m)
                if a.get("loc"):
                    hid = alb_hid(a)
                    for pid in idx.get("order", []):
                        m = idx["ph"][pid]
                        if pid in hid or alb_up_who(m["n"]):
                            continue
                        g = m.get("g")
                        if g:
                            alb_place(g[0], g[1], wait=True)
                    for day, g in alb_wx_days(a, idx).items():
                        alb_wx(g[0], g[1], day, wait=True)
                for pid in idx.get("order", []):        # 照片都好了再慢慢轉影片
                    if aid not in alb_all():
                        break
                    m = idx["ph"][pid]
                    kind = "v" if m.get("vid") else "m" if m.get("lv") else ""
                    if kind and m.get("vbad", 0) < ALB_VV and not alb_vinfo(alb_ckey(a, pid, m), kind) and not alb_vmake(a, pid, m, kind):
                        alb_mark_bad(a, pid, "vbad", ALB_VV)
        except Exception as e:  # noqa: BLE001  相簿出錯不影響監控
            log(f"相簿小圖做不出來（{str(e)[:120]}）")
        with ALB_LOCK:
            ALB["q"].pop(0)
            if aid in ALB["again"]:
                ALB["again"].discard(aid)
                ALB["q"].append(aid)
            last = not ALB["q"]
        if last:                                       # 清單空了就結束（之後再排進來的會另開一個）
            alb_gc()                                   # 換了浮水印、大小，舊的小圖清掉
            return


def alb_gc():
    """清掉已經沒有相簿用到的小圖、超清晰大圖、過期相簿的索引和留言；朋友放到一半斷線留下的暫存檔（一天以上）；超出上限的地圖圖塊"""
    live = alb_all()
    keep, live_ids = set(), set(live)
    root = alb_root() or ""
    for aid, a in live.items():
        p = alb_path(a["dir"])
        for d in [os.path.join(p, ALB_UPDIR, x) for x in (a.get("ufd") or {}).values()] if p else []:
            try:
                for e in os.scandir(d):
                    if e.name.startswith(".vsup-") and e.name.endswith(".part") and time.time() - e.stat(follow_symlinks=False).st_mtime > 86400:
                        os.remove(e.path)
            except OSError:
                pass
        idx = alb_index(a, scan=False)
        wm = (a.get("wm") or "") if alb_wm_bake(a) else ""
        for pid, m in (idx.get("ph") or {}).items():
            keep.add(alb_ckey(a, pid, m, root, wm))
    with ALB_IDX_LOCK:
        for k in [k for k in ALB["idx"] if k not in live_ids]:
            ALB["idx"].pop(k, None)
    with ALB_LOCK:
        talk = alb_talk_all()
        dead_t = [k for k in talk if k not in live_ids]
        if dead_t:
            for k in dead_t:
                talk.pop(k, None)
            try:
                alb_talk_save()
            except OSError:
                pass
    now = time.time()
    try:
        for fn in os.listdir(ALB_CACHE):
            m = re.fullmatch(r"\.?([0-9a-f]{24})-(?:[slqx]\.jpg|a\.json|[vm](?:-\d+\.bin|\.json|\.mp4))", fn)
            if m and m[1] not in keep:
                os.remove(os.path.join(ALB_CACHE, fn))
                continue
            mi = re.fullmatch(r"idx-([0-9a-f]+)\.json", fn)
            if mi and mi[1] not in live_ids:
                os.remove(os.path.join(ALB_CACHE, fn))
                continue
            if fn.endswith(".tmp"):
                fp = os.path.join(ALB_CACHE, fn)
                try:
                    if now - os.stat(fp).st_mtime > 3600:
                        os.remove(fp)
                except OSError:
                    pass
    except OSError:
        pass
    try:
        tiles, tot, now = [], 0, time.time()
        for root, _, fns in os.walk(ALB_TILE_DIR):
            for fn in fns:
                fp = os.path.join(root, fn)
                try:
                    st = os.stat(fp)
                except OSError:
                    continue
                if now - st.st_mtime > ALB_TILE_DAYS * 86400:
                    os.remove(fp)
                else:
                    tot += st.st_size
                    tiles.append((st.st_mtime, st.st_size, fp))
        if tot > (128 << 20):
            for _, sz, fp in sorted(tiles):
                try:
                    os.remove(fp)
                except OSError:
                    pass
                tot -= sz
                if tot <= (96 << 20):
                    break
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
    rows = ALB["ap"]
    if rows is None:
        rows = []
        try:
            with open(os.path.join(HERE, "data", "airports.tsv"), encoding="utf-8") as f:
                for line in f:
                    x = line.rstrip("\n").split("\t")
                    if len(x) < 8 or not x[7]:
                        continue
                    try:
                        rows.append((float(x[4]), float(x[5]), x[7], x[3][:2].upper()))
                    except ValueError:
                        continue
        except OSError:
            pass
        ALB["ap"] = rows
    best, c = None, math.cos(math.radians(lat))
    for alat, alon, city, cc in rows:
        d = (alat - lat) ** 2 + ((alon - lon) * c) ** 2
        if best is None or d < best[0]:
            best = (d, city, cc)
    return {"n": best[1], "a": "", "c": best[1], "cc": best[2]} if best and best[0] < 1 else None


ALB_PLV = 4                                   # 地名格式版本：4 起城市先找結尾是「市」的那一層，再問城市那一級，還是區就用最近的機場城市
ALB_S2T = str.maketrans(dict(zip('区區县縣广廣东東门門龙龍汉漢湾灣庆慶阳陽宁寧苏蘇无無锡錫连連乌烏鲁魯齐齊尔爾滨濱长長兰蘭银銀贵貴厦廈闽閩头頭余餘鸡雞济濟郑鄭开開岛島烟煙潍濰临臨扬揚镇鎮绍紹兴興温溫华華义義丽麗黄黃冈岡荆荊张張凤鳳贺賀钦欽琼瓊亚亞萨薩内內辽遼绥綏郸鄲庄莊沧滄云雲丰豐历歷乡鄉号號园園场場馆館楼樓桥橋庙廟宫宮观觀车車机機厅廳厂廠铺鋪业業体體学學医醫处處关關际際国國环環贸貿万萬达達荟薈汇匯滩灘闸閘宝寶静靜闵閔杨楊贤賢浔潯吴吳盘盤栖棲邺鄴罗羅岗崗盐鹽坝壩从從萝蘿顺順禅禪鹤鶴庐廬岭嶺坛壇纪紀层層阁閣湿濕风風点點级級线線铁鐵轨軌运運动動栋棟单單邮郵电電视視农農渔漁码碼仓倉储儲疗療养養卫衛艺藝术術剧劇戏戲书書图圖档檔饭飯宾賓证證险險网網络絡讯訊软軟产產经經试試验驗们們个個这這进進过過还還时時间間乐樂浑渾邓鄧谭譚陆陸陈陳刘劉孙孫赵趙许許韩韓冯馮郓鄆枣棗滦灤岚嵐兖兗泸瀘绵綿凉涼毕畢铜銅钟鐘随隨荡蕩娄婁怀懷浏瀏帅帥钢鋼铝鋁'[0::2], '区區县縣广廣东東门門龙龍汉漢湾灣庆慶阳陽宁寧苏蘇无無锡錫连連乌烏鲁魯齐齊尔爾滨濱长長兰蘭银銀贵貴厦廈闽閩头頭余餘鸡雞济濟郑鄭开開岛島烟煙潍濰临臨扬揚镇鎮绍紹兴興温溫华華义義丽麗黄黃冈岡荆荊张張凤鳳贺賀钦欽琼瓊亚亞萨薩内內辽遼绥綏郸鄲庄莊沧滄云雲丰豐历歷乡鄉号號园園场場馆館楼樓桥橋庙廟宫宮观觀车車机機厅廳厂廠铺鋪业業体體学學医醫处處关關际際国國环環贸貿万萬达達荟薈汇匯滩灘闸閘宝寶静靜闵閔杨楊贤賢浔潯吴吳盘盤栖棲邺鄴罗羅岗崗盐鹽坝壩从從萝蘿顺順禅禪鹤鶴庐廬岭嶺坛壇纪紀层層阁閣湿濕风風点點级級线線铁鐵轨軌运運动動栋棟单單邮郵电電视視农農渔漁码碼仓倉储儲疗療养養卫衛艺藝术術剧劇戏戲书書图圖档檔饭飯宾賓证證险險网網络絡讯訊软軟产產经經试試验驗们們个個这這进進过過还還时時间間乐樂浑渾邓鄧谭譚陆陸陈陳刘劉孙孫赵趙许許韩韓冯馮郓鄆枣棗滦灤岚嵐兖兗泸瀘绵綿凉涼毕畢铜銅钟鐘随隨荡蕩娄婁怀懷浏瀏帅帥钢鋼铝鋁'[1::2])))   # 中國的地名常只有簡體：地名常見字換成繁體


def alb_zh(s, cc):
    return s.translate(ALB_S2T) if cc == "CN" and s else s


ALB_CITY_KEYS = ("city", "town", "municipality", "county", "state_district", "region", "district", "city_district", "province", "state")


def alb_city_name(*js):
    """從地址挑城市。中國的地址常把「區」放在城市欄、地級市放在別欄或沒有：先找結尾是「市」的那一層"""
    ads = [x.get("address") or {} for x in js if x]
    for ad in ads:
        for k in ALB_CITY_KEYS:
            v = str(ad.get(k) or "")
            if v[-1:] == "市":
                return v[:-1] if len(v) >= 3 else v
    for ad in ads:
        for k in ("city", "town", "municipality", "village", "county", "state"):
            v = str(ad.get(k) or "")
            if v:
                return v
    return ""


ALB_OWNF = {"CN-HK": "HK", "CN-MO": "MO", "US-PR": "PR", "US-GU": "GU", "US-VI": "VI", "US-AS": "AS", "US-MP": "MP",
            "NL-AW": "AW", "NL-CW": "CW", "NL-SX": "SX", "FR-NC": "NC", "FR-PF": "PF", "FR-RE": "RE", "FR-GP": "GP", "FR-MQ": "MQ",
            "FR-GF": "GF", "FR-YT": "YT", "FR-PM": "PM", "FR-WF": "WF", "FR-BL": "BL", "FR-MF": "MF"}
ALB_OWNN = (("香港", "HK"), ("Hong Kong", "HK"), ("澳門", "MO"), ("澳门", "MO"), ("Macau", "MO"), ("Macao", "MO"))


def alb_region(cc, ad):
    """有自己旗子的地方（香港、澳門、波多黎各…）：地圖資料常把它們算在別國底下，改用它們自己的代碼"""
    for k, v in (ad or {}).items():
        if str(k).startswith("ISO3166-2") and str(v).upper() in ALB_OWNF:
            return ALB_OWNF[str(v).upper()]
    if cc == "CN":
        txt = " ".join(str((ad or {}).get(k) or "") for k in ("state", "region", "province", "city"))
        for w, c in ALB_OWNN:
            if w in txt:
                return c
    return cc


def alb_cc_fix(pl):
    """舊的地名記錄：國家寫中國但地址在香港、澳門的，改成它們自己的"""
    cc = pl.get("cc", "")
    if cc == "CN":
        txt = " ".join(str(pl.get(k) or "") for k in ("n", "a", "c"))
        for w, c in ALB_OWNN:
            if w in txt:
                return c
    return cc


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
    cc0 = str(ad.get("country_code") or "").upper()[:2]
    cc = alb_region(cc0, ad)
    if cc != cc0:                                   # 香港、澳門不寫國家那一層
        seen = [x for x in seen if x != country]
        top = top if top != country else (state or top)
    return {"n": alb_zh(top, cc)[:40], "a": alb_zh("・".join(seen[:3]), cc)[:60], "c": alb_zh(city or state or country, cc)[:30], "cc": cc, "v": ALB_PLV}


def alb_geo_ask(lat, lon, zoom):
    gap = 1.1 - (time.time() - ALB["geo_t"])        # Nominatim 一秒最多一次
    if gap > 0:
        time.sleep(gap)
    ALB["geo_t"] = time.time()
    url = os.environ.get("SENTINEL_ALB_GEO") or "https://nominatim.openstreetmap.org/reverse"
    q = urllib.parse.urlencode({"format": "jsonv2", "lat": f"{lat:.5f}", "lon": f"{lon:.5f}", "zoom": zoom, "accept-language": "zh-TW,zh"})
    try:
        req = urllib.request.Request(url + "?" + q, headers={"User-Agent": f"vps-sentinel/{VERSION} (+https://github.com/a7510049/vps-sentinel)"})
        with urllib.request.urlopen(req, timeout=10) as r:
            j = json.loads(r.read(1 << 20))
        return j if isinstance(j, dict) and j.get("address") else None
    except Exception:  # noqa: BLE001
        return None


def alb_place(lat, lon, wait=False):
    k = f"{lat:.3f},{lon:.3f}"
    d = alb_places()
    if k in d and (not wait or d[k].get("v", 0) >= ALB_PLV or d[k].get("tmp")):   # 舊版存的城市不準：背景補問一次
        return d[k]
    if not wait:
        return None
    with ALB_PL["lock"]:
        if k in d and (d[k].get("v", 0) >= ALB_PLV or d[k].get("tmp")):
            return d[k]
        res = None
        j = alb_geo_ask(lat, lon, 17)
        if j:
            res = alb_place_fmt(j)
            ck = f"c3{lat:.2f},{lon:.2f}"                 # 城市那一級（一公里一格共用一次）
            cn = d.get(ck)
            if cn is None:
                cn = alb_zh(alb_city_name(j), res["cc"])[:30]
                if cn[-1:] in "区區县縣旗" or not cn:      # 這一筆地址看不出是哪個市：照「城市那一級」再問一次
                    cj = alb_geo_ask(lat, lon, 10)
                    cn = alb_zh(alb_city_name(cj, j), res["cc"])[:30] if cj else cn
                if cn[-1:] in "区區县縣旗":                # 還是區：用最近的機場城市
                    nc = alb_near_city(lat, lon)
                    cn = nc["c"] if nc and nc["cc"] == res["cc"] else cn
                if cn:
                    d[ck] = cn
            if cn:
                res["c"] = cn
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


# ── 那天的天氣：Open-Meteo 的歷史天氣（照拍照的地點、日期，問過的記在地名那個檔裡） ──
ALB_WX_URL = os.environ.get("SENTINEL_ALB_WX") or "https://archive-api.open-meteo.com/v1/archive"
ALB_WXF = {}                                                      # 剛問過、還沒有資料的（一小時內不再問）
ALB_WX_URL2 = os.environ.get("SENTINEL_ALB_WX2") or "https://api.open-meteo.com/v1/forecast"   # 最近幾天歷史資料還沒有：用預報那邊的


def alb_wx_days(a, idx):
    """每天第一張有定位的照片 → {日期: (緯度, 經度)}（朋友放的不算，藏起來的也不算）"""
    out, hid = {}, alb_hid(a)
    for pid in idx.get("order", []):
        if pid in hid:
            continue
        m = idx["ph"].get(pid) or {}
        dt, g = (m.get("x") or {}).get("dt", ""), m.get("g")
        if not g or alb_up_who(m.get("n", "")) or not re.match(r"\d{4}:\d\d:\d\d", dt):
            continue
        out.setdefault(dt[:10].replace(":", ""), g)
    return out


def alb_wx(lat, lon, day, wait=False):
    """[天氣代碼, 最高溫, 最低溫]；問不到回 None"""
    k = f"w{lat:.1f},{lon:.1f},{day}"
    d = alb_places()
    if k in d:
        return d[k] or None
    try:
        dd = date(int(day[:4]), int(day[4:6]), int(day[6:8]))
    except ValueError:
        return None
    today = date.today()
    if not wait or dd > today or dd.year < 1940 or time.time() - ALB_WXF.get(k, 0) < 3600:
        return None
    ds = dd.isoformat()
    res = None
    for url in (ALB_WX_URL, ALB_WX_URL2):
        q = urllib.parse.urlencode({"latitude": f"{lat:.2f}", "longitude": f"{lon:.2f}", "start_date": ds, "end_date": ds,
                                    "daily": "weather_code,temperature_2m_max,temperature_2m_min", "timezone": "auto"})
        try:
            req = urllib.request.Request(url + "?" + q, headers={"User-Agent": f"vps-sentinel/{VERSION} (+https://github.com/a7510049/vps-sentinel)"})
            with urllib.request.urlopen(req, timeout=10) as r:
                j = (json.loads(r.read(1 << 18)) or {}).get("daily") or {}
            v = [(j.get(x) or [None])[0] for x in ("weather_code", "temperature_2m_max", "temperature_2m_min")]
            if None not in v:
                res = [int(v[0]), round(float(v[1])), round(float(v[2]))]
                break
        except Exception:  # noqa: BLE001
            continue
    if res is None and (today - dd).days < 10:
        ALB_WXF[k] = time.time()                       # 最近幾天的還沒有：一小時後再問
        return None
    with ALB_PL["lock"]:
        d[k] = res or []
        try:
            sec_dump(ALB_PLACES, d)
        except OSError:
            pass
    return res


# ── 朋友那邊：網頁、照片清單、圖、下載 ──
ALB_TILE_DIR = os.path.join(DATA_DIR, "album-tiles")             # 地圖圖塊（不備份，重抓得到）
ALB_TILE_URL = os.environ.get("SENTINEL_ALB_TILE") or "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
ALB_TILE_DAYS = 30
ALB_TILE_GATE = threading.BoundedSemaphore(4)


def alb_tile_ok(a, z, x, y):
    """確認請求的地圖圖塊落在相簿實際拍攝地點附近（z<=4 總覽圖塊放行），避免遭濫用抓全球圖塊撐爆硬碟"""
    if z <= 4:
        return True
    idx = alb_index(a, scan=False)
    hid = alb_hid(a)
    n = 1 << z
    for pid in idx.get("order", []):
        if pid in hid:
            continue
        m = idx["ph"].get(pid) or {}
        if alb_up_who(m.get("n", "")):
            continue
        g = m.get("g")
        if not g:
            continue
        lat, lon = max(-85.0, min(85.0, float(g[0]))), float(g[1])
        tx = int((lon + 180.0) / 360.0 * n) % n
        rl = math.radians(lat)
        ty = int((1.0 - math.log(math.tan(rl) + 1.0 / math.cos(rl)) / math.pi) / 2.0 * n)
        dx = min((x - tx) % n, (tx - x) % n)
        if dx <= 6 and abs(y - ty) <= 6:
            return True
    return False


def alb_tile(z, x, y):
    """OpenStreetMap 的一格地圖（照它的規定：寫清楚是哪個程式、存起來重複用）"""
    if not (0 <= z <= 19 and x < 2 ** z and y < 2 ** z):
        return None
    fn = os.path.join(ALB_TILE_DIR, str(z), str(x), f"{y}.png")
    try:
        st = os.stat(fn)
        if time.time() - st.st_mtime < ALB_TILE_DAYS * 86400:
            with open(fn, "rb") as f:
                return f.read()
    except OSError:
        st = None
    url = ALB_TILE_URL.format(z=z, x=x, y=y)
    try:
        with ALB_TILE_GATE:
            req = urllib.request.Request(url, headers={"User-Agent": f"vps-sentinel/{VERSION} (+https://github.com/a7510049/vps-sentinel)"})
            with urllib.request.urlopen(req, timeout=15) as r:  # noqa: S310
                b = r.read(2 << 20)
        if not b.startswith(b"\x89PNG"):
            raise ValueError("not png")
        tdir = os.path.dirname(fn)
        os.makedirs(tdir, mode=0o700, exist_ok=True)
        tmp = f"{fn}.{secrets.token_hex(4)}.tmp"
        try:
            with open(tmp, "wb") as f:
                f.write(b)
            os.replace(tmp, fn)
        except OSError:
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise
        return b
    except (OSError, ValueError):
        if st:                                         # 連不上就先用舊的
            try:
                with open(fn, "rb") as f:
                    return f.read()
            except OSError:
                pass
        return None


# 相簿自己的標誌（一疊照片；朋友那頁的分頁圖示、加到主畫面、傳 LINE 的預覽圖，不用哨兵的）
ALB_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="a1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8fa3"/><stop offset="1" stop-color="#e8456b"/></linearGradient><linearGradient id="a2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc48a"/><stop offset="1" stop-color="#ff8a5c"/></linearGradient><linearGradient id="a3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9a6ff"/><stop offset="1" stop-color="#7c6cf0"/></linearGradient></defs><rect width="100" height="100" rx="22.5" fill="#fff"/><g transform="translate(50 52) scale(.86) translate(-50 -52)"><rect x="18" y="24" width="46" height="56" rx="9" fill="url(#a3)" transform="rotate(-14 41 52)"/><rect x="36" y="20" width="46" height="56" rx="9" fill="url(#a2)" transform="rotate(12 59 48)"/><rect x="26" y="26" width="48" height="58" rx="9" fill="url(#a1)"/><circle cx="61" cy="40" r="6" fill="#fff"/><path d="M30 74 L44 56 L53 66 L59 59 L70 74 Z" fill="#fff"/></g></svg>'
ALB_ICON_180 = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAMAAAAKE/YAAAADAFBMVEX////+/f3+9/f67/P56Or93df92Nn71t781dXr1u//yqX/wIj/v4b/voX/vYr/vIT/vIP6y9TVyvz/u4b/uoL/uYH/uID/t4L/tn//tX7/s33/sX3/sHr/rnn/rXr/rHf/rHb/q3f/qnX/qXTYs+D/qHX/p3P/pnL/pXH/pHL/pHD/o3D/om//oXH/oW7/oG3/n23/nmz/nWv/nGr/m2r/mmn/mmj6n5K2o/y0of6zoP2yn/2xn/2xnv2wnv2wnf2vnfyvnP2unPyum/ytm/ysm/qtmvysmvyrmvv9lXT/mWj/l2f/lmb/lWX/k2P9i539iZ79iJ77jYL9jWX/j2D9h538hpz8hZv8hJv7hJr8g5r7g5r7gpr7gpn6gpn6hXj7gZj6gZj7gJj6gJj6gJf6f5f6f5b6fpf6fpb5fpb6fZb5fZb5fZX6fJX5fJX5fJT5e5T5e5P5epP5eZP2i6L3fpD4epP0epT4eZP4eZLfjLu3lOyulvevjOmrmfyqmPuqkvSpl/uolvunlfqmlPqlk/qkkvqikfmikPmgj/mdjPj4eJL4eJH3eJH4d5H3d5H3d5D4dpD3dpD2dpD3dZD3dY/2dY/3dI/2dI/3dI72dI72dYb3c472c472c432co72co32cY32cYz2cIz1coz1cIz1cIv1b4v1b4r1bor0bor0boL1bYn0bYn1bIn0bIn0bIj0a4j0a4f0aof0aYfzborzaofzaYfzaYbzaIbzaIXzZ4XzZ4TyaIXqbpLzZoTyZoTyZYTyZYPyZIPyZILxZILyY4LxY4LxY4HxYoHwY4LxYYHxYYDwYYDxYIDwYIDwYH/xX3/wX3/wX37sX3/wXn7vXn7wXX3vXX3wXH3vXH3vXHzvW3zvW3vvWnvuWnvvWXruWXvuWXruWHruWHntWHnuV3ntV3juVnjtVnjtVnfsV3ntVXjtVXftVHbsVHbtU3bsU3bsUnXsUnTrU3bsUXTrUXTsUHTrUHPrT3PrTnLrTXHqTXHqTHDqS3DpSm/texoyAAARqElEQVR42u2ce1RUdR7ABwYOhIrNpKVRtuKiooIv7KAiD2G1EWErfIBEiw/KV4jurAITegC1FEJDSDNxAZVxTFaQRFCsETWcldRwSQKVFliN3ZXSXfMt+/3+fr87c2cGaq170c653387zfn48Tvf172jTCaFFFJIIYUUUkghhRRSSCGFFFJIIYUUUkghhRRSSCGFFFJI0QVha2/vBGFvb/vrQXbq1q1b9+49uvfo0aObk73dr4DcBpC7M+aePXr2fLLnk85A/thrJsw9GDNEL4iekC3yx5TZrpul515P9nqyd6/evZ6GeMrJ8TFMc9tuPM89TZ57936aRJ8+ffo6Ozna2TxO0CQ3mOUekM1gGYgZcx9g7tunb99n+z7b5zFKc3usGp16Rs0Qz5JwcXF5BtL80SeLjbPJc89OPSMxMD/n8hzGM480zeVK7992Y5p78DU/3ZtpNvP8HIvnMZwfgXIbAH5p9eo1iWbVmXl+2uS5L88zJabMz7/w/AsvONt3reGUlJTUVIB2/rGqYfLsYsUM0b9/f2e7rjLsn7wqOTmVQKdadZTextxgVaMTz78BZtf+rv3suwDYd/LKtzWJxlD/nh8REH/qMF599dV+XDabPLti2IsLPD4ocPJkTeLLL7/y8vRXZkyfOSN8ZmREVOTsqLnRMfPmxyyaH7swbsnyuPhlaQkb0jMzsjI3Z+d8mJuTl7srX7tDp/1IRT1jNvennl0HuLr1txMLWDnOL2BiYOAkRAboV6ZPnzFj5szwiMjI16KiZ0fPi4mJmb9w8eIlcXFxy+MTEtIzNmzIzMrO3vphTk5u3s78ggLtbp2u8CM3nmei2dXNze0ZGxG+dMqxEyb4+QYEBE6cpFEjM3ieDp5ngufIWbOjZoPnGPC8GDwD87IE8LwhIzMzGzxv35abi8y7tXt0hXuLgNro2ZV4dhvoNtBRYMdK73Hjx/tM8PX1D5g4MYgxA7JRdBQwzwXm+cAci8zLExLSGPPmreA5Nz9/V4FWC5737isq/siNn84DgBmin43AyGPHj/MZ7zvB339iQNDbjJklR0R45CxknjcnJmYBMC+JJZ7j09Mo89bNOdTzDi31vK+4uBSo+7/gSpjdXCnzoEECqrb1Hjt27DgwDdnhD9kRmGjGHB6OnqOj584lnhfHxjLPjHnzh1aei0tLyj5yZZ4HDOCYBzsJl8xGZh8/vwD/wIma/8fzH9+jzFnUc36emeeSsk8Ovco8m5gHuQmVHzYcs4+Prx9kx8RA9Y94Xoiel/E9b2aed5k8l5SUlZUf+phLZ2AehMyDB7sLtd8oAdqY0X6Q0RoLZuJ5LvMcyzwT5vezs7bQfM7bxTzvY57Ly48cVmHVGDCQMA8GZvfBQ+wETA4uo/24jO7Y8yLqeVl8fFpaBnjOyqKe8/J2gufdwFwIzPtLDh4sKz98uOIPrrTSgWX07O4+ZIhAppU8Zlqj1YSZdsJw6ISvRUeB5zkL3oROGAudcBl0wjTohO9nZYLnD4E5Fzzv0O0u1IHnotL9B0vA8yF9xcccM/XsPtR9qI1wlWMsv0YHcgV6JoiOnEVFYyNcsHAxeIaEjocCnbEBREOB3gaic6FwREToIDtIQkN2lB86dESv1w9k30CSzu5DhwztJ1JGB77NnzjCoyKjceKYY5o4lrOJIzNzC5k4cnO3KBxgzLd1UOwsKirFjC4Dz4f1n1W6D3QbxDwPAeZhQ52Fzw6S0ZM0LKFnQCOMgIkjKnrOvHmQ0FChlywBz1A50tPBcyaZOLbn5qqN3y47dfF+ZAbPFXp9ZaUHrXTUM8Qwgeo0qXdjSY32xRodFITQMwA6HCp0FCTHXKjQb7AKvZRMHOlpG6FyfACdcHtO7iYF/+MUB5C5vAI9V57woJXOnXkeNsxeMOhxkNI+kNJYo4OCJml4XYUk9DzWCVlXAc+Y0Gyyy1Wbf54aPR8+jJ5PHPegVWOw+xDUPGyYp0DFwzKjJwM0n9mqEyak0wrNJo5NFhzynUbPx056UGaoGkPRs2d/mXCmeRkdNGmy5kcmjmXYCTP4nVBh+YGKcur52PGqKg9WnYnmYZ6ezoJBG2s0ZMekINhYpkPloJ3wNdoJ55s6YQLrhNmsE263Krw2Zcxz1ecGD+LZyOwp1LykxBo9Hmq0H04dwLxSY+aZMC9knuOZ5yzmOS9/kfUnrtB/drTy2LGqKoNBhZ6HGpk97YWDZhkdQDJ65UqNpec3O5k4/gwTh9r6E9UVlUeJ55PVKq5qeALzcM8RQh1t5KaMnogZDdCW+TyfMS9nE0cmTBxbsRHm7dwxowNoTOgTVScNhmoVrc7EMzC7CDZNe9Ma7U9q9GQCDZ1wFuze0dAJY+bHgOeFwByXEA+dMCMzIzsLdu9tudvAc762wFpeqf5YZdXxk59/YTijYlWDMo8QbgVQshodgDUamFdpwrnde868mDfexIReEreUTRzQVWD3hkZId2/tbqtZ0+5oZeXxqpMnDdVfVKsoM8Tw4SNGjHAUEBoy2g9qdCBk9EsrV4FpvHFEm904lsbFk917Y0YW273zYCfU7tittS552FVOfm4wfFF9VsX3PHKEcHcPOclofy6jwTR4pl1lHuuEbPdOZ7v3VrYTFuBOGGGRH7avVx4/jpWjuvosQJs8jxzpKeAu7u3jS2o0zehVkB6Rs15H5rnmnfC9jndvyzYOnquo59M1KrA8bDjzPOoZAe8HSl6NBuZkjdmNAxOa7oTp/N17p2n3Nh+YSCdEz2fO1tSoeJ5HjnISEpqbSUlGJ6/SdHjjeM9s4jC7cZhGU7madkLqueYrFclmwjxq5CghD5ByX35Gg+mOJ47Obxwle5hsRamZ59paFa0ayAwh6P3R25+X0ckAbX3jSP+JG8f+FWr1ilLWCQ3Vp8Dzl1/V1qnQ80jG7CHoHU9pFI3MyRqrG0c884y7N2E23jj2sRsH7t7QCCuBGQo0iK6pOVdbd141fARNZ4jRzsJCs4yejBmdAtDkxtHZxIHMO7QFjLkIPNPd+7NKPXg+Dp4NZ07XnK49V1fboMKqgcyjR40e7SQotJyKZqZTNLPJ7r2I7N5Ll8VDJ8zI2JiZBaNdzrbtZOLAI/Sevbh77y8pPQi7N3jWw2h3AjwbTlWfPguea8/X1atQMzJDeAn8IMA7gGX0SmBO0XA3jsVxseTGkZCRRm4cuHtvx2t/wY49eOPYW0RvHLBf6SuO6k9AhTYA9BmoHLXnvqqtP9+gYsyjvEZ7eQn8XE7JMnrlKmBO0eDujTcOtnunsd17M3RCvHHsgE5IbxxFxSWlpXjjgFVFD56PQ+EwgOezUDhq6+obAHoU9ezl5dVPJjT0pCAuo1PB9HyoHLFs906DTriR3DjI7k08s2v/vv3kxkF2Qj1v4jh9rgYqx/mGhkYVZUbPY5wEhpab6l1KSqrGauLYYDVx6AoLi/AKXcrfvckIDRMHJnRdXUPDhYuqUZznMYJDy8bymFM0nd84SCfswDPdvas4z7Xo+evGC40qrBqA7PXimCmCP5BTkmaYjNBg2mL33sCmJOp5F/NMuwowGz3Tye40dsLz6PlC4yUV1Qyep4wR/MmWkstofKSs6fTGYfFUhTAfMe3ebOKgnpG5SYXMY9DzFBehmWVyU3akrtYs6uzGwV37C9nlnHRCcuM4xiYOxlxff+HCpUtNTcHIPGbMi1OmTBE8pWUyH1aj8Sl40sLYt+hk19G1n3TCvxDmg+XU89Fj1POpM9WM+Tzx/E1zMHqeAp6DpzgKD61kNZpAW984tpIbxy7ohDrdXujeRcAMBbqcFWjYvbFAnzlNCjR4bgDmxqbm5jDw/CJ4Dg4OFuERs3Jl8iqj6bfYxJHAPGezG0c+eNaC57147S/7pByv0BXgGXZvw0nYvavpxAGeGxovNl1qbroSht9A9BzsJcZ7HcaMXr0mie7eabh702t/jnHi+EDHTRxlbOKoZBNH9RfGiQMKNHhuam65HAbExHPwU2I8yvehNRqYVyctWR6XwK792fT9gm07cfcu2L3FTl0InvcXl5Frf8XhSoDGG0c1VI6as+dq6iCjLzRcvNAEGX2l5UoYxzzVSQxoJa3Rq9E0936B1Y1Dq5DZqMFzMUx2ZeC5Qs/dOE5Btas5dw48nwfPFxtBdEvLlcthjDk42F40aJIdAE13741s92bvF0AnRF026v3sqUpnE8dFrByEuTUsmHoODhHl1Su5kXlt0nKr3ZtOHGrS1GwX0InjCGE23ThYVyGdkDG3hlHPU0M8ZKKEP2Z0KjCvSbJ67r2T7IQr2M1fvqnskyOMmd44qjcdwd3bxPzNP5D526thzPNUZ3GglcT0GjRt7Rl3790OxmvdrnLGzHbvUrmCdZUG2gmbieerBHrq1JCQECexoFl2rE2y2L2p5z28m4xDMe2EbOI4Cn8cNfFcTz23NBPPV78D6BBkDhHpnSs5x7w2qcOJQ82f0hzNJg7849h+YJo4oEATz21tYdRzSIhYL/r6Y41ei6bZxGF241hg/vVX0N0b89lA/wrs/gqeG8DzJfDcAp5bv2u7FkY9h/QTiVmmXM2Z3sDbvfNg5IB8zrMcHRRH2Y3jFHeAVIDni+C5qfny5Svg+Wrbte/DQmg4iQiNzO+sTUoHz+z9gnz6pp1OYf2Qgkwc1QZT2qi5iaOl9fLV1rar19quM+hQR7Gg5dTz2neSeO8X5OWTG0cHj4Ns1OTGscKUNrYHLjX+HRP6SitkdBtkB4MODRXvPdPfAfU7aBoyGnZv8n4B7t46rbqj75HtAvgWHuA/r3W4AJ5bwHPrt99dBWYGHRoaLBqzzJtmx7tJljeOTR0/0bZdYThirlCBnRBFX6XMBDo0NNRFPGglZQbobPPd26GzhDpg+V8WtLSwCg3fwuvXfwgLReZQJ/Gg5ZjS7wC0xY1D0en/YTUFyU9wFRo937gRFkrCUTxo2Utr176Lps0869QP0xgc+J5v3GLQYv5uxxtMv/vuuqQtXCfEPXbRww2Vap7nWzcptJeIzDIlZvS6dUm8iUO36yGrlc0Wk+ebtwn0NGcxoeWY0QBN3y+gNw7Fw36IXaPR820CPW2ak5jQslXUNN290bNW/fAfogDP34PnG7dv3wmbBszTxP0xgDcyr0siL9qRG0fEz9mS1Cj61s1bBBpD3F+5KJEZ0oNMHAU6bc7Par+2pTeug2fIjnsE2kNUZpmcQnNPVXQOP+9jHFoho2+DaGraWVxoWTKFJjcObaHi536MgnwL792hph1FhvYm0Hjj0D5kVzGP1zGh79y7GyZ+SkNSr1u3fl0SnThW/II+Zvs3wnwfoZ1EZpbJQfT6JPrcW+HwCyKRMCN0qPi/kEtF05bv9pezG4fp2v+l1e7dyk0ctKtQ5gdhXSAakno9mOa9X0COo8Ybx+em9wvYjaORv3sz5ltGZoB26YIf3CrXrV+/3tqz6cZxyvhUxfLGYen57oMH7dPcuuJHwrbAvP5Ti/cL2I2Dej5j/lSF7/kaY7595y7x/OC+U9f8sNkboQt1Rez9gkMW7xeA59OQz7WmG8dl7sbRBp6vA/NN8HwHPN9vbz8g65p4AqATzX9DoT9qvHFw73Gwaz/bvf/5b9i9wfN/btwgE8edu/fug+n29sQugkbVSeSpSnFZCXmqchg8442jqrqDpyqX2Y3ju7br13DiuHXzzm30fP9+O0B32Y/H5ZgfpHAc5H5DwX+/4Bx7vwA8N4LnFmO1u8arHPcwo9vbV8i6LJSoGn9DUV52qBx/Q3ECKrSBPfeupVfo+kbT5fxbjvkHXoVGz/e68lf6SM1+Q0EfX3X0fgFl5t84jNWOeW5XyLoynli9PtH8/QLzpyr17KmKWYX+wbxCt7erZV0bNso1iQe59zgsnqrUmZ6qmN84zD0/UMi6PpSaT609G9/j+EnP/3KQPZKwVRywer8ACnQ989zckWfaCdv/q350/2qDrUK9wHLi+LqjicPMc6la8cj/iQy7h5ykZVJIIYUUUkghhRRSSCGFFFJIIYUUUkghhRRSSCGFFFI8BvE/1+UY2UOm1EUAAAAASUVORK5CYII=')
ALB_ICON_512 = base64.b64decode('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')
ALB_ICON_V = hashlib.sha256(ALB_ICON_512).hexdigest()[:8]
ALB_ICONS = {"/a/icon.svg": (ALB_ICON, "image/svg+xml"), "/a/icon-180.png": (ALB_ICON_180, "image/png"), "/a/icon-512.png": (ALB_ICON_512, "image/png")}


def alb_asset(rel):
    """快取靜態網頁檔（依修改時間更新）：回傳 (bytes, 短版號)；album.js 前面接上共用圖示系統 web/icons.js"""
    parts = ["web/icons.js", rel] if rel == "web/album.js" else [rel]
    fps = [os.path.join(HERE, x) for x in parts]
    try:
        mt = tuple(os.stat(fp).st_mtime_ns for fp in fps)
    except OSError:
        return b"", ""
    cur = ALB["assets"].get(rel)
    if cur and cur[0] == mt:
        return cur[1], cur[2]
    try:
        bs = []
        for fp in fps:
            with open(fp, "rb") as f:
                bs.append(f.read())
        b = b"\n".join(bs)
    except OSError:
        return b"", ""
    v = hashlib.sha256(b).hexdigest()[:10]
    ALB["assets"][rel] = (mt, b, v)
    return b, v


def alb_page(h=None, code=""):
    """朋友那頁；h 是這次的連線：傳到聊天室的預覽圖要完整網址"""
    hb, _ = alb_asset("web/album.html")
    _, cv = alb_asset("web/album.css")
    _, jv = alb_asset("web/album.js")
    if not hb or not cv or not jv:
        return "<meta charset=utf-8><p>找不到相簿的網頁檔案，請重新執行 bash install.sh</p>"
    page = hb.decode("utf-8")
    og = ""
    host = (h.headers.get("Host") or "") if h else ""
    if re.fullmatch(r"[A-Za-z0-9.\-]{1,253}(:\d{1,5})?|\[[0-9A-Fa-f:]{2,39}\](:\d{1,5})?", host):
        og = f'<meta property="og:image" content="{"https" if h.https() else "http"}://{host}/a/icon-512.png?v={ALB_ICON_V}">\n'
    a = alb_find(code) if code else None             # 預覽標題：沒密碼、沒過期才寫相簿名稱（有密碼的不洩漏）
    if a and not a.get("pw") and not (a.get("exp") and a["exp"] < time.time()):
        nm = html.escape(a["name"])
        page = page.replace("<title>相簿</title>", f"<title>{nm}</title>").replace('<meta property="og:title" content="相簿">', f'<meta property="og:title" content="{nm}">')
    return page.replace("<!--@og-->\n", og).replace("/*@cssv*/", cv).replace("/*@jsv*/", jv)


# 截圖的檔名：安卓、小米／華為、Windows、Mac、iPhone 存出來的（大小寫不分）
ALB_SSN = re.compile(r"^(screenshot|screen ?shot|screen capture|scr_|螢幕擷取畫面|螢幕快照|螢幕截圖|屏幕截图|屏幕快照|截圖|截图|截屏|スクリーンショット)", re.I)


def alb_other(m):
    """不是相機拍的：截圖，或沒有相機型號也沒有拍攝時間（網路圖片、聊天軟體存下來的）"""
    if m.get("vid"):
        return False
    x = m.get("x") or {}
    return bool(x.get("ss") or ALB_SSN.match(os.path.basename(m["n"])) or not (x.get("mk") or x.get("md") or x.get("dt")))


def alb_manifest(a, th=""):
    idx = alb_index(a)
    talk = alb_talk_of(a, th) if a.get("talk", True) else {}
    ph = idx.get("ph") or {}
    out, places, hid, upd = [], {}, alb_hid(a), a.get("upd") or {}
    old_pl = False
    root = alb_root() or ""
    wm_bake = alb_wm_bake(a)
    wm = (a.get("wm") or "") if wm_bake else ""
    for pid in idx.get("order", []):
        if pid in hid:
            continue
        m = ph[pid]
        ck = alb_ckey(a, pid, m, root, wm)
        q = alb_q_b64(ck)
        it = {"i": pid, "w": m["w"], "h": m["h"], "n": m["n"], "sz": m["sz"], "x": m["x"], "v": ck[:8], "q": q}
        if m.get("bad"):
            it["raw"] = os.path.splitext(m["n"])[1].lower() in ALB_SHOW
        if m.get("cs"):                                # 色彩空間（sRGB 不寫）、HDR、有沒有相機原始檔
            it["cs"] = m["cs"]
        if m.get("hdr"):
            it["hdr"] = m["hdr"]
        if m.get("rwx") or m.get("rw"):
            it["rw"] = m.get("rwx") or os.path.splitext(m["n"])[1][1:].upper()
        if m.get("vid"):                               # 影片：長度、轉好了沒
            it["vd"] = m["dur"]
            it["vr"] = 0 if m.get("vbad", 0) >= ALB_VV else 1 if alb_vinfo(ck, "v") else -1
        elif m.get("lv") and m.get("vbad", 0) < ALB_VV and alb_vinfo(ck, "m"):
            it["lv"] = 1                               # 原況照片：會動的那段好了
            if m.get("anim"):
                it["gf"] = 1                           # 會動的 GIF、PNG：看大圖時自己一直動
        if m.get("anim") == 2 and not m.get("bad") and not wm_bake:
            it["gf"] = 2                               # 會動的 WebP：瀏覽器自己放（/i/編號/a）
        qa = None if m.get("vid") else alb_qa_get(ck)
        if qa:                                         # 智慧挑照片：分數、長得像不像的指紋
            it["qs"], it["dh"] = qa["s"], qa["h"]
            if "f" in qa:
                it["fs"] = qa["f"]
            if qa.get("fm"):
                it["fm"] = 1
        if pid in talk:
            it.update(talk[pid])
        u = upd.get(pid)
        if alb_up_who(m["n"]):                         # 朋友放的：哪個人的分頁
            it["u"] = alb_up_who(m["n"])
        if u and u.get("f") == m["n"]:                 # 朋友上傳的：誰放的、是不是這支手機放的（可以自己刪）
            it["ub"] = u["n"]
            if th and u.get("by") == th:
                it["um"] = 1
        if alb_other(m):                               # 截圖、網路圖片：收在最後的「其他圖片」，不算進每天、統計、回憶
            it["o"] = 1
        if not it["x"].get("dt") or it.get("o"):
            it["x"] = {**it["x"], "dt": it["x"].get("dt") or time.strftime("%Y:%m:%d %H:%M:%S", time.localtime(m["mt"])), "dtf": 1}
        if a["loc"] and m.get("g") and not alb_up_who(m["n"]):   # 朋友放的照片不給別人看到他的定位
            it["g"] = m["g"]
            pl = alb_place(m["g"][0], m["g"][1])
            if pl:
                it["p"] = {"n": pl["n"], "a": pl.get("a", ""), "c": pl.get("c") or pl["n"], "cc": alb_cc_fix(pl)}
                if pl.get("v", 0) < ALB_PLV and not pl.get("tmp"):
                    old_pl = True
                c = pl.get("c") or pl["n"]
                places[c] = places.get(c, 0) + 1
        out.append(it)
    out = alb_clock(out)
    out.sort(key=lambda it: it.get("o", 0))           # 其他圖片排在最後（其他照原本的順序）
    wx, wx_miss = {}, False
    if a["loc"]:
        for day, g in alb_wx_days(a, idx).items():
            w = alb_wx(g[0], g[1], day)
            if w:
                wx[day] = w
            elif (k := f"w{g[0]:.1f},{g[1]:.1f},{day}") not in alb_places() and day <= time.strftime("%Y%m%d") and time.time() - ALB_WXF.get(k, 0) >= 3600:
                wx_miss = True
    qa_miss = any("qs" not in x and "vd" not in x and "raw" not in x for x in out) and time.time() - ALB_QAK.get(a["id"], 0) > 3600 and alb_ff()
    if qa_miss:                                        # 以前做好的照片還沒打分數（一小時最多補一次，算不出來的不一直重來）
        ALB_QAK[a["id"]] = time.time()
    done_n, tot_n = alb_ready_n(a, idx)
    rdy = 1 if not tot_n else round(done_n / tot_n, 2)
    if rdy < 1 or any(x.get("vr") == -1 for x in out) or qa_miss or (a["loc"] and (old_pl or wx_miss or any("g" in x and "p" not in x for x in out))):
        alb_kick(a["id"])
    wmo = a.get("wm") if a.get("wm") and not wm_bake else ""
    res = {"ok": True, "name": a["name"], "photos": out, "dl": alb_dl(a), "loc": a["loc"], "exp": a["exp"], "es": a.get("es") or a.get("t0", 0), "wmo": wmo, "wx": wx, "intro": a.get("intro", ""), "gb": talk.get(ALB_GB, {}).get("cm", []) if a.get("talk", True) else [],
           "talk": a.get("talk", True), "shy": a.get("shy", True), "snap": bool(a.get("snap")), "mu": bool(idx.get("mu")), "up": alb_up(a),
           "places": [k for k, _ in sorted(places.items(), key=lambda x: -x[1])][:6], "ready": rdy}
    if tot_n and done_n < tot_n:
        res["prep"] = [done_n, tot_n]
    return res


ALB_PHONE = ("apple", "google", "samsung", "xiaomi", "redmi", "poco", "huawei", "honor", "oneplus", "oppo", "vivo", "realme", "motorola", "nothing")


def alb_oz_s(oz):
    m = re.fullmatch(r"([+-])(\d\d):(\d\d)", oz or "")
    return (1 if m.group(1) == "+" else -1) * (int(m.group(2)) * 3600 + int(m.group(3)) * 60) if m else None


def alb_clock(out):
    """相機時間校正：手機的時間會自己對網路，相機常常慢幾分鐘、出國忘了換時區。
    1. 相機和手機拍到很像的畫面（亮暗指紋差 8 格內、3 小時內）至少兩組、差的時間一致（一分鐘內）→ 整台相機照手機調整
    2. 相機有寫時區、跟同一段時間手機的時區不一樣 → 換成手機那邊的當地時間（拍的那一刻本來就對）
    回傳照新時間排好的清單；有調整的照片 x 多一個 dtc：[調了幾秒, 原本的時間, 原本的時區]"""
    rows = []
    for it in out:
        x = it["x"]
        if x.get("dtf") or not x.get("dt"):
            continue
        try:
            t = calendar.timegm(time.strptime(x["dt"][:19], "%Y:%m:%d %H:%M:%S"))
        except ValueError:
            continue
        oz = alb_oz_s(x.get("oz"))
        mk = (x.get("mk") or "").lower().split(" ")[0]
        rows.append((it, t, oz, oz is not None and mk in ALB_PHONE))
    refs = [(t - oz, t, oz, it) for it, t, oz, r in rows if r]
    if not refs:
        return out
    by_u, by_l = sorted(refs, key=lambda r: r[0]), sorted(refs, key=lambda r: r[1])
    ku, kl = [r[0] for r in by_u], [r[1] for r in by_l]
    cams, moved = {}, False
    for row in rows:
        x = row[0]["x"]
        if not row[3] and x.get("mk") and x.get("md") and (x.get("mk") or "").lower().split(" ")[0] not in ALB_PHONE:
            cams.setdefault((x["mk"], x["md"]), []).append(row)
    for lst in cams.values():
        pairs = []
        for it, t, oz, _ in lst:
            if not it.get("dh"):
                continue
            c, (ks, rs) = (t - oz, (ku, by_u)) if oz is not None else (t, (kl, by_l))
            h = int(it["dh"], 16)
            for j in range(bisect.bisect_left(ks, c - 10800), bisect.bisect_right(ks, c + 10800)):
                r = rs[j][3]
                if r.get("dh") and bin(h ^ int(r["dh"], 16)).count("1") <= 8:
                    pairs.append((ks[j] - c, it["i"], r["i"]))
        sh = 0
        if len(pairs) >= 2:
            best = max((sorted(q for q in pairs if abs(q[0] - p[0]) <= 60) for p in pairs), key=len)
            if len(best) >= 2 and len({q[1] for q in best}) >= 2 and len({q[2] for q in best}) >= 2 and len(best) >= .6 * len(pairs):
                sh = int(round((best[(len(best) - 1) // 2][0] + best[len(best) // 2][0]) / 2))   # 中位數
                sh = sh if abs(sh) >= 60 else 0
        for it, t, oz, _ in lst:
            t2, oz2 = t + sh, oz
            if oz is not None:                         # 時區：照同一段時間（12 小時內）最近的那張手機照片
                u = t2 - oz
                j = bisect.bisect_left(ku, u)
                near = min((by_u[k] for k in (j - 1, j) if 0 <= k < len(by_u)), key=lambda r: abs(r[0] - u), default=None)
                if near and abs(near[0] - u) <= 43200 and near[2] != oz:
                    t2, oz2 = u + near[2], near[2]
            elif sh:
                j = bisect.bisect_left(kl, t2)
                near = min((by_l[k] for k in (j - 1, j) if 0 <= k < len(by_l)), key=lambda r: abs(r[1] - t2), default=None)
                oz2 = near[2] if near and abs(near[1] - t2) <= 43200 else None
            if t2 == t and oz2 == oz:
                continue
            x = it["x"]
            nx = {**x, "dt": time.strftime("%Y:%m:%d %H:%M:%S", time.gmtime(t2)), "dtc": [sh, x["dt"], x.get("oz", "")]}
            if oz2 is not None:
                nx["oz"] = f"{'+' if oz2 >= 0 else '-'}{abs(oz2) // 3600:02d}:{abs(oz2) % 3600 // 60:02d}"
            it["x"] = nx
            moved = True
    if moved:
        out.sort(key=lambda it: (it.get("o", 0), it["x"].get("dt") or "", it["n"].lower()))
    return out


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
    """送原圖：定位資料那幾段換成 0（XMP 換成空白，保持格式正常且檔案大小不變）"""
    norm = sorted((int(sp[0]), int(sp[1]), int(sp[2]) if len(sp) > 2 else 0) for sp in spans if sp[1] > 0)
    pos = 0
    for s, n, kind in norm:
        e = min(s + n, total) if total else s + n
        if e <= pos:
            continue
        if s < pos:
            s = pos
        while pos < s:
            b = f.read(min(1 << 20, s - pos))
            if not b:
                return
            out.write(b)
            pos += len(b)
        b = f.read(e - s)
        if not b:
            return
        out.write((b" " if kind == 1 else b"\x00") * len(b))
        pos += len(b)
    shutil.copyfileobj(f, out, 1 << 20)


def alb_file_read(path, start, end):
    with open(path, "rb") as f:
        f.seek(start)
        left = end - start + 1
        while left > 0:
            b = f.read(min(left, 1 << 20))
            if not b:
                return
            left -= len(b)
            yield b


def alb_send_part(h, total, read, ctype, extra=()):
    """影片、音樂：照瀏覽器要的那一段給（iPhone 一定要能這樣要，不然放不出來）"""
    rg = re.fullmatch(r"bytes=(\d*)-(\d*)", (h.headers.get("Range") or "").strip())
    s0, e0, part = 0, total - 1, False
    if rg and (rg[1] or rg[2]):
        if rg[1]:
            s0, e0 = int(rg[1]), min(int(rg[2]) if rg[2] else total - 1, total - 1)
        else:
            s0 = max(0, total - int(rg[2]))
        part = True
        if s0 > e0 or s0 >= total:
            h.send_response(416)
            h.send_header("Content-Range", f"bytes */{total}")
            h.send_header("Content-Length", "0")
            h.end_headers()
            return True
    h.send_response(206 if part else 200)
    h.send_header("Content-Type", ctype)
    h.send_header("Content-Length", str(e0 - s0 + 1))
    h.send_header("Accept-Ranges", "bytes")
    if part:
        h.send_header("Content-Range", f"bytes {s0}-{e0}/{total}")
    h.send_header("Cache-Control", "private, max-age=86400")
    h.send_header("X-Content-Type-Options", "nosniff")
    h.send_header("X-Frame-Options", "DENY")
    h.send_header("Referrer-Policy", "no-referrer")
    for k, v in extra:
        h.send_header(k, v)
    h.end_headers()
    try:
        for b in read(s0, e0):
            h.wfile.write(b)
    except (BrokenPipeError, ConnectionResetError, OSError, ValueError):
        pass
    return True


ALB_FONTS = {"/a/seed-rg.woff2": "web/seed-rg.woff2", "/a/seed-bd.woff2": "web/seed-bd.woff2"}   # 相簿用的 LINE Seed TW（SIL OFL，常用字），主機自己給
ALB_FONTB = {}


def alb_http(h, method):
    """/a/十碼 開頭的網址；回傳 True 表示處理好了"""
    path = urllib.parse.urlsplit(h.path).path
    if path in ALB_FONTS and method == "GET":
        if path not in ALB_FONTB:
            try:
                with open(os.path.join(HERE, ALB_FONTS[path]), "rb") as fh:
                    ALB_FONTB[path] = fh.read()
            except OSError:
                ALB_FONTB[path] = b""
        b = ALB_FONTB[path]
        return (h.send(200, b, "font/woff2", cache=30 * 86400) if b else h.send(404, '{"error":"找不到"}')) or True
    if path == "/a/album.css" and method == "GET":
        b, _ = alb_asset("web/album.css")
        return (h.send(200, b, "text/css; charset=utf-8", cache=30 * 86400, etag=True) if b else h.send(404, '{"error":"找不到"}')) or True
    if path == "/a/album.js" and method == "GET":
        b, _ = alb_asset("web/album.js")
        return (h.send(200, b, "text/javascript; charset=utf-8", cache=30 * 86400, etag=True) if b else h.send(404, '{"error":"找不到"}')) or True
    if path == "/a/sw.js" and method == "GET":         # 在看的人的瀏覽器裡解開加密的照片
        b, _ = alb_asset("web/album-sw.js")
        return (h.send(200, b, "text/javascript; charset=utf-8", etag=True) if b else h.send(404, '{"error":"找不到"}')) or True
    if path in ALB_ICONS and method == "GET":
        b, ct = ALB_ICONS[path]
        return h.send(200, b, ct, cache=True) or True
    m = re.fullmatch(r"/a/([A-Za-z0-9]{10})(/.*)?", path)
    if not m:
        return False
    code, rest = m[1], m[2] or ""
    if rest == "" and method == "GET":
        return h.send(200, alb_page(h, code), "text/html; charset=utf-8", csp=ALB_CSP, etag=True) or True
    if method == "POST" and (h.headers.get("Sec-Fetch-Site") or "") in ("cross-site", "same-site"):
        return h.send(403, '{"ok":false,"message":"只能從相簿頁面送出"}') or True   # 別的網站假冒朋友送東西（通行證已經是 SameSite=Strict，這裡再擋一層）
    a = alb_find(code)
    if not a:
        time.sleep(1)
        return h.send(404, json.dumps({"ok": False, "gone": True}), cache=False) or True
    if rest == "/open" and method == "POST":
        ip, now = h.client_ip(), time.time()
        key = (a["id"], ip)
        with ALB_LOCK:
            tries = [t for t in ALB_FAILS.get(key, []) if now - t < ALB_PW_TRY[1]]
            if len(tries) >= ALB_PW_TRY[0]:
                ALB_FAILS[key] = tries
                left = int(ALB_PW_TRY[1] - (now - tries[0])) // 60 + 1
                return h.send(429, json.dumps({"ok": False, "message": f"錯太多次，{left} 分鐘後再試"}, ensure_ascii=False)) or True
            tries.append(now)                              # 先記一次再驗證：防止同一瞬間並發繞過 5 次上限
            ALB_FAILS[key] = tries
            if len(ALB_FAILS) > 5000:
                for k in [k for k, v in ALB_FAILS.items() if not v or now - v[-1] >= ALB_PW_TRY[1]]:
                    ALB_FAILS.pop(k, None)
        raw = h.read_body(1024)
        if raw is None:
            return h.send(400, '{"ok":false,"message":"請求格式不對"}') or True
        pw = h.jbody(raw).get("pw")
        if not alb_pw_ok(a, pw):
            time.sleep(1)
            return h.send(401, json.dumps({"ok": False, "message": "密碼不對"}, ensure_ascii=False)) or True
        with ALB_LOCK:
            ALB_FAILS.pop(key, None)
        exp = now + ALB_COOKIE_H * 3600
        if a.get("exp"):
            exp = min(exp, a["exp"])
        h.send_response(200)
        h.send_header("Content-Type", "application/json")
        h.send_header("Cache-Control", "no-store")
        h.send_header("X-Content-Type-Options", "nosniff")
        h.send_header("X-Frame-Options", "DENY")
        h.send_header("Referrer-Policy", "no-referrer")
        h.send_header("Set-Cookie", f"{alb_cookie_name(a)}={alb_cookie_val(a, exp)}; Path=/a/{code}; Max-Age={int(exp - now)}; HttpOnly; SameSite=Strict"
                      + ("; Secure" if h.https() else ""))
        h.send_header("Content-Length", "11")
        h.end_headers()
        h.wfile.write(b'{"ok":true}')
        return True
    if rest == "/talk" and method == "POST":          # 朋友按愛心、留言
        if not a.get("talk", True):
            return h.send(403, '{"ok":false}') or True
        ok, why, _ = alb_dev_check(h, a, False)
        tok = alb_dev_tok(h, a)
        if not (alb_cookie_ok(h, a) and ok and tok):
            return h.send(403, json.dumps({"ok": False, "message": "重新打開相簿再試"}, ensure_ascii=False)) or True
        raw = h.read_body(4096)
        if raw is None:
            return h.send(400, '{"ok":false,"message":"請求格式不對"}') or True
        code2, out = alb_talk_post(a, alb_dev_hash(tok), h.jbody(raw))
        return h.send(code2, json.dumps(out, ensure_ascii=False), cache=False) or True
    if rest == "/di" and method == "POST":             # 這台是什麼設備（型號、系統、瀏覽器、螢幕）
        tok = alb_dev_tok(h, a)
        ok, _, _ = alb_dev_check(h, a, False)
        if not (tok and alb_cookie_ok(h, a) and ok):
            return h.send(403, '{"ok":false}', cache=False) or True
        raw = h.read_body(1024)
        if raw is None:
            return h.send(400, '{"ok":false}', cache=False) or True
        ok = alb_dev_info(a, alb_dev_hash(tok), h.jbody(raw))
        return h.send(200 if ok else 400, json.dumps({"ok": ok}), cache=False) or True
    if rest == "/snap" and method == "POST":           # 朋友按了截圖鍵：主人開了「截圖就鎖住」就鎖住這支手機
        tok = alb_dev_tok(h, a)
        if not (a.get("snap") and tok and alb_cookie_ok(h, a)):
            return h.send(200, '{"ok":true,"lock":false}', cache=False) or True
        locked = alb_snap_lock(a, alb_dev_hash(tok))
        return h.send(200 if locked else 403, json.dumps({"ok": locked, "lock": locked}), cache=False) or True
    if rest == "/up" and method == "POST":             # 朋友上傳照片、影片；或刪掉自己放的
        if (h.headers.get("Content-Type") or "").startswith("application/json"):
            code2, out = alb_up_del(h, a)
        else:
            code2, out = alb_upload(h, a, code)
        return h.send(code2, json.dumps(out, ensure_ascii=False), cache=False) or True
    if method != "GET":
        return h.send(404, '{"error":"找不到"}') or True
    own = bool(re.fullmatch(r"/i/[0-9a-f]{12}/[slqvmd]", rest)) and alb_own_ok(h, a)   # 主人挑照片
    if not own and not alb_cookie_ok(h, a):
        return h.send(401, json.dumps({"ok": False, "pw": True}), cache=False) or True
    if not own:
        ok, why, new = alb_dev_check(h, a, rest == "/m")
        if not ok:
            return h.send(403, json.dumps({"ok": False, why: True}), cache=False) or True
        sec = "; Secure" if h.https() else ""
        if rest == "/m":
            extra = [("Set-Cookie", f"vsad_{a['id']}={new}; Path=/a/{code}; Max-Age={400 * 86400}; HttpOnly; SameSite=Strict" + sec)] if new else []
            th = alb_dev_hash(new or alb_dev_tok(h, a))
            if "pl=1" in (urllib.parse.urlsplit(h.path).query or "") and alb_webview(h):     # 只有真的不支援背景解密的 App 內建瀏覽器（像 LINE）才允許降級
                extra.append(("Set-Cookie", f"vsap_{a['id']}={alb_pl_val(a, th)}; Path=/a/{code}; Max-Age={400 * 86400}; HttpOnly; SameSite=Strict" + sec))
            elif f"vsap_{a['id']}=" in (h.headers.get("Cookie") or ""):
                extra.append(("Set-Cookie", f"vsap_{a['id']}=; Path=/a/{code}; Max-Age=0; HttpOnly; SameSite=Strict" + sec))
            return h.send(200, json.dumps(alb_manifest(a, th), ensure_ascii=False, separators=(",", ":")), extra=extra) or True
    if rest == "/k" and not own:                       # 這支手機解開照片的鑰匙（album-sw.js 來拿）
        sfs = h.headers.get("Sec-Fetch-Site") or ""
        sfd = h.headers.get("Sec-Fetch-Dest") or ""
        sfm = h.headers.get("Sec-Fetch-Mode") or ""
        if (sfs and sfs != "same-origin") or sfd == "document" or sfm == "navigate":
            return h.send(403, '{"error":"不能直接存取"}', cache=False) or True
        th, ep = alb_th(h, a), alb_key_ep()
        return h.send(200, json.dumps({"k": base64.b64encode(alb_ekey(a, th, ep)).decode(), "id": alb_kid(th, ep)}), cache=False) or True
    if rest == "/music":                               # 幻燈片的背景音樂（資料夾裡的那首歌）
        if not own and not alb_media_ok(h, a):
            return h.send(403, '{"error":"只能在相簿頁面播放"}', cache=False) or True
        mu = alb_index(a, scan=False).get("mu")
        p = alb_path(a["dir"])
        src = os.path.join(p, mu["n"]) if mu and p else ""
        try:
            st = os.stat(src)
        except OSError:
            return h.send(404, '{"error":"找不到"}') or True
        ext = os.path.splitext(src)[1].lower()
        ct = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".opus": "audio/ogg",
              ".flac": "audio/flac", ".wav": "audio/wav"}.get(ext, "application/octet-stream")
        return alb_send_part(h, st.st_size, lambda s0, e0: alb_file_read(src, s0, e0), ct)
    m = re.fullmatch(r"/t/(\d{1,2})/(\d{1,6})/(\d{1,6})", rest)
    if m:                                              # 地圖底圖：主機幫忙拿 OpenStreetMap 的圖塊（朋友不用連外面、不用金鑰）
        z, x, y = int(m[1]), int(m[2]), int(m[3])
        if not a["loc"] or not alb_tile_ok(a, z, x, y):
            return h.send(404, '{"error":"找不到"}') or True
        b = alb_tile(z, x, y)
        if not b:
            return h.send(404, '{"error":"找不到"}') or True
        h.send_response(200)
        h.send_header("Content-Type", "image/png")
        h.send_header("Content-Length", str(len(b)))
        h.send_header("Cache-Control", "private, max-age=604800")
        h.send_header("X-Content-Type-Options", "nosniff")
        h.send_header("X-Frame-Options", "DENY")
        h.send_header("Referrer-Policy", "no-referrer")
        h.end_headers()
        try:
            h.wfile.write(b)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        return True
    m = re.fullmatch(r"/i/([0-9a-f]{12})/([slqovmaxdy])", rest)
    if m:
        pid, kind = m[1], m[2]
        idx = alb_index(a, scan=False)
        meta = (idx.get("ph") or {}).get(pid)
        if not meta or (pid in alb_hid(a) and not own):
            return h.send(404, '{"error":"找不到"}') or True
        if kind == "a":                                # 會動的 WebP：原本的動畫（拿掉 EXIF、XMP；有浮水印時不給無浮水印原檔）
            p = alb_path(a["dir"])
            if meta.get("anim") != 2 or alb_wm_bake(a) or not p or meta.get("sz", 0) > 64 << 20:
                return h.send(404, '{"error":"找不到"}') or True
            try:
                b = alb_webp_clean(os.path.join(p, meta["n"]))
            except OSError:
                return h.send(404, '{"error":"找不到"}') or True
            return alb_img_out(h, a, b, "image/webp", "private, max-age=86400", own)
        dlm = alb_dl(a)
        vk = "v" if kind == "v" and meta.get("vid") else "m" if kind == "m" and meta.get("lv") else ""
        if kind == "o" and meta.get("vid") and (dlm == 1 or not a["loc"] or alb_up_who(meta["n"])):   # 影片只給壓縮的（定位也一起拿掉了）
            vk = "v"
        if vk or kind in ("v", "m"):
            if kind != "o" and not own and not alb_media_ok(h, a):
                return h.send(403, '{"error":"只能在相簿頁面播放"}', cache=False) or True
            ck = alb_ckey(a, pid, meta)
            info = alb_vinfo(ck, vk) if vk else None
            if not info:
                return h.send(202 if vk and meta.get("vbad", 0) < ALB_VV else 404, json.dumps({"ok": False, "wait": True}), cache=False) or True
            if kind == "o" and not dlm:
                return h.send(403, '{"error":"不能下載"}') or True
            extra = [("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(os.path.splitext(os.path.basename(meta["n"]))[0] + ".mp4"))] if kind == "o" else []
            return alb_send_part(h, info["sz"], lambda s0, e0: alb_vread(ck, vk, s0, e0), "video/mp4", extra)
        strip_loc = not a["loc"] or bool(alb_up_who(meta["n"]))
        if kind == "o" and (dlm == 1 or (strip_loc and meta.get("rw") and meta.get("g"))) and not meta.get("bad"):   # 只給壓縮圖；或藏起地點時的 RAW 檔改給無定位大圖
            b, _ = alb_get(a, pid, "l", meta=meta)
            if not b:
                return h.send(404, '{"error":"找不到"}') or True
            fn = os.path.splitext(os.path.basename(meta["n"]))[0] + ".jpg"
            return h.send(200, b, "image/jpeg", extra=[("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(fn))]) or True
        if kind == "o" or meta.get("bad"):            # 原圖（下載；或做不出小圖時直接看）
            if dlm < 2:                                # 不給原圖的相簿一律不給（做不出小圖的也一樣）
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
                if kind != "o" and ALB_E and not own and st.st_size <= 64 << 20 and ext in ALB_SHOW:   # 做不出小圖、直接看原圖：一樣加密
                    buf = io.BytesIO()
                    try:
                        cleaned = alb_clean_orig(src, ext, st.st_size) if strip_loc else None
                        if cleaned is not None:
                            buf.write(cleaned)
                        elif not strip_loc or not meta.get("gs"):
                            shutil.copyfileobj(f, buf, 1 << 20)
                        else:
                            alb_strip_gps(f, meta["gs"], buf, st.st_size)
                    except OSError:
                        return h.send(404, '{"error":"找不到"}') or True
                    ct0 = {".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif"}.get(ext, "image/jpeg")
                    return alb_img_out(h, a, buf.getvalue(), ct0, "private, max-age=3600")
                ct = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
                      ".heic": "image/heic", ".heif": "image/heif", ".avif": "image/avif", ".mp4": "video/mp4", ".m4v": "video/mp4",
                      ".mov": "video/quicktime", ".webm": "video/webm"}.get(ext, "application/octet-stream")
                cleaned = alb_clean_orig(src, ext, st.st_size) if strip_loc else None
                h.send_response(200)
                h.send_header("Content-Type", ct)
                h.send_header("Content-Length", str(len(cleaned) if cleaned is not None else st.st_size))
                h.send_header("Cache-Control", "private, max-age=3600")
                h.send_header("X-Content-Type-Options", "nosniff")
                h.send_header("X-Frame-Options", "DENY")
                h.send_header("Referrer-Policy", "no-referrer")
                h.send_header("Content-Security-Policy", "sandbox")
                if kind == "o":
                    h.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(os.path.basename(meta["n"])))
                h.end_headers()
                try:
                    if cleaned is not None:
                        h.wfile.write(cleaned)
                    elif not strip_loc or not meta.get("gs"):   # 朋友放的一律拿掉定位
                        shutil.copyfileobj(f, h.wfile, 1 << 20)
                    else:
                        alb_strip_gps(f, meta["gs"], h.wfile, st.st_size)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    pass
            return True
        sdr = kind in ("d", "y")                       # d／y：大圖 l／清晰版 x 不帶增益圖（安卓沒開 HDR 時用）
        b, _ = alb_get(a, pid, {"d": "l", "y": "x"}.get(kind, kind), meta=meta)
        if not b:
            return h.send(404, '{"error":"找不到"}') or True
        return alb_img_out(h, a, pic_sdr(b) if sdr else b, "image/jpeg", own=own)
    if rest == "/zip":                                 # 全部打包（不壓縮，邊讀邊送；只給壓縮圖的打包大圖）
        dlm = alb_dl(a)
        if not dlm:
            return h.send(403, '{"error":"不能下載"}') or True
        idx = alb_index(a, scan=False)
        p = alb_path(a["dir"])
        if not p:
            return h.send(404, '{"error":"找不到"}') or True
        pick = None                                    # 勾選下載：只打包這幾個
        ids = (urllib.parse.parse_qs(urllib.parse.urlsplit(h.path).query).get("ids") or [""])[0]
        if ids:
            pick = {x for x in ids.split(",") if re.fullmatch(r"[0-9a-f]{12}", x)}
            if not pick or len(pick) > ALB_ZIP_MAX:
                return h.send(400, '{"error":"選太多了"}') or True
        if not ALB_ZIP_GATE.acquire(blocking=False):
            return h.send(429, '{"error":"太多人正在打包下載，等一下再試"}') or True
        try:
            h.close_connection = True
            h.send_response(200)
            h.send_header("Content-Type", "application/zip")
            h.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(a["name"] + ".zip"))
            tk = (urllib.parse.parse_qs(urllib.parse.urlsplit(h.path).query).get("t") or [""])[0]
            if re.fullmatch(r"[a-z0-9]{8}", tk):       # 網頁的「準備中」看到這個記號就知道開始下載了
                h.send_header("Set-Cookie", f"vsadl={tk}; Path=/a/; Max-Age=120; SameSite=Lax")
            h.send_header("Cache-Control", "no-store")
            h.send_header("X-Content-Type-Options", "nosniff")
            h.send_header("X-Frame-Options", "DENY")
            h.send_header("Referrer-Policy", "no-referrer")
            h.send_header("Connection", "close")
            h.end_headers()
            try:
                with zipfile.ZipFile(h.wfile, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
                    hid = alb_hid(a)
                    for pid in idx.get("order", []):
                        meta = idx["ph"][pid]
                        if pid in hid or (pick is not None and pid not in pick) or (dlm < 2 and meta.get("bad")):
                            continue
                        strip_loc = not a["loc"] or bool(alb_up_who(meta["n"]))
                        if meta.get("vid") and (dlm == 1 or strip_loc):   # 影片：壓縮過、沒有定位的那份
                            ck = alb_ckey(a, pid, meta)
                            info = alb_vinfo(ck, "v")
                            if info:
                                with z.open(zipfile.ZipInfo(os.path.splitext(meta["n"])[0] + ".mp4", time.localtime(meta["mt"])[:6]), "w", force_zip64=True) as w:
                                    for b in alb_vread(ck, "v", 0, info["sz"] - 1):
                                        w.write(b)
                            continue
                        if dlm == 1 or (strip_loc and meta.get("rw") and meta.get("g")):
                            b, _ = alb_get(a, pid, "l", meta=meta)
                            if b:
                                z.writestr(zipfile.ZipInfo(os.path.splitext(meta["n"])[0] + ".jpg", time.localtime(meta["mt"])[:6]), b)
                            continue
                        src = os.path.join(p, meta["n"])
                        try:
                            zi = zipfile.ZipInfo(meta["n"], time.localtime(meta["mt"])[:6])
                            ext = os.path.splitext(meta["n"])[1].lower()
                            with open(src, "rb") as f, z.open(zi, "w", force_zip64=True) as w:
                                cleaned = alb_clean_orig(src, ext, meta.get("sz", 0)) if strip_loc else None
                                if cleaned is not None:
                                    w.write(cleaned)
                                elif not strip_loc or not meta.get("gs"):   # 朋友放的一律拿掉定位
                                    shutil.copyfileobj(f, w, 1 << 20)
                                else:
                                    alb_strip_gps(f, meta["gs"], w, meta["sz"])
                        except (FileNotFoundError, PermissionError):
                            continue
            except (BrokenPipeError, ConnectionResetError, OSError, ValueError):
                pass
        finally:
            ALB_ZIP_GATE.release()
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
    if act in ("talk", "talkdel"):                     # 主人看朋友的留言、刪掉
        a = alb_all().get(str(d.get("id") or ""))
        if not a:
            return 400, {"ok": False, "message": "這本已經收回了"}
        with ALB_LOCK:
            t = alb_talk_all().get(a["id"]) or {}
            if act == "talkdel":
                x = t.get(str(d.get("i") or ""))
                if x:
                    x["c"] = [c for c in x.get("c") or [] if c["id"] != d.get("cid")]
                    alb_talk_save()
            snap = [(q, list(x.get("c") or []), len(x.get("l") or [])) for q, x in t.items()]
        idx = alb_index(a, scan=False)
        ph = idx.get("ph") or {}
        root, wm = alb_root() or "", (a.get("wm") or "") if alb_wm_bake(a) else ""
        out = sorted(({"i": q, "v": alb_ckey(a, q, ph[q], root, wm)[:8] if q in ph else "", "id": c["id"], "n": c["n"], "s": c["s"], "t": int(c["t"]), **({"gb": True} if q == ALB_GB else {})}
                      for q, cs, _ in snap if q in ph or q == ALB_GB for c in cs), key=lambda c: -c["t"])
        likes = sorted(((nl, q) for q, _, nl in snap if q in ph and nl), reverse=True)[:12]
        return 200, {"ok": True, "c": out, "likes": [{"i": q, "v": alb_ckey(a, q, ph[q], root, wm)[:8], "n": n} for n, q in likes],
                     "own": alb_own_val(a, time.time() + ALB_OWN_S), "base": alb_base(), "code": a["code"]}
    if act in ("photos", "devs"):
        a = alb_all().get(str(d.get("id") or ""))
        if not a:
            return 400, {"ok": False, "message": "這本已經收回了"}
        if act == "devs":                              # 看過的手機
            devs = a.get("devs") or {}
            lk = a.get("lock") or {}
            return 200, {"ok": True, "dev": a.get("dev") or 0, "devs": [{"h": k, **v, **({"lk": lk[k]} if k in lk else {})} for k, v in sorted(devs.items(), key=lambda x: (x[0] not in lk, -x[1].get("t", 0)))]}
        idx = alb_index(a)                             # 挑照片：小圖用短時間的通行證看
        hid, out, pend, upd = set(a.get("hide") or []), [], set(a.get("pend") or []), a.get("upd") or {}
        root, wm = alb_root() or "", (a.get("wm") or "") if alb_wm_bake(a) else ""
        for pid in idx.get("order", []):
            m = idx["ph"][pid]
            ck = alb_ckey(a, pid, m, root, wm)
            out.append({"i": pid, "w": m["w"], "h": m["h"], "v": ck[:8], "q": alb_q_b64(ck), "hid": pid in hid, "vd": m.get("dur") if m.get("vid") else 0,
                        "pend": pid in pend, "u": alb_up_who(m["n"]), "ub": (upd.get(pid) or {}).get("n", "") if (upd.get(pid) or {}).get("f") == m["n"] else ""})
        return 200, {"ok": True, "photos": out, "own": alb_own_val(a, time.time() + ALB_OWN_S), "base": alb_base(), "code": a["code"]}
    return 200, alb_list()
