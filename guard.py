"""VPS 哨兵：安全檢查（`sec_` 開頭）、SSH 上鎖（`ssh_`）、錯太多次封鎖（`guard_`）、自動安全更新（`autoupd_`）。
sentinel.py 用 include("guard.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）"""
import pwd

# ───────────────────────── SSH 的門 ─────────────────────────
# 一小時看一次 `sshd -T`（真正生效的設定）。改設定只寫自己的 /etc/ssh/sshd_config.d/00-vps-sentinel.conf：
# sshd 同一個設定以「先讀到的」為準，00 開頭會比雲端主機自己放的 50-cloud-init.conf 先讀到。
SSHD = {"t": 0, "v": [], "bad": [], "c": {}, "ports": []}
SSH_ETC = os.environ.get("SENTINEL_SSH_ETC") or "/etc/ssh"            # 測試用：假的 /etc/ssh（不會真的重新載入 sshd）
SSH_DROP = os.path.join(SSH_ETC, "sshd_config.d", "00-vps-sentinel.conf")
SSH_LOCK = threading.Lock()
SSH_ROOT_OK = ("no", "prohibit-password", "without-password", "forced-commands-only")
SSH_KEY_RE = re.compile(r"(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)"
                        r"\s+([A-Za-z0-9+/]+={0,3})(?:\s+(.*))?")


def ssh_drop():
    """自己那份 sshd 設定：{小寫名稱: (原本的寫法, 值)}"""
    d = {}
    try:
        with open(SSH_DROP, encoding="utf-8") as f:
            for line in f:
                k, _, v = line.strip().partition(" ")
                if k and not k.startswith("#"):
                    d[k.lower()] = (k, v.strip())
    except OSError:
        pass
    return d


def ssh_risks():
    """SSH 的門有沒有關好（一小時看一次 sshd -T，要 root）：回傳 (異常, 注意)；看不到就不說"""
    if time.time() - SSHD["t"] < 3600:
        return SSHD["bad"], SSHD["v"]
    SSHD["t"] = time.time()
    txt = os.environ.get("SENTINEL_SSHD_T")              # 測試用：假的 sshd -T 輸出（自己那份設定照樣疊上去）
    if txt is None:
        exe = shutil.which("sshd") or ("/usr/sbin/sshd" if os.path.exists("/usr/sbin/sshd") else "")
        if not exe or os.geteuid() != 0:
            return [], []
        try:
            r = subprocess.run([exe, "-T"], capture_output=True, text=True, timeout=10)
            txt = r.stdout if r.returncode == 0 else ""
        except (OSError, subprocess.SubprocessError):
            txt = ""
    else:
        txt = "\n".join(f"{k} {v}" for k, (_, v) in ssh_drop().items()) + "\n" + txt
    c, ports = {}, []
    for line in txt.splitlines():
        k, _, v = line.strip().partition(" ")
        k, v = k.lower(), v.strip().lower()
        if k == "port" and v.isdigit() and int(v) not in ports:
            ports.append(int(v))
        c.setdefault(k, v)
    SSHD["known"], SSHD["c"], SSHD["ports"] = bool(c), c, ports or [22]
    if not c:
        SSHD["bad"], SSHD["v"] = [], []
        return [], []
    bad, warn = [], []
    pw = c.get("passwordauthentication") == "yes"
    if c.get("permitemptypasswords") == "yes":
        bad.append("SSH 允許空密碼登入")
    if pw and c.get("permitrootlogin") == "yes":
        bad.append("root 能用密碼登入 SSH")
    elif pw:
        warn.append("SSH 能用密碼登入")
    SSHD["bad"], SSHD["v"] = bad, warn
    return bad, warn


def ssh_users():
    """能登入的使用者：root 和一般使用者（編號 1000 起、殼層不是 nologin）"""
    fake = os.environ.get("SENTINEL_SSH_HOME")          # 測試用：假的家目錄（底下一個使用者一個資料夾）
    if fake:
        names = os.listdir(fake) if os.path.isdir(fake) else []
        return sorted(((u, os.path.join(fake, u)) for u in names if os.path.isdir(os.path.join(fake, u))), key=lambda x: (x[0] == "root", x[0]))
    out = []
    for p in pwd.getpwall():
        if (p.pw_uid == 0 or 1000 <= p.pw_uid < 60000) and not p.pw_shell.endswith(("nologin", "false", "sync")):
            out.append((p.pw_name, p.pw_dir))
    return sorted(out, key=lambda x: (x[0] == "root", x[0]))


