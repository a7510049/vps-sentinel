"""哨站：加密筆記（Joplin 同步，`note_` 開頭）。
網址 /notes/ 是一個很小的 WebDAV（只有 Joplin 用得到的那幾個動作），筆記在手機上先加密好才傳上來，主機只存亂碼。
sentinel.py 用 include("notes.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）"""
from email.utils import formatdate

NOTE_PATH = "/notes"
NOTE_USER = "joplin"
NOTE_CONF = os.path.join(DATA_DIR, "notes.json")      # {"pw", "ek", "t", "last"}，加密存（SEAL_FILES）
NOTE_FAILS = {}                                         # 連線來源 → [輸錯的時間…]
NOTE_BAN = 15 * 60                                      # 15 分鐘內錯 10 次：這個來源先不能再試
NOTE_LOCK = threading.Lock()
NOTE = {"c": None, "saved": 0}
NOTE_SPARE = 1 << 30                                    # 主機磁碟至少留 1 GB


def note_conf():
    if NOTE["c"] is None:
        try:
            c = sec_load(NOTE_CONF)
        except (OSError, ValueError):
            c = {}
        NOTE["c"] = c if isinstance(c, dict) else {}
    return NOTE["c"]


def note_save(c):
    NOTE["c"] = c
    if c:
        sec_dump(NOTE_CONF, c)
    else:
        try:
            os.remove(NOTE_CONF)
        except OSError:
            pass


def note_dir():
    """筆記放在 DATA_DIR/notes：跟著每日備份、還原，沒有雲端硬碟的主機也能用"""
    return os.environ.get("SENTINEL_NOTES_DIR") or os.path.join(DATA_DIR, "notes")


def note_usage(d):
    n = size = 0
    for root, _dirs, files in os.walk(d):
        for f in files:
            try:
                size += os.lstat(os.path.join(root, f)).st_size
                n += 1
            except OSError:
                pass
    return n, size


def note_base():
    """給 Joplin 填的網址（有網域就用網域；沒有的話網頁用自己打開的網址）"""
    dom = C.get("DOMAIN")
    if dom:
        port = C.get("HTTPS_PORT") or "443"
        return f"https://{dom}" + ("" if port == "443" else f":{port}")
    return ""


def note_info():
    c = note_conf()
    out = {"ok": True, "on": bool(c.get("pw")), "user": NOTE_USER, "path": NOTE_PATH + "/", "base": note_base(),
           "self_signed": bool(TLS["ctx"]) and not C.get("DOMAIN")}
    if out["on"]:
        n, size = note_usage(note_dir())
        out.update({"files": n, "size": size, "last": c.get("last") or 0})
    return out


def note_ek_new():
    """Joplin 的加密密碼（使用者要主機幫忙記著）：24 個不會看錯的字，6 個一組"""
    a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    k = "".join(secrets.choice(a) for _ in range(24))
    return "-".join(k[i:i + 6] for i in range(0, 24, 6))


def note_act(d):
    """網頁的動作：on 打開（產生密碼）、show 看密碼、new 換一組密碼、off 關掉（筆記留著）、wipe 全部清掉"""
    act = d.get("action")
    with NOTE_LOCK:
        c = dict(note_conf())
        if act in ("on", "new"):
            if act == "new" and not c.get("pw"):
                return False, "還沒打開", {}
            try:
                os.makedirs(note_dir(), mode=0o700, exist_ok=True)
            except OSError:
                return False, "建不了放筆記的資料夾", {}
            c["pw"] = secrets.token_urlsafe(18)       # 144 位元，猜不到；只給 Joplin 用，跟哨兵的登入無關
            c.setdefault("ek", note_ek_new())         # 加密密碼一旦給了就不換（換了舊筆記就解不開）
            c.setdefault("t", int(time.time()))
            note_save(c)
            log("加密筆記：" + ("打開了" if act == "on" else "換了一組密碼"))
            return True, "好了" if act == "on" else "已換新密碼，舊密碼立刻失效", {"pw": c["pw"], "ek": c["ek"]}
        if act == "show":
            if not c.get("pw"):
                return False, "還沒打開", {}
            if not c.get("ek"):                       # 4.28 打開的：補一組
                c["ek"] = note_ek_new()
                note_save(c)
            return True, "", {"pw": c["pw"], "ek": c["ek"]}
        if act == "wipe":                            # 清除所有筆記：檔案全部刪掉、密碼和加密密碼都換新（手機上的 Joplin 不動）
            root = note_dir()
            try:
                for name in os.listdir(root):
                    p = os.path.join(root, name)
                    if os.path.isdir(p) and not os.path.islink(p):
                        shutil.rmtree(p)
                    else:
                        os.remove(p)
            except FileNotFoundError:
                pass
            except OSError:
                return False, "沒刪乾淨，再試一次", {}
            c = {"pw": secrets.token_urlsafe(18), "ek": note_ek_new(), "t": int(time.time())}   # 等於重新開一本：密碼、加密密碼都換新
            note_save(c)
            log("加密筆記：清除了所有筆記，重新開一本")
            return True, "已清除，換了新的密碼", {"pw": c["pw"], "ek": c["ek"]}
        if act == "off":
            c.pop("pw", None)
            note_save(c)
            log("加密筆記：關掉了")
            return True, "已關掉，筆記還留著", {}
    return False, "不認得的動作", {}


