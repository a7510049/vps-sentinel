"""VPS 哨兵：每日備份、網頁還原。sentinel.py 用 include("backup.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）"""

# ───────────────────────── 每日備份 ─────────────────────────
# 每天清晨把這台主機上重要的設定打包（3x-ui、n8n、哨兵自己、Caddy／nginx、憑證…），加密成哨兵備份檔（.vsbk）。
# 每台主機的雲端硬碟「哨兵備份」資料夾裡，都放著「每一台」的備份（一台一個資料夾）；Telegram 上也有一份。
# 主要那台（有設定其他主機的）負責：把解開密碼同步給其他台、把自己的備份送過去、把其他台的拿回來。
# 所有主機共用同一組解開密碼。


def bk_safe(s):
    """主機名稱 → 可以當檔名、資料夾名稱的字（只換掉檔名不能用的符號，空白和中文照留）"""
    return re.sub(r'[\\/:*?"<>|\x00-\x1f\x7f]+', "_", str(s or "")).strip(" ._")[:40] or "host"


def _bk_safe_v130(s):
    """1.30～1.31 版的資料夾名稱（空白也換成底線），搬到新名稱用"""
    return re.sub(r'[\\/:*?"<>|\s]+', "_", str(s or "")).strip("._")[:40] or "host"


def bk_time(t):
    """備份檔名上的時間：所有主機都用同一個時區（使用者瀏覽器的），才不會一台差一小時"""
    if BACKUP_TZ is None:
        return datetime.fromtimestamp(t)
    return datetime.fromtimestamp(t, timezone(timedelta(minutes=BACKUP_TZ)))


def bk_fname(name, t, folder):
    """「主機名稱 2026-10-13 04.00.vsbk」；同一分鐘做了兩份就加 (2)"""
    base = f"{bk_safe(name)} {bk_time(t):%Y-%m-%d %H.%M}"
    f, i = base + ".vsbk", 2
    while os.path.exists(os.path.join(folder, f)):
        f, i = f"{base} ({i}).vsbk", i + 1
    return f


def bk_set_tz(tz):
    global BACKUP_TZ
    try:
        tz = int(tz)
    except (TypeError, ValueError):
        return False
    if not -14 * 60 <= tz <= 14 * 60:
        return False
    if tz != BACKUP_TZ:
        try:
            write_conf({"BACKUP_TZ": str(tz)})
        except OSError:
            return False
        BACKUP_TZ = tz
    return True


def bk_key():
    global BACKUP_KEY
    if not BACKUP_KEY:
        abc = "abcdefghjkmnpqrstuvwxyz23456789"   # 去掉容易看錯的 i、l、o、0、1
        key = "-".join("".join(secrets.choice(abc) for _ in range(5)) for _ in range(4))
        write_conf({"BACKUP_KEY": key})
        BACKUP_KEY = key
    return BACKUP_KEY


def bk_key_ok(key):
    return (isinstance(key, str) and 8 <= len(key) <= 128 and key == key.strip() and not re.search(r"[\r\n]", key)
            and key[0] not in "'\"" and key[-1] not in "'\"")


def bk_set_key(key, sync=False):
    """換解開密碼；sync＝順便告訴其他主機（之後的備份都用新密碼，以前的備份還是要用舊密碼開）"""
    global BACKUP_KEY
    if not bk_key_ok(key):
        return False, "密碼要 8 到 128 個字，前後不能有空白或引號"
    if key != BACKUP_KEY:
        try:
            write_conf({"BACKUP_KEY": key})
        except OSError as e:
            return False, f"無法寫入設定檔：{e}"
        BACKUP_KEY = key
        with COL.lock:
            BK["key_t"] = time.time()             # 之前打包好的（舊密碼）不再拿來用
    if not sync:
        return True, "已換成新的解開密碼"
    bad = [f"「{bk_peer_name(p)}」{msg}" for p in PEERS for ok, msg in [bk_send_key(p)] if not ok]
    return True, "已換成新的解開密碼" + (f"（{'、'.join(bad)}，下次備份時會再同步）" if bad else "，所有主機都改好了" if PEERS else "")


def bk_peer_name(peer):
    """其他主機在網頁上顯示的名稱（那台自己的名稱）；還不知道的話先用代號"""
    return BK["names"].get(peer["name"]) or peer["name"]


def bk_learn_name(key, name):
    """記下主機現在的名稱；回傳它以前用過的名稱（改名時要把舊資料夾搬過來）"""
    old = BK["names"].get(key)
    if name and name != old:
        with COL.lock:
            BK["names"][key] = name
    return tuple(x for x in (old,) if x and x != name)


