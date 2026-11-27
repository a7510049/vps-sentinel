---
paths:
  - "*.sh"
---

# 改安裝腳本時（*.sh）

- 收工前 `bash -n 檔案` 和 `shellcheck *.sh` 都要過。
- 不能在這台機器上真的執行 `install.sh`／`cloud.sh`（會改系統；設定裡也會先問使用者）。
- 讀加密的設定值用 `python3 sentinel.py --conf-get 名稱`。
