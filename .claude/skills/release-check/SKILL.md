---
name: release-check
description: 發布前檢查：使用者要提交、推送、發新版、更新主機前使用。在 quality-gate 之外確認版本號、README、檔案清單、提交訊息。只檢查，推送和部署仍要使用者明確同意。
---

# 發布前檢查

1. 先做 `quality-gate`（等級 4：`python3 .claude/qa/gate.py release`）。
2. 一致性（gate 的 release 項會查前三項）：
   - 新檔案在 `SRC_FILES`、`install.sh`、check.yml（不然「網頁一鍵更新」判斷錯版本、主機缺檔）
   - 功能有改 → README.md 跟著改
   - 改動大 → `sentinel.py` 的 `VERSION` 往上加
   - CLAUDE.md 的說明跟著新行為更新
3. 新增 Telegram 通知 → `ev_line()` 有狀態符號，`tests/test_tg_icons.py` 有加。
4. 提交訊息用中文、寫「使用者會看到什麼改變」；不能有網域、IP、登入碼、個人資料。
5. **推送 GitHub、部署主機一定要使用者明確說可以**（PreToolUse hook 會跳出確認）。
