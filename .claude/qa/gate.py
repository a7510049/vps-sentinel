#!/usr/bin/env python3
"""品質關卡：實際跑檢查，結果記在 .claude/state/checks.json（Stop hook 照這份判斷）。

  python3 .claude/qa/gate.py standard          語法、樣式規則、基本功能測試、shellcheck（CLAUDE.md 規定的四項）
  python3 .claude/qa/gate.py browser           三種瀏覽器＋手機：主控台錯誤、無障礙（axe）、畫面比對、自動更新不閃
  python3 .claude/qa/gate.py full              standard＋css＋security＋deps＋api＋deadcode＋browser
  python3 .claude/qa/gate.py release           full＋發布前一致性（SRC_FILES、install.sh、check.yml、VERSION）
  python3 .claude/qa/gate.py syntax|style|unit|shell|css|security|deps|api|deadcode   單項
  python3 .claude/qa/gate.py quick 檔案…        只檢查這幾個檔（PostToolUse 用，不記錄）

結束碼：全部通過 0，有失敗 1。只看實際指令的結束碼和輸出，不靠主觀判斷。
"""
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "hooks"))
import lib  # noqa: E402

ROOT = lib.ROOT
QA = HERE
VENV = os.path.join(QA, "venv", "bin")
SKIP_DIRS = {".git", ".claude", "node_modules", "__pycache__", "venv"}


def sh(cmd, timeout=600, env=None, cwd=ROOT):
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                           env={**os.environ, **(env or {})})
        return p.returncode, (p.stdout + p.stderr)
    except subprocess.TimeoutExpired:
        return 124, f"逾時（{timeout} 秒）"
    except OSError as e:
        return 127, f"跑不起來：{e}"


def files(ext):
    out = []
    for d, ds, fs in os.walk(ROOT):
        ds[:] = [x for x in ds if x not in SKIP_DIRS]
        out += [os.path.relpath(os.path.join(d, f), ROOT) for f in fs if f.endswith(ext)]
    return sorted(out)


def changed(ext=None, prefix=None):
    fs = [f for f in lib.changed_files() if os.path.exists(os.path.join(ROOT, f))]
    if ext:
        fs = [f for f in fs if f.endswith(ext)]
    if prefix:
        fs = [f for f in fs if f.startswith(prefix)]
    return fs


def tail(text, n=25):
    return "\n".join(text.strip().splitlines()[-n:])


# ── 各項檢查：回傳 (通過?, 摘要) ─────────────────────────────

def c_syntax():
    bad = []
    for f in files(".py"):
        code, out = sh([sys.executable, "-m", "py_compile", f], 60)
        if code:
            bad.append(tail(out, 6))
    return not bad, ("全部 .py 可編譯" if not bad else "\n".join(bad))


def c_style():
    code, out = sh([sys.executable, "tools/style_check.py"], 120)
    return code == 0, tail(out, 15)


def c_unit():
    code, out = sh([sys.executable, "-m", "unittest", "discover", "-s", "tests"], 1500)
    return code == 0, tail(out, 25)


def c_shell():
    if not shutil.which("shellcheck"):
        return False, "沒有安裝 shellcheck（apt-get install -y shellcheck）"
    sh_files = [f for f in os.listdir(ROOT) if f.endswith(".sh")]
    code, out = sh(["shellcheck", *sh_files], 120)
    return code == 0, tail(out, 20) or "沒有問題"


def c_css():
    fs = changed(".css")
    if not fs:
        return True, "這次沒改 CSS"
    code, out = sh([os.path.join(QA, "node_modules", ".bin", "stylelint"), "--config",
                    os.path.join(QA, "stylelint.config.mjs"), *fs], 180)
    return code == 0, tail(out, 25) or "Stylelint 沒有問題"


SECRET = re.compile(r"(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-ant-[A-Za-z0-9_-]{20,}"
                    r"|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b"
                    r"|vsk_[A-Za-z0-9_-]{16,}|vss_[A-Za-z0-9_-]{16,})")


