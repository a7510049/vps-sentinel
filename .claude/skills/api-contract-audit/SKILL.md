---
name: api-contract-audit
description: API 契約與整合測試：新增或修改 /api/ 路由、回傳欄位、主機之間的呼叫（PEERS、?node= 轉送）、網頁 api() 呼叫時使用。確認前後端對得上、舊版主機還能用。
---

# API 契約審查

1. `python3 .claude/qa/gate.py api`：網頁呼叫的 `/api/…` 後端都要有。
2. 改了回傳欄位：搜尋網頁所有用到的地方（`web/*.js`），新欄位沒有時網頁不能壞；拿掉欄位前確認沒人用。
3. 主機之間：主要主機可能是新版、其他台是舊版（反過來也是），新欄位要能缺、舊欄位不能突然消失；`/api/status`、`?since=`、`hist.part` 這類格式改了要相容。
4. 整合測試：在 `tests/` 加一個真的把哨兵跑起來打 API 的測試（照現有 tests 的寫法：暫存 DATA_DIR、隨機埠），先寫、先看它失敗（`superpowers:test-driven-development`），再實作。
5. `python3 .claude/qa/gate.py standard` 通過才算完成。
