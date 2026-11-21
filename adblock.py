"""VPS 哨兵：擋廣告 DNS（AdGuard Home，`ab_` 開頭）。
手機把 DNS 設成這台主機，廣告、追蹤的網址查不到就載不出來。只開加密的 DNS：
  ‧ iPhone：DNS-over-HTTPS（https://網域:埠/dns-query，由 Caddy 轉給本機的 AdGuard Home）
  ‧ Android：私人 DNS（DNS-over-TLS，853 埠，用 Caddy 申請好的憑證）
一般的 DNS（53 埠）不開，不會變成被拿去攻擊別人的公開 DNS。管理網頁只開在本機，由哨兵用 API 設定、讀統計。
sentinel.py 用 include("adblock.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）"""
import plistlib
import uuid

AB_DIR = os.environ.get("SENTINEL_AB_DIR") or "/opt/vps-adblock"
AB_BIN = os.path.join(AB_DIR, "AdGuardHome")
AB_YAML = os.path.join(AB_DIR, "AdGuardHome.yaml")
AB_UNIT = "vps-adblock"
AB_UNIT_PATH = os.environ.get("SENTINEL_AB_UNIT") or f"/etc/systemd/system/{AB_UNIT}.service"
AB_WEB = os.environ.get("SENTINEL_AB_WEB") or "127.0.0.1:3053"         # AdGuard Home 的管理網頁＋DoH：只給本機
AB_API = os.environ.get("SENTINEL_AB_API") or f"http://{AB_WEB}"
AB_CONF = os.path.join(DATA_DIR, "adblock.json")                       # {"on", "pw", "t", "crt"}，加密存（SEAL_FILES）
AB_CADDY = os.environ.get("SENTINEL_AB_CADDY") or "/etc/caddy/sites/vps-sentinel.d/adblock.caddy"
AB_FAKE = os.environ.get("SENTINEL_AB_FAKE") == "1"                   # 測試：不真的裝程式、不動 systemd／防火牆／Caddy
AB_DOT = 853
AB_USER = "sentinel"
AB_URLS = ("https://static.adtidy.org/adguardhome/release/AdGuardHome_linux_{a}.tar.gz",
           "https://github.com/AdguardTeam/AdGuardHome/releases/latest/download/AdGuardHome_linux_{a}.tar.gz")
AB_ARCH = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64", "armv7l": "armv7", "armv6l": "armv6", "i686": "386"}
AB_LOCK = threading.Lock()
AB = {"c": None, "job": "", "err": "", "stats": None, "st_t": 0, "down": 0, "upd_t": 0}
AB_TOK = {}                                                             # 一次性的 iPhone 描述檔連結：代碼 → (到期, 內容)


def ab_conf():
    if AB["c"] is None:
        try:
            c = sec_load(AB_CONF)
        except (OSError, ValueError):
            c = {}
        AB["c"] = c if isinstance(c, dict) else {}
    return AB["c"]


def ab_save(c):
    AB["c"] = c
    os.makedirs(DATA_DIR, exist_ok=True)
    sec_dump(AB_CONF, c)


def ab_domain():
    return (C.get("DOMAIN") or "").strip()


def ab_doh():
    dom = ab_domain()
    if not dom:
        return ""
    port = C.get("HTTPS_PORT") or "443"
    return f"https://{dom}" + ("" if port == "443" else f":{port}") + "/dns-query"


def ab_cert():
    """Caddy 幫這個網域申請好的憑證、私鑰（AdGuard Home 的 DNS-over-TLS 用同一份）"""
    dom = ab_domain()
    if not dom:
        return None
    roots = [os.environ["SENTINEL_AB_CERTS"]] if os.environ.get("SENTINEL_AB_CERTS") else \
        ["/var/lib/caddy/.local/share/caddy/certificates", "/root/.local/share/caddy/certificates"]
    best = None
    for r in roots:
        for crt in glob.glob(os.path.join(r, "*", dom, dom + ".crt")):
            key = crt[:-4] + ".key"
            try:
                t = os.path.getmtime(crt)
            except OSError:
                continue
            if os.path.isfile(key) and (not best or t > best[2]):
                best = (crt, key, t)
    return best


def ab_sh(cmd, timeout=60):
    if AB_FAKE:
        return 0, ""
    return run(cmd, timeout)


