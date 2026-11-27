# Cape 專案說明

## 跟使用者溝通

- 使用者**看不懂英文**。回覆、說明、提交訊息（commit message）、README 都用**繁體中文（台灣用語）**。
- 避免英文術語。非用不可時，用中文解釋它是什麼。
- 寫給一般人看，不是寫給工程師看。要講「這樣做之後你會看到什麼」，不要講實作細節。
- 網頁上的文字也一樣：自然、口語，不要像機器翻譯（例如寫「IPv6 連不出去」，不要寫「IPv6 連線失敗狀態」）。
- **新增或修改任何文字都要簡單扼要**（網頁、Telegram 通知、安裝畫面、對話框都一樣）：一句話講完，只留使用者需要知道或要做的事。不要「點這裡開始」「一切平靜」這種沒資訊的字，也不要解釋背後原理；狀態說明只寫結果（「還沒設定」「舊密碼會立刻失效」）。

## 這是什麼

單一主機就能跑的 VPS 監控網頁：處理器、記憶體、磁碟、網路、Docker、系統服務、流量、Telegram 通知、雲端硬碟。
**只用 Python 內建模組，不能加任何第三方套件**（主機上不會 pip install）。

## 檔案結構

```
sentinel.py        後端：收集資料、API、Telegram、雲端硬碟轉接、自我更新（全部 Python 內建模組）
pair.py            配對暗號、被監看模式（`pair_`、`watch_` 開頭）
download.py        遠端下載、影片網站下載（`dl_`、`yt_` 開頭）
guard.py           安全檢查頁（`sec_`）、SSH 上鎖和金鑰（`ssh_`）、錯太多次封鎖（`guard_`）、自動安全更新（`autoupd_`）
backup.py          每日備份、網頁還原（`bk_`、`rsw_` 開頭；.vsbk 格式和 `--restore`／`--decrypt` 留在 sentinel.py，單獨一個檔就能解開、還原）
                   以上三個跟 fly.py 一樣用 include() 載入、共用同一組變數，位置照原本的順序（include 定義在 HERE 下面）；這三個出錯整個哨兵就起不來（安裝會自動換回舊版）
notes.py           加密筆記（Joplin 同步，`note_` 開頭）：同樣用 include() 載入
photo.py           照片的色彩描述檔（ICC）、自己拆 HEIC、HDR 增益圖（Apple → Ultra HDR／ISO 21496-1）、相機原始檔的內建預覽、製造商資料（`pic_` 開頭）：同樣用 include() 載入，在 album.py 前面
album.py           相簿分享與媒體。訪客使用 cape/album-guest.html，加密媒體由 web/album-sw.js 解密
adblock.py         擋廣告 DNS（AdGuard Home，`ab_` 開頭）：同樣用 include() 載入
fly.py             機場起降、分享的後端；sentinel.py 用 include("fly.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）
web/pin.js         被監看狀態頁的 PIN 碼鍵盤與挑戰回應
web/font.woff2     英數字型（Plus Jakarta Sans 拉丁字母那份，SIL OFL；主機給 /font.woff2，不用等 Google）
cape/              Cape 頁面、樣式、瀏覽器模組與規則服務
cape_deploy.py     Python 安裝環境的 Cape 資產及 Unix socket 橋接
DESIGN.md          美術設計規範
README.md          功能介紹、安裝、更新與備份說明
install.sh         安裝／更新哨兵（複製到 /opt/vps-sentinel-lite、設定檔、Caddy、systemd）
cloud.sh           雲端硬碟（FileBrowser Quantum）安裝、調整容量、檢查、更新、移除
data/airports.tsv  全世界的機場（機場起降用；改了也要在 SRC_FILES、install.sh）
data/coast.tsv     台灣附近的海岸線（Natural Earth，雷達底圖；同上）
data/actypes.tsv   國際民航組織的機型分類（ICAO Doc 8643：種類、引擎、尾流等級；雷達畫哪種形狀、算不算私人飛機；tools/actypes.py 產生；同上）
data/apmap.tsv     四個機場的跑道、滑行道、機坪、航廈（OpenStreetMap，ODbL；雷達放大才畫；tools/apmap.py 在 GitHub Actions 的 apmap 產生；同上）
data/terrain.bin   台灣附近的地形高度（Mapzen Terrain Tiles，雷達畫山；同上，由 tools/terrain.py 產生）
tools/style_check.py  檢查樣式有沒有照共用規則
tools/terrain.py      產生 data/terrain.bin（AWS 上公開的地形圖塊，0.01 度一格、16 公尺一級）
tools/airports_zh.py  幫 data/airports.tsv 補中文城市名（維基數據，連不到，要在 GitHub Actions 上跑）
tools/fly_db_audit.py 用真實飛機訊號核對航空公司表、機型表，列出對不上的（跟 fly_audit 一起在 fly-audit 跑）
tools/fly_perf.py     量機場起降會不會拖慢監控（GitHub Actions 手動執行 fly-perf，ARM 主機；2026-11-13 量的：整個程式處理器 1%、監控定時工作最多晚 7 毫秒，不用搬成獨立程式）
tools/fly_audit.py    機場起降：用真實資料把四個機場跑一遍、列出不合理的地方（這台連不到，到 GitHub Actions 手動執行 fly-audit）
tests/             Python 回歸測試，包含 Cape 的 Node 模組及契約檢查
```

