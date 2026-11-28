"""網頁程式檢查：最外層的函式不能取一樣的名字（後面的會蓋掉前面的，畫面會卡在「讀取中…」）。"""
import collections
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class WebJs(unittest.TestCase):
    def test_no_duplicate_top_level_names(self):
        src = ""
        for name in ("icons.js", "app.js", "nav.js", "pin.js", "fly.js"):       # fly.js 用到才載入，但跟 app.js 共用同一組名字
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

    def test_platform_ui(self):
        """三種平台介面：畫面出來前就判斷好平台（不閃別的平台）、三個平台都有樣式、確認視窗不能撞到主機頁的 .alert。"""
        html = open(os.path.join(ROOT, "web", "index.html"), encoding="utf-8").read()
        js = open(os.path.join(ROOT, "web", "app.js"), encoding="utf-8").read()
        css = open(os.path.join(ROOT, "web", "style.css"), encoding="utf-8").read()
        head = html[:html.index("/*@style.css*/")]
        self.assertIn("dataset.plat", head, "index.html 要在樣式之前先設好 data-plat")
        for p in ("ios", "android", "desktop"):
            self.assertIn(f'"{p}"', head)
            self.assertIn(f'[data-plat="{p}"]', css, f"style.css 少了 {p} 的樣式")
        self.assertIn('plat:"auto"', js, "預設要是自動判斷")
        self.assertNotIn(".dialog.alert", css, "確認視窗用 .dlga（.alert 是主機頁的告警）")
        # 換分頁：只在離開第一個分頁時多記一筆（返回先回「主機」），不能每換一次就多一筆
        nav = open(os.path.join(ROOT, "web", "nav.js"), encoding="utf-8").read()
        i = nav.index("function tabGo(")
        body = nav[i:nav.index("\n}", i)]
        pushes = [line for line in body.splitlines() if "hPush" in line]
        self.assertTrue(pushes)
        for line in pushes:
            self.assertIn("!st.tb", line)


if __name__ == "__main__":
    unittest.main()


class IconSystem(unittest.TestCase):
    """共用圖示系統（web/icons.js）：程式裡用到的名字都要有、線條圖示不填色、同一個圖案不能有兩個名字。"""
    def setUp(self):
        rd = lambda n: open(os.path.join(ROOT, "web", n), encoding="utf-8").read()
        self.ic, self.app, self.alb = rd("icons.js"), rd("app.js"), rd("album.js")
        self.icons = dict(re.findall(r'^\s*"([a-z0-9-]+)": \'(.*?)\',(?:\s*//.*)?$', self.ic, re.M))

    def test_kit_names(self):
        kit = "home servers history settings search plus cloud-drive remote-download backup-archive encrypted-notes ad-block photo-album refresh-sync alert analytics network storage memory cpu user share notification chevron-right arrow-back link upload play pause stop edit delete close check pin folder host-add shield-check dot-online dot-offline".split()
        self.assertEqual([k for k in kit if k not in self.icons], [])

    def test_style(self):
        for k, v in self.icons.items():
            self.assertNotIn("fill=", v, f"{k} 不能填色（設計規範：線條圖示）")
            self.assertNotIn("stroke-width", v, f"{k} 線條粗細一律 2px，不要自己改")
        dup = [k for k, n in collections.Counter(self.icons.values()).items() if n > 1]
        self.assertEqual(dup, [], "同一個圖案出現兩個名字")

    def test_names_used_exist(self):
        pm = self.app[self.app.index("const PMAP = {"):self.app.index("const P = Object")]
        miss = [v for v in re.findall(r':"([a-z0-9-]+)"', pm) if v not in self.icons]
        miss += [v for v in re.findall(r'ICONS\["([a-z0-9-]+)"\]', self.app + self.alb) if v not in self.icons]
        miss += [v for v in re.findall(r'ICONS\.([a-z0-9]+)', self.app + self.alb) if v not in self.icons]
        self.assertEqual(miss, [], "用到了圖示系統裡沒有的名字")
