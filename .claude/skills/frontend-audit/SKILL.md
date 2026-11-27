---
name: frontend-audit
description: 前端介面審查（含響應式、視覺比對、無障礙）：改了網頁畫面、樣式、版面、元件、文字後，或要確認是否符合 DESIGN.md、CLAUDE.md 設計規則時使用。派 frontend-reviewer。
argument-hint: "[範圍，例如：web/album.js 或「機場看板」，不填就看目前的改動]"
---

# 前端架構及介面審查

範圍：$ARGUMENTS（沒寫就看 `git diff` 的改動）

審查方法沿用已安裝的技能：`superpowers:requesting-code-review`（怎麼請人審）、`superpowers:receiving-code-review`（收到意見怎麼判斷）、`example-skills:frontend-design`（介面品質的標準）。這裡只補這個專案自己的規則。

## 步驟

1. 派 `frontend-reviewer` 代理審查範圍內的檔案，它會對照：
   - `DESIGN.md`（顏色、字級、圓角、間距、動畫、按鈕動畫、第 5 節對齊）
   - `web/style.css` 開頭 `:root` 的共用變數；不准寫死 px 圓角／字級、cubic-bezier、毫秒、z-index、顏色
   - `CLAUDE.md` 的「網頁的設計規則」「使用者明確要求過的事」
   - 畫面更新是比對差異（`data-key` 等），新區塊要有 key
   - 不能在標籤寫 `onclick=` 這類（`html_csp`）
   - 文字：繁體中文、台灣用語、一句話講完、沒有多餘字
2. 跑 `python3 .claude/qa/gate.py style css`（共用規則＋Stylelint，結果會記錄）。
3. 響應式：手機 375、平板 768、電腦 1280／1440／1600 寬各看一次（Playwright MCP `browser_resize`），不能有橫向捲軸、字被切掉、元件重疊。
4. 視覺比對＋無障礙：`python3 .claude/qa/gate.py browser`（截圖比對基準圖、axe 嚴重問題、主控台錯誤）。基準圖只能在確認畫面正確後更新（`.claude/qa` 裡 `npx playwright test --update-snapshots`），並在回報說明。
5. 意見分三級：一定要改（違反規範或使用者要求）／建議／小地方。每條附 `檔案:行號`。
6. 審查代理只回報；屬於這次任務範圍的「一定要改」由主對話修掉再重跑，超出範圍的記 `task.py issue add` 並告訴使用者。
