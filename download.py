"""VPS 哨兵：遠端下載、影片網站下載。sentinel.py 用 include("download.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）"""

# ───────────────────────── 遠端下載 ─────────────────────────
# 網頁上貼一個下載連結，這台主機直接下載到雲端硬碟的「下載」資料夾；好了會記在事件紀錄（也就會傳到 Telegram）。
# 安全：只能抓網路上公開的位址（連線前先查好 IP、只連那個 IP，不能拿來偷看這台或內部網路的東西）；
# 雲端硬碟和主機本身的磁碟都要留空間，快滿了就停下來。哨兵重新啟動（例如更新）後會自動接著下載。
DL_SUB = "下載"
DL_MAX = 3                                        # 同時下載幾個，其他的排隊
DL_LIST_MAX = 30                                  # 清單最多幾筆（太多就把最舊的已完成拿掉）
DL_SPARE = 200 * 1024 * 1024                      # 雲端硬碟至少留這麼多
DL_HOST_SPARE = 1024 ** 3                         # 主機的磁碟至少留這麼多（雲端硬碟的映像檔放在主機磁碟上，會跟著變大）
DL_SEGS = 4                                       # 檔案夠大、對方支援時，分成幾段同時下載（很多網站會限制每條連線的速度）
DL_SEGS_MAX = 16                                  # 大檔案每 32 MB 多一段，最多 16 段
DL_SEG_MIN = 16 * 1024 * 1024                     # 比這個小就不分段
DL_STEAL = 8 * 1024 * 1024                        # 先下載完的連線去幫忙還剩這麼多以上的段
DL_AGAIN = ("連線中斷了", "對方太久沒回應", "連不上")    # 這些錯誤先自己重試
DL_AGAIN_WAIT = float(os.environ.get("SENTINEL_DL_AGAIN", 30))   # 第 n 次重試前等 n 倍這麼多秒
DL_PART = ".下載中"                                # 還沒下載完的檔案後面加這個
DL_FILE = os.path.join(DATA_DIR, "downloads.json")
DL_LOCAL = os.environ.get("SENTINEL_DL_LOCAL") == "1"     # 測試用：允許下載本機的東西
DL = []
DL_LOCK = threading.Lock()


class DlErr(Exception):
    pass


def dl_dir():
    """下載資料夾；沒有雲端硬碟就回傳 None"""
    test = os.environ.get("SENTINEL_DL_DIR")
    if test:
        os.makedirs(test, exist_ok=True)
        return test
    if not (CLOUD_URL and os.path.ismount(CLOUD_DIR)):
        return None
    d = os.path.join(CLOUD_DIR, DL_SUB)
    if os.path.islink(d):                          # 雲端硬碟裡的東西別人改得到：被換成捷徑就拿掉重建
        os.remove(d)
    os.makedirs(d, mode=0o755, exist_ok=True)
    try:
        os.lchown(d, 1000, 1000)                   # 雲端硬碟程式用編號 1000 的使用者在跑，要是它的才刪得掉
    except OSError:
        pass
    return d


def dl_room(d):
    """還能放多少：雲端硬碟的剩餘空間、主機磁碟的剩餘空間，取小的，各自扣掉要留的"""
    def free(p):
        try:
            s = os.statvfs(p)
            return s.f_bavail * s.f_frsize
        except OSError:
            return None
    room = [x - DL_SPARE for x in [free(d)] if x is not None]
    if os.path.isdir("/var/lib/vps-cloud") and not os.environ.get("SENTINEL_DL_DIR"):
        h = free("/var/lib/vps-cloud")
        if h is not None:
            room.append(h - DL_HOST_SPARE)
    return max(0, min(room)) if room else 0


def dl_size(n):
    n = float(n or 0)
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return f"{n:.0f} {u}" if u in ("B", "KB") else f"{n:.1f} {u}"
        n /= 1024
    return ""


def dl_addrs(host, port):
    """查出網址的 IP，只留網路上公開的位址"""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        raise DlErr("找不到這個網址") from None
    out = []
    for *_, sa in infos:
        try:
            ip = ipaddress.ip_address(sa[0].split("%")[0])
        except ValueError:
            continue
        if ip.version == 6 and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if (DL_LOCAL or ip.is_global and not ip.is_multicast) and str(ip) not in out:
            out.append(str(ip))
    if not out:
        raise DlErr("不能下載這台主機或內部網路的東西")
    return out


class _DlHTTP(http.client.HTTPConnection):
    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout)
        self.ip = ip

    def connect(self):                             # 連到查好的那個 IP，不再重查一次（免得被換成內部位址）
        self.sock = socket.create_connection((self.ip, self.port), self.timeout)


