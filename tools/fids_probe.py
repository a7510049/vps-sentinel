"""暫時：找桃園機場貨機航班表"""
import re, urllib.request
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
            return r.status, r.read()
    except Exception as e:
        return str(e)[:80], b""
B = "https://www.taoyuan-airport.com"
for u in [B + "/uploads/flightx/" + f for f in ("c_flight_v4.txt", "cargo_flight_v4.txt", "a_flight_cargo.txt", "c_flight.txt", "f_flight_v4.txt", "a_flight_v5.txt", "a_flight_v3.txt")]:
    st, b = get(u); print(u, st, len(b), b[:150])
st, h = get(B + "/")
print("home", st, len(h))
links = sorted(set(re.findall(rb'href="([^"]*(?:flight|cargo|Cargo|Flight)[^"]*)"', h)))
print(links[:60])
for l in links[:60]:
    u = l.decode() if l.startswith(b"http") else B + l.decode()
    if "cargo" in u.lower() or "freight" in u.lower() or "貨" in u:
        st, p = get(u); print("PAGE", u, st, len(p))
        print(sorted(set(re.findall(rb'["\'(]([^"\'()]*(?:\.txt|\.json|api[^"\']*|flightx[^"\']*))["\')]', p)))[:40])
for path in ("/flight_depart", "/flight_arrival", "/flight_cargo", "/cargo_flight", "/flightCargo"):
    st, p = get(B + path); print(path, st, len(p))
    if p:
        print(sorted(set(re.findall(rb'["\'(]([^"\'()]*(?:\.txt|\.json|flightx[^"\']*|ajax[^"\']*))["\')]', p)))[:40])
        print(sorted(set(re.findall(rb'<script[^>]+src="([^"]+)"', p)))[:30])
