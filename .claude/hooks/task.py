#!/usr/bin/env python3
"""任務狀態小工具（給 Claude 用，記在 .claude/state/task.json）。

  python3 .claude/hooks/task.py show
  python3 .claude/hooks/task.py plan --type 新增功能 --level 2 --risk 中
  python3 .claude/hooks/task.py skill superpowers:test-driven-development
  python3 .claude/hooks/task.py issue add "iPhone 往下滑關不掉"     → 回傳編號
  python3 .claude/hooks/task.py issue fix 3 "改了 album.js:1234"
  python3 .claude/hooks/task.py issue wontfix 3 "超出範圍，已告訴使用者"
  python3 .claude/hooks/task.py todo add "三種瀏覽器截圖"
  python3 .claude/hooks/task.py todo done 2
  python3 .claude/hooks/task.py note "WebKit 模擬不出 HDR，需要真機"
  python3 .claude/hooks/task.py block "需要使用者的網域才能測"   （Stop 會放行並記下原因）
  python3 .claude/hooks/task.py unblock
  python3 .claude/hooks/task.py done                               （交付後收尾）
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402


def need():
    t = lib.task()
    if not t or t.get("status") != "active":
        t = lib.new_task()
    return t


def nid(lst):
    return max([x.get("id", 0) for x in lst] or [0]) + 1


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("show")
    p = sub.add_parser("plan")
    p.add_argument("--type", default=None)
    p.add_argument("--level", type=int, choices=range(0, 5), default=None)
    p.add_argument("--risk", choices=["低", "中", "高"], default=None)
    sub.add_parser("skill").add_argument("name")
    sub.add_parser("mcp").add_argument("name")
    for name in ("issue", "todo"):
        q = sub.add_parser(name)
        q.add_argument("action", choices=["add", "fix", "wontfix", "done"])
        q.add_argument("args", nargs="*")
    sub.add_parser("note").add_argument("text")
    sub.add_parser("block").add_argument("reason")
    sub.add_parser("unblock")
    sub.add_parser("done")
    a = ap.parse_args()

    if a.cmd == "show":
        print(lib.summary(lib.task()) or "目前沒有任務。")
        return
    t = need()
    if a.cmd == "plan":
        if a.type is not None:
            t["type"] = a.type
        if a.level is not None:
            if t.get("level") is not None and a.level < t["level"]:
                print(f"等級只能往上調（目前 {t['level']}）。要降低請先寫 note 說明原因並問使用者。")
                return
            t["level"] = a.level
        if a.risk is not None:
            t["risk"] = a.risk
    elif a.cmd == "skill":
        lib.add_unique(t["skills"], a.name)
    elif a.cmd == "mcp":
        lib.add_unique(t["mcp"], a.name)
    elif a.cmd in ("issue", "todo"):
        lst = t["issues"] if a.cmd == "issue" else t["todo"]
        if a.action == "add":
            text = " ".join(a.args).strip()
            if not text:
                sys.exit("要寫內容")
            item = {"id": nid(lst), "text": text, "ts": lib.now()}
            item.update({"status": "open"} if a.cmd == "issue" else {"done": False})
            lst.append(item)
            print(item["id"])
        else:
            if not a.args or not a.args[0].isdigit():
                sys.exit("要給編號")
            hit = [x for x in lst if x["id"] == int(a.args[0])]
            if not hit:
                sys.exit("找不到這個編號")
            x = hit[0]
            how = " ".join(a.args[1:])
            if a.cmd == "issue":
                if a.action == "wontfix" and not how:
                    sys.exit("不修要寫原因")
                x["status"] = "fixed" if a.action in ("fix", "done") else "wontfix"
            else:
                x["done"] = True
            if how:
                x["how"] = how
    elif a.cmd == "note":
        t["notes"].append({"ts": lib.now(), "text": a.text})
    elif a.cmd == "block":
        t["blocked"] = a.reason
    elif a.cmd == "unblock":
        t["blocked"] = ""
    elif a.cmd == "done":
        t["status"] = "done"
        os.makedirs(lib.SNAP, exist_ok=True)
        lib.save(os.path.join(lib.SNAP, f"done-{lib.now()}.json"), t)
    lib.touch(t)
    if a.cmd not in ("issue", "todo") or a.action != "add":
        print("已記錄")


if __name__ == "__main__":
    main()
