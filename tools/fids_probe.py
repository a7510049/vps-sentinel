"""暫時：看桃園機場定期航班（客、貨機）資料"""
import collections, urllib.request
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
for u in ("http://odp.taoyuan-airport.com/dataset/2022110903?format=csv", "https://odp.taoyuan-airport.com/dataset/2022110903?format=csv", "https://odp.taoyuan-airport.com/"):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=150) as r:
            b = r.read()
    except Exception as e:
        print(u, e); continue
    t = b.decode("utf-8-sig", "replace").splitlines()
    print(u, len(b), len(t))
    for l in t[:6]: print("  ", l[:300])
    rows = [l.split(",") for l in t[1:]]
    print("  col0", collections.Counter(r[0] for r in rows).most_common(10))
    print("  col1", collections.Counter(r[1] for r in rows if len(r) > 1).most_common(40))
    cg = [l for l in t if "貨" in l.split(",")[0] or l.split(",")[0].strip().upper() in ("C", "F", "CARGO")]
    for l in cg[:15]: print("  CARGO", l[:200])
