#!/usr/bin/env python3
"""PreCompact：壓縮對話前把任務進度存一份（SessionStart 的 compact 會再讀回來）。"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402


def main():
    lib.hook_input()
    t = lib.task()
    if not t:
        return
    os.makedirs(lib.SNAP, exist_ok=True)
    lib.save(os.path.join(lib.SNAP, f"compact-{lib.now()}.json"),
             {"task": t, "checks": lib.checks(), "changed": lib.changed_files()})
    for old in sorted(glob.glob(os.path.join(lib.SNAP, "compact-*.json")))[:-20]:
        os.remove(old)
    with open(os.path.join(lib.STATE, "task.md"), "w", encoding="utf-8") as f:
        f.write(lib.summary(t) + "\n\n改到的檔：\n" + "\n".join(lib.changed_files()) + "\n")


if __name__ == "__main__":
    main()
