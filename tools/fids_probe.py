"""暫時：看四個機場官網表有哪些欄位（行李轉盤、報到櫃台）"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))
from test_passkey import load_sentinel
S = load_sentinel()
U = S.FLY_FIDS_URL
b = S.fly_get(U["TPE"], ua="Mozilla/5.0", timeout=30).decode("big5hkscs", "replace").splitlines()
import collections
for io in "AD":
    rows = [l.split(",") for l in b if l.split(",")[1:2] == [io]]
    print("TPE", io, len(rows), "ncols", collections.Counter(len(r) for r in rows))
    for i in range(14, max(len(r) for r in rows)):
        print("  col", i, collections.Counter(r[i].strip() for r in rows if len(r) > i).most_common(8))
for f in ("arr.json", "dep.json"):
    j = json.loads(S.fly_get(U["KHH"] + f).decode("utf-8-sig"))
    print("KHH", f, json.dumps(j[len(j)//2], ensure_ascii=False)[:1500])
for io in ("dep", "arr"):
    n = 1 if io == "dep" else 2
    body = {"AirFlyLine": 2, "AirFlyIO": n, "Limit": 3, "Culture": 1, "FlightNumber": None, "AirLineCode": None, "AirportCode": None, "Sort": "ExpectDepartureTime" if n == 1 else "ExpectArrivalTime", "Order": "asc"}
    print("TSA", io, json.dumps((json.loads(S.fly_get(U["TSA"], body).decode("utf-8-sig")).get("rows") or [None])[0], ensure_ascii=False)[:1500])
for n in (1, 2):
    try:
        j = json.loads(S.fly_get(U["RMQ"] + str(n), timeout=90).decode("utf-8-sig"))
        print("RMQ", n, json.dumps((j.get("data") or [None])[0], ensure_ascii=False)[:1500])
    except Exception as e:
        print("RMQ", n, e)
