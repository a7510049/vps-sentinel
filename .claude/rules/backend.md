---
paths:
  - "*.py"
  - "tests/**"
---

# 改後端時（*.py）

- 主機上只能用 Python 內建模組（`gate.py deps` 會查）。
- `include()` 載入的檔共用變數、照順序載入；出錯整個哨兵起不來。新檔：`SRC_FILES`、`include()`、`install.sh`、check.yml。
- 存秘密用 `sec_load`／`sec_dump`／`sec_write`＋`SEAL_FILES`；秘密設定加進 `SEAL_CONF`。
- 新增 Telegram 通知：`ev_line()` 給狀態符號並加進 `tests/test_tg_icons.py`。
- 修 bug／加功能先在 `tests/` 寫會失敗的測試（TDD），收工前 `python3 .claude/qa/gate.py standard`。
- 動到登入、權限、加密：`security-audit`；動到 `/api/`：`api-contract-audit`。
