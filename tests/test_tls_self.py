"""沒網域的主機：自己簽憑證走 https（只收 TLS 1.3）、外面用 http 開網頁會轉到 https、主機之間只認那張憑證。只用 Python 內建模組。"""
import hashlib
import http.client
import json
import os
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request

from seal_util import conf_get
from test_smoke import ROOT, TOKEN, Server, free_port


def outside_ip():
    """這台不是 127.0.0.1 的位址（測試「從外面連」用）"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return None if ip.startswith("127.") else ip
    except OSError:
        return None


def tls_get(port, path, ver=None):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname, ctx.verify_mode = False, ssl.CERT_NONE
    if ver:
        ctx.maximum_version = ver
    c = http.client.HTTPSConnection("127.0.0.1", port, context=ctx, timeout=10)
    c.connect()
    der = c.sock.getpeercert(binary_form=True)
    c.request("GET", path, headers={"X-Token": TOKEN})
    r = c.getresponse()
    body = r.read()
    c.close()
    return r.status, body, hashlib.sha256(der).hexdigest()


class TlsSelf(Server):
    EXTRA = "BIND=0.0.0.0\n"

    def test_https(self):
        code, body, fp = tls_get(self.port, "/api/status")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["tlsfp"], fp)                     # 回報的指紋就是這張憑證
        self.assertEqual(tls_get(self.port, "/")[0], 200)
        with self.assertRaises(ssl.SSLError):                                # TLS 1.2 不收
            tls_get(self.port, "/", ssl.TLSVersion.TLSv1_2)
        # 本機用 http 照舊（安裝畫面的檢查、Caddy）
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request("GET", "/")
        self.assertEqual(c.getresponse().status, 200)
        ip = outside_ip()
        if ip:                                                               # 從外面用 http 開網頁：轉到 https
            c = http.client.HTTPConnection(ip, self.port, timeout=10)
            c.request("GET", "/?x=1", headers={"Host": f"{ip}:{self.port}"})
            r = c.getresponse()
            self.assertEqual(r.status, 301)
            self.assertEqual(r.getheader("Location"), f"https://{ip}:{self.port}/?x=1")
            c = http.client.HTTPConnection(ip, self.port, timeout=10)        # 主機之間的 /api/ 照舊收（舊版才連得上）
            c.request("GET", "/api/status", headers={"X-Token": TOKEN})
            self.assertEqual(c.getresponse().status, 200)


class Pinning(Server):
    """只認記下的那張：指紋不對就不連"""
    EXTRA = "BIND=0.0.0.0\n"

    def test_pin(self):
        from test_passkey import load_sentinel
        S = load_sentinel()
        fp = tls_get(self.port, "/api/status")[2]
        url = f"https://127.0.0.1:{self.port}/api/status"
        req = lambda: S.urllib.request.urlopen(S.urllib.request.Request(url, headers={"X-Token": TOKEN}), timeout=10)
        with self.assertRaises(OSError):                     # 沒記指紋：自己簽的憑證不收
            req()
        S.TLS_PINS[S.pin_key(url)] = "0" * 64
        with self.assertRaises(OSError):                     # 指紋不對
            req()
        S.TLS_PINS[S.pin_key(url)] = fp
        with req() as r:
            self.assertEqual(r.status, 200)


class PeerUpgrade(Server):
    """主要主機用 http 連一台已經有自己憑證的主機：自動換成 https、只認那張憑證"""
    EXTRA = "BIND=0.0.0.0\n"

    def test_upgrade(self):
        fp = tls_get(self.port, "/api/status")[2]
        with tempfile.TemporaryDirectory() as d:
            port = free_port()
            conf = os.path.join(d, "a.conf")
            with open(conf, "w", encoding="utf-8") as f:
                f.write(f"BIND=127.0.0.1\nPORT={port}\nTOKEN={TOKEN}\nNAME=A\nDATA_DIR={d}/data\n"
                        f"PEERS=B=http://127.0.0.1:{self.port}\n")
            env = {k: v for k, v in os.environ.items() if not k.startswith("SENTINEL_")}
            env["SENTINEL_CONF"] = conf
            p = subprocess.Popen([sys.executable, os.path.join(ROOT, "sentinel.py")], env=env,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                ok = False
                for _ in range(60):
                    try:
                        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/all", headers={"X-Token": TOKEN})
                        with urllib.request.urlopen(req, timeout=5) as r:
                            hosts = json.loads(r.read())
                        if conf_get(conf, "PEERS").startswith("B=https://") and any(h.get("node") == "B" and not h.get("offline") and h.get("tlsfp") for h in hosts):
                            ok = True
                            break
                    except OSError:
                        pass
                    time.sleep(.5)
                self.assertTrue(ok, conf_get(conf, "PEERS"))
                self.assertEqual(conf_get(conf, "PEERS"), f"B=https://127.0.0.1:{self.port}")
                with open(os.path.join(d, "data", "tls-pins.json"), "rb") as f:
                    self.assertNotIn(fp.encode(), f.read())                   # 存的指紋也加密
            finally:
                p.terminate()
                p.wait(10)


if __name__ == "__main__":
    unittest.main()
