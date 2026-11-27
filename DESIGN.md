# 哨站：美術設計規範

網頁的長相都照這份規範。所有數值都寫在 `web/style.css` 最前面的 `:root` 和 `[data-mode]` 兩段，元件只能用這些變數，不能另外寫死。
`python3 tools/style_check.py` 會自動檢查大部分規則（每次推上 GitHub 也會跑）。

相簿分享給朋友看的那一頁（`web/album.css`）有自己的品牌和配色（使用者要求），不照這份。

---

## 0. 設計理念：三個平台各照 Telegram 自己的原生版本

**不再用同一套介面套所有平台。** iPhone、iPad 看到的是 Telegram iOS 的樣子和手感，安卓看到 Telegram Android 的，電腦看到 Telegram Desktop 的。
`<html data-plat="ios|android|desktop">` 決定平台；設定 → 外觀 →「介面」可以選「自動、iOS、Android、電腦」（記在瀏覽器的 `vps-prefs.plat`），自動是照裝置判斷（`platOf`）。
`index.html` 開頭有一份一樣的判斷，畫面出來前就套好，不會先閃一下別的平台。

**平台和螢幕寬度分開管**：平台決定長相和操作（標題列、分頁列、選單、對話框、按下去的回饋、換頁動畫）；寬度決定幾欄（1024 以上左中右三欄，以下一層一層）。所以 iPad 是 iOS 的長相配三欄、電腦視窗拉窄還是電腦的長相。

| | iOS（Telegram-iOS） | Android（Telegram for Android） | 電腦（Telegram Desktop） |
|---|---|---|---|
| 最上層的導覽 | 下面一整條分頁列：主機、紀錄、設定 | 下面浮起來的膠囊分頁：主機、紀錄、設定；右下新增圓鈕 | 左上 ☰ 從左邊滑出主選單；沒有分頁、沒有圓鈕 |
| 標題列 | 44 高、毛玻璃、標題置中 17 粗，左邊「‹ 上一層的名字」、頭像在右邊 | 56 高、標題靠左 20，左邊 ←、頭像在標題前面，右邊搜尋、⋮ | 跟 Android 一樣靠左，沒有返回 |
| 搜尋 | 清單最上面的灰色搜尋框，打字時右邊出現「取消」 | 標題列的放大鏡，點了整條換成搜尋框 | 左上 ☰ 旁邊一直開著的搜尋框 |
| 清單一列 | 76 高、頭像 60、名字 16 粗 | 70 高、頭像 54、名字 17 | 62 高、頭像 46、名字 13 粗 |
| 設定、主機資訊 | 灰底上左右留 16 的圓角區塊（26），段落標題 13 灰字在區塊外 | 整片白色段落、中間灰帶，段落標題主題色 | 設定是蓋在視窗中間的一層（寬 392）；主機資訊在右欄 |
| 按下去 | 底色變深（灰），沒有水波紋；按鈕變淡 | 水波紋 | 水波紋（.65 秒長、.2 秒淡） |
| 換頁 | 新的一層從右邊整頁滑進來、底下往左退 30% | 新的一層從右邊 48 淡入（.15 秒），底下不動 | 新的一層從右邊滑進來、底下退 20%（窄視窗時） |
| 選單 | 玻璃、圓角 26、項目 44 高 17 字、圖示在右邊 | 圓角 28、項目 48 高 16 字、圖示在左邊 | 圓角 8、項目 34 高 |
| 確認視窗 | 寬 270、圓角 14、字置中、按鈕整排在下面 | 靠左、標題 20、按鈕是右下的主題色字 | 寬 320、圓角 8、標題 16 粗靠左、按鈕是右下的主題色字 |
| 開關 | 51×31、開的時候綠色（Telegram iOS 的開關顏色） | 細軌道＋圓，主題色 | 細軌道＋圓，主題色 |

只有真的不一樣的地方才分平台寫，其他（顏色角色、字級變數、圖示、對齊、差異更新）三個平台共用。

共用的做法（三個平台都一樣）：
1. **內容是實色，浮起來的才透明。** 只有選單、通知、iOS 的標題列和分頁列（它們真的蓋在內容上面）用毛玻璃。
2. **一份清單就是一塊。** 同一組的列放在同一塊裡，列跟列之間一條細線，線從文字開頭畫起。
3. **選到的東西要一眼看到。**
4. **按下去馬上有反應**（每個平台用它自己的方式，見上表）。
5. **動畫說明發生了什麼**，不做一張一張卡片排隊進場這種裝飾。

不要做的（看起來像通用範本）：每塊都是一樣的卡片加同一種灰陰影、背景漂浮光球、漸層當裝飾、每個標題上面一行全大寫小字、每塊捲進來就往上淡入。

---

## 0-1. 空間組織與資訊架構

不是「後台 Dashboard」，是照 Telegram 的空間組織：**主機就像聊天對象**。下面寫的是寬螢幕（三欄）的排法；各平台的差異見第 0 節的表和第 15 節。

