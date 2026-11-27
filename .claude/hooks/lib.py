"""自動調度共用：任務狀態、檢查紀錄、改動指紋。只用 Python 內建模組。

狀態放在 .claude/state/（不進 git）：
  task.json    目前任務（需求、等級、用過的技能／MCP／代理、問題、待辦、阻塞原因）
  checks.json  gate.py 實際跑過的檢查（結果、時間、當時的改動指紋）
  runtime.json Stop 擋了幾次、上次擋的原因（防止無限循環）
"""
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
STATE = os.path.join(ROOT, ".claude", "state")
TASK = os.path.join(STATE, "task.json")
CHECKS = os.path.join(STATE, "checks.json")
RUNTIME = os.path.join(STATE, "runtime.json")
SNAP = os.path.join(STATE, "snapshots")

# 算「程式有沒有改」時不看的地方：工具設定、說明文件
EXCLUDE = [":(exclude).claude", ":(exclude)*.md", ":(exclude)docs", ":(exclude).mcp.json",
           ":(exclude,glob)**/__pycache__/**", ":(exclude)*.pyc"]
STALE = 12 * 3600  # 超過這麼久沒動的任務，下一個開發需求就開新任務


def now():
    return int(time.time())


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def hook_input():
    try:
        return json.load(sys.stdin)
    except ValueError:
        return {}


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))


def git(*args):
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                              timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return b""


def changed_files():
    """這次工作改到的專案檔（不含 .claude、說明文件）。"""
    out = git("status", "--porcelain", "-uall", "--", ".", *EXCLUDE).decode("utf-8", "replace")
    files = []
    for line in out.splitlines():
        p = line[3:].split(" -> ")[-1].strip().strip('"')
        if p:
            files.append(p)
    return files


def fingerprint():
    """目前改動的指紋：改動內容一樣就一樣，用來判斷檢查是不是對最新的程式跑的。"""
    h = hashlib.sha256(git("diff", "HEAD", "--", ".", *EXCLUDE))
    for p in sorted(git("ls-files", "-o", "--exclude-standard", "--", ".", *EXCLUDE)
                    .decode("utf-8", "replace").splitlines()):
        h.update(p.encode())
        try:
            with open(os.path.join(ROOT, p), "rb") as f:
                h.update(f.read())
        except OSError:
            pass
    return h.hexdigest()[:16]


def new_task(request=""):
    return {"status": "active", "created": now(), "updated": now(),
            "requests": [request] if request else [], "type": "", "level": None,
            "risk": "", "skills": [], "mcp": [], "agents": [], "issues": [],
            "todo": [], "files": [], "blocked": "", "notes": []}


def task():
    t = load(TASK, None)
    return t if isinstance(t, dict) else None


def touch(t):
    t["updated"] = now()
    save(TASK, t)


def add_unique(lst, item, limit=200):
    if item and item not in lst:
        lst.append(item)
        del lst[:-limit]


def checks():
    c = load(CHECKS, {})
    return c if isinstance(c, dict) else {}


def check_ok(name, fp=None):
    """這項檢查有沒有對「目前的改動」跑過而且通過。"""
    r = checks().get(name)
    return bool(r and r.get("ok") and r.get("fp") == (fp or fingerprint()))


def summary(t, fp=None):
    """給 Claude 看的任務摘要（盡量短）。"""
    if not t:
        return ""
    fp = fp or fingerprint()
    open_issues = [i for i in t.get("issues", []) if i.get("status") != "fixed"]
    todo = [x for x in t.get("todo", []) if not x.get("done")]
    lines = ["【進行中的任務】(.claude/state/task.json)"]
    for i, r in enumerate(t.get("requests", [])[-5:], 1):
        lines.append(f"需求{i}：{r[:300]}")
    lines.append(f"類型：{t.get('type') or '未判斷'}　等級：{t.get('level') if t.get('level') is not None else '未判斷'}　風險：{t.get('risk') or '未判斷'}")
    if t.get("skills"):
        lines.append("用過的技能：" + "、".join(t["skills"][-15:]))
    if t.get("mcp"):
        lines.append("用過的 MCP：" + "、".join(t["mcp"][-10:]))
    if t.get("agents"):
        lines.append("跑過的代理：" + "、".join(f"{a['type']}({a.get('verdict', '?')})" for a in t["agents"][-8:]))
    for i in open_issues[-8:]:
        lines.append(f"未解決問題 #{i['id']}：{i['text'][:200]}")
    for x in todo[-8:]:
        lines.append(f"待辦 #{x['id']}：{x['text'][:200]}")
    c = checks()
    done = [f"{k}{'✓' if v.get('ok') else '✗'}{'' if v.get('fp') == fp else '(舊)'}" for k, v in c.items()]
    if done:
        lines.append("檢查紀錄：" + " ".join(done) + "（(舊)＝之後又改過，要重跑）")
    if t.get("blocked"):
        lines.append(f"阻塞原因：{t['blocked']}")
    return "\n".join(lines)
