"""暫時：列出四個機場官網表上的航空公司名稱"""
import collections, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("SENTINEL_CONF", "/tmp/none.conf")
import sentinel as s
seen = collections.defaultdict(set)
for code, fn in s.FLY_FIDS_GET.items():
    try:
        rows = fn()
    except Exception as e:  # noqa: BLE001
        print(code, "失敗", e); continue
    for r in rows:
        seen[r["fn"][:2]].add((code, r.get("al", "")))
for k in sorted(seen):
    print(k, s.fly_al_zh(k), sorted(seen[k]))
