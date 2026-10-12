#!/usr/bin/env bash
# VPS 哨兵：安裝／更新
#
# 用法：
#   sudo bash install.sh              一般安裝（http://IP:8787）
#   sudo bash install.sh 你的網域      加上加密連線（https://你的網域），會自動安裝 Caddy
#
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "請用 sudo 執行：sudo bash install.sh"; exit 1; }
command -v systemctl >/dev/null || { echo "這台主機沒有 systemd，無法自動安裝"; exit 1; }
command -v python3 >/dev/null || { apt-get update -qq && apt-get install -y -qq python3; }

DOMAIN="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR=/opt/vps-sentinel-lite
CONF=/etc/vps-sentinel-lite.conf
UNIT=/etc/systemd/system/vps-sentinel-lite.service

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

  echo "  官方來源暫時無法使用，改用 Ubuntu 內建版本…"
  apt-get update -qq >/dev/null 2>&1 || true
  if apt-get install -y -qq caddy >/dev/null 2>&1; then
    return 0
  fi

  echo "  改從 GitHub 直接下載…"
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
install -d "$DIR"
install -m 755 "$HERE/sentinel.py" "$DIR/sentinel.py"

# ── 2. 設定檔（已存在就保留） ──
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
fi

# 舊版可能綁在 Tailscale 的位址上；那個位址不存在了就改回對外開放
CUR_BIND="$(grep -E '^BIND=' "$CONF" | cut -d= -f2 || true)"
if [ -n "$CUR_BIND" ] && [ "$CUR_BIND" != "0.0.0.0" ] && [ "$CUR_BIND" != "127.0.0.1" ] \
   && ! hostname -I | tr ' ' '\n' | grep -qx "$CUR_BIND"; then
  echo "ℹ️ 原本設定的位址 $CUR_BIND 已不存在，改為對外開放"
  set_conf BIND 0.0.0.0
fi

# 記住安裝來源資料夾：網頁上的「更新哨兵」會從這裡抓新版
if [ -d "$HERE/.git" ]; then set_conf SRC_DIR "$HERE"; fi

# ── 3. 加密連線（有給網域才做） ──
if [ -n "$DOMAIN" ]; then
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
      echo "ℹ️ 443 已經被「$OWNER」使用中，不會去動它；加密連線改用 $HTTPS_PORT"
    fi
  fi
  OWNER="$(port_owner tcp "$HTTPS_PORT")"
  if [ -n "$OWNER" ] && [ "$OWNER" != caddy ]; then
    echo "❌ 連接埠 $HTTPS_PORT 被「$OWNER」使用中。可以換一個號碼，例如："
    echo "   sudo HTTPS_PORT=10443 bash install.sh $DOMAIN"
    exit 1
  fi
  OWNER="$(port_owner tcp 80)"
  if [ -n "$OWNER" ] && [ "$OWNER" != caddy ]; then
    echo "❌ 申請加密憑證需要用到 80 連接埠，但它被「$OWNER」使用中，無法自動設定"
    exit 1
  fi

  if [ "$HTTPS_PORT" = 443 ]; then SHOWURL="https://$DOMAIN"; else SHOWURL="https://$DOMAIN:$HTTPS_PORT"; fi
  echo "▶ 設定加密連線：$SHOWURL"
  if ! command -v caddy >/dev/null; then
    echo "  安裝 Caddy（自動申請免費加密憑證的小程式）…"
    install_caddy || { echo "❌ Caddy 安裝失敗，請把上面的訊息截圖給我"; exit 1; }
  fi

  install -d /etc/caddy/sites
  PORT_NOW="$(grep -E '^PORT=' "$CONF" | cut -d= -f2)"
  if [ "$HTTPS_PORT" = 443 ]; then SITE="$DOMAIN"; else SITE="$DOMAIN:$HTTPS_PORT"; fi
  cat > /etc/caddy/sites/vps-sentinel.caddy <<EOF