# ───────────────────────── WebDAV ─────────────────────────

def note_seen():
    """記一下最近一次同步（存檔最多 10 分鐘一次）"""
    now = int(time.time())
    with NOTE_LOCK:
        c = note_conf()
        if not c.get("pw"):
            return
        c["last"] = now
        if now - NOTE["saved"] > 600:
            NOTE["saved"] = now
            note_save(dict(c))


def note_is(path):
    return path == NOTE_PATH or path.startswith(NOTE_PATH + "/")


def note_banned(ip, now):
    t = [x for x in NOTE_FAILS.get(ip, []) if now - x < NOTE_BAN]
    if t:
        NOTE_FAILS[ip] = t
    else:
        NOTE_FAILS.pop(ip, None)
    return len(t) >= 10


def note_auth(h, c):
    """回傳 None＝通過；不然是 (狀態碼, 訊息)"""
    ip, now = h.client_ip(), time.time()
    with NOTE_LOCK:
        if note_banned(ip, now):
            return 429, "錯太多次，等 15 分鐘再試"
    raw = h.headers.get("Authorization") or ""
    ok = False
    if raw[:6].lower() == "basic ":
        try:
            user, _, pw = base64.b64decode(raw[6:].strip(), validate=True).decode("utf-8").partition(":")
        except (ValueError, UnicodeDecodeError):
            user = pw = ""
        ok = hmac.compare_digest(user.encode(), NOTE_USER.encode()) & hmac.compare_digest(pw.encode(), c["pw"].encode())
    if ok:
        return None
    if raw:
        with NOTE_LOCK:
            NOTE_FAILS.setdefault(ip, []).append(now)
            if len(NOTE_FAILS) > 5000:            # 很多來源一直亂試：只留最近的
                for k in list(NOTE_FAILS)[:2500]:
                    NOTE_FAILS.pop(k, None)
        time.sleep(1)
    return 401, "要帳號密碼"


def note_secure(h):
    """只收加密連線（經過本機的 Caddy 也算）"""
    if isinstance(h.connection, ssl.SSLSocket):
        return True
    try:
        local = ipaddress.ip_address(h.client_address[0]).is_loopback
    except ValueError:
        local = False
    return local and (h.headers.get("X-Forwarded-Proto") or "").lower() == "https"


def note_fs(root, rel):
    """網址裡的路徑 → 主機上的路徑；跑出筆記資料夾、奇怪的名字一律不給"""
    parts = []
    for p in urllib.parse.unquote(rel).split("/"):
        if p in ("", "."):
            continue
        if p == ".." or "\x00" in p or "\\" in p or len(p) > 255:
            return None
        parts.append(p)
    full = os.path.join(root, *parts)
    real = os.path.realpath(full)
    if real != os.path.realpath(root) and not real.startswith(os.path.realpath(root) + os.sep):
        return None
    return full


def note_rel(h):
    p = urllib.parse.urlsplit(h.path).path
    return p[len(NOTE_PATH):]


def note_reply(h, code, body=b"", ctype="text/plain; charset=utf-8", extra=()):
    if isinstance(body, str):
        body = body.encode("utf-8")
    h.send_response(code)
    for k, v in extra:
        h.send_header(k, v)
    if code == 401:
        h.send_header("WWW-Authenticate", 'Basic realm="notes", charset="UTF-8"')
    h.send_header("Content-Type", ctype)
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", "no-store")
    h.send_header("X-Content-Type-Options", "nosniff")
    h.send_header("Content-Security-Policy", "sandbox")   # 直接用瀏覽器打開也不能跑程式
    h.end_headers()
    if body and h.command != "HEAD":
        h.wfile.write(body)


