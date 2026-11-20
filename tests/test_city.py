"""城市名稱：查到的英文城市換成中文，查不到中文就不寫（使用者看不懂英文）"""
import unittest


class City(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from test_passkey import load_sentinel
        cls.S = load_sentinel()

    def test_zh(self):
        S = self.S
        self.assertEqual(S.city_zh("Tokyo", "JP"), "東京")
        self.assertEqual(S.city_zh("Hong Kong", "HK"), "香港")
        self.assertEqual(S.city_zh("san jose", "US"), "聖荷西")
        self.assertEqual(S.city_zh("Nowhere Town", "JP"), "")      # 查不到中文：不寫英文
        self.assertEqual(S.city_zh("東京", "JP"), "東京")             # 本來就是中文：照舊
        self.assertEqual(S.city_zh("", "JP"), "")

    def test_peer_geo(self):
        self.assertEqual(self.S.geo_keep({"cc": "JP", "city": "Osaka", "ip": "1.2.3.4"}), {"cc": "JP", "city": "大阪"})


if __name__ == "__main__":
    unittest.main()