def ssh_me():
    """預設放金鑰給誰：裝哨兵的那個人（安裝資料夾的主人），不然第一個一般使用者"""
    us = [u for u, _ in ssh_users()]
    try:
        d = src_dir()
        own = pwd.getpwuid(os.stat(d).st_uid).pw_name if d else ""
    except (OSError, KeyError):
        own = ""
    return own if own in us else (us[0] if us else "")


def ssh_fp(blob):
    return "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")


def ssh_parse(line):
    """一行公開金鑰 → (種類, 原始資料, 備註)；看不懂就 None"""
    m = SSH_KEY_RE.search(line or "")
    if not m:
        return None
    try:
        blob = base64.b64decode(m.group(2), validate=True)
    except (ValueError, TypeError):
        return None
    n = int.from_bytes(blob[:4], "big") if len(blob) > 4 else 0
    if blob[4:4 + n].decode("latin-1") != m.group(1) or len(blob) < 40:
        return None
    return m.group(1), blob, (m.group(3) or "").strip()[:60]


def ssh_keys():
    """每個使用者 ~/.ssh/authorized_keys 裡的金鑰"""
    out = []
    for u, home in ssh_users():
        try:
            with open(os.path.join(home, ".ssh", "authorized_keys"), encoding="utf-8", errors="replace") as f:
                for line in f:
                    k = ssh_parse(line) if line.strip() and not line.lstrip().startswith("#") else None
                    if k:
                        out.append({"user": u, "type": k[0].replace("ssh-", "").split("-sha2-")[0].upper(), "name": k[2], "fp": ssh_fp(k[1])})
        except OSError:
            pass
    return out


def ssh_key_add(user, line):
    """把一把公開金鑰放進那個使用者的 authorized_keys（已經有就不重複）"""
    k = ssh_parse(line)
    if not k:
        return False, "看不懂這把金鑰，要貼 .pub 那個檔案的內容"
    home = dict(ssh_users()).get(user)
    if not home:
        return False, "找不到這個使用者"
    if any(x["fp"] == ssh_fp(k[1]) and x["user"] == user for x in ssh_keys()):
        return True, "已經有這把金鑰了"
    d = os.path.join(home, ".ssh")
    f = os.path.join(d, "authorized_keys")
    try:
        os.makedirs(d, mode=0o700, exist_ok=True)
        old = ""
        if os.path.exists(f):
            with open(f, encoding="utf-8", errors="replace") as fh:
                old = fh.read()
        with open(f, "a", encoding="utf-8") as fh:
            fh.write(("" if not old or old.endswith("\n") else "\n") + f"{k[0]} {base64.b64encode(k[1]).decode()}{' ' + k[2] if k[2] else ''}\n")
        os.chmod(f, 0o600)
        if os.geteuid() == 0:                          # 檔案要是那個使用者的，sshd 才肯用
            p = pwd.getpwnam(user)
            for x in (d, f):
                os.chown(x, p.pw_uid, p.pw_gid)
            os.chmod(d, 0o700)
    except (OSError, KeyError) as e:
        return False, f"寫不進去：{e}"
    log(f"SSH：幫 {user} 加了一把金鑰")
    return True, "加好了"


def ssh_key_gen(user):
    """在主機上做一組新的金鑰：公開的放進去，私密的只交給網頁這一次（主機不留）"""
    exe = shutil.which("ssh-keygen")
    if not exe:
        return False, "這台沒有 ssh-keygen", ""
    with tempfile.TemporaryDirectory() as t:
        p = os.path.join(t, "k")
        code, _ = run([exe, "-q", "-t", "ed25519", "-N", "", "-C", f"{user}@{NAME}"[:60], "-f", p], 30)
        if code != 0:
            return False, "做不出金鑰", ""
        with open(p, encoding="utf-8") as f:
            priv = f.read()
        with open(p + ".pub", encoding="utf-8") as f:
            pub = f.read()
    ok, msg = ssh_key_add(user, pub)
    return ok, msg, priv if ok else ""


