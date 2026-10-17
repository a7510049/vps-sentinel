"""手機金鑰登入的測試：簽名驗證算得對、登記／登入／刪除流程、各種不該通過的情況。

只用 Python 內建模組。用一支「假手機」（測試裡自己產生金鑰、自己簽名）走完整個流程。
"""
import hashlib
import importlib.util
import json
import os
import secrets
import tempfile
import unittest
import urllib.error
import urllib.request

from test_smoke import ROOT, TOKEN, Server

# 公開的標準測試資料（RFC 6979 附錄 A.2.5：P-256、SHA-256、訊息 "sample"）
EC_X = 0x60FED4BA255A9D31C961EB74C6356D68C049B8923B61FA6CE669622E60F29FB6
EC_Y = 0x7903FE1008B8BC99A41AE9E95628BC64F2F1B20C2D7E9F5177A3C294D4462299
EC_SIG = bytes.fromhex("3046022100efd48b2aacb6a8fd1140dd9cd45e81d69d2c877b56aaf991c34d0ea84eaf3716"
                       "022100f7cb1c942d657c41d436c7a1b6e29f65f3e900dbb9aff4064dc4ab2f843acda8")
# 用標準加密函式庫事先產生的 RSA 2048 位元公鑰與 "sample" 的簽名
RSA_N = int("94215bbebf15c6db01c1724efd0abad4935a8a801743b595c4d873357c0f87f8adc58f7af160b1998d30d5758c9ba8958826885d54ea1cb2763eb48bab3173c25398e8f27353c271a81dea8223e96349a8728de18e3cab9690d2a8352e864b93469aec6e5938bb9456af047079c5cfdb377f6e04e6aecd36b3985843c75c84ebff584a4578e2fa0dc21aac18db9a54d9e1367a2a2f05d45c717d23c2fbccd774ccc9aa3bea38c9f6db1beadc6a56337f2996015c77601d1c423bfa7734a96d1bcd7f9fcbdf5f4ec785e34d1fe646ef2a89ddf84f37c38c7697c91e557cc4e824f23dc379fc4f08546ceb88e6b1b0414b0a4eec0fe8dc1b869e91539eee7a5229", 16)
RSA_SIG = bytes.fromhex("8a517b02c105482f4ded59db03fa4d5f1c7d969d6b19127e5ec303c24f3f1d55e6d3649f14de389e5843b124873d5ab1ce038460a93db6fc10206df7d0a4ada62fce660fe5e58b3109882e29a36fe6f65cf70544133f0fbe036768ec000980a4f639f3f3ddee9f5459b7570ed4df78695b96048499e0435ca14e37d1be88b33a902da4dde5ea0e4b0f3ccb81f31d4a94085a8377d92ef89d31732e5973a7c4a6b110cdcfc8968c94fe930244cb3769c09c7f2bfd52bb4610d6d5f269a293aef34c16a177d6d85d5bca1b909645b39ffefd33704d7af8b0bc8f47c902b3b1ee0cdb9f04a7990caaec5926a47b04e6e91f7baf188109d09baf433161902c5585d1")


