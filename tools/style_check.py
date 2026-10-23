#!/usr/bin/env python3
"""樣式規則檢查：找出沒有使用共用規則（圓角、字級、動畫時間、曲線、顏色、疊放順序、陰影）的地方。

用法：python3 tools/style_check.py
全部符合會印出「全部符合規則」，否則列出要修的地方並回傳錯誤碼 1。
"""
import os
import re
import sys

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
css = open(os.path.join(WEB, "style.css"), encoding="utf-8").read()
js = open(os.path.join(WEB, "app.js"), encoding="utf-8").read()
root_end = css.index("}", css.index(":root{"))
body_css = css[root_end + 1:]                 # 共用規則本身（第一個 :root）不檢查
line0 = css[:root_end + 1].count("\n") + 1
jline0 = 1

bad = []


def report(where, base, text, idx, msg):
    bad.append(f"  第 {base + text[:idx].count(chr(10))} 行（{where}）：{msg}")


for m in re.finditer(r"border-radius:([^;}]+)", body_css):
    if re.search(r"\d+(\.\d+)?px", m.group(1)):
        report("style.css", line0, body_css, m.start(), f"圓角請用 var(--r-*)：{m.group(0)}")
for m in re.finditer(r"font-size:\s*\d+(\.\d+)?px", body_css):
    report("style.css", line0, body_css, m.start(), f"字級請用 var(--fs-*)：{m.group(0)}")
for m in re.finditer(r"cubic-bezier\([^)]*\)", body_css):
    report("style.css", line0, body_css, m.start(), f"曲線請用 var(--ease)／var(--exit)，彈簧用 var(--sp-fast)／var(--sp)／var(--sp-slow)：{m.group(0)}")
for m in re.finditer(r"((?:transition|animation)(?:-duration)?):([^;}]+)", body_css):
    if "infinite" in m.group(2):
        continue
    for part in m.group(2).split(","):
        if "var(--t-" in part:
            continue                          # 已經用共用時間；後面的數字是延遲，不算
        first = re.search(r"(?<![\w.-])(\d*\.?\d+)m?s\b", part)
        if first:
            report("style.css", line0, body_css, m.start(), f"動畫時間請用 var(--t-*)：{m.group(1)}:{part.strip()}")
for m in re.finditer(r"(?:duration:|\bdur\s*=)\s*(\d+)", js):
    if int(m.group(1)) >= 50:
        report("app.js", jline0, js, m.start(), f"動畫時間請用 T.fast／T.mid／T.slow：{m.group(0)}")
for m in re.finditer(r'"cubic-bezier\([^)]*\)"', js):
    line = js[js.rfind("\n", 0, m.start()) + 1:js.find("\n", m.start())]
    if "const EASE" not in line and "SPRING" not in line:
        report("app.js", jline0, js, m.start(), f"曲線請用 EASE／EXIT，彈簧用 SPRING_F／SPRING：{m.group(0)}")

# 方塊圖示的顏色只能用 style.css 裡定義好的 .ico.樣式（規則見 CLAUDE.md「圖示顏色」）
tiles = set(re.findall(r"\.ico\.([a-z]+)\{background", css))
used = [(m.start(), c) for m in re.finditer(r'\b[a-z]+:\["([a-z]+)","[a-z]+"\]', js) for c in [m.group(1)]]
used += [(m.start(), m.group(1)) for m in re.finditer(r'class="ico big ([a-z]+)"', js)]
used += [(m.start(), m.group(1)) for m in re.finditer(r'modal\(\{icon:"[a-z]+", cls:"([a-z]+)"', js)]
for idx, c in used:
    if c not in tiles:
        report("app.js", jline0, js, idx, f"方塊圖示沒有「{c}」這個顏色，請用：{'、'.join(sorted(tiles))}")
# 每個概念要有自己的色調：ICO 裡不能兩個概念共用一個顏色，style.css 裡也不能兩個 .ico 樣式長得一樣
seen = {}
for m in re.finditer(r'\b([a-z]+):\["([a-z]+)","[a-z]+"\]', js):
    if m.group(2) in seen:
        report("app.js", jline0, js, m.start(), f"「{m.group(1)}」跟「{seen[m.group(2)]}」用了同一個顏色，請給它自己的色調")
    seen.setdefault(m.group(2), m.group(1))
bgs = {}
for m in re.finditer(r"\.ico\.([a-z]+)\{background:([^}]+)\}", body_css):
    if m.group(2) in bgs:
        report("style.css", line0, body_css, m.start(), f".ico.{m.group(1)} 跟 .ico.{bgs[m.group(2)]} 顏色一樣")
    bgs.setdefault(m.group(2), m.group(1))

# 顏色只能寫在顏色變數（--名稱:）和方塊圖示（.ico.名稱）裡，其他地方一律用變數；白色、黑色不算
HEX = re.compile(r"#(?![fF]{3}\b|[fF]{6}\b|000\b|000000\b)[0-9a-fA-F]{3,8}\b")
for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", body_css):
    sel = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S).strip()
    if re.fullmatch(r"\.ico\.[a-z]+", sel) or sel.startswith("@property"):
        continue
    for d in re.finditer(r"([\w-]+)\s*:([^;]+)", m.group(2)):
        if not d.group(1).startswith("--") and HEX.search(d.group(2)):
            report("style.css", line0, body_css, m.start(2) + d.start(), f"顏色請用變數（var(--ok)、var(--warn-hi)…）：{d.group(0).strip()[:60]}")
for m in re.finditer(r"(?:background|color|stroke|fill|stop-color)\s*[:=]\s*\"?[^\";`]*#[0-9a-fA-F]{3,8}", js):
    if HEX.search(m.group(0)):
        report("app.js", jline0, js, m.start(), f"顏色請用 style.css 的變數：{m.group(0)[:60]}")
html_src = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
for m in re.finditer(r"stop-color=\"(#[0-9a-fA-F]{3,8})\"", html_src):
    if HEX.search(m.group(1)):
        report("index.html", 1, html_src, m.start(), f"漸層顏色請用 style=\"stop-color:var(--…)\"：{m.group(0)}")
# 疊放順序只能用 --z-* （0、1、2、-1 這種區塊內的小數字不算）
for m in re.finditer(r"z-index:\s*(-?\d+)", body_css):
    if abs(int(m.group(1))) > 2:
        report("style.css", line0, body_css, m.start(), f"疊放順序請用 var(--z-*)：{m.group(0)}")
# 浮動玻璃和方塊圖示的陰影用共用的 --sh-*，不要每個地方各寫一份
for m in re.finditer(r"box-shadow:inset 0 1px 0 rgba\(255,255,255,\.[34]5?\)", body_css):
    report("style.css", line0, body_css, m.start(), f"上緣亮邊請用 var(--hl) 或 var(--sh-tile)：{m.group(0)}")
# 滑過效果只給有滑鼠的裝置，不然手機點一下會一直停在滑過的樣子
for m in re.finditer(r"(@media \(hover:hover\)\{)?[^{}\n]*:hover\{", body_css):
    if not m.group(1):
        report("style.css", line0, body_css, m.start(), "滑過效果請包在 @media (hover:hover){…} 裡")

if bad:
    print(f"有 {len(bad)} 個地方沒照共用規則：")
    print("\n".join(bad))
    sys.exit(1)
print("全部符合規則 ✨")
