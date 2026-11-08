"""同時連進來的人數有上限：滿了多的直接斷掉，空出來之後照常能用"""
import socket
import time
import unittest

from test_smoke import Server


class ConnLimitTest(Server):
    ENV = {"SENTINEL_MAX_CONN": "16"}

    def test_limit(self):
        idle = []
        for _ in range(16):                       # 連上來卻不送資料，把名額佔滿
            s = socket.create_connection(("127.0.0.1", self.port), timeout=5)
            idle.append(s)
        time.sleep(0.5)
        extra = socket.create_connection(("127.0.0.1", self.port), timeout=10)
        extra.sendall(b"GET /manifest.webmanifest HTTP/1.0\r\n\r\n")
        try:
            got = extra.recv(100)
        except (ConnectionResetError, socket.timeout):
            got = b""
        extra.close()
        self.assertEqual(got, b"")                # 名額滿了：直接斷線
        for s in idle:
            s.close()
        time.sleep(0.5)
        code, _, _ = self.request("/manifest.webmanifest")
        self.assertEqual(code, 200)               # 空出來之後照常


if __name__ == "__main__":
    unittest.main()
