"""機場起降：用真實資料把四個機場跑一遍，列出看起來不對的地方（GitHub 上手動執行 fly-audit）"""
import sys, os, time, re, json, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))
from test_passkey import load_sentinel
S = load_sentinel()
S.fly_night = lambda ap, now=None: False
def hm(t): return time.strftime("%m/%d %H:%M", time.gmtime(t + 8 * 3600)) if t else "-"
def pl(x): return f"{x.get('code')}/{x.get('name')}{'?' if x.get('guess') else ''}" if x else "None"
for rnd in range(3):
    for c in ["TPE", "TSA", "KHH", "RMQ"]:
        S.FLY["cache"].clear()
        for _ in range(20):
            d = S.fly_board(c, bg=True)
            if not d.get("loading"): break
            time.sleep(1.5)
    time.sleep(25)
now = time.time()
for c in ["TPE", "TSA", "KHH", "RMQ"]:
    S.FLY["cache"].clear()
    d = S.fly_board(c, bg=True)
    print(f"\n===== {c} srcs={d.get('srcs')} arr={len(d['arr'])} dep={len(d['dep'])} gnd={len(d['gnd'])} over={len(d['over'])} rest={len(d['rest'])} now={hm(now)}")
    issues = []
    fids = S.FLY_FIDS.get(c, {}).get("rows") or []
    print("  FIDS rows", len(fids), "ok", hm(S.FLY_FIDS.get(c, {}).get("ok")), "near", sum(1 for r in fids if abs((r.get("est") or r["sch"]) - now) < 3 * 3600))
    issues = []
    fids = S.FLY_FIDS.get(c, {}).get("rows") or []
    print("  FIDS rows", len(fids), "ok", hm(S.FLY_FIDS.get(c, {}).get("ok")), "near", sum(1 for r in fids if abs((r.get("est") or r["sch"]) - now) < 3 * 3600))
    if c == "TPE":
        b = S.fly_get(S.FLY_FIDS_URL["TPE"], timeout=30)
        print("  TPE raw", len(b), b[:200])
        try:
            print("  parsed", len(S.fly_fids_tpe()))
        except Exception as e:
            print("  parse error", repr(e))
    for r in fids:
        if r.get("est") and abs(r["est"] - r["sch"]) > 6 * 3600:
            issues.append(f"FIDS 時間差很大 {r['fn']} sch={hm(r['sch'])} est={hm(r['est'])} st={r['st']}")
        if not re.search(r"[一-鿿]", r.get("pl") or ""):
            issues.append(f"FIDS 地名不是中文 {r['fn']} {r['pc']} {r['pl']}")
    for io in ("arr", "dep"):
        cnt = collections.Counter(p["fn"] for p in d[io])
        for fn, n in cnt.items():
            if n > 1:
                issues.append(f"{io} 重複 {fn} x{n}: " + " | ".join(f"{hm(p.get('sch'))} {p['st']} live={p.get('live')}" for p in d[io] if p["fn"] == fn))
        ids = collections.Counter(p["id"] for p in d[io])
        for i, n in ids.items():
            if n > 1: issues.append(f"{io} 同一個 id 兩列 {i}")
        for p in d[io]:
            gap = ((p.get("est") or p.get("sch") or 0) - (p.get("sch") or 0)) / 60
            if abs(gap) > 300: issues.append(f"{io} {p['fn']} 早晚 {gap:.0f} 分 sch={hm(p.get('sch'))} est={hm(p.get('est'))}")
            if p.get("live") and p.get("lag"): issues.append(f"{io} {p['fn']} 收得到訊號但標還沒 st={p['st']} alt={p.get('alt')} d={p.get('d')}")
            if not p.get("al"): issues.append(f"{io} {p['fn']} 沒有航空公司")
    allp = [(k, p) for k in ("arr", "dep", "gnd", "over", "rest") for p in d[k]]
    idc = collections.Counter(p["id"] for k, p in allp if not p.get("fids") or p.get("live"))
    for i, n in idc.items():
        if n > 1: issues.append(f"同一架出現在 {n} 個地方 {i}: " + ",".join(f"{k}:{p['fn']}" for k, p in allp if p['id'] == i))
    for k, p in allp:
        if p.get("org") and p.get("dst") and p["org"].get("code") and p["org"].get("code") == p["dst"].get("code"):
            issues.append(f"{k} {p['fn']} 出發地＝目的地 {pl(p['org'])}")
        if k in ("over", "rest") and p.get("alt") is not None and p["alt"] < 1500 and p.get("d", 99) < 25:
            issues.append(f"{k} {p['fn'] or p['reg']} 很低很近卻不在看板 alt={p['alt']} d={p['d']} vr={p.get('vr')} ph={p['ph']} st={p['st']} {pl(p.get('org'))}->{pl(p.get('dst'))} use={p.get('use')}")
        if k in ("arr", "dep") and p.get("live") and p.get("d", 0) > 400:
            issues.append(f"{k} {p['fn']} 配到很遠的飛機 d={p['d']}")
        if p.get("use") == "" and k != "over":
            issues.append(f"{k} {p['fn'] or p['reg']} 沒有用途 t={p.get('t')}")
    print("\n".join("  ! " + x for x in issues) or "  (沒發現問題)")
    for k, p in allp:
        if k in ("arr", "dep") and not p.get("live"): continue
        print(f"  {k:4} {p['fn'] or p['reg'] or p['id']:8} {p.get('cs',''):8} {p.get('al','')[:6]:6} {p.get('use',''):5} {p.get('t',''):5} alt={p.get('alt')} d={p.get('d')} vr={p.get('vr')} ph={p.get('ph')} st={p['st']} {pl(p.get('org'))} -> {pl(p.get('dst'))} sch={hm(p.get('sch'))}")
print("\nROUTES", sum(1 for v in S.FLY["routes"].values() if v[1]), "/", len(S.FLY["routes"]))
