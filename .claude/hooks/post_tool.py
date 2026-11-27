#!/usr/bin/env python3
"""PostToolUse：記錄用了哪些技能／MCP、改了哪些檔；改到程式就只對那個檔做幾秒內的快速檢查，
完整測試留到收工前（Stop）。"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

GATE = os.path.join(lib.ROOT, ".claude", "qa", "gate.py")


def need_task():
    t = lib.task()
    if not t or t.get("status") != "active":
        t = lib.new_task("（沒有先分類就直接動手的修改）")
        t["level"] = 1
    return t


def later(path):
    """收工前一定要跑的檢查（照檔案種類）。"""
    req = []
    if path.endswith(".py") or path.startswith(("tests/", "data/")):
        req += ["syntax", "unit"]
    if path.startswith("web/"):
        req += ["style", "unit", "browser（等級≥2）"]
    if path.endswith(".css"):
        req += ["css"]
    if path.endswith(".sh"):
        req += ["shell"]
    return req


def main():
    inp = lib.hook_input()
    tool = inp.get("tool_name", "")
    ti = inp.get("tool_input") or {}
    if inp.get("agent_id"):
        return  # 代理自己的動作不算主任務的紀錄
    if tool == "Skill":
        t = lib.task()
        if t and t.get("status") == "active":
            lib.add_unique(t["skills"], ti.get("skill", ""))
            lib.touch(t)
        return
    if tool.startswith("mcp__"):
        t = lib.task()
        if t and t.get("status") == "active":
            lib.add_unique(t["mcp"], tool.split("__")[1])
            lib.touch(t)
        return
    if tool not in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        return
    path = os.path.relpath(os.path.abspath(ti.get("file_path") or ti.get("notebook_path") or ""), lib.ROOT)
    if path.startswith((".claude/", "..")) or path.endswith(".md") or path.startswith("docs/"):
        return
    t = need_task()
    lib.add_unique(t["files"], path)
    lib.touch(t)
    try:
        p = subprocess.run([sys.executable, GATE, "quick", path], cwd=lib.ROOT, capture_output=True,
                           text=True, timeout=90)
    except subprocess.TimeoutExpired:
        return
    if p.returncode:
        lib.emit({"decision": "block", "reason": "快速檢查沒過（先修好再繼續）：\n" + p.stdout[-2500:]})
        return
    rt = lib.load(lib.RUNTIME, {})
    seen = set(rt.get("reminded", []))
    new = [r for r in later(path) if r not in seen]
    if new:
        rt["reminded"] = sorted(seen | set(new))
        lib.save(lib.RUNTIME, rt)
        lib.emit({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext":
                  "【已記錄】收工前要實際跑：" + "、".join(new) + "（python3 .claude/qa/gate.py …）"}})


if __name__ == "__main__":
    main()
