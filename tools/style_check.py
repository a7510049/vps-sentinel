#!/usr/bin/env python3
"""樣式規則檢查：找出沒有使用共用規則（圓角、字級、動畫時間、曲線）的地方。

用法：python3 tools/style_check.py
全部符合會印出「全部符合規則」，否則列出要修的地方並回傳錯誤碼 1。
"""
import os
import re
import sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sentinel.py")
s = open(SRC, encoding="utf-8").read()
a, b = s.index("<style>"), s.index("</style>")
css, js = s[a:b], s[b:]
root_end = css.index("}", css.index(":root{"))
body_css = css[root_end + 1:]                 # 共用規則本身（第一個 :root）不檢查
line0 = s[:a].count("\n") + css[:root_end + 1].count("\n") + 1
jline0 = s[:b].count("\n") + 1

bad = []


def report(where, base, text, idx, msg):
    bad.append(f"  第 {base + text[:idx].count(chr(10))} 行（{where}）：{msg}")


for m in re.finditer(r"border-radius:([^;}]+)", body_css):
    if re.search(r"\d+(\.\d+)?px", m.group(1)):
        report("CSS", line0, body_css, m.start(), f"圓角請用 var(--r-*)：{m.group(0)}")
for m in re.finditer(r"font-size:\s*\d+(\.\d+)?px", body_css):
    report("CSS", line0, body_css, m.start(), f"字級請用 var(--fs-*)：{m.group(0)}")
for m in re.finditer(r"cubic-bezier\([^)]*\)", body_css):
    report("CSS", line0, body_css, m.start(), f"曲線請用 var(--ease)／var(--spring)／var(--exit)：{m.group(0)}")
for m in re.finditer(r"((?:transition|animation)(?:-duration)?):([^;}]+)", body_css):
    if "infinite" in m.group(2):
        continue
    for part in m.group(2).split(","):
        if "var(--t-" in part:
            continue                          # 已經用共用時間；後面的數字是延遲，不算
        first = re.search(r"(?<![\w.-])(\d*\.?\d+)m?s\b", part)
        if first:
            report("CSS", line0, body_css, m.start(), f"動畫時間請用 var(--t-*)：{m.group(1)}:{part.strip()}")
for m in re.finditer(r"(?:duration:|\bdur\s*=)\s*(\d+)", js):
    if int(m.group(1)) >= 50:
        report("JS", jline0, js, m.start(), f"動畫時間請用 T.fast／T.mid／T.slow：{m.group(0)}")
for m in re.finditer(r'"cubic-bezier\([^)]*\)"', js):
    line = js[js.rfind("\n", 0, m.start()) + 1:js.find("\n", m.start())]
    if "const EASE" not in line:
        report("JS", jline0, js, m.start(), f"曲線請用 EASE／SPRING／EXIT：{m.group(0)}")

if bad:
    print(f"有 {len(bad)} 個地方沒照共用規則：")
    print("\n".join(bad))
    sys.exit(1)
print("全部符合規則 ✨")
