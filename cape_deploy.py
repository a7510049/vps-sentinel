"""Deploy the Cape assets and keep the rules worker on a local Unix socket."""

import http.client
import os
import shutil
import socket
import stat
import subprocess
import threading


CAPE_FILES = {
    "index.html": "text/html",
    "album-guest.html": "text/html",
    "styles.css": "text/css",
    **{name + ".js": "text/javascript" for name in (
        "app", "data", "outpost", "icons", "chart", "album-guest",
    )},
}
CAPE_CSP = ("; default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self' https:")
CAPE_RUNTIME = "/opt/vps-cape-node-24/bin/node"


class CapeSocket(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("cape.internal", timeout=25)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


class CapeDeployment:
    def __init__(self, source, data, bind, port, token, log):
        self.source = source
        self.data = data
        self.token = token
        self.log = log
        host = {"0.0.0.0": "127.0.0.1", "::": "::1"}.get(bind, bind)
        self.upstream = f"http://[{host}]:{port}" if ":" in host else f"http://{host}:{port}"
        self.socket = os.environ.get("SENTINEL_CAPE_SOCKET", "/run/vps-sentinel-lite/cape.sock")
        self.stop = threading.Event()
        self.worker = None

    def start(self):
        threading.Thread(target=self._supervise, daemon=True).start()

    def _supervise(self):
        node = os.environ.get("SENTINEL_CAPE_NODE") or (CAPE_RUNTIME if os.path.isfile(CAPE_RUNTIME) else shutil.which("node"))
        if not node:
            self.log("找不到 Cape 的 Node.js 執行環境，請重新執行安裝。")
            return
        environment = {
            **os.environ,
            "CAPE_SOCKET": self.socket,
            "CAPE_PUBLIC_ORIGIN": "",
            "CAPE_DATA_DIR": os.path.join(self.data, "cape"),
            "OUTPOST_URL": self.upstream,
            "OUTPOST_MONITOR_TOKEN": self.token,
        }
        while not self.stop.is_set():
            try:
                folder = os.path.dirname(self.socket)
                os.makedirs(folder, mode=0o700, exist_ok=True)
                info = os.stat(folder)
                if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
                    raise OSError("Cape runtime directory must be private")
                if os.path.lexists(self.socket):
                    if not stat.S_ISSOCK(os.lstat(self.socket).st_mode):
                        raise OSError("Cape socket path is occupied")
                    os.unlink(self.socket)
                self.worker = subprocess.Popen(
                    [node, os.path.join(self.source, "cape", "server.mjs")], env=environment,
                )
                self.worker.wait()
            except OSError:
                self.log("Cape 規則服務暫時無法啟動。")
            self.stop.wait(3)

    def close(self):
        self.stop.set()
        if self.worker and self.worker.poll() is None:
            self.worker.terminate()

    def read_file(self, name):
        with open(os.path.join(self.source, "cape", name), "rb") as file:
            return file.read()

    def request(self, method, path, cookie="", body=None):
        connection = CapeSocket(self.socket)
        try:
            headers = {"X-Requested-With": "1"}
            if cookie:
                headers["Cookie"] = "vs_sess=" + cookie
            if body is not None:
                headers["Content-Type"] = "application/json"
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()
