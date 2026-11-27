---
name: dependency-audit
description: 依賴審查：升級或加入套件、改 Docker 映像檔版本（FileBrowser、AdGuard Home）、改 yt-dlp／ffmpeg／openssl 用法、改 .claude/qa 開發工具版本時使用。先查官方文件（Context7）再改。
---

# 依賴審查

1. 主機上只能用 Python 內建模組：`python3 .claude/qa/gate.py deps`（非內建模組、網頁載入外部程式都會被抓）。
2. 外部程式（FileBrowser Quantum、AdGuard Home、yt-dlp、ffmpeg、openssl）：用 Context7 MCP（`resolve-library-id` → `query-docs`）查目前版本的官方文件；CLAUDE.md 記過的坑（例如 FileBrowser 設定檔多一個欄位就起不來）要先看。
3. 開發工具（`.claude/qa/package.json`、`.claude/qa/venv`）版本要寫死，不用 `^`；改完 `npm audit`（在 `.claude/qa`）。
4. 改完 `python3 .claude/qa/gate.py standard`。
