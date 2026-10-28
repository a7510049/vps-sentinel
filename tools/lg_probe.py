"""暫時：查貨運航空公司標誌"""
import hashlib, urllib.request
S = ["https://www.gstatic.com/flights/airline_logos/70px/{c}.png", "https://images.kiwi.com/airlines/128/{c}.png", "https://pics.avs.io/200/200/{c}.png"]
for c in ["O3", "CK", "CF", "Y8", "YG", "5X", "FX", "KZ", "PO", "CV", "LD", "RU", "K4", "3S", "M6", "GB", "KD", "N8", "ZZ"]:
    out = []
    for u in S:
        try:
            with urllib.request.urlopen(urllib.request.Request(u.format(c=c), headers={"User-Agent": "Mozilla/5.0"}), timeout=20) as r:
                b = r.read(); out.append(f"{r.status}/{len(b)}/{hashlib.sha1(b).hexdigest()[:8]}")
        except Exception as e:
            out.append(str(e)[:20])
    print(c, " | ".join(out))
