---
name: cross-platform-debug
description: 全平台相容性除錯：只在某些設備或瀏覽器壞（iPhone、iPad、Safari、安卓、LINE 內建瀏覽器、Firefox、電腦寬螢幕）、手勢或捲動在手機上不對時使用。會依平台並行派 ios／android／desktop 除錯代理。
argument-hint: "[問題描述，例如：iPhone 上相簿大圖往下滑關不掉]"
---

# 全平台相容性除錯

問題：$ARGUMENTS

這個技能只負責「跨平台」這一層，除錯方法本身沿用已安裝的技能，不重複寫：

- 找原因的步驟：`superpowers:systematic-debugging`（先重現、找根本原因，再修）
- 修之前先寫會失敗的測試：`superpowers:test-driven-development`
- 宣稱修好前：`superpowers:verification-before-completion`
- 實際開瀏覽器：`example-skills:webapp-testing`（Playwright）、Playwright MCP、Chrome DevTools MCP

## 步驟

1. 先讀 `CLAUDE.md` 裡跟這個功能有關的段落（裡面記了很多「iPhone 會…」「安卓會…」的既有教訓，不要重犯）。
2. 判斷是哪幾個平台的問題，派給對應的代理（可同時派，照 `superpowers:dispatching-parallel-agents`）：
   - iPhone／iPad（Safari、WebKit）→ `ios-debugger`
   - 安卓（Chrome、WebView、LINE 內建瀏覽器）→ `android-debugger`
   - 電腦（Chrome／Edge、Firefox、Safari；滑鼠、鍵盤、寬螢幕 1280／1440／1600）→ `desktop-debugger`
3. 每個代理回報：能不能重現、根本原因（指到 `檔案:行號`）、建議的改法、會不會影響其他平台。
4. 主對話決定改法並修好（代理是唯讀的）；`task.py issue add/fix` 記錄每個問題。
5. 修完跑 `python3 .claude/qa/gate.py standard browser`，再請 `independent-qa` 用三種瀏覽器＋手機核對（等級 3，必做）。
6. 回報給使用者用繁體中文、一般人看得懂的話：哪台設備、看到什麼、改了之後會看到什麼。

## 本機跑起來的方式

測試設定檔放在暫存資料夾（不要寫到正式位置）：`PORT=`、`TOKEN=`、`NAME=`、`DATA_DIR=`，然後 `SENTINEL_CONF=設定檔 python3 sentinel.py`。

## 瀏覽器

`.claude/qa` 裡有 `@playwright/test` 1.63.0，Chromium、WebKit、Firefox 都在 `/opt/pw-browsers`。手機請用 Playwright 內建裝置（`devices['iPhone 15']`、`devices['Pixel 7']`），WebKit 只是接近 iPhone Safari，不等於真機；真機才有的問題要寫清楚「需要真機確認」。
