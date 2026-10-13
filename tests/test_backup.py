"""每日備份的測試：打包內容正確（資料庫是完整的一份）、加密格式打得開也防竄改、兩台都有兩台的備份、Telegram、下載、換密碼。

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

HA, HB = "Oracle Cloud", "香港 Azure"
FNAME = r"^{} \d{{4}}-\d\d-\d\d \d\d\.\d\d( \(\d+\))?\.vsbk$"
DOCS = []                                                                       # 假的 Telegram 收到的檔案 [(檔名, 內容, 說明文字, 訊息編號)]
DELETED = []                                                                    # 假的 Telegram 被刪掉的訊息編號


def is_old(path):
    """測試裡假裝的 1.31 版舊檔案"""
    with open(path, "rb") as f:
        return f.read(8) == b"VSBK-old"


class FakeTG(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        mid = 1
        if self.path.endswith("/deleteMessage"):
            DELETED.append(int(urllib.parse.parse_qs(body.decode())["message_id"][0]))
        if self.path.endswith("/sendDocument"):
            b = self.headers["Content-Type"].split("boundary=")[1].encode()
            parts = {}
            for part in body.split(b"--" + b)[1:-1]:
                head, _, data = part.partition(b"\r\n\r\n")
                name = re.search(rb'name="([^"]+)"', head).group(1).decode()
                fn = re.search(rb'filename="([^"]+)"', head)
                parts[name] = (fn.group(1).decode() if fn else None, data[:-2])
            mid = 100 + len(DOCS)
            DOCS.append((parts["document"][0], parts["document"][1], parts["caption"][1].decode(), mid))
        out = json.dumps({"ok": True, "result": {"message_id": mid}}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


def start(tmp, name, extra, env_extra=None, display=None):
    port = free_port()
    d = os.path.join(tmp, name)
    os.makedirs(d)
    conf = os.path.join(d, "test.conf")
    with open(conf, "w", encoding="utf-8") as f:
        f.write(f"BIND=127.0.0.1\nPORT={port}\nTOKEN={TOKEN}\nNAME={display or name}\nDATA_DIR={d}/data\nCLOUD_DIR={d}/cloud\n{extra}")
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
        # 主機在網頁上顯示的名稱（NAME）跟主要那台設定裡的代號（PEERS 的 HK）不一樣：備份一律用顯示的名稱
        cls.b = start(cls.tmp, "B", f"BACKUP_PATHS={cls.src}\n", display=HB)
        cls.procs.append(cls.b)
        tg = {"SENTINEL_TG_API": f"http://127.0.0.1:{cls.tg.server_address[1]}/bot"}
        cls.a = start(cls.tmp, "A", f"BACKUP_PATHS={cls.src}\nPEERS=HK=http://127.0.0.1:{cls.b[1]}\n"
                      "TG_BOT_TOKEN=123:abc\nTG_CHAT_ID=42\n", tg, display=HA)
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

    def decrypt(self, data, key):
        """用哨兵自己的還原指令解開（跟使用者在新主機上做的一樣）"""
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "x.vsbk")
            with open(src, "wb") as f:
                f.write(data)
            out = subprocess.run([sys.executable, os.path.join(ROOT, "sentinel.py"), "--decrypt", src],
                                 input=key + "\n", capture_output=True, text=True, cwd=d)
            if out.returncode != 0:
                return None, out.stderr
            with open(os.path.join(d, "x.tar.gz"), "rb") as f:
                return f.read(), out.stdout

    def check_tar(self, data):
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as t:
            names = t.getnames()
            src = self.src.lstrip("/")
            self.assertIn(f"{src}/settings.json", names)
            self.assertNotIn(f"{src}/cache/junk.bin", names)          # 暫存資料夾不備份
            self.assertFalse([n for n in names if n.endswith("-wal") or n.endswith("-shm")])
            self.assertTrue([n for n in names if n.startswith("還原說明")])
            self.assertTrue([n for n in names if n.endswith(".conf")])  # 哨兵自己的設定
            self.assertFalse([n for n in names if n.endswith(".vsbk")])  # 不會把備份又包進備份裡
            with tempfile.TemporaryDirectory() as d:
                with open(os.path.join(d, "db"), "wb") as f:
                    f.write(t.extractfile(f"{src}/x-ui.db").read())
                c = sqlite3.connect(os.path.join(d, "db"))
                self.assertEqual(c.execute("SELECT count(*) FROM users").fetchone()[0], 50)   # 資料庫是完整的
                c.close()

    def wait_done(self, port):
        deadline = time.time() + 90
        while time.time() < deadline:
            _, st, _ = self.call(port, "/api/backup")
            if not st["running"] and st["last"] and st["last"]["t"] > self.t0:
                return st
            time.sleep(0.5)
        self.fail("備份 90 秒內沒有完成")

    def files(self, host, who):
        d = os.path.join(host[2], "data", "backups", who)
        return sorted((os.path.join(d, f) for f in os.listdir(d)), key=os.path.getmtime)

    def run_backup(self):
        self.t0 = time.time()
        code, d, _ = self.call(self.a[1], "/api/backup", {"action": "run"})
        self.assertEqual(code, 200, d)
        return self.wait_done(self.a[1])

    def test_flow(self):
        a, b = self.a[1], self.b[1]
        legacy = os.path.join(self.a[2], "data", "backups", "A-old.tar.gz")       # 1.30 版留下的沒加密備份
        os.makedirs(os.path.dirname(legacy), exist_ok=True)
        with open(legacy, "wb") as f:
            f.write(b"old")
        # 1.31 版：資料夾和檔名用了不同的名字（代號 HK、空白換成底線），要搬到一致的名稱
        old = {os.path.join(self.a[2], "data", "backups", "HK", "Microsoft_Azure-20261013-152249.vsbk"): 1791876169,
               os.path.join(self.a[2], "data", "backups", "Oracle_Cloud", "Oracle_Cloud-20261013-162242.vsbk"): 1791876162}
        for p, mt in old.items():
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "wb") as f:
                f.write(b"VSBK-old")
            os.utime(p, (mt, mt))
        code, _, _ = self.call(a, "/api/backup", {"action": "tz", "tz": 480})          # 網頁告訴主機：使用者在 UTC+8
        self.assertEqual(code, 200)
        st = self.run_backup()
        last = st["last"]
        self.assertTrue(last["ok"], last)
        self.assertEqual([x["where"] for x in last["to"]],
                         ["存在這台的主機上", "傳到 Telegram", f"存到「{HB}」的主機上", f"「{HB}」的備份也存了一份在這台的主機上"])
        self.assertIn("其他", last["items"])
        self.assertIn("哨兵設定", last["items"])
        self.assertFalse(os.path.exists(legacy))
        for p in old:                                                              # 舊資料夾搬空、刪掉了
            self.assertFalse(os.path.exists(os.path.dirname(p)))
        self.assertTrue(os.path.exists(os.path.join(self.a[2], "data", "backups", HB, f"{HB} 2026-10-13 15.22.vsbk")))
        self.assertTrue(os.path.exists(os.path.join(self.a[2], "data", "backups", HA, f"{HA} 2026-10-13 15.22.vsbk")))

        # 兩台都有兩台的備份，而且是同一組解開密碼
        key = st["key"]
        _, bst, _ = self.call(b, "/api/backup")
        self.assertEqual(bst["key"], key)
        self.assertEqual(sorted(os.listdir(os.path.join(self.b[2], "data", "backups"))), sorted([HA, HB]))
        for host in (self.a, self.b):
            for who in (HA, HB):
                fs = [f for f in self.files(host, who) if not is_old(f)]
                self.assertEqual(len(fs), 1, (host[2], who))
                self.assertRegex(os.path.basename(fs[0]), FNAME.format(re.escape(who)))
                with open(fs[0], "rb") as f:
                    data = f.read()
                self.assertTrue(data.startswith(b"VSBK"))
                self.assertNotIn(b"settings.json", data)                  # 看不到裡面的東西
                plain, _ = self.decrypt(data, key)
                self.check_tar(plain)
        self.assertEqual([c["name"] for c in st["copies"]], [HA, HB])
        self.assertEqual([c["name"] for c in bst["copies"]], [HB, HA])
        self.assertEqual(bst["tz"], 480)                                            # 時區也同步給另一台了

        # 密碼錯、檔案被改過：都打不開
        with open(self.files(self.a, HA)[-1], "rb") as f:
            data = f.read()
        plain, err = self.decrypt(data, key + "x")
        self.assertIsNone(plain)
        self.assertIn("解開密碼不對", err)
        bad = bytearray(data)
        bad[len(bad) // 2] ^= 1
        self.assertIsNone(self.decrypt(bytes(bad), key)[0])
        self.assertIsNone(self.decrypt(b"hello" * 20, key)[0])

        # Telegram：A 自己一份，B 沒設定 Telegram，A 幫它傳一份；都是加密的哨兵備份檔
        self.assertEqual(sorted(re.sub(r" \d{4}-.*", "", x[0]) for x in DOCS), sorted([HA, HB]))
        for fn, data, cap, _ in DOCS:
            who = HA if fn.startswith(HA) else HB
            self.assertRegex(fn, FNAME.format(re.escape(who)))
            self.assertIn(f"<b>{who}</b>", cap)                                   # 說明文字跟檔名用同一個名稱
            self.assertIn(f"<tg-spoiler><code>{key}</code></tg-spoiler>", cap)    # 私人對話：附上打碼的解開密碼
            self.check_tar(self.decrypt(data, key)[0])
        first = [x[3] for x in DOCS]
        self.assertEqual(DELETED, [])

        # 網頁下載：這台、透過 A 下載 B 的（都是加密的）
        code, data, h = self.call(a, "/api/backup-file", raw=True)
        self.assertEqual(code, 200)
        self.check_tar(self.decrypt(data, key)[0])
        code, data, h = self.call(a, "/api/backup-file?node=HK", raw=True)
        self.assertEqual(code, 200)
        self.assertTrue(urllib.parse.unquote(h["X-Backup-Name"]).startswith(HB + " "))
        self.check_tar(self.decrypt(data, key)[0])

        # 改成自己的密碼：兩台一起改，之後的備份用新密碼（B 會重新打包，不拿舊密碼做的那份）
        code, d, _ = self.call(a, "/api/backup", {"action": "key", "key": " 太短 ", "sync": True})
        self.assertEqual(code, 400)
        code, d, _ = self.call(a, "/api/backup", {"action": "key", "key": "我的新密碼 2026!", "sync": True})
        self.assertEqual(code, 200, d)
        self.assertEqual(self.call(b, "/api/backup")[1]["key"], "我的新密碼 2026!")
        st = self.run_backup()
        self.assertTrue(st["last"]["ok"], st["last"])
        for who in (HA, HB):
            with open(self.files(self.a, who)[-1], "rb") as f:
                self.check_tar(self.decrypt(f.read(), "我的新密碼 2026!")[0])
        with open([f for f in self.files(self.a, HA) if not is_old(f)][0], "rb") as f:   # 以前的備份還是用舊密碼開
            self.check_tar(self.decrypt(f.read(), key)[0])

        # Telegram 裡每台只留最新一份：新的傳成功後，前一份被刪掉；新的說明附的是新密碼
        self.assertEqual(sorted(DELETED), sorted(first))
        for fn, data, cap, _ in DOCS[len(first):]:
            self.assertIn("<tg-spoiler><code>我的新密碼 2026!</code></tg-spoiler>", cap)
            self.check_tar(self.decrypt(data, "我的新密碼 2026!")[0])

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
        for bad in ("../x.vsbk", "x.sh", ".x.vsbk", "x.tar.gz"):
            code, d, _ = self.call(b, "/api/backup-store?from=X&file=" + urllib.parse.quote(bad), b"abc")
            self.assertEqual(code, 400, bad)
        self.assertFalse(os.path.exists(os.path.join(self.b[2], "data", "backups", "X")))
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "B", "data", "x.vsbk")))


if __name__ == "__main__":
    unittest.main()