| 位置 | 放什麼 | 對應 Telegram |
|---|---|---|
| 左欄（電腦 `--lw`，320～420） | 左上選單鈕＋搜尋；「全部／有狀況」分頁；清單：全部主機（置頂）、機場起降、還沒設定的提醒、每一台主機；右下新增主機圓鈕 | 聊天清單、資料夾分頁、新增聊天的圓鈕 |
| 中間 | 選到的那一個：「全部主機」是重點數字＋所有主機的紀錄（泡泡、日期膠囊、置頂狀況條）；一台主機是即時數字、圖表、這台的紀錄 | 聊天內容、置頂訊息條、日期提示 |
| 右欄（電腦 `--rw`，340～424） | 主機資訊：大頭像、狀態、快捷鍵（雲端硬碟、下載、編輯、重開機），工具、規格、容器與服務、最吃資源的程式、維護、常用連結、移除 | 個人資料面板 |
| 設定 | 左上選單打開，電腦蓋在左欄上面一層、手機推進來一層 | 設定在左欄裡一層一層 |

- 原本的「工具」分頁拆進每台的主機資訊（工具本來就是一台一台的）；「紀錄」就是「全部主機」那一頁；機場起降是清單裡的一列，打開時蓋在中間。
- 每一列的寫法跟聊天清單一樣：54 圓頭像（國旗，或名字第一個字配七種漸層色）＋右下狀態點、名字、右上即時網速、下面一行狀態（有狀況寫那件事，沒有就寫三個數字）、右下數字小圓（幾件事要留意）。
- 選到的那一列整列 `--pf` 白字。

### 手機：一層一層

- iOS、Android：最底層是三個分頁之一（主機、紀錄、設定，`STK[0]`），在分頁上點主機推進一層、點頭像再推進一層；分頁列只在最底層出現（推進時跟著底下那層一起退走，跟 Telegram 一樣）。離開「主機」分頁時多記一筆瀏覽紀錄（`tabGo`），在別的分頁按返回或從左邊滑先回「主機」、不會離開網站（Telegram Android MainTabsActivity.onBackPressed 也是先回第一個分頁）；再點一次同一個分頁捲回最上面。選單開著時點分頁列，選單先關、直接換過去。
- 電腦（窄視窗）：清單 → 全部主機／一台主機 → 主機資訊；設定也是一層（從 ☰ 主選單進去）。
- 返回鍵、瀏覽器上一頁、往右滑都退一層，往右滑時畫面跟著手指走，底下那層真的畫好在後面（各平台底下那層退多少見第 0 節）。

### 1280 以下

右欄不擠中間，改成從右邊滑出來蓋在內容上（telegram-tt 1276 以下也是疊上去），預設關著。

### 寬螢幕的平台差異

- 電腦：設定是蓋在整個視窗中間的一層（`.slayer`，Telegram Desktop 的 Info::LayerWidget），點旁邊、×、Esc、瀏覽器上一頁都會關；☰ 主選單從左邊滑出來（`.mdrw`）。
- iOS（iPad）、Android（平板）：左欄下面有分頁列，「設定」換掉左欄、「紀錄」把中間換成全部主機。

---

## 1. 設計變數一覽

| 種類 | 變數 |
|---|---|
| 顏色 | `--bg` `--s1`～`--s4` `--tx` `--tx2` `--tx3` `--line` `--div` `--hov` `--act` `--rip` `--p` `--pf` `--on-p` `--p-sh` `--pc` `--on-pc` `--sc` `--tc-bg` `--ok` `--warn` `--bad`（和各自的 `c`／`on-` 版本）`--inv` `--menu-bg` `--scrim` `--in-b` |
| 圓角 | `--r-xs` `--r-sm` `--r-md` `--r-lg` `--r-xl` `--r-2xl` `--r-pill` |
| 字級 | `--fs-xs` `--fs-s` `--fs-m` `--fs-l` `--fs-xl` `--fs-2xl` `--fs-3xl` `--fs-4xl` `--fs-input` |
| 時間 | `--t-fast` `--t-mid` `--t-slow` `--t-long`（JS：`T.fast` `T.mid` `T.slow` `T.long`） |
| 曲線 | `--ease` `--dec` `--std` `--exit`（JS：`EASE` `DEC` `STD` `EXIT`）；彈簧 `--sp-fast` `--sp` `--sp-slow`（JS：`SPRING_F` `SPRING`） |
| 陰影 | `--sh-1` `--sh-2` `--sh-3`；卡片用 `--cs`、浮起來的用 `--sh-float` |
| 模糊 | `--blur-bar` `--blur-menu` `--blur-toast` |
| 疊放順序 | `--z-bar` `--z-det` `--z-fade` `--z-veil` `--z-toast` `--z-menu` |

舊的 `--glass`、`--glass-card`、`--glass-modal`、`--glass-sub`、`--glass-b`、`--hl`、`--pill-bg`、`--pill-sh` 還在（機場頁很多地方用到），但已經換成實色或透明，不要再拿來做玻璃效果。