def c_security():
    msgs, ok = [], True
    diff = lib.git("diff", "HEAD", "--", ".", *lib.EXCLUDE).decode("utf-8", "replace")
    added = "\n".join(line for line in diff.splitlines() if line.startswith("+"))
    for f in lib.changed_files():
        p = os.path.join(ROOT, f)
        if os.path.isfile(p) and f not in diff:
            try:
                added += "\n" + open(p, encoding="utf-8", errors="replace").read()
            except OSError:
                pass
    hits = SECRET.findall(added)
    if hits:
        ok = False
        msgs.append(f"改動裡疑似有金鑰／密碼 {len(hits)} 處（不能寫進專案）")
    fs = changed(".py") + changed(".js") + changed(".sh")
    if fs:
        sg = os.path.join(VENV, "semgrep")
        if not os.path.exists(sg):
            return False, "沒有 Semgrep（.claude/qa/venv）"
        code, out = sh([sg, "scan", "--metrics=off", "--quiet", "--error", "--config", "p/python",
                        "--config", "p/javascript", "--config", "p/secrets", "--config", "p/bash", *fs], 900)
        if code not in (0,):
            ok = False
            msgs.append("Semgrep：\n" + tail(out, 40))
        else:
            msgs.append(f"Semgrep 掃 {len(fs)} 個改過的檔：沒有問題")
    else:
        msgs.append("這次沒改程式檔")
    return ok, "\n".join(msgs)


def c_deps():
    """專案只能用 Python 內建模組（CLAUDE.md）。"""
    local = {os.path.splitext(os.path.basename(f))[0] for f in files(".py")}
    std = set(sys.stdlib_module_names) | local | {"__future__"}
    bad = []
    rx = re.compile(r"^\s*(?:from\s+([A-Za-z_][\w]*)|import\s+([A-Za-z_][\w]*(?:\s*,\s*[A-Za-z_][\w]*)*))", re.M)
    for f in files(".py"):
        text = open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
        for m in rx.finditer(text):
            names = [m.group(1)] if m.group(1) else [x.strip() for x in m.group(2).split(",")]
            for n in names:
                if n and n not in std:
                    bad.append(f"{f}: {n}")
    js_bad = []
    for f in files(".js"):
        text = open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
        for u in re.findall(r"<script[^>]+src=[\"'](https?://[^\"']+)", text):
            js_bad.append(f"{f}: {u}")
    msgs = []
    if bad:
        msgs.append("用了非內建模組：\n" + "\n".join(sorted(set(bad))))
    if js_bad:
        msgs.append("網頁載入外部程式：\n" + "\n".join(js_bad))
    return not (bad or js_bad), "\n".join(msgs) or "只用 Python 內建模組、網頁沒有外部程式"


def c_api():
    """網頁呼叫的 /api/… 後端都有處理。"""
    py = "".join(open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
                 for f in files(".py") if not f.startswith(("tests/", "tools/")))
    used = set()
    for f in files(".js") + files(".html"):
        if not f.startswith("web/"):
            continue
        text = open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
        used |= set(re.findall(r"[\"'`](/api/[a-z0-9][a-z0-9_\-/]*)", text))
    missing = sorted(u for u in used if u.rstrip("/") not in py)
    return not missing, ("網頁有呼叫、後端找不到：\n" + "\n".join(missing)) if missing \
        else f"網頁用到的 {len(used)} 個 API 後端都有"