新增部署檔案時，核對 `sentinel.py` 的 `SRC_FILES`、`install.sh` 的複製清單，以及網頁資產的 `cape_deploy.py:CAPE_FILES`。


## 主機上的位置

- 程式：`/opt/vps-sentinel-lite/`（Python 主程式及 Cape 資產）。更新保留上一份安裝程式檔，健康檢查失敗時回復。
- 設定：`/etc/vps-sentinel-lite.conf`（用 `write_conf` 修改；狀態存在 state.json）
- 服務：`systemctl status vps-sentinel-lite`
- 安裝來源：使用者把專案 clone 在 `~/vps-sentinel`，設定檔的 `SRC_DIR` 會記錄位置
- 每日備份：有雲端硬碟就放在雲端硬碟的 `哨兵備份/主機名稱/`（沒有就放 `DATA_DIR/backups/主機名稱/`），每台都存著每一台的；檔案是 `.vsbk` 加密格式（scrypt＋openssl AES-256-CTR＋HMAC-SHA256），總密碼是設定檔的 `BACKUP_KEY`，所有主機共用；版本 2 起每份檔案另有自己的密碼（HMAC(總密碼, 鹽) 算出來，Telegram 只附這組），兩種都能解；Telegram 一份超過 45 MB 就切成「…第1／3段.vsbk」幾段傳（`bk_to_tg`、`vsbk_part_name`，測試用 SENTINEL_TG_PART），`--restore`／`--decrypt` 給任一段會自己找同資料夾的其他段接回來（`vsbk_whole`），網頁還原全部一起選（`rswJoin`）；機場起降重抓得到的資料不備份（`BK_REGEN`）；還原用 `sudo python3 sentinel.py --restore [檔案或還原連結]`（`Restore` 那一段，測試用 SENTINEL_RESTORE_ROOT／SENTINEL_RESTORE_DRY），只解開用 `--decrypt`
- 網頁還原：`bash install.sh --restore` 會產生一次性代碼（雜湊存在 `/var/lib/vps-sentinel-restore/state.json`，測試用 SENTINEL_RESTORE_STATE），網頁 `?restore=代碼` 上傳備份檔後，用 systemd-run 在哨兵之外跑 `--restore --status`，網頁讀 progress.json 顯示進度（`rsw_` 開頭的函式）
- 新增主機（配對暗號）：新主機產生 `VS-` 開頭的暗號（網址＋一次性 128 位元密鑰，24 小時、用一次就失效，存在 `DATA_DIR/pairing.json`，安裝畫面用 `--pair-code`）；主要主機在「新增主機」貼上，兩邊用 HMAC-SHA256 互相驗證、HKDF-SHA256 各自算出 `vsk_` 開頭的連線鑰匙（不在網路上傳），寫進 `PEERS`；新主機只存鑰匙的雜湊，可在「設定 → 配對暗號」解除；`pair_` 開頭的函式
- 被監看模式：被配對、自己又沒有 PEERS 的主機（`watchers()`）不載入完整網頁，`/` 只給一頁說明＋「取消被監看」（密碼或 PIN 碼，或 `--unwatch`）；主要主機在的時候不自己發事件通知；主要主機每 10 分鐘送心跳（`peer_beats`，帶 Telegram 設定），主要主機 5 分鐘沒連進來就由被監看的主機通知（`watch_check`；心跳的 `lead` 只派一台講，挑連得上的第一台），失聯期間各自傳自己的事件（`watch_own`，傳到哪記在 pairing.json 的 `self_t`，`/api/status` 的 `tg_self` 讓主要主機回來後不重發）；「取消被監看」也可以改用傳到 Telegram 的 8 位數驗證碼（`unwatch_ask`），7 天沒連進來就自動取消被監看（`pair_expire`）；主要主機移除時沒通知到那台，背景每 5 分鐘再試（`peer_forget_retry`，存在 pairing.json 的 `forget`）；機場起降完全不跑（`fly_bg_start` 不啟動背景抓取、`/api/fly…`、`/api/flights` 一律 404）
- 從網頁重新開機（`reboot_` 開頭的函式）：先傳 6 位數一次性驗證碼到 Telegram（5 分鐘、錯 5 次失效；被監看的主機用主要主機給的 Telegram），沒有 Telegram 就改輸入那台的密碼或 PIN 碼；測試用 SENTINEL_REBOOT_CMD 換掉真正的重開指令
- Oracle 防回收（`keep_` 開頭的函式）：偵測到 Oracle 免費機型（主機板標記 `OracleCloud.com`＋主機資訊服務的機型）才動作；每天 1、7、13、19 點前後各多 5 分鐘，另開一個最低優先（SCHED_IDLE）的程序把整台處理器補到 25%，畫面上的處理器數字會扣掉這部分；每分鐘的用量存成每天的次數表算 7 天第 95 百分位，2 天以上低於 20% 就提醒；設定裡補量中寫「補量中・到幾點」（`keep_until`，不用轉圈，看起來像卡住）；設定檔 `KEEPALIVE=off` 關閉，測試用 `ORACLE_SHAPE`、`KEEPALIVE_HOURS`
- 遠端下載（`dl_` 開頭的函式）：主機 ⋯ 選單「遠端下載」，貼連結後由那台主機下載到雲端硬碟的「下載」資料夾；只連公開 IP（先查好再連，轉址也重查）、雲端硬碟留 200 MB／主機磁碟留 1 GB；檔案 16 MB 以上且對方支援時分段同時下載（每 32 MB 一段，4～16 段；先下載完的連線會把還剩最多的那段切一半來幫忙）；清單存在 `DATA_DIR/downloads.json`，重新啟動後接續下載（分段的每段各自接續）；斷線、逾時會自己等一下再接著下載（最多 3 次，`DL_AGAIN`）；測試用 SENTINEL_DL_DIR、SENTINEL_DL_LOCAL、SENTINEL_DL_AGAIN
- 影片網站下載（`yt_`、`dl_video`）：YouTube 等網址、或連結打開是網頁時，交給主機上使用者自己裝的 yt-dlp（哨兵不會自己下載或安裝程式）；有 ffmpeg 才下載最好畫質；用 1000 身分執行；yt-dlp、deno 每天用它們自己的更新指令更新一次（`yt_update_loop`）；測試用 SENTINEL_YTDLP 換成假的
- YouTube 擋機房：設定檔 `YT_PROXY` 或自動偵測 WARP（127.0.0.1:40000 的 socks5）就走代理；還被擋才用網頁貼上的網站登入資料（`DATA_DIR/yt-cookies.txt`，不同網站分開貼會合併，`yt_` 開頭的函式）；貼上的分享文字會自動挑出網址（`dl_pick`）；小紅書、B 站、抖音的短網址先自己轉址、換成標準網址（`yt_fix`）
- 航班及進階雷達契約見 `fly.py`、`tests/test_flights.py` 和 [STATUS.md](STATUS.md)。`/api/flights` 提供航班、機場地理、登記資料及相片，`/api/fly-terrain` 提供地形。
- 背景更新由 `fly_loop` 控制。近七天曾使用航班工具時會更新資料，被監看的主機會跳過。OpenSky 憑證及外部來源仍由既有後端管理。
- 航班分享由 `fly.py` 的 `share_` 函式管理。入口 `/s/<code>` 導向 Cape 的訪客畫面，期限、裝置限制及指定機場仍由伺服器驗證。
- 每台裝置自己的登入（`sess_` 開頭、`/api/login`、`/api/sessions`）：密碼、PIN 碼、手機金鑰登入後拿到 `vss_` 開頭的鑰匙（不是存取密碼），主機只存雜湊在 `DATA_DIR/sessions.json`；勾「30 天內不用再登入」的 30 天到期，沒勾的一天沒用就失效；設定 →「登入的裝置」（`sessModal`）可以登出一台；瀏覽器照 `BRW`／`brwOf` 認（app.js、album.js 各一份、album.py `alb_ua_name` 同一套：App 內、各家手機內建、Edge／Opera／Brave…，最後才是 Chrome／Safari）；裝置名字照詳細型號（`devName`／`devModel`：Chrome、Edge 用 `userAgentData` 問手機型號、Windows／macOS 版本，三星 S、Z 系列換成第幾代；iPhone 問不到型號只寫 iOS 幾；iOS 26 起系統版本凍在 18_6，`iosVer` 看 Safari 的 Version/，其他瀏覽器只有 18_6 就不寫；Mac、Windows 版本只信 `userAgentData.platform` 對得上的，macOS 10 是凍住的不寫；相簿 album.js 同一套），`os` 記系統、清單左邊是廠商圖示（`devIcon`／`DEVI`），打開清單時這台的名字會更新（`sess_name`）；換密碼全部登出、按的那台拿新鑰匙（`/api/token` 回 `sess`）；舊版存著密碼的、`#t=` 一鍵登入網址，打開時自動換成鑰匙（`upgradeTok`）；存取密碼本身照樣能用（主機之間、舊的連線）
- 再確認一次是你（使用者要求，`recheck_need`／`recheck_ok`／`Handler.recheck`）：用登入鑰匙（`vss_`）的裝置要換密碼、設定／換／關 PIN 碼、改或關 Telegram、加／刪手機金鑰、產生配對暗號、換備份密碼時，主機先回 403 `recheck`，網頁跳「先確認是你」問 PIN 碼／手機金鑰／密碼，帶 `X-Recheck`（base64 的 JSON）再送；確認過同一台 5 分鐘內不再問（`RECHECK`）；在主要主機驗證，轉給別台的不用（主機之間、存取密碼本身不擋）
- 臨時 PIN 碼（使用者要求）：第一次安裝 install.sh 跑 `--first-pin`（已經有 PIN 碼就不動），隨機 8 位數存成 pin.json 的 `temp`，畫面只印網址＋PIN 碼（不再帶 `#t=` 密碼）；忘了用 `--new-pin` 換一組臨時的；還是臨時的時候，用登入鑰匙（`vss_`）的裝置除了 `Handler.PIN_FREE` 那幾個 API 一律回 403 `mustpin`（`must_pin`、`pin_temp` 照檔案修改時間記著），網頁跳出關不掉的 `pinModal(true)`，換掉臨時的不用再確認一次；登入頁看到 `temp` 直接打開 PIN 碼鍵盤；存取密碼本身（主機之間）不擋
- PIN 挑戰由 `/api/pin-login` 或 `/api/pin` 的 `begin` 取得，前端回傳以 PBKDF2 結果計算的 HMAC。Cape 使用 `cape/outpost.js`，被監看狀態頁使用 `web/pin.js`。
- 雲端硬碟每次打開都要驗證（使用者要求）：`/api/cloud-open` 在主要主機驗證 PIN 碼、手機金鑰或密碼後才給登入票（別台的票用主機之間的鑰匙問 `/api/cloud-ticket`），狀態裡不再有票；通行證關掉瀏覽器就失效（最長 `CLOUD_HOURS`），登出裝置時全部作廢（`cloud_revoke`）
- Cape 頁面的 CSP 由 `cape_deploy.py` 設定，JavaScript 以同源的外部模組載入。相簿訪客頁使用 `album.py` 的 `ALB_CSP`。
- 存在主機上的資料加密（`seal_`、`sec_` 開頭，sentinel.py 設定那段最前面）：設定檔裡 `SEAL_CONF` 這幾個值（存取密碼、Telegram、備份密碼、PEERS、OpenSky、YT_PROXY、LINKS）寫成 `vse1:…`，DATA_DIR 裡 `SEAL_FILES` 這幾個檔案開頭是 `VSE1`；兩層：裡面 AES-256-GCM、外面 ChaCha20-Poly1305，各自的鑰匙（ctypes 呼叫系統 libcrypto，啟動先對 NIST、RFC 8439 標準測試值，對不上就照舊存明碼），鑰匙在設定檔旁邊的 `.key`（`SEAL_KEY_PATH`，root 才讀得到，跟著每日備份）；每個欄位／檔名各自一把（換位置解不開）；讀的時候明碼也認得，服務啟動時自動換成加密的（`seal_all`）；**新增存秘密的檔案要用 `sec_load`／`sec_dump`／`sec_write` 並加進 `SEAL_FILES`，新增秘密設定加進 `SEAL_CONF`**；shell 腳本要讀這些值用 `python3 sentinel.py --conf-get 名稱`；`--unseal` 全部換回明碼（install.sh 退回不認得加密的舊版前會先跑）；測試讀加密檔用 `tests/seal_util.py`
- 沒網域的主機走 https（`tls_` 開頭）：`DOMAIN` 沒設、`BIND` 不是本機時，啟動用 openssl 產生自己簽的憑證（`DATA_DIR/tls/`，P-384、10 年，不用備份也行），只收 TLS 1.3；同一個連接埠第一個位元組是 0x16 才當 https（`Server.finish_request`），從外面用 http 開網頁轉到 https，`/api/`、本機、安卓 App（`; wv)`）照舊收 http；主機之間只認指紋（`TLS_PINS`／`_PinHTTPS`，存 `tls-pins.json`）：配對暗號版本 2 帶指紋（`pair_decode_fp`），舊的 http 主機看到 `/api/status` 的 `tlsfp` 自動換 https（`tls_upgrade`）；設定檔 `TLS=off` 關掉
- SSH 的門（`ssh_risks`，一小時看一次 `sshd -T`）：能用密碼登入是注意、root 能用密碼登入或允許空密碼是異常，放進 notices／problems（首頁小膠囊、Telegram）；測試用 SENTINEL_SSHD_T
- 安全檢查頁（使用者要求，guard.py；設定 → 主機「安全檢查」，`/api/sec`，改東西要先確認是你）：上面四項自動做好的只看（`SECI`），下面四個開關（`SECO`）：SSH 只能用金鑰、root 只能用金鑰（只寫自己的 `/etc/ssh/sshd_config.d/00-vps-sentinel.conf`，`sshd -t` 過了才 reload，不對就換回；主設定沒讀 sshd_config.d 就在最前面加 Include）、錯太多次封鎖（`guard_loop`：讀 journalctl 的 sshd，10 分鐘錯 5 次封 1 小時、7 天內再來封 24 小時，7 天內成功登入過的、內部網路不封；nftables 表 `inet vps_sentinel`，沒有就 iptables；設定檔 `SSH_GUARD=off` 關，預設開；存 `DATA_DIR/ssh-guard.json`）、自動安裝安全更新（`/etc/apt/apt.conf.d/20auto-upgrades`，沒裝 unattended-upgrades 先背景裝）；**沒有金鑰不准關密碼登入**（`ssh_key_ok`）；SSH 金鑰可以貼 .pub 或「幫我做一組」（ssh-keygen ed25519，私密的只給網頁下載一次、主機不留）；第一次安裝 install.sh 跑 `--sec-setup`（打開自動安全更新、印出狀況）；哪一項從好變不好（`SEC_BAD`，`sec_watch` 10 分鐘看一次，上次的存 `DATA_DIR/sec-last.json`）記一筆「安全檢查：…」傳 Telegram（🔐）；測試用 SENTINEL_SSH_ETC／SENTINEL_SSH_HOME／SENTINEL_GUARD_FW／SENTINEL_GUARD_LOG／SENTINEL_GUARD_EVERY／SENTINEL_AUTOUPD／SENTINEL_SEC_EVERY
- 加密筆記（使用者要求，notes.py，`note_` 開頭；工具分頁「加密筆記」`notesModal`，`/api/notes`）：`/notes/` 是給 Joplin 的小型 WebDAV（PROPFIND、GET、PUT、DELETE、MKCOL、MOVE、COPY），帳號固定 `joplin`、密碼是主機產生的亂數；Joplin 端對端加密的密碼也由主機產生、記著（`ek`，使用者要求「存著就好」，打開後就不換，換同步密碼、關掉也留著；都存在加密的 `notes.json`，看密碼、打開、換密碼要先確認是你）；只收 https（經過本機 Caddy 看 X-Forwarded-Proto）；15 分鐘錯 10 次擋那個來源；筆記放 `DATA_DIR/notes`（跟著每日備份，主機磁碟留 1 GB），資料夾不見時回 503 不當成空的（Joplin 會以為全被刪了）；加密靠 Joplin 自己的端對端加密（網頁步驟第一步就是啟用加密）；關掉時筆記留著；「清除所有筆記」（`wipe`，要先確認是你）刪掉主機上全部筆記、密碼和加密密碼都換新（使用者說等於重新開一本），手機上的 Joplin 不動
- 相簿 API、資料與前端移植進度見 [STATUS.md](STATUS.md)。
- 擋廣告 DNS（使用者要求，adblock.py，`ab_` 開頭；工具分頁「AdGuard Home」`abModal`，圖示是自己畫的線條圖示 `noad`、圓底 `.ico.dnsf`（**class、檔名不能帶 ad／adblk 這類字**：手機瀏覽器內建的擋廣告會把元素整個藏掉，以前的 `.ico.adblk` 和 `/ab-icon.png` 在使用者手機上都看不到）（被劃掉的 AD；使用者說抓 AdGuard 的圖手機上顯示不出來，改成跟其他工具同風格），`/api/adblock`）：要有網域才出現（`ab_brief` 回 None 就不顯示方塊）；打開時在背景下載 AdGuard Home 到 `/opt/vps-adblock`（`ab_download`，static.adtidy.org、失敗換 GitHub）、寫 `vps-adblock.service`，第一次用它的設定精靈 API 設好（管理網頁只開 `127.0.0.1:3053`，帳號 `sentinel`、亂數密碼存在加密的 `DATA_DIR/adblock.json`），再用 `/control/tls/configure` **關掉一般 DNS（`serve_plain_dns:false`）**、開 853 的 DNS-over-TLS（用 Caddy 申請的憑證 `ab_cert`，換新時重設）和給 Caddy 轉的 DoH；Caddy 加 `vps-sentinel.d/adblock.caddy` 把 `/dns-query` 轉過去；本機防火牆開 853（雲端主機商那邊要自己開）；每分鐘檢查（`ab_loop`）：停了兩次記「AdGuard Home 停了」、一般 DNS 不小心開著就停掉、每天讓它自己更新；iPhone 描述檔 `/api/adblock-profile` 給一次性代碼（走 853 的 DNS-over-TLS＋主機位址 `ServerAddresses`；2026-11-21 實測 DoH 網址帶 9443 時 iPhone 的查詢完全沒到主機）；每 5 分鐘從網域用 853 自己問一次（`ab_pub_check`），不通時視窗寫「手機連不上：…」，`/dns.mobileconfig?k=` 下載（只給自己或配對主機的網域）；上游 DNS（`ab_dns`／`ab_upstreams`，`/control/dns_config`）：國際的 `AB_UP` 一起用、大陸的 `AB_CN_UP` 只給 `AB_CN` 那些網域（使用者要求國際網站不能經過大陸 DNS），開 ECS 讓大陸連進來的拿到當地位址，大陸網域另外每週下載 dnsmasq-china-list（`ab_cn_fetch`，測試用 SENTINEL_AB_CNLIST）寫成 `AB_UPFILE` 給 `upstream_dns_file`，同時設好快取先給舊答案、DNSSEC、每秒 100 次（使用者要求「直接幫我設好、管理頁看不懂」），`AB_DNSV` 版本沒變只每週更新清單；擋廣告清單 `AB_LISTS`（官方清單庫：中文 anti-AD、惡意（URLhaus、HaGeZi 威脅情報、Dandelion Sprout）、釣魚、詐騙，`ab_lists`、每 12 小時更新）；「最常擋的／最近擋的」（`ab_recent` 讀 querylog）每項可以放行／恢復擋（`ab_allow`，寫成 `@@||網域^$important` 規則）；有配對主機時請別台用 `/api/ab-probe`（只給主機之間的鑰匙，`ab_probe_ips` 只測指到公開位址的網域）從外面試連 853（`ab_ext_check`，通了 30 分鐘、不通 2 分鐘再試），不通寫「從某台連不到：到主機商的防火牆打開 TCP 853」；管理頁 `/adguard/`（`ab_proxy`）跟雲端硬碟一樣：`/api/adguard-open` 先確認是你、給一次性登入票（別台用 `/api/adguard-ticket`），`/adguard-sso` 換 `vs_agh` 通行證，哨兵自己登入 AdGuard Home（`ab_session`）再轉過去；設定檔和服務檔跟著每日備份，還原後程式不在會自動重裝；測試用 SENTINEL_AB_FAKE／SENTINEL_AB_API／SENTINEL_AB_CERTS／SENTINEL_AB_DIR／SENTINEL_AB_EVERY
- 備份做完馬上試開一次（`bk_verify`：解密、每個檔案讀到底），失敗就算備份失敗；從沒成功過也會提醒「備份還沒成功過」
- Telegram 通知排隊（`tg_send`／`tg_flush`、`TG_QUEUE`，存在 state.json）：連不上、429、5xx（`TG_AGAIN`）先留著，每 30 秒照順序補傳，晚 2 分鐘以上的註明幾點，一天還傳不出去就丟掉；密碼錯、被封鎖直接丟掉；驗證碼這類即時的不排隊
- 其他主機的狀態（`peer_get`／`PEER_CACHE`）：網頁 `/api/all` 直接拿存著的，超過 2 秒才在背景重問，同一台同時只問一次；連不上的越隔越久（最多 10 秒）才再問；通知那邊（`alert_loop`）用 `all_status(fresh=True)` 等最新的
- 城市名一律中文（`city_zh`：ipinfo 給的英文城市用 data/airports.tsv 第 8 欄換，查不到就不寫；這台在 `check_geo`、其他台在 `geo_keep`／`peer_get` 換，舊版主機也是中文）
- 國旗由主機給（`/flag/jp.png`、`flag_img`：第一次用到才抓 flagcdn，存在 `DATA_DIR/flags/`，180 天重抓，不備份；測試用 SENTINEL_FLAG_URL），網頁打開不用等外面的網站；連不上的其他主機照樣有上次的國旗和城市（`PEER_GEO`、`geo_keep`，存在 state.json）
- Cape 靜態資產帶 ETag，未變動時回 304。比較時會忽略 Caddy 壓縮加入的 `-gzip`。
- 省流量：30 分鐘圖表資料只傳新的那一段（網頁 `/api/all?since={"@self"或代號: 最後時間}`、主要主機問其他台 `/api/status?since=`，回 `hist.part`；`hist_cut`／`hist_join`，網頁 `HIST`／`histJoin` 接起來）；網頁、程式、API 回應哨兵自己壓縮（`gz_of`、`GZ_TYPES`，沒經過 Caddy 也有；主機之間要求壓縮）；網頁看不到（`document.hidden`）時不更新，回來馬上更新
- 重新啟動（例如更新完）不用等其他主機：關掉前把其他主機最後的狀態存在 `DATA_DIR/peers-cache.json`（`peer_cache_save`／`peer_cache_load`，網址改了不用；不備份），啟動後先給這份、背景馬上重問
- 同時連線上限（`Server`、`MAX_CONN` 200）：滿了等 2 秒，還是滿就斷掉；測試用 SENTINEL_MAX_CONN
- 機場起降跟監控隔開：fly.py 載入失敗時 `FLY_OK=False`，其他照常、機場的 API 回 503；機場的連線（`FLY_API`）同時最多 `FLY_MAX` 48 個（`Handler.fly_gate`），滿了回 503「看的人太多」
- Caddy：主設定用 `import /etc/caddy/sites/vps-sentinel.d/*.caddy`；雲端硬碟的轉接寫在 `cloud.caddy`

