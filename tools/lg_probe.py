"""暫時：查貨運航空公司標誌 2"""
import hashlib, urllib.request
S = ["https://www.flightaware.com/images/airline_logos/90p/{i}.png", "https://images.daisycon.io/airline/?width=128&height=128&iata={c}",
     "https://content.airhex.com/content/logos/airlines_{c}_100_100_s.png", "https://www.flightradar24.com/static/images/data/operators/{i}_logo0.png",
     "https://images.flightradar24.com/assets/airlines/logotypes/{c}_{i}.png"]
for c, i in [("O3", "CSS"), ("5X", "UPS"), ("M6", "AJT"), ("GB", "ABX"), ("CK", "CKK"), ("ZZ", "ZZZ")]:
    out = []
    for u in S:
        try:
            with urllib.request.urlopen(urllib.request.Request(u.format(c=c, i=i), headers={"User-Agent": "Mozilla/5.0"}), timeout=20) as r:
                b = r.read(); out.append(f"{r.status}/{r.headers.get('content-type','')[:10]}/{len(b)}/{hashlib.sha1(b).hexdigest()[:8]}")
        except Exception as e:
            out.append(str(e)[:22])
    print(c, " | ".join(out))
