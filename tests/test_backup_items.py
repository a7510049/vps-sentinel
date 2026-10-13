"""備份內容的測試：3x-ui 設定裡用到的憑證，不管放在哪個資料夾都要一起備份。"""
import json
import os
import sqlite3
import tempfile
import unittest

from test_passkey import load_sentinel

S = load_sentinel()


class XuiCerts(unittest.TestCase):
    def test_cert_paths(self):
        with tempfile.TemporaryDirectory() as td:
            real = os.path.join(td, "archive", "fullchain1.pem")
            os.makedirs(os.path.dirname(real))
            open(real, "w").close()
            live = os.path.join(td, "live.pem")
            os.symlink(real, live)                     # 像 letsencrypt 的 live 資料夾：捷徑指到真正的檔案
            db = os.path.join(td, "x-ui.db")
            con = sqlite3.connect(db)
            con.execute("CREATE TABLE settings (id INTEGER PRIMARY KEY, key TEXT, value TEXT)")
            con.execute("CREATE TABLE inbounds (id INTEGER PRIMARY KEY, stream_settings TEXT)")
            con.executemany("INSERT INTO settings (key, value) VALUES (?, ?)",
                            [("webCertFile", live), ("webKeyFile", "/etc/ssl/panel.key"), ("subCertFile", ""), ("webPort", "2053")])
            tls = {"security": "tls", "tlsSettings": {"certificates": [{"certificateFile": "/root/c/a.crt", "keyFile": "/root/c/a.key"}]}}
            con.executemany("INSERT INTO inbounds (stream_settings) VALUES (?)",
                            [(json.dumps(tls),), (json.dumps({"security": "reality"}),), ("壞掉的",)])
            con.commit()
            con.close()
            got = S.xui_cert_paths(db)
            self.assertEqual(sorted(got), sorted([live, "/etc/ssl/panel.key", "/root/c/a.crt", "/root/c/a.key", real]))

    def test_no_db(self):
        self.assertEqual(S.xui_cert_paths("/沒有這個/x-ui.db"), [])
