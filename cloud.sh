#!/usr/bin/env bash
# VPS 哨兵：雲端硬碟（FileBrowser Quantum）
#
# 用法：
#   sudo bash cloud.sh 50          安裝雲端硬碟，最多可以放 50 GB（之後再執行一次就能改大小）
#   sudo bash cloud.sh 檢查         連不上時用這個找原因
#   sudo bash cloud.sh 整理         補足容量、修好刪不掉的檔案、把刪掉的檔案佔的主機空間還回去（更新哨兵時會自動做）
#   sudo bash cloud.sh 更新         更新到官方最新版（檔案和帳號都保留，哨兵網頁上也能按）
#   sudo bash cloud.sh 移除         移除雲端硬碟程式（檔案會保留）
#
# 做了什麼：
#   1. 建一個固定大小的「空間檔」掛在 /srv/cloud，放滿就是滿了，不會吃掉整台主機的硬碟
#   2. 用 Docker 跑 FileBrowser Quantum（網頁版檔案總管），只看得到 /srv/cloud
#   3. 有網域：接在哨兵的網址後面 https://你的網域/cloud/ ，不用另外開連接埠
#      沒網域：一樣接在哨兵的網址後面 http://IP:8787/cloud/ （由哨兵轉送，也不用另外開連接埠）
#   4. 哨兵的磁碟卡片會出現雲端硬碟的入口和用量
#   5. 不用另外的帳號密碼：已經登入哨兵，點「☁ 雲端」就直接進去（由哨兵替你登入）
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "請用 sudo 執行：sudo bash cloud.sh 50"; exit 1; }

CONF=/etc/vps-sentinel-lite.conf
BASE=/var/lib/vps-cloud
IMG=$BASE/disk.img
MNT=/srv/cloud
APP=/opt/vps-cloud
NAME=vps-cloud
IMAGE=ghcr.io/gtsteffaniak/filebrowser:stable
LOCAL_PORT=8099          # 只給本機的 Caddy 連
MOUNT_UNIT=/etc/systemd/system/srv-cloud.mount

[ -f "$CONF" ] || { echo "❌ 請先安裝 VPS 哨兵（bash install.sh）"; exit 1; }
set_conf() { if grep -q "^$1=" "$CONF"; then sed -i "s|^$1=.*|$1=$2|" "$CONF"; else echo "$1=$2" >> "$CONF"; fi; }
get_conf() { grep -E "^$1=" "$CONF" | head -1 | cut -d= -f2- || true; }

run_container() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped \
    -p "127.0.0.1:$LOCAL_PORT:80" \
    -v "$MNT":/folder \
    -v "$APP/data":/home/filebrowser/data \
    -e FILEBROWSER_CONFIG=/home/filebrowser/data/config.yaml \
    "$IMAGE" >/dev/null
}

# 等雲端硬碟真的能連上（最多 60 秒）；連不上就把原因印出來
wait_ready() {
  local port="$LOCAL_PORT"
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:$port/cloud/health" && return 0
    sleep 2
  done
  echo "❌ 雲端硬碟程式啟動失敗，下面是它最後的訊息（請截圖給我）："
  docker ps -a --filter "name=^$NAME\$" --format '   狀態：{{.Status}}'
  docker logs --tail 25 "$NAME" 2>&1 | sed 's/^/   /'
  return 1
}

# 讓雲端硬碟「真正能放的空間」等於設定的大小。
# 格式化本身會佔掉大約 2%（檔案目錄表、日誌），所以設 30 GB 只剩 29.多；這裡把空間檔加大補回來。
# 空間檔是「用多少佔多少」，加大不會多吃主機硬碟。掛著也能直接加大，不用停雲端硬碟。
top_up() {
  local want=$(( $1 * 1073741824 )) have dev fs size
  mountpoint -q "$MNT" || return 0
  dev="$(findmnt -no SOURCE "$MNT")"
  for _ in 1 2 3; do
    have=$(df -B1 --output=size "$MNT" | tail -1 | tr -d ' ')
    [ $(( want - have )) -lt 4194304 ] && return 0          # 差不到 4 MB 就算剛好
    fs=$(dumpe2fs -h "$dev" 2>/dev/null | awk -F: '/^Block count/{c=$2} /^Block size/{s=$2} END{print c*s}')
    [ "${fs:-0}" -gt 0 ] || return 0
    size=$(( fs + want - have ))                             # 照現在格式化佔掉的比例補回來
    [ "$size" -gt "$(stat -c %s "$IMG")" ] && truncate -s "$size" "$IMG"
    losetup -c "$dev" 2>/dev/null && resize2fs "$dev" >/dev/null 2>&1 || return 0
  done
}