# VPS 哨兵（由安裝腳本產生）
$SITE {
	encode gzip
	reverse_proxy 127.0.0.1:${PORT_NOW:-8787}
}
EOF
  touch /etc/caddy/Caddyfile
  # 關掉 HTTP/3：它會佔用 UDP 連接埠，可能跟 Hysteria2 之類的服務衝突
  if ! grep -q 'protocols h1 h2' /etc/caddy/Caddyfile; then
    if grep -qE '^\{' /etc/caddy/Caddyfile; then
      echo "⚠️ 你的 Caddyfile 已經有全域設定，請自己在裡面加上：servers { protocols h1 h2 }"
    else
      { printf '{\n\tservers {\n\t\tprotocols h1 h2\n\t}\n}\n\n'; cat /etc/caddy/Caddyfile; } > /etc/caddy/Caddyfile.new
      mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
    fi
  fi
  grep -q 'import sites/\*.caddy' /etc/caddy/Caddyfile || printf '\nimport sites/*.caddy\n' >> /etc/caddy/Caddyfile

  set_conf BIND 127.0.0.1      # 只讓 Caddy 從本機連，外面一律走 https
  set_conf DOMAIN "$DOMAIN"
  set_conf HTTPS_PORT "$HTTPS_PORT"

  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    echo "❌ Caddy 設定有問題，請看：caddy validate --config /etc/caddy/Caddyfile"
    exit 1
  fi
  systemctl enable caddy >/dev/null 2>&1
  systemctl reload caddy 2>/dev/null || systemctl restart caddy

  # 檢查網域是不是指向這台 VPS
  MYIP="$(curl -s4 --max-time 4 https://ifconfig.me || true)"
  DNSIP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
  if [ -n "$MYIP" ] && [ "$DNSIP" != "$MYIP" ]; then
    echo "⚠️ 網域 $DOMAIN 目前指向「${DNSIP:-找不到}」，但這台 VPS 是「$MYIP」"
    echo "   請到網域商把 A 紀錄設成 $MYIP，生效後 Caddy 會自動申請憑證（不用重新安裝）"
  fi
fi

# ── 4. VPS 內的防火牆：打開需要的連接埠 ──
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

# ── 5. 開機自動啟動 ──
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
sleep 2

if ! systemctl is-active --quiet vps-sentinel-lite; then
  echo "❌ 啟動失敗，請看：journalctl -u vps-sentinel-lite -n 30"
  exit 1
fi

# ── 6. 顯示網址 ──
BIND="$(grep -E '^BIND=' "$CONF" | cut -d= -f2)"
PORT="$(grep -E '^PORT=' "$CONF" | cut -d= -f2)"
TOKEN="$(grep -E '^TOKEN=' "$CONF" | cut -d= -f2)"
SAVED_DOMAIN="$(grep -E '^DOMAIN=' "$CONF" | cut -d= -f2 || true)"

SAVED_HTTPS="$(grep -E '^HTTPS_PORT=' "$CONF" | cut -d= -f2 || true)"
if [ "$BIND" = "127.0.0.1" ] && [ -n "$SAVED_DOMAIN" ]; then
  if [ -z "$SAVED_HTTPS" ] || [ "$SAVED_HTTPS" = 443 ]; then
    URL="https://$SAVED_DOMAIN/?t=$TOKEN"
  else
    URL="https://$SAVED_DOMAIN:$SAVED_HTTPS/?t=$TOKEN"
    CLOUD_NOTE="⚠️ 記得到雲端主機網站的防火牆（安全清單）新增 TCP $SAVED_HTTPS"
  fi
else
  IP="$(curl -s4 --max-time 4 https://ifconfig.me || hostname -I | awk '{print $1}')"
  URL="http://$IP:$PORT/?t=$TOKEN"
fi

echo
echo "✅ VPS 哨兵已啟動"
echo
echo "   用手機打開這個網址（第一次會自動記住密碼）："
echo "   $URL"
echo
echo "   設定檔：$CONF"
echo "   改完設定：sudo systemctl restart vps-sentinel-lite"
[ -n "${CLOUD_NOTE:-}" ] && { echo; echo "   $CLOUD_NOTE"; }
if [ "$BIND" = "0.0.0.0" ]; then
  echo
  echo "   💡 目前是一般連線（http）。有網域的話可以改成加密連線："
  echo "      sudo bash install.sh 你的網域"
fi
echo