def c_deadcode():
    """只看這次改過的檔（include() 載入的檔共用變數，看全部會誤報）。"""
    msgs = []
    pyf = changed(".py")
    if pyf and os.path.exists(os.path.join(VENV, "vulture")):
        code, out = sh([os.path.join(VENV, "vulture"), "--min-confidence", "80", *pyf], 300)
        if out.strip():
            msgs.append("Python 可能沒用到：\n" + tail(out, 30))
    jsf = changed(".js", "web/")
    if jsf:
        corpus = "".join(open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
                         for f in files(".js") + files(".html") + files(".py"))
        for f in jsf:
            text = open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
            for name in set(re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", text)):
                if len(re.findall(r"\b" + re.escape(name) + r"\b", corpus)) <= 1:
                    msgs.append(f"{f}: 函式 {name} 沒有地方用到")
    # 只是提醒，不擋（include() 共用變數、動態呼叫會誤報）
    return True, "\n".join(msgs) or "沒有發現沒用到的程式"


def c_browser():
    url = os.environ.get("SENTINEL_QA_URL")
    srv = None
    if not url:
        code, out = sh([sys.executable, os.path.join(QA, "scripts", "run_sentinel.py"), "start"], 90)
        if code:
            return False, "測試用哨兵起不來：\n" + tail(out, 20)
        srv = dict(line.split("=", 1) for line in out.strip().splitlines() if "=" in line)
        url, token = srv.get("URL"), srv.get("TOKEN", "")
    else:
        token = os.environ.get("SENTINEL_QA_TOKEN", "")
    try:
        code, out = sh([os.path.join(QA, "node_modules", ".bin", "playwright"), "test",
                        "--config", os.path.join(QA, "playwright.config.mjs"), "--trace", "off"],
                       1800, env={"SENTINEL_QA_URL": url, "SENTINEL_QA_TOKEN": token,
                                  "PLAYWRIGHT_BROWSERS_PATH": os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")},
                       cwd=QA)
    finally:
        if srv:
            sh([sys.executable, os.path.join(QA, "scripts", "run_sentinel.py"), "stop", srv.get("DIR", "")], 30)
    return code == 0, tail(out, 40)


def c_release():
    msgs = []
    src = open(os.path.join(ROOT, "sentinel.py"), encoding="utf-8", errors="replace").read()
    inst = open(os.path.join(ROOT, "install.sh"), encoding="utf-8", errors="replace").read()
    ci = open(os.path.join(ROOT, ".github", "workflows", "check.yml"), encoding="utf-8", errors="replace").read()
    new = lib.git("ls-files", "-o", "--exclude-standard", "--", ".", *lib.EXCLUDE).decode().split()
    for f in new:
        if f.startswith(("tests/", "tools/", "docs/")):
            continue
        b = os.path.basename(f)
        if b not in src:
            msgs.append(f"新檔 {f} 沒加進 sentinel.py 的 SRC_FILES／include()")
        if b not in inst:
            msgs.append(f"新檔 {f} 沒加進 install.sh")
        if f.endswith(".py") and b not in ci:
            msgs.append(f"新檔 {f} 沒加進 check.yml 的 py_compile")
    if re.search(r"^\+.*\bdef |^\+.*\bfunction ", lib.git("diff", "HEAD", "--", "*.py", "web/").decode("utf-8", "replace"), re.M) \
            and "README.md" not in lib.git("status", "--porcelain").decode():
        msgs.append("提醒：功能有改，README.md 要不要跟著改？（不擋）")
    hard = [m for m in msgs if not m.startswith("提醒")]
    return not hard, "\n".join(msgs) or "SRC_FILES、install.sh、check.yml 都一致"


CHECKS = {"syntax": c_syntax, "style": c_style, "unit": c_unit, "shell": c_shell, "css": c_css,
          "security": c_security, "deps": c_deps, "api": c_api, "deadcode": c_deadcode,
          "browser": c_browser, "release": c_release}
GROUPS = {"standard": ["syntax", "style", "unit", "shell"],
          "full": ["syntax", "style", "unit", "shell", "css", "security", "deps", "api", "deadcode", "browser"],
          "release": ["syntax", "style", "unit", "shell", "css", "security", "deps", "api", "deadcode", "browser", "release"]}


def quick(paths):
    """單檔快速檢查（PostToolUse 用）：幾秒內完成，不跑整套測試。"""
    out = []
    for f in paths:
        p = os.path.join(ROOT, f)
        if not os.path.isfile(p):
            continue
        if f.endswith(".py"):
            code, o = sh([sys.executable, "-m", "py_compile", p], 30)
        elif f.endswith(".sh"):
            code, o = sh(["bash", "-n", p], 30)
            if not code and shutil.which("shellcheck"):
                code, o = sh(["shellcheck", p], 60)
        elif f.startswith("web/") and f.endswith((".css", ".js", ".html")):
            code, o = sh([sys.executable, "tools/style_check.py"], 60)
            if not code and f.endswith(".js") and shutil.which("node"):
                code, o = sh(["node", "--check", p], 30)
        else:
            continue
        if code:
            out.append(f"{f}：\n{tail(o, 12)}")
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    if sys.argv[1] == "quick":
        bad = quick(sys.argv[2:])
        print("\n".join(bad) or "通過")
        sys.exit(1 if bad else 0)
    names = []
    for a in sys.argv[1:]:
        names += GROUPS.get(a, [a])
    unknown = [n for n in names if n not in CHECKS]
    if unknown:
        sys.exit("不認得：" + " ".join(unknown))
    fp = lib.fingerprint()
    results = lib.checks()
    all_ok = True
    for n in dict.fromkeys(names):
        print(f"── {n} …", flush=True)
        ok, msg = CHECKS[n]()
        all_ok &= ok
        results[n] = {"ok": ok, "fp": fp, "ts": lib.now(), "summary": msg[-2000:]}
        lib.save(lib.CHECKS, results)
        print(("✅ " if ok else "❌ ") + n + "\n" + msg + "\n", flush=True)
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