# 雲端硬碟程式是用一般使用者（編號 1000）在跑；用 root 放進去的檔案它刪不掉、也改不了。
# 這裡把擁有者統一改回來（只改不對的，檔案很多也很快）。
fix_owner() {
  mountpoint -q "$MNT" || return 0
  find "$MNT" -xdev \( ! -user 1000 -o ! -group 1000 \) -exec chown -h 1000:1000 {} + 2>/dev/null || true
}

# 刪掉的檔案要把主機硬碟的空間還回去：空間檔不會自己變小，要「還空間」（discard／fstrim）才會。
# 以前沒開，所以雲端裡刪了檔案，哨兵上主機硬碟的用量卻沒有減少。
give_back() {
  mountpoint -q "$MNT" || return 0
  if [ -f "$MOUNT_UNIT" ] && ! grep -q discard "$MOUNT_UNIT"; then
    sed -i 's/^Options=loop,noatime$/Options=loop,noatime,discard/' "$MOUNT_UNIT"
    systemctl daemon-reload
  fi
  findmnt -no OPTIONS "$MNT" | grep -q discard || mount -o remount,discard "$MNT" 2>/dev/null || true
  fstrim "$MNT" >/dev/null 2>&1 || true            # 把之前刪掉的檔案佔的空間一次還回去
}

# 目前設定的容量（GB）：有記錄就用記錄。
# 舊版沒記錄：空間檔還沒補過時剛好是整數 GB，那就是設定的大小，順便記下來；
# 已經補過（不是整數 GB）就看不出原本設多少，不要猜，免得每次更新都再補一次、越補越大。
saved_gb() {
  local g sz; g="$(get_conf CLOUD_GB)"
  if [[ "$g" =~ ^[0-9]+$ ]] && [ "$g" -gt 0 ]; then echo "$g"; return; fi
  sz=0; [ -f "$IMG" ] && sz=$(stat -c %s "$IMG")
  if [ "$sz" -gt 0 ] && [ $(( sz % 1073741824 )) -eq 0 ]; then
    set_conf CLOUD_GB $(( sz / 1073741824 )); echo $(( sz / 1073741824 ))
  else echo 0; fi
}

diagnose() {
  local port="$LOCAL_PORT" dom; dom="$(get_conf DOMAIN)"
  echo "── 雲端硬碟檢查 ──"
  if mountpoint -q "$MNT"; then echo "✅ 存放空間：已掛好（$(df -h --output=used,size "$MNT" | tail -1 | awk '{print $1" / "$2}')）"
  else echo "❌ 存放空間沒有掛上：systemctl status srv-cloud.mount"; fi
  if mountpoint -q "$MNT"; then
    local bad; bad="$(find "$MNT" -xdev \( ! -user 1000 -o ! -group 1000 \) 2>/dev/null | wc -l || true)"
    if [ "$bad" -gt 0 ]; then echo "❌ 有 $bad 個檔案或資料夾雲端硬碟刪不掉（是用 root 放進去的），執行 sudo bash cloud.sh 整理 就會修好"; fi
  fi
  local st; st="$(docker ps -a --filter "name=^$NAME\$" --format '{{.Status}}')"
  if [ -z "$st" ]; then echo "❌ 雲端硬碟程式不存在，請重新執行：bash cloud.sh 容量"
  else echo "ℹ️ 雲端硬碟程式：$st"; fi
  if curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:$port/cloud/health"; then echo "✅ 主機內部連得到雲端硬碟（連接埠 $port）"
  else echo "❌ 主機內部連不到雲端硬碟（連接埠 $port），最後的訊息："; docker logs --tail 20 "$NAME" 2>&1 | sed 's/^/   /'; fi
  if [ -n "$dom" ]; then
    local hp; hp="$(get_conf HTTPS_PORT)"; hp="${hp:-443}"
    if grep -qs 'vps-sentinel.d' /etc/caddy/sites/vps-sentinel.caddy && [ -f /etc/caddy/sites/vps-sentinel.d/cloud.caddy ]; then echo "✅ 加密連線設定：有接上"
    else echo "❌ 加密連線設定沒接上，請重新執行：bash cloud.sh 容量"; fi
    systemctl is-active --quiet caddy && echo "✅ Caddy 有在跑" || echo "❌ Caddy 沒在跑：systemctl status caddy"
    local code; code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 --resolve "$dom:$hp:127.0.0.1" "https://$dom:$hp/cloud/health" || true)"
    [ "$code" = 200 ] && echo "✅ 透過網域連得到" || echo "❌ 透過網域連不到（代碼 ${code:-無回應}）"
    echo "👉 請用這個網址：$(get_conf CLOUD_URL)"
    echo "   （跟哨兵用同一個連接埠 $hp，不用另外開）"
  else
    local sp; sp="$(get_conf PORT)"; sp="${sp:-8787}"
    local code; code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$sp/cloud/health" || true)"
    [ "$code" = 200 ] && echo "✅ 透過哨兵的連接埠 $sp 連得到" || echo "❌ 透過哨兵連不到（代碼 ${code:-無回應}），請先更新哨兵：齒輪 →「軟體更新」"
    echo "👉 請用這個網址：$(get_conf CLOUD_URL)"
    echo "   （跟哨兵用同一個連接埠 $sp，不用另外開）"
  fi
}