def ssh_apply(set_=None, drop=()):
    """改自己那份 sshd 設定；sshd -t 檢查過才重新載入，不對就換回原本的（已經連著的不會斷）"""
    with SSH_LOCK:
        d = ssh_drop()
        for k in drop:
            d.pop(k.lower(), None)
        for k, v in (set_ or {}).items():
            d[k.lower()] = (k, v)
        try:
            with open(SSH_DROP, encoding="utf-8") as f:
                old = f.read()
        except OSError:
            old = None
        main = os.path.join(SSH_ETC, "sshd_config")
        try:
            os.makedirs(os.path.dirname(SSH_DROP), exist_ok=True)
            if d:
                with open(SSH_DROP, "w", encoding="utf-8") as f:
                    f.write("# VPS 哨兵「安全檢查」寫的（網頁上可以改回來）\n" + "".join(f"{k} {v}\n" for k, v in d.values()))
                os.chmod(SSH_DROP, 0o644)
            elif os.path.exists(SSH_DROP):
                os.remove(SSH_DROP)
            with open(main, encoding="utf-8") as f:     # 舊系統的主設定沒有讀 sshd_config.d：加在最前面
                txt = f.read()
            if not re.search(r"(?mi)^\s*include\s+\S*sshd_config\.d/", txt):
                with open(main, "w", encoding="utf-8") as f:
                    f.write(f"Include {os.path.dirname(SSH_DROP)}/*.conf\n" + txt)
        except OSError as e:
            return False, f"寫不進設定：{e}"

        def back():
            if old is None:
                if os.path.exists(SSH_DROP):
                    os.remove(SSH_DROP)
            else:
                with open(SSH_DROP, "w", encoding="utf-8") as f:
                    f.write(old)
        if not os.environ.get("SENTINEL_SSH_ETC"):
            exe = shutil.which("sshd") or "/usr/sbin/sshd"
            code, _ = run([exe, "-t"], 15)
            if code != 0:
                back()
                return False, "SSH 不接受這個設定，已換回原本的"
            if run(["systemctl", "reload", "ssh"], 20)[0] != 0 and run(["systemctl", "reload", "sshd"], 20)[0] != 0:
                back()
                return False, "SSH 重新載入失敗，已換回原本的"
        SSHD["t"] = 0
        ssh_risks()
        return True, ""


def ssh_key_ok():
    """有沒有人能用金鑰登入（不然關掉密碼登入就進不來了）"""
    root_ok = SSHD["c"].get("permitrootlogin", "prohibit-password") != "no"
    return any(k["user"] != "root" or root_ok for k in ssh_keys())


# ───────────────────────── 錯太多次封鎖 ─────────────────────────
# 每 20 秒看一次 sshd 的紀錄：同一個 IP 10 分鐘內錯 5 次，封鎖 1 小時（7 天內又來就封 24 小時）。
# 7 天內成功登入過的 IP、本機、內部網路不封。用 nftables（沒有就用 iptables），只擋 SSH 的連接埠。
GUARD_TRIES, GUARD_WIN = 5, 600
GUARD_EVERY = float(os.environ.get("SENTINEL_GUARD_EVERY") or 20)   # 測試用：看紀錄的間隔
GUARD_BAN, GUARD_BAN2 = 3600, 86400
GUARD = {"bans": {}, "seen": {}, "hits": {}, "ok": {}, "how": None, "cur": None, "err": "", "ready": False}
GUARD_LOCK = threading.RLock()
GUARD_FILE = os.path.join(DATA_DIR, "ssh-guard.json")
GUARD_PAT = (re.compile(r"Failed \S+ for (?:invalid user )?.* from (\S+) port \d+"),
             re.compile(r"Invalid user .* from (\S+) port \d+"),
             re.compile(r"Connection closed by authenticating user \S+ (\S+) port \d+ \[preauth\]"),
             re.compile(r"maximum authentication attempts exceeded for .* from (\S+) port \d+"))
