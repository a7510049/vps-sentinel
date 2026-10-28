"""暫時：找桃園機場貨機航班表"""
import json, re, urllib.request
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
     "Accept": "text/html,application/json,*/*", "Accept-Language": "zh-TW,zh;q=0.9"}
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=30) as r:
            return r.status, r.read()
    except Exception as e:
        return str(e)[:80], b""
for d in ("177643", "26194", "7869"):
    st, b = get(f"https://data.gov.tw/api/v2/rest/dataset/{d}")
    print(d, st, b[:2500].decode("utf-8", "replace"))
st, b = get("https://www.taoyuan-airport.com/flight_cargo?k=&time=all")
print("cargo page", st, len(b))
st, b = get("https://www.taoyuan-airport.com/")
print("home", st, len(b))
