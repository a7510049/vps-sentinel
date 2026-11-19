"""暫時：看飛機照片為什麼很少有"""
import sys, os, time, json, urllib.request, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))
from test_passkey import load_sentinel
S = load_sentinel()
S.fly_night = lambda ap, now=None: False
for rnd in range(2):
    for c in ["TPE", "TSA", "KHH", "RMQ"]:
        S.FLY["cache"].clear()
        for _ in range(20):
            d = S.fly_board(c, bg=True)
            if not d.get("loading"): break
            time.sleep(1.5)
    time.sleep(20)
pl, why = [], collections.Counter()
for c in ["TPE", "TSA", "KHH", "RMQ"]:
    S.FLY["cache"].clear()
    d = S.fly_board(c, bg=True)
    for k in ("arr", "dep", "gnd", "over", "rest", "cargo"):
        for p in d.get(k, []):
            if k in ("arr", "dep") and not p.get("live") and not p.get("reg"):
                why["board row no signal no reg"] += 1; continue
            hx = p.get("id") if len(p.get("id", "")) == 6 else ""
            why[f"{k} reg={'y' if p.get('reg') else 'n'} hex={'y' if hx else 'n'}"] += 1
            pl.append((c, k, p.get("fn") or p.get("cs"), p.get("reg") or "", hx))
print(why)
def raw(by, key):
    try:
        req = urllib.request.Request(f"https://api.planespotters.net/pub/photos/{by}/{key}", headers={"User-Agent": "Mozilla/5.0 (vps-sentinel)"})
        with urllib.request.urlopen(req, timeout=10) as r:
            b = r.read(); j = json.loads(b)
            return r.status, len(j.get("photos") or []), b[:150]
    except Exception as e:
        return repr(e)[:120], -1, b""
seen, n, got, byhex = set(), 0, 0, 0
for c, k, fn, reg, hx in pl:
    key = reg or hx
    if not key or key in seen: continue
    seen.add(key); n += 1
    if n > 60: break
    st, cnt, b = raw("reg", reg) if reg else raw("hex", hx)
    alt = raw("hex", hx) if reg and hx and cnt == 0 else None
    got += cnt > 0; byhex += bool(alt and alt[1] > 0)
    print(f"{c} {k:5} {fn:8} reg={reg:9} hex={hx} -> {st} photos={cnt} {('hex-> ' + str(alt[:2])) if alt else ''} {b[:80] if cnt <= 0 else ''}")
    time.sleep(0.6)
print("tried", n, "with photo", got, "found only by hex", byhex)
S.FLY_PHOTOS["d"] = {}
print("fly_photo sample", [S.fly_photo(r, h) for _, _, _, r, h in pl[:5]])
