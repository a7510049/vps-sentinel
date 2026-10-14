#!/usr/bin/env python3
"""樣式規則檢查：找出沒有使用共用規則（圓角、字級、動畫時間、曲線）的地方。

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
    report("style.css", line0, body_css, m.start(), f"曲線請用 var(--ease)／var(--spring)／var(--exit)：{m.group(0)}")
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
    if "const EASE" not in line:
        report("app.js", jline0, js, m.start(), f"曲線請用 EASE／SPRING／EXIT：{m.group(0)}")

# 方塊圖示的顏色只能用 style.css 裡定義好的 .ico.樣式（規則見 CLAUDE.md「圖示顏色」）
tiles = set(re.findall(r"\.ico\.([a-z]+)\{background", css))
used = [(m.start(), c) for m in re.finditer(r'\b[a-z]+:\["([a-z]+)","[a-z]+"\]', js) for c in [m.group(1)]]
used += [(m.start(), m.group(1)) for m in re.finditer(r'class="ico big ([a-z]+)"', js)]
used += [(m.start(), m.group(1)) for m in re.finditer(r'modal\(\{icon:"[a-z]+", cls:"([a-z]+)"', js)]
for idx, c in used:
    if c not in tiles:
        report("app.js", jline0, js, idx, f"方塊圖示沒有「{c}」這個顏色，請用：{'、'.join(sorted(tiles))}")

if bad:
    print(f"有 {len(bad)} 個地方沒照共用規則：")
    print("\n".join(bad))
    sys.exit(1)
print("全部符合規則 ✨")
