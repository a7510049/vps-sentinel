"""VPS 哨兵：配對暗號（新增主機）、被監看模式。sentinel.py 用 include("pair.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）"""

# ───────────────────────── 配對暗號（新增主機） ─────────────────────────
# 新主機產生一組「配對暗號」＝ 它的網址 ＋ 一次性的隨機密鑰（128 位元），24 小時內有效、用一次就失效。
# 主要主機貼上暗號後跟新主機「對暗號」：雙方都用 HMAC-SHA256 證明自己知道密鑰，
# 再各自用 HKDF-SHA256（RFC 5869）算出同一把長期連線鑰匙 —— 密鑰和鑰匙都不會在網路上傳。
# 每台配對過來的主機各有一把鑰匙（新主機只存雜湊），可以單獨解除，不影響登入密碼；換登入密碼也不會斷線。
PAIR_FILE = os.path.join(DATA_DIR, "pairing.json")
PAIR_HOURS = 24
PAIR_MAX = 10                                   # 最多幾台主機可以配對過來
PAIR_LOCK = threading.Lock()
PAIR_CACHE = {"mt": None, "d": {}}
PAIR_SEEN = {}                                  # 每把鑰匙最近一次連進來的時間（只記在記憶體）


def hkdf(ikm, salt, info, n=32):
    """HKDF-SHA256（RFC 5869）"""
    prk = hmac.new(salt or b"\0" * 32, ikm, hashlib.sha256).digest()
    out, t, i = b"", b"", 1
    while len(out) < n:
        t = hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest()
        out, i = out + t, i + 1
    return out[:n]


def pair_mac(secret, *parts):
    k = hkdf(secret, b"", b"vps-sentinel pair auth v1")
    return hmac.new(k, b"|".join(p if isinstance(p, bytes) else str(p).encode() for p in parts), hashlib.sha256).digest()


def pair_key(secret, n1, n2):
    return "vsk_" + b64u(hkdf(secret, n1 + n2, b"vps-sentinel peer key v1"))


