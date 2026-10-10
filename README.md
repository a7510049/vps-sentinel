# VPS 哨兵 精簡版

一個檔案、一個程式，VPS 上直接跑，手機打開網頁就能看。
不需要 Home Assistant、不需要 MQTT、不需要安裝任何套件。

## 安裝（每台 VPS 都一樣）

在 VPS 上執行：

```bash
git clone https://github.com/a7510049/vps-sentinel-homeassistant.git vps-sentinel
cd vps-sentinel && sudo bash install.sh
```

之後要更新：`cd vps-sentinel && git pull && sudo bash install.sh`（設定會保留）

最後會印出一個網址，用手機打開就好（第一次會自動記住密碼）。
在 iPhone Safari 按「分享 → 加入主畫面」，就會變成一個 App 圖示。

## 加密連線（建議，需要一個網域）

一般安裝是 `http://IP:8787`，沒有加密。如果你有網域，可以改成 `https://你的網域`：

1. 到網域商新增一筆 **A 紀錄**，指向這台 VPS 的 IP
2. 在 VPS 上執行：

```bash
cd vps-sentinel && sudo bash install.sh 你的網域
```

腳本會自動安裝 Caddy（一個會自動申請免費加密憑證的小程式），
並把哨兵改成只能透過 https 連線。之後更新只要 `sudo bash install.sh`，不用再打網域。

## 會看到什麼

**電腦版**：左邊側邊欄列出所有主機，點一台就會在右邊顯示大儀表板（環形儀表、最近 30 分鐘的曲線圖、容器、系統資訊）。
**手機版**：卡片一張一張往下排，點上面的「正常／注意／異常」可以只看那一類。


- 處理器、記憶體、磁碟、負載、網路速度、開機時間
- Docker 容器有沒有停掉
- 你指定的系統服務有沒有在跑
- 系統更新數量、是否需要重新開機
- 主機名稱可以直接在網頁上改：點名字旁邊的✏️鉛筆圖示
- 主機 IP 所在國家的國旗（自動判斷；判斷錯的話可在設定檔加 `COUNTRY=JP` 手動指定）
- **一鍵更新系統**：按「更新系統」按鈕，VPS 會在背景安裝更新，完成後畫面會顯示結果（有開 Telegram 也會通知）
- 有問題的卡片會變紅框，最上面會顯示問題

## 設定

設定檔在 `/etc/vps-sentinel-lite.conf`，裡面每一項都有中文說明。
改完後執行：`sudo systemctl restart vps-sentinel-lite`

**多台 VPS 一起看**：每台都裝一次，然後在「主要那台」的設定檔填 `PEERS`，
手機只要開主要那台的網址，就會看到全部。

**Telegram 通知**：填 `TG_BOT_TOKEN` 和 `TG_CHAT_ID`。
出問題會推一則，恢復時再推一則；其他 VPS 連續 3 分鐘連不上也會通知。

## 常用指令

| 要做什麼 | 指令 |
|---|---|
| 看狀態 | `systemctl status vps-sentinel-lite` |
| 看記錄 | `journalctl -u vps-sentinel-lite -n 50` |
| 更新程式 | `cd vps-sentinel && git pull && sudo bash install.sh` |
| 完全移除 | `sudo systemctl disable --now vps-sentinel-lite && sudo rm -rf /opt/vps-sentinel-lite /etc/vps-sentinel-lite.conf /etc/systemd/system/vps-sentinel-lite.service` |
