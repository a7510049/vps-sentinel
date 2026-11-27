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
2-1. 跨平台操作測試：`SENTINEL_URL=http://127.0.0.1:埠/ SENTINEL_TOKEN=測試密碼 node tools/ui_e2e.js`（Chromium＋WebKit：點、連點、長按、往右滑、上一頁、選單開關、換分頁、換平台、重新整理、自動更新兩次、來回 15 次的元素數）。WebKit 沒裝的話：`node /opt/node-tools/node_modules/playwright/cli.js install webkit && … install-deps webkit`。
3. 等自動更新兩次（至少 10 秒），前後比對沒有跳動、閃爍。
4. 關掉哨兵、刪掉暫存資料。

改動大或風險高時，另外派 `independent-qa` 代理驗收（它沒看過實作過程）。

## 回報

項目／結果（通過、失敗、沒測＋原因）／證據。WebKit 自動化不等於 iPhone Safari 實機、Chromium 手機模擬不等於安卓實機、Firefox 沒測，要照實寫。
