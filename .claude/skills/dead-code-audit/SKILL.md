---
name: dead-code-audit
description: 清理沒用到的程式：使用者要清理舊程式、移除功能後收尾、或發現重複／不再呼叫的函式時使用。用 vulture＋網頁函式檢查，刪之前逐一確認真的沒用。
---

# 清理沒用到的程式

這個專案的網頁程式是全域變數、後端用 `include()` 共用變數，Knip 這類照「模組匯入」判斷的工具會大量誤報，所以不用。

1. `python3 .claude/qa/gate.py deadcode`：改過的 .py 跑 vulture（信心 80% 以上），改過的 web/*.js 找全專案只出現一次的函式。只是候選清單，不擋。
2. 每個候選都要人工確認：用 Grep 搜全專案（包含字串組出來的名字、`data-` 屬性、`api()` 路由、測試、tools/、GitHub Actions）。
3. 確定沒用才刪；**使用者說要保留的功能、還在 CLAUDE.md 寫著的功能不能刪**。
4. 刪完跑 `python3 .claude/qa/gate.py standard browser`。
