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
ALB_VID = {".mp4", ".mov", ".m4v", ".webm", ".3gp", ".mkv"}        # 影片（主機轉成 720p 的 H.264 給朋友看）
ALB_AUD = {".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".wav"}   # 資料夾裡放一首歌：幻燈片的背景音樂
ALB_VMAX = 20 * 60                                                # 影片最長幾秒（太長的不放）
ALB_LIVE = 3.6                                                    # 跟照片同名、這麼短的影片算原況照片會動的那段
ALB_VCH = 1 << 20                                                 # 影片分段加密，每段 1 MB（拖進度條只解要的那幾段）
ALB_TALK = os.path.join(DATA_DIR, "album-talk.json")              # 朋友的愛心、留言（加密，SEAL_FILES；跟著備份）
ALB_TALK_MAX = (300, 20, 200, 3000)                               # 一則留言幾個字、名字幾個字、一張最多幾則、一本最多幾則
ALB_TIMES = (86400, 7 * 86400, 30 * 86400, 0)                     # 能選的期限（0 = 不會過期）
ALB_MAX = 2000                                                    # 一本最多幾張
ALB_PW_TRY = (5, 15 * 60)                                         # 同一個來源 15 分鐘錯 5 次先鎖住
ALB_COOKIE_H = 12                                                 # 輸對密碼後這個瀏覽器能看幾小時
ALB_DEVS = (0, 1, 3)                                              # 幾支手機能看（0 = 不限）
ALB_DEVKEEP = 60                                                  # 看過的手機最多記幾支
ALB_DLS = (0, 1, 2)                                               # 下載：不給、只給壓縮圖、給原圖
ALB_OWN_S = 900                                                   # 主人挑照片時看小圖的通行證（15 分鐘）
ALB_LOCK = threading.Lock()
ALB_FAILS = {}                                                    # (相簿, 來源) → [輸錯的時間…]
ALB = {"d": None, "q": [], "ff": None, "busy": set(), "geo_t": 0, "talk": None, "tpost": {}}
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
    out = {}
    for pid, t in (alb_talk_all().get(a["id"]) or {}).items():
        out[pid] = {"lk": len(t.get("l") or []), "me": th in (t.get("l") or []),
                    "cm": [{"id": c["id"], "n": c["n"], "s": c["s"], "t": int(c["t"]), "me": c["d"] == th} for c in t.get("c") or []]}
    return out


def alb_clean_txt(s, n):
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]", " ", str(s or ""))).strip()[:n]


def alb_talk_post(a, th, d):
    """朋友按愛心、留言、刪自己的留言；回傳 (狀態碼, 內容)"""
    pid = str(d.get("i") or "")
    idx = alb_index(a, scan=False)
    if pid not in (idx.get("order") or []) or pid in (a.get("hide") or []):
        return 404, {"ok": False, "message": "找不到這張"}
    now = time.time()
    with ALB_LOCK:
        talk = alb_talk_all()
        t = talk.setdefault(a["id"], {}).setdefault(pid, {"l": [], "c": []})
        if d.get("like") is not None:
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
            if now - ALB["tpost"].get((a["id"], th), 0) < 3:
                return 429, {"ok": False, "message": "慢一點，等幾秒再留"}
            ALB["tpost"][(a["id"], th)] = now
            if len(ALB["tpost"]) > 5000:
                ALB["tpost"].clear()
            cs = t.setdefault("c", [])
            cs.append({"id": secrets.token_hex(4), "d": th, "n": name, "s": txt, "t": now})
            del cs[:-ALB_TALK_MAX[2]]
            alls = sorted(((c["t"], q) for q, x in talk[a["id"]].items() for c in x.get("c") or []))
            for _, q in alls[:max(0, len(alls) - ALB_TALK_MAX[3])]:   # 整本太多：最早的先拿掉
                talk[a["id"]][q]["c"].pop(0)
            all_ = alb_all()                               # 名字記在看過的手機上（主人看得到是誰）
            dv = (all_.get(a["id"]) or {}).get("devs", {}).get(th)
            if dv is not None and dv.get("nm") != name:
                dv["nm"] = name
                alb_save(all_)
        alb_talk_save()
    return 200, {"ok": True, **alb_talk_of(a, th).get(pid, {"lk": 0, "me": False, "cm": []})}


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
                 ("EdgA/", "Edge"), ("Edg/", "Edge"), ("SamsungBrowser", "三星瀏覽器"), ("Firefox/", "Firefox"), ("FxiOS", "Firefox"),
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


