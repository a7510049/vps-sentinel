"""在畫面上找到某段文字，印出它的中心座標（給 adb shell input tap 用）"""
import re
import subprocess
import sys

want = sys.argv[1]
subprocess.run(["adb", "shell", "uiautomator", "dump", "/sdcard/u.xml"], capture_output=True)
xml = subprocess.run(["adb", "exec-out", "cat", "/sdcard/u.xml"], capture_output=True, text=True).stdout
for m in re.finditer(r'<node [^>]*>', xml):
    n = m.group(0)
    t = re.search(r' text="([^"]*)"', n)
    d = re.search(r' content-desc="([^"]*)"', n)
    if (t and want in t.group(1)) or (d and want in d.group(1)):
        x1, y1, x2, y2 = map(int, re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n).groups())
        print((x1 + x2) // 2, (y1 + y2) // 2)
        sys.exit(0)
print("找不到：" + want, file=sys.stderr)
sys.exit(1)