def ab_req(path, body=None, method=None, timeout=10, auth=True):
    """呼叫 AdGuard Home 的 API；回傳 (狀態碼, 內容)。連不上回 (0, "")"""
    h = {"Content-Type": "application/json"}
    pw = ab_conf().get("pw")
    if auth and pw:
        h["Authorization"] = "Basic " + base64.b64encode(f"{AB_USER}:{pw}".encode()).decode()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(AB_API + path, data=data, headers=h, method=method or ("POST" if data is not None else "GET"))
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except (OSError, ValueError):
        return 0, ""


def ab_wait(path="/control/status", secs=25, auth=True):
    end = time.time() + secs
    while time.time() < end:
        code, _ = ab_req(path, auth=auth, timeout=3)
        if code and code < 500:
            return code
        time.sleep(0.5)
    return 0


def ab_free_port(ip, start=5354):
    """一般 DNS 的連接埠（關掉不用，但 AdGuard Home 一定要填一個）：挑一個沒人用的"""
    for p in range(start, start + 20):
        ok = True
        for kind in (socket.SOCK_DGRAM, socket.SOCK_STREAM):
            s = socket.socket(socket.AF_INET6 if ":" in ip else socket.AF_INET, kind)
            try:
                s.bind((ip, p))
            except OSError:
                ok = False
            finally:
                s.close()
        if ok:
            return p
    return start


def ab_bind_ip():
    """有 IPv6 就聽 ::（同時收 IPv4、IPv6），不然 0.0.0.0"""
    try:
        s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        s.bind(("::", 0))
        s.close()
        return "::"
    except OSError:
        return "0.0.0.0"


def ab_pick(t):
    """壓縮檔裡的程式本體：路徑可能是 AdGuardHome/AdGuardHome 或 ./AdGuardHome/AdGuardHome"""
    for m in t.getmembers():
        parts = [x for x in m.name.split("/") if x not in ("", ".")]
        if m.isfile() and parts[-2:] == ["AdGuardHome", "AdGuardHome"]:
            return m
    return None


def ab_download():
    arch = AB_ARCH.get(os.uname().machine)
    if not arch:
        raise RuntimeError("這台主機的處理器不支援")
    os.makedirs(AB_DIR, mode=0o700, exist_ok=True)
    last = None
    for u in AB_URLS:
        try:
            with tempfile.TemporaryDirectory() as tmp:
                tgz = os.path.join(tmp, "a.tgz")
                with urllib.request.urlopen(urllib.request.Request(u.format(a=arch), headers={"User-Agent": f"vps-sentinel/{VERSION}"}), timeout=120) as r, open(tgz, "wb") as f:
                    shutil.copyfileobj(r, f, 1 << 20)
                with tarfile.open(tgz) as t:
                    m = ab_pick(t)
                    if not m:
                        raise RuntimeError("下載的檔案不對")
                    src = t.extractfile(m)
                    with open(AB_BIN + ".new", "wb") as f:
                        shutil.copyfileobj(src, f, 1 << 20)
            os.chmod(AB_BIN + ".new", 0o755)
            os.replace(AB_BIN + ".new", AB_BIN)
            return
        except (OSError, KeyError, tarfile.TarError, RuntimeError) as e:
            last = e
    raise RuntimeError(f"下載 AdGuard Home 失敗（{last}）")


