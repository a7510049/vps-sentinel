# Cape 本機開發

一般安裝、更新和備份請見[專案說明](../README.md)。已安裝的服務會直接提供 `/cape/`，並透過本機 Unix socket 啟動規則服務。

使用 Node.js 24 測試獨立開發模式：

```bash
cd cape
npm test
node tests/fixture.mjs
```

在瀏覽器開啟 `http://127.0.0.1:4196/cape/`，選擇「哨站密碼」，輸入測試用密碼 `cape-fixture`。開發測試資料只由測試服務提供。

介面規則見 [DESIGN.md](../DESIGN.md)。
