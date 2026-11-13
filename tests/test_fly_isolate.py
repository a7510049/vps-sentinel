"""機場起降出問題不拖累監控：fly.py 壞掉照樣能開、同時太多機場連線就先擋下"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

from test_passkey import load_sentinel
from test_smoke import ROOT, TOKEN, free_port


class BrokenFly(unittest.TestCase):
    def test_monitor_still_runs(self):
        d = tempfile.mkdtemp()
        try:
            for name in ("sentinel.py", "pair.py", "download.py", "backup.py", "web", "data"):
                os.symlink(os.path.join(ROOT, name), os.path.join(d, name))
            with open(os.path.join(d, "fly.py"), "w", encoding="utf-8") as f:
                f.write("raise RuntimeError('壞掉了')\n")
            port = free_port()
            conf = os.path.join(d, "test.conf")
            with open(conf, "w", encoding="utf-8") as f:
                f.write(f"BIND=127.0.0.1\nPORT={port}\nTOKEN={TOKEN}\nNAME=測試\nDATA_DIR={d}/data-dir\n")
            env = {k: v for k, v in os.environ.items() if not k.startswith("SENTINEL_")}
            env["SENTINEL_CONF"] = conf
            log = open(os.path.join(d, "log"), "w+", encoding="utf-8")
            p = subprocess.Popen([sys.executable, os.path.join(d, "sentinel.py")], cwd=d, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                def get(path):
                    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", headers={"X-Token": TOKEN})
                    try:
                        with urllib.request.urlopen(req, timeout=10) as r:
                            return r.status, r.read()
                    except urllib.error.HTTPError as e:
                        return e.code, e.read()
                for _ in range(100):
                    try:
                        code, body = get("/api/all")
                        break
                    except OSError:
                        time.sleep(0.2)
                self.assertEqual(code, 200)                       # 監控照常
                self.assertTrue(json.loads(body)[0]["name"])
                code, body = get("/api/flights?ap=TPE")
                self.assertEqual(code, 503)                       # 只有機場起降不能用
                self.assertFalse(json.loads(body)["ok"])
                self.assertEqual(get("/")[0], 200)
                log.seek(0)
                self.assertIn("機場起降載入失敗", log.read())
            finally:
                p.terminate()
                p.wait(10)
                log.close()
        finally:
            shutil.rmtree(d, ignore_errors=True)


class FlyLimit(unittest.TestCase):
    def test_enter_leave(self):
        s = load_sentinel()
        self.assertTrue(s.FLY_OK)
        got = [s.fly_enter() for _ in range(s.FLY_MAX)]
        self.assertTrue(all(got))
        self.assertFalse(s.fly_enter())                       # 滿了
        s.fly_leave()
        self.assertTrue(s.fly_enter())                        # 空出一個就能進
        for _ in range(s.FLY_MAX):
            s.fly_leave()
        self.assertEqual(s.FLY_BUSY["n"], 0)


if __name__ == "__main__":
    unittest.main()
