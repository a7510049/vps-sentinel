# VPS 哨兵：給 Claude 的專案說明

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
fly.py             機場起降、分享的後端；sentinel.py 用 include("fly.py") 載入到自己裡面，兩邊共用同一組變數（不是獨立模組）
web/index.html     網頁骨架；/*@style.css*/ 和 /*@app.js*/ 兩個記號會在啟動時被換成對應檔案的內容
web/style.css      所有樣式，最前面的 :root 是共用設計規則
web/app.js         所有畫面邏輯與動畫；/*@fly.js*/ 記號的位置會換成 web/fly.js
web/fly.js         機場起降、整頁雷達、分享的畫面（style_check、test_webjs 會跟 app.js 一起檢查）
DESIGN.md          美術設計規範
README.md          GitHub 首頁的介紹（功能改了要跟著改）；docs/ 放介紹用的截圖
install.sh         安裝／更新哨兵（複製到 /opt/vps-sentinel-lite、設定檔、Caddy、systemd）
cloud.sh           雲端硬碟（FileBrowser Quantum）安裝、調整容量、檢查、更新、移除
cleanup-old.sh     清除舊版 Home Assistant 版本
data/airports.tsv  全世界的機場（機場起降用；改了也要在 SRC_FILES、install.sh）
data/coast.tsv     台灣附近的海岸線（Natural Earth，雷達底圖；同上）
data/actypes.tsv   國際民航組織的機型分類（ICAO Doc 8643：種類、引擎、尾流等級；雷達畫哪種形狀、算不算私人飛機；tools/actypes.py 產生；同上）
data/apmap.tsv     四個機場的跑道、滑行道、機坪、航廈（OpenStreetMap，ODbL；雷達放大才畫；tools/apmap.py 在 GitHub Actions 的 apmap 產生；同上）
data/terrain.bin   台灣附近的地形高度（Mapzen Terrain Tiles，雷達畫山；同上，由 tools/terrain.py 產生）
tools/style_check.py  檢查樣式有沒有照共用規則
tools/terrain.py      產生 data/terrain.bin（AWS 上公開的地形圖塊，0.01 度一格、16 公尺一級）
tools/airports_zh.py  幫 data/airports.tsv 補中文城市名（維基數據，連不到，要在 GitHub Actions 上跑）
tools/fly_db_audit.py 用真實飛機訊號核對航空公司表、機型表，列出對不上的（跟 fly_audit 一起在 fly-audit 跑）
tools/fly_audit.py    機場起降：用真實資料把四個機場跑一遍、列出不合理的地方（這台連不到，到 GitHub Actions 手動執行 fly-audit）
tests/             基本功能測試（只用 Python 內建模組）
android/           安卓 App：全螢幕打開主機的網頁（記住網址），畫面全部來自網頁，主力是網頁
```

**安卓 App**：這台開發機連不到 Google 的套件庫，只能靠 GitHub 自動建置（`.github/workflows/android.yml`）：推上去就會做安裝檔、放到 `android` 下載頁，再用模擬手機截圖＋錄影，打包放到 `android-shots`（用 `curl -L https://github.com/a7510049/vps-sentinel/releases/download/android-shots/shots.zip` 拿回來看）。模擬手機沒有顯示卡，錄影只有每秒幾格，不能拿來判斷動畫順不順。操作步驟在 `android/tools/shots.sh`（用真的 sentinel.py 當主機）。使用者說過 App 只是方便安裝，不要另外做一套原生畫面。簽章檔 `android/app/sentinel.jks` 固定不換，換了手機上就不能直接更新。

**新增程式或網頁檔案時要一起改三個地方**（後端檔案不用改 `load_page()`，改 `include()`；也要加進 check.yml 的 py_compile）：
1. `sentinel.py` 的 `SRC_FILES`（版本指紋）
2. `sentinel.py` 的 `load_page()`
3. `install.sh` 複製檔案的那一行

不然「網頁一鍵更新」會判斷錯版本，或主機上會缺檔案。

## 主機上的位置

