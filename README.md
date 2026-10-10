# 🛡️ VPS 哨兵

**用手機或電腦，隨時看你的 VPS 健不健康。**

在 VPS 上裝好之後，打開一個網址，就能看到處理器、記憶體、磁碟用了多少，Docker 容器有沒有掛掉，系統要不要更新。出問題還能直接傳 Telegram 通知你。

整個程式只有一個檔案，不用另外裝 Home Assistant、資料庫或其他軟體。

---

## ✨ 可以做什麼

- 📊 **即時狀態**：處理器、記憶體、磁碟、網路速度、開機多久
- 📈 **歷史曲線**：最近 30 分鐘的使用量變化
- 🐳 **容器與服務**：Docker 容器、系統服務有沒有在正常執行
- 🔄 **一鍵更新系統**：按一下按鈕，VPS 就會在背景安裝更新
- 🚩 **國旗**：自動顯示主機所在的國家，多台時一眼就分得出來
- ✏️ **自訂名稱**：點名字旁的鉛筆圖示就能改名
- 🖥️ **多台一起看**：一個網址看全部的 VPS
- 💬 **Telegram 通知**：出問題、恢復、更新完成都會通知你
- 📱 **電腦版、手機版各自設計**：電腦有大儀表板，手機可以加到主畫面當 App 用
- 🎨 **自訂外觀**：點齒輪 ⚙️ 可以換主題色、深淺色、玻璃效果、背景、文字大小，也能選擇要顯示哪些內容（設定存在各自的裝置上）

---

## 🚀 安裝

用 root 身分登入 VPS（如果是用一般帳號登入，先輸入 `sudo -i`），然後貼上：

```bash
git clone https://github.com/a7510049/vps-sentinel-homeassistant.git ~/vps-sentinel
cd ~/vps-sentinel && bash install.sh
```

裝好後畫面會出現一個網址，用手機或電腦打開就能看了（第一次打開會自動記住密碼）。

> 📱 **iPhone 小技巧**：用 Safari 打開網址 → 按「分享」→「加入主畫面」，就會變成一個 App。

### 有自己的網域？建議加上加密連線

1. 到買網域的網站，新增一筆 **A 紀錄**，指向你 VPS 的 IP
2. 在 VPS 上執行（換成你的網域）：

```bash
cd ~/vps-sentinel && bash install.sh 你的網域
```

網址就會變成 `https://你的網域`，比較安全。

> 如果 VPS 的 443 連接埠已經被其他服務（例如翻牆服務）使用，程式不會去搶，會自動改用 **9443**，網址就是 `https://你的網域:9443`。

### ⚠️ 雲端主機的防火牆

甲骨文（Oracle）、AWS、GCP 這類雲端主機，網站上還有一道防火牆要自己打開：

| 安裝方式 | 要開的連接埠（TCP） |
|---|---|
| 一般安裝 | 8787 |
| 有網域 | 80，以及 443 或 9443（看安裝完顯示的網址） |

---

## 🔄 更新到最新版

```bash
cd ~/vps-sentinel && git pull && bash install.sh
```

你的設定（密碼、名稱、網域等）都會保留。

---

## ⚙️ 設定

設定檔在 `/etc/vps-sentinel-lite.conf`，用這個指令打開：

```bash
nano /etc/vps-sentinel-lite.conf
```

改完存檔後，執行 `systemctl restart vps-sentinel-lite` 才會生效。

| 項目 | 說明 |
|---|---|
| `TOKEN` | 存取密碼 |
| `SERVICES` | 想監看的系統服務，例如 `nginx,ssh` |
| `PEERS` | 其他 VPS 的網址（多台一起看，見下方） |
| `TG_BOT_TOKEN`、`TG_CHAT_ID` | Telegram 通知，兩個都填才會開啟 |
| `ALERT_CPU`、`ALERT_MEM`、`ALERT_DISK` | 超過幾 % 算異常（預設 90） |
| `COUNTRY` | 國旗判斷錯的話，可以手動指定，例如 `JP` |

### 多台 VPS 一起看

1. 每一台 VPS 都照上面的方法安裝
2. 在你要當「主要」的那一台，打開設定檔，填上其他台的網址和密碼：

```
PEERS=東京=https://tokyo.example.com,大阪=https://osaka.example.com|大阪那台的密碼
```

（密碼跟主要那台一樣的話，`|密碼` 可以省略）

之後只要打開主要那台的網址，就能看到全部。

---

## 🧰 常用指令

| 要做什麼 | 指令 |
|---|---|
| 看程式有沒有在跑 | `systemctl status vps-sentinel-lite` |
| 看執行記錄 | `journalctl -u vps-sentinel-lite -n 50` |
| 忘記密碼 | `grep TOKEN /etc/vps-sentinel-lite.conf` |
| 重新啟動 | `systemctl restart vps-sentinel-lite` |

### 完全移除

```bash
systemctl disable --now vps-sentinel-lite
rm -rf /opt/vps-sentinel-lite /etc/vps-sentinel-lite.conf /etc/systemd/system/vps-sentinel-lite.service /etc/caddy/sites/vps-sentinel.caddy
systemctl reload caddy 2>/dev/null; systemctl daemon-reload
```

---

## 📦 從舊版（Home Assistant 版）升級

舊版需要 Home Assistant 和 MQTT，現在都不需要了。裝好新版後，可以用這個工具清掉舊版留下的東西：

```bash
cd ~/vps-sentinel && bash cleanup-old.sh
```

它會先列出找到的舊東西，確認後才會刪除，不會動到新版、Docker 裡的其他容器（例如 n8n）。

---

## 📄 授權

MIT 授權，可以自由使用與修改。