## 使用者的兩台主機

**這個專案是公開的：不要把網域、IP、登入碼或任何個人資訊寫進專案的任何檔案或提交訊息。**需要時直接問使用者。

| | A（日本／Oracle，主要） | B |
|---|---|---|
| 網址 | 有網域，用 https（9443 埠） | 有網域，用 https（9443 埠） |
| 其他服務 | 3x-ui（xray，佔用 443 埠）、n8n | — |
| IPv6 | 有 | 沒有 |

兩台都裝了雲端硬碟。A 會從網頁上同時顯示 B 的資料（`PEERS`，用 `?node=` 轉送）。

## 前端規範

Cape 的版型、色彩、元件與動畫以 [DESIGN.md](DESIGN.md) 和 `cape/styles.css` 為準。移植缺口與歷史原始碼位置見 [STATUS.md](STATUS.md)。

## 使用者明確要求過的事（不要改回去）

- 「檢查更新」按鈕（系統更新，在設定 → 主機）的文字固定不變，只有左邊的說明文字會變。
- 不要眼睛圖示：IP 是霧化的，點一下顯示。
- 主機沒有 IPv6 時，整行都不顯示。
- 「全部更新」只跳出一則通知。
- 機場頁面同一件事只寫一次（使用者說重複資訊太多、不夠現代）：新增資訊前先看看別處是不是已經有了。
- 不要「運作正常」這種多餘的狀態字。
- Telegram 兩台主機都要通知；舊訊息會依設定的保留時間自動刪除。
- 每一則 Telegram 通知開頭都要有狀態符號（✅ ❌ 🔴 🟠 🔄 🔑 🔐 🔌 ℹ️ 這類，不是笑臉）。新增通知時，要在 `ev_line()` 給它合適的符號，並加進 `tests/test_tg_icons.py`。
- 雲端硬碟不用另外的帳號密碼，靠哨兵登入（SSO：`/cloud-sso` 簽章連結＋`vs_cloud` 通行證，哨兵轉接時加上 `X-Sentinel-User: owner`）。