- 程式：`/opt/vps-sentinel-lite/`（sentinel.py ＋ web/）；安裝時舊版留在 `.prev`，新版 40 秒內打不開網頁就換回來，並留 `.rolled-back` 讓哨兵記一筆「更新失敗，已退回」（會傳 Telegram）；網頁「全部更新」先更新一台別的主機，成功才更新其他台
- 更新進度視窗（app.js 的 `upv` 開頭、`UPW.rows`）：按「更新」／「全部更新」後跳出，每一項一條波浪進度條，哨兵標出「下載・安裝・重新啟動・完成」走到哪（`self_last()` 從更新記錄檔讀 `stage`：`__STEP__ inst`、安裝畫面的「[4/4] 啟動哨兵」；連不上就算重新啟動），進度條只在那一步的範圍裡慢慢走（`UPRG`）；新版打不開換回舊版時 `last.rolled`；這台好了先畫「好了」再整頁淡出重新載入；「在背景更新」關掉後照舊只跳一則通知
- 設定：`/etc/vps-sentinel-lite.conf`（用 `write_conf` 修改；狀態存在 state.json）
- 服務：`systemctl status vps-sentinel-lite`
- 安裝來源：使用者把專案 clone 在 `~/vps-sentinel`，設定檔的 `SRC_DIR` 會記錄位置
- 每日備份：有雲端硬碟就放在雲端硬碟的 `哨兵備份/主機名稱/`（沒有就放 `DATA_DIR/backups/主機名稱/`），每台都存著每一台的；檔案是 `.vsbk` 加密格式（scrypt＋openssl AES-256-CTR＋HMAC-SHA256），總密碼是設定檔的 `BACKUP_KEY`，所有主機共用；版本 2 起每份檔案另有自己的密碼（HMAC(總密碼, 鹽) 算出來，Telegram 只附這組），兩種都能解；Telegram 一份超過 45 MB 就切成「…第1／3段.vsbk」幾段傳（`bk_to_tg`、`vsbk_part_name`，測試用 SENTINEL_TG_PART），`--restore`／`--decrypt` 給任一段會自己找同資料夾的其他段接回來（`vsbk_whole`），網頁還原全部一起選（`rswJoin`）；機場起降重抓得到的資料不備份（`BK_REGEN`）；還原用 `sudo python3 sentinel.py --restore [檔案或還原連結]`（`Restore` 那一段，測試用 SENTINEL_RESTORE_ROOT／SENTINEL_RESTORE_DRY），只解開用 `--decrypt`
- 網頁還原：`bash install.sh --restore` 會產生一次性代碼（雜湊存在 `/var/lib/vps-sentinel-restore/state.json`，測試用 SENTINEL_RESTORE_STATE），網頁 `?restore=代碼` 上傳備份檔後，用 systemd-run 在哨兵之外跑 `--restore --status`，網頁讀 progress.json 顯示進度（`rsw_` 開頭的函式）
- 新增主機（配對暗號）：新主機產生 `VS-` 開頭的暗號（網址＋一次性 128 位元密鑰，24 小時、用一次就失效，存在 `DATA_DIR/pairing.json`，安裝畫面用 `--pair-code`）；主要主機在「新增主機」貼上，兩邊用 HMAC-SHA256 互相驗證、HKDF-SHA256 各自算出 `vsk_` 開頭的連線鑰匙（不在網路上傳），寫進 `PEERS`；新主機只存鑰匙的雜湊，可在「設定 → 配對暗號」解除；`pair_` 開頭的函式
- 被監看模式：被配對、自己又沒有 PEERS 的主機（`watchers()`）不載入完整網頁，`/` 只給一頁說明＋「取消被監看」（密碼或 PIN 碼，或 `--unwatch`）；不自己發事件通知；主要主機每 10 分鐘送心跳（`peer_beats`，帶 Telegram 設定），主要主機 5 分鐘沒連進來就由被監看的主機通知（`watch_check`）；「取消被監看」也可以改用傳到 Telegram 的 8 位數驗證碼（`unwatch_ask`），7 天沒連進來就自動取消被監看（`pair_expire`）；主要主機移除時沒通知到那台，背景每 5 分鐘再試（`peer_forget_retry`，存在 pairing.json 的 `forget`）；機場起降完全不跑（`fly_bg_start` 不啟動背景抓取、`/api/fly…`、`/api/flights` 一律 404）
- 從網頁重新開機（`reboot_` 開頭的函式）：先傳 6 位數一次性驗證碼到 Telegram（5 分鐘、錯 5 次失效；被監看的主機用主要主機給的 Telegram），沒有 Telegram 就改輸入那台的密碼或 PIN 碼；測試用 SENTINEL_REBOOT_CMD 換掉真正的重開指令
- Oracle 防回收（`keep_` 開頭的函式）：偵測到 Oracle 免費機型（主機板標記 `OracleCloud.com`＋主機資訊服務的機型）才動作；每天 1、7、13、19 點前後各多 5 分鐘，另開一個最低優先（SCHED_IDLE）的程序把整台處理器補到 25%，畫面上的處理器數字會扣掉這部分；每分鐘的用量存成每天的次數表算 7 天第 95 百分位，2 天以上低於 20% 就提醒；設定檔 `KEEPALIVE=off` 關閉，測試用 `ORACLE_SHAPE`、`KEEPALIVE_HOURS`
- 遠端下載（`dl_` 開頭的函式）：主機 ⋯ 選單「遠端下載」，貼連結後由那台主機下載到雲端硬碟的「下載」資料夾；只連公開 IP（先查好再連，轉址也重查）、雲端硬碟留 200 MB／主機磁碟留 1 GB；檔案 16 MB 以上且對方支援時分段同時下載（每 32 MB 一段，4～16 段；先下載完的連線會把還剩最多的那段切一半來幫忙）；清單存在 `DATA_DIR/downloads.json`，重新啟動後接續下載（分段的每段各自接續）；斷線、逾時會自己等一下再接著下載（最多 3 次，`DL_AGAIN`）；測試用 SENTINEL_DL_DIR、SENTINEL_DL_LOCAL、SENTINEL_DL_AGAIN
- 影片網站下載（`yt_`、`dl_video`）：YouTube 等網址、或連結打開是網頁時，交給主機上使用者自己裝的 yt-dlp（哨兵不會自己下載或安裝程式）；有 ffmpeg 才下載最好畫質；用 1000 身分執行；yt-dlp、deno 每天用它們自己的更新指令更新一次（`yt_update_loop`）；測試用 SENTINEL_YTDLP 換成假的
- YouTube 擋機房：設定檔 `YT_PROXY` 或自動偵測 WARP（127.0.0.1:40000 的 socks5）就走代理；還被擋才用網頁貼上的網站登入資料（`DATA_DIR/yt-cookies.txt`，不同網站分開貼會合併，`yt_` 開頭的函式）；貼上的分享文字會自動挑出網址（`dl_pick`）；小紅書、B 站、抖音的短網址先自己轉址、換成標準網址（`yt_fix`）
- 機場起降（`fly_` 開頭的函式在 fly.py、網頁的 `FLY` 那段在 web/fly.js）：工具分頁最上面「機場起降」，打開一頁翻牌看板＋雷達；主要主機抓 adsb.fi（失敗換 adsb.lol、airplanes.live）的飛機位置，再用 OpenSky 補愛好者收不到的（南台灣；不登入每天 400 次，同一個機場 30 秒問一次，`fly_sky`）；沒有航線時飛機算到最近的機場（`fly_closest`），航線在背景問 adsb.lol，同一個機場 8 秒內不重抓；只開放台灣四個機場 `FLY_PIN`（使用者說國外的抓不準，`fly_api` 會把其他代碼換成桃園）；`data/airports.tsv`（airportsdata，MIT）和 `FLY_APS` 中文名稱留著給航線地名用；測試用 SENTINEL_FLY_API（網址裡放 {lat}{lon}{d}）、SENTINEL_FLY_ROUTE、SENTINEL_FLY_ROUTE2、SENTINEL_FLY_SKY 換成假的；航線 adsb.lol 查不到再一班一班問 adsbdb；桃園、松山、台中、高雄另外抓機場官網的航班表（`fly_fids_` 開頭，背景每分鐘一次），抵達／出發改照官網的表定時間、登機門、狀態，收得到訊號的班機再配上即時位置（`fly_merge`）；每架飛機標用途 `use`（`fly_use`：客機、貨機、私人／公務機、直升機、軍機、公務飛機、小飛機；客貨都飛的公司照 `FLY_FREIGHT` 機型分，官網表上有的一定是客機；是貨機時型號改寫貨機版本，例如 747-400F、777F，`fly_cargo_model`／`FLY_CARGO_M`），貨機不列在看板、只畫在雷達（放 `rest`）；查不到航線但很確定快落地／剛起飛的，先寫這個機場那一頭（`guess`，網頁寫「可能是」）；離機場 60 公里內、對著機場下降（1.5 萬呎以下）或背著機場爬升的，不管查到的航線一律算抵達／出發（`land`／`lift`，查到的常是多段航線的別段，同一個班號飛好幾段很常見：降落的出發地寫那段的終點、標「可能是」）；官網表跨半夜時預計時間少一天的補回來（`fly_fids_pull`）；同一班號今天、明天都在表上時，天上那架只配給時間最接近的一筆（`fly_merge` 的 `pick`），出發班機配到已在天上的飛機就寫「已飛」；同一班號降落後接著飛下一段時，正在降落的不配給出發、正在起飛的不配給抵達（`plane`）；官網寫已飛但排隊很久才剛起飛的，看板上留 90 分鐘；表上沒有的飛機和貨機（`fly_cargo`）不列，地面只留表上有的（`fly_gnd`）；雷達整個畫在一張畫布上（`radarView`，小雷達和整頁雷達共用；以前一架一個元素在高雄、台中縮放會卡），小雷達照飛機在畫面上移動的快慢決定多久重畫（移不到一點不重畫，最慢 4 張／秒，等的時候用 setTimeout 不佔每一格畫面），掃描光是 CSS 轉動的 `.rsweep`，看板切換時雷達先少畫（`FLYHUSH`）；看板只翻畫面上看得到的列；官網表照「幾點」分時段看（`flyHours`、`FLYHR`），換分頁／時段是整塊淡出淡入（`flySwitch`：看板淡出、看不到時一次換好（`flyRv` 不跑收起動畫）再淡入；按鈕那幾排切換後還在就不動（使用者說按鈕不該閃），只有要消失、出現或時段真的變了才淡出淡入；只有班數變就只換數字，雷達只跟著總高度滑一次；手機量高度前加 `.cvx` 讓列先排版）；點時段不置中，只在被切掉時捲那一排（`flyNudge`）；電腦上時段、航廈那一排可以用滑鼠拖、滾輪左右捲（捲到頭才捲整頁，拖完放開不算點）；換機場時舊的列淡完才換上新的，等超過 T.long 才縮小、出現載入圖形（`flyShow` 的最短等待），不一格一格翻，資料剛到也是先換好字再淡入（`flyWait`／`flyShow`）；雷達底圖 `?geo=` 回傳換算成公里的陸地（`data/coast.tsv` 由 Natural Earth land 產生：`t` 台灣本島＋離島整座給、`f` 附近其他陸地 `far` 畫淡一點，不切方框所以拉遠沒有假的直線）、`FLY_TOWNS` 地名、`FLY_FAR` 附近其他地方（lv 0，字淡）和放大才出現的 `FLY_TOWNS2` 鄉鎮、附近機場 `aps` 和跑道（`fly_geo`），60／30／15 公里縮放（`FLYS.zm`、`flyZoom`），航班代號擠在一起時換邊或先藏起來（`flyPlace`）；跑道 `FLY_RWY`（大約位置）；點小雷達打開整頁雷達（`frad` 開頭：手指／滾輪縮放 3～140 公里、拖曳、點兩下回機場、點飛機看小卡、篩選、畫面裡的飛機清單）；雷達上的飛機照機型畫（`fly_kind`→`kind`：q4 四發、wb 雙發廣體、nb 窄體、tp 螺旋槳、ga 小飛機、heli 直升機，app.js 的 `FLYSH`）；航空公司標誌先抓 Google Flights 的 gstatic（`flyLogo`，只有標誌不含字、不放進專案，主機存一份），Google 給灰色假圖的換 Kiwi、再換 avs.io（`FLY_LGSRC`、假圖 `FLY_LGFAKE0`／`fly_lg_fake`）；`FLY_ALS` 背景先抓，看板上新出現的航空公司才抓（`fly_logo_new`，不讓人亂問），網頁只對 `als`（主機有真標誌的 `FLY_LGOK`）要圖，網址帶 `lgv`（版本，換版本瀏覽器就重拿），其他顯示代碼小方塊；翻牌的 W、M 比格子寬，壓窄塞進去（`FLYNAR`）；桃園官網地名後面的「(DXB)」拿掉；官網表第一次還沒抓到時 `fly_fids` 回 "wait"、看板回 `loading`（網頁轉圈、1.5 秒後再問，不先秀幾架再冒出一大堆），四個機場的官網表都在背景先抓、存在 `DATA_DIR/fids/`（重新啟動不用等）；台中官網常常連不上，抓到的表留 3 小時（`FLY_FIDS_KEEP`）；飛機資料庫的機型跟官網表不同類（例如 A340 對 A321）時照官網、不顯示註冊號（`fly_fix_type`，路過的飛機也拿四個機場的官網表 `fly_fids_find` 來對）；adsbdb 航線三個一起問，被擋或連不上就先停（`FLY_RTP`，越停越久），沒問成功的 5 分鐘後再問；呼號的班號會補 0（CI054），對官網表前要用 `fly_fn` 統一；看板時間改了只寫新時間（早到綠字、晚到橘字），登機門、機型改了只寫新的（橘字，原本的在小卡），共掛班號在航班翻牌最後一格疊「+N」（手機不放），抵達寫行李轉盤、出發寫報到櫃台（`fly_bx`→`bx`，桃園第 19／20 欄、高雄 BHSNo／ckinisland、松山 CheckInCount；台中沒有），小標籤最多一個，只放最要緊的（`flyTags`：緊急 → 改登機門 → 晚 N 分 → 換機型 → 軍機／少見 → N 分後），看板上面一行「接下來一小時」總結（`flySum`）；抵達／出發分頁裡已到／已飛的班機先收成最上面一行「已到 N 班 ▾」（`FLYDONE`、`.fdone`，點了展開），已到／已飛的不再標變更；展開時兩列兩列放出來（`flyDoneOpen`、`.fr.pend`），收起時一起淡出再收（`flyByeMany`）；只剩已到／已飛的班機時，展開、收起會跟「接下來沒有…」互換，改成整塊換（`flyDoneSwap`：舊的淡出、看板高度滑一次、新的淡入）；換機場等資料時「已飛 N 班」、提示字、總結也一起淡掉；手機上太長的航空公司名稱用台灣慣用簡稱（`FLYALS`／`flyAlShort`，沒有慣用的拿掉「航空」）；看板第三個分頁「機坪」、第四個「貨機」都分「降落／起飛」上下兩段、中間一條線（`flyGo`，每段第一列 `.fr.gh` 寫標題，不用箭頭）；貨機分頁列出要降落、在機坪、剛起飛的貨機（`out["cargo"]`）；「少見」機型照這個機場最近 30 天實際看到的天數算（3 天以下，`fly_rare`／`FLY["types"]` 存在 fly-seen.json），還沒記滿 7 天先用 `FLY_RARE`；順豐這類只有 FlightAware 有標誌的，`FLY_LGSRC` 最後一個用國際民航組織三碼 `{i}`（從 `FLY_AL` 反查）；桃園機場的客貨機定期班表（政府開放資料 `FLY_SCHED_URL`，一週抓一次存 `DATA_DIR/fids/tpe-cargo.json`，`fly_sched_` 開頭；開發機和 GitHub 都連不上，欄位照標題「班機性質／航空公司／班次」找，看不懂就不用），表上寫貨機的班次算貨機（`fly_cargo`），測試用 SENTINEL_TPE_SCHED；航空公司名稱一律照 `FLY_AL`（官網寫法不同的換掉；同品牌的子公司寫「國家＋品牌」，例如泰國亞洲航空、泰國越捷航空；三碼查不到的用「-」開頭）；ATR、Dash 8 這類沒有航班號的算客機（`FLY_RGN`）；國旗在地名前面、固定大小、沒有也留位置（`flyFlagAt`、`.flg.at`）；手機看板每列三欄對齊（grid-template-areas）；`data/airports.tsv` 第 8 欄是維基數據的中文城市名（`tools/airports_zh.py` 產生，`fly_city` 最後才用）；看板只有取消、轉降、緊急是紅框呼吸（`.fr.bad` 的 ::after，使用者說變更提醒太多會看不清楚，改門、延誤不框；`fly_gate_track` 記住原本的 `gate0`／`type0`，存在 fly-seen.json），框框全部對齊同一個節拍（`flyBeat`；手機上有閃框的列不暫停處理、捲進畫面時再對一次），已到／已飛的不閃；自動更新時照班機對列（`flyKeyed`：走掉的原地收起來、新來的長出來）；捲動看板時一列一列浮現（`flyObs`）；官網慢半拍時用雷達校正（`fly_merge`）：停在機場的抵達班機改「已到」、在跑道滑行的出發班機改「滑行中」，過了時間 5 分鐘還寫準時的改「還沒到／還沒飛」並標 `lag`（照現在的時間排 `at`、網頁算晚幾分），沒到、沒飛的留 90 分鐘；對不上表的即時飛機放在 `rest`，只畫在雷達上；右上角按鈕顯示現在的機場（小標誌＋地名 `FLYPLACE`），點了是四張大卡片（選好後等視窗關完才換看板，`FLYHOLD`），機場和航空公司標誌由主機抓好存在 `DATA_DIR/fly-logos/`（`/api/fly-logo?k=`、`fly_logo`，30 天重抓，背景先抓 `fly_logo_warm`；只給清單裡的，SVG 用 sandbox 不能跑程式），本身是方形色塊的航空公司標誌整格填滿（`flyFit`）；桃園有「全部／第一航廈／第二航廈」（`flyTerms`、`FLYS.term`）；同一排最前面「地點 ▾」（`flyWhere`、`FLYPLC`，換機場清掉）：上面搜尋航班號或地名，點地點只看那裡來／去的班機（同一國的放在一起、城市由北到南 `lat`，點國家 `@JP` 看整國，有好幾個城市的國家每次打開都先收起來、點國旗旁的箭頭 `fplx` 展開，`flyPlaces`／`flyPlIs`；關掉機場起降就回到全部；清單照地區分段 `FLYRG`：國內、東北亞、東南亞、南亞、中東、歐美、大洋洲、其他地區；中國大陸、香港、澳門放成一組「中國大陸・港澳」`@CN+`（`flyCg`），這一組用中國國旗，展開後香港、澳門的國旗放在縮排的位置（`.fplr.sub.sf`），名字跟大陸城市對齊；清單裡國旗抓不到也留位置）；地名前面有國旗（國內不放；`ccs` 機場代碼→國家，`/api/fly-logo?k=@JP` 由主機抓 flagcdn 存成 `flag-JP`）；機坪分「剛降落／準備起飛」兩段（`flyOut`）；一小時內的班機標「N 分後」；看板有幾班就幾列（不用空白列補滿），自動更新一律照班機對列；打開時是小雷達掃描、一架飛機沿進場線降落到跑道上的載入畫面（`flySplashOn`／`flySplashOff`，至少 T.long×2）；再打開時小飛機照樣飛一趟（使用者說要每次都看得到），有上次的資料就在後面直接排好（`FLYSTILL`，翻牌 `flapSet` 也不翻），飛完一塊一塊浮上來；很快又關掉時不能留下 `html.flyon`（會把後面的畫面整個藏起來，看起來像卡住）；換機場也一樣（`flySplashSwap`：舊的淡掉換成載入畫面，看板在後面換好、資料到了再多等一下，才一塊一塊浮上來）；雷達平常只寫航班號，高度、爬升／下降（整頁雷達再加速度）只給選到的和離機場 12 公里內的抵達／出發，機頭前面一分鐘後位置的短線只畫選到的；尾跡跟飛機同色、越舊越淡，路過的不畫，選到的才照高度上色（`--alt0`～`--alt3`）；整頁雷達的清單照離機場由近到遠、拉開只到三分之一高，跑道進場那頭畫虛線；現在用哪條跑道看機場附近低空飛機的方向，沒有就看風向（`flyRwy`、`FLYRWN`）；雷達下面寫跑道、風、能見度、天氣、溫度（`fly_wx`，美國航空氣象中心的 METAR，10 分鐘一次，`fly_metar` 整理，測試用 SENTINEL_FLY_METAR）和各類飛機架數；用不到的翻牌格不畫、狀態靠右；已到／已飛的列淡一點；測試用 SENTINEL_FIDS_TPE／KHH／RMQ／TSA
- 電腦（1280 寬以上）看板和雷達是同一張卡片：`.fleft` 用 display:contents，分頁、時段那幾排整排放上面，下面左看板右雷達（`.rin` 捲動時停在畫面上），切換時雷達跟著看板的位置滑（`flySwitch` 的 `wide`）；滑鼠指著看板某一班，雷達上那架亮起來，指著雷達上的飛機，看板那一列亮起來（`FLYHOV`、`.fr.hl`；雷達那邊光圈跟看板那一列一樣漸亮）；打開、換機場時一塊一塊浮上來用 `flyRise`（電腦上看板和雷達同一個節拍一起浮）；再打開時雷達也先用上次的資料畫好；雷達飛機淡入淡出用 `EASEF` 曲線；看板在抵達／出發時，雷達上其他飛機跟著看板淡入的同時變淡（`flyFocus`、`R.focus`、`o.dm`）；看板 `min-height:100%`，長高縮短時不會比雷達短
- 雷達底圖加料：山（`/api/fly-terrain` 給高度表，網頁 `flyTer` 做成西北打光的明暗圖、只畫在陸地上）、常走的進場／離場路線（主機 `fly_track` 記下 90 公里內 7000 公尺以下抵達／出發飛機飛過的 1 公里格子，每天淡一點，存 `DATA_DIR/fly-tracks.json`；`?trk=` 給網頁（濃淡 1～99）、10 分鐘問一次；網頁 `flyTrkLines` 柔化後只留夠常飛的、削成一格寬的中線再串成磨圓的細線，不畫整片（使用者說飛多了整片是霧））、導航台 `FLY_NAV`（OurAirports，整頁雷達放大才畫，機場裡的不畫）；地圖、山、路線先畫在另一張畫布（`R.bg`，視角或資料變了才重畫）再貼上；每架飛機都有機頭前的短線（整頁 1 分鐘、小雷達半分鐘，拉遠時有最長長度，路過的更短）；路過的整頁雷達放大到 30 公里內才寫名字；名字旁邊放不下時放遠一點、拉一條細線連回飛機（`flyPlace` 的大寫位置）；現在用的跑道畫延長線（平行跑道有抵達班機對準的都畫，公里數只寫一條），每 2 公里刻度、整頁每 5 公里寫數字，對準跑道的抵達班機（兩條跑道合在一起）照距離÷速度算幾分鐘後落地，在延長線旁編號 1、2、3（`R.fin` 每條跑道一筆、`R.seq` 號碼和分鐘，排隊降落）；快到機場（跑道頭 8 公里內慢慢拉、3 公里內完全）對準跑道的、在跑道上滑跑的飛機拉到跑道中線上、機頭轉成跑道方向，地面滑行的拉到 60 公尺內的滑行道上（`flyRws`、`flySnap`、`flyTaxi`，用 `data/apmap.tsv` 的位置；天上照雷達原本位置）；停著的飛機機頭朝最近的航廈（`flyPark`）；整頁雷達點機場放大到整個機場（`fradAp`，最近 0.6 公里），半徑 5 公里內算「機場裡面」（`apv`）：地上的飛機寫班號＋登機門／狀態（`o.gtx`）、框起來、背景 250 公尺格線（`apk`），飛機照真的翼展大小畫（`FLYWS`）；跑道灰色、放大後中間一條虛線，每架飛機外面一圈底色（在跑道、滑行道上也分得出來），清單多一段「機坪」；常走路線有開關（只在整頁雷達右上角圖層鈕，`FLYTRKON`／`flyTrkSet`，記在瀏覽器 `vs-flytrk`，慢慢出現消失）；整頁雷達「畫面裡 N 架」照起降先後分「降落／起飛／剛降落／路過」四段（`fradList`：降落只放還在天上的，緊急優先、再照雷達延長線上的排隊號碼 `R.seq`（清單上同一個號碼、同一個分鐘數）、再照幾分後到；起飛是在跑道上、滑行中（機坪上要飛走的）、剛起飛；已落地的放「剛降落」；路過由近到遠），標題後面寫下一班幾分後降落，每列有航空公司標誌（右下角點是抵達／出發／路過）、機型・高度・速度，右邊寫幾分後降落（出發寫狀態）和離機場幾公里；雷達下面第一個寫「下一班 … 約 N 分鐘後降落」；點「接下來一小時」跳到抵達（在出發就留在出發）的第一個時段；小雷達不在畫面上、或手指在捲動時先不畫（`R.inv`、`scrolling()`）
- 飛機照片、盤旋：班機細節和整頁雷達的小卡最上面放 Planespotters 的照片（`fly_photo`，`/api/flights?photo=註冊號&hex=`，找到存 14 天、沒有存 3 天，`DATA_DIR/fly-photos.json`；網頁 `flyPhoto`，寫「攝影：某某」、點了打開原頁，測試用 SENTINEL_FLY_PHOTO）；主機記每架飛機的航向，8 分鐘內往同一邊轉 300 度以上算盤旋（`fly_hold`、`FLY_HOLD`，轉完留 3 分鐘），`hold` 給網頁：抵達的狀態寫「盤旋等待」、雷達名字下面寫「盤旋」、整頁清單右邊寫「盤旋中」
- 機場動畫省力：雷達飛機照兩頭的航向走弧線（`R.at` Hermite 曲線、`R.vel`），機頭跟著轉（`R.hd`）；航班名字換邊時滑過去、淡入淡出（`o.lo`／`o.la`、`R.lbusy`）；掃描光 `.rsweep` 每秒 20 下（steps），小雷達看不到或被整頁雷達蓋住時停（`.rbox.off`、`R.hide`）；看板同一班的時間、狀態、登機門、機型變了整列亮一下（`.fr.chg`）；分頁班數換數字時滑進來
- 機場起降背景更新與 OpenSky：有人用過機場起降（7 天內），主機就在背景每 30 秒抓四個機場（`fly_loop`，`SENTINEL_FLY_BG`；被監看的主機不抓）；班機收到過的註冊號、機型記在 `FLY["seen"]`（存 `DATA_DIR/fly-seen.json`，6 小時），停好關掉訊號後細節頁照樣有，並寫幾點之後收不到；OpenSky 非必要不問（`fly_sky_need`：有人正在看這個機場、官網表上快落地／剛起飛的班機比愛好者收得到的多才問），間隔照今天剩下的次數分（`fly_sky_gap`），用完時看板 `skyout` 在雷達下面寫幾點恢復；設定 → OpenSky 帳號（`/api/opensky`、`sky_conf`，設定檔 `OPENSKY_ID`／`OPENSKY_SECRET`，可直接選 credentials.json），用 OAuth 換通行證（`fly_sky_tok`，測試用 SENTINEL_SKY_AUTH）；看板航空公司標誌是自己一欄（`fal`，手機固定在每列最左邊）；只有飛機編號的（OpenSky）用 tar1090-db 分檔查註冊號、機型（`fly_tdb`，存在 `DATA_DIR/aircraft-db/` 一週，測試用 SENTINEL_FLY_TDB；hexdb.io 資料過時，不要用）；地名一律中文：`FLY_ZH` 常飛機場表＋桃園、松山官網學到的 `FLY["zh"]`（`fly_city`、`fly_learn`，存在 fly-seen.json）
- 機場起降分享（`share_` 開頭的函式在 fly.py、web/fly.js 的 `SHARE`、`flyShare`）：「分享」先跳出視窗選給誰、能看多久（`SHARE_TIMES`：1 小時～7 天）、幾支手機（`SHARE_DEVS`：1／3／不限）、四個機場或只看目前這個（`ap`，`/api/flights` 會把機場換成它，朋友那邊不能換機場 `SHAREAP`），選過的記在瀏覽器；同一個視窗下面列出還沒過期的分享（`op:list`，打開過幾支）、可以提前收回（`op:del`）；產生 `/s/八碼` 連結（內部代碼是 `fs_八碼`；舊的 `/fly#s=fs_…` 照樣能用；預設時間 `SENTINEL_SHARE_SECS`），這兩個網址給 `share_page()`：標題「機場起降」、沒有哨兵的開場畫面和圖示，直接進機場起降，存雜湊在 `DATA_DIR/fly-share.json`（舊版 `dev` 是字串，`share_fix` 換成清單）；打開的裝置用 `/api/fly-claim` 拿到自己的通行碼（存在那台的瀏覽器），名額用完就只認這幾支；`X-Share: 代碼:通行碼` 只能讀 `/api/flights`
- 其他主機的狀態（`peer_get`／`PEER_CACHE`）：網頁 `/api/all` 直接拿存著的，超過 2 秒才在背景重問，同一台同時只問一次；連不上的越隔越久（最多 10 秒）才再問；通知那邊（`alert_loop`）用 `all_status(fresh=True)` 等最新的
- 網頁 `/` 帶 ETag（`page_tag`），沒改就回 304，瀏覽器用存的那份；Caddy 壓縮時加的 `-gzip` 會先拿掉再比
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

