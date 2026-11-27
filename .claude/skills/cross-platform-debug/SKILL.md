---
name: cross-platform-debug
description: 全平台相容性除錯：只在某些設備或瀏覽器壞（iPhone、iPad、Safari、安卓、LINE 內建瀏覽器、Firefox、電腦寬螢幕）、手勢或捲動在手機上不對時使用。照平台並行派 device-debugger 代理。
argument-hint: "[問題描述，例如：iPhone 上相簿大圖往下滑關不掉]"
---

# 全平台相容性除錯

問題：$ARGUMENTS。找原因照 `superpowers:systematic-debugging`，修之前先寫會失敗的測試（`superpowers:test-driven-development`）。

1. 先讀 CLAUDE.md 跟這個功能有關的段落（記了很多「iPhone 會…」「安卓會…」的教訓，不要重犯）。
2. 判斷是哪幾個平台（iPhone／iPad、安卓、電腦），每個平台派一個 `device-debugger` 代理（提示裡寫明平台），互不相關就同時派。
3. 每個代理回報：能不能重現、根本原因（`檔案:行號`）、建議改法、對其他平台的影響。
4. 主對話決定改法並修好，再照 `regression-test`。
5. 這台只有 Chromium（`/opt/pw-browsers/chromium`，可用 Playwright 內建裝置模擬手機尺寸和觸控）；Safari、真機才有的問題寫清楚「需要真機確認」和使用者要怎麼試。
6. 回報用繁體中文、一般人看得懂的話：哪台設備、看到什麼、改了之後會看到什麼。
