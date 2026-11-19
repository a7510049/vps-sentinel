"""暫時：幾分後落地準不準（桃園，跑 12 分鐘，記每一架每次算的時間，落地後比對）"""
import sys, os, time, json, collections, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))
from test_passkey import load_sentinel
S = load_sentinel()
S.fly_night = lambda ap, now=None: False
V = {"old": dict(trk=False, g=(600, 120)), "new120": dict(trk=True, g=(600, 120)), "new80": dict(trk=True, g=(300, 80)), "new60": dict(trk=True, g=(200, 60))}
pred, land, info = collections.defaultdict(list), {}, {}
end = time.time() + 12 * 60
while time.time() < end:
    S.FLY["cache"].clear()
    try:
        d = S.fly_board("TPE", bg=True)
    except Exception as e:
        print("err", e); time.sleep(10); continue
    if d.get("loading"): time.sleep(2); continue
    now = d["t"]
    for p in d["arr"] + d.get("gnd", []) + d.get("rest", []):
        if p.get("x") is None or not p.get("live", True): continue
        i = p["id"]
        if (p.get("alt") or 0) == 0 and (p.get("d") or 99) < 5:
            if i in pred and i not in land: land[i] = now
            continue
        if p.get("ph") != "arr" or (p.get("spd") or 0) < 90: continue
        info[i] = p.get("fn") or p.get("cs")
        row = {}
        for k, v in V.items():
            S.FLY_GLIDE = v["g"]
            row[k] = S.fly_eta("TPE", p["x"], p["y"], p["spd"], p.get("trk") if v["trk"] else None, p.get("alt") if v["trk"] else None)
        pred[i].append((now, p.get("d"), p.get("alt"), p.get("trk"), row))
    time.sleep(10)
print("landed", len(land), "tracked", len(pred))
err = {k: collections.defaultdict(list) for k in V}
for i, t1 in land.items():
    print(f"\n{info.get(i)} landed {time.strftime('%H:%M:%S', time.gmtime(t1 + 8*3600))}")
    for (t, dd, alt, trk, row) in pred[i][::3]:
        real = (t1 - t) / 60
        print(f"  -{real:4.1f}m d={dd} alt={alt} trk={trk} " + " ".join(f"{k}={v:.1f}" for k, v in row.items()))
    for (t, dd, alt, trk, row) in pred[i]:
        real = (t1 - t) / 60
        b = "0-3" if real < 3 else "3-6" if real < 6 else "6-10" if real < 10 else "10+"
        for k, v in row.items(): err[k][b].append(v - real)
for k, bs in err.items():
    print(k, " ".join(f"{b}: n={len(e)} avg={sum(e)/len(e):+.1f} abs={sum(map(abs,e))/len(e):.1f}" for b, e in sorted(bs.items()) if e))