---

## 2. 色彩

`--seed` 是主題色（11 種＋彩虹），其他顏色在 `[data-mode="light"]`／`[data-mode="dark"]` 裡用 `color-mix` 算。底色會帶一點點主題色（`--vs` 控制多少，「素雅」幾乎沒有）。

| 角色 | 淺色 | 深色 | 用在 |
|---|---|---|---|
| `--bg` 底 | #F4F4F5 | #0F0F0F | 整頁背景 |
| `--s1` 面 | #FFFFFF | #212121 | 區段、卡片、左欄、分頁列、對話框 |
| `--s2` | #F4F4F5 | #2C2C2C | 對話框裡的小區塊、指著的底 |
| `--s3` | #E4E4E5 | #3B3B3D | 進度條軌道 |
| `--s4` | #C4C9CC | #5B5B5A | 開關關著的軌道、灰點 |
| `--tx` 主要字 | #000 | #FFF | |
| `--tx2` | #4C5155 | #CFCFCF | 說明字 |
| `--tx3` 次要字 | #686C72 | #AAAAAA | 小標題、時間、圖示 |
| `--line` 框線 | #DADCE0 | #303030 | 分頁列、左欄的邊、輸入框 |
| `--div` 分隔線 | #E7E7E7 | 白 7% | 清單列之間、表格列之間 |
| `--hov` 指著 | 次要字色 8% | 次要字色 8% | 列、按鈕指著的底 |
| `--act` 按下 | 次要字色 16% | 次要字色 16% | 選單項按下 |
| `--rip` 水波紋 | 黑 8% | 白 8% | 主要按鈕上固定黑 8% |
| `--p` 主題色（字） | 主題色調深一點 | 主題色調亮一點 | 連結、選到的分頁字、分頁底線、圖示 |
| `--pf` 主題色（底） | 跟 `--p` 一樣 | 主題色調深一點 | 上面有白字的底：主要按鈕、左欄選到的列、數字小標 |
| `--p-sh` | `--pf` 再深一點 | 同 | 主要按鈕指著 |
| `--pc`／`--on-pc` | 主題色 11% 淡底／深字 | 20% | 次要按鈕、選到的膠囊、圖示底 |
| `--inv` 通知 | rgba(32,32,32,.8) | rgba(0,0,0,.8) | 底部通知（深淺模式都是深的） |
| `--menu-bg` 選單 | 白 73% | #212121 87% | 選單、提示框（加 `--blur-menu`） |
| `--scrim` | 黑 25% | 黑 50% | 對話框後面那層 |

狀態色只用來表示狀態（正常／注意／異常）或有風險的動作，不拿來裝飾：

| | 淺色 | 深色 |
|---|---|---|
| `--ok` 正常 | #4FAE4E 加深到看得清楚 | #5CC85E |
| `--warn` 注意 | #FB8C00 加深到看得清楚 | #FB8C00 |
| `--bad` 異常 | #E53935 加深到看得清楚 | #FF595A |

深色模式的主題色要分兩個：字要夠亮才看得到（`--p`），但白字底下的主題色要夠深白字才看得清楚（`--pf`）。新增「主題色底＋白字」的元件一律用 `--pf`。

資料色：處理器 `--c-cpu`、記憶體 `--c-mem`、下載 `--c-rx`、上傳 `--c-tx`。進度條平常主題色，75% 變橘、90% 變紅。

---

## 3. 字體

- 字型：系統字（`-apple-system`、`Segoe UI`、`Roboto`…＋蘋方／Noto Sans TC／微軟正黑體），跟 Telegram 網頁版一樣用各平台自己的字。
- 粗細：共用元件只用 400 和 500（Telegram 的 `--font-weight-medium`）；平台介面照各自原生版本：iOS、電腦的標題和名字用 600（semibold），Android 用 500（Roboto Medium）。
- 不壓字距、不用全大寫小標。
- 數字一律等寬（`.num`、`font-variant-numeric:tabular-nums`）。

| 變數 | 大小 | 用在 |
|---|---|---|
| `--fs-xs` | 12 | 圖表刻度、小標籤 |
| `--fs-s` | 13 | 膠囊、表頭、時間 |
| `--fs-m` | 14 | 內文、清單第二行、小標題 |
| `--fs-l` | 16 | 清單標題、卡片名稱、對話框說明 |
| `--fs-xl` | 20 | 對話框標題、卡片大數字 |
| `--fs-2xl` | 24 | 頁面標題（手機、電腦）、摘要數字 |
| `--fs-3xl` | 28 | 主機頁名稱、四格數字 |
| `--fs-4xl` | 32 | 少數特大數字 |
| `--fs-input` | 16 | 手機輸入框最小字級（避免 iPhone 自己放大） |
| `--fs-2xs` | 10 | iOS 分頁列的字 |
| `--fs-m2` | 15 | iOS 清單第二行、Android 段落標題 |
| `--fs-l2` | 17 | iOS 標題、設定列；Android 清單名字 |
| `--fs-l3` | 18 | Android 主機頁標題、搜尋框 |

