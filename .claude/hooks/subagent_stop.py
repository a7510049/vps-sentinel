#!/usr/bin/env python3
"""SubagentStop：收集代理的結論；回報「不通過／一定要改」就記成未解決問題，交給主對話處理。"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

FAIL = re.compile(r"不通過|沒通過|失敗|一定要改|能重現|FAIL|❌")
PASS = re.compile(r"全部通過|通過|沒有問題|PASS|✅")


def main():
    inp = lib.hook_input()
    kind = inp.get("agent_type") or "agent"
    msg = inp.get("last_assistant_message") or ""
    t = lib.task()
    if not t or t.get("status") != "active":
        return
    verdict = "fail" if FAIL.search(msg) else ("pass" if PASS.search(msg) else "report")
    t["agents"].append({"type": kind, "ts": lib.now(), "fp": lib.fingerprint(), "verdict": verdict})
    if verdict == "fail":
        first = next((ln.strip(" #-*|") for ln in msg.splitlines() if FAIL.search(ln)), msg[:200])
        nid = max([i.get("id", 0) for i in t["issues"]] or [0]) + 1
        t["issues"].append({"id": nid, "text": f"{kind} 回報：{first[:300]}", "status": "open", "ts": lib.now()})
    lib.touch(t)


if __name__ == "__main__":
    main()