## 雲端硬碟（FileBrowser Quantum）注意事項

- 映像檔是 `ghcr.io/gtsteffaniak/filebrowser:stable`，目前是 v2.0.0。
- 設定檔會嚴格檢查欄位，多一個不認得的欄位就整個起不來。例如 `auth.methods.password.adminUsername` 是 2.1 才有的，stable 用的是 `auth.adminUsername`。
- 容器只開在 `127.0.0.1:8099`，一律經由哨兵轉送（`/cloud/...`）。
- 容量限制靠的是 `/var/lib/vps-cloud/disk.img`（ext4 映像檔），掛在 `/srv/cloud`；調整容量時要先卸載。
- 整顆加密（使用者要求：新裝的一律加密，沒有不加密的選項）：空間檔是 LUKS2（AES-256-XTS、argon2id），鑰匙 `/etc/vps-cloud.key`（跟著每日備份的「雲端硬碟設定」），開機由 `vps-cloud-unlock.service` 解鎖成 `/dev/mapper/vps-cloud` 再掛上；調整容量三層一起改（`luks_grow`、縮小時留 32 MB 給檔頭）；4.25 起拿掉「加密」鈕和沒加密的寫法（兩台都加密好了，使用者要求），cloud.sh 遇到沒加密的空間檔直接停下

## 改完要做的檢查

1. `python3 -c "import ast;ast.parse(open('sentinel.py').read())"`（語法）
2. `python3 tools/style_check.py`（檢查 Cape 網頁入口及主題樣式）
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
