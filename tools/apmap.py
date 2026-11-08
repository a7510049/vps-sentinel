"""產生 data/apmap.tsv：台灣四個機場的跑道、滑行道、機坪、航廈形狀（雷達放大時畫）

來源是 OpenStreetMap（© OpenStreetMap 貢獻者，ODbL 授權），用 Overpass 查機場 5 公里內 aeroway 的線和面。
每行：機場代碼、種類（rw 跑道／tw 滑行道／ap 機坪／tm 航廈／jb 空橋）、寬度（公尺，跑道用；沒有寫 0）、經度,緯度 …
登機門一行一個：機場代碼、gt、登機門編號（例如 A5）、經度,緯度（班機細節的登機門導引用）
點太密的先簡化（3 公尺內的彎拿掉）。這台開發機連不到 Overpass，要在 GitHub Actions 上跑（.github/workflows/apmap.yml）。
"""
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "data", "apmap.tsv")
APS = {"TPE": (25.0777, 121.2330), "TSA": (25.0694, 121.5525), "RMQ": (24.2647, 120.6208), "KHH": (22.5771, 120.3500)}
KIND = {"runway": "rw", "taxiway": "tw", "apron": "ap", "terminal": "tm", "jet_bridge": "jb"}
URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def simplify(pts, tol):
    """道格拉斯－普克簡化（公尺）"""
    if len(pts) < 3:
        return pts
    if pts[0] == pts[-1]:                      # 圍起來的面：頭尾同一點，從離起點最遠的地方切成兩半各自簡化
        m = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
        if m in (0, len(pts) - 1):
            return pts
        return simplify(pts[:m + 1], tol) + simplify(pts[m:], tol)[1:]
    la0 = math.radians(pts[0][1])
    xy = [(lo * 111320 * math.cos(la0), la * 110570) for lo, la in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop()
        (x1, y1), (x2, y2) = xy[a], xy[b]
        L = math.hypot(x2 - x1, y2 - y1) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            d = abs((x2 - x1) * (y1 - xy[i][1]) - (x1 - xy[i][0]) * (y2 - y1)) / L
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            st += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def fetch(la, lo, q=None):
    q = q or f'[out:json][timeout:90];way(around:5000,{la},{lo})["aeroway"~"^(runway|taxiway|apron|terminal|jet_bridge)$"];out geom;'
    for i in range(6):
        for u in URLS:
            try:
                req = urllib.request.Request(u, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "vps-sentinel apmap"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    return json.load(r)["elements"]
            except Exception as e:  # noqa: BLE001
                print("重試", u, e, file=sys.stderr)
        time.sleep(10 * (i + 1))
    raise SystemExit("Overpass 連不上")


def main():
    lines = ["# 機場\t種類\t寬度\t經度,緯度…（© OpenStreetMap 貢獻者，ODbL；tools/apmap.py 產生）"]
    for code, (la, lo) in APS.items():
        n = 0
        for w in fetch(la, lo):
            k = KIND.get((w.get("tags") or {}).get("aeroway"))
            g = w.get("geometry") or []
            if not k or len(g) < 2:
                continue
            try:
                wd = round(float(str(w["tags"].get("width", "0")).split()[0]))
            except ValueError:
                wd = 0
            pts = simplify([(p["lon"], p["lat"]) for p in g], 3 if k in ("rw", "tw") else 2)
            lines.append(f"{code}\t{k}\t{wd if k == 'rw' else 0}\t" + " ".join(f"{x:.5f},{y:.5f}" for x, y in pts))
            n += 1
        gates = {}
        for g in fetch(la, lo, f'[out:json][timeout:90];nwr(around:5000,{la},{lo})["aeroway"="gate"];out center;'):
            t = g.get("tags") or {}
            ref = re.sub(r"[^0-9A-Za-z]", "", str(t.get("ref") or t.get("name") or "")).upper()
            c = g.get("center") or g
            if ref and "lat" in c and ref not in gates:
                gates[ref] = (c["lon"], c["lat"])
        for ref in sorted(gates, key=lambda r: (re.sub(r"\d", "", r), int(re.sub(r"\D", "", r) or 0), r)):
            lines.append(f"{code}\tgt\t{ref}\t{gates[ref][0]:.5f},{gates[ref][1]:.5f}")
        print(code, n, "條", len(gates), "個登機門", " ".join(sorted(gates)))
        time.sleep(5)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
