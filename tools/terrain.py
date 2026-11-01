"""產生 data/terrain.bin：台灣附近的地形高度（雷達底圖畫山用）

來源是 AWS 上公開的地形圖塊（Mapzen Terrain Tiles，Terrarium 格式；資料來自 SRTM、ETOPO1 等，可自由使用，需註明出處）。
取樣成每 0.01 度一格（約 1 公里），高度每 16 公尺一級存成一個位元組（海面是 0）。
檔案開頭一行是說明（JSON）：la 最北的緯度、lo 最西的經度、d 每格幾度、w 寬幾格、h 高幾格；後面是一格一個位元組，從北到南、從西到東。
"""
import json
import math
import os
import struct
import sys
import urllib.request
import zlib

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "data", "terrain.bin")
LA0, LA1, LO0, LO1, D, Z = 21.85, 25.35, 119.30, 122.10, 0.01, 10
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def png_rgb(data):
    """只解這種圖塊需要的：8 位元 RGB、不交錯"""
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    i, idat, w = 8, b"", 0
    while i < len(data):
        n, t = struct.unpack(">I4s", data[i:i + 8])
        body = data[i + 8:i + 8 + n]
        if t == b"IHDR":
            w, h, bd, ct, _, _, il = struct.unpack(">IIBBBBB", body)
            assert bd == 8 and ct == 2 and il == 0, (bd, ct, il)
        elif t == b"IDAT":
            idat += body
        i += 12 + n
    raw, bpp, st = zlib.decompress(idat), 3, w * 3
    rows, prev, p = [], bytearray(st), 0
    for _ in range(h):
        f, line = raw[p], bytearray(raw[p + 1:p + 1 + st])
        p += 1 + st
        for x in range(st):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    return w, rows


def tile_xy(la, lo):
    n = 2 ** Z
    x = (lo + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(la)) + 1 / math.cos(math.radians(la))) / math.pi) / 2 * n
    return x, y


def main():
    tiles = {}
    x0, y0 = tile_xy(LA1, LO0)
    x1, y1 = tile_xy(LA0, LO1)
    for tx in range(int(x0), int(x1) + 1):
        for ty in range(int(y0), int(y1) + 1):
            with urllib.request.urlopen(URL.format(z=Z, x=tx, y=ty), timeout=60) as r:
                tiles[(tx, ty)] = png_rgb(r.read())[1]
            print("tile", tx, ty, file=sys.stderr)
    w, h = round((LO1 - LO0) / D), round((LA1 - LA0) / D)
    out = bytearray()
    for j in range(h):
        la = LA1 - (j + .5) * D
        for i in range(w):
            lo = LO0 + (i + .5) * D
            fx, fy = tile_xy(la, lo)
            rows = tiles[(int(fx), int(fy))]
            px, py = int((fx % 1) * 256), int((fy % 1) * 256)
            r, g, b = rows[py][px * 3:px * 3 + 3]
            e = r * 256 + g + b / 256 - 32768
            out.append(0 if e <= 0 else max(1, min(255, round(e / 16))))
    head = json.dumps({"la": LA1, "lo": LO0, "d": D, "w": w, "h": h, "src": "Mapzen Terrain Tiles (SRTM, ETOPO1)"}, separators=(",", ":"))
    with open(OUT, "wb") as f:
        f.write(head.encode() + b"\n" + bytes(out))
    print(OUT, w, h, len(out), "最高", max(out) * 16, "公尺", file=sys.stderr)


if __name__ == "__main__":
    main()
