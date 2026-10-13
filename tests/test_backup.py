"""每日備份的測試：打包內容正確（資料庫是完整的一份）、加密碼後傳到 Telegram、兩台互相存一份、網頁可以下載。

開兩個哨兵：A 設定了 B（PEERS），B 沒有設定 Telegram，由 A 幫它傳。只用 Python 內建模組。
"""
import http.server
import io
import json
import os
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from test_smoke import ROOT, TOKEN, free_port

DOCS = []                                          # 假的 Telegram 收到的檔案 [(檔名, 內容, 說明文字)]


class FakeTG(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        if self.path.endswith("/sendDocument"):
            b = self.headers["Content-Type"].split("boundary=")[1].encode()
            parts = {}
            for part in body.split(b"--" + b)[1:-1]:
                head, _, data = part.partition(b"\r\n\r\n")
                name = re.search(rb'name="([^"]+)"', head).group(1).decode()
                fn = re.search(rb'filename="([^"]+)"', head)
                parts[name] = (fn.group(1).decode() if fn else None, data[:-2])
            DOCS.append((parts["document"][0], parts["document"][1], parts["caption"][1].decode()))
        out = b'{"ok":true,"result":{"message_id":1}}'
        self.send_response(200)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


def start(tmp, name, extra, env_extra=None):
    port = free_port()
    d = os.path.join(tmp, name)
    os.makedirs(d)
    conf = os.path.join(d, "test.conf")
    with open(conf, "w", encoding="utf-8") as f:
        f.write(f"BIND=127.0.0.1\nPORT={port}\nTOKEN={TOKEN}\nNAME={name}\nDATA_DIR={d}/data\nCLOUD_DIR={d}/cloud\n{extra}")
    env = {k: v for k, v in os.environ.items() if not k.startswith("SENTINEL_")}
    env.update(SENTINEL_CONF=conf, **(env_extra or {}))
    log = open(os.path.join(d, "server.log"), "w+", encoding="utf-8")
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, "sentinel.py")], cwd=d, env=env, stdout=log, stderr=subprocess.STDOUT)
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return p, port, d, log
        except OSError:
            time.sleep(0.2)
    raise RuntimeError(f"{name} 沒有啟動")


class BackupTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.tg = http.server.ThreadingHTTPServer(("127.0.0.1", free_port()), FakeTG)
        threading.Thread(target=cls.tg.serve_forever, daemon=True).start()
        # 要備份的「重要資料」：一般檔案＋一個正在使用中的資料庫
        cls.src = os.path.join(cls.tmp, "app")
        os.makedirs(os.path.join(cls.src, "cache"))
        with open(os.path.join(cls.src, "settings.json"), "w") as f:
            f.write('{"hello": "世界"}')
        with open(os.path.join(cls.src, "cache", "junk.bin"), "w") as f:
            f.write("不用備份")
        cls.db = sqlite3.connect(os.path.join(cls.src, "x-ui.db"))
        cls.db.execute("PRAGMA journal_mode=WAL")
        cls.db.execute("CREATE TABLE users(name TEXT)")
        cls.db.executemany("INSERT INTO users VALUES (?)", [(f"u{i}",) for i in range(50)])
        cls.db.commit()                            # 還開著不關：資料在 -wal 檔裡，直接複製主檔會缺資料
        cls.procs = []
        cls.b = start(cls.tmp, "B", f"BACKUP_PATHS={cls.src}\n")
        cls.procs.append(cls.b)
        tg = {"SENTINEL_TG_API": f"http://127.0.0.1:{cls.tg.server_address[1]}/bot"}
        cls.a = start(cls.tmp, "A", f"BACKUP_PATHS={cls.src}\nPEERS=B=http://127.0.0.1:{cls.b[1]}\n"
                      "TG_BOT_TOKEN=123:abc\nTG_CHAT_ID=42\n", tg)
        cls.procs.append(cls.a)

    @classmethod
    def tearDownClass(cls):
        for p, _, _, log in cls.procs:
            p.terminate()
            p.wait(10)
            log.seek(0)
            out = log.read()
            if "Traceback" in out:
                print("\n── 哨兵輸出 ──\n" + out, file=sys.stderr)
            log.close()
        cls.db.close()
        cls.tg.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def call(self, port, path, body=None, token=TOKEN, raw=False, headers=None):
        h = {"X-Token": token, **(headers or {})} if token else dict(headers or {})
        data = json.dumps(body).encode() if isinstance(body, dict) else body
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, headers=h,
                                     method="POST" if data is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                return r.status, (b if raw else json.loads(b)), r.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers

    def check_tar(self, data, name):
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as t:
            names = t.getnames()
            src = self.src.lstrip("/")
            self.assertIn(f"{src}/settings.json", names)
            self.assertNotIn(f"{src}/cache/junk.bin", names)          # 暫存資料夾不備份
            self.assertFalse([n for n in names if n.endswith("-wal") or n.endswith("-shm")])
            self.assertTrue([n for n in names if n.startswith("還原說明")])
            self.assertTrue([n for n in names if n.endswith(".conf")])  # 哨兵自己的設定
            with tempfile.TemporaryDirectory() as d:
                with open(os.path.join(d, "db"), "wb") as f:
                    f.write(t.extractfile(f"{src}/x-ui.db").read())
                c = sqlite3.connect(os.path.join(d, "db"))
                self.assertEqual(c.execute("SELECT count(*) FROM users").fetchone()[0], 50)   # 資料庫是完整的
                c.close()
        self.assertTrue(name.startswith(name.split("-")[0]))

    def wait_done(self, port):
        deadline = time.time() + 90
        while time.time() < deadline:
            _, st, _ = self.call(port, "/api/backup")
            if not st["running"] and st["last"]:
                return st
            time.sleep(0.5)
        self.fail("備份 90 秒內沒有完成")

    def test_flow(self):
        a, b = self.a[1], self.b[1]
        code, d, _ = self.call(a, "/api/backup", {"action": "run"})
        self.assertEqual(code, 200, d)
        st = self.wait_done(a)
        last = st["last"]
        self.assertTrue(last["ok"], last)
        self.assertTrue(st["key"])
        self.assertEqual([x["where"] for x in last["to"]],
                         ["存在這台主機", "傳到 Telegram", "存到「B」的主機上", "「B」的備份也存了一份在這台的主機上"])
        self.assertIn("其他", last["items"])
        self.assertIn("哨兵設定", last["items"])

        # 兩台各存一份對方的
        mine = os.listdir(os.path.join(self.a[2], "data", "backups"))
        self.assertEqual(len(mine), 1)
        with open(os.path.join(self.a[2], "data", "backups", mine[0]), "rb") as f:
            self.check_tar(f.read(), mine[0])
        on_b = os.listdir(os.path.join(self.b[2], "data", "peer-backups", "A"))
        self.assertEqual(on_b, mine)
        on_a = os.listdir(os.path.join(self.a[2], "data", "peer-backups", "B"))
        self.assertEqual(len(on_a), 1)
        self.assertTrue(on_a[0].startswith("B-"))
        _, bst, _ = self.call(b, "/api/backup")
        self.assertEqual(bst["got"][0]["name"], "A")
        _, ast, _ = self.call(a, "/api/backup")
        self.assertEqual(ast["got"][0]["name"], "B")

        # Telegram：A 自己一份，B 沒設定 Telegram，A 幫它傳一份；都加了密碼，用解開密碼打得開
        self.assertEqual(sorted(x[0].split("-")[0] for x in DOCS), ["A", "B"])
        for fn, data, cap in DOCS:
            self.assertTrue(fn.endswith(".tar.gz.enc"))
            self.assertFalse(data.startswith(b"\x1f\x8b"))             # 不是直接看得到的壓縮檔
            out = subprocess.run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-pass", f"pass:{st['key']}"],
                                 input=data, capture_output=True)
            self.assertEqual(out.returncode, 0)
            self.check_tar(out.stdout, fn)
        self.assertIn("跟「A」的一樣", [c for f, _, c in DOCS if f.startswith("B-")][0])

        # 網頁下載：這台、透過 A 下載 B 的
        code, data, h = self.call(a, "/api/backup-file", raw=True)
        self.assertEqual(code, 200)
        self.check_tar(data, "A")
        code, data, h = self.call(a, "/api/backup-file?node=B", raw=True)
        self.assertEqual(code, 200)
        self.assertTrue(urllib.parse.unquote(h["X-Backup-Name"]).startswith("B-"))
        self.check_tar(data, "B")

        # 設定開關會寫進設定檔
        code, d, _ = self.call(a, "/api/backup", {"action": "set", "on": False})
        self.assertFalse(self.call(a, "/api/backup")[1]["on"])
        with open(os.path.join(self.a[2], "test.conf")) as f:
            self.assertIn("BACKUP=off", f.read())
        self.call(a, "/api/backup", {"action": "set", "on": True})

    def test_store_rejects(self):
        b = self.b[1]
        code, _, _ = self.call(b, "/api/backup-store?from=X&file=x.tar.gz", b"abc", token="wrong")
        self.assertEqual(code, 401)
        for bad in ("../x.tar.gz", "x.sh", ".x.tar.gz"):
            code, d, _ = self.call(b, "/api/backup-store?from=X&file=" + urllib.parse.quote(bad), b"abc")
            self.assertEqual(code, 400, bad)
        self.assertFalse(os.path.exists(os.path.join(self.b[2], "data", "peer-backups", "X")))
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "B", "data", "x.tar.gz")))


if __name__ == "__main__":
    unittest.main()
