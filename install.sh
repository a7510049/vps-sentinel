#!/usr/bin/env bash
# VPS 哨兵：安裝／更新
#
# 用法：
#   sudo bash install.sh                   第一次安裝會問你：全新安裝，還是從備份還原；之後執行就是更新
#   sudo bash install.sh 你的網域           加上加密連線（https://你的網域），會自動安裝 Caddy
#   sudo bash install.sh --restore [網域]   從備份還原：裝好後打開網頁，上傳備份檔就會還原
#   sudo bash install.sh --fresh [網域]     全新安裝（不問）
#
set -euo pipefail

# ── 畫面：有顏色的步驟、打勾、轉圈圈（不是在終端機裡執行時，例如網頁上的一鍵更新，就只印文字）──
if [ -t 1 ]; then
  B=$'\e[1m' D=$'\e[2m' G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' C=$'\e[36m' N=$'\e[0m'
else
  B="" D="" G="" Y="" R="" C="" N=""
fi
STEP=0
TOTAL=4
step() { STEP=$((STEP + 1)); printf '\n%s[%d/%d]%s %s%s%s\n' "$C" "$STEP" "$TOTAL" "$N" "$B" "$1" "$N"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$1"; }
info() { printf '  %sℹ%s %s\n' "$C" "$N" "$1"; }
warn() { printf '  %s⚠%s %s\n' "$Y" "$N" "$1"; }
die()  {   # die 原因 [補充說明…]
  printf '\n  %s✗ %s%s\n' "$R" "$1" "$N"; shift
  for l in "$@"; do printf '    %s\n' "$l"; done
  echo; exit 1
}
spin() {   # spin 說明 指令…：比較久的步驟顯示轉圈圈，做完印打勾；失敗回傳失敗
  local msg="$1" pid rc=0 i=0 fr=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏); shift
  if [ ! -t 1 ]; then "$@" && ok "$msg"; return; fi
  "$@" >/dev/null 2>&1 & pid=$!
  while kill -0 "$pid" 2>/dev/null; do printf '\r  %s%s%s %s' "$C" "${fr[i++ % 10]}" "$N" "$msg"; sleep 0.1; done
  wait "$pid" || rc=$?
  printf '\r\033[K'
  [ "$rc" = 0 ] && ok "$msg"
  return "$rc"
}

[ "$(id -u)" = 0 ] || die "請用 sudo 執行" "sudo bash install.sh"
command -v systemctl >/dev/null || die "這台主機沒有 systemd，無法自動安裝"
command -v python3 >/dev/null || { apt-get update -qq && apt-get install -y -qq python3; }

MODE=""
DOMAIN=""
for a in "$@"; do
  case "$a" in
    --restore) MODE=restore ;;
    --fresh) MODE=fresh ;;
    -*) die "看不懂的選項：$a" "用法：sudo bash install.sh [--fresh|--restore] [你的網域]" ;;
    *) DOMAIN="$a" ;;
  esac
done
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR=/opt/vps-sentinel-lite
CONF=/etc/vps-sentinel-lite.conf
UNIT=/etc/systemd/system/vps-sentinel-lite.service
RSW_DIR=/var/lib/vps-sentinel-restore
VER="$(grep -m1 -E '^VERSION = ' "$HERE/sentinel.py" | cut -d'"' -f2)"

printf '\n  %s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$C" "$N"
printf '    %s🛡  VPS 哨兵%s  %s%s v%s%s\n' "$B" "$N" "$( [ -f "$CONF" ] && echo 更新 || echo 安裝 )" "$D" "$VER" "$N"
printf '  %s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$C" "$N"