def alb_dev_check(h, a, register):
    """這支手機能不能看；register＝打開相簿那一下（要記下來、可能佔一個名額）。回傳 (能不能看, 原因, 要給的新 cookie)"""
    tok, new = alb_dev_tok(h, a), ""
    lim = a.get("dev") or 0
    if not tok:
        if not register:
            return lim == 0, "full", ""
        tok = new = secrets.token_hex(16)
    th = alb_dev_hash(tok)
    if th in (a.get("ban") or []):
        return False, "ban", ""
    if not register:
        return lim == 0 or th in (a.get("devs") or {}), "full", ""
    now = time.time()
    with ALB_LOCK:
        all_ = alb_all()
        b = all_.get(a["id"])
        if not b:
            return False, "gone", ""
        devs = b.setdefault("devs", {})
        d = devs.get(th)
        if not d:
            if lim and len(devs) >= lim:
                return False, "full", ""
            d = devs[th] = {"n": alb_ua_name(h.headers.get("User-Agent")), "t0": now, "t": 0, "c": 0}
            if len(devs) > ALB_DEVKEEP:
                for k in sorted(devs, key=lambda x: devs[x].get("t", 0))[:len(devs) - ALB_DEVKEEP]:
                    devs.pop(k, None)
        if now - d.get("t", 0) > 1800:                 # 半小時內同一支再打開不重算
            d["c"] = d.get("c", 0) + 1
            b["views"] = b.get("views", 0) + 1
        d["t"] = b["last"] = now
        try:
            alb_save(all_)
        except OSError:
            pass
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
                if e.name.startswith(".") or os.path.splitext(e.name)[1].lower() not in ALB_EXT | ALB_VID:
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
         "t0": now, "loc": d.get("loc", True) is not False, "dl": alb_dl({"dl": d.get("dl", 2)}), "views": 0, "last": 0,
         "k": secrets.token_hex(16), "dev": d.get("dev") if d.get("dev") in ALB_DEVS else 0, "devs": {}, "ban": [], "hide": [],
         "wm": alb_clean_wm(d.get("wm")), "talk": d.get("talk", True) is not False}
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
        if "loc" in d:
            a["loc"] = bool(d["loc"])
        if "talk" in d:
            a["talk"] = bool(d["talk"])
        if "dl" in d:
            a["dl"] = alb_dl({"dl": d["dl"]})
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
            regen = wm != (a.get("wm") or "")
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
        alb_save(all_)
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
        hid = set(a.get("hide") or [])
        out.append({"id": a["id"], "code": a["code"], "name": a["name"], "dir": a["dir"], "exp": a["exp"], "t0": a["t0"],
                    "pw": bool(a.get("pw")), "loc": a["loc"], "dl": alb_dl(a), "views": a.get("views", 0), "last": a.get("last", 0),
                    "n": len([x for x in ph if x not in hid]), "all": len(ph), "cv": alb_cover(a, idx), "ready": alb_ready(a, idx),
                    "dev": a.get("dev") or 0, "ndev": len(a.get("devs") or {}), "wm": a.get("wm") or "", "wmok": not a.get("wm") or alb_wm_bake(a),
                    "talk": a.get("talk", True), "mu": (idx.get("mu") or {}).get("n", ""),
                    "nv": len([x for x in ph if x not in hid and (idx.get("ph") or {}).get(x, {}).get("vid")]),
                    "nlk": sum(len(t.get("l") or []) for t in (alb_talk_all().get(a["id"]) or {}).values()),
                    "ncm": sum(len(t.get("c") or []) for t in (alb_talk_all().get(a["id"]) or {}).values())})
    return {"ok": True, "list": out, "base": alb_base(), "cloud": bool(alb_root()), "times": ALB_TIMES}


def alb_cover(a, idx):
    """主人清單的封面：直接帶小圖（有密碼的相簿用連結會被擋；別台主機也不用另外連）"""
    hid = set(a.get("hide") or [])
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


