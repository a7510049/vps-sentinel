"""哨站：擋廣告 DNS（AdGuard Home，`ab_` 開頭）。
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
AB = {"c": None, "job": "", "err": "", "stats": None, "st_t": 0, "down": 0, "upd_t": 0, "pub": "", "pub_t": 0, "ext": None, "ext_by": "", "ext_t": 0}
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
Description=哨站：擋廣告 DNS（AdGuard Home）
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


# 國際網站：常用的國際 DNS 一起用（哪家快就多問哪家）；Google、Quad9（dns11）、AdGuard 會照手機的網段回答（ECS）
AB_UP = ["https://dns.google/dns-query", "https://cloudflare-dns.com/dns-query", "https://dns11.quad9.net/dns-query",
         "https://unfiltered.adguard-dns.com/dns-query", "https://doh.opendns.com/dns-query"]
# 大陸網站才問大陸的 DNS（阿里、騰訊 DNSPod、360），其他一律不經過它們
AB_CN_UP = ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query", "https://doh.360.cn/dns-query"]
AB_CN = ("cn xn--fiqs8s baidu.com bdstatic.com bcebos.com baidupcs.com qq.com gtimg.com tencent.com myqcloud.com "
         "wechat.com weixin.com taobao.com tmall.com alicdn.com alipay.com aliyun.com alibaba.com alibabacloud.com "
         "jd.com 360buyimg.com bilibili.com hdslb.com biliapi.net douyin.com douyinvod.com douyincdn.com bytedance.com "
         "toutiao.com pstatp.com snssdk.com kuaishou.com iqiyi.com youku.com weibo.com sina.com 163.com 126.net "
         "netease.com xiaohongshu.com xhscdn.com meituan.com dianping.com pinduoduo.com yangkeduo.com zhihu.com zhimg.com "
         "csdn.net ctrip.com amap.com autonavi.com sohu.com ifeng.com dingtalk.com kugou.com ximalaya.com douban.com "
         "doubanio.com xiaomi.com mi.com 10010.com 360.com so.com mgtv.com").split()
AB_DNSV = 3       # 這份設定改了就加一，舊的設定會換成新的
# 完整的大陸網站清單（大家維護的 dnsmasq-china-list，約 10 萬個網域），每週更新；抓不到就用上面那份
AB_CNLIST = os.environ.get("SENTINEL_AB_CNLIST") or "https://raw.githubusercontent.com/felixonmars/dnsmasq-china-list/master/accelerated-domains.china.conf"
AB_UPFILE = os.path.join(AB_DIR, "upstream.txt")
AB_DOMRE = re.compile(r"(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*(?:[a-z0-9-]{1,63}|xn--[a-z0-9-]{1,59})")


def ab_cn_fetch():
    """下載完整的大陸網站清單；壞掉或太少就回 None"""
    try:
        req = urllib.request.Request(AB_CNLIST, headers={"User-Agent": f"vps-sentinel/{VERSION}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read(30 << 20).decode("utf-8", "replace")
    except (OSError, ValueError):
        return None
    out = set()
    for ln in txt.splitlines():
        m = re.match(r"server=/([^/]+)/", ln.strip())
        if m and AB_DOMRE.fullmatch(m.group(1).lower()):
            out.add(m.group(1).lower())
    return sorted(out) if len(out) >= 1000 or AB_FAKE else None


def ab_upstreams(cn=None):
    """上游 DNS 設定檔的每一行：國際的放前面；大陸網站一千個一行、指給大陸的 DNS"""
    doms = sorted(set(AB_CN) | set(cn or []))
    lines = list(AB_UP)
    for i in range(0, len(doms), 1000):
        part = "/".join(doms[i:i + 1000])
        lines += [f"[/{part}/]{u}" for u in AB_CN_UP]
    return lines


def ab_dns(c):
    """國際網站只問國際 DNS、大陸網站問大陸 DNS；查詢帶上手機所在的網段（ECS）；快取過期先給舊的答案、背景再更新（開網頁快）；
    檢查答案有沒有被竄改（DNSSEC）；同一支手機每秒最多 100 次（原本 20 次，開網頁時常常不夠）。
    設定版本（c["dnsv"]）沒變就只每週更新大陸清單；回傳更新過的 c（沒成功回 None）"""
    cn = ab_cn_fetch()
    try:
        tmp = AB_UPFILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(ab_upstreams(cn)) + "\n")
        os.replace(tmp, AB_UPFILE)
    except OSError:
        return None
    base = {"upstream_dns": AB_UP, "upstream_dns_file": AB_UPFILE, "upstream_mode": "load_balance",
            "edns_cs_enabled": True, "edns_cs_use_custom": False, "cache_optimistic": True, "cache_size": 8 << 20}
    more = {"enable_dnssec": True, "ratelimit": 100, "blocked_response_ttl": 10,
            "bootstrap_dns": ["1.1.1.1", "8.8.8.8", "9.9.9.10", "223.5.5.5"],
            "fallback_dns": ["https://dns.google/dns-query", "https://cloudflare-dns.com/dns-query"]}
    code, _ = ab_req("/control/dns_config", {**base, **more}, timeout=60)
    if code != 200:                     # 版本不認得其中幾個欄位：至少把分流、快取設好
        code, _ = ab_req("/control/dns_config", base, timeout=60)
    if code != 200:
        return None
    c = dict(c)
    c["dnsv"], c["cn_t"], c["cn_n"] = AB_DNSV, time.time(), len(cn or AB_CN)
    return c


def ab_dns_due(c):
    return c.get("dnsv") != AB_DNSV or time.time() - float(c.get("cn_t") or 0) > 7 * 86400


# 擋廣告清單：AdGuard Home 官方整理的清單庫裡挑的（預設那份「AdGuard DNS filter」原本就有）
AB_LIST_URL = "https://adguardteam.github.io/HostlistsRegistry/assets/filter_{}.txt"
AB_LISTS = (("中文廣告（anti-AD）", 21), ("惡意網站（URLhaus）", 11), ("釣魚網站（Phishing Army）", 18),
            ("釣魚網站（PhishTank、OpenPhish）", 30), ("詐騙網站（DurableNapkin）", 10),
            ("威脅情報（HaGeZi）", 44), ("惡意網站（Dandelion Sprout）", 12))
AB_LISTV = 2


def ab_lists():
    """把上面那幾份清單加進去（已經有的不重複加，在管理頁刪掉的下次改版本才會再加）"""
    code, out = ab_req("/control/filtering/status", timeout=10)
    try:
        have = {str(f.get("url")) for f in (json.loads(out).get("filters") or []) if isinstance(f, dict)} if code == 200 else None
    except (ValueError, AttributeError):
        have = None
    if have is None:
        return False
    ok = ab_req("/control/filtering/config", {"enabled": True, "interval": 12}, timeout=10)[0] == 200    # 清單每 12 小時更新
    for name, n in AB_LISTS:
        u = AB_LIST_URL.format(n)
        if u not in have:
            ok = ab_req("/control/filtering/add_url", {"name": name, "url": u, "whitelist": False}, timeout=90)[0] == 200 and ok
    return ok


# 擋錯了一鍵放行：寫成 AdGuard Home 自己的規則「@@||網域^$important」
def ab_rules():
    code, out = ab_req("/control/filtering/status", timeout=10)
    try:
        r = json.loads(out).get("user_rules") if code == 200 else None
    except (ValueError, AttributeError):
        r = None
    return [str(x) for x in r] if isinstance(r, list) else None


def ab_allowed(rules=None):
    rules = ab_rules() if rules is None else rules
    return [m.group(1) for m in (re.fullmatch(r"@@\|\|([^\^]+)\^\$important", x) for x in rules or []) if m]


def ab_allow(dom, on):
    dom = str(dom or "").strip().lower().rstrip(".")
    if not AB_DOMRE.fullmatch(dom):
        return False, "網址不對"
    rules = ab_rules()
    if rules is None:
        return False, "AdGuard Home 沒回應"
    rule = f"@@||{dom}^$important"
    rules = [x for x in rules if x != rule] + ([rule] if on else [])
    if ab_req("/control/filtering/set_rules", {"rules": rules}, timeout=15)[0] != 200:
        return False, "設定失敗"
    AB["st_t"] = 0
    return True, f"已放行 {dom}" if on else f"{dom} 照常擋"


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


def ab_pub_check():
    """從網域那頭用 853（DNS-over-TLS）問一次，跟手機走的一樣；回傳空字串是通的，不然是哪裡壞"""
    dom = ab_domain()
    return ab_dot_probe(dom) if dom else ""


def _ab_ip_global(ip_s):
    try:
        ip = ipaddress.ip_address(ip_s.split("%")[0])
    except ValueError:
        return False
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if ip.version == 6 and (ip in ipaddress.ip_network("64:ff9b::/96") or ip in ipaddress.ip_network("64:ff9b:1::/48")):
        return False
    return bool(ip.is_global and not ip.is_multicast)


def ab_probe_ips(host):
    """查網域並確認所有解析位址皆為公網 IP（防止 DNS Rebinding 與內網掃描）"""
    host = str(host or "").strip().lower().rstrip(".")
    if not AB_DOMRE.fullmatch(host) or "." not in host:
        return "", []
    try:
        ips = sorted({a[4][0].split("%")[0] for a in socket.getaddrinfo(host, AB_DOT, proto=socket.IPPROTO_TCP)})
    except OSError:
        return "", []
    if not ips:
        return "", []
    if not AB_FAKE and any(not _ab_ip_global(i) for i in ips):
        return "", []
    return host, ips


def ab_probe_ok(host):
    """別台叫我幫忙測的網域：要是正常網域、而且指到公開的位址（不能拿來掃內部網路）"""
    h, _ = ab_probe_ips(host)
    return h


def ab_dot_probe(dom, ips=None):
    """用 853（DNS-over-TLS）問 dom 一次；回傳空字串是通的，不然是哪裡壞"""
    if ips is None:
        dom, ips = ab_probe_ips(dom)
        if not dom or not ips:
            return f"{AB_DOT} 埠連不上（找不到合法公網位址）"
    q = b"\x00\x01\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00" + b"\x07example\x03com\x00\x00\x01\x00\x01"
    last_err = None
    for ip in ips:
        try:
            with socket.create_connection((ip, AB_DOT), timeout=10) as raw, \
                    ssl.create_default_context().wrap_socket(raw, server_hostname=dom) as t:
                t.sendall(len(q).to_bytes(2, "big") + q)
                b = b""
                while len(b) < 14:
                    x = t.recv(4096)
                    if not x:
                        break
                    b += x
            if len(b) < 14:
                return "AdGuard Home 沒有回答"
            return "" if b[5] & 15 == 0 else "AdGuard Home 查不到網址（上游 DNS 連不上）"
        except ssl.SSLError:
            return "憑證不對"
        except (OSError, ValueError) as e:
            last_err = e
    return f"{AB_DOT} 埠連不上（{str(getattr(last_err, 'strerror', '') or last_err)[:40]}）"


def ab_ext_check():
    """請配對的其他主機從外面連 853 試試（主機商的防火牆擋住時，從主機自己測不出來）；
    回傳 (結果, 哪一台)：結果 "" 是通的、None 是沒有別台能幫忙"""
    dom = ab_domain()
    for p in PEERS if dom else []:
        try:
            req = urllib.request.Request(p["url"] + "/api/ab-probe", data=json.dumps({"host": dom}).encode(), method="POST",
                                         headers={"X-Token": p["token"], "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=25) as r:
                d = json.loads(r.read())
            if isinstance(d, dict) and "err" in d:
                return str(d["err"] or "")[:120], p["name"]
        except Exception:  # noqa: BLE001  那台舊版或連不上：換下一台
            continue
    return None, ""


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
        AB["job"] = "設定上游 DNS"
        if ab_dns_due(c):
            c = ab_dns(c) or c
        AB["job"] = "下載擋廣告清單"
        if c.get("listv") != AB_LISTV and ab_lists():
            c["listv"] = AB_LISTV
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
        log("AdGuard Home：打開了")
    except Exception as e:          # noqa: BLE001  背景工作：任何錯都要停下服務、讓網頁看得到
        AB["err"] = str(e) or "失敗了"
        if not AB_FAKE:
            ab_sh(["systemctl", "disable", "--now", AB_UNIT])
        log("AdGuard Home：", AB["err"])
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
    log("AdGuard Home：關掉了")


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
                       "ms": round(float(d.get("avg_processing_time") or 0) * 1000), "recent": ab_recent()}
        AB["st_t"] = time.time()
    except (ValueError, TypeError, AttributeError):
        pass
    return AB["stats"]


def ab_recent(n=15):
    """最近擋掉的網址（同一個只留最新那次）：[[網址, 時間]]"""
    code, out = ab_req("/control/querylog?limit=200&response_status=blocked", timeout=8)
    try:
        rows = json.loads(out).get("data") if code == 200 else None
    except (ValueError, AttributeError):
        rows = None
    res, seen = [], set()
    for r in rows or []:
        try:
            d = str(r["question"]["name"]).lower().rstrip(".")[:80]
            t = re.sub(r"(\.\d{6})\d+", r"\1", str(r.get("time") or "")).replace("Z", "+00:00")
            ts = int(datetime.fromisoformat(t).timestamp())
        except (KeyError, TypeError, ValueError):
            continue
        if d and d not in seen:
            seen.add(d)
            res.append([d, ts])
        if len(res) >= n:
            break
    return res


def ab_brief():
    """給 /api/status：None＝沒網域、用不了；不然 {on, pct}"""
    c = ab_conf()
    if not ab_domain() and not c.get("on"):
        return None
    s = AB["stats"] if c.get("on") else None
    err = bool(c.get("on") and (AB["down"] >= 2 or AB["pub"] or AB["ext"]))
    return {"on": bool(c.get("on")), "pct": s["pct"] if s else None, "job": bool(AB["job"]), "err": err}


def ab_info():
    c = ab_conf()
    out = {"ok": True, "on": bool(c.get("on")), "job": AB["job"], "err": AB["err"], "domain": ab_domain(),
           "doh": ab_doh(), "dot": ab_domain(), "port": AB_DOT, "cert": bool(ab_cert())}
    if out["on"]:
        out["stats"] = ab_stats()
        out["down"] = AB["down"] >= 2
        out["pub"] = AB["pub"]
        out["ext"], out["ext_by"] = AB["ext"], AB["ext_by"]
        out["allow"] = ab_allowed() or []
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
        if act in ("allow", "unallow"):
            if not ab_conf().get("on"):
                return False, "還沒打開", {}
            ok, msg = ab_allow(d.get("domain"), act == "allow")
            return ok, msg, {}
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
    # iPhone 也走 853 的 DNS-over-TLS（跟 Android 一樣）：DoH 網址裡的 9443 會被 iPhone 忽略，直接敲 443（常被別的程式佔著）
    dns = {"DNSProtocol": "TLS", "ServerName": u.hostname}
    try:                                    # 附上主機的位址：iPhone 不用先查網域就連得到（少一個卡住的地方）
        ips = sorted({a[4][0] for a in socket.getaddrinfo(u.hostname, None, proto=socket.IPPROTO_TCP)
                      if not ipaddress.ip_address(a[4][0]).is_private and not ipaddress.ip_address(a[4][0]).is_loopback})
        if ips:
            dns["ServerAddresses"] = ips[:4]
    except (OSError, ValueError):
        pass
    title = f"AdGuard Home・{str(name)[:40]}"
    body = plistlib.dumps({
        "PayloadContent": [{"DNSSettings": dns,
                            "PayloadDisplayName": title, "PayloadIdentifier": f"com.vps-sentinel.dns.{pid}.dns",
                            "PayloadType": "com.apple.dnsSettings.managed", "PayloadUUID": str(uuid.uuid5(uuid.NAMESPACE_URL, url + "#dns")).upper(),
                            "PayloadVersion": 1}],
        "PayloadDisplayName": title, "PayloadIdentifier": f"com.vps-sentinel.dns.{pid}", "PayloadRemovalDisallowed": False,
        "PayloadType": "Configuration", "PayloadUUID": pid, "PayloadVersion": 1})
    now = time.time()
    k = secrets.token_urlsafe(16)
    with AB_LOCK:
        for old in [x for x, v in AB_TOK.items() if v[0] < now]:
            AB_TOK.pop(old, None)
        while len(AB_TOK) >= 64:
            AB_TOK.pop(next(iter(AB_TOK)))
        AB_TOK[k] = (now + 600, body)
    return k


def ab_profile_get(k):
    with AB_LOCK:
        v = AB_TOK.pop(k, None) if isinstance(k, str) else None
    return v[1] if v and v[0] > time.time() else None


# ───────────────────────── 管理頁（AdGuard Home 自己的網頁，經過哨兵才進得去） ─────────────────────────
# 跟雲端硬碟一樣：每次打開先在主要主機驗證 PIN 碼／手機金鑰／密碼，拿一次性登入票，換這個瀏覽器的通行證（vs_agh）；
# 哨兵轉過去時自己帶上 AdGuard Home 的帳號，所以不用另外記密碼。管理頁本身還是只開在本機。
AB_PATH = "/adguard"
AB_SESS = {"c": "", "t": 0}


def ab_base():
    dom = ab_domain()
    if not dom:
        return ""
    port = C.get("HTTPS_PORT") or "443"
    return f"https://{dom}" + ("" if port == "443" else f":{port}")


def ab_ticket():
    n, exp = secrets.token_urlsafe(12), int(time.time()) + CLOUD_TK_MIN * 60
    return {"ok": True, "ticket": f"{n}.{exp}.{_sign(f'agh-sso:v1:{n}:{exp}')}", "login": ab_base() + "/adguard-sso"}


def ab_ticket_use(t):
    n, exp, sig = (str(t or "").split(".") + ["", "", ""])[:3]
    if not (re.fullmatch(r"[A-Za-z0-9_-]{8,40}", n) and re.fullmatch(r"[0-9]{1,12}", exp)
            and hmac.compare_digest(sig.encode(), _sign(f"agh-sso:v1:{n}:{exp}").encode())):
        return False
    now = time.time()
    with CLOUD_TK_LOCK:
        for k in [k for k, v in CLOUD_TK_USED.items() if v < now]:
            del CLOUD_TK_USED[k]
        if int(exp) < now or "agh:" + n in CLOUD_TK_USED:
            return False
        CLOUD_TK_USED["agh:" + n] = int(exp)
    return True


def ab_cookie_value():
    exp, g = int(time.time() + CLOUD_HOURS * 3600), cloud_gen()       # 登出裝置時跟雲端硬碟一起作廢
    return f"{exp}.{g}.{_sign(f'agh-cookie:v1:{g}:{exp}')}"


def ab_cookie_ok(v):
    p = (v or "").split(".")
    if len(p) != 3:
        return False
    exp, g, sig = p
    return (bool(re.fullmatch(r"[0-9]{1,12}", exp)) and int(exp) > time.time() and g == str(cloud_gen())
            and hmac.compare_digest(sig.encode(), _sign(f"agh-cookie:v1:{g}:{exp}").encode()))


def ab_session(fresh=False):
    """哨兵自己登入 AdGuard Home 拿的登入 cookie（管理頁轉過去時帶上），6 小時換一次"""
    if not fresh and AB_SESS["c"] and time.time() - AB_SESS["t"] < 6 * 3600:
        return AB_SESS["c"]
    pw = ab_conf().get("pw")
    if not pw:
        return ""
    req = urllib.request.Request(AB_API + "/control/login", data=json.dumps({"name": AB_USER, "password": pw}).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=8) as r:
            ck = [h.split(";")[0].strip() for h in r.headers.get_all("Set-Cookie") or []]
    except (OSError, ValueError):
        ck = []
    AB_SESS["c"], AB_SESS["t"] = "; ".join(c for c in ck if "=" in c), time.time()
    return AB_SESS["c"]


def ab_is(path):
    return path in (AB_PATH, AB_PATH + "-sso") or path.startswith(AB_PATH + "/")


def ab_proxy(h):
    """/adguard/… 轉給本機的 AdGuard Home 管理頁"""
    u = urllib.parse.urlsplit(h.path)
    if u.path == AB_PATH + "-sso":                  # 從哨兵點進來：一次性登入票（表單送的）換這個瀏覽器的通行證
        ok = False
        if h.command == "POST":
            raw = h.read_body(4096)
            if raw is not None:
                ok = ab_ticket_use(urllib.parse.parse_qs(raw.decode("utf-8", "replace")).get("t", [""])[0])
        h.send_response(303)
        if ok:
            secure = "; Secure" if h.https() else ""
            h.send_header("Set-Cookie", f"vs_agh={ab_cookie_value()}; Path={AB_PATH}/; HttpOnly; SameSite=Strict{secure}")
        h.send_header("Location", AB_PATH + "/" if ok or ab_authed(h) else "/")
        h.send_header("Cache-Control", "no-store")
        h.send_header("Content-Length", "0")
        h.end_headers()
        return None
    if not ab_authed(h) or not ab_conf().get("on"):
        if h.command == "GET" and "text/html" in (h.headers.get("Accept") or ""):
            h.send_response(302)                      # 沒通行證：回哨兵（從 AdGuard Home 視窗再點一次）
            h.send_header("Location", "/")
            h.send_header("Content-Length", "0")
            h.end_headers()
            return None
        return h.send(401, '{"error":"請先登入"}')
    if h.command not in ("GET", "HEAD", "OPTIONS"):
        sfs = (h.headers.get("Sec-Fetch-Site") or "").lower()
        orig = (h.headers.get("Origin") or "").strip()
        host = (h.headers.get("Host") or "").strip().lower()
        if sfs and sfs not in ("same-origin", "none"):
            return h.send(403, '{"error":"來源不符"}')
        if orig:
            ou = urllib.parse.urlsplit(orig)
            if (ou.netloc or "").lower() != host:
                return h.send(403, '{"error":"來源不符"}')
    if u.path == AB_PATH:
        h.send_response(301)
        h.send_header("Location", AB_PATH + "/")
        h.send_header("Content-Length", "0")
        h.end_headers()
        return None
    path = h.path[len(AB_PATH):] or "/"
    body = None
    if h.headers.get("Content-Length") is not None:
        body = h.read_body(8 << 20)
        if body is None:
            return h.send(400, '{"error":"請求大小不合法"}')
    for again in (False, True):
        hd = {k: v for k, v in h.headers.items() if k.lower() not in h.HOP and k.lower() not in ("host", "cookie", "authorization", "content-length", "accept-encoding")}
        own = [c.strip() for c in (h.headers.get("Cookie") or "").split(";") if c.strip() and not c.strip().startswith(("vs_", "agh_session"))]
        sess = ab_session(fresh=again)
        hd["Cookie"] = "; ".join(own + ([sess] if sess else []))
        hd["Authorization"] = "Basic " + base64.b64encode(f"{AB_USER}:{ab_conf().get('pw', '')}".encode()).decode()
        hd["X-Forwarded-For"] = h.client_ip()
        try:
            req = urllib.request.Request(AB_API + path, data=body, headers=hd, method=h.command)
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect)
            try:
                r = opener.open(req, timeout=60)
            except urllib.error.HTTPError as e:
                r = e
            data, st, hs = r.read(), r.status if hasattr(r, "status") else r.code, list(r.headers.items())
        except (OSError, ValueError):
            return h.send(502, "<meta charset=utf-8><p style='font:16px sans-serif;padding:24px'>AdGuard Home 目前打不開，請稍後再試</p>", "text/html; charset=utf-8")
        loc = dict((k.lower(), v) for k, v in hs).get("location", "")
        if not again and (st == 401 or "login.html" in loc):          # 哨兵的登入過期了：重新登入再試一次
            continue
        break
    h.send_response(st)
    for k, v in hs:
        kl = k.lower()
        if kl in h.HOP or kl in ("content-length", "set-cookie", "content-encoding"):
            continue
        if kl == "location" and v.startswith("/") and not v.startswith("//"):
            v = AB_PATH + v
        h.send_header(k, v)
    h.send_header("Content-Length", str(len(data)))
    h.end_headers()
    if h.command != "HEAD":
        h.wfile.write(data)
    return None


def ab_authed(h):
    for part in (h.headers.get("Cookie") or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == "vs_agh" and ab_cookie_ok(v):
            return True
    return False


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def ab_problems():
    c = ab_conf()
    return ["AdGuard Home 停了"] if c.get("on") and AB["down"] >= 2 and not AB["job"] else []


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
                    if ab_dns_due(c):                               # 舊版打開的補設一次；大陸網站清單每週更新
                        c2 = ab_dns(ab_conf())
                        if c2:
                            ab_save(c2)
                            c = c2
                    if c.get("listv") != AB_LISTV and ab_lists():
                        c = dict(ab_conf())
                        c["listv"] = AB_LISTV
                        ab_save(c)
                    if not AB_FAKE and time.time() - AB["pub_t"] > (60 if AB["pub"] else 300):
                        AB["pub_t"], AB["pub"] = time.time(), ab_pub_check()
                    if PEERS and time.time() - AB["ext_t"] > (120 if AB["ext"] else 1800):
                        AB["ext_t"] = time.time()
                        AB["ext"], AB["ext_by"] = ab_ext_check()
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
            log("AdGuard Home 檢查失敗：", e)
        time.sleep(int(os.environ.get("SENTINEL_AB_EVERY") or 60))