# 第一次安裝：問要全新安裝還是從備份還原、要不要設網域（不是在終端機裡執行就不問）
if [ ! -f "$CONF" ] && [ -t 0 ]; then
  if [ -z "$MODE" ]; then
    printf '\n  這台還沒裝過哨兵，要怎麼裝？\n'
    printf '    %s1%s  全新安裝\n' "$B" "$N"
    printf '    %s2%s  從備份還原 %s（裝好後在網頁上傳備份檔）%s\n' "$B" "$N" "$D" "$N"
    read -rp "  請輸入 1 或 2（直接按 Enter＝1）：" ans
    case "$ans" in 2|２) MODE=restore ;; *) MODE=fresh ;; esac
  fi
  if [ -z "$DOMAIN" ]; then
    printf '\n  有網域嗎？有的話會設定加密連線（https）\n'
    [ "$MODE" = restore ] && printf '  %s先不設也沒關係：還原時會自動用回備份裡的網域%s\n' "$D" "$N"
    read -rp "  輸入網域，或直接按 Enter 先不設定：" DOMAIN
    DOMAIN="$(echo "$DOMAIN" | tr -d '[:space:]')"
  fi
fi
[ -n "$DOMAIN" ] && TOTAL=$((TOTAL + 1))
[ -f /opt/vps-cloud/data/config.yaml ] && [ -f "$HERE/cloud.sh" ] && TOTAL=$((TOTAL + 1))

set_conf() {   # set_conf 名稱 值
  if grep -q "^$1=" "$CONF"; then sed -i "s|^$1=.*|$1=$2|" "$CONF"; else echo "$1=$2" >> "$CONF"; fi
}

# 安裝 Caddy：依序嘗試 ①官方來源 ②Ubuntu 內建 ③直接從 GitHub 下載
install_caddy() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y -qq curl gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null 2>&1 || true

  if curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
       | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null \
     && curl -1sLf -o /etc/apt/sources.list.d/caddy-stable.list \
       'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
     && chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list \
     && apt-get update -qq >/dev/null 2>&1 \
     && apt-get install -y -qq caddy >/dev/null 2>&1; then
    return 0
  fi
  rm -f /etc/apt/sources.list.d/caddy-stable.list   # 壞掉的來源要拿掉，不然以後 apt 都會報錯

  # 官方來源暫時無法使用，改用 Ubuntu 內建版本
  apt-get update -qq >/dev/null 2>&1 || true
  if apt-get install -y -qq caddy >/dev/null 2>&1; then
    return 0
  fi

  # 改從 GitHub 直接下載
  local arch ver tmp
  case "$(uname -m)" in
    x86_64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; armv7l) arch=armv7 ;; *) return 1 ;;
  esac
  ver="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/caddyserver/caddy/releases/latest \
         | sed -E 's#.*/tag/v##')"
  [[ "$ver" =~ ^[0-9][0-9.]*$ ]] || return 1
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${ver}/caddy_${ver}_linux_${arch}.tar.gz" \
    | tar -xz -C "$tmp" caddy || { rm -rf "$tmp"; return 1; }
  install -m 755 "$tmp/caddy" /usr/bin/caddy
  rm -rf "$tmp"
  id caddy >/dev/null 2>&1 || useradd --system --home /var/lib/caddy --create-home --shell /usr/sbin/nologin caddy
  install -d /etc/caddy
  cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

# 之前失敗留下的 Caddy 來源會讓 apt 一直報錯，先清掉
if ! command -v caddy >/dev/null && [ -f /etc/apt/sources.list.d/caddy-stable.list ]; then
  rm -f /etc/apt/sources.list.d/caddy-stable.list
fi

# ── 1. 安裝主程式 ──
step "安裝主程式"
rm -rf "$DIR.prev"
[ -f "$DIR/sentinel.py" ] && cp -a "$DIR" "$DIR.prev"   # 留一份舊版：新版啟動失敗就換回來
install -d "$DIR"
install -m 755 "$HERE/sentinel.py" "$DIR/sentinel.py"
install -d "$DIR/web"
install -m 644 "$HERE"/web/index.html "$HERE"/web/style.css "$HERE"/web/app.js "$DIR/web/"
ok "放在 $DIR"

# ── 2. 設定檔（已存在就保留） ──
step "設定檔"
if [ -f "$CONF" ]; then ok "沿用原本的設定（$CONF）"; NEWCONF=""; else NEWCONF=1; fi
if [ ! -f "$CONF" ]; then
  TOKEN="$(python3 -c 'import secrets;print(secrets.token_urlsafe(18))')"
  cat > "$CONF" <<EOF
