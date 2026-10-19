"""網頁程式檢查：最外層的函式不能取一樣的名字（後面的會蓋掉前面的，畫面會卡在「讀取中…」）。"""
import collections
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class WebJs(unittest.TestCase):
    def test_no_duplicate_top_level_names(self):
        with open(os.path.join(ROOT, "web", "app.js"), encoding="utf-8") as f:
            src = f.read()
        names = re.findall(r"^(?:async\s+)?function\s+(\w+)\s*\(", src, re.M)
        names += re.findall(r"^(?:const|let|var)\s+(\w+)\s*=", src, re.M)
        dup = [n for n, c in collections.Counter(names).items() if c > 1]
        self.assertEqual(dup, [], f"重複的名字：{dup}")


if __name__ == "__main__":
    unittest.main()