def ab_unit():
    txt = f"""[Unit]
Description=VPS 哨兵：擋廣告 DNS（AdGuard Home）
After=network-online.target caddy.service
Wants=network-online.target

[Service]
ExecStart={AB_BIN} -c {AB_YAML} -w {AB_DIR} --web-addr {AB_WEB} --no-permcheck
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
    with open(AB_UNIT_PATH, "w", encoding="utf-8") as f:
        f.write(txt)
    ab_sh(["systemctl", "daemon-reload"])


def ab_caddy(on):
    """iPhone 用的 DNS-over-HTTPS：Caddy 把 /dns-query 轉給本機的 AdGuard Home"""
    if AB_FAKE:
        return True
    d = os.path.dirname(AB_CADDY)
    if on:
        if not os.path.isdir(d):
            return False
        with open(AB_CADDY, "w", encoding="utf-8") as f:
            f.write(f"# 擋廣告 DNS（哨兵產生）：手機的 DNS-over-HTTPS 轉給本機的 AdGuard Home\nhandle /dns-query* {{\n\treverse_proxy {AB_WEB}\n}}\n")
        code, _ = run(["caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"], 30)
        if code != 0:
            os.remove(AB_CADDY)
            return False
    elif os.path.exists(AB_CADDY):
        os.remove(AB_CADDY)
    else:
        return True
    return run(["systemctl", "reload", "caddy"], 30)[0] == 0


def ab_fw(on):
    """Android 的私人 DNS 走 853 埠：主機自己的防火牆打開（雲端主機商那邊的防火牆要自己開）"""
    p = str(AB_DOT)
    if shutil.which("ufw") and "Status: active" in ab_sh(["ufw", "status"])[1]:
        ab_sh(["ufw", "allow" if on else "delete", *([] if on else ["allow"]), f"{p}/tcp"])
    elif shutil.which("netfilter-persistent") and shutil.which("iptables"):
        rule = ["INPUT", "-p", "tcp", "--dport", p, "-j", "ACCEPT"]
        has = ab_sh(["iptables", "-C", *rule])[0] == 0
        if on and not has:
            ab_sh(["iptables", "-I", *rule])
        elif not on and has:
            ab_sh(["iptables", "-D", *rule])
        ab_sh(["netfilter-persistent", "save"])


def ab_tls(cert):
    body = {"enabled": True, "server_name": ab_domain(), "force_https": False, "port_https": 0,
            "port_dns_over_tls": AB_DOT, "port_dns_over_quic": 0, "port_dnscrypt": 0, "dnscrypt_config_file": "",
            "allow_unencrypted_doh": True, "serve_plain_dns": False,
            "certificate_chain": "", "private_key": "", "certificate_path": cert[0], "private_key_path": cert[1]}
    code, out = ab_req("/control/tls/configure", body, timeout=20)
    return code == 200, out


def ab_plain_dns_open():
    """一般 DNS 有沒有不小心開著（有的話就是公開 DNS，要馬上停掉）"""
    port = ab_conf().get("port")
    if not port or AB_FAKE:
        return False
    q = secrets.token_bytes(2) + b"\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00" + b"\x07example\x03com\x00\x00\x01\x00\x01"
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(1.5)
    try:
        s.sendto(q, ("127.0.0.1", port))
        return len(s.recv(512)) > 12
    except OSError:
        return False
    finally:
        s.close()


def ab_doh_ok():
    q = b"\x00\x00\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00" + b"\x07example\x03com\x00\x00\x01\x00\x01"
    req = urllib.request.Request(AB_API + "/dns-query", data=q, headers={"Content-Type": "application/dns-message", "Accept": "application/dns-message"})
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=8) as r:
            return r.status == 200 and len(r.read()) > 12
    except (OSError, ValueError):
        return False


def ab_doh_fix():
    """DoH 要讓 Caddy 用 http 轉進來：新版 AdGuard Home 這個開關搬到設定檔的 http.doh.insecure_enabled，API 設不到就直接改設定檔"""
    if ab_doh_ok():
        return True
    ab_sh(["systemctl", "stop", AB_UNIT])
    try:
        y = read(AB_YAML)
        y2 = re.sub(r"(?m)^(\s+)(insecure_enabled|allow_unencrypted_doh): false\s*$", r"\1\2: true", y)
        if y2 != y:
            with open(AB_YAML, "w", encoding="utf-8") as f:
                f.write(y2)
    finally:
        ab_sh(["systemctl", "start", AB_UNIT])
    ab_wait()
    return ab_doh_ok()


def ab_install():
    """背景安裝／打開：下載、開服務、第一次就跑設定精靈、只開加密 DNS、接上 Caddy、開防火牆"""
    try:
        cert = ab_cert()
        if not ab_domain():
            raise RuntimeError("要先有網域")
        if not cert:
            raise RuntimeError("還沒有網域的憑證，等 Caddy 申請好再試")
        c = dict(ab_conf())
        if not os.path.isfile(AB_BIN) and not AB_FAKE:
            AB["job"] = "下載中"
            ab_download()
        AB["job"] = "啟動中"
        first = not os.path.isfile(AB_YAML)
        if first or not c.get("pw"):
            c["pw"] = secrets.token_urlsafe(24)
            c["t"] = int(time.time())
            ab_save(c)
            try:
                os.remove(AB_YAML)                 # 密碼對不上的舊設定：重新跑一次設定精靈
            except OSError:
                pass
            first = True
        if not AB_FAKE:
            ab_unit()
            ab_sh(["systemctl", "enable", AB_UNIT])
            ab_sh(["systemctl", "restart", AB_UNIT])
        if first:
            if not ab_wait("/control/install/get_addresses", auth=False):
                raise RuntimeError("AdGuard Home 沒有啟動")
            ip = ab_bind_ip()
            port = ab_free_port(ip)
            h, _, wp = AB_WEB.rpartition(":")
            code, out = ab_req("/control/install/configure", {"web": {"ip": h, "port": int(wp)}, "dns": {"ip": ip, "port": port},
                                                               "username": AB_USER, "password": c["pw"]}, auth=False, timeout=20)
            if code != 200:
                raise RuntimeError(f"設定失敗（{code} {out[:80]}）")
            c["port"] = port
            ab_save(c)
        if ab_wait() != 200:
            raise RuntimeError("AdGuard Home 沒有回應")
        AB["job"] = "設定加密"
        ok, out = ab_tls(cert)
        if not ok:
            raise RuntimeError(f"加密設定失敗（{out[:120]}）")
        c["crt"] = cert[2]
        ab_req("/control/querylog/config/update", {"enabled": True, "interval": 86400000, "anonymize_client_ip": False, "ignored": []}, method="PUT")
        ab_req("/control/stats/config/update", {"enabled": True, "interval": 86400000, "ignored": []}, method="PUT")
        time.sleep(0.5)
        if ab_plain_dns_open():
            raise RuntimeError("一般 DNS 關不掉，已停下來")
        doh = AB_FAKE or ab_doh_fix()
        if not ab_caddy(True):
            raise RuntimeError("Caddy 設定失敗")
        ab_fw(True)
        c["on"] = True
        ab_save(c)
        AB["err"], AB["down"], AB["st_t"] = "" if doh else "iPhone 用的連線沒通，Android 照樣能用", 0, 0
        log("擋廣告 DNS：打開了")
    except Exception as e:          # noqa: BLE001  背景工作：任何錯都要停下服務、讓網頁看得到
        AB["err"] = str(e) or "失敗了"
        if not AB_FAKE:
            ab_sh(["systemctl", "disable", "--now", AB_UNIT])
        log("擋廣告 DNS：", AB["err"])
    finally:
        AB["job"] = ""


def ab_off():
    c = dict(ab_conf())
    ab_sh(["systemctl", "disable", "--now", AB_UNIT])
    ab_caddy(False)
    ab_fw(False)
    c["on"] = False
    ab_save(c)
    AB["stats"] = None
    log("擋廣告 DNS：關掉了")


def ab_stats(fresh=False):
    """今天查了幾次、擋掉幾次、最常擋的網址（一分鐘最多問一次）"""
    if not ab_conf().get("on"):
        return None
    if not fresh and AB["stats"] and time.time() - AB["st_t"] < 60:
        return AB["stats"]
    code, out = ab_req("/control/stats", timeout=5)
    if code != 200:
        return AB["stats"]
    try:
        d = json.loads(out)
        q, b = int(d.get("num_dns_queries") or 0), int(d.get("num_blocked_filtering") or 0)
        top = []
        for x in (d.get("top_blocked_domains") or [])[:5]:
            if isinstance(x, dict) and x:
                k, v = next(iter(x.items()))
                top.append([str(k)[:80], int(v or 0)])
        hrs = ([0] * 24 + [int(x or 0) for x in (d.get("blocked_filtering") or [])])[-24:]   # 最近 24 小時，不夠的補 0
        AB["stats"] = {"q": q, "b": b, "pct": round(b * 100 / q) if q else 0, "top": top, "hrs": hrs,
                       "ms": round(float(d.get("avg_processing_time") or 0) * 1000)}
        AB["st_t"] = time.time()
    except (ValueError, TypeError, AttributeError):
        pass
    return AB["stats"]


def ab_brief():
    """給 /api/status：None＝沒網域、用不了；不然 {on, pct}"""
    c = ab_conf()
    if not ab_domain() and not c.get("on"):
        return None
    s = AB["stats"] if c.get("on") else None
    return {"on": bool(c.get("on")), "pct": s["pct"] if s else None, "job": bool(AB["job"])}


def ab_info():
    c = ab_conf()
    out = {"ok": True, "on": bool(c.get("on")), "job": AB["job"], "err": AB["err"], "domain": ab_domain(),
           "doh": ab_doh(), "dot": ab_domain(), "port": AB_DOT, "cert": bool(ab_cert())}
    if out["on"]:
        out["stats"] = ab_stats()
        out["down"] = AB["down"] >= 2
    return out


def ab_act(d):
    act = d.get("action")
    with AB_LOCK:
        if AB["job"]:
            return False, "正在設定，等一下", {}
        if act == "on":
            if not ab_domain():
                return False, "要先有網域", {}
            AB["job"], AB["err"] = "準備中", ""
            threading.Thread(target=ab_install, daemon=True).start()
            return True, "", {}
        if act == "off":
            if not ab_conf().get("on"):
                return True, "", {}
            ab_off()
            return True, "已關掉", {}
    return False, "不認得的動作", {}


def ab_profile(url, name):
    """iPhone 描述檔（.mobileconfig）：裝了就改用這個加密 DNS；回傳一次性的下載代碼"""
    try:
        u = urllib.parse.urlsplit(url)
    except ValueError:
        return None
    hosts = {ab_domain()} | {urllib.parse.urlsplit(p["url"]).hostname for p in PEERS}
    if u.scheme != "https" or u.path != "/dns-query" or u.hostname not in hosts - {"", None} or u.query or u.username:
        return None
    pid = str(uuid.uuid5(uuid.NAMESPACE_URL, url)).upper()
    title = f"擋廣告 DNS・{str(name)[:40]}"
    body = plistlib.dumps({
        "PayloadContent": [{"DNSSettings": {"DNSProtocol": "HTTPS", "ServerURL": url},
                            "PayloadDisplayName": title, "PayloadIdentifier": f"com.vps-sentinel.dns.{pid}.dns",
                            "PayloadType": "com.apple.dnsSettings.managed", "PayloadUUID": str(uuid.uuid5(uuid.NAMESPACE_URL, url + "#dns")).upper(),
                            "PayloadVersion": 1}],
        "PayloadDisplayName": title, "PayloadIdentifier": f"com.vps-sentinel.dns.{pid}", "PayloadRemovalDisallowed": False,
        "PayloadType": "Configuration", "PayloadUUID": pid, "PayloadVersion": 1})
    now = time.time()
    for k in [k for k, v in AB_TOK.items() if v[0] < now]:
        AB_TOK.pop(k, None)
    k = secrets.token_urlsafe(16)
    AB_TOK[k] = (now + 600, body)
    return k


def ab_profile_get(k):
    v = AB_TOK.pop(k, None) if isinstance(k, str) else None
    return v[1] if v and v[0] > time.time() else None


def ab_problems():
    c = ab_conf()
    return ["擋廣告 DNS 停了"] if c.get("on") and AB["down"] >= 2 and not AB["job"] else []


def ab_loop():
    """每分鐘看一下有沒有在跑；憑證換新就重新設定；每天問一次有沒有新版（有就讓它自己更新）"""
    while True:
        try:
            c = ab_conf()
            if c.get("on") and not AB["job"]:
                if not AB_FAKE and not os.path.isfile(AB_BIN):     # 剛還原好：程式不在，用備份的設定重新裝
                    with AB_LOCK:
                        AB["job"] = "準備中"
                    ab_install()
                code, _ = ab_req("/control/status", timeout=5)
                AB["down"] = 0 if code == 200 else AB["down"] + 1
                if code == 200:
                    cert = ab_cert()
                    if cert and cert[2] != c.get("crt") and ab_tls(cert)[0]:
                        c = dict(c)
                        c["crt"] = cert[2]
                        ab_save(c)
                    if ab_plain_dns_open():                          # 保險：一般 DNS 絕對不能開著
                        ab_tls(cert) if cert else None
                        if ab_plain_dns_open():
                            ab_sh(["systemctl", "stop", AB_UNIT])
                            AB["err"] = "一般 DNS 關不掉，已停下來"
                    ab_stats(fresh=True)
                    if time.time() - AB["upd_t"] > 86400:
                        AB["upd_t"] = time.time()
                        code, out = ab_req("/control/version.json", {"recheck_now": False}, timeout=30)
                        try:
                            v = json.loads(out) if code == 200 else {}
                        except ValueError:
                            v = {}
                        if isinstance(v, dict) and v.get("can_autoupdate") and v.get("new_version"):
                            ab_req("/control/update", {}, timeout=120)
        except Exception as e:      # noqa: BLE001  背景迴圈不能停
            log("擋廣告 DNS 檢查失敗：", e)
        time.sleep(int(os.environ.get("SENTINEL_AB_EVERY") or 60))
