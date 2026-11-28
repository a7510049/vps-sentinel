---
name: regression-test
description: 改完程式要交付前的驗收：跑 CLAUDE.md「改完要做的檢查」，改到網頁時再把哨兵跑起來、用 Playwright 開電腦和手機兩種寬度看畫面和主控台。改動影響多處或使用者要求全面測試時也用。
argument-hint: "[可選：只測某一區，例如 album、fly；不填就全部]"
---

# 回歸測試

範圍：$ARGUMENTS（不填＝全部）。沒看到指令輸出就不能說通過（`superpowers:verification-before-completion`）。

## 1. 不用開網頁的檢查

```
python3 -c "import ast;ast.parse(open('sentinel.py').read())"
python3 tools/style_check.py              # 要顯示「全部符合規則」
python3 -m unittest discover -s tests     # 含 tests/test_project_rules.py：只用內建模組、網頁呼叫的 API 後端都有
shellcheck *.sh
```

## 2. 改到網頁時：開起來看

1. 暫存資料夾放測試設定檔（`PORT=`、`TOKEN=`、`NAME=`、`DATA_DIR=` 都指到暫存位置），`SENTINEL_CONF=設定檔 python3 sentinel.py` 放背景跑。
2. 用 Playwright MCP（或 Node 的 `require('playwright')`）開電腦 1440 寬、手機 375 寬：主控台沒有錯誤、截圖看一次。**三種平台介面都要看**：瀏覽器 localStorage 的 `vps-prefs` 設 `{"plat":"ios"}`／`"android"`／`"desktop"`。
2-1. 跨平台操作測試：`node tools/ui_e2e.js`（自己在暫存資料夾開東京、首爾、大阪（連不上）三台測試主機，不連正式主機；三平台×手機 390／電腦 1440×深淺色×Chromium、WebKit，ID 對應交接驗收表 N01～A01：真的點、連點、長按、往右滑、上一頁／下一頁、重新整理、寬窄互換、轉橫、選單和對話框、取消不送請求、連線出錯、自動更新、來回 15 次）。結果看畫面和送出的請求，不改程式裡的變數。WebKit、Firefox 沒裝的話裝到別的資料夾再用 `PLAYWRIGHT_BROWSERS_PATH` 指過去（`npx playwright install webkit firefox`＋`install-deps webkit`）。交付前那一次不要用 `ONLY` 跳過項目。
3. 等自動更新兩次（至少 10 秒），前後比對沒有跳動、閃爍。
4. 關掉哨兵、刪掉暫存資料。

改動大或風險高時，另外派 `independent-qa` 代理驗收（它沒看過實作過程）。

## 回報

項目／結果（通過、失敗、沒測＋原因）／證據。WebKit 自動化不等於 iPhone Safari 實機、Chromium 手機模擬不等於安卓實機、Firefox 沒測，要照實寫。