def alb_vmeta(path):
    """影片的資訊：交給 ffmpeg 讀檔頭（長度、大小、轉向、拍攝時間、地點、哪支手機）"""
    info = alb_ff_info(path)
    m = re.search(r"Duration: (\d+):(\d\d):(\d\d(?:\.\d+)?)", info)
    v = re.search(r"Stream #[^\n]*Video: [^\n]*?, (\d{2,5})x(\d{2,5})[ ,\[]", info)
    if not (m and v):
        return {"w": 4, "h": 3, "x": {}, "g": None, "ori": 1, "gs": [], "vid": 1, "dur": 0, "bad": 1}
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
            t = datetime(*map(int, d.groups()), tzinfo=timezone.utc).astimezone()
            x["dt"] = t.strftime("%Y:%m:%d %H:%M:%S")
    for k, pat in (("mk", r"com\.apple\.quicktime\.make\s*:\s*([^\n]+)"), ("md", r"com\.apple\.quicktime\.model\s*:\s*([^\n]+)"),
                   ("sw", r"com\.apple\.quicktime\.software\s*:\s*([^\n]+)")):
        mm = re.search(pat, info)
        if mm:
            x[k] = mm[1].strip()[:60]
    g = None
    loc = re.search(r"(?:com\.apple\.quicktime\.location\.ISO6709|location)\s*:\s*([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?", info)
    if loc:
        lat, lon = float(loc[1]), float(loc[2])
        if -90 <= lat <= 90 and -180 <= lon <= 180 and (lat or lon):
            g = [round(lat, 6), round(lon, 6), round(float(loc[3]), 1) if loc[3] else None, None]
    return {"w": w, "h": h, "x": x, "g": g, "ori": 1, "gs": [], "vid": 1, "dur": round(dur, 2)}


def alb_meta(path):
    """一張照片的資訊：{w, h, x: 相機資訊, g: [緯度, 經度, 高度, 方向], ori, tx: EXIF 在檔案裡的位置, gs: 定位資料的位置}"""
    ext = os.path.splitext(path)[1].lower()
    if ext in ALB_VID:
        return alb_vmeta(path)
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
    # 原況照片：跟照片同名的短影片掛在照片上（不另外列）
    stems = {os.path.splitext(m["n"])[0].lower(): pid for pid, m in ph.items() if not m.get("vid")}
    for pid, m in ph.items():
        if m.get("vid"):
            of = stems.get(os.path.splitext(m["n"])[0].lower()) if 0 < m.get("dur", 0) <= ALB_LIVE else None
            if m.get("of") != of:
                m["of"] = of
                changed = True
    for pid, m in ph.items():
        if not m.get("vid"):
            lv = next(({"n": v["n"], "sz": v["sz"], "mt": v["mt"]} for v in ph.values() if v.get("of") == pid), None)
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
        show = [i for i in ph if not ph[i].get("of") and not (ph[i].get("vid") and not 0 < ph[i].get("dur", 0) <= ALB_VMAX)]
        idx = {"ph": ph, "order": sorted(show, key=key), "mu": mu}
        os.makedirs(ALB_CACHE, mode=0o700, exist_ok=True)
        sec_dump(fn, idx)
    return idx


def alb_music_in(p):
    """資料夾裡第一首歌（照檔名排）：幻燈片的背景音樂"""
    try:
        with os.scandir(p) as it:
            songs = sorted((e.name, e.stat(follow_symlinks=False).st_size) for e in it
                           if not e.name.startswith(".") and os.path.splitext(e.name)[1].lower() in ALB_AUD and e.is_file(follow_symlinks=False))
    except OSError:
        return None
    return {"n": songs[0][0], "sz": songs[0][1]} if songs else None


def alb_ckey(a, pid, m):
    root = alb_root() or ""
    wm = (a.get("wm") or "") if alb_wm_bake(a) else ""
    return hashlib.sha256(f"{root}/{a['dir']}/{m['n']}|{m['sz']}|{m['mt']}|2048|{wm}".encode()).hexdigest()[:24]


def alb_cfile(ck, kind):
    return os.path.join(ALB_CACHE, f"{ck}-{kind}.jpg")


