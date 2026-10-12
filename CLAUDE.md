# VPS 哨兵：給 Claude 的專案說明

## 跟使用者溝通

- 使用者**看不懂英文**。回覆、說明、提交訊息（commit message）、README 都用**繁體中文（台灣用語）**。
- 避免英文術語。非用不可時，用中文解釋它是什麼。
- 寫給一般人看，不是寫給工程師看。要講「這樣做之後你會看到什麼」，不要講實作細節。
- 網頁上的文字也一樣：自然、口語，不要像機器翻譯（例如寫「IPv6 連不出去」，不要寫「IPv6 連線失敗狀態」）。

## 這是什麼

單一主機就能跑的 VPS 監控網頁：處理器、記憶體、磁碟、網路、Docker、系統服務、流量、Telegram 通知、雲端硬碟。
**只用 Python 內建模組，不能加任何第三方套件**（主機上不會 pip install）。

## 檔案結構

```
sentinel.py        後端：收集資料、API、Telegram、雲端硬碟轉接、自我更新（全部 Python 內建模組）
web/index.html     網頁骨架；/*@style.css*/ 和 /*@app.js*/ 兩個記號會在啟動時被換成對應檔案的內容
web/style.css      所有樣式，最前面的 :root 是共用設計規則
web/app.js         所有畫面邏輯與動畫
install.sh         安裝／更新哨兵（複製到 /opt/vps-sentinel-lite、設定檔、Caddy、systemd）
cloud.sh           雲端硬碟（FileBrowser Quantum）安裝、調整容量、檢查、更新、移除
cleanup-old.sh     清除舊版 Home Assistant 版本
tools/style_check.py  檢查樣式有沒有照共用規則
tests/             基本功能測試（只用 Python 內建模組）
```

**新增網頁檔案時要一起改三個地方**：
1. `sentinel.py` 的 `SRC_FILES`（版本指紋）
2. `sentinel.py` 的 `load_page()`
3. `install.sh` 複製檔案的那一行

不然「網頁一鍵更新」會判斷錯版本，或主機上會缺檔案。

## 主機上的位置

- 程式：`/opt/vps-sentinel-lite/`（sentinel.py ＋ web/）
- 設定：`/etc/vps-sentinel-lite.conf`（用 `write_conf` 修改；狀態存在 state.json）
- 服務：`systemctl status vps-sentinel-lite`
- 安裝來源：使用者把專案 clone 在 `~/vps-sentinel`，設定檔的 `SRC_DIR` 會記錄位置
- Caddy：主設定用 `import /etc/caddy/sites/vps-sentinel.d/*.caddy`；雲端硬碟的轉接寫在 `cloud.caddy`

## 使用者的兩台主機

**這個專案是公開的：不要把網域、IP、登入碼或任何個人資訊寫進專案的任何檔案或提交訊息。**需要時直接問使用者。

| | A（日本／Oracle，主要） | B |
|---|---|---|
| 網址 | 有網域，用 https（9443 埠） | 有網域，用 https（9443 埠） |
| 其他服務 | 3x-ui（xray，佔用 443 埠）、n8n | — |
| IPv6 | 有 | 沒有 |

兩台都裝了雲端硬碟。A 會從網頁上同時顯示 B 的資料（`PEERS`，用 `?node=` 轉送）。

## 網頁的設計規則（不能破壞）

- **共用設計規則**都在 `web/style.css` 開頭的 `:root`：
  - 圓角：`--r-sm/md/lg/xl/pill`
  - 字級：`--fs-xs` 到 `--fs-3xl`
  - 動畫時間：`--t-fast/mid/slow`
  - 曲線：`--ease/--spring/--exit`
  - 陰影：`--ring/--sh-*`
  - 浮動玻璃：用 `.glass.pop`

  不要寫死 px 圓角、px 字級、cubic-bezier 或毫秒數。
- JS 動畫時間用 `T.fast/T.mid/T.slow`，曲線用 `EASE/SPRING/EXIT`。
- **玻璃效果**：不要對「裡面有 `.glass` 的容器」做透明度動畫，會先變暗再亮起來；要對每個 `.glass` 各自做。
- **畫面更新**是比對差異（`data-key`／`data-keyed`／`data-x`／`data-keep`），不是整塊重畫。新增區塊要給 key，不然自動更新時會閃。
- 電腦版要一頁看完不捲動，手機版另外排版。

## 使用者明確要求過的事（不要改回去）

- 「檢查更新」按鈕的文字固定不變，只有左邊的說明文字會變。
- 不要眼睛圖示：IP 是霧化的，點一下顯示。
- 主機沒有 IPv6 時，整行都不顯示。
- 「全部更新」只跳出一則通知。
- 不要「運作正常」這種多餘的狀態字。
- Telegram 兩台主機都要通知；舊訊息會依設定的保留時間自動刪除。
- 雲端硬碟不用另外的帳號密碼，靠哨兵登入（SSO：`/cloud-sso` 簽章連結＋`vs_cloud` 通行證，哨兵轉接時加上 `X-Sentinel-User: owner`）。

## 雲端硬碟（FileBrowser Quantum）注意事項

- 映像檔是 `ghcr.io/gtsteffaniak/filebrowser:stable`，目前是 v2.0.0。
- 設定檔會嚴格檢查欄位，多一個不認得的欄位就整個起不來。例如 `auth.methods.password.adminUsername` 是 2.1 才有的，stable 用的是 `auth.adminUsername`。
- 容器只開在 `127.0.0.1:8099`，一律經由哨兵轉送（`/cloud/...`）。
- 容量限制靠的是 `/var/lib/vps-cloud/disk.img`（ext4 映像檔），掛在 `/srv/cloud`；調整容量時要先卸載。

## 改完要做的檢查

1. `python3 -c "import ast;ast.parse(open('sentinel.py').read())"`（語法）
2. `python3 tools/style_check.py`（要顯示「全部符合規則」）
2-1. `python3 -m unittest discover -s tests -v`（基本功能測試：把哨兵跑起來，確認網頁和主要 API 有回應）
2-2. `shellcheck *.sh`（安裝腳本的寫法檢查）

   以上幾項在 GitHub 上每次推送或開合併請求時都會自動跑（`.github/workflows/check.yml`）。

3. 在本機跑起來看畫面：

   ```
   SENTINEL_CONF=/某處/test.conf python3 sentinel.py
   ```

   測試設定檔至少要有 `PORT=`、`TOKEN=`、`NAME=`、`DATA_DIR=`（指到測試用資料夾，不然會寫到正式位置）。其他可用的環境變數：
   - `SENTINEL_TG_API`：假的 Telegram 伺服器
   - `SENTINEL_IF_INET6`：假的 IPv6 資料

   有 Playwright 的話，用電腦（1440 寬）和手機（375 寬）兩種尺寸各截圖看一次，並確認瀏覽器主控台沒有錯誤。
4. 碰到網頁更新邏輯時，要確認自動更新兩次後畫面沒有東西跳動或閃爍。

## 提交

- 提交訊息用中文，寫「使用者會看到什麼改變」。
- 版本號在 `sentinel.py` 的 `VERSION`；改動比較大時才往上加。
- 使用者在主機上的更新方式：網頁設定裡的「軟體更新」，或手動執行 `cd ~/vps-sentinel && git pull && bash install.sh`。