show_login() {
  echo "   登入：不用另外的密碼，在哨兵網頁上點磁碟卡片的「☁ 雲端」就會自動登入"
  echo "        （直接打開上面的網址也可以，會先請你登入哨兵）"
}

case "${1:-}" in
  密碼|password|換密碼|reset)
    echo "雲端硬碟已經改成跟哨兵一起登入，不需要另外的密碼了。"
    echo "要換密碼的話，換的是哨兵的密碼：到哨兵網頁的「設定 → 安全 → 換一組新密碼」"
    exit 0 ;;
  檢查|check)
    diagnose; exit 0 ;;
  更新|update)
    [ -f "$APP/data/config.yaml" ] || { echo "還沒安裝雲端硬碟"; exit 1; }
    echo "▶ 下載官方最新的穩定版…"
    docker pull -q "$IMAGE" >/dev/null || { echo "❌ 下載失敗"; exit 1; }
    top_up "$(saved_gb)"; fix_owner; give_back
    run_container
    wait_ready || exit 1
    docker image prune -f >/dev/null 2>&1 || true      # 清掉舊版的映像檔，省空間
    echo "✅ 雲端硬碟已更新到最新版（檔案和帳號都保留）"; exit 0 ;;
  整理|tidy)                                         # 哨兵更新時會自動跑：補足容量、修好刪不掉的檔案
    [ -f "$APP/data/config.yaml" ] || exit 0
    command -v resize2fs >/dev/null || exit 0
    top_up "$(saved_gb)"; fix_owner; give_back
    echo "✅ 雲端硬碟整理好了（可用空間 $(df -h --output=size "$MNT" 2>/dev/null | tail -1 | tr -d ' ')）"; exit 0 ;;
  移除|remove)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    rm -f /etc/caddy/sites/vps-sentinel.d/cloud.caddy
    if command -v caddy >/dev/null; then systemctl reload caddy 2>/dev/null || true; fi
    set_conf CLOUD_URL ""
    systemctl restart vps-sentinel-lite 2>/dev/null || true
    echo "✅ 已移除雲端硬碟程式。你的檔案還在 $MNT（空間檔：$IMG）"
    echo "   要連檔案一起刪掉：systemctl disable --now srv-cloud.mount && rm -rf $BASE $MOUNT_UNIT"
    exit 0 ;;
esac

SIZE="${1:-}"
if ! [[ "$SIZE" =~ ^[0-9]+$ ]] || [ "$SIZE" -lt 1 ]; then
  echo "用法：sudo bash cloud.sh 容量（GB）"
  echo "例如：sudo bash cloud.sh 50   ← 雲端硬碟最多放 50 GB"
  exit 1
fi

# ── 1. Docker ──
if ! command -v docker >/dev/null; then
  echo "▶ 安裝 Docker…"
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1 || { echo "❌ Docker 安裝失敗"; exit 1; }
fi
command -v resize2fs >/dev/null || { apt-get update -qq && apt-get install -y -qq e2fsprogs; }

