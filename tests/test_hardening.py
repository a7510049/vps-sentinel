"""防護的測試：還原檔裡的捷徑、轉址不帶密碼、還原代碼輸錯只鎖住輸錯的那個地方。只用 Python 內建模組。"""
import hashlib
import io
import json
import os
import tarfile
import tempfile
import threading
import time
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from test_passkey import load_sentinel

S = load_sentinel()


class HardeningTest(unittest.TestCase):
    def test_restore_skips_files_under_links(self):
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w") as t:
            for name, link in (("etc/x", "/root"), ("etc/x/evil", None), ("etc/./x/evil2", None), ("etc/ok", None),
                               ("etc/nginx/sites-enabled/a", "../sites-available/a")):
                info = tarfile.TarInfo(name)
                if link:
                    info.type, info.linkname = tarfile.SYMTYPE, link
                t.addfile(info, io.BytesIO(b"") if not link else None)
        buf.seek(0)
        with tarfile.open(fileobj=buf) as t:
            names = [m.name for m in S.rs_members(t)]
        self.assertEqual(names, ["etc/x", "etc/ok", "etc/nginx/sites-enabled/a"])

    def test_redirect_drops_token_to_other_host(self):
        got = {}

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                if self.path in ("/same", "/away"):
                    port = self.server.server_port if self.path == "/same" else other.server_port
                    self.send_response(302)
                    self.send_header("Location", f"http://127.0.0.1:{port}/end")
                    self.end_headers()
                    return
                got[self.server.server_port] = self.headers.get("X-Token")
                self.send_response(200)
                self.end_headers()

        a, other = ThreadingHTTPServer(("127.0.0.1", 0), H), ThreadingHTTPServer(("127.0.0.1", 0), H)
        for s in (a, other):
            threading.Thread(target=s.serve_forever, daemon=True).start()
        try:
            for path, port, want in (("/same", a.server_port, "secret"), ("/away", other.server_port, None)):
                got.clear()
                req = urllib.request.Request(f"http://127.0.0.1:{a.server_port}{path}", headers={"X-Token": "secret"})
                urllib.request.urlopen(req, timeout=5).close()
                self.assertEqual(got[port], "secret" if want else None, path)
        finally:
            a.shutdown()
            other.shutdown()

    def test_restore_code_lock_is_per_source(self):
        tmp = tempfile.mkdtemp()
        S.RSW_STATE = os.path.join(tmp, "state.json")
        S.RSW_PROG = os.path.join(tmp, "progress.json")
        with open(S.RSW_STATE, "w") as f:
            json.dump({"hash": hashlib.sha256(b"ABCDEFGH").hexdigest(), "exp": time.time() + 600, "stage": "wait"}, f)
        for _ in range(10):
            self.assertFalse(S.rsw_code_ok("WRONG", "203.0.113.9"))
        self.assertGreater(S.rsw_locked("203.0.113.9"), 0)
        self.assertFalse(S.rsw_code_ok("ABCD-EFGH", "203.0.113.9"))      # 亂試的那個地方：對的代碼也先不收
        self.assertTrue(S.rsw_code_ok("abcd-efgh", "198.51.100.1"))      # 你這邊：照樣能用


if __name__ == "__main__":
    unittest.main()
