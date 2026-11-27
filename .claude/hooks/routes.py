"""任務分類表（UserPromptSubmit 用）。人看的版本在 .claude/skills/adaptive-orchestrator/SKILL.md。

每條：(名稱, 關鍵字, 最低等級, 風險, 技能／工具／代理)
"""
import re

ROUTES = [
    ("新增功能", r"新增|加上|加一個|加個|增加|做一個|做個|實作|新功能|支援|\badd\b|implement|feature",
     2, "中", "superpowers:brainstorming（需求不清時）→ superpowers:writing-plans → superpowers:test-driven-development；用到第三方文件查 Context7 MCP"),
    ("修改介面", r"介面|畫面|樣式|版面|排版|按鈕|顏色|配色|字體|字級|圖示|UI|設計|好看|醜|對齊|間距|圓角|深色|淺色",
     1, "低", "example-skills:frontend-design → frontend-audit（含響應式、視覺比對、axe）；派 frontend-reviewer"),
    ("修改互動元件", r"點擊|點了|按下|滑動|往下滑|往上滑|拖|手勢|彈窗|對話框|視窗|選單|輸入框|表單|鍵盤|快捷鍵|返回鍵|click|modal|dialog",
     2, "中", "example-skills:webapp-testing＋Playwright MCP＋axe（gate.py browser）"),
    ("修改動畫或 CSS", r"動畫|轉場|淡入|淡出|閃|卡頓|卡卡|掉幀|延遲|流暢|順暢|CSS|捲動|滾動|效能|耗電|lag|jank",
     2, "中", "performance-audit＋Chrome DevTools MCP＋Stylelint（gate.py css）；派 performance-reviewer"),
    ("發現錯誤", r"錯誤|壞了|壞掉|bug|不能|不會|沒反應|失敗|當掉|崩潰|異常|報錯|跑不動|打不開|不見|消失|怪怪|不對|修好|修一下|修正",
     2, "中", "superpowers:systematic-debugging（先重現、找根本原因）→ superpowers:test-driven-development（先寫會失敗的測試）"),
    ("行動裝置問題", r"iPhone|iPad|iOS|Safari|安卓|Android|手機|平板|LINE|WebView|觸控|真機",
     3, "中", "cross-platform-debug；並行派 ios-debugger／android-debugger（依平台）"),
    ("修改 API", r"\bAPI\b|/api/|後端|伺服器|endpoint|路由|回傳|JSON|主機之間|peer",
     2, "中", "api-contract-audit（gate.py api）＋整合測試（tests/ 起真的哨兵）"),
    ("修改登入或權限", r"登入|登出|密碼|PIN|權限|金鑰|token|TOKEN|驗證碼|驗證|加密|解密|安全|SSH|cookie|session|配對|憑證|TLS|CSP",
     3, "高", "security-audit（Semgrep＝gate.py security）；派 security-reviewer 獨立審查"),
    ("大型重構", r"重構|架構|拆成|拆開|搬到|整理整個|全面改|大改|refactor|rewrite|重寫",
     4, "高", "architecture-audit（功能完整性）→ 完整 Quality Gate；派 architecture-reviewer＋independent-qa"),
    ("清理舊程式碼", r"清理|清掉|刪掉沒用|沒用到|舊程式|死碼|dead code|移除舊|精簡",
     2, "中", "dead-code-audit（vulture＋網頁函式檢查＝gate.py deadcode）；Knip 不適用此專案"),
    ("修改依賴", r"依賴|套件|升級|版本更新|函式庫|library|npm|pip|映像檔|docker image|FileBrowser|AdGuard|yt-dlp|ffmpeg",
     2, "中", "dependency-audit（gate.py deps）＋Context7 MCP 查官方文件"),
    ("提交或部署", r"提交|commit|推送|\bpush\b|發布|部署|release|上線|發版|合併請求|PR\b",
     2, "高", "quality-gate → release-check（gate.py release）；推送／部署仍要使用者授權"),
]

ACT = re.compile(r"改|修|加|新增|做|刪|移除|拿掉|重構|優化|調整|換成|實作|建立|寫一個|處理|解決|讓它|幫我|請|改善|升級|"
                 r"\bfix|\badd\b|change|update|implement|remove|refactor|make|build|create", re.I)
ASK = re.compile(r"[？?]|嗎|什麼|為什麼|怎麼回事|如何|是否|是不是|有沒有|解釋|說明一下|比較|差別|意思|介紹|看法|建議|評估一下|^what|^why|^how", re.I)


def classify(prompt):
    p = prompt.strip()
    hits = [r for r in ROUTES if re.search(r[1], p, re.I)]
    act = bool(ACT.search(p.replace("請問", "")))
    ask = bool(ASK.search(p))
    if p.startswith("/") or not p:
        return None
    if ask and not act:
        return {"level": 0, "types": [h[0] for h in hits], "hits": []}
    if not act and not hits:
        return {"level": 0, "types": [], "hits": []}
    level = max([h[2] for h in hits] or [1])
    risk = "高" if any(h[3] == "高" for h in hits) else ("中" if any(h[3] == "中" for h in hits) else "低")
    # 好幾種一起出現（例如手機＋動畫＋登入）往上加一級
    # 等級 4 只給重構、發布這類本身就是 4 的；其他最多加到 3
    if len({h[0] for h in hits}) >= 3 and level < 3:
        level += 1
    return {"level": level, "risk": risk, "types": [h[0] for h in hits], "hits": hits}
