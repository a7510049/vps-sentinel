#!/usr/bin/env python3
"""SessionStart：載入調度索引、恢復未完成的任務。不改任何程式。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

INDEX = ("【自動調度】開發需求一律先照 adaptive-orchestrator 技能判斷類型、等級（0～4）、要用的技能／MCP／代理，"
         "用 `python3 .claude/hooks/task.py` 記錄；檢查一律用 `python3 .claude/qa/gate.py`（結果會記錄，Stop 照它判斷）。"
         "純討論＝等級 0，不動程式。推送 GitHub、部署、刪正式資料一律要使用者授權。")


def main():
    inp = lib.hook_input()
    src = inp.get("source", "startup")
    lib.save(lib.RUNTIME, {"blocks": {}, "reminded": []})
    t = lib.task()
    parts = [INDEX]
    if t and t.get("status") == "active" and lib.now() - t.get("updated", 0) < 7 * 86400:
        s = lib.summary(t)
        if src in ("compact", "resume") or lib.changed_files():
            parts.append(s)
            parts.append("↑ 這是還沒完成的任務：照原本的需求繼續，不得縮減範圍；做完執行 `task.py done`。"
                         "如果使用者現在要做別的事，先問要不要先收尾。")
        else:
            parts.append("（上次有沒收尾的任務紀錄，需要時看 `python3 .claude/hooks/task.py show`。）")
    lib.emit({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "\n".join(parts)}})


if __name__ == "__main__":
    main()
