"""機場起降會不會拖慢監控：用真實資料跑機場起降，同時量監控那邊慢了多少（GitHub 上手動執行 fly-perf）

量三件事：
1. 機場起降每一輪（四個機場）花多少時間、吃多少處理器
2. 監控那邊的定時工作（每 0.1 秒醒來一次）被拖慢多少
3. 首頁要的資料（all_status）做一次要多久
先量一段沒開機場起降的當基準，再量開著（背景每 30 秒抓四個機場＋3 個人在看桃園）的時候。
"""
import json
import os
import statistics
import sys
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))
from test_passkey import load_sentinel  # noqa: E402

S = load_sentinel()
SECS = int(os.environ.get("PERF_SECS", 240))
LATE, SNAP, BOARD = [], [], {}
RUN = {"on": True}


def ticker():
    """監控那邊的代表：每 0.1 秒醒來一次，記下晚醒來多久（被別的執行緒卡住就會晚）"""
    while RUN["on"]:
        t = time.perf_counter()
        time.sleep(0.1)
        LATE.append((time.perf_counter() - t - 0.1) * 1000)


def snapper():
    """首頁每 3 秒要一次的資料"""
    while RUN["on"]:
        t = time.perf_counter()
        json.dumps(S.all_status(), ensure_ascii=False)
        SNAP.append((time.perf_counter() - t) * 1000)
        time.sleep(3)


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))] if xs else 0


def phase(name, secs, work=None):
    LATE.clear()
    SNAP.clear()
    RUN["on"] = True
    ts = [threading.Thread(target=ticker, daemon=True), threading.Thread(target=snapper, daemon=True)]
    for t in ts:
        t.start()
    c0, w0 = time.process_time(), time.perf_counter()
    if work:
        work(secs)
    else:
        time.sleep(secs)
    cpu = (time.process_time() - c0) / (time.perf_counter() - w0) * 100
    RUN["on"] = False
    for t in ts:
        t.join()
    print(f"\n== {name}（{secs} 秒）")
    print(f"  整個程式處理器 {cpu:.1f}%（一顆核心＝100%）")
    print(f"  監控定時工作晚醒來：平均 {statistics.mean(LATE):.2f} 毫秒、95% {pct(LATE, .95):.2f}、99% {pct(LATE, .99):.2f}、最多 {max(LATE):.1f}")
    print(f"  首頁資料一次：平均 {statistics.mean(SNAP):.1f} 毫秒、最多 {max(SNAP):.1f}（{len(SNAP)} 次）")


def busy(secs):
    end = time.time() + secs
    S.FLY["used"] = time.time()

    def viewer(i):
        while time.time() < end:
            t = time.perf_counter()
            body = json.dumps(S.fly_api({"ap": ["TPE"]}), ensure_ascii=False)
            BOARD.setdefault("view", []).append(((time.perf_counter() - t) * 1000, len(body)))
            time.sleep(10)
    vs = [threading.Thread(target=viewer, args=(i,), daemon=True) for i in range(3)]
    for v in vs:
        v.start()
    while time.time() < end:
        for c in S.FLY_PIN:
            t, c0 = time.perf_counter(), time.thread_time()
            try:
                d = S.fly_board(c, True)
                n = sum(len(d.get(k) or []) for k in ("arr", "dep", "gnd", "over", "rest"))
            except Exception as e:  # noqa: BLE001
                n = f"錯誤 {e!r}"[:60]
            BOARD.setdefault(c, []).append(((time.perf_counter() - t) * 1000, (time.thread_time() - c0) * 1000, n))
        time.sleep(max(0, min(30, end - time.time())))
    for v in vs:
        v.join(timeout=15)


S.COL.snapshot()                                   # 先暖身（第一次讀檔比較慢）
phase("基準：只有監控", 30)
for c in S.FLY_PIN:                                 # 先把官網表、資料庫抓好，下面量的是平常的樣子
    for _ in range(20):
        try:
            if not S.fly_board(c, True).get("loading"):
                break
        except Exception as e:  # noqa: BLE001
            print("  暖身失敗", c, repr(e)[:80])
        time.sleep(1.5)
phase("開著機場起降：背景抓四個機場＋3 個人在看桃園", SECS, busy)
print("\n== 每個機場一輪")
for c, xs in BOARD.items():
    if c == "view":
        print(f"  看板請求：平均 {statistics.mean(x[0] for x in xs):.0f} 毫秒、最多 {max(x[0] for x in xs):.0f}、回應 {statistics.mean(x[1] for x in xs) / 1024:.0f} KB")
        continue
    print(f"  {c}：花 平均 {statistics.mean(x[0] for x in xs):.0f} 毫秒（處理器 {statistics.mean(x[1] for x in xs):.0f}）、最多 {max(x[0] for x in xs):.0f}；飛機 {xs[-1][2]}")