def load_sentinel():
    """把 sentinel.py 當成模組讀進來（用暫存設定，不會碰到正式位置）"""
    tmp = tempfile.mkdtemp()
    conf = os.path.join(tmp, "test.conf")
    with open(conf, "w", encoding="utf-8") as f:
        f.write(f"TOKEN=x\nDATA_DIR={tmp}\n")
    old = os.environ.get("SENTINEL_CONF")
    os.environ["SENTINEL_CONF"] = conf
    try:
        spec = importlib.util.spec_from_file_location("sentinel_for_test", os.path.join(ROOT, "sentinel.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    finally:
        if old is None:
            os.environ.pop("SENTINEL_CONF", None)
        else:
            os.environ["SENTINEL_CONF"] = old
    return mod


S = load_sentinel()


def b64u(b):
    return S.b64u(b)


def cbor(v):
    """把資料寫成 CBOR（假手機用）"""
    def head(major, n):
        if n < 24:
            return bytes([major << 5 | n])
        for info, size in ((24, 1), (25, 2), (26, 4), (27, 8)):
            if n < 1 << (8 * size):
                return bytes([major << 5 | info]) + n.to_bytes(size, "big")
        raise ValueError
    if isinstance(v, int):
        return head(0, v) if v >= 0 else head(1, -1 - v)
    if isinstance(v, bytes):
        return head(2, len(v)) + v
    if isinstance(v, str):
        b = v.encode()
        return head(3, len(b)) + b
    if isinstance(v, dict):
        return head(5, len(v)) + b"".join(cbor(k) + cbor(x) for k, x in v.items())
    raise TypeError


def der(r, s):
    def part(x):
        b = x.to_bytes(33, "big").lstrip(b"\0")
        b = b"\0" + b if b[0] & 0x80 else b
        return b"\x02" + bytes([len(b)]) + b
    body = part(r) + part(s)
    return b"\x30" + bytes([len(body)]) + body


class FakePhone:
    """假手機：有自己的私鑰，會照 WebAuthn 的規則產生資料並簽名"""

    def __init__(self, origin):
        self.origin, self.rp = origin, urllib.parse.urlsplit(origin).hostname
        self.d = secrets.randbelow(S._N - 1) + 1
        self.x, self.y = S._ec_mul(self.d, S._G)
        self.cid = secrets.token_bytes(16)

    def sign(self, msg):
        e = int.from_bytes(hashlib.sha256(msg).digest(), "big")
        while True:
            k = secrets.randbelow(S._N - 1) + 1
            r = S._ec_mul(k, S._G)[0] % S._N
            s = pow(k, -1, S._N) * (e + r * self.d) % S._N
            if r and s:
                return der(r, s)

    def client(self, kind, challenge):
        return json.dumps({"type": kind, "challenge": challenge, "origin": self.origin}).encode()

    def create(self, challenge, name="測試手機"):
        key = cbor({1: 2, 3: -7, -1: 1, -2: self.x.to_bytes(32, "big"), -3: self.y.to_bytes(32, "big")})
        ad = (hashlib.sha256(self.rp.encode()).digest() + bytes([0x45]) + b"\0\0\0\0" + b"\0" * 16
              + len(self.cid).to_bytes(2, "big") + self.cid + key)
        att = cbor({"fmt": "none", "attStmt": {}, "authData": ad})
        return {"action": "finish", "name": name, "clientDataJSON": b64u(self.client("webauthn.create", challenge)),
                "attestationObject": b64u(att)}

    def get(self, challenge, flags=0x05):
        cd = self.client("webauthn.get", challenge)
        ad = hashlib.sha256(self.rp.encode()).digest() + bytes([flags]) + b"\0\0\0\1"
        return {"action": "finish", "id": b64u(self.cid), "clientDataJSON": b64u(cd), "authenticatorData": b64u(ad),
                "signature": b64u(self.sign(ad + hashlib.sha256(cd).digest()))}


class CryptoTest(unittest.TestCase):
    def test_ecdsa_standard_vector(self):
        self.assertTrue(S.ecdsa_verify(EC_X, EC_Y, b"sample", EC_SIG))
        self.assertFalse(S.ecdsa_verify(EC_X, EC_Y, b"samplf", EC_SIG))
        self.assertFalse(S.ecdsa_verify(EC_X, EC_Y + 1, b"sample", EC_SIG))      # 不在曲線上的點
        self.assertFalse(S.ecdsa_verify(EC_X, EC_Y, b"sample", EC_SIG[:-1] + b"\0"))
        self.assertFalse(S.ecdsa_verify(EC_X, EC_Y, b"sample", b"\x30\x00"))

    def test_rsa_vector(self):
        self.assertTrue(S.rsa_verify(RSA_N, 65537, b"sample", RSA_SIG))
        self.assertFalse(S.rsa_verify(RSA_N, 65537, b"samplf", RSA_SIG))
        self.assertFalse(S.rsa_verify(RSA_N, 3, b"sample", RSA_SIG))

    def test_cbor(self):
        v = {"a": b"\x01\x02", 3: -7, -1: [1, 2, 300], "t": True, "big": 2 ** 40}
        data = cbor({"a": b"\x01\x02", 3: -7, -1: 0, "t": 0, "big": 2 ** 40})
        self.assertEqual(S.cbor_load(data)[0], {**v, -1: 0, "t": 0})
        self.assertEqual(S.cbor_load(bytes([0x83, 1, 2, 0x19, 1, 44]))[0], [1, 2, 300])
        self.assertIs(S.cbor_load(b"\xf5")[0], True)
        with self.assertRaises(ValueError):
            S.cbor_load(b"\x45ab")                   # 長度不夠


class PasskeyFlowTest(Server):
    def call(self, path, body, token=None, host=None):
        headers = {"Content-Type": "application/json", "Host": host or f"localhost:{self.port}"}
        if token:
            headers["X-Token"] = token
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=json.dumps(body).encode(),
                                     method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def register(self, phone, name="測試手機"):
        code, b = self.call("/api/passkey", {"action": "begin"}, TOKEN)
        if code != 200:
            return code, b
        self.assertEqual(b["rp"], "localhost")
        return self.call("/api/passkey", phone.create(b["challenge"], name), TOKEN)

    def login(self, phone, **kw):
        _, b = self.call("/api/passkey-login", {"action": "begin"})
        return self.call("/api/passkey-login", phone.get(b["challenge"], **kw))

    def test_flow(self):
        origin = f"http://localhost:{self.port}"
        # 沒登入不能登記
        self.assertEqual(self.call("/api/passkey", {"action": "begin"})[0], 401)
        self.assertFalse(self.call("/api/passkey-login", {"action": "has"})[1]["has"])

        phone = FakePhone(origin)
        code, d = self.register(phone, "我的 iPhone")
        self.assertEqual(code, 200, d)
        self.assertEqual([k["name"] for k in d["keys"]], ["我的 iPhone"])
        self.assertTrue(self.call("/api/passkey-login", {"action": "has"})[1]["has"])
        self.assertFalse(self.call("/api/passkey-login", {"action": "has"}, host="other.example")[1]["has"])

        # 用金鑰登入：拿到存取密碼
        code, d = self.login(phone)
        self.assertEqual(code, 200, d)
        self.assertEqual(d["token"], TOKEN)

        # 有人一直要題目：自己拿到的題目照樣能用
        _, mine = self.call("/api/passkey-login", {"action": "begin"})
        for _ in range(250):
            self.call("/api/passkey-login", {"action": "begin"})
        self.assertEqual(self.call("/api/passkey-login", phone.get(mine["challenge"]))[0], 200)
        # 登記用的題目不能拿來登入
        _, reg = self.call("/api/passkey", {"action": "begin"}, TOKEN)
        self.assertEqual(self.call("/api/passkey-login", phone.get(reg["challenge"]))[0], 401)

        # 同一個題目不能用兩次
        _, b = self.call("/api/passkey-login", {"action": "begin"})
        req = phone.get(b["challenge"])
        self.assertEqual(self.call("/api/passkey-login", req)[0], 200)
        self.assertEqual(self.call("/api/passkey-login", req)[0], 401)

        # 簽名不對、別的網址、沒有確認本人、沒登記過的手機：都不行
        stranger = FakePhone(origin)
        stranger.cid = phone.cid
        self.assertEqual(self.login(stranger)[0], 401)
        self.assertEqual(self.login(FakePhone("https://evil.example"))[0], 401)
        self.assertEqual(self.login(phone, flags=0x01)[0], 401)
        self.assertEqual(self.login(FakePhone(origin))[0], 401)

        # 最多 5 支
        for i in range(4):
            self.assertEqual(self.register(FakePhone(origin), f"手機{i}")[0], 200)
        code, d = self.register(FakePhone(origin))
        self.assertEqual(code, 400)
        self.assertIn("5", d["message"])

        # 刪掉之後就不能登入
        code, d = self.call("/api/passkey", {"action": "delete", "id": b64u(phone.cid)}, TOKEN)
        self.assertEqual(code, 200, d)
        self.assertEqual(len(d["keys"]), 4)
        self.assertEqual(self.login(phone)[0], 401)

        # 換密碼後，金鑰登入拿到的是新密碼
        other = FakePhone(origin)
        self.assertEqual(self.register(other)[0], 200)
        _, t = self.call("/api/token", {}, TOKEN)
        code, d = self.login(other)
        self.assertEqual(code, 200)
        self.assertEqual(d["token"], t["token"])


if __name__ == "__main__":
    unittest.main()