def note_body(h, dst, room):
    """把上傳的內容寫進 dst（一般的、分段的都收），超過 room 就停；回傳 True＝收完"""
    left = h.headers.get("Content-Length")
    chunked = left is None and "chunked" in (h.headers.get("Transfer-Encoding") or "").lower()
    got = 0
    if left is not None:
        try:
            left = int(left)
        except ValueError:
            return False
        if left < 0 or left > room:
            return False
        while left > 0:
            buf = h.rfile.read(min(left, 1 << 20))
            if not buf:
                return False
            dst.write(buf)
            left -= len(buf)
        return True
    if not chunked:
        return True                                   # 沒有內容：空檔案
    while True:
        try:
            n = int(h.rfile.readline(64).split(b";")[0].strip() or b"0", 16)
        except ValueError:
            return False
        if n == 0:
            while h.rfile.readline(1024).strip():
                pass
            return True
        got += n
        if got > room:
            return False
        while n > 0:
            buf = h.rfile.read(min(n, 1 << 20))
            if not buf:
                return False
            dst.write(buf)
            n -= len(buf)
        h.rfile.readline(8)


def note_room(d):
    try:
        s = os.statvfs(d)
    except OSError:
        return 0
    return max(0, s.f_bavail * s.f_frsize - NOTE_SPARE)


def note_prop(href, st, is_dir):
    t = formatdate(st.st_mtime, usegmt=True)
    tag = f'"{int(st.st_mtime_ns):x}-{st.st_size:x}"'
    more = ("<d:resourcetype><d:collection/></d:resourcetype>" if is_dir else
            f"<d:resourcetype/><d:getcontentlength>{st.st_size}</d:getcontentlength>"
            f"<d:getcontenttype>application/octet-stream</d:getcontenttype><d:getetag>{tag}</d:getetag>")
    return (f"<d:response><d:href>{html.escape(href)}</d:href><d:propstat><d:prop>"
            f"<d:getlastmodified>{t}</d:getlastmodified>{more}</d:prop>"
            "<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>")


def note_href(rel_parts, is_dir):
    p = NOTE_PATH + "/" + "/".join(urllib.parse.quote(x) for x in rel_parts)
    return p + ("/" if is_dir and not p.endswith("/") else "")


def note_parts(root, full):
    r = os.path.relpath(full, root)
    return [] if r == "." else r.split(os.sep)


def note_dest(h, root):
    """MOVE／COPY 的目的地（只能在筆記資料夾裡）"""
    dst = h.headers.get("Destination") or ""
    p = urllib.parse.urlsplit(dst).path
    if not note_is(p):
        return None
    return note_fs(root, p[len(NOTE_PATH):])


