---
name: quality-gate
description: 品質關卡：任務做完要交付前、使用者要提交或部署前、等級 4 任務時使用。照等級跑該跑的檢查，全部實際通過才算完成。
---

# 品質關卡

| 等級 | 指令 |
|---|---|
| 1 | `python3 .claude/qa/gate.py standard` |
| 2 | `standard`＋改到網頁時 `browser` |
| 3 | `standard browser`＋這次類型對應的（`security`、`css`、`api`、`deps`）＋獨立代理驗收 |
| 4 | `python3 .claude/qa/gate.py release`（全部）＋`architecture-reviewer`、`security-reviewer`、`independent-qa` |

- 結果記在 `.claude/state/checks.json`；之後又改程式，舊結果作廢要重跑。
- 照 `superpowers:verification-before-completion`：回報要貼實際輸出，沒跑的寫「沒跑＋原因」，不能寫通過。
- 有失敗：屬於這次範圍就修好重跑；做不到用 `task.py block 原因`。