---

## 4. 間距

- 手機頁面左右 18px；清單列左右 16px；區段之間 10～14px。
- 電腦主畫面四周 20／32px；區段之間 16px（`--gut`）。
- 小標題 `.lbl`：上 20、下 8，往內縮 16px，跟清單的字對齊。
- 清單列最少 56 高（有兩行字時自然長高）；左欄、選單項目 44 高（滑鼠的選單 36 高）。
- 圖示和文字之間 16px（清單）、20px（選單）。

---

## 5. 對齊（使用者要求，必須遵守）

- 清單、看板同一種資料每一列都要在同一條線上：主機總表 `.htab`、事件表 `.ltab`、最吃資源的程式 `.pr`、這台主機規格 `.spl`、機場看板 `.board` 都用固定欄寬的 `grid`。
- 長名稱用 `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` 截斷，不能把右邊的數字擠歪。
- 清單分隔線從文字開頭畫起：有圖示的列從 70px 開始（16 內距＋38 圖示＋16 間距），事件從 62px。
- IP 霧化（`.ipb`）只對文字加 `filter:blur(6px)`，不加底色框。

---

## 6. 圓角

| 變數 | 大小 | 用在 |
|---|---|---|
| `--r-xs` | 6 | 國旗、分頁底線上緣 |
| `--r-sm` | 10 | 圖示方塊 `.ico` |
| `--r-md` | 12 | 左欄列、選單項目、設定分類 |
| `--r-lg` | 16 | 選單、通知、輸入框、對話框裡的小區塊、小一號的卡片 |
| `--r-xl` | 24 | 區段、卡片、清單、表格（最外層的內容） |
| `--r-2xl` | 32 | 對話框、登入卡 |
| `--r-pill` | 999 | 按鈕、膠囊、開關 |
| `--r-btn` | 4 | 電腦（tdesktop）按鈕 |
| `--r-box` | 8 | 電腦的對話框、選單、設定那一層；Android 設定圖示 |
| `--r-ico` | 7 | iOS 設定圖示 |
| `--r-alert` | 14 | iOS 確認視窗 |
| `--r-glass` | 26 | iOS 設定區塊、選單、面板 |
| `--r-and` | 28 | Android 選單 |

層級越外面圓角越大；同一塊裡面的東西用小一號，不要全部同一個圓角。

---

## 7. 空間層次

| 層 | 長相 |
|---|---|
| 0 底 | `--bg` |
| 1 內容 | `--s1` 實色＋`--cs`（淺色：0 1px 4px 黑 5%；深色：不用陰影，靠底和面的明暗分開） |
| 2 浮起來 | 選單、提示框：`--menu-bg`＋模糊 10px＋`--sh-float`；通知：`--inv`＋模糊 8px |
| 3 對話框 | `--s1` 實色＋`--sh-float`，後面 `--scrim` |

有狀況的卡片不加粗框，改在陰影上疊一圈 1px 的狀態色細線（`inset 0 0 0 1px`）；主機表格那一列左邊一條 3px 狀態色。

---

## 8. 圖示

- 線條圖示 24 格、2px 線、圓頭（`app.js` 的 `P`）。
- 一般灰（`--tx3`）；選到的、連結用主題色；選單裡有風險的項目，圖示和字一起變橘或紅。
- 圓角方形圖示 `.ico`（38px、`--r-sm`）只用三種主題色角色：`--pc`、`--sc`、`--tc-bg`；警告、異常用 `--warnc`、`--badc`。每個概念的圖案不能跟別的重複（`ICO`，檢查會擋）。
- 確認視窗的圖示和確定鈕看動作：一般主題色；要小心的（重新開機、換密碼）`warn`；刪除、移除、解除配對 `bad`。

---

## 9. 動畫規範（含按鈕動畫）

### 時間與曲線

| 變數 | 值 | 用在 |
|---|---|---|
| `--t-fast`／`T.fast` | .15 秒 | 淡入淡出、選單、對話框、通知、顏色變化 |
| `--t-mid`／`T.mid` | .3 秒 | 換分頁、分頁底線、左欄選到的那塊滑過去 |
| `--t-slow`／`T.slow` | .45 秒 | 手機水波紋 |
| `--t-long`／`T.long` | .65 秒 | 電腦水波紋、長距離 |
| `--ease`／`EASE` | cubic-bezier(.25,1,.5,1) | 換頁、滑動（快出慢停，不回彈） |
| `--dec`／`DEC` | cubic-bezier(.33,1,.68,1) | 整頁疊上來、手機面板滑上來 |
| `--std`／`STD` | cubic-bezier(.4,0,.2,1) | 選單、對話框、通知、水波紋 |
| `--exit`／`EXIT` | cubic-bezier(.42,0,1,1) | 收起來（先慢後快離開） |
| 彈簧 `--sp*`／`SPRING*` | | 只給「被推動」的東西：進度條、儀表指針、拖曳放手彈回 |

