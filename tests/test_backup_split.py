"""備份超過 Telegram 的 50 MB：切成好幾段傳，還原（--decrypt、--restore）時自動接回來；少一段會說少哪段。
測試把每段縮小成 8 KB（SENTINEL_TG_PART），備份裡放打不散的亂數檔案讓它一定要切。只用 Python 內建模組。"""
import glob
import http.server
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest

import test_backup
from test_backup import DELETED, DOCS, FakeTG, start
from test_smoke import ROOT, free_port

NAME = "分段測試"
PART = 8192


class SplitTest(unittest.TestCase):
    call = test_backup.BackupTest.call

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.tg = http.server.ThreadingHTTPServer(("127.0.0.1", free_port()), FakeTG)
        threading.Thread(target=cls.tg.serve_forever, daemon=True).start()
        cls.src = os.path.join(cls.tmp, "app")
        os.makedirs(cls.src)
        with open(os.path.join(cls.src, "big.bin"), "wb") as f:
            f.write(os.urandom(30000))
        with open(os.path.join(cls.src, "settings.json"), "w") as f:
            f.write("備份時的內容")
        cls.h = start(cls.tmp, "S", f"BACKUP_PATHS={cls.src}\nTG_BOT_TOKEN=123:abc\nTG_CHAT_ID=42\n",
                      {"SENTINEL_TG_API": f"http://127.0.0.1:{cls.tg.server_address[1]}/bot", "SENTINEL_TG_PART": str(PART)},
                      display=NAME)
        os.makedirs(os.path.join(cls.h[2], "data", "fly-logos"))
        with open(os.path.join(cls.h[2], "data", "fly-logos", "x.png"), "wb") as f:   # 重抓得到的：不備份
            f.write(b"logo")

    @classmethod
    def tearDownClass(cls):
        p, _, _, log = cls.h
        p.terminate()
        p.wait(10)
        log.close()
        cls.tg.shutdown()
        DOCS.clear()                                # 假的 Telegram 跟 test_backup 共用：清掉，不影響它
        DELETED.clear()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def run_backup(self):
        t0 = time.time()
        self.call(self.h[1], "/api/backup", {"action": "run"})
        while time.time() < t0 + 90:
            st = self.call(self.h[1], "/api/backup")[1]
            if not st["running"] and st["last"] and st["last"]["t"] > t0:
                return st
            time.sleep(0.5)
        self.fail("備份 90 秒內沒有完成")

    def sh(self, args, key, env=None, cwd=None):
        return subprocess.run([sys.executable, os.path.join(ROOT, "sentinel.py"), *args], input=key + "\n",
                              capture_output=True, text=True, env={**os.environ, **(env or {})}, cwd=cwd, timeout=120)

    def test_split(self):
        DOCS.clear()
        DELETED.clear()
        st = self.run_backup()
        self.assertTrue(st["last"]["ok"], st["last"])
        key = st["key"]
        whole = glob.glob(os.path.join(self.h[2], "data", "backups", NAME, "*.vsbk"))[-1]
        size = os.path.getsize(whole)
        n = -(-size // PART)
        self.assertGreater(n, 2)

        # Telegram 收到 n 段，檔名有「第幾／幾段」，接起來跟完整的一模一樣
        self.assertEqual(len(DOCS), n)
        base = os.path.basename(whole)[:-5]
        self.assertEqual([d[0] for d in DOCS], [f"{base} 第{i}／{n}段.vsbk" for i in range(1, n + 1)])
        self.assertTrue(all(len(d[1]) <= PART for d in DOCS))
        with open(whole, "rb") as f:
            self.assertEqual(b"".join(d[1] for d in DOCS), f.read())
        cap = DOCS[0][2]
        self.assertTrue(cap.startswith("🗄"))
        self.assertIn(f"分 {n} 段", cap)
        self.assertIn(f"還原時 {n} 段一起選", cap)
        pw = re.search(r"<tg-spoiler>(.+)</tg-spoiler>", cap).group(1)
        self.assertTrue(all(d[2].startswith("🗄") and f"第 {i}／{n} 段" in d[2] for i, d in enumerate(DOCS[1:], 2)))

        # 從 Telegram 下載的幾段放在同一個資料夾：選哪一段都能解開、還原
        d = os.path.join(self.tmp, "dl")
        os.makedirs(d)
        for fn, data, _, _ in DOCS:
            with open(os.path.join(d, fn), "wb") as f:
                f.write(data)
        two = os.path.join(d, DOCS[1][0])
        out = self.sh(["--decrypt", two], pw, cwd=d)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertTrue(os.path.isfile(os.path.join(d, base + ".tar.gz")))
        self.assertEqual(sorted(os.listdir(d)), sorted([x[0] for x in DOCS] + [base + ".tar.gz"]))   # 沒留下暫存檔
        root = os.path.join(self.tmp, "root")
        out = self.sh(["--restore", os.path.join(d, DOCS[0][0]), "--yes"], key,
                      {"SENTINEL_RESTORE_ROOT": root, "SENTINEL_RESTORE_DRY": "1"})
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        with open(os.path.join(root, self.src.lstrip("/"), "settings.json")) as f:
            self.assertEqual(f.read(), "備份時的內容")
        with open(os.path.join(root, self.src.lstrip("/"), "big.bin"), "rb") as f:
            self.assertEqual(len(f.read()), 30000)
        self.assertFalse(os.path.exists(os.path.join(root, self.h[2].lstrip("/"), "data", "fly-logos")))

        # 少了一段：說清楚少哪段
        os.remove(os.path.join(d, DOCS[1][0]))
        out = self.sh(["--restore", os.path.join(d, DOCS[0][0]), "--yes"], key,
                      {"SENTINEL_RESTORE_ROOT": os.path.join(self.tmp, "root-bad"), "SENTINEL_RESTORE_DRY": "1"})
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("少了第 2 段", out.stderr)

        # 下一份傳完整後，前一份的每一段都收回
        first = [x[3] for x in DOCS]
        st = self.run_backup()
        self.assertTrue(st["last"]["ok"], st["last"])
        self.assertEqual(sorted(DELETED), sorted(first))


if __name__ == "__main__":
    unittest.main()
