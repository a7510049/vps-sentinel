#!/usr/bin/env python3
"""PreToolUse：擋高風險操作（推送、部署、刪正式資料、外洩秘密），審查代理只能讀。

deny＝直接擋；ask＝跳出確認讓使用者決定。只看指令文字，判斷不到的照常交給 Claude Code 自己的權限機制。
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

READONLY_AGENTS = {"ios-debugger", "android-debugger", "desktop-debugger", "frontend-reviewer",
                   "performance-reviewer", "independent-qa", "security-reviewer", "architecture-reviewer"}

SECRET = re.compile(r"(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}"
                    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b"
                    r"|\bvsk_[A-Za-z0-9_-]{16,}|\bvss_[A-Za-z0-9_-]{16,})")
SECRET_FILES = r"(/etc/vps-sentinel-lite\.conf|vps-sentinel-lite\.key|/etc/vps-cloud\.key|\.ssh/id_|/root/\.ccr|\.env\b|credentials\.json)"

DENY = [
    (r"git\s+push\b[^\n;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+)", "強制推送會蓋掉 GitHub 上的紀錄"),
    (r"\brm\s+(-[a-zA-Z]*\s+)*(/|~|/\*|/etc|/opt|/var|/srv|/usr|/home|/root|\$HOME)(\s|/?$|/\*)", "刪除系統或家目錄"),
    (r"\brm\b[^\n]*(/var/lib/vps|/opt/vps-sentinel|/srv/cloud|/etc/vps-)", "刪除正式主機的資料或程式"),
    (r"(curl|wget|nc|ncat|scp|rsync|http)\b[^\n]*" + SECRET_FILES, "把設定檔／金鑰傳出去"),
    (SECRET_FILES + r"[^\n]*\|\s*(curl|wget|nc|ncat)", "把設定檔／金鑰傳出去"),
    (r"\bmkfs|\bdd\s+[^\n]*of=/dev/|cryptsetup\s+(luksFormat|erase)", "格式化磁碟／清除加密"),
]
ASK = [
    (r"\bgit\s+push\b", "推送到 GitHub（使用者沒授權就不能推）"),
    (r"\b(ssh|scp|sftp)\s|rsync\b[^\n]*\S+:\S*", "連到其他主機（可能是正式環境）"),
    (r"(^|[\s;&|])(sudo\s+)?(bash|sh|\./)\s*(install|cloud)\.sh", "執行安裝腳本（會改系統設定）"),
    (r"\bsystemctl\s+(start|stop|restart|reload|enable|disable|mask)\b|\breboot\b|\bshutdown\b", "啟停系統服務"),
    (r"sentinel\.py[^\n]*--(restore|unseal|unwatch|new-pin|first-pin|sec-setup)", "會改正式資料的哨兵指令"),
    (r"git\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s+\.|restore\s+\.|stash\s+drop|branch\s+-D)", "丟掉還沒提交的改動"),
    (r"\bcat\b[^\n]*" + SECRET_FILES, "讀取存秘密的檔案"),
    (r"(apt-get|apt)\s+(remove|purge)|pip\s+uninstall|npm\s+(uninstall|rm)\s+-g", "移除系統套件"),
]
GITHUB_WRITE = re.compile(r"mcp__github__(push_files|create_or_update_file|delete_file|merge_pull_request|create_pull_request"
                          r"|update_pull_request|create_branch|update_pull_request_branch|enable_pr_auto_merge|actions_run_trigger"
                          r"|create_repository|fork_repository)")
AGENT_WRITE = re.compile(r"\bsed\s+-i|\bperl\s+-[a-z]*i|\bgit\s+(commit|push|reset|checkout|apply|stash|restore|rm|mv|add|merge|rebase)\b"
                         r"|\b(rm|mv|cp|truncate|chmod)\s+[^\n]*?(\b[\w./-]+\.(py|js|css|html|sh|json|md|tsv)\b)"
                         r"|(>|>>|\btee\s+(-a\s+)?)\s*(?!/tmp/|/dev/null|\S*scratchpad|\S*\.claude/qa/test-results|\S*\.claude/state)"
                         r"[\w./-]+\.(py|js|css|html|sh|json|md|tsv)\b")


def out(decision, reason):
    lib.emit({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": decision,
                                     "permissionDecisionReason": "哨兵安全規則：" + reason}})
    sys.exit(0)


def main():
    inp = lib.hook_input()
    tool = inp.get("tool_name", "")
    ti = inp.get("tool_input") or {}
    agent = inp.get("agent_type") or ""
    is_agent = bool(inp.get("agent_id"))

    if is_agent and agent in READONLY_AGENTS:
        if tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
            out("deny", f"{agent} 是審查／除錯代理，只能讀、不能改檔；把建議改法寫在回報裡")
        if tool == "Bash" and AGENT_WRITE.search(ti.get("command", "")):
            out("deny", f"{agent} 只能讀、不能用指令改檔或改 git；暫存檔請放 /tmp 或 .claude/qa/test-results")

    if tool == "Bash":
        cmd = ti.get("command", "")
        for rx, why in DENY:
            if re.search(rx, cmd):
                out("deny", why)
        for rx, why in ASK:
            if re.search(rx, cmd):
                out("ask", why)
        if SECRET.search(cmd):
            out("ask", "指令裡有看起來像金鑰的字串")
    elif tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        text = " ".join(str(ti.get(k, "")) for k in ("content", "new_string", "new_source"))
        text += " ".join(str(e.get("new_string", "")) for e in ti.get("edits", []) or [] if isinstance(e, dict))
        if SECRET.search(text):
            out("deny", "內容有金鑰／密碼，不能寫進檔案（專案是公開的）")
        path = str(ti.get("file_path", ""))
        home = os.path.expanduser("~")
        if re.search(r"(^|/)\.claude/settings(\.local)?\.json$", path) and path.startswith(home + "/.claude"):
            out("ask", "改全域 Claude 設定（會影響其他專案）")
    elif GITHUB_WRITE.match(tool):
        out("ask", "會改 GitHub 上的東西（推送／合併／開 PR）")


if __name__ == "__main__":
    main()
