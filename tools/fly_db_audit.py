"""機場起降：用真實的飛機訊號核對航空公司表（FLY_AL）和機型表（data/actypes.tsv），列出對不上的（GitHub 上手動執行 fly-audit）

- 呼號前三碼在表上，但飛機資料庫寫的經營者看起來是別家（例如私人飛機 TWY 被當成首爾航空）
- 常出現、表上沒有的呼號前三碼（要不要補）
- 機型代碼查不到分類的
- 官網航班表上的航空公司兩碼，表上沒有的（沒有中文名稱、標誌）
"""
import collections
import os
import re
import sys
import time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))
from test_passkey import load_sentinel  # noqa: E402

S = load_sentinel()
S.fly_night = lambda ap, now=None: False
pre, ops, types, regs = collections.Counter(), collections.defaultdict(collections.Counter), collections.Counter(), {}
for rnd in range(4):
    for c in S.FLY_PIN:
        ap = S.fly_db()[c]
        try:
            ac, _, _ = S.fly_fetch(ap)
        except Exception as e:  # noqa: BLE001
            print("抓不到", c, e)
            continue
        for a in ac or []:
            if not isinstance(a, dict):
                continue
            cs, t, op = str(a.get("flight") or "").strip().upper(), str(a.get("t") or "").upper(), str(a.get("ownOp") or "")
            m = re.match(r"([A-Z]{3})\d", cs)
            if m:
                pre[m.group(1)] += 1
                ops[m.group(1)][op] += 1
            if t:
                types[t] += 1
                regs.setdefault(t, (str(a.get("desc") or ""), cs, str(a.get("r") or "")))
    for c in S.FLY_PIN:
        try:
            S.fly_fids(c)
        except Exception:  # noqa: BLE001
            pass
    time.sleep(60)


print("\n== 呼號前三碼在表上，經營者看起來不對（請人工確認）")
for p, n in pre.most_common():
    if p in S.FLY_AL:
        for op, k in ops[p].most_common(3):
            if op and k >= 1:
                print(f"  {p} → 表上 {S.FLY_AL[p]}，資料庫經營者「{op}」x{k}")
print("\n== 表上沒有的呼號前三碼（出現次數、經營者）")
for p, n in pre.most_common(60):
    if p not in S.FLY_AL:
        print(f"  {p} x{n}: {dict(ops[p].most_common(2))}")
print("\n== 查不到分類的機型代碼")
for t, n in types.most_common():
    if not S.fly_act(t):
        print(f"  {t} x{n} {regs[t]} → kind={S.fly_kind(t)!r}")
print("\n== 各機型的形狀、用途（給人看一遍）")
for t, n in types.most_common(80):
    print(f"  {t:5} x{n:<3} {S.fly_kind(t):4} {S.fly_use('', None, t, '', False):6} {regs[t][0][:40]}")
iata = {v[0] for v in S.FLY_AL.values()}
print("\n== 官網表上的航空公司兩碼，表上沒有的")
miss = collections.Counter()
for c in S.FLY_PIN:
    for r in (S.FLY_FIDS.get(c) or {}).get("rows") or []:
        m = re.match(r"([A-Z0-9]{2})\d", r.get("fn") or "")
        if m and m.group(1) not in iata:
            miss[(m.group(1), r.get("al") or "")] += 1
for (k, n), v in miss.most_common():
    print(f"  {k} {n} x{v}")