def alb_ready(a, idx=None):
    idx = idx or alb_index(a, scan=False)
    ph = idx.get("ph") or {}
    if not ph:
        return 1
    order = idx.get("order") or []
    if not order:
        return 1
    done = sum(1 for pid in order if ph[pid].get("bad") or os.path.exists(alb_cfile(alb_ckey(a, pid, ph[pid]), "s")))
    return round(done / len(order), 2)


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
    try:
        r = subprocess.run(["nice", "-n", "15", *cmd, "-hide_banner", "-nostdin", "-i", s2], capture_output=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return ""
    return r.stderr.decode("utf-8", "replace")


def alb_make(a, pid, m):
    """做大圖（長邊 2048）、小圖（高 480）、模糊預覽（寬 24）；不留任何 EXIF"""
    p = alb_path(a["dir"])
    if not p:
        return False
    ck = alb_ckey(a, pid, m)
    if os.path.exists(alb_cfile(ck, "s")):
        return True
    src = os.path.join(p, m["n"])
    ext = os.path.splitext(m["n"])[1].lower()
    rot = ALB_ROT.get(m.get("ori", 1), "") if ext in (".jpg", ".jpeg") else ""
    pre = ["-ss", f"{min(1.0, m.get('dur', 0) / 3):.2f}"] if m.get("vid") else []   # 影片：拿一開始的一格當封面
    out = ["-map_metadata", "-1", "-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "-pix_fmt", "yuvj420p"]
    vf, tf = rot + "scale='if(gt(iw,ih),min(2048,iw),-2)':'if(gt(iw,ih),-2,min(2048,ih))':flags=lanczos", None
    if alb_wm_bake(a):                                 # 浮水印：右下角半透明白字
        tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")  # noqa: SIM115
        tf.write(a["wm"])
        tf.close()
        vf += (f",drawtext=fontfile='{alb_font(a['wm'])}':textfile='{tf.name}':fontcolor=white@0.6:fontsize='min(w,h)*0.042'"
               ":x='w-tw-min(w,h)*0.035':y='h-th-min(w,h)*0.035':shadowcolor=black@0.35:shadowx=2:shadowy=2")
    try:
        big = alb_run_ff((["-noautorotate"] if ext in (".jpg", ".jpeg") else []) + pre + ["-i", "{src}", "-vf", vf, *out, "-q:v", "4", "-"], src=src, timeout=180)
    finally:
        if tf:
            try:
                os.remove(tf.name)
            except OSError:
                pass
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
    vf, tf = "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',pad=ceil(iw/2)*2:ceil(ih/2)*2", None
    if alb_wm_bake(a):
        tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")  # noqa: SIM115
        tf.write(a["wm"])
        tf.close()
        vf += (f",drawtext=fontfile='{alb_font(a['wm'])}':textfile='{tf.name}':fontcolor=white@0.6:fontsize='min(w,h)*0.042'"
               ":x='w-tw-min(w,h)*0.035':y='h-th-min(w,h)*0.035':shadowcolor=black@0.35:shadowx=2:shadowy=2")
    mount = alb_ff()[1]
    tmp = f"/tmp/vsalb-{ck}-{kind}.mp4" if mount else os.path.join(ALB_CACHE, f".{ck}-{kind}.mp4")
    args = ["-i", src, "-map", "0:v:0", *(["-map", "0:a:0?"] if kind == "v" else ["-an"]), "-map_metadata", "-1", "-vf", vf,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p", "-threads", "2",
            *(["-c:a", "aac", "-b:a", "96k", "-ac", "2"] if kind == "v" else []), "-movflags", "+faststart", "-f", "mp4", tmp]
    os.makedirs(ALB_CACHE, mode=0o700, exist_ok=True)
    ok = False
    try:
        r = subprocess.run(["nice", "-n", "17", *cmd, "-v", "error", "-nostdin", "-y", *args], capture_output=True,
                           timeout=max(300, m.get("dur", 4) * 6))
        if r.returncode == 0:
            if mount:                                  # 容器裡做的：倒出來再刪掉
                pr = subprocess.Popen(["docker", "exec", "vps-cloud", "cat", tmp], stdout=subprocess.PIPE)  # noqa: S607
                ok = alb_vstore(ck, kind, pr.stdout)
                pr.wait(timeout=60)
                ok = ok and pr.returncode == 0
            else:
                with open(tmp, "rb") as f:
                    ok = alb_vstore(ck, kind, f)
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        log(f"相簿影片轉不出來（{name}：{str(e)[:80]}）")
    finally:
        for x in [tf.name] if tf else []:
            try:
                os.remove(x)
            except OSError:
                pass
        try:
            if mount:
                subprocess.run(["docker", "exec", "vps-cloud", "rm", "-f", tmp], capture_output=True, timeout=30)  # noqa: S607
            else:
                os.remove(tmp)
        except (OSError, subprocess.SubprocessError):
            pass
    return ok


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


def alb_mark_bad(a, pid, key="bad"):
    fn = os.path.join(ALB_CACHE, f"idx-{a['id']}.json")
    with ALB_LOCK:
        idx = alb_index(a, scan=False)
        if pid in (idx.get("ph") or {}):
            idx["ph"][pid][key] = 1
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
                for pid in idx.get("order", []):        # 照片都好了再慢慢轉影片
                    if aid not in alb_all():
                        break
                    m = idx["ph"][pid]
                    kind = "v" if m.get("vid") else "m" if m.get("lv") else ""
                    if kind and not m.get("vbad") and not alb_vinfo(alb_ckey(a, pid, m), kind) and not alb_vmake(a, pid, m, kind):
                        alb_mark_bad(a, pid, "vbad")
        except Exception as e:  # noqa: BLE001  相簿出錯不影響監控
            log(f"相簿小圖做不出來（{str(e)[:120]}）")
        with ALB_LOCK:
            ALB["q"].pop(0)
            last = not ALB["q"]
        if last:                                       # 清單空了就結束（之後再排進來的會另開一個）
            alb_gc()                                   # 換了浮水印、大小，舊的小圖清掉
            return


def alb_gc():
    """清掉已經沒有相簿用到的小圖"""
    keep = set()
    for a in alb_all().values():
        idx = alb_index(a, scan=False)
        for pid, m in (idx.get("ph") or {}).items():
            keep.add(alb_ckey(a, pid, m))
    try:
        for fn in os.listdir(ALB_CACHE):
            m = re.fullmatch(r"\.?([0-9a-f]{24})-(?:[slq]\.jpg|[vm](?:-\d+\.bin|\.json|\.mp4))", fn)
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
ALB_TILE_DIR = os.path.join(DATA_DIR, "album-tiles")             # 地圖圖塊（不備份，重抓得到）
ALB_TILE_URL = os.environ.get("SENTINEL_ALB_TILE") or "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
ALB_TILE_DAYS = 30
ALB_TILE_GATE = threading.BoundedSemaphore(4)


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
        os.makedirs(os.path.dirname(fn), mode=0o700, exist_ok=True)
        tmp = fn + ".tmp"
        with open(tmp, "wb") as f:
            f.write(b)
        os.replace(tmp, fn)
        return b
    except (OSError, ValueError):
        if st:                                         # 連不上就先用舊的
            try:
                with open(fn, "rb") as f:
                    return f.read()
            except OSError:
                pass
        return None


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


def alb_manifest(a, th=""):
    idx = alb_index(a)
    talk = alb_talk_of(a, th) if a.get("talk", True) else {}
    ph = idx.get("ph") or {}
    out, places, hid = [], {}, set(a.get("hide") or [])
    for pid in idx.get("order", []):
        if pid in hid:
            continue
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
        if m.get("vid"):                               # 影片：長度、轉好了沒
            it["vd"] = m["dur"]
            it["vr"] = 0 if m.get("vbad") else 1 if alb_vinfo(ck, "v") else -1
        elif m.get("lv") and not m.get("vbad") and alb_vinfo(ck, "m"):
            it["lv"] = 1                               # 原況照片：會動的那段好了
        if pid in talk:
            it.update(talk[pid])
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
    if alb_ready(a, idx) < 1 or any(x.get("vr") == -1 for x in out) or (a["loc"] and any("g" in x and "p" not in x for x in out)):
        alb_kick(a["id"])
    wmo = a.get("wm") if a.get("wm") and not alb_wm_bake(a) else ""
    return {"ok": True, "name": a["name"], "photos": out, "dl": alb_dl(a), "loc": a["loc"], "exp": a["exp"], "wmo": wmo,
            "talk": a.get("talk", True), "mu": bool(idx.get("mu")),
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
    for k, v in extra:
        h.send_header(k, v)
    h.end_headers()
    try:
        for b in read(s0, e0):
            h.wfile.write(b)
    except (BrokenPipeError, ConnectionResetError, OSError, ValueError):
        pass
    return True


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
    if rest == "/talk" and method == "POST":          # 朋友按愛心、留言
        if not a.get("talk", True):
            return h.send(403, '{"ok":false}') or True
        ok, why, _ = alb_dev_check(h, a, False)
        tok = alb_dev_tok(h, a)
        if not (alb_cookie_ok(h, a) and ok and tok):
            return h.send(403, json.dumps({"ok": False, "message": "重新打開相簿再試"}, ensure_ascii=False)) or True
        try:
            n = min(int(h.headers.get("Content-Length") or 0), 4096)
        except ValueError:
            n = 0
        code2, out = alb_talk_post(a, alb_dev_hash(tok), h.jbody(h.rfile.read(n) if n else b""))
        return h.send(code2, json.dumps(out, ensure_ascii=False), cache=False) or True
    if method != "GET":
        return h.send(404, '{"error":"找不到"}') or True
    own = bool(re.fullmatch(r"/i/[0-9a-f]{12}/[slqvm]", rest)) and alb_own_ok(h, a)   # 主人挑照片
    if not own and not alb_cookie_ok(h, a):
        return h.send(401, json.dumps({"ok": False, "pw": True}), cache=False) or True
    if not own:
        ok, why, new = alb_dev_check(h, a, rest == "/m")
        if not ok:
            return h.send(403, json.dumps({"ok": False, why: True}), cache=False) or True
        if rest == "/m":
            extra = [("Set-Cookie", f"vsad_{a['id']}={new}; Path=/a/{code}; Max-Age={400 * 86400}; HttpOnly; SameSite=Strict"
                      + ("; Secure" if h.https() else ""))] if new else []
            th = alb_dev_hash(new or alb_dev_tok(h, a))
            return h.send(200, json.dumps(alb_manifest(a, th), ensure_ascii=False, separators=(",", ":")), extra=extra) or True
    if rest == "/music":                               # 幻燈片的背景音樂（資料夾裡的那首歌）
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
        if not a["loc"]:
            return h.send(404, '{"error":"找不到"}') or True
        b = alb_tile(int(m[1]), int(m[2]), int(m[3]))
        if not b:
            return h.send(404, '{"error":"找不到"}') or True
        h.send_response(200)
        h.send_header("Content-Type", "image/png")
        h.send_header("Content-Length", str(len(b)))
        h.send_header("Cache-Control", "private, max-age=604800")
        h.send_header("X-Content-Type-Options", "nosniff")
        h.end_headers()
        try:
            h.wfile.write(b)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        return True
    m = re.fullmatch(r"/i/([0-9a-f]{12})/([slqovm])", rest)
    if m:
        pid, kind = m[1], m[2]
        idx = alb_index(a, scan=False)
        meta = (idx.get("ph") or {}).get(pid)
        if not meta or (pid in (a.get("hide") or []) and not own):
            return h.send(404, '{"error":"找不到"}') or True
        dlm = alb_dl(a)
        vk = "v" if kind == "v" and meta.get("vid") else "m" if kind == "m" and meta.get("lv") else ""
        if kind == "o" and meta.get("vid") and (dlm == 1 or not a["loc"]):   # 影片只給壓縮的（定位也一起拿掉了）
            vk = "v"
        if vk or kind in ("v", "m"):
            ck = alb_ckey(a, pid, meta)
            info = alb_vinfo(ck, vk) if vk else None
            if not info:
                return h.send(202 if vk and not meta.get("vbad") else 404, json.dumps({"ok": False, "wait": True}), cache=False) or True
            if kind == "o" and not dlm:
                return h.send(403, '{"error":"不能下載"}') or True
            extra = [("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(os.path.splitext(meta["n"])[0] + ".mp4"))] if kind == "o" else []
            return alb_send_part(h, info["sz"], lambda s0, e0: alb_vread(ck, vk, s0, e0), "video/mp4", extra)
        if kind == "o" and dlm == 1 and not meta.get("bad"):   # 只給壓縮圖：下載的是大圖
            b, _ = alb_get(a, pid, "l")
            if not b:
                return h.send(404, '{"error":"找不到"}') or True
            fn = os.path.splitext(meta["n"])[0] + ".jpg"
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
                ct = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
                      ".heic": "image/heic", ".heif": "image/heif", ".avif": "image/avif", ".mp4": "video/mp4", ".m4v": "video/mp4",
                      ".mov": "video/quicktime", ".webm": "video/webm"}.get(ext, "application/octet-stream")
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
    if rest == "/zip":                                 # 全部打包（不壓縮，邊讀邊送；只給壓縮圖的打包大圖）
        dlm = alb_dl(a)
        if not dlm:
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
                hid = set(a.get("hide") or [])
                for pid in idx.get("order", []):
                    meta = idx["ph"][pid]
                    if pid in hid or (dlm < 2 and meta.get("bad")):
                        continue
                    if meta.get("vid") and (dlm == 1 or not a["loc"]):   # 影片：壓縮過、沒有定位的那份
                        ck = alb_ckey(a, pid, meta)
                        info = alb_vinfo(ck, "v")
                        if info:
                            with z.open(zipfile.ZipInfo(os.path.splitext(meta["n"])[0] + ".mp4", time.localtime(meta["mt"])[:6]), "w", force_zip64=True) as w:
                                for b in alb_vread(ck, "v", 0, info["sz"] - 1):
                                    w.write(b)
                        continue
                    if dlm == 1:
                        b, _ = alb_get(a, pid, "l")
                        if b:
                            z.writestr(zipfile.ZipInfo(os.path.splitext(meta["n"])[0] + ".jpg", time.localtime(meta["mt"])[:6]), b)
                        continue
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
        idx = alb_index(a, scan=False)
        ph = idx.get("ph") or {}
        out = sorted(({"i": q, "v": alb_ckey(a, q, ph[q])[:8], "id": c["id"], "n": c["n"], "s": c["s"], "t": int(c["t"])}
                      for q, x in t.items() if q in ph for c in x.get("c") or []), key=lambda c: -c["t"])
        likes = sorted(((len(x.get("l") or []), q) for q, x in t.items() if q in ph and x.get("l")), reverse=True)[:12]
        return 200, {"ok": True, "c": out, "likes": [{"i": q, "v": alb_ckey(a, q, ph[q])[:8], "n": n} for n, q in likes],
                     "own": alb_own_val(a, time.time() + ALB_OWN_S), "base": alb_base(), "code": a["code"]}
    if act in ("photos", "devs"):
        a = alb_all().get(str(d.get("id") or ""))
        if not a:
            return 400, {"ok": False, "message": "這本已經收回了"}
        if act == "devs":                              # 看過的手機
            devs = a.get("devs") or {}
            return 200, {"ok": True, "dev": a.get("dev") or 0, "devs": [{"h": k, **v} for k, v in sorted(devs.items(), key=lambda x: -x[1].get("t", 0))]}
        idx = alb_index(a)                             # 挑照片：小圖用短時間的通行證看
        hid, out = set(a.get("hide") or []), []
        for pid in idx.get("order", []):
            m = idx["ph"][pid]
            q = ""
            try:
                q = base64.b64encode(sec_read(alb_cfile(alb_ckey(a, pid, m), "q"))).decode()
            except (OSError, ValueError):
                pass
            out.append({"i": pid, "w": m["w"], "h": m["h"], "v": alb_ckey(a, pid, m)[:8], "q": q, "hid": pid in hid, "vd": m.get("dur") if m.get("vid") else 0})
        return 200, {"ok": True, "photos": out, "own": alb_own_val(a, time.time() + ALB_OWN_S), "base": alb_base(), "code": a["code"]}
    return 200, alb_list()
