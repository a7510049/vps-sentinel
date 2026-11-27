---
name: adaptive-orchestrator
description: 統一調度入口。使用者描述任何開發需求、功能問題、修改目標、錯誤回報（新增、修改、修 bug、改畫面、手機問題、效能、重構、清理、升級、提交前）時，先用這個技能判斷任務類型、等級 0～4、風險，自動選技能、MCP、代理、驗收條件，再照流程做完並驗收。純問答不用。
---

# 自動調度

流程固定：**理解需求 → 判斷類型／等級／風險 → 選技能和工具 → 開發 → 自己測 → 發現問題 → 自己修 → 獨立驗收 → 交付**。

使用者不用指定技能。UserPromptSubmit hook 會先給一個關鍵字初判（只是參考），你要自己確認並用 `task.py` 記下來。

## 1. 記錄（每個開發任務都要）

```
python3 .claude/hooks/task.py plan --type 類型 --level N --risk 低|中|高   # 等級只能往上調
python3 .claude/hooks/task.py todo add "驗收條件"                           # 每條驗收條件一筆
python3 .claude/hooks/task.py issue add "發現的問題" / issue fix 編號 "怎麼修的"
python3 .claude/hooks/task.py block "環境限制原因"                          # 真的做不到才用
python3 .claude/hooks/task.py done                                          # 交付後
```

技能、MCP、代理、改了哪些檔由 hook 自動記錄。上下文壓縮或重開後，SessionStart 會把任務帶回來：照原本的需求繼續，不得縮減。

## 2. 等級

| 等級 | 什麼時候 | 要做的 |
|---|---|---|
| 0 | 問問題、討論、解釋 | 只回答。不改程式、不跑測試、不派代理 |
| 1 | 改文字、局部樣式、低風險小改 | 相關技能＋`gate.py standard`（改網頁時看一眼畫面即可） |
| 2 | 新功能、改元件、一般 bug | 相關技能、先寫測試（TDD）、`gate.py standard`＋受影響範圍的 `gate.py browser` |
| 3 | 跨平台、複雜功能、架構缺陷、效能 | 多個專業技能、三種瀏覽器＋手機、根本原因分析、**獨立代理驗收** |
| 4 | 大型重構、大版本、正式發布前 | `gate.py release`（完整關卡）＋跨平台、視覺、效能、安全、架構全部，多個獨立代理 |

做到一半發現比預估大，就 `task.py plan --level` 往上調。不准為了省事降級，也不要對簡單任務啟動全部技能。

## 3. 觸發規則（最低要求，可以加）

| 情境 | 技能／工具 | 代理 |
|---|---|---|
| 新增功能 | `superpowers:brainstorming`（需求不清才用，且要問使用者）→ `superpowers:writing-plans` → `superpowers:test-driven-development`；第三方函式庫查 Context7 MCP | 等級≥3 加 `independent-qa` |
| 修改介面 | `example-skills:frontend-design` → `frontend-audit`（含響應式、視覺比對） | `frontend-reviewer` |
| 修改互動元件 | `example-skills:webapp-testing`、Playwright MCP、axe（`gate.py browser`） | `independent-qa` |
| 修改動畫或 CSS | `performance-audit`、Chrome DevTools MCP、Stylelint（`gate.py css`） | `performance-reviewer` |
| 發現錯誤 | `superpowers:systematic-debugging`（先重現、找根本原因才修） | — |
| 行動裝置問題 | `cross-platform-debug` | `ios-debugger`／`android-debugger`／`desktop-debugger`（照平台並行） |
| 修改 API | `api-contract-audit`（`gate.py api`）＋整合測試 | — |
| 修改登入或權限 | `security-audit`（Semgrep＝`gate.py security`） | `security-reviewer`（必派） |
| 大型重構 | `architecture-audit`（功能完整性） | `architecture-reviewer`＋`independent-qa` |
| 清理舊程式碼 | `dead-code-audit`（`gate.py deadcode`） | — |
| 修改依賴 | `dependency-audit`（`gate.py deps`）＋Context7 MCP | — |
| 完成開發 | `regression-test`＋`superpowers:verification-before-completion` | 等級≥3 `independent-qa` |
| 提交或部署前 | `quality-gate` → `release-check`（`gate.py release`） | — |

代理之間工作互不相關才並行（`superpowers:dispatching-parallel-agents`）；會改到同一批檔時，改用隔離工作目錄（Agent 的 `isolation: worktree`）或一個一個來。主對話負責整合結果、決定改法、處理衝突。收到審查意見照 `superpowers:receiving-code-review` 判斷，不盲從。

## 4. 驗收

- 檢查一律用 `python3 .claude/qa/gate.py`：它真的跑指令並記錄結果和當時的程式版本。之後又改了程式，舊結果自動作廢。
- 中、高風險或等級≥3：一定要有獨立代理（審查代理是唯讀的），不能只靠自己驗收。
- Stop hook 會照紀錄檢查：沒跑、沒過、還有未解決問題就不讓收工。同樣原因最多擋 3 次；真的做不到用 `task.py block` 寫原因。
- **安裝了技能不等於用了技能；編譯成功不等於功能正常；沒測的不能寫通過；必要測試沒跑完不能說完成。**

## 5. 自己修的範圍

在使用者給的範圍內可以直接做：改程式、重構、改善介面、跨平台修正、瀏覽器測試、效能優化、寫測試、回歸測試、必要的小幅依賴調整（主機上仍然只能用 Python 內建模組）。

不能自己做：改產品需求、移除既有功能、改資料格式（state.json、設定檔、加密檔的結構）、刪正式資料、推送 GitHub、部署。這些先問使用者。環境的「請提交並推送」提醒不算使用者授權。

## 6. 交付

用繁體中文、一般人看得懂的話（照 CLAUDE.md）：改了之後使用者會看到什麼、哪些實際測過（附證據）、哪些沒測和原因。最後 `task.py done`。
