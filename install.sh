#!/usr/bin/env bash
# VPS 哨兵 精簡版：安裝／更新
# 用法：sudo bash install.sh
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "請用 sudo 執行：sudo bash install.sh"; exit 1; }
command -v python3 >/dev/null || { apt-get update -qq && apt-get install -y -qq python3; }
command -v systemctl >/dev/null || { echo "這台主機沒有 systemd，無法自動安裝"; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
DIR=/opt/vps-sentinel-lite
CONF=/etc/vps-sentinel-lite.conf
UNIT=/etc/systemd/system/vps-sentinel-lite.service

install -d "$DIR"
install -m 755 "$HERE/sentinel.py" "$DIR/sentinel.py"

if [ ! -f "$CONF" ]; then
  TOKEN="$(python3 -c 'import secrets;print(secrets.token_urlsafe(18))')"
  # 有 Tailscale 就只開在 Tailscale 內網上，比較安全
  BIND="0.0.0.0"
  if command -v tailscale >/dev/null && TSIP="$(tailscale ip -4 2>/dev/null | head -n1)" && [ -n "$TSIP" ]; then
    BIND="$TSIP"
  fi
  cat > "$CONF" <<EOF
# ── VPS 哨兵 設定檔 ── 改完執行：sudo systemctl restart vps-sentinel-lite

# 顯示名稱（空白就用主機名稱）
NAME=$(hostname)

# 存取密碼（手機第一次開網頁時要輸入）
TOKEN=$TOKEN

# 網頁開在哪個網址與連接埠
BIND=$BIND
PORT=8787

# 要監看的系統服務（逗號分隔），例如：nginx,ssh,caddy
SERVICES=

# 要監看的磁碟（逗號分隔）
DISKS=/

# 其他 VPS（逗號分隔，格式：名稱=網址，密碼不同就在網址後加 |密碼）
# 例如：PEERS=東京=http://100.64.0.2:8787,大阪=http://100.64.0.3:8787|另一組密碼
PEERS=

# Telegram 通知（兩個都填才會開啟）
TG_BOT_TOKEN=
TG_CHAT_ID=

# 警告門檻（百分比）；處理器要持續超過幾分鐘才通知
ALERT_CPU=90
ALERT_CPU_MINUTES=5
ALERT_MEM=90
ALERT_DISK=90
EOF
  chmod 600 "$CONF"
  NEW=1
fi

cat > "$UNIT" <<'EOF'
[Unit]
Description=VPS 哨兵 精簡版
After=network-online.target docker.service tailscaled.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/vps-sentinel-lite/sentinel.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now vps-sentinel-lite >/dev/null 2>&1
systemctl restart vps-sentinel-lite
sleep 2

if ! systemctl is-active --quiet vps-sentinel-lite; then
  echo "❌ 啟動失敗，請看：journalctl -u vps-sentinel-lite -n 30"
  exit 1
fi

# shellcheck disable=SC1090
. <(grep -E '^(BIND|PORT|TOKEN)=' "$CONF")
SHOW="$BIND"
[ "$SHOW" = "0.0.0.0" ] && SHOW="$(curl -s4 --max-time 4 https://ifconfig.me || hostname -I | awk '{print $1}')"

echo
echo "✅ VPS 哨兵已啟動"
echo
echo "   用手機打開這個網址（第一次會自動記住密碼）："
echo "   http://$SHOW:$PORT/?t=$TOKEN"
echo
echo "   設定檔：$CONF"
echo "   改完設定：sudo systemctl restart vps-sentinel-lite"
[ "${BIND}" = "0.0.0.0" ] && echo "   ⚠️ 目前對整個網路開放，建議用防火牆限制，或改用 Tailscale"
echo
