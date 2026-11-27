---
paths:
  - "web/**"
---

# 改網頁時（web/）

- 先看 DESIGN.md 相關段落；顏色、圓角、字級、動畫時間、z-index 只能用 `:root` 變數。
- 新區塊要有 `data-key`；自動更新是比對差異，不能整塊重畫。不能寫 `onclick=` 這類（`html_csp`）。
- 改完 `python3 tools/style_check.py`、`node --check 檔案.js`；收工前照 `regression-test`（開網頁看）。
- 介面改動照 `frontend-audit`；動畫、捲動、CSS 照 `performance-audit`；只在某些設備壞照 `cross-platform-debug`。
- 新增網頁檔要改 `SRC_FILES`、`load_page()`、`install.sh`。