### 每一種動畫

- **按下**：水波紋從手指位置長出來（電腦從 0、手機從 .27 倍開始），按住就停著；放開後至少長到一半才淡掉。列、按鈕不縮小。選單項目按下縮成 .98。
- **分頁**：選到的字變主題色，底下 3px 的線用 `--ease` 滑過去（`slideSel` + `data-slide=".tbu"`）。連按好幾下從目前位置轉向，不會疊兩條。
- **左欄、設定分類**：選到的那塊用同一條曲線滑過去。
- **換頁**：手機整頁往那一邊滑；電腦舊的淡出，新的從那一邊移 24px、同時淡入。
- **選單**：從按鈕那一角 .85 倍放大＋淡入（.15 秒）；收起來反過來，用 `--exit`。
- **對話框**：從上面 16px 落下＋淡入；關掉往下 16px 淡出。手機要填東西的視窗從下面滑上來。
- **通知**：往上 8px＋淡入，關掉只淡出。
- **進場**：整頁一起出來，不讓卡片一張一張排隊。
- **自動更新**：比對差異（`data-key`），不重畫、不重播進場動畫；切換動畫還在跑時先等。

### 按鈕動畫（使用者要求）

- 選到的底色是按鈕裡的 `::before` 原地淡入，字色用 `--tsel` 在一半時換；不准用 JS 疊一塊再拿掉。
- 漸層不能直接切換。
- 會滑過去的指示器（`.slide`）只給單選的那一排（分頁、左欄、設定分類、選主機、時間範圍）。

### 少動畫

設定裡關掉動畫（`data-motion="off"`）或系統要求減少動態（`prefers-reduced-motion`）時，所有動畫和水波紋都不跑，狀態直接換好。系統要求減少透明（`prefers-reduced-transparency`）時，選單、通知改成實色。

---

## 10. 元件

| 元件 | 長相 |
|---|---|
| 區段 `.group` | `--s1`、`--r-xl`、`--cs`，裡面的列沒有自己的底，列跟列之間 `--div` 細線 |
| 清單列 `.li` | 56 高、左右 16、圖示和字 16 間距；標題 `--fs-l`、第二行 `--fs-m` `--tx3`；右邊箭頭 `--s4` |
| 主要按鈕 `.ubtn` | 40 高（`.sm` 36）、膠囊、主題色底白字、500；指著變 `--p-sh` |
| 次要按鈕 `.ubtn.ghost` | `--pc` 淡底、`--on-pc` 字；在對話框裡是沒有底的主題色字 |
| 圓形按鈕 `.icbtn` 44／`.iconbtn` 40 | 指著 `--hov` |
| 輸入框 `.field` | 48 高、`--r-lg`、1px `--in-b` 框；指著框變主題色、輸入時 2px 主題色 |
| 開關 `.tog` | 細軌道 34×14、圓 18 加 2px 邊；關的時候灰、開的時候主題色 |
| 勾選 `.remember input` | 20 方、2px 框、`--r-xs` |
| 單選一排 `.seg`／`.rng` | 淡灰軌道，選到的 `--pc` 淡底、`--on-pc` 字 |
| 標題列 `.tbar` | 56 高、`--s1`、底下一條 `--line`；左邊返回或頭像，中間標題 16/500＋一行小字，右邊圖示鈕 |
| 清單列 `.crow` | 72 高、左右 9 內距、`--r-md`；頭像 `.cav` 54＋狀態點 `.cdot` 14；選到的 `--pf` 白字 |
| 數字小圓 `.cbg` | 22 高膠囊、14/500；異常紅、注意橘、選到的列反白（telegram-tt ChatBadge） |
| 清單分頁 `.ltabs` | 字 `--tx3`，選到的主題色，底下 3px 線滑過去 |
| 搜尋 `.srch` | 40 高膠囊、`--hov` 底；輸入時白底＋2px 主題色框 |
| 新增圓鈕 `.fab` | 56 圓、`--pf`、`--sh-3`，左欄右下角 |
| 置頂狀況條 `.pinb` | 標題列下面一條，左邊 3px 狀態色，點了到那台 |
| 紀錄泡泡 `.eb` | 34 頭像＋白色泡泡（`--r-lg`，靠頭像那角小圓角）；名字主題色、圖示、內容、右下時間；異常、注意左邊一條狀態色；日期是置中膠囊、捲動時停在上面 |
| 重點數字 `.stat` | 一塊區段裡一排數字（不是一排卡片），上面一句問候 |
| 主機資訊 `.prof` | 112 大頭像、名字 20/500、地點、狀態；快捷鍵 `.qa` 60 高一排 |
| 右欄、設定的分段 | 白色區段，中間 10px 灰色帶（telegram-tt `side-panel-section`），段落標題主題色 16 |
| 左上選單 `.mmenu` | 設定、機場起降、新增主機、夜間模式（右邊開關）、重新整理，最下面寫版本 |
| 選單 `.lmenu` | `--menu-bg`＋模糊、`--r-lg`、上下 4 內距；項目左右縮 4、`--r-md`、`--fs-m` 500 |
| 對話框 `.dialog` | `--s1`、`--r-2xl`、24 內距；標題 `--fs-xl` 500、說明 `--fs-l` `--tx3`；按鈕靠右 |
| 通知 `.toast` | `--inv`＋模糊、`--r-lg`、白字 |
| 表格 `.htab`／`.ltab` | 一塊區段，表頭 `--tx3` `--fs-s`、列之間 `--div`；指著 `--hov`、按下 `--act` |
| 載入 | 細圈轉動（`.spin`、啟動畫面 `.sp-blob`）；工具裡的長條是 `.track.indet` |
| 空的 `.empty`／`.calm` | 一句話說明，`--tx3` |

