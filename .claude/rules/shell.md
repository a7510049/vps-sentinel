---
paths:
  - "*.sh"
---

# 改安裝腳本時（*.sh）

- 存檔時會跑 `bash -n`＋`shellcheck`；收工前 `python3 .claude/qa/gate.py shell`。
- 不能在這台機器上真的執行 `install.sh`／`cloud.sh`（會改系統，PreToolUse 會要使用者確認）。
- 讀加密的設定值用 `python3 sentinel.py --conf-get 名稱`。