class _DlHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout, context=ssl.create_default_context())
        self.ip = ip

    def connect(self):
        s = socket.create_connection((self.ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(s, server_hostname=self.host)


def dl_err(e):
    if isinstance(e, DlErr):
        return str(e)
    if isinstance(e, ssl.SSLCertVerificationError):
        return "對方的安全憑證有問題"
    if isinstance(e, (socket.timeout, TimeoutError)):
        return "對方太久沒回應"
    if isinstance(e, ConnectionRefusedError):
        return "對方拒絕連線"
    if isinstance(e, (ConnectionError, http.client.IncompleteRead)):
        return "連線中斷了"
    if isinstance(e, OSError) and e.errno == 28:
        return "空間不夠"
    return "連不上"


def dl_open(url, start=0, end=None, ua=None, stop=None):
    """打開下載連結（自己處理轉址，每一次轉址都重新檢查位址）；start＞0 時從那裡接著下載，end＝只要到哪裡（分段下載用）"""
    for _ in range(8):
        if stop and stop(url):                     # 只要轉址到哪裡，不打開最後的網頁
            return None, None, url
        u = urllib.parse.urlsplit(url)
        if u.scheme not in ("http", "https") or not u.hostname:
            raise DlErr("只能下載 http 或 https 開頭的連結")
        try:
            port = u.port or (443 if u.scheme == "https" else 80)
        except ValueError:
            raise DlErr("網址的連接埠不對") from None
        path = urllib.parse.quote(u.path or "/", safe="/%:@!$&'()*+,;=-._~")
        if u.query:
            path += "?" + urllib.parse.quote(u.query, safe="/%:@!$&'()*+,;=-._~?")
        head = {"User-Agent": ua or f"Mozilla/5.0 (VPS Sentinel {VERSION})", "Accept": "*/*", "Accept-Encoding": "identity"}
        if u.username:
            head["Authorization"] = "Basic " + base64.b64encode(
                f"{urllib.parse.unquote(u.username)}:{urllib.parse.unquote(u.password or '')}".encode()).decode()
        if start or end is not None:
            head["Range"] = f"bytes={start}-{'' if end is None else end}"
        err = None
        for ip in dl_addrs(u.hostname, port):
            c = (_DlHTTPS if u.scheme == "https" else _DlHTTP)(u.hostname, port, ip, 30)
            try:
                c.request("GET", path, headers=head)
                r = c.getresponse()
                break
            except (OSError, http.client.HTTPException) as e:
                err = e
                c.close()
        else:
            raise DlErr(dl_err(err))
        loc = r.getheader("Location")
        if r.status in (301, 302, 303, 307, 308) and loc:
            c.close()
            url = urllib.parse.urljoin(url, loc.strip())
            continue
        if r.status >= 400:
            c.close()
            raise DlErr({404: "找不到這個檔案（404）", 403: "對方不讓下載（403）", 401: "要登入才能下載（401）",
                         410: "檔案已經不在了（410）", 429: "下載太多次，對方暫時擋住了（429）"}.get(r.status, f"對方回應錯誤（{r.status}）"))
        return r, c, url
    raise DlErr("轉址太多次")


def dl_name(r, url):
    """檔名：先看對方給的，沒有就用網址最後一段"""
    cd, n = r.getheader("Content-Disposition") or "", ""
    m = re.search(r"filename\*\s*=\s*([\w-]*)'[^']*'([^;]+)", cd, re.I)
    if m:
        n = urllib.parse.unquote(m.group(2).strip().strip('"'), encoding=m.group(1) or "utf-8", errors="replace")
    if not n:
        m = re.search(r'filename\s*=\s*(?:"([^"]*)"|([^;]+))', cd, re.I)
        if m:
            n = (m.group(1) if m.group(1) is not None else m.group(2)).strip()
            try:
                n = n.encode("latin-1").decode("utf-8")
            except (UnicodeError, ValueError):
                pass
    if not n:
        n = urllib.parse.unquote(urllib.parse.urlsplit(url).path.rstrip("/").rsplit("/", 1)[-1])
    return dl_safe(n)


def dl_safe(n):
    n = re.sub(r"[\x00-\x1f\x7f/\\]", "_", str(n or "")).strip().lstrip(".").strip()
    while len(n.encode()) > 200:                   # 檔名太長：從中間截掉，副檔名留著
        b, e = os.path.splitext(n)
        n = (b[:-1] + e) if len(b) > 1 and len(e) < 20 else n[:-1]
    if n.endswith(DL_PART):
        n += "_"
    return n or "下載的檔案"


def dl_unique(d, n, me):
    """同名的檔案已經在了（或別的下載正要用這個名稱）就加上 (2)、(3)…"""
    b, e = os.path.splitext(n)
    taken = {j["name"] for j in DL if j is not me and j["st"] in ("wait", "run")}
    i, cand = 1, n
    while cand in taken or os.path.lexists(os.path.join(d, cand)) or os.path.lexists(os.path.join(d, cand + DL_PART)):
        i += 1
        cand = f"{b} ({i}){e}"
    return cand


def dl_save():
    """清單存檔（不存進度數字，只存要接著下載需要的）"""
    with DL_LOCK:
        keep = [{k: j.get(k) for k in ("id", "url", "name", "st", "done", "total", "err", "t", "t_end", "segs", "kind")} for j in DL]
    try:
        tmp = DL_FILE + ".tmp"
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
            json.dump(keep, f, ensure_ascii=False)
        os.replace(tmp, DL_FILE)
    except OSError:
        pass


def dl_load():
    """啟動時讀回清單；之前沒下載完的接著下載"""
    try:
        with open(DL_FILE, encoding="utf-8") as f:
            items = json.load(f)
    except (OSError, ValueError):
        items = []
    with DL_LOCK:
        for x in items if isinstance(items, list) else []:
            if isinstance(x, dict) and isinstance(x.get("url"), str) and x.get("id"):
                j = {**x, "bps": 0, "stop": False}
                if j.get("st") == "run":
                    j["st"] = "wait"
                DL.append(j)
    dl_kick()


def dl_kick():
    """有空位就開始排隊中的下載"""
    with DL_LOCK:
        run = sum(j["st"] == "run" for j in DL)
        for j in DL:
            if run >= DL_MAX:
                break
            if j["st"] == "wait" and j.get("after", 0) <= time.time():
                j.update(st="run", err="")
                run += 1
                threading.Thread(target=dl_run, args=(j,), daemon=True).start()


def dl_seg(j, seg, fd, errs, first=None):
    """下載其中一段 [開始, 結束, 已下載]；斷了自己重連（最多再試 3 次）"""
    tries = 0
    while seg[2] < seg[1] - seg[0] and not j["stop"] and not errs:
        r, c = first or (None, None)
        first = None
        try:
            if not r:
                r, c, _ = dl_open(j["url"], seg[0] + seg[2], seg[1] - 1)
                if r.status != 206:
                    raise DlErr("對方不支援分段下載")
            while seg[2] < seg[1] - seg[0]:
                if j["stop"] or errs:
                    return
                buf = r.read1(min(1 << 20, seg[1] - seg[0] - seg[2]))
                if not buf:
                    raise ConnectionError("連線中斷了")
                os.pwrite(fd, buf, seg[0] + seg[2])
                seg[2] += len(buf)
        except Exception as e:  # noqa: BLE001
            tries += 1
            if tries > 3 or isinstance(e, OSError) and e.errno == 28:
                errs.append(e)
                return
            time.sleep(2 * tries)
        finally:
            if c:
                c.close()


def dl_at(d, name, flags, mode=0o644):
    """在下載資料夾裡開檔：資料夾和檔案被換成捷徑（例如指到 /etc）都不跟過去；雲端硬碟裡的東西別人改得到"""
    dfd = os.open(d, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        return os.open(name, flags | os.O_NOFOLLOW, mode, dir_fd=dfd)
    finally:
        os.close(dfd)


def dl_move(d, src, dst):
    """在下載資料夾裡改名（一樣不跟著捷徑走）"""
    dfd = os.open(d, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.replace(src, dst, src_dir_fd=dfd, dst_dir_fd=dfd)
    finally:
        os.close(dfd)


def dl_multi(j, d, part, first=None):
    """分段同時下載：每段一條連線，各自寫進檔案的對應位置"""
    fd = dl_at(d, os.path.basename(part), os.O_RDWR | os.O_CREAT)
    try:
        if d != os.environ.get("SENTINEL_DL_DIR"):
            try:
                os.fchown(fd, 1000, 1000)
            except OSError:
                pass
        if first:
            os.ftruncate(fd, j["total"])
        errs, ths, lock = [], [], threading.Lock()

        def work(seg, first):
            while True:
                dl_seg(j, seg, fd, errs, first)
                first = None
                if j["stop"] or errs:
                    return
                with lock:                         # 自己這段好了：把還剩最多的那段切一半來下載
                    big = max(j["segs"], key=lambda s: s[1] - s[0] - s[2])
                    left = big[1] - big[0] - big[2]
                    if left < DL_STEAL:
                        return
                    mid = big[0] + big[2] + left // 2
                    seg = [mid, big[1], 0]
                    j["segs"].append(seg)          # 先加新的一段再縮短舊的：中途存檔也不會少一塊
                    big[1] = mid
        for i, seg in enumerate(list(j["segs"])):
            if seg[2] < seg[1] - seg[0]:
                t = threading.Thread(target=work, args=(seg, first if i == 0 else None), daemon=True)
                t.start()
                ths.append(t)
        t0, d0, saved = time.monotonic(), sum(min(s[2], s[1] - s[0]) for s in j["segs"]), time.monotonic()
        checked = d0
        while any(t.is_alive() for t in ths):
            time.sleep(.5)
            j["done"] = sum(min(s[2], s[1] - s[0]) for s in j["segs"])
            now = time.monotonic()
            if now - t0 >= 1:
                v = (j["done"] - d0) / (now - t0)
                j["bps"] = v if not j.get("bps") else j["bps"] * .6 + v * .4
                t0, d0 = now, j["done"]
            if now - saved > 10:                   # 存一下進度，哨兵重新啟動後每段從斷掉的地方接著
                saved = now
                dl_save()
            if j["done"] - checked > 64 * 1024 * 1024:
                checked = j["done"]
                if dl_room(d) <= 0 and not errs:
                    errs.append(DlErr("空間不夠，先停下來了"))
        for t in ths:
            t.join()
        j["done"] = sum(min(s[2], s[1] - s[0]) for s in j["segs"])
        if j["stop"]:
            raise DlErr("已取消")
        if errs:
            raise errs[0]
    finally:
        os.close(fd)


# 影片網站（YouTube、Bilibili、X…）：主機上有裝開源的 yt-dlp 就交給它下載（哨兵不會自己下載或安裝程式，要在主機上裝好）。
# 有 ffmpeg 就下載最好畫質（影像、聲音分開下載再合併），沒有就下載單一檔案的最好畫質。用雲端硬碟的使用者（1000）身分執行。
YT_SITES = ("youtube.com", "youtu.be", "bilibili.com", "b23.tv", "twitter.com", "x.com", "instagram.com", "tiktok.com",
            "vimeo.com", "facebook.com", "fb.watch", "twitch.tv", "dailymotion.com", "nicovideo.jp", "threads.net", "reddit.com",
            "douyin.com", "iesdouyin.com", "xiaohongshu.com", "xhslink.com", "kuaishou.com", "weibo.com")


def yt_site(url):
    h = (urllib.parse.urlsplit(url).hostname or "").lower()
    return any(h == s or h.endswith("." + s) for s in YT_SITES)


def yt_bin():
    return os.environ.get("SENTINEL_YTDLP") or shutil.which("yt-dlp")


YT_COOKIES = os.path.join(DATA_DIR, "yt-cookies.txt")   # YouTube 登入資料（cookies.txt），YouTube 擋機房主機時用
YT_WARP = 40000                                   # 主機上的 Cloudflare WARP（代理模式）用的連接埠；有開就讓影片經過它下載
YT_PX = {"t": 0, "v": ""}


def yt_update_loop():
    """yt-dlp、deno 每天用它們自己的更新功能更新一次（網站一改版，舊版就下載不了）"""
    time.sleep(600)
    while True:
        b = None if os.environ.get("SENTINEL_YTDLP") else shutil.which("yt-dlp")
        for cmd in ([b, "-U"] if b else None, [shutil.which("deno"), "upgrade"] if shutil.which("deno") else None):
            if not cmd:
                continue
            try:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=600, stdin=subprocess.DEVNULL)
                out = (r.stdout + r.stderr).strip().splitlines()
                log(f"更新 {os.path.basename(cmd[0])}：{out[-1][:150] if out else r.returncode}")
            except (OSError, subprocess.SubprocessError) as e:
                log(f"更新 {os.path.basename(cmd[0])} 失敗：{e!r}")
        time.sleep(86400)


def yt_proxy():
    """設定檔的 YT_PROXY；沒設定就看主機上有沒有開 WARP（結果記 30 秒）"""
    if C.get("YT_PROXY"):
        return C["YT_PROXY"]
    if time.time() - YT_PX["t"] > 30:
        try:
            socket.create_connection(("127.0.0.1", YT_WARP), .5).close()
            YT_PX["v"] = f"socks5://127.0.0.1:{YT_WARP}"
        except OSError:
            YT_PX["v"] = ""
        YT_PX["t"] = time.time()
    return YT_PX["v"]


def yt_cookies_set(text):
    """存（或清掉）網站登入資料：瀏覽器擴充功能匯出的 cookies.txt 內容；不同網站的分開貼，會合在一起"""
    text = str(text or "").strip()
    if not text:
        try:
            os.remove(YT_COOKIES)
        except FileNotFoundError:
            pass
        return True, "已清除登入資料"
    rows = [x for x in text.splitlines() if re.match(r"^\S+\t(TRUE|FALSE)\t", x)]
    if len(text) > 300000 or not rows:
        return False, "格式不對，請貼上 cookies.txt 的內容"
    site = lambda x: x.split("\t", 1)[0].removeprefix("#HttpOnly_").lstrip(".").lower()
    new = {site(x) for x in rows}
    try:
        with open(YT_COOKIES, encoding="utf-8") as f:
            old = [x for x in f.read().splitlines() if re.match(r"^\S+\t(TRUE|FALSE)\t", x) and site(x) not in new]
    except OSError:
        old = []
    tmp = YT_COOKIES + ".tmp"
    with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write("# Netscape HTTP Cookie File\n" + "\n".join(old + rows) + "\n")
    os.replace(tmp, YT_COOKIES)
    return True, "已儲存登入資料"


def yt_err(lines):
    t = "\n".join(lines[-20:])
    for k, v in (("confirm you", "YouTube 擋了這台主機，請開 WARP 或貼上登入資料"),
                 ("Fresh cookies", "抖音擋了這台主機，請貼上抖音的登入資料"),
                 ("HTTP Error 412", "網站擋了這台主機，請貼上那個網站的登入資料"),
                 ("JavaScript runtime", "YouTube 要先在主機上裝 deno 才能下載"),
                 ("nsig extraction", "yt-dlp 太舊了，請更新"), ("Unable to extract", "yt-dlp 太舊了，請更新"),
                 ("Requested format is not available", "yt-dlp 太舊了，請更新"), ("Sign in", "要登入才能看這部影片"),
                 ("Unsupported URL", "這個網址不是檔案，也找不到影片"), ("Private video", "這是私人影片"),
                 ("not available in your country", "這台主機所在的地區看不到這部影片"), ("unavailable", "影片看不到了"),
                 ("HTTP Error 404", "找不到這部影片（404）"), ("No space left", "空間不夠")):
        if k in t:
            if k == "Unsupported URL":             # 附上被轉到哪裡（不含 ? 後面），方便查原因
                m = re.search(r"Unsupported URL: https?://([^\s?#]+)", t)
                if m and re.search(r"/(login|passport|signin)", m.group(1)):
                    return "要登入才能下載，請貼上那個網站的登入資料"   # 被轉到登入頁：跟被擋一樣，有登入資料就再試
                return v + (f"（{m.group(1)[:80]}）" if m else "")
            return v
    last = next((x for x in reversed(lines) if x.startswith("ERROR:")), "")
    return "影片下載失敗" + (f"（{last[6:].strip()[:120]}）" if last else "")   # 看不懂的錯誤附原文，方便查


def dl_video(j, d):
    """先不用登入資料下載（有 WARP 就經過它）；被擋了、又有登入資料，再用登入資料試一次"""
    try:
        yt_run(j, d, False)
    except DlErr as e:
        if not (str(e).startswith(("YouTube 擋了", "抖音擋了", "網站擋了", "要登入")) and os.path.isfile(YT_COOKIES)):
            raise
        yt_run(j, d, True)


YT_SHORT = ("xhslink.com", "b23.tv", "v.douyin.com", "bili2233.cn")


def yt_host(url):
    h = (urllib.parse.urlsplit(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


def yt_fix(url):
    """短網址（小紅書、B 站、抖音）先自己轉址，再換成 yt-dlp 認得的標準網址（短網址常常擋 yt-dlp，或 yt-dlp 認不得）"""
    final = url
    if yt_host(url) in YT_SHORT:
        try:
            r, c, final = dl_open(url, ua="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
                                          "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                                  stop=lambda u: yt_host(u) not in YT_SHORT)
            if c:
                c.close()
        except DlErr:
            return url
    h = yt_host(final)
    flat = urllib.parse.unquote(urllib.parse.unquote(final))
    if h == "xiaohongshu.com" or h.endswith(".xiaohongshu.com"):
        m = re.search(r"/(?:explore|discovery/item|item|profile/[0-9a-f]+)/([0-9a-f]{24})", flat) or \
            re.search(r"(?<![0-9a-f])([0-9a-f]{24})(?![0-9a-f])", urllib.parse.urlsplit(flat).path)
        if m:
            tok = re.search(r"xsec_token=([\w=-]+)", flat)
            return f"https://www.xiaohongshu.com/explore/{m.group(1)}" + (f"?xsec_token={tok.group(1)}&xsec_source=pc_share" if tok else "")
    elif h.endswith("bilibili.com"):
        m = re.search(r"/video/(BV\w{10}|av\d+)", flat)
        if m:
            p = re.search(r"[?&]p=(\d+)", flat)
            return f"https://www.bilibili.com/video/{m.group(1)}/" + (f"?p={p.group(1)}" if p else "")
    elif h.endswith("douyin.com"):
        m = re.search(r"/(?:video|note)/(\d{8,})", flat) or re.search(r"modal_id=(\d{8,})", flat)
        if m:
            return f"https://www.douyin.com/video/{m.group(1)}"
    return final


def yt_run(j, d, cookies):
    """用 yt-dlp 下載影片，邊下載邊讀進度"""
    b = yt_bin()
    if not b:
        raise DlErr("要先在主機上裝 yt-dlp 才能下載影片")
    ff = bool(shutil.which("ffmpeg"))
    cmd = [b, "--no-playlist", "--newline", "--progress", "--no-simulate", "--no-cache-dir", "--no-mtime", "--no-colors",
           "-N", str(DL_SEGS), "-f", "bv*+ba/b" if ff else "b", *(["--merge-output-format", "mp4"] if ff else []),
           "--progress-template", "download:VSP %(progress.downloaded_bytes)s %(progress.total_bytes)s "
                                  "%(progress.total_bytes_estimate)s %(progress.speed)s",
           "--print", "video:VSN %(id)s %(title)s", "--print", "after_move:VSF %(filepath)s",
           "-o", os.path.join(d, "%(title).80s [%(id)s].%(ext)s")]
    px, ck = yt_proxy(), None
    if px:
        cmd += ["--proxy", px]
    if cookies:                                    # 登入資料只給 YouTube 用；複製一份給 yt-dlp（它會改寫）
        fd, ck = tempfile.mkstemp(prefix="vs-yt-", suffix=".txt")
        with os.fdopen(fd, "w") as f, open(YT_COOKIES, encoding="utf-8") as src:
            f.write(src.read())
        cmd += ["--cookies", ck]
    cmd += ["--", yt_fix(j["url"])]
    kw = {}
    if os.geteuid() == 0 and d != os.environ.get("SENTINEL_DL_DIR"):
        kw = {"user": 1000, "group": 1000, "extra_groups": []}   # 用雲端硬碟的使用者身分執行，下載的檔案也是它的
        if ck:
            os.chown(ck, 1000, 1000)
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, cwd=d,
                         env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": "/tmp", "LANG": "C.UTF-8"}, **kw)
    why = []

    def watch():                                   # 取消、空間不夠：直接停掉 yt-dlp
        while p.poll() is None:
            if j["stop"] or dl_room(d) <= 0:
                why.append("已取消" if j["stop"] else "空間不夠，先停下來了")
                p.kill()
                return
            time.sleep(1)
    threading.Thread(target=watch, daemon=True).start()
    lines, vid, base, last, final = deque(maxlen=40), "", 0, 0, ""
    for raw in p.stdout:
        line = raw.decode("utf-8", "replace").strip()
        if line.startswith("VSN "):
            vid, _, title = line[4:].partition(" ")
            j["name"] = dl_safe(title) if title else j.get("name")
        elif line.startswith("VSP "):
            n = [_num(x, 0) for x in line[4:].split()]
            got, tot, est, spd = (n + [0, 0, 0, 0])[:4]
            if got < last * .5:                    # 影像下載完換聲音：前面的算進已下載
                base += last
            last = got
            j["done"] = int(base + got)
            j["total"] = int(base + (tot or est)) if tot or est else 0
            j["bps"] = spd
        elif line.startswith("VSF "):
            final = line[4:]
        elif line:
            lines.append(line)
    p.wait()
    if ck:
        try:
            os.remove(ck)
        except OSError:
            pass
    if why or p.returncode or not final:
        if vid:                                    # 清掉下載到一半的檔案
            for f in glob.glob(os.path.join(glob.escape(d), f"*[[]{glob.escape(vid)}[]]*")):
                if why or f.endswith((".part", ".ytdl")) or re.search(r"\.f\d+\.\w+$", f):
                    try:
                        os.remove(f)
                    except OSError:
                        pass
        raise DlErr(why[0] if why else yt_err(list(lines)))
    j["name"] = os.path.basename(final)
    try:
        j["done"] = j["total"] = os.path.getsize(final)
    except OSError:
        pass


def dl_file(j, d):
    """一般檔案：下載到「檔名.下載中」，回傳 (這個檔案, 連線)；是網頁而且主機有 yt-dlp 就改當影片"""
    part, c = None, None
    old = os.path.join(d, j["name"] + DL_PART) if j.get("name") else None
    if j.get("segs") and old and os.path.isfile(old) and os.path.getsize(old) == j.get("total"):
        part = old                                 # 上次分段下載到一半：每段接著下載
        dl_multi(j, d, part)
    else:
        if j.get("segs") and old and os.path.isfile(old):
            os.remove(old)                         # 分段的進度對不上：從頭來
        j["segs"] = None
        start = os.path.getsize(old) if old and os.path.isfile(old) else 0   # 上次下載到一半：接著下載
        r, c, final = dl_open(j["url"], start)
        page = not start and (r.getheader("Content-Type") or "").lower().startswith("text/html")
        if page and yt_bin():                      # 是網頁不是檔案：交給 yt-dlp 看看裡面有沒有影片
            c.close()
            j["kind"] = "video"
            return None, None
        if start and r.status != 206:           # 對方不支援接續：從頭來（舊的半個檔案刪掉，不然會一直佔著空間）
            start = 0
            os.remove(old)
        if not j.get("name") or not start:
            j["name"] = dl_unique(d, j.get("name") or dl_name(r, final), j)
        part = os.path.join(d, j["name"] + DL_PART)
        try:
            rest = int(r.getheader("Content-Length") or 0)
        except ValueError:
            rest = 0
        j["total"], j["done"] = (start + rest if rest else 0), start
        room = dl_room(d)
        if rest and rest > room:
            raise DlErr(f"空間不夠（要 {dl_size(rest)}，只剩 {dl_size(room)}）")
        if os.path.islink(part):
            os.remove(part)
        if not start and r.status == 200 and rest >= DL_SEG_MIN and (r.getheader("Accept-Ranges") or "").lower() == "bytes":
            n = min(DL_SEGS_MAX, max(DL_SEGS, rest >> 25))   # 檔案夠大、對方支援分段：分成幾段同時下載
            step = -(-rest // n)
            j["segs"] = [[i * step, min(rest, (i + 1) * step), 0] for i in range(n) if i * step < rest]
            dl_save()
            dl_multi(j, d, part, (r, c))
        else:
            dl_save()
            dl_one(j, d, part, r, start, rest)
    return part, c


def dl_run(j):
    d, part, c = None, None, None
    try:
        d = dl_dir()
        if not d:
            raise DlErr("這台沒有雲端硬碟")
        if yt_site(j["url"]):
            j["kind"] = "video"
        if j.get("kind") != "video":
            part, c = dl_file(j, d)
        if j.get("kind") == "video":
            dl_video(j, d)
        else:
            if j["total"] and j["done"] < j["total"]:
                raise DlErr("連線中斷了")
            dst = os.path.join(d, dl_unique(d, j["name"], j) if os.path.lexists(os.path.join(d, j["name"])) else j["name"])
            dl_move(d, os.path.basename(part), os.path.basename(dst))
            j["name"] = os.path.basename(dst)
        j.update(st="ok", total=j["done"], t_end=time.time(), err="", segs=None, tries=0)
        COL.add_event("info", f"下載好了：{j['name']}（{dl_size(j['done'])}）")
        log(f"下載完成：{j['name']}")
    except Exception as e:  # noqa: BLE001
        msg = dl_err(e)
        if not j["stop"] and j.get("kind") != "video" and msg in DL_AGAIN and j.get("tries", 0) < 3:
            j["tries"] = j.get("tries", 0) + 1     # 網路不穩：等一下自己再接著下載（最多 3 次）
            j.update(st="wait", err=f"{msg}，等一下會自己再試", bps=0, after=time.time() + DL_AGAIN_WAIT * j["tries"])
            threading.Timer(DL_AGAIN_WAIT * j["tries"] + .1, dl_kick).start()
            log(f"下載中斷，稍後再試：{j['url'][:100]}：{e!r}")
            return
        j.update(st="bad", err=msg, t_end=time.time())
        if not part and d and j.get("name") and j.get("kind") != "video":
            part = os.path.join(d, j["name"] + DL_PART)
        if part and os.path.isfile(part) and (j["stop"] or msg.startswith("空間不夠")):
            try:
                os.remove(part)
            except OSError:
                pass
            j["segs"] = None
        if not j["stop"]:
            COL.add_event("bad", f"下載失敗：{dl_label(j)}，{msg}")
            log(f"下載失敗：{j['url'][:100]}：{e!r}")
    finally:
        if c:
            c.close()
        j["bps"] = 0
        if j["stop"]:                              # 取消的就不留在清單上
            with DL_LOCK:
                if j in DL:
                    DL.remove(j)
        dl_save()
        dl_kick()


def dl_one(j, d, part, r, start, rest):
    """一條連線從頭（或從 start）下載到完"""
    with os.fdopen(dl_at(d, os.path.basename(part), os.O_WRONLY | os.O_CREAT | (os.O_APPEND if start else os.O_TRUNC)), "ab" if start else "wb") as f:
        if d != os.environ.get("SENTINEL_DL_DIR"):
            try:
                os.fchown(f.fileno(), 1000, 1000)
            except OSError:
                pass
        t0, d0, checked = time.monotonic(), j["done"], j["done"]
        while True:
            if j["stop"]:
                raise DlErr("已取消")
            buf = r.read1(1 << 20) if hasattr(r, "read1") else r.read(1 << 16)
            if not buf:
                break
            f.write(buf)
            j["done"] += len(buf)
            now = time.monotonic()
            if now - t0 >= 1:
                v = (j["done"] - d0) / (now - t0)
                j["bps"] = v if not j.get("bps") else j["bps"] * .6 + v * .4
                t0, d0 = now, j["done"]
            if j["done"] - checked > 64 * 1024 * 1024:     # 每 64 MB 看一次還有沒有空間（可能同時在下載好幾個）
                checked = j["done"]
                if dl_room(d) <= 0:
                    raise DlErr("空間不夠，先停下來了")


def dl_label(j):
    """還不知道檔名時，用網址最後一段（沒有就用網域）"""
    u = urllib.parse.urlsplit(j["url"])
    if j.get("name"):
        return j["name"]
    if u.path.strip("/"):
        return dl_safe(urllib.parse.unquote(u.path.rstrip("/").rsplit("/", 1)[-1]))
    return u.hostname or "檔案"


def dl_public(j):
    return {**{k: j.get(k) for k in ("id", "url", "name", "st", "done", "total", "bps", "err", "t", "t_end")},
            "label": dl_label(j)}


def dl_status():
    d = None
    try:
        d = dl_dir()
    except OSError:
        pass
    with DL_LOCK:
        items = [dl_public(j) for j in reversed(DL)]
    return {"ok": True, "list": items, "cloud": bool(d), "room": dl_room(d) if d else 0, "folder": DL_SUB,
            "yt": {"tool": bool(yt_bin()), "cookies": os.path.isfile(YT_COOKIES), "warp": bool(yt_proxy())}}


def dl_pick(text):
    """從分享文字（抖音、小紅書、B 站複製出來會帶標題）裡挑出網址"""
    m = re.search(r"(?i)https?://[!#-&(-;=?-~]+", str(text or ""))
    return m.group(0).rstrip(".,;:!?)]}'\"") if m else str(text or "").strip()


def dl_add(url):
    url = dl_pick(url)
    if not re.match(r"(?i)https?://", url):
        return False, "只能下載 http 或 https 開頭的連結"
    if len(url) > 4000 or re.search(r"[\x00-\x20\x7f]", url):
        return False, "這個連結不對"
    try:
        d = dl_dir()
    except OSError as e:
        return False, f"沒辦法建立下載資料夾：{e}"
    if not d:
        return False, "這台沒有雲端硬碟"
    try:
        dl_addrs(urllib.parse.urlsplit(url).hostname or "", 443)
    except DlErr as e:
        return False, str(e)
    with DL_LOCK:
        if sum(j["st"] in ("wait", "run") for j in DL) >= DL_LIST_MAX:
            return False, "排隊的太多了，等一下再加"
        if any(j["url"] == url and j["st"] in ("wait", "run") for j in DL):
            return False, "這個連結已經在下載了"
        DL.append({"id": secrets.token_hex(6), "url": url, "name": "", "st": "wait", "done": 0, "total": 0,
                   "bps": 0, "err": "", "t": time.time(), "t_end": 0, "stop": False})
        while len(DL) > DL_LIST_MAX:              # 太多了：拿掉最舊的已結束的
            old = next((x for x in DL if x["st"] in ("ok", "bad")), None)
            if not old:
                break
            DL.remove(old)
    dl_save()
    dl_kick()
    return True, "開始下載"


def dl_stop(jid):
    """下載中＝取消；已結束＝從清單拿掉（檔案不會刪）"""
    with DL_LOCK:
        j = next((x for x in DL if x["id"] == jid), None)
        if not j:
            return False, "找不到這筆下載"
        if j["st"] == "run":
            j["stop"] = True
            return True, "已取消"
        if j["st"] == "wait":
            j.update(st="bad", err="已取消", stop=True, t_end=time.time())
        DL.remove(j)
    if j.get("name") and j["st"] != "ok":         # 排隊中或失敗的：下載到一半的檔案也清掉
        try:
            d = dl_dir()
            if d and os.path.isfile(os.path.join(d, j["name"] + DL_PART)):
                os.remove(os.path.join(d, j["name"] + DL_PART))
        except OSError:
            pass
    dl_save()
    return True, "已移除"


def dl_retry(jid):
    with DL_LOCK:
        j = next((x for x in DL if x["id"] == jid), None)
        if not j or j["st"] != "bad":
            return False, "找不到這筆下載"
        j.update(st="wait", err="", stop=False, bps=0, t=time.time(), t_end=0, tries=0)
    dl_save()
    dl_kick()
    return True, "重新下載"