# ── 2. 固定大小的空間 ──
install -d "$BASE" "$MNT"
cur_gb=0
[ -f "$IMG" ] && cur_gb=$(( $(stat -c %s "$IMG") / 1073741824 ))
if [ -f "$IMG" ] && mountpoint -q "$MNT"; then      # 空間檔會比設定大一點（補格式化佔掉的），看實際可用的空間
  cur_gb=$(( ($(df -B1 --output=size "$MNT" | tail -1 | tr -d ' ') + 536870912) / 1073741824 ))
fi
free_gb=$(( $(df --output=avail -B1 "$BASE" | tail -1) / 1073741824 ))
used_gb=0
[ -f "$IMG" ] && used_gb=$(( $(du -B1 "$IMG" | cut -f1) / 1073741824 ))
if [ "$SIZE" -gt $(( free_gb + used_gb )) ]; then
  echo "❌ 主機硬碟只剩大約 $(( free_gb + used_gb )) GB 可以給雲端硬碟用，請設小一點（例如 $(( (free_gb + used_gb) * 8 / 10 ))）"
  exit 1
fi

if [ ! -f "$IMG" ]; then
  echo "▶ 建立 ${SIZE} GB 的雲端硬碟空間…"
  truncate -s "${SIZE}G" "$IMG"                 # 用多少佔多少，不會一次吃掉 ${SIZE} GB
  mkfs.ext4 -q -F -m 0 -L vps-cloud "$IMG"
elif [ "$SIZE" -ne "$cur_gb" ]; then
  if [ "$SIZE" -lt "$cur_gb" ] && mountpoint -q "$MNT"; then
    in_use_gb=$(( $(df --output=used -B1 "$MNT" | tail -1) / 1073741824 + 1 ))
    if [ "$in_use_gb" -ge "$SIZE" ]; then
      echo "❌ 雲端硬碟裡已經放了大約 ${in_use_gb} GB，沒辦法縮小到 ${SIZE} GB"
      exit 1
    fi
  fi
  echo "▶ 把雲端硬碟從 ${cur_gb} GB 改成 ${SIZE} GB（大約幾秒鐘，期間暫時打不開）…"
  docker stop "$NAME" >/dev/null 2>&1 || true
  systemctl stop srv-cloud.mount 2>/dev/null || true
  mountpoint -q "$MNT" && umount "$MNT"
  e2fsck -f -y "$IMG" >/dev/null 2>&1 || true
  if [ "$SIZE" -gt "$cur_gb" ]; then
    [ $(( SIZE * 1073741824 )) -gt "$(stat -c %s "$IMG")" ] && truncate -s "${SIZE}G" "$IMG"   # 空間檔可能已經比設定大一點，不能反過來縮小它
    resize2fs "$IMG" >/dev/null
  else
    resize2fs "$IMG" "${SIZE}G" >/dev/null; truncate -s "${SIZE}G" "$IMG"
  fi
fi

cat > "$MOUNT_UNIT" <<EOF
[Unit]
Description=VPS 哨兵雲端硬碟空間

[Mount]
What=$IMG
Where=$MNT
Type=ext4
Options=loop,noatime,discard

[Install]
WantedBy=multi-user.target
EOF
# 開機時先掛好空間，Docker 才啟動，避免檔案被寫到錯的地方
install -d /etc/systemd/system/docker.service.d
printf '[Unit]\nWants=srv-cloud.mount\nAfter=srv-cloud.mount\n' > /etc/systemd/system/docker.service.d/vps-cloud.conf
systemctl daemon-reload
systemctl enable --now srv-cloud.mount >/dev/null 2>&1
mountpoint -q "$MNT" || { echo "❌ 雲端硬碟空間掛載失敗：journalctl -u srv-cloud.mount"; exit 1; }
rm -rf "$MNT/lost+found" 2>/dev/null || true
top_up "$SIZE"
fix_owner
give_back
set_conf CLOUD_GB "$SIZE"

# ── 3. FileBrowser Quantum ──
install -d -o 1000 -g 1000 "$APP/data" "$APP/data/tmp"
rm -f "$APP/admin-password"                      # 舊版留下的密碼檔，改成跟哨兵一起登入後用不到了
TRUST=false; [ -n "$(get_conf DOMAIN)" ] && TRUST=true      # 有網域時前面有 Caddy 轉送
cat > "$APP/data/config.yaml" <<EOF
http:
  port: 80
  baseURL: "/cloud"
  trustProxyHeaders: $TRUST
