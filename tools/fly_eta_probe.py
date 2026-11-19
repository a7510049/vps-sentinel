"""暫時：幾分後落地準不準（跑 30 分鐘，記每一架每次算的位置，落地後比對）"""
import sys, os, time, json, collections, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))
from test_passkey import load_sentinel
S = load_sentinel()
S.fly_night = lambda ap, now=None: False
AP = ["TPE", "KHH", "RMQ", "TSA"]
pred, land, info = collections.defaultdict(list), {}, {}
end = time.time() + 30 * 60
while time.time() < end:
    for c in AP:
        S.FLY["cache"].clear()
        try:
            d = S.fly_board(c, bg=True)
        except Exception as e:
            print("err", c, e); continue
        if d.get("loading"): continue
        now = d["t"]
        for p in d["arr"] + d.get("gnd", []) + d.get("rest", []) + d.get("over", []):
            if p.get("x") is None: continue
            i = c + p["id"]
            if (p.get("alt") or 0) == 0 and (p.get("d") or 99) < 5:
                if i in pred and i not in land: land[i] = now
                continue
            if p.get("ph") != "arr" or (p.get("spd") or 0) < 90: continue
            info[i] = p.get("fn") or p.get("cs")
            pred[i].append([now, c, p["x"], p["y"], p["spd"], p.get("trk"), p.get("alt"), p.get("vr"), (S.FLY["rdir"].get(c) or [None])[0], p.get("eta")])
    time.sleep(8)
print("landed", len(land), "tracked", len(pred))
print("DATA" + json.dumps({"land": land, "pred": {i: pred[i] for i in land}, "info": info}))