# ── VPS 哨兵 設定檔 ── 改完執行：sudo systemctl restart vps-sentinel-lite

# 顯示名稱（空白就用主機名稱）
NAME=$(hostname)

# 存取密碼（手機第一次開網頁時要輸入）
TOKEN=$TOKEN

# 網頁開在哪裡：0.0.0.0 = 對外開放；127.0.0.1 = 只給本機的 Caddy 使用（有設網域時）
BIND=0.0.0.0
PORT=8787

# 加密連線用的網域（由安裝腳本自動填寫，僅供參考）
DOMAIN=

# 要監看的系統服務（逗號分隔），例如：nginx,ssh,caddy
SERVICES=

# 要監看的磁碟（逗號分隔）
DISKS=/

# 其他 VPS（逗號分隔，格式：名稱=網址，密碼不同就在網址後加 |密碼）
# 例如：PEERS=東京=https://tokyo.example.com,大阪=http://1.2.3.4:8787|另一組密碼
PEERS=

# Telegram 通知（兩個都填才會開啟）
TG_BOT_TOKEN=
TG_CHAT_ID=

# 每月流量（也可以直接在網頁上點「本月流量」旁的齒輪設定）
# 上限單位 GB，0 = 不限制；重置日 1～28；計算方式 both=上傳＋下載、out=只算上傳、in=只算下載、max=取較大的
TRAFFIC_LIMIT_GB=0
TRAFFIC_RESET_DAY=1
TRAFFIC_COUNT=both

# 警告門檻（百分比）；處理器要持續超過幾分鐘才通知
ALERT_CPU=90
ALERT_CPU_MINUTES=5
ALERT_MEM=90
ALERT_DISK=90
EOF
  chmod 600 "$CONF"
  ok "建立新的設定檔（$CONF）"
fi

# 舊版可能綁在 Tailscale 的位址上；那個位址不存在了就改回對外開放
CUR_BIND="$(grep -E '^BIND=' "$CONF" | cut -d= -f2 || true)"
if [ -n "$CUR_BIND" ] && [ "$CUR_BIND" != "0.0.0.0" ] && [ "$CUR_BIND" != "127.0.0.1" ] \
   && ! hostname -I | tr ' ' '\n' | grep -qx "$CUR_BIND"; then
  info "原本設定的位址 $CUR_BIND 已不存在，改為對外開放"
  set_conf BIND 0.0.0.0
fi

# 記住安裝來源資料夾：網頁上的「更新哨兵」會從這裡抓新版
if [ -d "$HERE/.git" ]; then set_conf SRC_DIR "$HERE"; fi

