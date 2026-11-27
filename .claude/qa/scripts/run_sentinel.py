#!/usr/bin/env python3
"""開一個測試用的哨兵（暫存資料夾、只聽本機、隨機密碼），不碰正式設定。

  python3 .claude/qa/scripts/run_sentinel.py start   → 印出 URL= TOKEN= DIR= PID=
  python3 .claude/qa/scripts/run_sentinel.py stop DIR
"""
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def start():
    d = tempfile.mkdtemp(prefix="vs-qa-")
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    token = secrets.token_hex(16)
    conf = os.path.join(d, "test.conf")
    with open(conf, "w", encoding="utf-8") as f:
        f.write(f"BIND=127.0.0.1\nPORT={port}\nTOKEN={token}\nNAME=測試\nDATA_DIR={d}/data\nTLS=off\n")
    log = open(os.path.join(d, "sentinel.log"), "wb")
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, "sentinel.py")], cwd=ROOT,
                         env={**os.environ, "SENTINEL_CONF": conf, "SENTINEL_FLY_BG": "0"},
                         stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    with open(os.path.join(d, "pid"), "w") as f:
        f.write(str(p.pid))
    url = f"http://127.0.0.1:{port}"
    for _ in range(120):
        if p.poll() is not None:
            break
        try:
            urllib.request.urlopen(url + "/", timeout=1)
            print(f"URL={url}\nTOKEN={token}\nDIR={d}\nPID={p.pid}")
            return
        except OSError:
            time.sleep(0.5)
    stop(d, keep=True)
    sys.exit("哨兵沒起來，記錄在 " + os.path.join(d, "sentinel.log"))


def stop(d, keep=False):
    if not d or not os.path.basename(d).startswith("vs-qa-"):
        sys.exit("只能停 vs-qa- 開頭的測試資料夾")
    try:
        pid = int(open(os.path.join(d, "pid")).read())
        os.killpg(pid, signal.SIGTERM)
        time.sleep(1)
        os.killpg(pid, signal.SIGKILL)
    except (OSError, ValueError):
        pass
    if not keep:
        shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    if sys.argv[1:2] == ["start"]:
        start()
    elif sys.argv[1:2] == ["stop"] and len(sys.argv) > 2:
        stop(sys.argv[2])
    else:
        sys.exit(__doc__)