## 網頁的設計規則（不能破壞）

- **完整的美術設計規範在 `DESIGN.md`**（顏色、文字、圓角、間距、陰影、圖示、控制項、動畫、深淺模式），改網頁前先看。
- **共用設計規則**都在 `web/style.css` 開頭的 `:root`：
  - 圓角：`--r-xs/sm/md/lg/xl/2xl/pill`
  - 字級：`--fs-xs` 到 `--fs-4xl`
  - 動畫時間：`--t-fast/mid/slow/long`
  - 曲線：`--ease/--dec/--exit`；彈簧（Google 官方數值，時間和曲線一起）：`--sp-fast/--sp/--sp-slow`
  - 陰影：`--sh-1/2/3`
  - 疊放順序：`--z-bar/det/ptr/fade/veil/toast/menu`
  - 顏色全部從主題色 `--seed` 算出來（`--bg`、`--s1`～`--s4`、`--p`、`--pc`、狀態色 `--warnc/--badc`…），深淺模式在 `[data-mode]` 換值

  不要寫死 px 圓角、px 字級、cubic-bezier、linear()、毫秒數、z-index 或顏色（顏色只能寫在 `--變數:` 和 `.ico.名稱` 裡，白色、黑色例外）。
- **圖示顏色**（`python3 tools/style_check.py` 會檢查圓形圖示有沒有用規定的顏色）：
  - 圓形圖示：**每個概念一個自己的色相，不能重複**（檢查會擋下兩個概念共用顏色）。資料（處理器藍、記憶體紫、磁碟橘、負載綠、下載青、上傳粉紅、流量黃、容器靛、概況灰）；功能各自一色（通知桃紅、備份焦糖、手機金鑰青綠、雲端硬碟湖水藍、PIN 碼紫羅蘭、配對萊姆、換密碼石板藍、國旗翡翠、天氣夕陽、心情小語海藍、防回收琥珀、遠端下載黃綠、機場起降藍紫）。新增圖示時挑一個還沒用過的色相，照 `oklch(var(--tl) var(--tc) 色相)` 的寫法加一個 `.ico.名稱`；主題色 `theme` 只給哨兵本身的動作（更新、編輯）。
  - 確認視窗的圖示和確定鈕看「動作」：一般用主題色；要小心的（重新開機、換密碼）用 `warn` 橘色；刪除、移除、解除配對用 `bad` 紅色（`modal({cls:"bad"})` 會連確定鈕一起變紅）。
  - 線條圖示：一般灰色；連結和重點用 `var(--p)`；選單裡有風險的項目，圖示和文字一起變色。
  - 綠／橘／紅的文字、圓點、線條圖示只用來表示狀態（正常／注意／異常）或有風險的動作，不拿來裝飾（開關打開用主題色）。
  - 進度條（波浪條）平常用主題色，75% 變橘、90% 變紅；不用資料色（磁碟橘、負載綠會跟狀態色搞混）。
