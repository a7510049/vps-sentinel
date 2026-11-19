"""暫時用：在 GitHub 上用真實資料跑哨兵，存下四個機場的看板資料（給開發機重播、截圖）"""
import json, os, subprocess, sys, time, urllib.request, shutil
D = "/tmp/fsnap"; OUT = "snap"
os.makedirs(D, exist_ok=True); os.makedirs(OUT, exist_ok=True)
open(D + "/t.conf", "w").write(f"PORT=18777\nTOKEN=snaptok\nNAME=snap\nDATA_DIR={D}/data\n")
env = {**os.environ, "SENTINEL_CONF": D + "/t.conf", "SENTINEL_FLY_BG": "20"}
p = subprocess.Popen([sys.executable, "sentinel.py"], env=env)
def get(q):
    r = urllib.request.Request("http://127.0.0.1:18777" + q, headers={"X-Token": "snaptok"})
    return urllib.request.urlopen(r, timeout=90).read()
time.sleep(5)
APS = ["TPE", "TSA", "KHH", "RMQ"]
for _ in range(40):
    try:
        if all(not json.loads(get("/api/flights?ap=" + c)).get("loading") for c in APS): break
    except Exception as e: print("wait", e)
    time.sleep(3)
time.sleep(90)
for i in range(18):
    t = time.time()
    for c in APS:
        if c != "TPE" and i % 3: continue
        try: open(f"{OUT}/{c}-{i:02d}.json", "wb").write(get("/api/flights?ap=" + c))
        except Exception as e: print("snap", c, i, e)
    time.sleep(max(0, 10 - (time.time() - t)))
for c in APS:
    try: open(f"{OUT}/trk-{c}.json", "wb").write(get("/api/flights?trk=" + c))
    except Exception as e: print(e)
p.terminate(); p.wait()
os.makedirs(OUT + "/data", exist_ok=True)
for n in os.listdir(D + "/data"):
    s = os.path.join(D, "data", n)
    if n in ("aircraft-db",): continue
    if os.path.isdir(s): shutil.copytree(s, f"{OUT}/data/{n}")
    elif n.startswith(("fly", "fids")): shutil.copy(s, f"{OUT}/data/{n}")
print(os.listdir(OUT))
