"""相簿地名：香港、澳門這類有自己旗子的地方，不算在別國底下。只用 Python 內建模組。"""
import unittest

from test_passkey import S


class Region(unittest.TestCase):
    def test_fmt(self):
        j = {"category": "tourism", "name": "天星碼頭", "address": {"suburb": "尖沙咀", "state": "香港 Hong Kong", "ISO3166-2-lvl3": "CN-HK", "country": "中国", "country_code": "cn"}}
        p = S.alb_place_fmt(j)
        self.assertEqual(p["cc"], "HK")
        self.assertNotIn("中国", p["a"])
        j = {"address": {"state": "澳門 Macau", "country": "中国", "country_code": "cn"}}
        self.assertEqual(S.alb_place_fmt(j)["cc"], "MO")
        j = {"address": {"city": "San Juan", "ISO3166-2-lvl4": "US-PR", "country": "United States", "country_code": "us"}}
        self.assertEqual(S.alb_place_fmt(j)["cc"], "PR")
        j = {"address": {"city": "上海市", "country": "中国", "country_code": "cn"}}
        self.assertEqual(S.alb_place_fmt(j)["cc"], "CN")

    def test_old_cache(self):
        self.assertEqual(S.alb_cc_fix({"n": "尖沙咀", "a": "香港・中國", "c": "香港", "cc": "CN"}), "HK")
        self.assertEqual(S.alb_cc_fix({"n": "外灘", "a": "上海", "c": "上海", "cc": "CN"}), "CN")
        self.assertEqual(S.alb_cc_fix({"n": "京都", "cc": "JP"}), "JP")


if __name__ == "__main__":
    unittest.main()
