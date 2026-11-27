---
name: architecture-audit
description: 架構與功能完整性審查：大型重構、拆檔、搬函式、改 include() 載入順序、改共用變數、大版本更新前使用。確保既有功能一個都沒少，派 architecture-reviewer＋independent-qa。
---

# 架構審查（功能完整性）

1. 動手前：列出受影響的功能清單（照 CLAUDE.md 各段：API 路由、背景工作 `*_loop`、hook 到的網頁功能），用 `task.py todo add` 一條一條記下，當作驗收條件。
2. 規則確認：
   - 主機上只能用 Python 內建模組（`gate.py deps`）
   - 新檔案三處都要改：`SRC_FILES`、`load_page()`／`include()`、`install.sh`，再加 check.yml 的 py_compile（`gate.py release` 會查）
   - `include()` 載入的檔共用變數、有順序；出錯整個哨兵起不來
   - 資料格式（state.json、設定檔、加密檔）不能改壞；舊資料要讀得回來
3. 重構前後各跑一次 `python3 .claude/qa/gate.py full`，比對結果。
4. 派 `architecture-reviewer`（唯讀）審 diff；再派 `independent-qa` 照步驟 1 的清單逐項驗收。
5. 不能藉重構刪掉既有功能；要刪先問使用者。
