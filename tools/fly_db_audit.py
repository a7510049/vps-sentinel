"""機場起降：用真實的飛機訊號核對航空公司表（FLY_AL）和機型表（data/actypes.tsv），列出對不上的（GitHub 上手動執行 fly-audit）

- 呼號前三碼在表上，但飛機資料庫寫的經營者看起來是別家（例如私人飛機 TWY 被當成首爾航空）
- 常出現、表上沒有的呼號前三碼（要不要補）
- 機型代碼查不到分類的
- 官網航班表上的航空公司兩碼，表上沒有的（沒有中文名稱、標誌）
- 呼號的航空公司跟飛機登記的公司（adsbdb）不一樣的，貨機先查（租機、代飛，或我們的名稱表舊了）
- 看板「貨機」分頁每一架的班號、公司、機型、註冊號，給人看一遍
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
planes = {}                                        # 註冊號（沒有就飛機編號）→ (呼號, 機型, 是不是貨機)
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
            k = str(a.get("r") or "").upper() or "~" + str(a.get("hex") or "").lower()
            if m and len(k) > 2:
                planes[k] = (cs, t, m.group(1) in S.FLY_CARGO_ICAO or S.fly_use(cs, None, t, "", False) == "貨機")
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

print("\n== 看板「貨機」分頁（給人看一遍）")
for c in S.FLY_PIN:
    try:
        d = S.fly_board(c)
    except Exception as e:  # noqa: BLE001
        print("  看板抓不到", c, e)
        continue
    for p in d.get("cargo") or []:
        print(f"  {c} {p.get('fn') or '-':8} {p.get('cs') or '-':8} {p.get('al') or '-':10} {p.get('model') or p.get('t') or '-':12} {p.get('reg') or '-':9} {p.get('st') or ''}")
print("\n== 呼號的公司跟飛機登記的公司不一樣（貨機在前）")
bad = 0
for k, (cs, t, cargo) in sorted(planes.items(), key=lambda x: not x[1][2])[:250]:
    o = S.fly_owner(k if not k.startswith("~") else "", k[1:] if k.startswith("~") else "")
    time.sleep(.3)
    if o.get("op") and o["op"] != cs[:3]:
        bad += 1
        print(f"  {'貨機' if cargo else '客機'} {cs:8} {k:9} {t:5} 表上 {(S.FLY_AL.get(cs[:3]) or ('', '?'))[1]:10} 登記 {o['op']} {o['opn']}")
print(f"  共 {bad} 架（查了 {min(len(planes), 250)} 架）")

print("\n== 官網寫的公司名稱跟表上不一樣（可能改名了，請人工看）")
seen = set()
for c in S.FLY_PIN:
    try:
        raw = S.FLY_FIDS_GET[c]()
    except Exception as e:  # noqa: BLE001
        print("  官網表抓不到", c, str(e)[:80])
        continue
    for r in raw or []:
        k = (r.get("fn") or "")[:2]
        mine = next((v[1] for v in S.FLY_AL.values() if v[0] == k), "")
        if mine and r.get("al") and r["al"] != mine and (k, r["al"]) not in seen:
            seen.add((k, r["al"]))
            print(f"  {k} 表上 {mine}，{c} 官網 {r['al']}")
