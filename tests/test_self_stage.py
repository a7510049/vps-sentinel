"""更新哨兵時網頁要知道跑到哪一步（下載、安裝、重新啟動），新版打不開換回舊版也要看得出來。只用 Python 內建模組。"""
import os
import tempfile
import unittest

from test_passkey import load_sentinel

S = load_sentinel()


class SelfStageTest(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp()
        os.close(fd)
        S.SELF_LOG = self.path

    def tearDown(self):
        os.unlink(self.path)

    def log(self, *lines):
        with open(self.path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        return S.self_last()

    def test_stages(self):
        self.assertEqual(self.log("=== 開始更新哨兵 x ==="), (None, "dl"))
        self.assertEqual(self.log("=== 開始更新哨兵 x ===", "__STEP__ inst")[1], "inst")
        self.assertEqual(self.log("=== 開始更新哨兵 x ===", "__STEP__ inst", "[1/4] 安裝主程式", "[3/4] 防火牆")[1], "inst")
        self.assertEqual(self.log("=== 開始更新哨兵 x ===", "__STEP__ inst", "[1/4] 安裝主程式", "[4/4] 啟動哨兵")[1], "boot")

    def test_result_and_rollback(self):
        last, stage = self.log("=== 開始更新哨兵 x ===", "[4/4] 啟動哨兵", "  ✓ 已啟動，開機也會自動啟動", "__RESULT__ ok 100")
        self.assertEqual(stage, "")
        self.assertEqual(last, {"ok": True, "time": 100.0, "rolled": False})
        last, _ = self.log("=== 開始更新哨兵 x ===", "[4/4] 啟動哨兵", "  ✗ 新版啟動失敗，已換回原本的版本", "__RESULT__ fail 200")
        self.assertEqual(last, {"ok": False, "time": 200.0, "rolled": True})

    def test_new_run_after_old_result(self):
        last, stage = self.log("=== 開始更新哨兵 a ===", "  ✗ 新版啟動失敗，已換回原本的版本", "__RESULT__ fail 1", "=== 開始更新哨兵 b ===")
        self.assertTrue(last["rolled"])
        self.assertEqual(stage, "dl")


if __name__ == "__main__":
    unittest.main()
