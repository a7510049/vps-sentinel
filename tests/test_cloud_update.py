"""雲端硬碟更新中不能拿舊版去比對：不然更新完還會一直說「有新版」。只用 Python 內建模組。"""
import unittest

from test_passkey import load_sentinel

S = load_sentinel()


class CloudCheckTest(unittest.TestCase):
    def setUp(self):
        self.calls = 0
        S.CLOUD_URL = "http://127.0.0.1/cloud/"
        S.shutil.which = lambda n: "/usr/bin/" + n
        S.cloud_local = lambda: (["sha256:old"], "v2.0.0")

        def remote():
            self.calls += 1
            return "sha256:new"
        S.cloud_remote_digest = remote
        S.CLOUDUP.update(checked=0, has=None, err="")

    def test_running_skips_remote_check(self):
        S.cloud_running = lambda: True
        r = S.cloud_check()
        self.assertTrue(r["running"])
        self.assertIsNone(r["has"])
        self.assertEqual(self.calls, 0)
        self.assertEqual(S.CLOUDUP["checked"], 0)     # 更新完還會再查一次

    def test_after_update_checks_again(self):
        S.cloud_running = lambda: True
        S.cloud_check()
        S.cloud_running = lambda: False
        S.cloud_local = lambda: (["sha256:new"], "v2.0.1")
        r = S.cloud_check()
        self.assertEqual(self.calls, 1)
        self.assertFalse(r["has"])
        self.assertEqual(r["version"], "v2.0.1")


if __name__ == "__main__":
    unittest.main()
