"""測試用：讀哨兵加密過的設定值和資料檔（用 sentinel.py 裡同一段程式，鑰匙是測試設定檔旁邊那把）"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def seal_mod(conf):
    src = open(os.path.join(ROOT, "sentinel.py"), encoding="utf-8").read()
    a = src.index("CONF_PATH = os.environ")
    b = src.index('if __name__ == "__main__" and sys.argv[1:2] in (["--unseal"]')
    g = {"__name__": "seal_for_test"}
    old = os.environ.get("SENTINEL_CONF")
    os.environ["SENTINEL_CONF"] = conf
    try:
        exec("import base64, hashlib, hmac, json, os, re, sys\n" + src[a:b], g)
    finally:
        if old is None:
            os.environ.pop("SENTINEL_CONF", None)
        else:
            os.environ["SENTINEL_CONF"] = old
    return g


def conf_get(conf, key):
    """設定檔裡某個值（解開後的）"""
    g = seal_mod(conf)
    with open(conf, encoding="utf-8") as f:
        for line in f:
            if line.startswith(key + "="):
                return g["unseal_val"](key, line.strip()[len(key) + 1:])
    return ""


def read_text(conf, path):
    """資料檔解開後的內容"""
    return seal_mod(conf)["sec_read"](path).decode("utf-8")
