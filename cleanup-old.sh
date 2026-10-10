#!/usr/bin/env bash
# 清除「舊版 VPS 哨兵」留在 VPS 上的東西
# 不會動到：新精簡版（vps-sentinel-lite）、Docker 本身與其他容器（例如 n8n）、Tailscale
# 用法：sudo bash 清除舊版VPS哨兵.sh
set -uo pipefail

[ "$(id -u)" = 0 ] || { echo "請用 sudo 執行：sudo bash $0"; exit 1; }

DIRS=(/opt/homeassistant /opt/homeassistant-backups /opt/vps-monitor /opt/vps-monitor-backups
      /opt/vps-sentinel-backups /opt/vps-sentinel-controller /var/lib/vps-sentinel-controller
      /var/lib/vps-sentinel-installer /root/vps-sentinel-reports)
FILES=(/etc/systemd/system/vps-monitor.service /etc/systemd/system/vps-sentinel-controller.service
       /etc/vps-monitor.env /etc/vps-sentinel-controller.env /root/vps-homeassistant-credentials.txt
       /etc/mosquitto/conf.d/home-assistant.conf /etc/mosquitto/vps-sentinel.acl)
CMDS=(vps-sentinel vps-sentinel-update vps-sentinel-uninstall vps-sentinel-upgrade vps-sentinel-doctor
      vps-sentinel-backup vps-sentinel-automations vps-sentinel-apple vps-sentinel-beta-evidence vps-sentinel-enroll)
for c in "${CMDS[@]}"; do FILES+=("/usr/local/sbin/$c"); done
for f in /etc/mosquitto/conf.d/home-assistant.conf.backup.*; do [ -e "$f" ] && FILES+=("$f"); done

HAS_DOCKER=false; command -v docker >/dev/null 2>&1 && HAS_DOCKER=true

echo "═══ 第一步：檢查 VPS 上還有哪些舊東西 ═══"
found=0
for s in vps-monitor vps-sentinel-controller; do
  systemctl list-unit-files "$s.service" 2>/dev/null | grep -q "$s" && { echo "  • 舊服務：$s"; found=1; }
done
for d in "${DIRS[@]}";  do [ -e "$d" ] && { echo "  • 資料夾：$d（$(du -sh "$d" 2>/dev/null | cut -f1)）"; found=1; }; done
for f in "${FILES[@]}"; do [ -e "$f" ] && { echo "  • 檔案：$f"; found=1; }; done
id -u vps-sentinel-controller >/dev/null 2>&1 && { echo "  • 系統帳號：vps-sentinel-controller"; found=1; }
if $HAS_DOCKER; then
  docker ps -a --format '{{.Names}}' | grep -qx homeassistant && { echo "  • Home Assistant 容器"; found=1; }
  docker image ls -q ghcr.io/home-assistant/home-assistant | grep -q . && { echo "  • Home Assistant 映像檔（約 1～2 GB）"; found=1; }
fi
command -v tailscale >/dev/null 2>&1 && tailscale serve status 2>/dev/null | grep -q '127.0.0.1:8123' && { echo "  • Tailscale 轉發規則（給 Home Assistant 用的）"; found=1; }
MQTT_REMOVE=false
if dpkg -s mosquitto >/dev/null 2>&1; then
  others=$(find /etc/mosquitto/conf.d -maxdepth 1 -name '*.conf' ! -name 'home-assistant.conf' 2>/dev/null | wc -l)
  if [ "$others" -eq 0 ]; then MQTT_REMOVE=true; echo "  • Mosquitto 訊息伺服器（只有舊專案在用）"; found=1
  else echo "  ⓘ Mosquitto 還有其他設定，會保留套件"; fi
fi

[ "$found" = 0 ] && { echo "  ✅ 沒找到任何舊版殘留，VPS 很乾淨。"; exit 0; }

echo
echo "以下會保留不動：新精簡版、Docker 與其他容器、Tailscale 連線"
$HAS_DOCKER && { echo "目前其他容器："; docker ps -a --format '    - {{.Names}}' | grep -vx '    - homeassistant' || echo "    （無）"; }
echo
read -r -p "確定要刪除上面列出的東西嗎？輸入 y 確認：" ans
[ "${ans,,}" = "y" ] || { echo "已取消，什麼都沒刪。"; exit 0; }

echo
echo "═══ 第二步：開始清除 ═══"
for s in vps-monitor vps-sentinel-controller; do systemctl disable --now "$s" >/dev/null 2>&1; done
if $HAS_DOCKER; then
  docker rm -f homeassistant >/dev/null 2>&1 && echo "✓ 已移除 Home Assistant 容器"
  docker image rm ghcr.io/home-assistant/home-assistant:stable >/dev/null 2>&1 && echo "✓ 已移除 Home Assistant 映像檔"
fi
if command -v tailscale >/dev/null 2>&1 && tailscale serve status 2>/dev/null | grep -q '127.0.0.1:8123'; then
  tailscale serve --https=443 off >/dev/null 2>&1 && echo "✓ 已移除 Tailscale 轉發規則"
fi
for f in "${FILES[@]}"; do [ -e "$f" ] && rm -f -- "$f"; done
for d in "${DIRS[@]}";  do [ -e "$d" ] && rm -rf -- "$d"; done
echo "✓ 已刪除舊程式、設定檔、管理指令與資料夾"
systemctl daemon-reload; systemctl reset-failed >/dev/null 2>&1
id -u vps-sentinel-controller >/dev/null 2>&1 && userdel vps-sentinel-controller >/dev/null 2>&1 && echo "✓ 已刪除系統帳號"
getent group vps-sentinel-controller >/dev/null && groupdel vps-sentinel-controller >/dev/null 2>&1
if $MQTT_REMOVE; then
  systemctl disable --now mosquitto >/dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive apt-get purge -y -qq mosquitto mosquitto-clients >/dev/null 2>&1
  rm -rf /etc/mosquitto /var/lib/mosquitto
  echo "✓ 已移除 Mosquitto"
fi
DEBIAN_FRONTEND=noninteractive apt-get autoremove -y -qq >/dev/null 2>&1 && echo "✓ 已清掉沒在用的相依套件"

echo
echo "═══ 完成 ═══"
systemctl is-active --quiet vps-sentinel-lite && echo "✓ 新精簡版仍正常運作中" || echo "ⓘ 新精簡版目前沒在跑（如果還沒裝可忽略）"
df -h / | awk 'NR==2{print "目前磁碟剩餘空間：" $4}'