---

## 11. 互動模式

- **對話框**：不放「取消」「關閉」鈕，點旁邊、往下滑、Esc 就關；電腦右上角自動加一個 ×。只剩一顆鈕時手機上撐滿整排。
- **返回手勢**：打開對話框、選單會記一筆瀏覽紀錄，返回先關最上面那個。
- **選單**：點同一顆「⋯」是關掉；點別台的直接換過去；捲動時自己關。
- **往右滑返回**：手機上除了最左邊 16px（留給瀏覽器），往右滑就退一層，滑超過三成或甩得夠快才退，不然彈回去。
- **搜尋**：打字就篩選清單（名字或地點）；找不到寫「找不到這台主機」。
- **Esc**：電腦關掉設定層或主機資訊；手機退一層。
- **滑鼠指著**：列、按鈕換 `--hov` 底；卡片換成稍微深一點的面；不做放大、浮起。
- **焦點**：鍵盤移到的東西外面 2px 主題色框（`:focus-visible`）。

---

## 12. 響應式

| 寬度 | 版面 |
|---|---|
| 1500 以上 | 主機的磁碟讀寫、負載與連線兩張圖並排 |
| 1280 以上 | 三欄：左欄＋中間＋右欄（右欄擠開中間） |
| 1024～1279 | 左欄＋中間；右欄滑出來蓋在中間上面 |
| 1023 以下 | 手機：一層一層；四格數字 600 以上一排四個、以下兩個 |
| 600 以下 | 要填東西的對話框從下面滑上來 |

---

## 13. 無障礙

- 字和底的對比（預設藍色量過，白底和灰底都算）：主要字、次要字、主題色字、狀態色字都在 4.5:1 以上，最低是淺色模式灰底上的次要字 4.72；主題色底上的白字淺色 5.67、深色 6.02。換別的主題色（琥珀、萊姆這類亮色）沒有一個一個量。
- 按得到的範圍至少 44×44（`.ubtn.sm` 在手機上用 `::before` 撐大）。
- 鍵盤焦點一律看得到（`:focus-visible`）。
- 尊重系統的減少動態、減少透明。
- 狀態不只靠顏色：一定有圖示或文字（例如「連不上」前面有斷線圖示）。

---

## 14. 出處（Telegram 網頁版原始碼：共用的變數和電腦版的基準）

只參考數值，程式一行都沒有拿（兩個專案都是 GPL-3.0，哨站是 MIT）。研究的版本：telegram-tt（Telegram A）commit 4566a14、tweb（Telegram K）commit 4cef169。

| 我們的 | 來源 |
|---|---|
| 底 #F4F4F5／#0F0F0F、面 #FFF／#212121、指著 #2C2C2C、深色次要字 #AAAAAA、框線 #DADCE0／#303030 | telegram-tt `src/styles/themes.json` |
| 淺色次要字 #686C72 | telegram-tt `_variables.scss` `$color-text-meta`（Telegram 的 #707579 在灰底上只有 4.16:1，改用它比較深的這個） |
| 指著＝次要字色 8%、按下 16% | telegram-tt `_variables.scss` `--color-interactive-element-hover`；tweb `variables.scss` `$hover-alpha: .08` |
| 異常 #E53935、注意 #FB8C00、正常 #4FAE4E | telegram-tt `_variables.scss` |
| 深色異常 #FF595A、深色正常 #5CC85E | tweb `helpers/themeController.ts` |
| 圓角 .375／.625／.75／1／1.5／2rem | telegram-tt `_variables.scss`（tiny、small、compact 選單項、menu／list-item／toast、island、modal） |
| 區段陰影 0 1px 4px #0000000D、浮起來 0 .25rem .5rem .125rem | telegram-tt `--shadow-island`、`Menu.scss`／`Modal.scss` |
| 時間 .15／.3／.45／.65 秒 | telegram-tt `.opacity-transition`、`--slide-transition`、`--top-stack-transition`、iOS `--layer-transition` |
| 曲線 (.25,1,.5,1)、(.33,1,.68,1) | telegram-tt `--slide-transition`、`--layer-transition` |
| 曲線 (.4,0,.2,1) | tweb `config/transitions.ts` |
| 水波紋：.7 秒、手機 .4 秒從 .27 倍、按住保持、至少一半才淡 | tweb `base.scss` `--ripple-*`、`components/ripple.ts` |
| 選單 .85 倍＋淡入 150ms、項目按下 .98 | telegram-tt `Menu.scss`、`MenuItem.scss` |
| 選單半透明 73%／87%＋模糊 10px | telegram-tt `--color-background-compact-menu` |
| 對話框 2rem 圓角、上 1rem 落下、下 1rem 離開、後面黑 25% | telegram-tt `Modal.scss` |
| 通知 #202020CC／#000000CC＋模糊、1rem 圓角 | telegram-tt `Notification.scss`、themes.json |
| 輸入框 3rem 高、1rem 圓角、focus 兩倍粗框 | telegram-tt `_forms.scss` |
| 開關 2.125×.875rem、圓 1.125rem 加 .125rem 邊 | telegram-tt `Switcher.scss` |
| 分頁底線 .1875rem、上緣圓角、用 slide 曲線滑 | telegram-tt `Tab.scss` |
| 清單列 3.25～3.5rem、分隔線跟著文字 | telegram-tt `ListItem.scss`、tweb `_row.scss` |
| 設定小標題：次要字色、500、往內 1rem | telegram-tt `left/settings/Settings.scss` |
| 粗細只用 400／500 | telegram-tt `--font-weight-medium`、tweb `--font-weight-bold: 500` |

