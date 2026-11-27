"""網頁程式檢查：最外層的函式不能取一樣的名字（後面的會蓋掉前面的，畫面會卡在「讀取中…」）。"""
import collections
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class WebJs(unittest.TestCase):
    def test_no_duplicate_top_level_names(self):
        src = ""
        for name in ("app.js", "pin.js", "fly.js"):       # fly.js 用到才載入，但跟 app.js 共用同一組名字
            with open(os.path.join(ROOT, "web", name), encoding="utf-8") as f:
                src += f.read() + "\n"
        names = re.findall(r"^(?:async\s+)?function\s+(\w+)\s*\(", src, re.M)
        names += re.findall(r"^(?:const|let|var)\s+(\w+)\s*=", src, re.M)
        dup = [n for n, c in collections.Counter(names).items() if c > 1]
        self.assertEqual(dup, [], f"重複的名字：{dup}")

    def test_ios_tap_delegation(self):
        """iPhone 點到不是按鈕的東西（標題列、IP）：document 上的 click 委派收不到，body 下每個區塊要掛一個空的點擊監聽。"""
        for name in ("app.js", "album.js"):
            with open(os.path.join(ROOT, "web", name), encoding="utf-8") as f:
                src = f.read()
            self.assertTrue("_tapOk" in src, f"{name} 少了給 iPhone 的點擊監聽")

    def test_swipe_back_no_layer_per_touch(self):
        """往右滑退回：手指按下時不能先畫上一層（以前每點一下多一層沒拿掉，iPhone 手勢沒反應、安卓一直重畫）。"""
        with open(os.path.join(ROOT, "web", "app.js"), encoding="utf-8") as f:
            src = f.read()
        i = src.index("let NAVSWIPE = 0;")
        j = src.index('addEventListener("touchstart"', i)
        k = src.index("}, {passive:true});", j)
        self.assertFalse("createElement" in src[j:k], "touchstart 裡不能建立底下那一層")
        self.assertTrue(":not(.gone,.under)" in src[j:k], "拖的要是現在這一層，不是底下那層")


if __name__ == "__main__":
    unittest.main()