def note_dav(h):
    """處理 /notes/ 開頭的連線"""
    h.close_connection = True
    if not note_secure(h):
        return note_reply(h, 403, "請用 https")
    c = note_conf()
    if not c.get("pw"):
        return note_reply(h, 404, "沒有打開加密筆記")
    bad = note_auth(h, c)
    if bad:
        return note_reply(h, *bad)
    root, m = note_dir(), h.command
    if not os.path.isdir(root):                       # 資料夾不見了不能當成空的（Joplin 會以為筆記全被刪了，把手機上的也刪掉）
        return note_reply(h, 503, "放筆記的資料夾不見了")
    full = note_fs(root, note_rel(h))
    if full is None:
        return note_reply(h, 400, "路徑不對")
    note_seen()
    is_root = os.path.realpath(full) == os.path.realpath(root)
    allow = "OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL, MOVE, COPY"
    if m == "OPTIONS":
        return note_reply(h, 200, extra=(("DAV", "1"), ("Allow", allow), ("MS-Author-Via", "DAV")))
    if m == "PROPFIND":
        try:                                          # 要的欄位不用看，一律給 Joplin 用得到的那幾個
            n = int(h.headers.get("Content-Length") or 0)
            if 0 < n <= 65536:
                h.rfile.read(n)
        except (ValueError, OSError):
            pass
        try:
            st = os.lstat(full)
        except OSError:
            return note_reply(h, 404, "找不到")
        is_dir = stat.S_ISDIR(st.st_mode)
        parts = note_parts(root, full)
        out = [note_prop(note_href(parts, is_dir), st, is_dir)]
        if is_dir and (h.headers.get("Depth") or "1").strip() != "0":
            try:
                names = sorted(os.listdir(full))
            except OSError:
                names = []
            for name in names:
                try:
                    s2 = os.lstat(os.path.join(full, name))
                except OSError:
                    continue
                if stat.S_ISLNK(s2.st_mode) or name.endswith(".note-tmp"):
                    continue
                d2 = stat.S_ISDIR(s2.st_mode)
                out.append(note_prop(note_href(parts + [name], d2), s2, d2))
        xml = '<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">' + "".join(out) + "</d:multistatus>"
        return note_reply(h, 207, xml, "application/xml; charset=utf-8")
    if m in ("GET", "HEAD"):
        if os.path.isdir(full):
            return note_reply(h, 200, "", extra=(("DAV", "1"),))
        try:
            f = open(full, "rb")
        except OSError:
            return note_reply(h, 404, "找不到")
        with f:
            st = os.fstat(f.fileno())
            h.send_response(200)
            h.send_header("Content-Type", "application/octet-stream")
            h.send_header("Content-Length", str(st.st_size))
            h.send_header("Last-Modified", formatdate(st.st_mtime, usegmt=True))
            h.send_header("ETag", f'"{int(st.st_mtime_ns):x}-{st.st_size:x}"')
            h.send_header("Cache-Control", "no-store")
            h.send_header("X-Content-Type-Options", "nosniff")
            h.send_header("Content-Security-Policy", "sandbox")
            h.end_headers()
            if m == "GET":
                try:
                    shutil.copyfileobj(f, h.wfile, 1 << 16)
                except OSError:
                    pass
        return None
    if m == "PUT":
        if is_root or os.path.isdir(full):
            return note_reply(h, 405, "這是資料夾")
        if not os.path.isdir(os.path.dirname(full)):
            return note_reply(h, 409, "上一層資料夾不在")
        existed = os.path.exists(full)
        tmp = f"{full}.{secrets.token_hex(4)}.note-tmp"
        try:
            with open(tmp, "wb") as f:
                ok = note_body(h, f, note_room(root))
            if not ok:
                os.remove(tmp)
                return note_reply(h, 507, "空間不夠")
            os.replace(tmp, full)
        except OSError:
            try:
                os.remove(tmp)
            except OSError:
                pass
            return note_reply(h, 500, "存不進去")
        return note_reply(h, 204 if existed else 201)
    if m == "MKCOL":
        if os.path.exists(full):
            return note_reply(h, 405, "已經有了")
        if not os.path.isdir(os.path.dirname(full)):
            return note_reply(h, 409, "上一層資料夾不在")
        try:
            os.mkdir(full, 0o700)
        except OSError:
            return note_reply(h, 500, "建不了")
        return note_reply(h, 201)
    if m == "DELETE":
        if is_root:
            return note_reply(h, 403, "不能刪整個資料夾")
        if not os.path.lexists(full):
            return note_reply(h, 404, "找不到")
        try:
            if os.path.isdir(full) and not os.path.islink(full):
                shutil.rmtree(full)
            else:
                os.remove(full)
        except OSError:
            return note_reply(h, 500, "刪不掉")
        return note_reply(h, 204)
    if m in ("MOVE", "COPY"):
        dst = note_dest(h, root)
        if dst is None or is_root or os.path.realpath(dst) == os.path.realpath(root):
            return note_reply(h, 400, "目的地不對")
        if not os.path.lexists(full):
            return note_reply(h, 404, "找不到")
        if not os.path.isdir(os.path.dirname(dst)):
            return note_reply(h, 409, "上一層資料夾不在")
        existed = os.path.lexists(dst)
        if existed and (h.headers.get("Overwrite") or "T").strip().upper() == "F":
            return note_reply(h, 412, "已經有了")
        try:
            if existed:
                if os.path.isdir(dst) and not os.path.islink(dst):
                    shutil.rmtree(dst)
                else:
                    os.remove(dst)
            if m == "MOVE":
                os.replace(full, dst)
            elif os.path.isdir(full):
                shutil.copytree(full, dst, symlinks=True)
            else:
                shutil.copy2(full, dst)
        except OSError:
            return note_reply(h, 500, "搬不過去")
        return note_reply(h, 204 if existed else 201)
    return note_reply(h, 405, "不支援", extra=(("Allow", allow),))
