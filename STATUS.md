# Cape 移植與驗證狀態

清理前的還原點為 `4db03f297e974f72a184f1af56429c82eeeb9777`（v5.59）。仍包含哨站舊控制台、完整航班前端及相簿前端的歷史版本為 `813107ff9240116ddc202a57da7b05b4283d1b99`（5.58）。兩者均可從 Git 歷史取回。

## 尚未完整移植

| 範圍 | 5.58 原始碼位置與行為 | Cape 現況與後續移植需核對的契約 |
| --- | --- | --- |
| 航班進階雷達 | [web/fly.js 的圖層與雷達](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/fly.js#L249-L401)、[web/fly.js 的雷達實作](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/fly.js#L401)、[舊雷達樣式](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/style.css)。全頁雷達包含縮放、航跡、地形、地勤車及飛機位置動畫。 | Cape 有航班列表、分享及基本機場雷達。後續以 `cape/app.js` 的航班工具呈現，核對 `sentinel.py` 的 `/api/flights` 分支、`fly.py` 的機場地理與航跡回傳、`data/apmap.tsv`、`data/terrain.bin` 和 `tests/test_flights.py`。保留舊分享網址、使用期限和裝置限制。 |
| 相簿 EXIF 與攝影工具 | [web/album.js 的拍攝習慣](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/album.js#L1740)、[對焦框](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/album.js#L2286)、[並排比較](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/album.js#L3164)、[色域](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/album.js#L3986)。舊訪客頁顯示拍攝參數、對焦位置和相片比較等資訊。 | Cape 訪客從 `cape/album-guest.js` 載入相簿。後續核對 `album.py`、`photo.py`、`/a/<code>/m` 的相片中繼資料、相片權限及 `tests/test_album.py`、`tests/test_photo.py`。 |
| 相簿地圖、時間軸與舊版管理操作 | [web/album.js 的地圖](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/album.js#L1788)、[旅程時間軸](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/album.js#L1917)、[舊相簿樣式](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/album.css#L123)、[web/app.js 的相簿管理](https://github.com/a7510049/vps-sentinel/blob/813107ff9240116ddc202a57da7b05b4283d1b99/web/app.js)。舊版可依地點分組、顯示旅程路線及播放拍攝時間軸，管理端提供更多細部控制。 | Cape 已有基本相簿管理和訪客瀏覽。後續核對 `/api/album`、`/a/<code>/m` 和 `album.py` 的地理及圖塊路由。沿用 `albums.json`、相簿索引、訪客票證和地點資料的權限規則。 |

## 保留的執行路徑

- `sentinel.py:watch_page` 仍回應被監看主機的首頁。該頁使用 `/pin.js` 解除配對，包含打亂的數字鍵盤、PBKDF2/HMAC 挑戰和未提供 Web Crypto 時的既有運算路徑。Cape 管理介面使用自己的 ES 模組。
- `web/album-sw.js` 仍由 `/a/sw.js` 提供。Cape 訪客頁註冊此背景程式以讀取加密媒體，既有訪客連結與存取限制沿用原契約。
- `web/font.woff2`、`/flag/*.png`、既有網站圖示及 manifest 仍有公開 URL 或自動化契約測試。既有書籤、已安裝的網站捷徑及快取客戶端可繼續取得資產。`/fly`、`/s/<code>` 和還原參數也仍有有效入口。
- `sentinel.py` 透過 `include()` 載入的後端、`cape_deploy.py` 資產清單、安裝與更新檔案清單、歷史資料讀取及遷移、第三方整合和 GitHub Actions 均沿用既有流程。AdGuard 公網位址驗證使用 `ab_probe_ips`，備份檔權限在既有寫入路徑設定，配對認證使用會回傳主機紀錄的 `pair_key_find`。
- 安裝腳本保留舊檔清單以便已安裝的主機清除過時資產。部署時的上一版回復目錄由安裝腳本在主機上建立。

## 正式環境待驗證

- **VPS 公開網域與 Caddy／TLS**。依正式 DNS、防火牆、Caddy 路由及憑證設定驗證重新導向、反向代理、實際網域下的 PIN 與通行金鑰。
- **第三方整合**。在正式環境驗證 Telegram、FileBrowser Quantum、Joplin、AdGuard Home、航班及相簿外部資料來源。
- 隔離 Linux 的安裝、更新及資料保留測試，和瀏覽器測試資料的回歸結果，只涵蓋其測試環境。
