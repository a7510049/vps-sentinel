"""產生 data/actypes.tsv：每一種機型代碼是什麼飛機（雷達畫哪種形狀、算不算私人飛機用）

來源是國際民航組織的機型代碼表（ICAO Doc 8643，取自 Mictronics readsb-protobuf 整理好的清單），只留三欄：
代碼、種類（第一個字 L 陸上飛機／S 水上飛機／A 水陸兩用／H 直升機／G 旋翼機／R 傾轉旋翼，第二個字引擎數，第三個字 J 噴射／T 渦輪螺旋槳／P 活塞／E 電動）、
尾流等級（L 輕／M 中／H 重／J 超重）。
"""
import json
import os
import re
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "data", "actypes.tsv")
URL = "https://raw.githubusercontent.com/Mictronics/readsb-protobuf/dev/webapp/src/db/types.json"


def main():
    with urllib.request.urlopen(URL, timeout=60) as r:
        d = json.load(r)
    rows = []
    for code, v in d.items():
        cls, wtc = (v[1] if len(v) > 1 else ""), (v[2] if len(v) > 2 else "")
        if re.fullmatch(r"[A-Z0-9]{2,4}", code) and re.fullmatch(r"[LSAHGTR][1-8C][JTPER]", cls or "") and wtc in ("L", "M", "H", "J", "L/M"):
            rows.append(f"{code}\t{cls}\t{wtc[0]}")
    rows.sort()
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("# 機型代碼\t種類\t尾流等級（ICAO Doc 8643，tools/actypes.py 產生）\n" + "\n".join(rows) + "\n")
    print(len(rows), "種機型")


if __name__ == "__main__":
    main()
