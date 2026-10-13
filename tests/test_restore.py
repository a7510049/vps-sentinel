"""還原的測試：把備份放回去（放到測試用的資料夾，指令只列出來不真的執行）、原本的檔案先留一份、新主機用的還原連結。只用 Python 內建模組。"""
import glob
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
import urllib.parse

import test_backup
from test_backup import start
from test_smoke import ROOT

NAME = "還原測試"


class RestoreTest(unittest.TestCase):
    call = test_backup.BackupTest.call

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.src = os.path.join(cls.tmp, "app")
        os.makedirs(cls.src)
        with open(os.path.join(cls.src, "settings.json"), "w") as f:
            f.write("備份時的內容")
        cls.h = start(cls.tmp, "R", f"BACKUP_PATHS={cls.src}\n", display=NAME)

    @classmethod
    def tearDownClass(cls):
        p, _, _, log = cls.h
        p.terminate()
        p.wait(10)
        log.close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def restore(self, src, key, root):
        env = {**os.environ, "SENTINEL_RESTORE_ROOT": root, "SENTINEL_RESTORE_DRY": "1"}
        return subprocess.run([sys.executable, os.path.join(ROOT, "sentinel.py"), "--restore", src, "--yes"],
                              input=key + "\n", capture_output=True, text=True, env=env, timeout=120)

    def test_restore(self):
        port = self.h[1]
        t0 = time.time()
        self.call(port, "/api/backup", {"action": "run"})
        while time.time() < t0 + 90:
            st = self.call(port, "/api/backup")[1]
            if not st["running"] and st["last"] and st["last"]["t"] > t0:
                break
            time.sleep(0.5)
        self.assertTrue(st["last"]["ok"], st["last"])
        key = st["key"]
        f = glob.glob(os.path.join(self.h[2], "data", "backups", NAME, "*.vsbk"))[-1]
        with open(f, "rb") as fh:
            data = fh.read()

        # 備份裡有還原用的資料
        plain = test_backup.BackupTest.decrypt(self, data, key)[0]
        with tarfile.open(fileobj=__import__("io").BytesIO(plain), mode="r:gz") as t:
            self.assertIn("vsbk-manifest.json", t.getnames())

        # 還原到一個「已經有舊檔案」的地方：舊的先留一份，再放回備份的內容
        root = os.path.join(self.tmp, "root")
        target = os.path.join(root, self.src.lstrip("/"), "settings.json")
        os.makedirs(os.path.dirname(target))
        with open(target, "w") as fh:
            fh.write("還原前的內容")
        out = self.restore(f, key, root)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        with open(target) as fh:
            self.assertEqual(fh.read(), "備份時的內容")
        self.assertIn(f"「{NAME}」", out.stdout)
        self.assertIn("install.sh", out.stdout)                           # 新主機：先把哨兵裝起來
        self.assertIn("systemctl restart vps-sentinel-lite", out.stdout)
        self.assertIn("還原完成 ✅", out.stdout)
        kept = glob.glob(os.path.join(root, "root", "還原前的檔案-*.tar.gz"))
        self.assertEqual(len(kept), 1)
        with tarfile.open(kept[0]) as t:
            self.assertEqual(t.extractfile(os.path.join(self.src.lstrip("/"), "settings.json")).read().decode(), "還原前的內容")
        self.assertTrue(os.path.exists(os.path.join(root, self.h[2].lstrip("/"), "test.conf")))   # 哨兵的設定也放回去了

        # 密碼不對：什麼都不動
        out = self.restore(f, key + "x", os.path.join(self.tmp, "root-bad"))
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("沒有解開", out.stderr)
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "root-bad")))

        # 新主機用的還原連結：不用登入就能下載加密的備份檔；簽章不對、過期都不行
        code, d, _ = self.call(port, "/api/backup", {"action": "link", "host": NAME})
        self.assertEqual(code, 200, d)
        code, got, _ = self.call(port, "/api/backup-dl?" + d["q"], token=None, raw=True)
        self.assertEqual((code, got), (200, data))
        q = urllib.parse.parse_qs(d["q"])
        bad = urllib.parse.urlencode({"h": NAME, "e": q["e"][0], "s": "0" * 40})
        self.assertEqual(self.call(port, "/api/backup-dl?" + bad, token=None, raw=True)[0], 403)
        old = urllib.parse.urlencode({"h": NAME, "e": "1000", "s": q["s"][0]})
        self.assertEqual(self.call(port, "/api/backup-dl?" + old, token=None, raw=True)[0], 403)
        self.assertEqual(self.call(port, "/api/backup", {"action": "link", "host": "../etc"})[0], 404)
        self.assertEqual(self.call(port, "/api/backup", {"action": "link", "host": NAME}, token="wrong")[0], 401)

        # 用連結還原（新主機的做法）
        out = self.restore(f"http://127.0.0.1:{port}/api/backup-dl?{d['q']}", key, os.path.join(self.tmp, "root2"))
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "root2", self.src.lstrip("/"), "settings.json")))


if __name__ == "__main__":
    unittest.main()
