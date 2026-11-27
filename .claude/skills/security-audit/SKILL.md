---
name: security-audit
description: 安全審查：改到登入、登出、密碼、PIN 碼、手機金鑰、權限、再確認、加密（seal_）、Cookie、通行證、配對、TLS、CSP、SSH 上鎖、上傳檔案、對外連線時使用。派 security-reviewer 獨立審查。
---

# 安全審查

1. 內建的 `/security-review` 先看一次這次的改動。
2. 對照 CLAUDE.md 的既有安全設計，確認沒有被削弱：
   - 登入鑰匙 `vss_`、存雜湊不存原文；`recheck_need`／`X-Recheck` 該問的動作還有問
   - 存秘密要 `sec_load`／`sec_dump`／`sec_write` 並加進 `SEAL_FILES`；秘密設定加進 `SEAL_CONF`
   - `html_csp`：不能在標籤寫 `onclick=`；外部連線只開該開的
   - PIN 碼不原樣送出（`pin_begin`／`pin_proof`）；錯太多次的鎖還在
   - 新 API 有驗證、沒有讓未登入的讀到資料；路徑不能跳出資料夾；外部網址只連公開 IP
3. 派 `security-reviewer`（唯讀）獨立審查這次的 diff。
4. 「一定要改」的屬於這次範圍就修掉再審一次。不能把金鑰、網域、IP 寫進專案（專案是公開的）。
