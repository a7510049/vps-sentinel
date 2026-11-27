#!/usr/bin/env python3
"""Stop：收工前確認這次的改動真的通過檢查。

判斷依據只有實際跑過的指令（gate.py 的紀錄＋這裡補跑的結果），不靠 AI 自評。
- 沒改程式（純討論）→ 直接放行
- 該跑的檢查沒跑或是對舊版程式跑的 → 這裡直接補跑（瀏覽器測試除外，要 Claude 自己跑、看截圖）
- 沒過、有未解決問題、需要獨立審查卻沒做 → 擋下來要求繼續
- 防止無限循環：同樣的原因最多擋 3 次；`task.py block 原因` 記了環境限制就放行
"""
import hashlib
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

GATE = os.path.join(lib.ROOT, ".claude", "qa", "gate.py")
REVIEWERS = {"independent-qa", "frontend-reviewer", "performance-reviewer", "security-reviewer",
             "architecture-reviewer", "ios-debugger", "android-debugger", "desktop-debugger"}
AUTH = re.compile(r"sess_|recheck|pin_|_login|login|token|TOKEN|seal_|sec_load|cookie|html_csp|pair_|tls_|guard_|ssh_|alb_cookie|X-Recheck")
MAX_BLOCKS = 3


def required(files, t, diff):
    req, browser = [], False
    lvl = t.get("level") or 1
    for f in files:
        if f.endswith(".py") or f.startswith(("tests/", "data/")):
            req += ["syntax", "unit"]
        if f.startswith("web/"):
            req += ["style", "unit"]
            browser = browser or lvl >= 2
        if f.endswith(".css"):
            req.append("css")
        if f.endswith(".sh"):
            req.append("shell")
    ty = t.get("type", "")
    if AUTH.search(diff) or re.search("登入|權限", ty):
        req.append("security")
    if "依賴" in ty:
        req.append("deps")
    if "API" in ty:
        req.append("api")
    if lvl >= 4:
        req += ["syntax", "style", "unit", "shell", "css", "security", "deps", "api", "deadcode", "release"]
        browser = True
    if "提交" in ty:
        req.append("release")
    return list(dict.fromkeys(req)), browser


def main():
    inp = lib.hook_input()
    files = lib.changed_files()
    t = lib.task()
    if not files or not t or t.get("status") != "active":
        return
    if t.get("blocked"):
        lib.emit({"systemMessage": f"品質關卡：因「{t['blocked']}」先停在這裡，沒完成的項目已記在任務紀錄。"})
        return
    fp = lib.fingerprint()
    diff = lib.git("diff", "HEAD", "--", ".", *lib.EXCLUDE).decode("utf-8", "replace")
    req, browser = required(files, t, diff)
    missing = [n for n in req if not lib.check_ok(n, fp)]
    reasons, codes = [], []
    if missing:
        try:
            p = subprocess.run([sys.executable, GATE, *missing], cwd=lib.ROOT, capture_output=True,
                               text=True, timeout=1700)
            if p.returncode:
                codes.append("check")
                reasons.append("檢查沒過（gate.py " + " ".join(missing) + "）：\n" + p.stdout[-3000:])
        except subprocess.TimeoutExpired:
            codes.append("check")
            reasons.append("檢查逾時：請自己跑 python3 .claude/qa/gate.py " + " ".join(missing))
    if browser and not lib.check_ok("browser", fp):
        codes.append("browser")
        reasons.append("改了網頁，等級≥2 要跑瀏覽器測試：python3 .claude/qa/gate.py browser"
                       "（環境做不到就 task.py block 寫原因）")
    open_issues = [i for i in t.get("issues", []) if i.get("status") == "open"]
    if open_issues:
        codes.append("issue")
        reasons.append("還有未解決的問題：" + "；".join(f"#{i['id']} {i['text'][:120]}" for i in open_issues[:6])
                       + "（修好用 task.py issue fix 編號；超出範圍用 issue wontfix 編號 原因）")
    todo = [x for x in t.get("todo", []) if not x.get("done")]
    if todo:
        codes.append("todo")
        reasons.append("還有待辦：" + "；".join(f"#{x['id']} {x['text'][:120]}" for x in todo[:6]))
    lvl = t.get("level") or 1
    if (lvl >= 3 or t.get("risk") in ("中", "高")) and not any(a["type"] in REVIEWERS for a in t.get("agents", [])):
        codes.append("review")
        reasons.append(f"等級 {lvl}／風險{t.get('risk') or '低'}：要有獨立代理審查或驗收（例如 independent-qa），不能只靠自己驗收")
    if not reasons:
        return

    rt = lib.load(lib.RUNTIME, {})
    # 同一種原因（不管細節怎麼變）對同一版程式最多擋 MAX_BLOCKS 次
    key = hashlib.sha1(("|".join(sorted(codes)) + fp).encode()).hexdigest()[:12]
    blocks = rt.setdefault("blocks", {})
    blocks[key] = blocks.get(key, 0) + 1
    lib.save(lib.RUNTIME, rt)
    if blocks[key] > MAX_BLOCKS or sum(blocks.values()) > MAX_BLOCKS * 3:
        t.setdefault("notes", []).append({"ts": lib.now(), "text": "Stop 放行（重試次數用完）：" + " / ".join(r[:200] for r in reasons)})
        lib.touch(t)
        lib.emit({"systemMessage": "品質關卡：以下項目重試多次仍未通過，已停下來，要在回報裡老實寫出來：\n" + "\n".join(r[:400] for r in reasons)})
        return
    lib.emit({"decision": "block", "reason": "【品質關卡】還不能收工：\n- " + "\n- ".join(reasons)
              + "\n屬於這次範圍、修得好的就繼續修；做不到（環境限制、權限、使用者取消）用 "
                "`python3 .claude/hooks/task.py block 原因` 記下來再停。"})


if __name__ == "__main__":
    main()
