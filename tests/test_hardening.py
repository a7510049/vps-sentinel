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
    def test_cert_warning_same_key_every_day(self):
        """憑證快到期：天數每天變，還是同一件事（不會每天通知一次「已解決」又一次「快到期」）"""
        self.assertEqual(S.ev_key("「面板」的安全憑證 14 天後到期"), S.ev_key("「面板」的安全憑證 3 天後到期"))
        self.assertNotEqual(S.ev_key("容器 app-1 停了"), S.ev_key("容器 app-2 停了"))

    def test_download_dir_link_not_followed(self):
        """下載資料夾被換成捷徑：不會跟過去寫檔"""
        with tempfile.TemporaryDirectory() as t:
            real, link = os.path.join(t, "real"), os.path.join(t, "下載")
            os.mkdir(real)
            os.symlink(real, link)
            with self.assertRaises(OSError):
                S.dl_at(link, "x.下載中", os.O_WRONLY | os.O_CREAT)
            self.assertEqual(os.listdir(real), [])

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

    def test_restore_blocks_exact_path_and_escaping_symlinks(self):
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w") as t:
            for name, link in (("etc/x", "/root/target"), ("etc/x", None), ("etc/esc", "../../etc/passwd"), ("etc/ok", None)):
                info = tarfile.TarInfo(name)
                if link:
                    info.type, info.linkname = tarfile.SYMTYPE, link
                t.addfile(info, io.BytesIO(b"data") if not link else None)
        buf.seek(0)
        with tarfile.open(fileobj=buf) as t:
            ms = S.rs_members(t)
        self.assertEqual([(m.name, m.issym()) for m in ms], [("etc/x", True), ("etc/ok", False)])

    def test_png_icc_zlib_bomb_capped(self):
        import struct
        import zlib
        zdata = zlib.compress(b"\x00" * (4 << 20), 9)
        chunk = b"p\x00\x00" + zdata
        png = b"\x89PNG\r\n\x1a\n" + struct.pack(">I4s", len(chunk), b"iCCP") + chunk + b"\x00\x00\x00\x00"
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(png)
            p = f.name
        try:
            self.assertIsNone(S.pic_png_icc(p))
        finally:
            os.remove(p)

    def test_tiff_ifd_cycle_bounded(self):
        import struct
        # Self-referencing ExifIFD pointer (tag 0x8769 -> offset 8)
        entry = struct.pack("<HHII", 0x8769, 4, 1, 8)
        tiff = b"II" + struct.pack("<HIH", 42, 8, 16) + entry * 16 + struct.pack("<I", 0)
        out, spans = S.alb_tiff(tiff)
        self.assertIsInstance(out, dict)
        self.assertIsInstance(spans, list)
        self.assertLessEqual(len(list(S.pic_tiff_walk(tiff))), 2048)

    def test_read_body_rejects_negative_content_length(self):
        h = object.__new__(S.Handler)
        h.headers = {"Content-Length": "-1"}
        h.rfile = io.BytesIO(b"abc")
        h.close_connection = False
        self.assertIsNone(h.read_body(4096))
        self.assertTrue(h.close_connection)

    def test_note_body_rejects_negative_chunk(self):
        class FakeH:
            headers = {"Transfer-Encoding": "chunked"}
            rfile = io.BytesIO(b"-10\r\n0\r\n\r\n")
        self.assertFalse(S.note_body(FakeH(), io.BytesIO(), 1024))

    def test_ab_probe_fail_closed_and_nat64_blocked(self):
        self.assertEqual(S.ab_probe_ips("nonexistent.invalid"), ("", []))
        self.assertFalse(S._ab_ip_global("64:ff9b::127.0.0.1"))
        self.assertFalse(S._ab_ip_global("127.0.0.1"))

    def test_fly_share_unlimited_does_not_bloat_store(self):
        tmp = tempfile.mkdtemp()
        old_f, old_c = S.SHARE_FILE, dict(S.SHARE_CACHE)
        S.SHARE_FILE = os.path.join(tmp, "fly-share.json")
        S.SHARE_CACHE.update(mt=None, d={})
        try:
            code, _ = S.share_new(3600, 0)
            toks = [S.share_claim(code, "")[0] for _ in range(10)]
            self.assertTrue(all(toks))
            self.assertTrue(S.share_ok(code + ":" + toks[0]))
            d = S.share_load()
            self.assertEqual(len(next(iter(d.values()))["dev"]), 0)
        finally:
            S.SHARE_FILE = old_f
            S.SHARE_CACHE.update(old_c)


if __name__ == "__main__":
    unittest.main()