server:
  cacheDir: /home/filebrowser/data/tmp
  sources:
    - path: /folder
      name: "雲端硬碟"
      config:
        defaultEnabled: true
        defaultPermissions:        # 只有主人一個人用：上傳、下載、修改、刪除都可以
          view: true
          download: true
          modify: true
          delete: true
          create: true
auth:
  tokenExpirationHours: 720        # 登入一次可以用 30 天
  adminUsername: owner             # 由哨兵登入的主人帳號
  methods:
    password:
      enabled: false               # 不用另外的密碼：只能經過哨兵進來
    proxy:
      enabled: true
      header: X-Sentinel-User      # 哨兵確認你已登入後，才會帶上這個標頭（外面送來的同名標頭會被哨兵丟掉）
frontend:
  name: "雲端硬碟"
EOF
chown 1000:1000 "$APP/data/config.yaml"
echo "▶ 下載並啟動雲端硬碟程式（第一次會比較久）…"
docker pull -q "$IMAGE" >/dev/null || { echo "❌ 下載雲端硬碟程式失敗，請確認主機能連到 ghcr.io"; exit 1; }
run_container
wait_ready || exit 1

# ── 4. 網址 ──
DOMAIN="$(get_conf DOMAIN)"
if [ -n "$DOMAIN" ] && [ -f /etc/caddy/sites/vps-sentinel.caddy ]; then
  HTTPS_PORT="$(get_conf HTTPS_PORT)"; HTTPS_PORT="${HTTPS_PORT:-443}"
  SITE_FILE=/etc/caddy/sites/vps-sentinel.caddy
  install -d /etc/caddy/sites/vps-sentinel.d
  [ -f /etc/caddy/sites/vps-sentinel.d/00-keep.caddy ] || echo "# 附加功能的設定放這個資料夾" > /etc/caddy/sites/vps-sentinel.d/00-keep.caddy
  if ! grep -q 'vps-sentinel.d' "$SITE_FILE"; then      # 舊版的設定：改成可以掛附加功能的寫法
    SITE="$(grep -m1 '{$' "$SITE_FILE" | sed 's/ *{$//')"
    PORT_NOW="$(get_conf PORT)"
    cat > "$SITE_FILE" <<EOF
# VPS 哨兵（由安裝腳本產生）
$SITE {
	encode gzip
	import /etc/caddy/sites/vps-sentinel.d/*.caddy
	handle {
		reverse_proxy 127.0.0.1:${PORT_NOW:-8787}
	}
}
EOF
  fi
  cat > /etc/caddy/sites/vps-sentinel.d/cloud.caddy <<EOF
# 雲端硬碟（由 cloud.sh 產生）
handle /cloud* {
	reverse_proxy 127.0.0.1:$(get_conf PORT | grep . || echo 8787)
}
EOF
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { echo "❌ Caddy 設定有問題：caddy validate --config /etc/caddy/Caddyfile"; exit 1; }
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  if [ "$HTTPS_PORT" = 443 ]; then URL="https://$DOMAIN/cloud/"; else URL="https://$DOMAIN:$HTTPS_PORT/cloud/"; fi
else
  IP="$(curl -s4 --max-time 4 https://ifconfig.me || hostname -I | awk '{print $1}')"
  SP="$(get_conf PORT)"; SP="${SP:-8787}"
  URL="http://$IP:$SP/cloud/"                   # 由哨兵轉送，跟哨兵同一個連接埠
fi

# ── 5. 告訴哨兵 ──
set_conf CLOUD_URL "$URL"
set_conf CLOUD_DIR "$MNT"
set_conf CLOUD_PORT "$LOCAL_PORT"
systemctl restart vps-sentinel-lite 2>/dev/null || true

echo
echo "✅ 雲端硬碟好了（最多 ${SIZE} GB）"
echo "   網址：$URL"
show_login
echo
echo "   改容量：  sudo bash cloud.sh 新的GB數"
echo "   連不上時：sudo bash cloud.sh 檢查"
if [ -z "$DOMAIN" ]; then echo "   ⚠️ 這台沒有設定網域，連線沒有加密；之前為雲端硬碟開的 8788 連接埠可以關掉了"; fi
