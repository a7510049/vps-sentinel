"""專案規則：主機上只用 Python 內建模組、網頁呼叫的 /api/… 後端都有處理。"""
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {".git", ".claude", "node_modules", "__pycache__", "venv"}
# 網頁還在呼叫、主機已經拿掉的 API（只會拿到 404，不影響使用；要清掉時從這裡和 web/ 一起拿掉）
KNOWN_GONE = {"/api/cloud-login"}


def files(ext):
    out = []
    for d, ds, fs in os.walk(ROOT):
        ds[:] = [x for x in ds if x not in SKIP]
        out += [os.path.relpath(os.path.join(d, f), ROOT) for f in fs if f.endswith(ext)]
    return sorted(out)


def read(f):
    with open(os.path.join(ROOT, f), encoding="utf-8", errors="replace") as fh:
        return fh.read()


class ProjectRules(unittest.TestCase):
    def test_stdlib_only(self):
        local = {os.path.splitext(os.path.basename(f))[0] for f in files(".py")}
        std = set(sys.stdlib_module_names) | local | {"__future__"}
        rx = re.compile(r"^\s*(?:from\s+([A-Za-z_]\w*)|import\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*))", re.M)
        bad = set()
        for f in files(".py"):
            if f.startswith("tools/"):              # tools/ 在開發機、GitHub Actions 跑，不會裝到主機上
                continue
            for m in rx.finditer(read(f)):
                names = [m.group(1)] if m.group(1) else [x.strip() for x in m.group(2).split(",")]
                bad |= {f"{f}: {n}" for n in names if n and n not in std}
        self.assertEqual(sorted(bad), [], "用了非內建模組")

    def test_no_external_scripts(self):
        bad = [f"{f}: {u}" for f in files(".js") + files(".html") if f.startswith("web/")
               for u in re.findall(r"<script[^>]+src=[\"'](https?://[^\"']+)", read(f))]
        self.assertEqual(bad, [], "網頁載入外部程式")

    def test_web_api_routes_exist(self):
        py = "".join(read(f) for f in files(".py") if not f.startswith(("tests/", "tools/")))
        used = set()
        for f in files(".js") + files(".html"):
            if f.startswith("web/"):
                used |= set(re.findall(r"[\"'`](/api/[a-z0-9][a-z0-9_\-/]*)", read(f)))
        self.assertTrue(used)
        self.assertEqual(sorted(u for u in used if u.rstrip("/") not in py and u not in KNOWN_GONE), [], "網頁有呼叫、後端找不到")


if __name__ == "__main__":
    unittest.main()
