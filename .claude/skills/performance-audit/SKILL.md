---
name: performance-audit
description: 效能、動畫、渲染檢查：卡頓、掉幀、閃爍、捲動不順、耗電、記憶體越用越多、改了動畫或 CSS、背景工作拖慢主機時使用。用 Chrome DevTools MCP 錄效能，派 performance-reviewer。
argument-hint: "[範圍，例如：相簿照片牆縮放、機場雷達、首頁自動更新]"
---

# 效能、動畫及渲染檢查

範圍：$ARGUMENTS。找原因照 `superpowers:systematic-debugging`；量測用 Chrome DevTools MCP（`performance_start_trace`／`performance_stop_trace`／`performance_analyze_insight`、`take_heapsnapshot`）。

1. 派 `performance-reviewer` 代理，先讀程式找可疑處，再量：
   - 動畫只動 transform／opacity？有沒有每格改 width、top、clip-path、filter
   - 自動更新（每 5 秒）有沒有整塊重畫、重播進場動畫（CLAUDE.md「自動更新的動畫要省力」）
   - 看不到的東西（捲出畫面、`document.hidden`）有沒有停
   - 長任務（50 毫秒以上）、版面抖動、記憶體一直長
   - 後端：背景工作的頻率、會不會拖慢監控（參考 `tools/fly_perf.py`）
2. 手機用 CPU 降速 4 倍模擬，電腦不降速，各量一次。
3. 回報：量到的數字、原因 `檔案:行號`、建議改法；修完重量一次，寫改善前／後。
