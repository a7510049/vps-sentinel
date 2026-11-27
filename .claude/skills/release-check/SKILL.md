---
name: release-check
description: 發布前檢查：使用者要提交、推送、發新版前使用。確認新檔案清單、版本號、README、CLAUDE.md、提交訊息都跟著改。只檢查，推送和部署仍要使用者明確同意。
---

# 發布前檢查

1. 先做 `regression-test`。
2. 新增的程式、網頁檔：`sentinel.py` 的 `SRC_FILES`、`load_page()`／`include()`、`install.sh` 複製那一行、check.yml 的 py_compile 都要有。
3. 功能有改 → README.md、CLAUDE.md 跟著改；改動大 → `sentinel.py` 的 `VERSION` 往上加。
4. 新增 Telegram 通知 → `ev_line()` 有狀態符號，`tests/test_tg_icons.py` 有加。
5. 提交訊息用中文、寫「使用者會看到什麼改變」；不能有網域、IP、登入碼、個人資料（專案是公開的）。
6. 推送到使用者沒指定的分支、合併、部署主機，一定要使用者明確說可以。