def pair_load():
    try:
        mt = os.stat(PAIR_FILE).st_mtime_ns
    except OSError:
        mt = 0
    if mt != PAIR_CACHE["mt"]:                  # 安裝畫面另外產生的暗號也要讀得到
        try:
            with open(PAIR_FILE, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            d = {}
        PAIR_CACHE.update(mt=mt, d=d if isinstance(d, dict) else {})
    return PAIR_CACHE["d"]


def pair_save(d):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = PAIR_FILE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(tmp, PAIR_FILE)
    PAIR_CACHE.update(mt=None)


def pair_code(url):
    """產生新的配對暗號（舊的那組立刻失效）"""
    url = re.sub(r"[\s,|]", "", str(url or "")).rstrip("/")
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        return False, "網址格式不對"
    url = f"{u.scheme}://{u.netloc}{u.path.rstrip('/')}"
    secret = secrets.token_bytes(16)
    raw = b"\x01" + secret + url.encode()
    with PAIR_LOCK:
        d = dict(pair_load())
        d["pending"] = {"s": secret.hex(), "url": url, "exp": time.time() + PAIR_HOURS * 3600, "fails": 0}
        pair_save(d)
    return True, "VS-" + b64u(raw + hashlib.sha256(raw).digest()[:3])


def pair_decode(code):
    s = re.sub(r"\s", "", str(code or ""))
    if s[:3].upper() == "VS-":
        s = s[3:]
    try:
        raw = unb64u(s)
    except (ValueError, TypeError):
        raw = b""
    body, chk = raw[:-3], raw[-3:]
    if len(body) < 20 or body[:1] != b"\x01" or not hmac.compare_digest(hashlib.sha256(body).digest()[:3], chk):
        return None
    try:
        url = body[17:].decode()
    except UnicodeDecodeError:
        return None
    return url, body[1:17]


def pair_keys():
    return [k for k in pair_load().get("keys", []) if isinstance(k, dict)]


def pair_key_ok(given):
    """其他主機用配對鑰匙連進來"""
    if not given.startswith("vsk_"):
        return False
    h = hashlib.sha256(given.encode()).hexdigest()
    for k in pair_keys():
        if hmac.compare_digest(h, str(k.get("hash", ""))):
            PAIR_SEEN[k.get("id")] = time.time()
            if time.time() - k.get("seen", 0) > 3600:      # 一小時記一次，重新啟動後還知道對方多久沒來
                with PAIR_LOCK:
                    st = dict(pair_load())
                    st["keys"] = [dict(x, seen=int(time.time())) if x.get("id") == k.get("id") else x for x in pair_keys()]
                    pair_save(st)
            return True
    return False


def pair_status():
    d = pair_load()
    p = d.get("pending") or {}
    left = max(0, int(p.get("exp", 0) - time.time())) if p else 0
    return {"keys": [{"id": k.get("id"), "name": k.get("name"), "t": k.get("t"), "seen": PAIR_SEEN.get(k.get("id"))}
                     for k in pair_keys()], "pending": left}


def pair_accept(d):
    """新主機這邊：主要主機拿暗號來對"""
    try:
        n1 = unb64u(d.get("n"))
        proof = unb64u(d.get("proof"))
    except (ValueError, TypeError):
        return False, "暗號不對", None
    raw = str(d.get("name") or "")                 # 主要主機用原本的名稱簽，要用原本的來對
    name = re.sub(r"[\s,=|]+", " ", raw).strip()[:40] or "主要主機"
    with PAIR_LOCK:
        st = dict(pair_load())
        p = st.get("pending")
        if not p or p.get("exp", 0) < time.time():
            return False, "暗號已失效，請在新主機重新產生", None
        secret = bytes.fromhex(p["s"])
        if len(n1) != 16 or not hmac.compare_digest(pair_mac(secret, "req", n1, raw), proof):
            return False, "暗號不對", None           # 密鑰有 128 位元，猜不到；不算錯幾次，免得別人亂送就把暗號作廢
        n2 = secrets.token_bytes(16)
        key = pair_key(secret, n1, n2)
        keys = [k for k in pair_keys() if k.get("name") != name]      # 同一台重新配對：舊鑰匙作廢
        keys.append({"id": secrets.token_hex(4), "name": name, "hash": hashlib.sha256(key.encode()).hexdigest(), "t": int(time.time())})
        st["keys"] = keys[-PAIR_MAX:]
        st.pop("pending", None)
        pair_save(st)
        PAIR_SEEN[keys[-1]["id"]] = time.time()
        WATCH["down"] = False
    global PAGE
    PAGE = None                                   # 被監看就不用完整網頁，放掉記憶體
    log(f"「{name}」開始監看這台主機")
    COL.add_event("info", f"「{name}」開始監看這台主機")
    return True, "", {"n": b64u(n2), "name": NAME, "proof": b64u(pair_mac(secret, "ok", n1, n2, NAME))}


def pair_revoke(kid=None, given=None):
    """解除配對：指定哪一把，或是「連進來的這一把」（主要主機移除這台時）"""
    h = hashlib.sha256(str(given or "").encode()).hexdigest()
    with PAIR_LOCK:
        st = dict(pair_load())
        keys = pair_keys()
        gone = [k for k in keys if (kid and k.get("id") == kid) or (given and hmac.compare_digest(h, str(k.get("hash", ""))))]
        if not gone:
            return False, "找不到這個配對"
        st["keys"] = [k for k in keys if k not in gone]
        if not st["keys"]:
            st.pop("tg", None)                    # 沒有人監看了：主要主機的 Telegram 設定也不用留
        pair_save(st)
    for k in gone:
        log(f"解除了「{k.get('name')}」的配對")
        COL.add_event("info", f"解除了「{k.get('name')}」的配對")
    return True, "已解除配對"


def peer_add(code):
    """主要主機這邊：貼上新主機的暗號，對完暗號就加進主機列表"""
    got = pair_decode(code)
    if not got:
        return False, "暗號不完整，請整串複製貼上"
    url, secret = got
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ("http", "https") or not u.hostname or re.search(r"[\s,|?#]", url):
        return False, "暗號裡的網址不對，請在新主機重新產生"
    own = pair_load().get("pending") or {}
    if hmac.compare_digest(str(own.get("s", "")), secret.hex()):
        return False, "這是這台自己的暗號，請貼到主要主機"
    n1 = secrets.token_bytes(16)
    body = json.dumps({"n": b64u(n1), "name": NAME, "proof": b64u(pair_mac(secret, "req", n1, NAME))}).encode()
    try:
        req = urllib.request.Request(url + "/api/pair", data=body, method="POST", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            d = json.loads(r.read())
        n2 = unb64u(d.get("n"))
        name = re.sub(r"[\s,=|]+", " ", str(d.get("name") or "")).strip()[:40]
        if len(n2) != 16 or not name or not hmac.compare_digest(pair_mac(secret, "ok", n1, n2, str(d.get("name") or "")),
                                                               unb64u(d.get("proof"))):
            return False, "對方的回應對不上，已取消"
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, "那台的哨兵是舊版，請先更新"
        try:
            return False, json.loads(e.read()).get("message") or peer_error(e, url)
        except ValueError:
            return False, peer_error(e, url)
    except (ValueError, TypeError, AttributeError):
        return False, f"這個網址不是 VPS 哨兵（{url}）"
    except Exception as e:  # noqa: BLE001
        return False, peer_error(e, url)
    key = pair_key(secret, n1, n2)
    old = next((p for p in PEERS if p["url"] == url), None)
    if old:                                       # 本來就在列表裡：換成新的配對鑰匙
        old["token"] = key
    else:
        names = {p["name"] for p in PEERS} | {NAME}
        node, i = name, 2
        while node in names:
            node, i = f"{name} {i}", i + 1
        PEERS.append({"name": node, "url": url, "token": key})
    try:
        write_conf({"PEERS": peers_conf()})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}"
    if not old:
        log(f"開始監看「{name}」：{url}")
        COL.add_event("info", f"開始監看「{name}」")
    return True, f"已重新配對「{name}」" if old else f"已新增「{name}」"


def peer_remove(node):
    """主要主機這邊：把一台從列表移除（順便請那台把這邊的鑰匙作廢）"""
    p = next((p for p in PEERS if p["name"] == node), None)
    if not p:
        return False, "找不到這台主機"
    if p["token"].startswith("vsk_"):
        try:
            req = urllib.request.Request(p["url"] + "/api/pair", data=b'{"action":"forget"}', method="POST",
                                         headers={"X-Token": p["token"], "Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=6).close()
        except urllib.error.HTTPError as e:
            if e.code >= 500:
                peer_forget_later(p)
        except Exception:  # noqa: BLE001
            peer_forget_later(p)                  # 連不上也照樣移除，之後在背景再通知那台，免得它一直卡在被監看
    PEERS.remove(p)
    try:
        write_conf({"PEERS": peers_conf()})
    except OSError as e:
        PEERS.append(p)
        return False, f"無法寫入設定檔：{e}"
    PEER_SEEN.pop(node, None)
    PEER_NAME.pop(node, None)
    BEAT_SENT.pop(node, None)
    log(f"不再監看「{node}」")
    COL.add_event("info", f"不再監看「{node}」")
    return True, "已移除"

# ───────────────────────── 被監看模式 ─────────────────────────
# 被其他主機配對、自己又沒有要看別台的主機＝「被監看」：不開完整網頁（只留一頁說明＋取消按鈕），
# 不自己發事件通知（主要主機會轉發），只留主要主機拉資料需要的基本運作。
# 主要主機每 10 分鐘傳一次「心跳」，順便帶上它的 Telegram 設定；主要主機太久沒連進來，這台就用那組設定通知。
WATCH_SILENT = 300                              # 主要主機幾秒沒連進來就算失聯
WATCH = {"down": False, "t0": time.time()}       # t0：哨兵啟動的時間
BEAT_SENT = {}                                  # 主要主機這邊：每台上次送心跳的 [時間, 內容]


def watchers():
    """這台被哪些主機監看"""
    return [] if PEERS else [str(k.get("name") or "主要主機") for k in pair_keys()]


def pair_unwatch():
    """取消被監看：所有配對鑰匙作廢，網頁恢復"""
    with PAIR_LOCK:
        st = dict(pair_load())
        gone = [str(k.get("name") or "") for k in pair_keys()]
        if not gone:
            return False, "這台沒有被監看"
        st["keys"] = []
        for k in ("tg", "lead", "self_t"):
            st.pop(k, None)
        pair_save(st)
        WATCH["down"] = False
    who = "、".join(gone)
    log(f"已取消被「{who}」監看")
    COL.add_event("info", f"已取消被「{who}」監看")
    return True, "已取消被監看"


def pair_beat_store(tg, lead=None):
    """被監看這邊：記住主要主機的 Telegram 設定（失聯時用），還有失聯時是不是由這台說「主要主機不見了」"""
    tg = {"bot": str(tg.get("bot") or "")[:100], "chat": str(tg.get("chat") or "")[:40]} if isinstance(tg, dict) else {}
    lead = True if lead is None else bool(lead)         # 舊版主要主機沒說：每台都講
    with PAIR_LOCK:
        st = dict(pair_load())
        if (st.get("tg") or {}) != tg or st.get("lead", True) != lead:
            st["tg"], st["lead"] = tg, lead
            pair_save(st)


PAIR_IDLE = 7 * 86400                           # 監看的主機幾天沒連進來，就自動取消被監看


def peer_forget_later(p):
    """主要主機這邊：移除時沒通知到那台，記下來之後再試"""
    with PAIR_LOCK:
        st = dict(pair_load())
        st["forget"] = [f for f in st.get("forget") or [] if f.get("url") != p["url"]] + \
                       [{"url": p["url"], "token": p["token"], "t": int(time.time())}]
        pair_save(st)


def peer_forget_retry():
    """主要主機這邊：每 5 分鐘再通知一次之前沒通知到的主機（最多 30 天）"""
    left = pair_load().get("forget") or []
    if not left or time.time() - WATCH.get("fg", 0) < 300:
        return
    WATCH["fg"] = time.time()
    keep = []
    for f in left:
        try:
            req = urllib.request.Request(f["url"] + "/api/pair", data=b'{"action":"forget"}', method="POST",
                                         headers={"X-Token": f["token"], "Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=6).close()
        except urllib.error.HTTPError as e:
            if e.code >= 500 and time.time() - f.get("t", 0) < 30 * 86400:
                keep.append(f)                    # 401／404：那邊早就沒有這把鑰匙了
        except Exception:  # noqa: BLE001
            if time.time() - f.get("t", 0) < 30 * 86400:
                keep.append(f)
    with PAIR_LOCK:
        st = dict(pair_load())
        st["forget"] = [f for f in st.get("forget") or [] if f in keep or f not in left]
        if not st["forget"]:
            st.pop("forget")
        pair_save(st)


def pair_expire():
    """被監看這邊：監看的主機太久沒連進來（多半已經把這台移除了），自動取消被監看"""
    now = time.time()
    old = [k for k in pair_keys()
           if now - max(WATCH["t0"], PAIR_SEEN.get(k.get("id"), 0), k.get("seen", 0), k.get("t", 0)) > PAIR_IDLE]
    if not old:
        return
    with PAIR_LOCK:
        st = dict(pair_load())
        st["keys"] = [k for k in pair_keys() if k not in old]
        if not st["keys"]:
            st.pop("tg", None)
            WATCH["down"] = False
        pair_save(st)
    for k in old:
        msg = f"「{k.get('name') or '主要主機'}」{PAIR_IDLE // 86400} 天沒連進來，已自動取消被監看"
        log(msg)
        COL.add_event("info", msg)


def peer_beats():
    """主要主機這邊：每 10 分鐘（Telegram 設定有變就馬上）告訴被監看的主機「我還在」"""
    tg = {"bot": TG_BOT, "chat": TG_CHAT} if TG_BOT and TG_CHAT else {}
    paired = [p for p in PEERS if p["token"].startswith("vsk_")]
    with PEER_LOCK:                              # 這台失聯時只派一台說「主要主機不見了」：挑現在連得上的第一台
        up = [p for p in paired if ((PEER_CACHE.get(peer_key(p)) or {}).get("d") or {}).get("online")]
    lead = (up or paired or [{}])[0].get("name")
    for p in PEERS:
        body = json.dumps({"action": "beat", "tg": tg, "lead": p["name"] == lead}).encode()
        last = BEAT_SENT.get(p["name"])
        if not p["token"].startswith("vsk_") or (last and last[1] == body and time.time() - last[0] < 600):
            continue
        try:
            req = urllib.request.Request(p["url"] + "/api/pair", data=body, method="POST",
                                         headers={"X-Token": p["token"], "Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=6).close()
            BEAT_SENT[p["name"]] = [time.time(), body]
        except Exception:  # noqa: BLE001
            pass


def watch_check():
    """被監看這邊：主要主機太久沒連進來就通知（用主要主機給的 Telegram 設定）；失聯期間這台自己的事件自己通知"""
    st = pair_load()
    tg = st.get("tg") or {}
    if not (tg.get("bot") and tg.get("chat")):
        return
    # 最後一次連進來的時間；剛配對好、剛重新啟動也當成連過（主要主機剛好也掛了的話，5 分鐘後一樣會通知）
    seen = max([WATCH["t0"]] + [max(PAIR_SEEN.get(k.get("id"), 0), k.get("t", 0)) for k in pair_keys()])
    gone = time.time() - seen > WATCH_SILENT
    if gone != WATCH["down"]:
        if gone:
            WATCH["base"] = seen                    # 主要主機最後看到這台的時間：之後的事件它沒看到
        if st.get("lead", True):                   # 好幾台被監看時只派一台講，不會一次收到好幾則
            who = html.escape("、".join(watchers()))
            tg_send(f"🔌 <b>{who}</b>　超過 {WATCH_SILENT // 60} 分鐘沒來看「{html.escape(NAME)}」，可能當機或斷線了" if gone
                    else f"✅ <b>{who}</b>　恢復連線了", "w")
    WATCH["down"] = gone
    if gone:
        watch_own(st)


def watch_own(st):
    """主要主機失聯時：這台的事件自己傳到 Telegram，記下傳到哪一筆（主要主機回來後不再重發）"""
    base = max(WATCH.get("base", 0), st.get("self_t") or 0)
    with COL.lock:
        evs = sorted(({"t": e[0], "kind": e[1], "text": e[2]} for e in COL.events if e[0] > base), key=lambda e: e["t"])
    if not evs:
        return
    lines = [x for x in (ev_line(e) for e in evs) if x]
    if lines:
        tg_send(tg_host_msg(NAME, lines[-10:]), "w")
    with PAIR_LOCK:
        st = dict(pair_load())
        st["self_t"] = evs[-1]["t"]
        pair_save(st)