GUARD_OK = re.compile(r"Accepted \S+ for \S+ from (\S+) port \d+")


def guard_on():
    return C.get("SSH_GUARD", "on") != "off"


def guard_safe(ip):
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return a.is_loopback or a.is_private or a.is_link_local or time.time() - GUARD["ok"].get(ip, 0) < 7 * 86400


def guard_fw(cmd, ip=None, secs=0):
    """防火牆：setup（建好規則）、add（封一個 IP）、del（解開）、clear（全部拿掉）"""
    if os.environ.get("SENTINEL_GUARD_FW"):           # 測試用：只記下來，不真的動防火牆
        with open(os.environ["SENTINEL_GUARD_FW"], "a", encoding="utf-8") as f:
            f.write(f"{cmd} {ip or ''} {secs}\n")
        GUARD["how"] = "test"
        return True
    nft, ipt = shutil.which("nft"), shutil.which("iptables")
    if GUARD["how"] == "iptables":
        nft = None
    ports = ",".join(str(p) for p in SSHD["ports"] or [22])
    v6 = ip and ":" in ip
    if nft:
        GUARD["how"] = GUARD["how"] or "nft"
        if cmd == "setup":
            run(["nft", "delete", "table", "inet", "vps_sentinel"], 10)
            rule = (f"table inet vps_sentinel {{\n  set ban4 {{ type ipv4_addr; flags timeout; }}\n  set ban6 {{ type ipv6_addr; flags timeout; }}\n"
                    f"  chain input {{\n    type filter hook input priority -5; policy accept;\n"
                    f"    tcp dport {{ {ports} }} ip saddr @ban4 drop\n    tcp dport {{ {ports} }} ip6 saddr @ban6 drop\n  }}\n}}\n")   # 一行一句（寫在同一行 nft 看不懂）
            try:
                r = subprocess.run(["nft", "-f", "-"], input=rule, capture_output=True, text=True, timeout=10)
                if r.returncode == 0:
                    return True
                log(f"SSH 封鎖：nftables 設定失敗（{(r.stderr or '').strip()[:160]}）")
            except (OSError, subprocess.SubprocessError):
                pass
            if not ipt:
                return False
            GUARD["how"] = "iptables"                     # nftables 不行：改用 iptables
            return True
        if cmd == "clear":
            return run(["nft", "delete", "table", "inet", "vps_sentinel"], 10)[0] == 0
        s = "ban6" if v6 else "ban4"
        if cmd == "add":
            return run(["nft", "add", "element", "inet", "vps_sentinel", s, f"{{ {ip} timeout {max(60, int(secs))}s }}"], 10)[0] == 0
        return run(["nft", "delete", "element", "inet", "vps_sentinel", s, f"{{ {ip} }}"], 10)[0] == 0
    if ipt:
        GUARD["how"] = "iptables"
        if cmd in ("setup", "clear"):
            if cmd == "clear":
                for b in list(GUARD["bans"]):
                    guard_fw("del", b)
            return True
        exe = "ip6tables" if v6 else "iptables"
        rule = ["-s", ip, "-p", "tcp", "-m", "multiport", "--dports", ports, "-j", "DROP", "-m", "comment", "--comment", "vps-sentinel"]
        return run([exe, "-I" if cmd == "add" else "-D", "INPUT", *rule], 10)[0] == 0
    GUARD["how"] = None
    return False


def guard_save():
    try:
        sec_write(GUARD_FILE, json.dumps({"bans": GUARD["bans"], "seen": GUARD["seen"], "ok": GUARD["ok"]}), plain=True)
    except OSError:
        pass


