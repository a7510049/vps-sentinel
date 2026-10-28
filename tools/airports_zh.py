"""幫 data/airports.tsv 每個機場補上中文城市名（第 8 欄），來源是維基數據（CC0）

這台開發機連不到維基數據，要在 GitHub Actions 上跑（airports-zh 那個工作）。
有裝 opencc 的話，只有簡體名稱的會轉成台灣用字；沒有就只用繁體名稱。
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
TSV = os.path.join(HERE, "data", "airports.tsv")
LANGS = ["zh-tw", "zh-hant", "zh-hk", "zh-mo", "zh", "zh-hans", "zh-cn"]
Q = """SELECT ?ap ?iata ?co ?city WHERE {
  ?ap wdt:P238 ?iata .
  OPTIONAL { ?ap wdt:P625 ?co }
  OPTIONAL { ?ap wdt:P931 ?city }
}"""
UA = {"User-Agent": "vps-sentinel-build/1.0 (https://github.com/a7510049/vps-sentinel)"}

try:
    import opencc
    S2T = opencc.OpenCC("s2twp").convert
except ImportError:
    S2T = None


def get(url, tries=4):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            print("維基數據查詢失敗，再試一次：", e, file=sys.stderr)
            time.sleep(10 * (n + 1))
    raise SystemExit("維基數據查不到")


def sparql():
    return get("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": Q, "format": "json"}))["results"]["bindings"]


def labels(ids):
    """一次問 50 個項目的中文名稱"""
    out, ids = {}, sorted(ids)
    for i in range(0, len(ids), 50):
        r = get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
            "action": "wbgetentities", "ids": "|".join(ids[i:i + 50]), "props": "labels", "languages": "|".join(LANGS), "format": "json"}))
        for k, e in (r.get("entities") or {}).items():
            out[k] = {lg: v["value"] for lg, v in (e.get("labels") or {}).items()}
        time.sleep(.2)
    return out


def zh(lb):
    """照台灣用字優先挑一個中文名稱"""
    for lg in LANGS:
        v = lb.get(lg, "")
        if not v or not re.search(r"[一-鿿]", v):
            continue
        if lg in ("zh", "zh-hans", "zh-cn"):
            if not S2T:
                continue
            v = S2T(v)
        return v
    return ""


def tidy(v, ap=False):
    v = re.sub(r"\s*[（(].*?[)）]\s*", "", v).replace("臺", "台").strip()
    if ap:                                    # 沒有城市名稱：用機場名稱拿掉「國際機場」之類
        v = re.sub(r"(國際|国际)?(機場|机场|空港|航空站|飛機場|直升機場)$", "", v)
    v = re.sub(r"(?<=..)[市縣郡]$", "", v)
    return v if 0 < len(v) <= 10 and re.search(r"[一-鿿]", v) else ""


def dist(a, b, c, d):
    return math.hypot(a - c, (b - d) * math.cos(math.radians(a)))


def main():
    lines = open(TSV, encoding="utf-8").read().split("\n")
    pos = {}
    for ln in lines:
        x = ln.split("\t")
        if len(x) >= 7 and not ln.startswith("#"):
            pos[x[0]] = (float(x[4]), float(x[5]))
    best, rows = {}, sparql()
    qid = lambda row, k: (row.get(k) or {}).get("value", "").rsplit("/", 1)[-1]
    lb = labels({qid(r, k) for r in rows for k in ("ap", "city") if qid(r, k).startswith("Q") and r["iata"]["value"].upper() in pos})
    for row in rows:
        code = row["iata"]["value"].upper()
        if code not in pos:
            continue
        m = re.search(r"Point\(([-\d.]+) ([-\d.]+)\)", (row.get("co") or {}).get("value", ""))
        d = dist(*pos[code], float(m[2]), float(m[1])) if m else .9
        if d > 1:                             # 同代碼的別座（已關閉、搬走的）
            continue
        name = tidy(zh(lb.get(qid(row, "city"), {}))) or tidy(zh(lb.get(qid(row, "ap"), {})), True)
        if name and (code not in best or d < best[code][0]):
            best[code] = (d, name)
    out, n = [], 0
    for ln in lines:
        x = ln.split("\t")
        if len(x) >= 7 and not ln.startswith("#"):
            x = x[:7] + [best[x[0]][1] if x[0] in best else ""]
            n += x[0] in best
            ln = "\t".join(x)
        elif ln.startswith("# 全世界的機場"):
            ln = "# 全世界的機場（代碼、名稱、城市、國家、緯度、經度、時區、中文城市名）"
        elif ln.startswith("# 來源：airportsdata"):
            ln = ln.split("；")[0] + "；中文城市名：維基數據（CC0，tools/airports_zh.py）"
        out.append(ln)
    open(TSV, "w", encoding="utf-8").write("\n".join(out))
    print(f"{n}/{len(pos)} 個機場有中文名稱")


if __name__ == "__main__":
    main()