- JS 動畫時間用 `T.fast/T.mid/T.slow`，曲線用 `EASE/EXIT`；彈簧用 `T.spf`＋`SPRING_F`、`T.sp`＋`SPRING`。
- **對齊**：清單、看板同一種資料每一列都要在同一條線上（規則在 `DESIGN.md` 第 5 節「對齊」，使用者要求必須遵守）。
- **畫面更新**是比對差異（`data-key`／`data-keyed`／`data-x`／`data-keep`），不是整塊重畫。新增區塊要給 key，不然自動更新時會閃。切換（換分頁、換主機、換時段）的動畫還在跑時，自動更新要先等（主畫面 `settle()`／`uiBusy()`，機場看板 `FLYBZ`／`flyLater`），不然舊的還在收、新的長出來會疊在一起。
- 四個分頁（首頁、工具、紀錄、設定）：手機下面是浮起來的分頁列、點主機卡片長大成整頁；電腦左邊是直的分頁列、主機一排放得下就每台一欄並排，比較多就變成小卡片。

## 使用者明確要求過的事（不要改回去）

- 「檢查更新」按鈕（系統更新，在設定 → 主機）的文字固定不變，只有左邊的說明文字會變。
- 不要眼睛圖示：IP 是霧化的，點一下顯示。
- 主機沒有 IPv6 時，整行都不顯示。
- 「全部更新」只跳出一則通知。
- 不要「運作正常」這種多餘的狀態字。
- Telegram 兩台主機都要通知；舊訊息會依設定的保留時間自動刪除。
- 每一則 Telegram 通知開頭都要有狀態符號（✅ ❌ 🔴 🟠 🔄 🔑 🔐 🔌 ℹ️ 這類，不是笑臉）。新增通知時，要在 `ev_line()` 給它合適的符號，並加進 `tests/test_tg_icons.py`。
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