不是從 Telegram 來、我們自己定的：`--tx2`、淺色狀態色和主題色加深的比例（為了對比）、深色 `--pf`、`--div` 深色值、左欄 272 寬、手機 App 模式選到圖示後面的淡底、對話框按鈕的實心主要鈕（使用者要求手機上撐滿）。水波紋時間用最接近的共用時間 .65／.45 秒，不是 tweb 的 .7／.4 秒。

---

## 15. 平台介面的數值與出處（Telegram 原生版本原始碼）

**授權**：Telegram-iOS、Telegram for Android、Telegram Desktop（含 lib_ui）都是 GPL，哨站是 MIT。所以**一行程式、一個圖示都沒有拿**，只讀原始碼裡的尺寸、顏色、時間和操作流程，自己用網頁重寫；圖示一律用哨站自己的 `P`。不把參考的倉庫放進專案。

研究的版本（2026-11-27）：

| 平台 | 倉庫 | commit |
|---|---|---|
| iOS | TelegramMessenger/Telegram-iOS | 24638bc69bd083981b178dd1e7f921eebbf7fc46 |
| Android | DrKLO/Telegram | 21f7d109da6ab3506c9e9577f98c6a38771ab335（2026-11-12） |
| 電腦 | telegramdesktop/tdesktop | fca0d08b6852df2195e11db91f7a4e3be2cbc4a4 |
| 電腦（元件庫） | desktop-app/lib_ui | b635328ff739f38c495601b5fc5e03688210143d |
| 網頁實作參考 | telegram-tt 4566a14、tweb 4cef169 | 見第 14 節 |

### iOS

| 我們的 | 數值 | 來源 |
|---|---|---|
| 清單一列 `.crow` | 頭像 60、字從 84 開始、名字 16 粗、狀態 15、時間 14、數字小圓 20 高 12 粗 | `submodules/ChatListUI/Sources/Node/ChatListItem.swift`（avatarDiameter、avatarLeftInset 24+60、titleFont、textFont、dateFont、badgeDiameter） |
| 設定區塊 | 左右 16、圓角 26（iOS 26 玻璃版；舊版 11）、列 52 高（上下 15）、17 字、有圖示時分隔線從 59 開始、右邊留 16 | `ItemListUI/Sources/ItemListItem.swift`、`Items/ItemListDisclosureItem.swift`（verticalInset、leftInset 16+43、separatorRightInset）、`TelegramPresentationData/Sources/Resources/PresentationResourcesItemList.swift`（cornersImage 26／11） |
| 段落標題 | 13、區塊外面、上面留 24／28 | `Items/ItemListSectionHeaderItem.swift` |
| 顏色 | 底 #EFEFF4／#000、區塊 #FFF／#1C1C1D、分隔線 #C8C7CC／#545458 55%、按下 #E5E5EA／#313135、箭頭 #BAB9BE、開關綠 #35C759／#67CE67（關 #E9E9EA／#39393D）、主題色預設 #0088FF | `DefaultDayPresentationTheme.swift`、`DefaultDarkPresentationTheme.swift` |
| 分頁列 | 圖示上、字 10 粗、整條全寬、上面一條細線 | `TabBarUI/Sources/TabBarNode.swift` |
| 換頁 | 底下那層退 30%，跟著手指 | `Display/Source/NavigationTransitionCoordinator.swift`（`(position - 1) * width * 0.3`） |
| 確認視窗 | 寬 270、圓角 14、後面暗 50%、標題 17 粗、說明 13、按鈕 44 高 | `Display/Source/TextAlertController.swift`、`AlertControllerNode.swift` |
| 選單 | 玻璃、圓角 min(30, 高/2)、按下的底圓角 20 | `TelegramUI/Components/ContextControllerImpl/Sources/ContextControllerActionsStackNode.swift` |
| 搜尋框 | 36 高、17 字、「取消」主題色 | `SearchBarNode/Sources/SearchBarNode.swift` |

