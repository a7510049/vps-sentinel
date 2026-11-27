#!/usr/bin/env python3
"""UserPromptSubmit：判斷任務類型和風險，給調度提示；純討論不啟動開發流程。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from routes import classify  # noqa: E402


def main():
    inp = lib.hook_input()
    prompt = inp.get("prompt", "") or ""
    c = classify(prompt)
    rt = lib.load(lib.RUNTIME, {})
    rt["blocks"] = {}  # 使用者說話了：Stop 的重試次數重算
    lib.save(lib.RUNTIME, rt)
    if c is None:
        return
    if c["level"] == 0:
        lib.emit({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext":
                  "【調度】看起來是問題或討論（等級 0）：直接回答，不改程式、不跑測試、不派代理。若其實要動手，照 adaptive-orchestrator 重新判斷。"}})
        return
    t = lib.task()
    fresh = not t or t.get("status") != "active" or lib.now() - t.get("updated", 0) > lib.STALE
    if fresh:
        if t and t.get("status") == "active":
            os.makedirs(lib.SNAP, exist_ok=True)
            lib.save(os.path.join(lib.SNAP, f"stale-{lib.now()}.json"), t)
        t = lib.new_task(prompt[:4000])
    else:
        t["requests"].append(prompt[:4000])
    if t.get("level") is None or c["level"] > t["level"]:
        t["level"] = c["level"]
    order = {"": 0, "低": 1, "中": 2, "高": 3}
    if order.get(c["risk"], 0) > order.get(t.get("risk", ""), 0):
        t["risk"] = c["risk"]
    for ty in c["types"]:
        if ty not in t["type"]:
            t["type"] = (t["type"] + "、" + ty).strip("、")
    lib.touch(t)
    lines = [f"【調度】{'新任務' if fresh else '同一個任務的追加需求（原本的需求照樣要完成）'}：類型＝{t['type'] or '一般修改'}，"
             f"建議等級≥{t['level']}，風險＝{t['risk'] or '低'}（關鍵字初判，請照 adaptive-orchestrator 再確認，需要時 `task.py plan` 往上調）。"]
    for h in c["hits"]:
        lines.append(f"・{h[0]}：{h[4]}")
    lines.append("・完成前：regression-test＋superpowers:verification-before-completion（gate.py 實際跑過才算）")
    lib.emit({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "\n".join(lines)}})


if __name__ == "__main__":
    main()
