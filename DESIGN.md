# 岬角 Cape 設計系統

## 產品體驗

維運首頁按「健康摘要 → 資源時間序列 → 主機」排列。事件與趨勢並排，讓值班人員能在掃視圖表時確認異常成因。主機表直接連到監控、規格與個別事件。通知是任務內暫時開啟的側欄，保留原本工作頁面。警報規則與事件各有獨立的永久路徑。

## 色彩與材質

| 用途 | 淺色 | 深色 |
| --- | --- | --- |
| 工作區底色 | `#f4f7f6` | `#101813` |
| 可閱讀表面 | `#ffffff` | `#19261f` |
| 導覽表面 | `#f9fbfa` | `#141f19` |
| 列表分組與表頭 | `#f0f5f2` | `#16221b` |
| 浮層表面 | `#ffffff` | `#22332a` |
| 文字 | `#182b24` | `#e4eee8` |
| 主動作 | `#09694e` | `#72d8ac` |

薄邊界用於長時間閱讀的圖表與資料清單。陰影用於疊在目前工作上的通知、選單與表單。資料色在淺深主題各自調校。綠色代表正常或積極操作，琥珀色代表警告，磚紅代表離線，紫色用來辨識獨立的記憶體序列。狀態文字與圖形同時提供辨識線索。

## 元件與動效

- 以系統無襯線與繁體中文字型顯示介面。主機位址使用等寬，指標數字使用等寬數字。
- 以 4 px 為間距基礎。資料區塊 16 px、選單 12 px、一般按鈕 9 px。資料列的圖示、名稱、次要資訊與操作各有固定欄位。
- 工作區側欄用分隔線區分維運與偏好。主機管理列表依離線、需要留意、運作正常排序分組，標示每組台數。手機主機列保留區域。
- 按下立即改變表面與比例，點擊波紋從指標位置開始，在元件邊界裁切。選單依可視空間向上或向下展開，破壞性動作另成一組。Escape 將焦點還給觸發按鈕。
- 開關的滑塊在原控制項內移動，操作後保留焦點。手機的選單列與開關提供至少 44 px 高的觸控區。
- 導覽約 180 ms。進入詳細有向前的位移，返回有反向提示。手機表單從底部展開，完成後交還焦點。減少動態效果時移除空間位移與波紋。
- 時間序列的時間範圍、系列篩選和游標提示外顯。鍵盤左右鍵可逐筆探索樣本。離線主機顯示歷史序列與缺少即時樣本的狀態。
- 手機使用保留安全區的底部導覽。表格改成可點選的主機列，事件接續在伺服器清單之後。抽屜在窄畫面佔滿操作寬度。
- 線上／離線、空清單、讀取中、表單錯誤都使用相同元件語言。儲存結果使用短暫提示，事件詳情保留可重新查詢的紀錄。

## 來源研究與轉譯

- [Web A 上線入口](https://web.telegram.org/a/) 與 [Web K 上線入口](https://web.telegram.org/k/) 是獨立 Web 客戶端。原型的互動對照以公開元件源碼為依據。
- Web A 的全域語意變數、執行期配色與區域覆寫啟發本產品的主題層。實作使用自身的狀態色、表面與控制項變數。 [主題變數說明](https://github.com/Ajaxy/telegram-tt/blob/master/DESIGN.md) · [Sass 變數](https://github.com/Ajaxy/telegram-tt/blob/master/src/styles/_variables.scss)
- Web A 的選單協調定位、背景關閉、鍵盤與轉場，樣式從選單原點縮放。Cape 以原生 popover 提供外點關閉，並用按鈕位置決定對齊。 [選單元件](https://github.com/Ajaxy/telegram-tt/blob/master/src/components/ui/Menu.tsx) · [選單樣式](https://github.com/Ajaxy/telegram-tt/blob/master/src/components/ui/Menu.scss) · [按鈕樣式](https://github.com/Ajaxy/telegram-tt/blob/master/src/components/ui/Button.scss) · [轉場控制](https://github.com/Ajaxy/telegram-tt/blob/master/src/components/ui/Transition.tsx)
- Web K 把按壓位置與波紋時間綁定，依動態效果等級調整轉場。設定列的樣式安排前綴、標題、說明和尾端控制項，切換狀態由獨立控制項維護。Cape 將此原則用於工具列、設定列與行動版路由。 [波紋](https://github.com/morethanwords/tweb/blob/master/src/components/ripple.ts) · [轉場](https://github.com/morethanwords/tweb/blob/master/src/components/transition.ts) · [設定列](https://github.com/morethanwords/tweb/blob/master/src/components/rowTsx.tsx) · [設定列樣式](https://github.com/morethanwords/tweb/blob/master/src/scss/partials/_row.scss) · [切換控制](https://github.com/morethanwords/tweb/blob/master/src/components/checkboxField.ts) · [按鈕選單](https://github.com/morethanwords/tweb/blob/master/src/components/buttonMenu.ts)
- Mini Apps 的動態主題、安全區與低動態原則落在 CSS 媒體查詢、系統主題、手機安全區及原生鍵盤焦點。 [Mini Apps 設計指引](https://core.telegram.org/bots/webapps#designing-mini-apps)

介面、圖示、樣式與互動程式均為本專案獨立撰寫。

## 哨站整合

主機規格後接續服務、流量、程序及可用性。系統設定以既有設定列放置工具入口，個別主機的操作沿用主機選單。表單、讀取、確認與錯誤回饋使用現有對話框和狀態元件。登入沿用工作區表面、主按鈕和個人資料列。
