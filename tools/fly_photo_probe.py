"""暫時：照片查詢被擋（403）：看擋的原因、瀏覽器能不能直接問（CORS）"""
import urllib.request, urllib.error, json
UA = "vps-sentinel/3.95 (+https://github.com/a7510049/vps-sentinel)"
for reg in ["B-18923"]:
    hd = {"User-Agent": UA, "Origin": "https://example.com", "Accept": "application/json"}
    try:
        with urllib.request.urlopen(urllib.request.Request(f"https://api.planespotters.net/pub/photos/reg/{reg}", headers=hd), timeout=10) as r:
            print(reg, r.status, "ACAO=", r.headers.get("Access-Control-Allow-Origin"), len(json.loads(r.read()).get("photos") or []))
    except urllib.error.HTTPError as e:
        print(reg, e.code, dict(e.headers), e.read()[:300])