# ── 3. 加密連線（有給網域才做） ──
if [ -n "$DOMAIN" ]; then
  step "加密連線（$DOMAIN）"
  # 先檢查連接埠，絕對不去搶別的服務（例如翻牆服務）正在用的連接埠
  port_owner() {   # port_owner tcp|udp 連接埠 → 印出使用中的程式名稱
    ss -lnpH -A "$1" "( sport = :$2 )" 2>/dev/null | grep -o 'users:(("[^"]*"' | head -1 | cut -d'"' -f2 || true
  }
  if [ -z "${HTTPS_PORT:-}" ]; then
    OWNER="$(port_owner tcp 443)"
    if [ -z "$OWNER" ] || [ "$OWNER" = caddy ]; then
      HTTPS_PORT=443
    else
      HTTPS_PORT=9443
      info "443 已經被「$OWNER」使用中，不會去動它；加密連線改用 $HTTPS_PORT"
    fi
  fi
  OWNER="$(port_owner tcp "$HTTPS_PORT")"
  if [ -n "$OWNER" ] && [ "$OWNER" != caddy ]; then
    die "連接埠 $HTTPS_PORT 被「$OWNER」使用中。可以換一個號碼，例如：" "sudo HTTPS_PORT=10443 bash install.sh $DOMAIN"
  fi
  # 申請憑證需要 80 連接埠。被 nginx 佔用時，不去搶，改請 nginx 把「驗證網域」的請求轉交給 Caddy
  CADDY_HTTP_PORT=80
  NGINX_ACME=""
  OWNER="$(port_owner tcp 80)"
  if [ -n "$OWNER" ] && [ "$OWNER" != caddy ]; then
    if [ "$OWNER" = nginx ] && command -v nginx >/dev/null; then
      CADDY_HTTP_PORT=8880
      while [ -n "$(port_owner tcp "$CADDY_HTTP_PORT")" ] && [ "$(port_owner tcp "$CADDY_HTTP_PORT")" != caddy ]; do
        CADDY_HTTP_PORT=$((CADDY_HTTP_PORT + 1))
      done
      NGINX_ACME=1
      info "80 已經被「nginx」使用中，不會去動它；改由 nginx 轉交憑證驗證"
    else
      die "申請加密憑證需要用到 80 連接埠，但它被「$OWNER」使用中，無法自動設定" "請把這段畫面截圖給我，我幫你看怎麼處理"
    fi
  fi

  if [ "$HTTPS_PORT" = 443 ]; then SHOWURL="https://$DOMAIN"; else SHOWURL="https://$DOMAIN:$HTTPS_PORT"; fi
  if ! command -v caddy >/dev/null; then
    spin "安裝 Caddy（自動申請免費加密憑證的小程式）" install_caddy || die "Caddy 安裝失敗" "請把這段畫面截圖給我"
  else
    ok "Caddy 已經裝好了"
  fi

  install -d /etc/caddy/sites
  PORT_NOW="$(grep -E '^PORT=' "$CONF" | cut -d= -f2)"
  if [ "$HTTPS_PORT" = 443 ]; then SITE="$DOMAIN"; else SITE="$DOMAIN:$HTTPS_PORT"; fi
  install -d /etc/caddy/sites/vps-sentinel.d
  [ -f /etc/caddy/sites/vps-sentinel.d/00-keep.caddy ] || echo "# 附加功能（例如雲端硬碟）的設定放這個資料夾" > /etc/caddy/sites/vps-sentinel.d/00-keep.caddy
  cat > /etc/caddy/sites/vps-sentinel.caddy <<EOF
