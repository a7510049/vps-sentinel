---
name: regression-test
description: 完整回歸測試：開發完成要交付前、改動影響多處、或使用者要求全面測試時使用。實際跑 gate.py standard＋browser，派 independent-qa 驗收。
argument-hint: "[可選：只測某一區，例如 album、fly；不填就全部]"
---

# 完整功能回歸測試

範圍：$ARGUMENTS（不填＝全部）

判斷「過了沒」一律照 `superpowers:verification-before-completion`：沒看到指令輸出，就不能說通過。瀏覽器操作照 `example-skills:webapp-testing`。

## 第一關：不用開網頁的檢查（`CLAUDE.md`「改完要做的檢查」）

```
python3 .claude/qa/gate.py standard     # 全部 .py 編譯、style_check、unittest、shellcheck
```

結果自動記在 `.claude/state/checks.json`（含當時的程式版本），Stop hook 照這份判斷。

## 第二關：開網頁看

先跑 `python3 .claude/qa/gate.py browser`（會自己開測試用哨兵、跑完關掉）。等級≥3 再派 `independent-qa` 代理（它不看實作過程，只看結果）照下面逐項核對：

1. 測試用哨兵：`python3 .claude/qa/scripts/run_sentinel.py start`（結束用 `stop 資料夾`）。
2. Chromium、Firefox、WebKit 各一次；電腦 1440 寬、手機 375 寬（`devices['iPhone 15']`、`devices['Pixel 7']`）。
3. 每頁：主控台沒有錯誤、主要 API 有回應、截圖。
4. 等自動更新兩次（至少 10 秒），比對前後截圖：沒有跳動、閃爍。
5. 測完把哨兵關掉、刪暫存資料。

## 回報

表格：項目／瀏覽器／結果（通過、失敗、沒測＋原因）／證據（指令輸出或截圖路徑）。屬於這次範圍的失敗就修好、重跑到通過；超出範圍的 `task.py issue add` 記下並回報使用者。
