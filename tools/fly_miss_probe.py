"""暫時：雷達上有、看板沒有的客機（跑 20 分鐘，四個機場）"""
import sys, os, time, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))
from test_passkey import load_sentinel
S = load_sentinel()
S.fly_night = lambda ap, now=None: False
AP = ["TPE", "KHH", "RMQ", "TSA"]
seen = {}
end = time.time() + 20 * 60
while time.time() < end:
    for c in AP:
        S.FLY["cache"].clear()
        try:
            d = S.fly_board(c, bg=True)
        except Exception as e:
            print("err", c, e); continue
        if d.get("loading"): continue
        fids = S.fly_fids(c, 0)
        if not isinstance(fids, list): fids = []
        for p in d["rest"] + d["over"]:
            if p.get("use") == "貨機" or not p.get("fn"): continue
            if p in d["over"] and not (p.get("d", 99) < 25 and (p.get("alt") or 0) < 3000): continue
            k = c + p["fn"]
            if k in seen: seen[k]["n"] += 1; continue
            f = S.fly_fn(p["fn"])
            num = "".join(ch for ch in f[2:] if ch.isdigit()).lstrip("0")
            near = [dict(fn=r["fn"], io=r["io"], sch=time.strftime("%m-%d %H:%M", time.gmtime(r["sch"] + 8 * 3600)), st=r["st"], pl=r["pl"], share=r.get("share"))
                    for r in fids if S.fly_fn(r["fn"]) == f or f in [S.fly_fn(x) for x in r.get("share") or []] or ("".join(ch for ch in r["fn"][2:] if ch.isdigit()).lstrip("0") == num and r["fn"][:2] == f[:2])]
            hit = S.fly_fids_find(p["fn"])
            seen[k] = dict(n=1, ap=c, fn=p["fn"], cs=p.get("cs"), reg=p.get("reg"), t=p.get("t"), ph=p["ph"], st=p.get("st"), alt=p.get("alt"), d=p.get("d"), vr=p.get("vr"),
                           org=(p.get("org") or {}).get("code"), dst=(p.get("dst") or {}).get("code"), guess=p.get("guess"), use=p.get("use"),
                           fids=near, find=hit and [hit[0], hit[1].get("io"), hit[1].get("fn")], when=time.strftime("%H:%M", time.gmtime(time.time() + 8 * 3600)))
    time.sleep(25)
for k, v in seen.items():
    print("MISS", json.dumps(v, ensure_ascii=False))