def guard_logs():
    """新的 sshd 紀錄（從上次看到的地方接著讀）"""
    fake = os.environ.get("SENTINEL_GUARD_LOG")          # 測試用：假的紀錄檔，每次讀新增的那幾行
    if fake:
        try:
            with open(fake, encoding="utf-8") as f:
                f.seek(GUARD["cur"] or 0)
                txt = f.read()
                GUARD["cur"] = f.tell()
            return txt.splitlines()
        except OSError:
            return []
    if not shutil.which("journalctl"):
        return []
    cmd = ["journalctl", "-t", "sshd", "-t", "sshd-session", "-o", "cat", "--no-pager", "--show-cursor"]
    cmd += [f"--after-cursor={GUARD['cur']}"] if GUARD["cur"] else ["--since", "-7days"]
    _, out = run(cmd, 60)
    lines = out.splitlines()
    if lines and lines[-1].startswith("-- cursor: "):
        GUARD["cur"] = lines.pop()[11:].strip()
    return lines


def guard_scan(lines, now=None, first=False):
    """看紀錄：記成功登入的 IP、算錯幾次，超過就封（first：剛啟動讀的 7 天舊紀錄，只找成功登入過的）"""
    now = now or time.time()
    for line in lines:
        m = GUARD_OK.search(line)
        if m:
            GUARD["ok"][m.group(1)] = now
            GUARD["hits"].pop(m.group(1), None)
            continue
        if first:                                        # 舊的錯誤不拿來封
            continue
        for p in GUARD_PAT:
            m = p.search(line)
            if m:
                ip = m.group(1)
                h = [t for t in GUARD["hits"].get(ip, []) if now - t < GUARD_WIN] + [now]
                GUARD["hits"][ip] = h
                if len(h) >= GUARD_TRIES and ip not in GUARD["bans"] and not guard_safe(ip):
                    secs = GUARD_BAN2 if now - GUARD["seen"].get(ip, 0) < 7 * 86400 else GUARD_BAN
                    if guard_fw("add", ip, secs):
                        GUARD["bans"][ip] = now + secs
                        GUARD["seen"][ip] = now
                        log(f"SSH：{ip} 錯太多次，封鎖 {secs // 3600} 小時")
                    GUARD["hits"].pop(ip, None)
                break


def guard_loop():
    if os.geteuid() != 0 and not os.environ.get("SENTINEL_GUARD_FW"):
        return
    try:
        with open(GUARD_FILE, encoding="utf-8") as f:
            d = json.load(f)
        GUARD.update(bans=d.get("bans") or {}, seen=d.get("seen") or {}, ok=d.get("ok") or {})
    except (OSError, ValueError):
        pass
    tried = 0
    while True:
        try:
            now = time.time()
            if not guard_on():
                if GUARD["ready"]:
                    guard_stop()
                time.sleep(GUARD_EVERY)
                continue
            if not GUARD["ready"]:
                if now - tried < 600:                     # 防火牆設不起來：10 分鐘再試（在網頁上打開會馬上試）
                    time.sleep(GUARD_EVERY)
                    continue
                tried = now
                if not guard_ready():
                    continue
            for ip, t in list(GUARD["bans"].items()):
                if t <= now:
                    if GUARD["how"] == "iptables":
                        guard_fw("del", ip)
                    GUARD["bans"].pop(ip, None)
            first = GUARD["cur"] is None and not os.environ.get("SENTINEL_GUARD_LOG")
            guard_scan(guard_logs(), now, first)
            for d_ in (GUARD["seen"], GUARD["ok"]):
                for ip, t in list(d_.items()):
                    if now - t > 7 * 86400:
                        d_.pop(ip, None)
            for ip in [ip for ip, h in GUARD["hits"].items() if now - h[-1] > GUARD_WIN]:
                GUARD["hits"].pop(ip, None)
            guard_save()
        except Exception as e:  # noqa: BLE001  封鎖出錯不能讓哨兵停
            log(f"SSH 封鎖出錯：{str(e)[:120]}")
        time.sleep(GUARD_EVERY)


def guard_ready():
    """建好防火牆規則、把重新啟動前還沒到期的接著封"""
    with GUARD_LOCK:
        if GUARD["ready"]:
            return True
        ssh_risks()
        GUARD["how"] = None
        if not guard_fw("setup"):
            GUARD["err"] = "防火牆設不起來"
            return False
        now = time.time()
        for ip, t in list(GUARD["bans"].items()):
            if t > now:
                guard_fw("add", ip, t - now)
        GUARD["err"], GUARD["ready"] = "", True
        return True