# VPS 哨兵（由安裝腳本產生）
$SITE {
	encode gzip
	import /etc/caddy/sites/vps-sentinel.d/*.caddy
	handle {
		reverse_proxy 127.0.0.1:${PORT_NOW:-8787}
	}
}
EOF
  touch /etc/caddy/Caddyfile
  # 全域設定：
  #  ‧ 關掉 HTTP/3：它會佔用 UDP 連接埠，可能跟 Hysteria2 之類的服務衝突
  #  ‧ 80 被 nginx 佔用時，Caddy 改聽別的連接埠，由 nginx 轉交過來
  # 開頭的全域設定如果是本程式寫的（只含下面這幾種設定），就整段換新；是你自己寫的就不動
  GLOBAL="$(awk 'NR==1 && $0!="{" {exit} {print} $0=="}" {exit}' /etc/caddy/Caddyfile)"
  if [ -n "$GLOBAL" ] && printf '%s\n' "$GLOBAL" | grep -vqE '^[[:space:]]*(\{|\}|servers \{|protocols h1 h2|http_port [0-9]+|#.*)?[[:space:]]*$'; then
    warn "你的 Caddyfile 已經有自己的全域設定，請自己在裡面加上：servers { protocols h1 h2 }"
    [ "$CADDY_HTTP_PORT" != 80 ] && echo "    以及：http_port $CADDY_HTTP_PORT"
  else
    if [ -n "$GLOBAL" ]; then
      awk 'f{print;next} $0=="}"{f=1;next} NR==1 && $0!="{"{f=1;print}' /etc/caddy/Caddyfile \
        | sed '/./,$!d' > /etc/caddy/Caddyfile.rest
    else
      cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.rest
    fi
    {
      printf '{\n'
      [ "$CADDY_HTTP_PORT" != 80 ] && printf '\thttp_port %s\n' "$CADDY_HTTP_PORT"
      printf '\tservers {\n\t\tprotocols h1 h2\n\t}\n}\n\n'
      cat /etc/caddy/Caddyfile.rest
    } > /etc/caddy/Caddyfile.new
    mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
    rm -f /etc/caddy/Caddyfile.rest
  fi
  grep -q 'import sites/\*.caddy' /etc/caddy/Caddyfile || printf '\nimport sites/*.caddy\n' >> /etc/caddy/Caddyfile

  # 請 nginx 把這個網域的「憑證驗證」轉交給 Caddy（其他網址一律導向加密連線）
  NGX_FILE=""
  if [ -d /etc/nginx/conf.d ] && nginx -T 2>/dev/null | grep -qE 'include[^;]*conf\.d/\*'; then
    NGX_FILE=/etc/nginx/conf.d/vps-sentinel-acme.conf
  elif [ -d /etc/nginx/sites-enabled ]; then
    NGX_FILE=/etc/nginx/sites-enabled/vps-sentinel-acme.conf
  fi
  if [ -n "$NGINX_ACME" ]; then
    [ -n "$NGX_FILE" ] || die "找不到 nginx 的設定資料夾，無法自動設定" "請把這段畫面截圖給我"
    rm -f /etc/nginx/conf.d/vps-sentinel-acme.conf /etc/nginx/sites-enabled/vps-sentinel-acme.conf
    if nginx -T 2>/dev/null | grep -E '^[[:space:]]*server_name' | grep -qw -- "$DOMAIN"; then
      warn "nginx 裡已經有別的設定在用 $DOMAIN，可能會搶走憑證驗證。"
      echo "    如果最後憑證申請失敗，建議另外開一個子網域給哨兵用（例如 mon.$DOMAIN）"
    fi
    LISTEN6=""
    nginx -T 2>/dev/null | grep -qE 'listen[[:space:]]+\[::\]:80' && LISTEN6="	listen [::]:80;"
    if [ "$HTTPS_PORT" = 443 ]; then REDIR="https://\$host\$request_uri"; else REDIR="https://\$host:$HTTPS_PORT\$request_uri"; fi
    cat > "$NGX_FILE" <<EOF
# VPS 哨兵（由安裝腳本產生）：把憑證驗證轉交給 Caddy
server {
	listen 80;
$LISTEN6
	server_name $DOMAIN;
	location /.well-known/acme-challenge/ {
		proxy_pass http://127.0.0.1:$CADDY_HTTP_PORT;
		proxy_set_header Host \$host;
	}
	location / {
		return 301 $REDIR;
	}
}
EOF
    if ! nginx -t >/dev/null 2>&1; then
      rm -f "$NGX_FILE"
      nginx -t || true
      die "nginx 設定檢查沒通過（已還原，沒有改到你原本的設定）" "請把這段畫面截圖給我"
    fi
    systemctl reload nginx 2>/dev/null || nginx -s reload
  elif [ -n "$NGX_FILE" ] && [ -f "$NGX_FILE" ]; then
    rm -f "$NGX_FILE"   # 不再需要 nginx 轉交，把之前加的設定拿掉
    nginx -t >/dev/null 2>&1 && { systemctl reload nginx 2>/dev/null || nginx -s reload; }
  fi

  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    die "Caddy 設定有問題" "請看：caddy validate --config /etc/caddy/Caddyfile"
  fi
  systemctl enable caddy >/dev/null 2>&1
  systemctl reload caddy 2>/dev/null || systemctl restart caddy || die "Caddy 啟動失敗" "請看：journalctl -u caddy -n 30"

  # Caddy 確定好了才改成只讓本機連（不然 Caddy 壞掉時，哨兵重新啟動後就完全打不開）
  set_conf BIND 127.0.0.1      # 只讓 Caddy 從本機連，外面一律走 https
  set_conf DOMAIN "$DOMAIN"
  set_conf HTTPS_PORT "$HTTPS_PORT"
  ok "網址：$SHOWURL"

  # 檢查網域是不是指向這台 VPS
  MYIP="$(curl -s4 --max-time 4 https://ifconfig.me || true)"
  DNSIP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
  if [ -z "$MYIP" ]; then
    warn "查不到這台的對外 IP，沒辦法確認網域有沒有指向這台"
  elif [ "$DNSIP" != "$MYIP" ]; then
    warn "網域 $DOMAIN 目前指向「${DNSIP:-找不到}」，但這台 VPS 是「$MYIP」"
    echo "    請到網域商把 A 紀錄設成 $MYIP，生效後 Caddy 會自動申請憑證（不用重新安裝）"
  else
    ok "網域有指向這台主機"
  fi
fi

# ── 4. VPS 內的防火牆：打開需要的連接埠 ──
step "防火牆"
if [ "$(grep -E '^BIND=' "$CONF" | cut -d= -f2)" = "127.0.0.1" ]; then
  OPEN_PORTS="80 $(grep -E '^HTTPS_PORT=' "$CONF" | cut -d= -f2 || echo 443)"
else
  OPEN_PORTS="$(grep -E '^PORT=' "$CONF" | cut -d= -f2)"
fi
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  for p in $OPEN_PORTS; do ufw allow "$p/tcp" >/dev/null; done
elif command -v netfilter-persistent >/dev/null && command -v iptables >/dev/null; then
  # 甲骨文雲端的 Ubuntu 用 iptables
  for p in $OPEN_PORTS; do
    iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport "$p" -j ACCEPT
  done
  netfilter-persistent save >/dev/null 2>&1 || true
fi
ok "已開放連接埠：$OPEN_PORTS"

# ── 5. 開機自動啟動 ──
step "啟動哨兵"
cat > "$UNIT" <<'EOF'
[Unit]
Description=VPS 哨兵
After=network-online.target docker.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/vps-sentinel-lite/sentinel.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vps-sentinel-lite >/dev/null 2>&1
systemctl restart vps-sentinel-lite

# 確認新版真的打得開網頁（最多等 40 秒）：只看「服務在跑」不夠，可能跑起來了卻沒在回應
alive() {
  local port bind
  port="$(grep -E '^PORT=' "$CONF" | cut -d= -f2)"
  bind="$(grep -E '^BIND=' "$CONF" | cut -d= -f2)"
  case "$bind" in ""|0.0.0.0|::) bind=127.0.0.1 ;; esac
  systemctl is-active --quiet vps-sentinel-lite &&
    python3 -c 'import sys,urllib.request;urllib.request.urlopen(sys.argv[1],timeout=3).read(64)' "http://$bind:${port:-8787}/" >/dev/null 2>&1
}
UP=""
for _ in $(seq 1 20); do
  sleep 2
  if alive; then sleep 3; alive && UP=1; break; fi    # 過幾秒再確認一次，免得一啟動就當掉
done

if [ -z "$UP" ]; then
  if [ -f "$DIR.prev/sentinel.py" ]; then          # 新版起不來：換回舊版，網頁至少還打得開
    NEWV="$(grep -m1 -E '^VERSION' "$DIR/sentinel.py" | cut -d'"' -f2)"
    rm -rf "$DIR" && mv "$DIR.prev" "$DIR"
    printf '%s\n' "$NEWV" > "$DIR/.rolled-back"     # 哨兵重新啟動後會記一筆、傳 Telegram
    systemctl restart vps-sentinel-lite
    die "新版啟動失敗，已換回原本的版本" "請看：journalctl -u vps-sentinel-lite -n 30"
  fi
  die "啟動失敗" "請看：journalctl -u vps-sentinel-lite -n 30"
fi
ok "已啟動，開機也會自動啟動"

# 有裝雲端硬碟的話，順便整理一下：容量補足到設定的大小、修好刪不掉的檔案（沒裝就跳過）
if [ -f /opt/vps-cloud/data/config.yaml ] && [ -f "$HERE/cloud.sh" ]; then
  step "整理雲端硬碟"
  bash "$HERE/cloud.sh" 整理 || true
fi

# 從備份還原：產生一組一次性代碼（只存雜湊），拿著它才能在網頁上傳備份檔還原
RCODE=""
if [ "$MODE" = restore ]; then
  install -d -m 700 "$RSW_DIR"
  rm -f "$RSW_DIR/upload.vsbk" "$RSW_DIR/progress.json" "$RSW_DIR/pw"
  RCODE="$(python3 - "$RSW_DIR/state.json" <<'PY'
import hashlib, json, os, secrets, sys, time
abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"            # 去掉容易看錯的 I、L、O、0、1
code = "".join(secrets.choice(abc) for _ in range(8))
st = {"hash": hashlib.sha256(code.encode()).hexdigest(), "exp": time.time() + 86400, "stage": "wait"}
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(st, f)
print(code[:4] + "-" + code[4:])
PY
)"
fi

# ── 6. 顯示網址 ──
BIND="$(grep -E '^BIND=' "$CONF" | cut -d= -f2)"
PORT="$(grep -E '^PORT=' "$CONF" | cut -d= -f2)"
TOKEN="$(grep -E '^TOKEN=' "$CONF" | cut -d= -f2)"
SAVED_DOMAIN="$(grep -E '^DOMAIN=' "$CONF" | cut -d= -f2 || true)"

SAVED_HTTPS="$(grep -E '^HTTPS_PORT=' "$CONF" | cut -d= -f2 || true)"
if [ "$BIND" = "127.0.0.1" ] && [ -n "$SAVED_DOMAIN" ]; then
  if [ -z "$SAVED_HTTPS" ] || [ "$SAVED_HTTPS" = 443 ]; then
    BASE="https://$SAVED_DOMAIN/"
  else
    BASE="https://$SAVED_DOMAIN:$SAVED_HTTPS/"
    CLOUD_NOTE="記得到雲端主機網站的防火牆（安全清單）新增 TCP $SAVED_HTTPS"
  fi
else
  IP="$(curl -s4 --max-time 4 https://ifconfig.me || hostname -I | awk '{print $1}')"
  BASE="http://$IP:$PORT/"
  [ -n "$NEWCONF" ] && CLOUD_NOTE="記得到雲端主機網站的防火牆（安全清單）新增 TCP $PORT"
fi

printf '\n  %s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$G" "$N"
if [ -n "$RCODE" ]; then
  printf '  %s✅ 哨兵裝好了，接下來在網頁上還原%s\n\n' "$B" "$N"
  printf '  1. 用電腦或手機打開這個網址：\n     %s%s?restore=%s%s\n\n' "$B$C" "$BASE" "$RCODE" "$N"
  printf '  2. 選擇備份檔（.vsbk）、輸入解開密碼，按「開始還原」\n\n'
  printf '  %s還原代碼：%s（24 小時內有效）%s\n' "$D" "$RCODE" "$N"
  printf '  %s備份檔可以從 Telegram，或另一台主機雲端硬碟裡的「哨兵備份」資料夾下載%s\n' "$D" "$N"
else
  printf '  %s✅ VPS 哨兵%s好了%s\n\n' "$B" "$( [ -n "$NEWCONF" ] && echo 裝 || echo 更新 )" "$N"
  printf '  用手機打開這個網址（第一次會自動記住密碼）：\n     %s%s#t=%s%s\n\n' "$B$C" "$BASE" "$TOKEN" "$N"
  printf '  %s設定檔：%s（改完執行 sudo systemctl restart vps-sentinel-lite）%s\n' "$D" "$CONF" "$N"
  if [ -n "$NEWCONF" ] && PCODE="$(SENTINEL_CONF="$CONF" python3 "$DIR/sentinel.py" --pair-code "${BASE%/}" 2>/dev/null)"; then
    printf '\n  要加到主要主機：在主要主機按「新增主機」，貼上這組配對暗號（24 小時內有效）\n     %s%s%s\n' "$B$C" "$PCODE" "$N"
  fi
fi
[ -n "${CLOUD_NOTE:-}" ] && { echo; warn "$CLOUD_NOTE"; }
if [ "$BIND" = "0.0.0.0" ]; then
  printf '\n  %s💡 目前是一般連線（http）。有網域的話可以改成加密連線：sudo bash install.sh 你的網域%s\n' "$D" "$N"
fi
printf '  %s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n\n' "$G" "$N"