### Android

| 我們的 | 數值 | 來源 |
|---|---|---|
| 最上層導覽 | 下面浮起來的分頁：56 高、四周留 8；新增圓鈕在分頁上面 | `TMessagesProj/.../ui/MainTabsActivity.java`、`DialogsActivity.java`（MAIN_TABS_HEIGHT 56、MAIN_TABS_MARGIN 8、additionFloatingButtonOffset）；側邊抽屜（DrawerProfileCell）在這版已經拿掉 |
| 分頁字 | 12 粗、選到的更粗、選到的那格一塊底 | `Components/glass/GlassTabView.java` |
| 清單一列 | 70 高、字從 72 開始、名字 17 粗、內容 16、數字 12 粗 | `Cells/DialogCell.java`（heightDefault、messagePaddingStart）、`ActionBar/Theme.java` |
| 顏色 | 標題列白底、灰底 #F1F1F3、分隔線 #D9D9D9、按下 6% 黑、主題色 #229AF0 | `ActionBar/ThemeColors.java` |
| 換頁 | 新的一層從右邊 48dp 淡入，.15 秒 | `ActionBar/ActionBarLayout.java`（`dp(48) * (1 - interpolated)`、duration 150） |
| 設定列 | 50 高、16 字、彩色圖示方塊；段落標題主題色粗體 | `Cells/TextCell.java`（heightDp 50、setColorfulIcon）、`Cells/HeaderCell.java` |
| 確認視窗 | 標題 20、說明 16、按鈕 16 | `ActionBar/AlertDialog.java` |
| 選單 | 圓角 28、陰影 6dp、項目 16 字、圖示在左 | `MainTabsActivity.java`（ItemOptions 的 createRoundRectDrawable(dp(28))）、`ActionBar/ActionBarMenuSubItem.java` |

### 電腦（Telegram Desktop）

| 我們的 | 數值 | 來源 |
|---|---|---|
| 清單一列 | 62 高、頭像 46、字從 68 開始、13 字、時間 13、數字 19 高 12 粗 | `Telegram/SourceFiles/dialogs/dialogs.style`（defaultDialogRow、dialogsUnread*）、lib_ui `ui/basic.style`（fsize 13） |
| 欄寬 | 左欄最少 260、中間 380、右欄 292 | `window/window.style`（columnMinimalWidth*） |
| 主選單 | 從左邊滑出、上面主題色底、頭像 48、項目粗體圖示在左 | `window/window.style`（mainMenuUserpic、mainMenuButton）、lib_ui `colors.palette`（mainMenuCoverBg） |
| 設定 | 蓋在中間的一層：寬 392、上下留 20～40、標題列 56；設定圖示圓角 6 | `info/info.style`（infoDesiredWidth、infoLayerTop*）、`settings/settings.style`（settingsButton、settingsIconRadius） |
| 對話框 | 圓角 8、寬 320、標題 16 粗在 (24,13)、按鈕 34 高圓角 4 | lib_ui `ui/layers/layers.style`（boxRadius、boxWidth、boxTitle*）、`ui/widgets/widgets.style`（buttonRadius、defaultActiveButton） |
| 選單 | 圓角 8、項目左右 17 上下 8、最窄 156 | lib_ui `ui/widgets/widgets.style`（defaultMenu、defaultPopupMenu） |
| 水波紋 | 長出來 .65 秒、淡掉 .2 秒、#E5E5E5 | lib_ui `ui/widgets/widgets.style`（defaultRippleAnimation） |
| 後面那層暗色 | 黑 50% | lib_ui `colors.palette`（layerBg #0000007F） |

### 跟原生版本不一樣的地方（刻意的）

- 對話框不放「取消」：使用者要求過（點旁邊、往下滑、Esc 就關），所以 iOS 的確認視窗只有一顆按鈕整排。
- 次要字顏色：iOS 原本是 #8E8E93，在白底上對比不到 4.5，清單的時間、狀態維持原色（`--ios-sub`），其他說明字改用段落標題那個比較深的 #6D6D72（`--tx3`）。
- 字型：網頁拿不到 SF Pro、Roboto、Open Sans 的授權字檔時就用系統字；Telegram Desktop 自帶 Open Sans，這裡用系統字。
- 設定裡的圖示：三個平台都是實心彩色方塊，但顏色照哨站的角色（主題色、配角色、灰、注意、異常），不是 Telegram 每一項各自固定的顏色。
- 分頁的內容：Telegram 是聊天、聯絡人、通話、設定；哨站是主機、紀錄、設定。