def guard_stop():
    with GUARD_LOCK:
        guard_fw("clear")
        GUARD["bans"], GUARD["ready"], GUARD["err"] = {}, False, ""
        guard_save()


def guard_set(on):
    if on and not guard_ready():
        return False, "防火牆設不起來，沒辦法封鎖"
    try:
        write_conf({"SSH_GUARD": "on" if on else "off"})
    except OSError as e:
        return False, f"無法寫入設定檔：{e}"
    C["SSH_GUARD"] = "on" if on else "off"
    if not on:
        guard_stop()
    return True, ""


# ───────────────────────── 自動安裝安全更新（Debian／Ubuntu 的 unattended-upgrades）─────────────────────────
AUTOUPD_FILE = os.environ.get("SENTINEL_AUTOUPD") or "/etc/apt/apt.conf.d/20auto-upgrades"
AUTOUPD = {"busy": False}


def autoupd_state():
    """True＝開著、False＝關著、None＝這台不是用 apt 的"""
    if not os.environ.get("SENTINEL_AUTOUPD") and not shutil.which("apt-get"):
        return None
    try:
        with open(AUTOUPD_FILE, encoding="utf-8") as f:
            on = bool(re.search(r'APT::Periodic::Unattended-Upgrade\s+"1"', f.read()))
    except OSError:
        on = False
    if on and not os.environ.get("SENTINEL_AUTOUPD"):
        on = os.path.exists("/usr/bin/unattended-upgrade")
    return on


def autoupd_set(on):
    """打開：沒裝就先裝（背景裝，要一兩分鐘）；只會自動裝安全更新，不會自己重新開機"""
    if autoupd_state() is None:
        return False, "這台不能用"
    if AUTOUPD["busy"]:
        return True, "正在設定"

    def go():
        AUTOUPD["busy"] = True
        try:
            if on and not os.environ.get("SENTINEL_AUTOUPD") and not os.path.exists("/usr/bin/unattended-upgrade"):
                run(["apt-get", "install", "-y", "-q", "unattended-upgrades"], 600)
            v = "1" if on else "0"
            sec_write(AUTOUPD_FILE, f'APT::Periodic::Update-Package-Lists "{v}";\nAPT::Periodic::Unattended-Upgrade "{v}";\n', plain=True)
            os.chmod(AUTOUPD_FILE, 0o644)
            log("自動安裝安全更新：" + ("開" if on else "關"))
        except OSError as e:
            log(f"自動安裝安全更新設定失敗：{e}")
        finally:
            AUTOUPD["busy"] = False
    if os.environ.get("SENTINEL_AUTOUPD"):
        go()
    else:
        threading.Thread(target=go, daemon=True).start()
    return True, ""


# ───────────────────────── 安全檢查 ─────────────────────────
def sec_info():
    """安全檢查：每一項 True＝好、False＝要注意、None＝這台沒有這一項"""
    ssh_risks()
    seal = bool(_seal_lib() and seal_key())
    try:
        with open(CONF_PATH, encoding="utf-8") as f:
            seal = seal and f"TOKEN={SEAL_TXT}" in f.read()
    except OSError:
        pass
    e = cloud_enc() if CLOUD_URL else None
    c = SSHD["c"] if SSHD.get("known") else {}
    guard = (guard_on() and not GUARD["err"]) if c and (os.geteuid() == 0 or os.environ.get("SENTINEL_GUARD_FW")) else None
    return {"seal": seal, "web": bool(C.get("DOMAIN") or TLS["ctx"]), "cloud": e["on"] if e else None, "backup": bool(BACKUP_ON),
            "sshpw": (c.get("passwordauthentication") != "yes" and c.get("permitemptypasswords") != "yes") if c else None,
            "sshroot": c.get("permitrootlogin") in SSH_ROOT_OK if c else None,
            "guard": guard, "autoupd": autoupd_state()}


SEC_BAD = {"seal": "存著的密碼和資料沒有加密", "web": "網頁連線沒有加密", "cloud": "雲端硬碟沒有加密", "backup": "每日備份關掉了",
           "guard": "SSH 錯太多次封鎖關掉了", "autoupd": "自動安裝安全更新關掉了"}    # SSH 密碼登入另外由 ssh_risks 提醒
