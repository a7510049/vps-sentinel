---
name: frontend-audit
description: 前端介面審查（含響應式）：改了網頁畫面、樣式、版面、元件、文字後，或要確認是否符合 DESIGN.md、CLAUDE.md 設計規則時使用。派 frontend-reviewer。
argument-hint: "[範圍，例如：web/album.js 或「機場看板」，不填就看目前的改動]"
---

# 前端介面審查

範圍：$ARGUMENTS（沒寫就看 `git diff` 的改動）。介面品質標準參考 `example-skills:frontend-design`，這裡只補這個專案自己的規則。

1. 派 `frontend-reviewer` 代理審查範圍內的檔案（對照 DESIGN.md、`:root` 共用變數、CLAUDE.md「網頁的設計規則」「使用者明確要求過的事」、`data-key`、`html_csp`、文字規則）。
2. `python3 tools/style_check.py` 要顯示「全部符合規則」。
3. 響應式：本機跑哨兵（暫存設定檔），用 Playwright MCP `browser_resize` 看手機 375、平板 768、電腦 1280／1440／1600 寬：不能有橫向捲軸、字被切掉、元件重疊；主控台沒有錯誤。
4. 意見分三級：一定要改／建議／小地方，每條附 `檔案:行號`。屬於這次範圍的「一定要改」由主對話修掉再看一次，超出範圍的告訴使用者。