def bk_send_key(peer):
    """讓那台用同一組解開密碼、同一個時區；順便問它現在叫什麼名字"""
    try:
        body = {"action": "key", "key": bk_key(), **({"tz": BACKUP_TZ} if BACKUP_TZ is not None else {})}
        req = urllib.request.Request(peer["url"] + "/api/backup", method="POST", data=json.dumps(body).encode(),
                                     headers={"X-Token": peer["token"], "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
        if d.get("name"):
            bk_learn_name(peer["name"], str(d["name"])[:40])
        return bool(d.get("ok")), d.get("message") or ""
    except urllib.error.HTTPError as e:
        return False, "還沒更新到新版" if e.code in (400, 404) else f"錯誤 {e.code}"
    except Exception as e:  # noqa: BLE001
        return False, peer_error(e, peer["url"])


def bk_cloud():
    return os.path.ismount(CLOUD_DIR)


def bk_root():
    """所有主機的備份都放這裡，一台一個資料夾；有雲端硬碟就放雲端硬碟，打開雲端硬碟就看得到"""
    return os.path.join(CLOUD_DIR, BK_CLOUD_SUB) if bk_cloud() else BK_LOCAL_DIR


def bk_where():
    return "雲端硬碟" if bk_cloud() else "主機上"


def bk_dir(name, aliases=()):
    """這台主機的備份資料夾（用主機自己的名稱）；aliases＝它以前可能用過的資料夾名稱，裡面的備份會搬過來並改成新的檔名"""
    d = os.path.join(bk_root(), bk_safe(name))
    cloud = bk_cloud()
    for p in (bk_root(), d):                       # 雲端硬碟裡的東西別人改得到：資料夾被換成捷徑（例如指到 /etc）就拿掉重建
        if os.path.islink(p):
            os.remove(p)
    os.makedirs(d, mode=0o755 if cloud else 0o700, exist_ok=True)
    if cloud:                                      # 雲端硬碟程式用編號 1000 的使用者在跑：要改成它的，才刪得掉
        for p in (bk_root(), d):
            try:
                os.lchown(p, 1000, 1000)
            except OSError:
                pass
    olds = {os.path.join(bk_root(), x) for a in (name, *aliases) for x in (bk_safe(a), _bk_safe_v130(a))} - {d}
    for od in olds:
        if not os.path.isdir(od) or os.path.islink(od):
            continue
        for f in bk_list(od):
            try:
                t = os.path.getmtime(f)
                nf = os.path.join(d, bk_fname(name, t, d))
                os.replace(f, nf)
                os.utime(nf, (t, t))
            except OSError:
                pass
        try:
            os.rmdir(od)
        except OSError:
            pass
    for f in bk_list(d):                           # 1.31 版的檔名（主機名稱-20261013-162242）也改成新的
        b = os.path.basename(f)
        if re.fullmatch(r".+-\d{8}-\d{6}\.vsbk", b):
            try:
                t = os.path.getmtime(f)
                nf = os.path.join(d, bk_fname(name, t, d))
                os.replace(f, nf)
                os.utime(nf, (t, t))
            except OSError:
                pass
    bk_prune(d)
    return d


def bk_own(path):
    if bk_cloud():
        try:
            os.lchown(path, 1000, 1000)
        except OSError:
            pass
    else:
        os.chmod(path, 0o600)


def bk_list(folder):
    try:
        fs = [os.path.join(folder, f) for f in os.listdir(folder) if f.endswith(".vsbk")]
    except OSError:
        return []

    def mt(f):
        try:
            return os.lstat(f).st_mtime
        except OSError:                            # 剛好被刪掉
            return 0
    return sorted((f for f in fs if not os.path.islink(f)), key=mt)


def bk_prune(folder):
    for f in bk_list(folder)[:-BACKUP_KEEP]:
        try:
            os.remove(f)
        except OSError:
            pass


def bk_cleanup_legacy():
    """1.30 版的備份沒有加密（只有 Telegram 上那份有），換成新格式後把它們刪掉"""
    pats = [os.path.join(BK_LOCAL_DIR, "*.tar.gz"), os.path.join(DATA_DIR, "peer-backups", "*", "*.tar.gz"),
            os.path.join(CLOUD_DIR, BK_CLOUD_SUB, "*", "*.tar.gz")]
    for f in (f for p in pats for f in glob.glob(p)):
        try:
            os.remove(f)
        except OSError:
            pass
    for d in glob.glob(os.path.join(DATA_DIR, "peer-backups", "*")) + [os.path.join(DATA_DIR, "peer-backups")]:
        try:
            os.rmdir(d)
        except OSError:
            pass


def n8n_containers():
    """n8n 容器的設定（還原時照這個把容器建回來）：[{name, image, env, ports, mounts, restart, network, compose}]"""
    out = []
    for c in docker_containers() or []:
        if "n8n" not in (c["image"] + " " + c["name"]).lower():
            continue
        info = (docker_json("inspect", c["name"]) or [{}])[0]
        cfg, host = info.get("Config") or {}, info.get("HostConfig") or {}
        img_env = set((((docker_json("image", "inspect", cfg.get("Image") or "") or [{}])[0].get("Config") or {}).get("Env") or []))
        ports = []
        for cp, binds in (host.get("PortBindings") or {}).items():
            for b in binds or []:
                ports.append(":".join(x for x in (b.get("HostIp") or "", b.get("HostPort") or "", cp) if x))
        out.append({"name": c["name"], "image": cfg.get("Image") or c["image"],
                    "env": [e for e in cfg.get("Env") or [] if e not in img_env],     # 映像檔本來就有的不用記
                    "ports": ports, "restart": (host.get("RestartPolicy") or {}).get("Name") or "",
                    "network": host.get("NetworkMode") or "",
                    "mounts": [{"type": m.get("Type"), "name": m.get("Name") or "", "source": m.get("Source") or "",
                                "dest": m.get("Destination") or ""} for m in info.get("Mounts") or []],
                    "compose": (cfg.get("Labels") or {}).get("com.docker.compose.project.working_dir") or ""})
    return out


def n8n_dirs(cs):
    """n8n 的資料（docker 的資料卷或掛進去的資料夾）和 docker compose 的設定資料夾"""
    return [m["source"] for c in cs for m in c["mounts"] if m["source"]] + [c["compose"] for c in cs if c["compose"]]


def xui_cert_paths(db="/etc/x-ui/x-ui.db"):
    """3x-ui 設定裡用到的憑證和私鑰（後台的、訂閱的、各個連線的）；放在別的資料夾也要一起備份，不然還原後 3x-ui 開不起來"""
    out = []
    if not os.path.isfile(db):
        return out
    try:
        con = sqlite3.connect(f"file:{urllib.parse.quote(db)}?mode=ro", uri=True, timeout=10)
        try:
            out += [v for (v,) in con.execute("SELECT value FROM settings WHERE key IN "
                                              "('webCertFile','webKeyFile','subCertFile','subKeyFile')")]
            for (ss,) in con.execute("SELECT stream_settings FROM inbounds"):
                try:
                    tls = (json.loads(ss or "{}") or {}).get("tlsSettings") or {}
                except ValueError:
                    continue
                for c in tls.get("certificates") or []:
                    out += [c.get("certificateFile"), c.get("keyFile")]
        finally:
            con.close()
    except sqlite3.Error:
        return []
    out = [p for p in out if isinstance(p, str) and p.startswith("/")]
    return out + [os.path.realpath(p) for p in out if os.path.islink(p)]   # 捷徑（例如 letsencrypt 的 live）連真正的檔案一起


def backup_sources(cs=None):
    """[(說明, [路徑…])]；只列出這台主機上真的有的（cs＝n8n 容器的設定）"""
    items = [("哨兵設定", [CONF_PATH, DATA_DIR]),
             ("3x-ui", ["/etc/x-ui", "/etc/systemd/system/x-ui.service"]),
             ("n8n", n8n_dirs(n8n_containers() if cs is None else cs)),
             ("Caddy", ["/etc/caddy"]),
             ("nginx", ["/etc/nginx"]),
             ("安全憑證", ["/root/.acme.sh", "/root/cert"] + xui_cert_paths()),
             ("排程", ["/var/spool/cron/crontabs/root"]),
             ("雲端硬碟設定", ["/opt/vps-cloud/data"]),
             ("其他", [p.strip() for p in C.get("BACKUP_PATHS", "").split(",") if p.strip()])]
    out = []
    for label, paths in items:
        paths = list(dict.fromkeys(p for p in paths if os.path.lexists(p)))
        if paths:
            out.append((label, paths))
    return out


def _bk_walk(top, skip):
    if not os.path.isdir(top) or os.path.islink(top):
        yield top
        return
    for root, dirs, files in os.walk(top):
        keep = []
        for d in dirs:
            p = os.path.join(root, d)
            if os.path.islink(p):
                yield p                            # 捷徑本身要留（例如 nginx 的 sites-enabled），不跟進去
            elif d.lower() not in BK_SKIP_DIRS and os.path.realpath(p) not in skip:
                keep.append(d)
        dirs[:] = keep
        for f in files:
            yield os.path.join(root, f)


def _is_sqlite(p):
    try:
        with open(p, "rb") as f:
            return f.read(16) == b"SQLite format 3\x00"
    except OSError:
        return False


def _sqlite_copy(src, dst):
    """資料庫正在使用中也能拿到完整的一份（直接複製可能剛好複製到寫一半的內容）"""
    s = sqlite3.connect(f"file:{urllib.parse.quote(src)}?mode=ro", uri=True, timeout=20)
    try:
        d = sqlite3.connect(dst)
        try:
            s.backup(d)
        finally:
            d.close()
    finally:
        s.close()


BK_README = """VPS 哨兵的備份：{name}（{when}）

內容：{items}

還原方法（會自動放回檔案、把服務重新啟動）：
  sudo python3 ~/vps-sentinel/sentinel.py --restore 備份檔.vsbk
詳細說明在哨兵網頁的「設定 → 備份 → 還原」。
"""


def xui_version():
    code, out = run(["/usr/local/x-ui/x-ui", "-v"], 10) if os.path.exists("/usr/local/x-ui/x-ui") else (1, "")
    m = re.search(r"v?(\d+\.\d+\.\d+)", out) if code == 0 else None
    return "v" + m.group(1) if m else ""


def _bk_tar(dst, td):
    """把要備份的東西打包成 dst（.tar.gz）；回傳 (包含哪些東西, 跳過的大檔)"""
    skip = {os.path.realpath(p) for p in (BK_LOCAL_DIR, os.path.join(DATA_DIR, "peer-backups"), CLOUD_DIR,
                                           *(os.path.join(DATA_DIR, x) for x in BK_REGEN))}
    labels, big, seen, n = [], [], set(), 0
    cs = n8n_containers()
    with tarfile.open(dst, "w:gz", compresslevel=6) as tar:
        for label, paths in backup_sources(cs):
            got = 0
            for top in paths:
                for p in _bk_walk(top, skip):
                    rp = os.path.abspath(p)
                    if rp in seen or os.path.realpath(p) in skip:
                        continue
                    seen.add(rp)
                    arc = rp.lstrip("/")
                    try:
                        st = os.lstat(p)
                        if os.path.islink(p):
                            tar.add(p, arc, recursive=False)
                        elif not stat.S_ISREG(st.st_mode):
                            continue
                        elif st.st_size > BK_FILE_MAX:
                            big.append(rp)
                            continue
                        elif re.search(r"-(wal|shm|journal)$", p) and os.path.exists(re.sub(r"-(wal|shm|journal)$", "", p)):
                            continue                      # 資料庫的暫存檔：下面複製資料庫時已經包含進去了
                        elif _is_sqlite(p):
                            n += 1
                            cp = os.path.join(td, f"db{n}")
                            try:
                                _sqlite_copy(p, cp)
                                info = tar.gettarinfo(p, arc)
                                info.size = os.path.getsize(cp)
                                with open(cp, "rb") as f:
                                    tar.addfile(info, f)
                                os.remove(cp)
                            except sqlite3.Error:
                                tar.add(p, arc, recursive=False)
                        else:
                            tar.add(p, arc, recursive=False)
                        got += 1
                    except OSError:
                        continue                          # 檔案剛好被刪掉或讀不到：跳過
            if got:
                labels.append(label)
        text = BK_README.format(name=NAME, when=f"{bk_time(time.time()):%Y-%m-%d %H:%M}",
                                items="、".join(labels) or "（沒有找到要備份的東西）").encode()
        info = tarfile.TarInfo(f"還原說明-{bk_safe(NAME)}.txt")
        info.size, info.mtime, info.mode = len(text), int(time.time()), 0o644
        tar.addfile(info, io.BytesIO(text))
        man = json.dumps({"name": NAME, "when": f"{bk_time(time.time()):%Y-%m-%d %H:%M}", "items": labels, "version": VERSION,
                          "conf": CONF_PATH, "xui_version": xui_version(),
                          "containers": cs if "n8n" in labels else []}, ensure_ascii=False, indent=1).encode()
        info = tarfile.TarInfo(RS_MANIFEST)                # 還原時用的資料：n8n 容器怎麼建、3x-ui 是哪一版…
        info.size, info.mtime, info.mode = len(man), int(time.time()), 0o600
        tar.addfile(info, io.BytesIO(man))
    return labels, big


def make_backup():
    """打包並加密一份這台的備份，回傳 (檔案路徑, 包含哪些東西, 跳過的大檔)"""
    folder = bk_dir(NAME, bk_learn_name("", NAME))
    path = os.path.join(folder, bk_fname(NAME, time.time(), folder))
    tmp = os.path.join(folder, f".{secrets.token_hex(6)}.part")   # 猜不到的名字：雲端硬碟裡沒辦法先放好捷徑等著被寫
    try:
        with tempfile.TemporaryDirectory() as td:
            os.chmod(td, 0o700)
            tgz = os.path.join(td, "backup.tar.gz")
            labels, big = _bk_tar(tgz, td)
            vsbk_encrypt(tgz, tmp, bk_key())
        bk_own(tmp)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    bk_prune(folder)
    return path, labels, big


def bk_latest(max_age):
    """這台最近一份備份；太舊、還沒有、或是換密碼之前做的，就馬上打包一份新的"""
    with BK_MAKE:
        since = max(time.time() - max_age, BK.get("key_t") or 0)
        fs = [f for f in bk_list(bk_dir(NAME, bk_learn_name("", NAME))) if os.path.getmtime(f) > since]
        if fs:
            return fs[-1], None
        path, labels, big = make_backup()
        return path, (labels, big)


def fmt_size(n):
    n = float(n or 0)
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return f"{n:.0f} {u}" if u in ("B", "KB") else f"{n:.1f} {u}"
        n /= 1024


def tg_send_file(path, filename, caption, start=0, size=None):
    """把檔案（或檔案裡從 start 開始的 size 個位元組）傳到 Telegram（最多 50 MB）；回傳 (失敗原因或空字串, 訊息編號)"""
    size = os.path.getsize(path) - start if size is None else size
    if size > max(TG_FILE_MAX, TG_PART):
        return f"檔案太大（{fmt_size(size)}），Telegram 只收 50 MB 以下的檔案", None
    b = "----vs" + secrets.token_hex(12)
    fields = {"chat_id": TG_CHAT, "caption": caption, "parse_mode": "HTML", "disable_notification": "true"}
    head = "".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in fields.items())
    filename = re.sub(r'[\x00-\x1f"\\]', "_", filename)          # 檔名不能有換行、引號，不然會混進別的欄位
    head += (f'--{b}\r\nContent-Disposition: form-data; name="document"; filename="{filename}"\r\n'
             "Content-Type: application/octet-stream\r\n\r\n")
    head, tail = head.encode(), f"\r\n--{b}--\r\n".encode()

    def body(f):                                   # 邊讀邊傳，不把整個檔案（最多 50 MB）放進記憶體
        yield head
        left = size
        while left > 0:
            chunk = f.read(min(left, 1 << 20))
            if not chunk:
                break
            left -= len(chunk)
            yield chunk
        yield tail
    try:
        with open(path, "rb") as f:
            f.seek(start)
            req = urllib.request.Request(TG_BASE + TG_BOT + "/sendDocument", data=body(f), headers={
                "Content-Type": f"multipart/form-data; boundary={b}",
                "Content-Length": str(len(head) + size + len(tail))})
            r = urllib.request.urlopen(req, timeout=300)
        with r:
            d = json.loads(r.read())
        return "", (d.get("result") or {}).get("message_id")
    except urllib.error.HTTPError as e:
        try:
            desc = json.loads(e.read()).get("description", "")
        except Exception:  # noqa: BLE001
            desc = ""
        if e.code == 413 or "too big" in desc:
            return "檔案太大，Telegram 不收", None
        return f"Telegram 回應錯誤：{desc or e.code}", None
    except Exception:  # noqa: BLE001
        return "連不上 Telegram", None


def tg_private():
    """通知是傳到私人對話（不是群組或頻道）：私人對話的編號是正的數字"""
    return TG_CHAT.isdigit()


def bk_to_tg(path, owner=None):
    """把備份檔（已經加密）傳到 Telegram；owner 是幫別台傳的時候那台的名稱。
    超過 Telegram 的 50 MB 就切成好幾段（「…第1／3段.vsbk」），還原時全部一起選就會自動接回來。
    私人對話會附上打碼的「這份自己的」解開密碼；傳成功後把同一台前一份備份的訊息刪掉，Telegram 裡每台只留最新一份"""
    owner = owner or NAME
    total = os.path.getsize(path)
    n = max(1, -(-total // TG_PART))
    if n > TG_PARTS_MAX:
        return f"備份太大（{fmt_size(total)}），Telegram 放不下"
    cap = f"🗄 <b>{html.escape(owner)}</b>　每日備份（{fmt_size(total)}{f'，分 {n} 段' if n > 1 else ''}）\n"
    pw = vsbk_pass_of(path, bk_key()) if tg_private() else ""
    if pw and owner != NAME:                       # 別台做的：確定這組真的打得開才附（那台的總密碼可能還沒同步）
        try:
            vsbk_decrypt(path, None, pw)
        except (ValueError, OSError):
            pw = ""
    if pw:
        cap += f"解開密碼：<tg-spoiler>{html.escape(pw)}</tg-spoiler>"   # 這份自己的密碼，只打得開這一份
    else:
        cap += "解開密碼在網頁的「設定 → 備份」"
    if n > 1:
        cap += f"\n還原時 {n} 段一起選"
    base = os.path.basename(path)
    mids = []
    for i in range(n):
        name = base if n == 1 else vsbk_part_name(base, i + 1, n)
        c = cap if i == 0 else f"🗄 <b>{html.escape(owner)}</b>　每日備份 第 {i + 1}／{n} 段"
        err, mid = tg_send_file(path, name, c, i * TG_PART, min(TG_PART, total - i * TG_PART))
        if err or not mid:
            for m in mids:                         # 沒傳完整：已經傳上去的幾段收回來，留著前一份完整的
                tg_api(TG_BOT, "deleteMessage", {"chat_id": TG_CHAT, "message_id": m})
            return err or "Telegram 沒有回應"
        mids.append(mid)
    old = BK["tg"].get(owner)
    BK["tg"][owner] = [TG_CHAT, *mids]
    for m in (old or [])[1:]:
        tg_api(TG_BOT, "deleteMessage", {"chat_id": old[0], "message_id": m})   # 超過 48 小時的 Telegram 不讓刪，就留著
    return ""


def bk_store(src, fname, stream, length, aliases=()):
    """把其他主機傳來的備份存在這台（src＝那台自己的名稱）；回傳 (成功, 說明, 存放位置)"""
    if not re.fullmatch(r'[^/\\\x00-\x1f"]{1,120}\.vsbk', fname or "") or fname.startswith("."):
        return False, "檔名不對", None
    if bk_safe(src) == bk_safe(NAME):              # 那台跟這台同名：分開放，不然會跟這台自己的備份混在一起、被當成這台的刪掉
        src = f"{src} 2"
    aliases = tuple(a for a in aliases if bk_safe(a) != bk_safe(NAME))
    if not 0 < length <= BK_UPLOAD_MAX:
        return False, "檔案大小不對", None
    folder = bk_dir(src, aliases)
    where = bk_where()
    if shutil.disk_usage(folder).free < length + 50 * 1024 * 1024:
        return False, f"{where}的空間不夠", None
    dest = os.path.join(folder, fname if not os.path.exists(os.path.join(folder, fname)) else bk_fname(src, time.time(), folder))
    tmp = os.path.join(folder, f".{secrets.token_hex(6)}.part")
    try:
        left = length
        with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as f:
            while left > 0:
                chunk = stream.read(min(left, 1 << 20))
                if not chunk:
                    raise OSError("傳到一半斷掉了")
                f.write(chunk)
                left -= len(chunk)
        bk_own(tmp)
        os.replace(tmp, dest)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False, f"存檔失敗：{e}", None
    bk_prune(folder)
    return True, where, dest


def bk_push(peer, path):
    """把這台的備份傳給另一台存起來"""
    was = BK["names"].get("~" + peer["name"], "")            # 上次送過去時這台叫什麼（改名後那邊要把舊資料夾搬過來）
    q = urllib.parse.urlencode({"from": NAME, "file": os.path.basename(path), "was": was if was != NAME else ""})
    try:
        with open(path, "rb") as f:
            req = urllib.request.Request(peer["url"] + "/api/backup-store?" + q, data=f, method="POST",
                                         headers={"X-Token": peer["token"], "Content-Type": "application/octet-stream",
                                                  "Content-Length": str(os.path.getsize(path))})
            with urllib.request.urlopen(req, timeout=900) as r:
                d = json.loads(r.read())
        if d.get("ok"):
            bk_learn_name("~" + peer["name"], NAME)
        return bool(d.get("ok")), d.get("message") or ""
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, "那台還沒更新到新版"
        try:
            return False, json.loads(e.read()).get("message") or f"錯誤 {e.code}"
        except ValueError:
            return False, f"錯誤 {e.code}"
    except Exception as e:  # noqa: BLE001
        return False, peer_error(e, peer["url"])


def bk_pull(peer):
    """把另一台的最新備份拿過來存在這台；那台沒設定 Telegram 的話順便幫它傳；回傳 (成功, 說明)"""
    try:
        req = urllib.request.Request(peer["url"] + "/api/backup-file?fresh=1", headers={"X-Token": peer["token"]})
        with urllib.request.urlopen(req, timeout=900) as r:
            name = urllib.parse.unquote(r.headers.get("X-Backup-Name") or "")
            real = urllib.parse.unquote(r.headers.get("X-Backup-Host") or "")[:40] or bk_peer_name(peer)
            was = bk_learn_name(peer["name"], real)
            ok, msg, dest = bk_store(real, name, r, int(r.headers.get("Content-Length") or 0), aliases=(peer["name"], *was))
            their_tg = r.headers.get("X-Backup-TG") == "1"
    except urllib.error.HTTPError as e:
        return False, "那台還沒更新到新版" if e.code == 404 else f"錯誤 {e.code}"
    except Exception as e:  # noqa: BLE001
        return False, peer_error(e, peer["url"])
    if ok and not their_tg and TG_BOT and TG_CHAT:
        err = bk_to_tg(dest, owner=real)
        if err:
            log(f"幫「{real}」傳備份到 Telegram 失敗：", err)
    return ok, msg


def backup_run(manual=False):
    """完整的一次備份：打包加密 → Telegram → 同步密碼、送給其他主機 → 拿其他主機的回來"""
    if not BK_RUN.acquire(blocking=False):
        return
    BK["running"] = True
    try:
        res = {"t": time.time(), "ok": False, "size": 0, "items": [], "big": [], "to": [], "msg": ""}
        try:
            path, made = bk_latest(0 if manual else 3600)       # 一小時內剛打包過（例如被別台拿走時打包的）就直接用
            labels, big = made or (None, None)
            res.update(size=os.path.getsize(path), items=labels if labels is not None else (BK["last"] or {}).get("items", []),
                       big=big or [])
            bk_cleanup_legacy()
        except Exception as e:  # noqa: BLE001
            log("備份打包失敗：", repr(e))
            res["msg"] = f"打包失敗：{e}"
            path = None
        if path:
            res["to"].append({"where": f"存在這台的{bk_where()}", "ok": True, "msg": ""})
            if TG_BOT and TG_CHAT:
                err = bk_to_tg(path)
                res["to"].append({"where": "傳到 Telegram", "ok": not err, "msg": err})
            for p in PEERS:
                ok, msg = bk_send_key(p)                         # 先讓那台用同一組密碼，它做的備份這邊也打得開
                if ok:
                    ok, msg = bk_push(p, path)
                res["to"].append({"where": f"存到「{bk_peer_name(p)}」的{msg}" if ok else f"存到「{bk_peer_name(p)}」", "ok": ok, "msg": "" if ok else msg})
                if ok:
                    ok, msg = bk_pull(p)
                    res["to"].append({"where": f"「{bk_peer_name(p)}」的備份也存了一份在這台的{msg}" if ok else f"拿「{bk_peer_name(p)}」的備份",
                                      "ok": ok, "msg": "" if ok else msg})
            res["ok"] = all(x["ok"] for x in res["to"])
        prev = BK["last"]
        with COL.lock:
            BK["last"] = res
            if res["ok"]:
                BK["ok_t"] = res["t"]
        if res["ok"]:
            log(f"備份完成：{fmt_size(res['size'])}")
            if prev and not prev.get("ok"):
                COL.add_event("ok", "備份恢復正常了")
        else:
            why = res["msg"] or "；".join(f"{x['where']}：{x['msg']}" for x in res["to"] if not x["ok"])
            log("備份有問題：", why)
            COL.add_event("bad", f"備份失敗（{why}）")
        COL.save()
    finally:
        BK["running"] = False
        BK_RUN.release()


def bk_copies():
    """這台存著哪些主機的備份：[{name, count, t, size}]，這台自己排第一個"""
    out, root, me = [], bk_root(), bk_safe(NAME)
    try:
        names = sorted(os.listdir(root), key=lambda n: (n != me, n))
    except OSError:
        return []
    for n in names:
        fs = bk_list(os.path.join(root, n))
        if fs:
            out.append({"name": n, "me": n == me, "count": len(fs), "t": os.path.getmtime(fs[-1]), "size": os.path.getsize(fs[-1])})
    return out


def backup_status():
    with COL.lock:
        last = BK["last"]
    return {"on": BACKUP_ON, "hour": BACKUP_HOUR, "key": bk_key(), "running": BK["running"], "last": last,
            "copies": bk_copies(), "where": bk_where(), "tz": BACKUP_TZ, "folder": BK_CLOUD_SUB, "tg": bool(TG_BOT and TG_CHAT),
            "peers": [p["name"] for p in PEERS]}


def set_backup(on):
    global BACKUP_ON
    try:
        write_conf({"BACKUP": "on" if on else "off"})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}"
    BACKUP_ON = bool(on)
    return True, "已開啟每日備份" if on else "已關閉每日備份"


BK_LINK_HOURS = 24


def bk_link_sig(host, exp):
    return hmac.new(("vsbk-dl|" + TOKEN).encode(), f"{host}|{exp}".encode(), hashlib.sha256).hexdigest()[:40]


def bk_link(host):
    """新主機還原用的下載連結（24 小時內有效、只能下載加密過的備份檔）；回傳網址後面的參數"""
    if host not in {c["name"] for c in bk_copies()}:
        return None
    exp = int(time.time()) + BK_LINK_HOURS * 3600
    return urllib.parse.urlencode({"h": host, "e": exp, "s": bk_link_sig(host, exp)})


def bk_link_file(q):
    """還原連結 → 那台最新的備份檔；過期、被改過就回傳 None"""
    h, e, sig = q.get("h", [""])[0], q.get("e", [""])[0], q.get("s", [""])[0]
    if not e.isdigit() or int(e) < time.time() or "/" in h or h.startswith(".") or not h:
        return None
    if not hmac.compare_digest(sig.encode(), bk_link_sig(h, int(e)).encode()):
        return None
    fs = bk_list(os.path.join(bk_root(), h))
    return fs[-1] if fs else None


# ───────────────────────── 網頁還原（安裝時選「從備份還原」）─────────────────────────
# install.sh --restore 會產生一組一次性代碼（只存雜湊），印在終端機上；拿著代碼才能在網頁上傳備份檔、開始還原。
# 還原本身交給 sentinel.py --restore 在背景跑（用 systemd-run 跑在哨兵外面，哨兵被重新啟動也不會中斷），
# 進度寫在 progress.json，網頁每隔一下來讀。狀態檔不放在 DATA_DIR（那裡會被備份蓋掉）。
RSW_STATE = os.environ.get("SENTINEL_RESTORE_STATE", "/var/lib/vps-sentinel-restore/state.json")
RSW_DIR = os.path.dirname(RSW_STATE)
RSW_FILE = os.path.join(RSW_DIR, "upload.vsbk")
RSW_PROG = os.path.join(RSW_DIR, "progress.json")
RSW_FAIL = {}                                      # 來源 → [輸錯次數, 暫停到]：同一個地方輸錯 10 次就暫停 10 分鐘（別人亂試不會把你鎖住）
RSW_FAIL_LK = threading.Lock()


def rsw_read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def rsw_state():
    """還原模式的狀態；沒有在還原（或已經過期）回傳 None"""
    st = rsw_read(RSW_STATE)
    if not isinstance(st, dict):
        return None
    now = time.time()
    if st.get("stage") == "wait" and st.get("exp", 0) < now:
        return None
    if st.get("stage") == "running":
        pg = rsw_read(RSW_PROG) or {}
        if pg.get("done"):
            st.update(stage="done", done_t=pg.get("t") or now)
    if st.get("stage") == "done" and now - (st.get("done_t") or 0) > 6 * 3600:
        return None
    return st


def rsw_save(st):
    tmp = RSW_STATE + ".tmp"
    with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        json.dump(st, f)
    os.replace(tmp, RSW_STATE)


def rsw_locked(ip):
    """這個來源還要暫停幾秒（0＝可以試）"""
    with RSW_FAIL_LK:
        return max(0, int((RSW_FAIL.get(ip) or [0, 0])[1] - time.time()))


def rsw_code_ok(code, ip=""):
    st = rsw_state()
    if not st or not code or rsw_locked(ip):
        return False
    norm = re.sub(r"[\s-]", "", code).upper()           # 有沒有打中間的「-」、大小寫都可以
    ok = hmac.compare_digest(hashlib.sha256(norm.encode()).hexdigest(), str(st.get("hash", "")))
    with RSW_FAIL_LK:
        now = time.time()
        for k in [k for k, v in RSW_FAIL.items() if v[1] and v[1] < now]:
            del RSW_FAIL[k]
        if ok:
            RSW_FAIL.pop(ip, None)
        else:
            f = RSW_FAIL.setdefault(ip, [0, 0])
            f[0] += 1
            if f[0] >= 10:
                f[:] = [0, now + 600]
            if len(RSW_FAIL) > 5000:                       # 記太多來源：丟掉沒在暫停的
                for k in [k for k, v in RSW_FAIL.items() if not v[1]][:2500]:
                    del RSW_FAIL[k]
    return ok


def rsw_status():
    st = rsw_state() or {}
    has = os.path.isfile(RSW_FILE)
    return {"active": bool(st), "stage": st.get("stage", ""), "file": has, "size": os.path.getsize(RSW_FILE) if has else 0,
            "progress": rsw_read(RSW_PROG) if st.get("stage") in ("running", "done") else None}


def rsw_store(stream, length):
    st = rsw_state()
    if not st or st.get("stage") != "wait":
        return False, "現在沒有在等待還原"
    if not 40 < length <= BK_UPLOAD_MAX:
        return False, "檔案大小不對"
    tmp, left, head = RSW_FILE + ".part", length, b""
    try:
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as f:
            while left > 0:
                chunk = stream.read(min(left, 1 << 20))
                if not chunk:
                    raise OSError("傳到一半斷掉了")
                head = head or chunk[:4]
                f.write(chunk)
                left -= len(chunk)
        if head != VSBK_MAGIC:
            os.remove(tmp)
            return False, "這不是哨兵的備份檔（檔名是 .vsbk 的那個）"
        os.replace(tmp, RSW_FILE)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False, f"存檔失敗：{e}"
    return True, "已上傳"


RSW_LOCK = threading.Lock()


def rsw_start(pw):
    """先確認密碼打得開，再在背景開始還原（兩個分頁同時按也只會開始一次）"""
    if not RSW_LOCK.acquire(blocking=False):
        return False, "已經在開始還原了"
    try:
        return _rsw_start(pw)
    finally:
        RSW_LOCK.release()


def _rsw_start(pw):
    st = rsw_state()
    if not st or st.get("stage") != "wait":
        return False, "現在沒有在等待還原"
    if not os.path.isfile(RSW_FILE):
        return False, "請先選擇備份檔"
    try:
        vsbk_decrypt(RSW_FILE, None, pw or "")
    except (ValueError, OSError) as e:
        return False, str(e)
    pwf = os.path.join(RSW_DIR, "pw")
    with open(os.open(pwf, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write(pw)
    try:
        os.remove(RSW_PROG)
    except OSError:
        pass
    args = [sys.executable, os.path.abspath(__file__), "--restore", RSW_FILE, "--yes", "--password-file", pwf, "--status", RSW_PROG]
    env = {"SENTINEL_SRC": C.get("SRC_DIR", "")}
    st.update(stage="running", start_t=time.time())
    rsw_save(st)
    if shutil.which("systemd-run") and os.environ.get("SENTINEL_RESTORE_DRY") != "1":
        cmd = ["systemd-run", "--unit", f"vps-sentinel-restore-{int(time.time())}", "--collect", "--quiet",
               *(f"--setenv={k}={v}" for k, v in env.items() if v), *args]
    else:
        cmd = args
    try:
        subprocess.Popen(cmd, env={**os.environ, **env}, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError as e:
        st.update(stage="wait")                   # 沒開始成功：回到等待，可以再按一次
        rsw_save(st)
        return False, f"沒辦法開始還原：{e}"
    return True, "開始還原"