SEC_FILE = os.path.join(DATA_DIR, "sec-last.json")
SEC_EVERY = float(os.environ.get("SENTINEL_SEC_EVERY") or 600)      # 測試用：多久看一次


def sec_watch():
    """安全檢查哪一項從好變成要注意：記一筆（會傳 Telegram）；第一次看只記下來"""
    now = sec_info()
    try:
        with open(SEC_FILE, encoding="utf-8") as f:
            last = json.load(f)
    except (OSError, ValueError):
        last = None
    if isinstance(last, dict):
        for k, txt in SEC_BAD.items():
            if last.get(k) is True and now.get(k) is False:
                COL.add_event("warn", f"安全檢查：{txt}")
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        sec_write(SEC_FILE, json.dumps({k: now.get(k) for k in SEC_BAD}), plain=True)
    except OSError:
        pass


def sec_watch_loop():
    time.sleep(min(60, SEC_EVERY))                    # 剛啟動：讓封鎖、加密先準備好
    while True:
        try:
            sec_watch()
        except Exception as e:  # noqa: BLE001
            log(f"安全檢查出錯：{str(e)[:120]}")
        time.sleep(SEC_EVERY)


def sec_detail():
    """安全檢查頁要的全部資料"""
    now = time.time()
    return {"ok": True, "sec": sec_info(), "keys": ssh_keys(), "users": [u for u, _ in ssh_users()], "me": ssh_me(),
            "keyok": ssh_key_ok(), "bans": sum(1 for t in GUARD["bans"].values() if t > now), "busy": AUTOUPD["busy"]}


def sec_act(d):
    """安全檢查頁的按鈕：fix／undo 某一項、加金鑰、做新金鑰"""
    act, item = d.get("action"), d.get("item")
    if act == "key":
        ok, msg = ssh_key_add(str(d.get("user") or ""), str(d.get("key") or "")[:16000])
        return ok, msg, {}
    if act == "gen":
        ok, msg, priv = ssh_key_gen(str(d.get("user") or ""))
        return ok, msg, {"priv": priv}
    on = act == "fix"
    if act not in ("fix", "undo"):
        return False, "不認得", {}
    if item == "sshpw":
        if on and not ssh_key_ok():
            return False, "先放一把金鑰，不然關掉後就進不來了", {}
        ok, msg = (ssh_apply({"PasswordAuthentication": "no", "KbdInteractiveAuthentication": "no", "PermitEmptyPasswords": "no"}) if on
                   else ssh_apply(drop=("PasswordAuthentication", "KbdInteractiveAuthentication", "PermitEmptyPasswords")))
        if ok and on and SSHD["c"].get("passwordauthentication") == "yes":
            return False, "設定沒有生效，可能有別的設定蓋過去", {}
    elif item == "sshroot":
        ok, msg = ssh_apply({"PermitRootLogin": "prohibit-password"}) if on else ssh_apply(drop=("PermitRootLogin",))
    elif item == "guard":
        ok, msg = guard_set(on)
    elif item == "autoupd":
        ok, msg = autoupd_set(on)
    else:
        return False, "不認得", {}
    if ok:
        log(f"安全檢查：{item} {'打開' if on else '改回'}")
    return ok, msg, {}


def sec_setup():
    """第一次安裝（install.sh 的 --sec-setup）：不會把人鎖在外面的先設好，其他的印出來"""
    ssh_risks()
    if autoupd_state() is False:
        autoupd_set(True)
        while AUTOUPD["busy"]:
            time.sleep(1)
    s = sec_info()
    for k, good, bad in (("sshpw", "SSH 只能用金鑰登入", "SSH 能用密碼登入"), ("sshroot", "root 不能用密碼登入", "root 能用密碼登入"),
                         ("guard", "SSH 錯太多次會封鎖", "SSH 錯太多次不會封鎖"), ("autoupd", "自動安裝安全更新", "沒有自動安裝安全更新")):
        v = s.get(k)
        if v is not None:
            print(f"  {'✅ ' + good if v else '⚠️  ' + bad + '（網頁 設定 → 安全檢查）'}")
