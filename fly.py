"""VPS 哨兵：機場起降（看板、雷達、官網航班表、分享）

這個檔案不是獨立的程式：sentinel.py 啟動時把它載入到自己裡面（`include("fly.py")`），
跟 sentinel.py 共用同一組變數和函式（DATA_DIR、log、http 工具…），sentinel.py 也直接用這裡的函式。
拆出來是為了改機場起降時不用動到監控、備份那些部分。
"""
# flake8: noqa

# ───────────────────────── 機場起降（飛機迷看板） ─────────────────────────
# 資料來自業餘接收站共享的飛機廣播（adsb.fi、adsb.lol、airplanes.live，免註冊），航線用 adsb.lol 查；
# 由主要主機去抓，網頁只問哨兵。測試用 SENTINEL_FLY_API（{lat}{lon}{d} 三個空格）、SENTINEL_FLY_ROUTE 換成假的
FLY_SRC = [x for x in [os.environ.get("SENTINEL_FLY_API", "")] if x] or [
    ("adsb.fi", "https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{d}", "https://adsb.fi"),
    ("adsb.lol", "https://api.adsb.lol/v2/point/{lat}/{lon}/{d}", "https://adsb.lol"),
    ("airplanes.live", "https://api.airplanes.live/v2/point/{lat}/{lon}/{d}", "https://airplanes.live"),
]
FLY_SRC = [("測試", x, "") if isinstance(x, str) else x for x in FLY_SRC]
FLY_ROUTE = os.environ.get("SENTINEL_FLY_ROUTE", "https://api.adsb.lol/api/0/routeset")
FLY_ROUTE2 = os.environ.get("SENTINEL_FLY_ROUTE2", "https://api.adsbdb.com/v0/callsign/")
# OpenSky：南台灣這類愛好者接收站收不到的地方補上；不登入每天只能問 400 次（填了帳號 4000 次），
# 所以照今天還剩幾次平均分著問（fly_sky_gap），不會半天就用完
FLY_SKY = os.environ.get("SENTINEL_FLY_SKY", "https://opensky-network.org/api/states/all?lamin={la0}&lomin={lo0}&lamax={la1}&lomax={lo1}")
FLY_SKY_AUTH = os.environ.get("SENTINEL_SKY_AUTH", "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token")
FLY_SKY_EVERY = 30
FLY_BG = int(os.environ.get("SENTINEL_FLY_BG") or 30)    # 背景每幾秒把四個機場都抓一次
FLY_SEEN_FILE = os.path.join(DATA_DIR, "fly-seen.json")
# 飛機編號（hex）→ 註冊號、機型：OpenSky 只給編號，用 tar1090-db（愛好者接收站共用、一直在更新的飛機資料庫）補；
# 資料庫照編號開頭分成好幾個檔，用到哪個抓哪個，存在主機上一週
FLY_TDB = os.environ.get("SENTINEL_FLY_TDB", "https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/db/")
FLY_TDB_DIR = os.path.join(DATA_DIR, "aircraft-db")
FLY_TDBS = {}
FLY_HEX_FILE = os.path.join(DATA_DIR, "fly-aircraft.json")
FLY_NM = 40                                   # 抓機場方圓幾海里（約 74 公里）
FLY_EVERY = 8                                 # 同一個機場幾秒內不重抓
# 常用機場的中文名稱（代碼、名稱、城市、緯度、經度）；其他機場用 data/airports.tsv 的英文名稱
FLY_APS = [
    ("TNN", "台南機場", "台南", 22.9504, 120.2057), ("HUN", "花蓮機場", "花蓮", 24.0231, 121.6180),
    ("TTT", "台東機場", "台東", 22.7550, 121.1018), ("MZG", "澎湖機場", "澎湖", 23.5687, 119.6280),
    ("KNH", "金門機場", "金門", 24.4279, 118.3590), ("LZN", "南竿機場", "馬祖", 26.1598, 119.9580),
    ("MFK", "北竿機場", "馬祖", 26.2242, 120.0030), ("CYI", "嘉義機場", "嘉義", 23.4618, 120.3930),
    ("TPE", "桃園機場", "台北", 25.0777, 121.2328), ("TSA", "松山機場", "台北", 25.0694, 121.5525),
    ("RMQ", "清泉崗機場", "台中", 24.2647, 120.6208), ("KHH", "小港機場", "高雄", 22.5771, 120.3500),
    ("HKG", "赤鱲角機場", "香港", 22.3080, 113.9185), ("MFM", "澳門機場", "澳門", 22.1496, 113.5916),
    ("NRT", "成田機場", "東京", 35.7647, 140.3864), ("HND", "羽田機場", "東京", 35.5494, 139.7798),
    ("KIX", "關西機場", "大阪", 34.4320, 135.2304), ("ITM", "伊丹機場", "大阪", 34.7855, 135.4382),
    ("NGO", "中部機場", "名古屋", 34.8584, 136.8054), ("FUK", "福岡機場", "福岡", 33.5859, 130.4511),
    ("CTS", "新千歲機場", "札幌", 42.7752, 141.6923), ("OKA", "那霸機場", "沖繩", 26.1958, 127.6459),
    ("ICN", "仁川機場", "首爾", 37.4602, 126.4407), ("GMP", "金浦機場", "首爾", 37.5583, 126.7906),
    ("PUS", "金海機場", "釜山", 35.1795, 128.9382), ("PVG", "浦東機場", "上海", 31.1443, 121.8083),
    ("SHA", "虹橋機場", "上海", 31.1979, 121.3363), ("PEK", "首都機場", "北京", 40.0799, 116.6031),
    ("PKX", "大興機場", "北京", 39.5098, 116.4105), ("CAN", "白雲機場", "廣州", 23.3924, 113.2988),
    ("SZX", "寶安機場", "深圳", 22.6393, 113.8107), ("XMN", "高崎機場", "廈門", 24.5440, 118.1277),
    ("MNL", "馬尼拉機場", "馬尼拉", 14.5086, 121.0194), ("BKK", "蘇凡納布機場", "曼谷", 13.6900, 100.7501),
    ("DMK", "廊曼機場", "曼谷", 13.9126, 100.6068), ("SGN", "新山一機場", "胡志明市", 10.8188, 106.6519),
    ("HAN", "內排機場", "河內", 21.2212, 105.8072), ("SIN", "樟宜機場", "新加坡", 1.3644, 103.9915),
    ("KUL", "吉隆坡機場", "吉隆坡", 2.7456, 101.7099), ("CGK", "蘇卡諾哈達機場", "雅加達", -6.1256, 106.6559),
    ("DPS", "峇里島機場", "峇里島", -8.7482, 115.1670), ("DXB", "杜拜機場", "杜拜", 25.2532, 55.3657),
    ("DOH", "哈馬德機場", "杜哈", 25.2731, 51.6081), ("IST", "伊斯坦堡機場", "伊斯坦堡", 41.2753, 28.7519),
    ("LHR", "希斯洛機場", "倫敦", 51.4700, -0.4543), ("CDG", "戴高樂機場", "巴黎", 49.0097, 2.5479),
    ("FRA", "法蘭克福機場", "法蘭克福", 50.0379, 8.5622), ("AMS", "史基浦機場", "阿姆斯特丹", 52.3105, 4.7683),
    ("JFK", "甘迺迪機場", "紐約", 40.6413, -73.7781), ("LAX", "洛杉磯機場", "洛杉磯", 33.9416, -118.4085),
    ("SFO", "舊金山機場", "舊金山", 37.6213, -122.3790), ("SEA", "西雅圖機場", "西雅圖", 47.4502, -122.3088),
    ("YVR", "溫哥華機場", "溫哥華", 49.1967, -123.1815), ("SYD", "雪梨機場", "雪梨", -33.9399, 151.1753),
    ("MEL", "墨爾本機場", "墨爾本", -37.6690, 144.8410), ("AKL", "奧克蘭機場", "奧克蘭", -37.0082, 174.7850),
]
# 其他常飛的機場：中文名稱、城市（台灣飛得到的；沒列到的，從官網航班表學中文名稱，FLY["zh"]）
FLY_ZH = {
    "KMQ": ("小松機場", "小松"), "HIJ": ("廣島機場", "廣島"), "OKJ": ("岡山機場", "岡山"), "TAK": ("高松機場", "高松"), "MYJ": ("愛媛松山機場", "愛媛"),
    "KOJ": ("鹿兒島機場", "鹿兒島"), "KMJ": ("熊本機場", "熊本"), "NGS": ("長崎機場", "長崎"), "OIT": ("大分機場", "大分"), "KKJ": ("北九州機場", "北九州"),
    "UBJ": ("山口宇部機場", "山口"), "SDJ": ("仙台機場", "仙台"), "AOJ": ("青森機場", "青森"), "AXT": ("秋田機場", "秋田"), "HKD": ("函館機場", "函館"),
    "ASJ": ("奄美機場", "奄美"), "ISG": ("石垣機場", "石垣島"), "MMY": ("宮古機場", "宮古島"), "SHI": ("下地島機場", "宮古島"), "FSZ": ("靜岡機場", "靜岡"),
    "IBR": ("茨城機場", "茨城"), "KIJ": ("新潟機場", "新潟"), "TOY": ("富山機場", "富山"), "HNA": ("花卷機場", "岩手"), "FKS": ("福島機場", "福島"),
    "YGJ": ("米子機場", "米子"), "IZO": ("出雲機場", "出雲"), "KCZ": ("高知機場", "高知"), "TKS": ("德島機場", "德島"), "UKB": ("神戶機場", "神戶"),
    "KMI": ("宮崎機場", "宮崎"), "AKJ": ("旭川機場", "旭川"), "KUH": ("釧路機場", "釧路"), "OBO": ("帶廣機場", "帶廣"), "MMB": ("女滿別機場", "女滿別"),
    "CJU": ("濟州機場", "濟州"), "TAE": ("大邱機場", "大邱"), "CJJ": ("清州機場", "清州"), "MWX": ("務安機場", "務安"), "YNY": ("襄陽機場", "襄陽"),
    "CTU": ("雙流機場", "成都"), "TFU": ("天府機場", "成都"), "CKG": ("江北機場", "重慶"), "KMG": ("長水機場", "昆明"), "XIY": ("咸陽機場", "西安"),
    "WUH": ("天河機場", "武漢"), "CSX": ("黃花機場", "長沙"), "HGH": ("蕭山機場", "杭州"), "NKG": ("祿口機場", "南京"), "TAO": ("膠東機場", "青島"),
    "TSN": ("濱海機場", "天津"), "DLC": ("周水子機場", "大連"), "SHE": ("桃仙機場", "瀋陽"), "HRB": ("太平機場", "哈爾濱"), "FOC": ("長樂機場", "福州"),
    "NGB": ("櫟社機場", "寧波"), "WNZ": ("龍灣機場", "溫州"), "CGO": ("新鄭機場", "鄭州"), "HAK": ("美蘭機場", "海口"), "SYX": ("鳳凰機場", "三亞"),
    "NNG": ("吳圩機場", "南寧"), "KWE": ("龍洞堡機場", "貴陽"), "TYN": ("武宿機場", "太原"), "HFE": ("新橋機場", "合肥"), "KWL": ("兩江機場", "桂林"),
    "JJN": ("晉江機場", "泉州"), "SWA": ("潮汕機場", "揭陽"), "YNT": ("蓬萊機場", "煙台"), "WUX": ("碩放機場", "無錫"), "CZX": ("奔牛機場", "常州"),
    "NTG": ("興東機場", "南通"), "YNZ": ("南洋機場", "鹽城"), "KHN": ("昌北機場", "南昌"), "ZUH": ("金灣機場", "珠海"), "LHW": ("中川機場", "蘭州"),
    "URC": ("地窩堡機場", "烏魯木齊"), "TNA": ("遙牆機場", "濟南"), "SJW": ("正定機場", "石家莊"), "HET": ("白塔機場", "呼和浩特"), "CGQ": ("龍嘉機場", "長春"),
    "YIW": ("義烏機場", "義烏"), "XUZ": ("觀音機場", "徐州"), "CEB": ("麥克坦機場", "宿霧"), "CRK": ("克拉克機場", "克拉克"), "KLO": ("卡利博機場", "長灘島"),
    "MPH": ("長灘島機場", "長灘島"), "PPS": ("公主港機場", "公主港"), "DVO": ("納卯機場", "納卯"), "ILO": ("怡朗機場", "怡朗"), "BCD": ("巴科洛德機場", "巴科洛德"),
    "DAD": ("峴港機場", "峴港"), "CXR": ("金蘭機場", "芽莊"), "PQC": ("富國機場", "富國島"), "HPH": ("吉碑機場", "海防"), "VCA": ("芹苴機場", "芹苴"),
    "HUI": ("富牌機場", "順化"), "VDO": ("雲屯機場", "下龍灣"), "VII": ("榮市機場", "榮市"), "CNX": ("清邁機場", "清邁"), "HKT": ("普吉機場", "普吉島"),
    "USM": ("蘇美機場", "蘇美島"), "KBV": ("喀比機場", "喀比"), "UTP": ("烏打拋機場", "芭達雅"), "CEI": ("清萊機場", "清萊"), "PNH": ("金邊機場", "金邊"),
    "KTI": ("德崇機場", "金邊"), "REP": ("暹粒機場", "暹粒"), "SAI": ("吳哥機場", "暹粒"), "RGN": ("仰光機場", "仰光"), "VTE": ("瓦岱機場", "永珍"),
    "LPQ": ("龍坡邦機場", "龍坡邦"), "PEN": ("檳城機場", "檳城"), "BKI": ("亞庇機場", "亞庇"), "KCH": ("古晉機場", "古晉"), "LGK": ("蘭卡威機場", "蘭卡威"),
    "JHB": ("士乃機場", "新山"), "SUB": ("朱安達機場", "泗水"), "KNO": ("瓜拉納姆機場", "棉蘭"), "BWN": ("汶萊機場", "汶萊"), "MLE": ("馬列機場", "馬爾地夫"),
    "CMB": ("可倫坡機場", "可倫坡"), "DEL": ("德里機場", "德里"), "BOM": ("孟買機場", "孟買"), "BLR": ("班加羅爾機場", "班加羅爾"), "KTM": ("加德滿都機場", "加德滿都"),
    "ROR": ("帛琉機場", "帛琉"), "GUM": ("關島機場", "關島"), "SPN": ("塞班機場", "塞班"), "ULN": ("烏蘭巴托機場", "烏蘭巴托"), "UBN": ("成吉思汗機場", "烏蘭巴托"),
    "VVO": ("海參崴機場", "海參崴"), "AUH": ("阿布達比機場", "阿布達比"), "VIE": ("維也納機場", "維也納"), "MUC": ("慕尼黑機場", "慕尼黑"), "PRG": ("布拉格機場", "布拉格"),
    "FCO": ("羅馬機場", "羅馬"), "MXP": ("米蘭機場", "米蘭"), "ZRH": ("蘇黎世機場", "蘇黎世"), "MAD": ("馬德里機場", "馬德里"), "BCN": ("巴塞隆納機場", "巴塞隆納"),
    "HEL": ("赫爾辛基機場", "赫爾辛基"), "CPH": ("哥本哈根機場", "哥本哈根"), "BRU": ("布魯塞爾機場", "布魯塞爾"), "LGW": ("蓋威克機場", "倫敦"), "ORD": ("芝加哥機場", "芝加哥"),
    "IAH": ("休士頓機場", "休士頓"), "DFW": ("達拉斯機場", "達拉斯"), "ONT": ("安大略機場", "洛杉磯"), "EWR": ("紐華克機場", "紐約"), "YYZ": ("多倫多機場", "多倫多"),
    "PHX": ("鳳凰城機場", "鳳凰城"), "HNL": ("檀香山機場", "檀香山"), "BOS": ("波士頓機場", "波士頓"), "ATL": ("亞特蘭大機場", "亞特蘭大"), "IAD": ("杜勒斯機場", "華盛頓"),
    "ANC": ("安克拉治機場", "安克拉治"), "YYC": ("卡加利機場", "卡加利"), "BNE": ("布里斯本機場", "布里斯本"), "PER": ("伯斯機場", "伯斯"), "CNS": ("凱恩斯機場", "凱恩斯"),
    "OOL": ("黃金海岸機場", "黃金海岸"), "CHC": ("基督城機場", "基督城"), "NAN": ("楠迪機場", "斐濟"), "KYD": ("蘭嶼機場", "蘭嶼"),
    "CMJ": ("七美機場", "七美"), "DSX": ("東沙機場", "東沙"), "HSG": ("佐賀機場", "佐賀"), "SYO": ("庄內機場", "庄內"), "WOT": ("望安機場", "望安"), "GNI": ("綠島機場", "綠島"),
    # 常飛過台灣的貨機轉運中心
    "MEM": ("曼非斯機場", "曼非斯"), "LGG": ("列日機場", "列日"), "SDF": ("路易維爾機場", "路易維爾"), "CVG": ("辛辛那提機場", "辛辛那提"),
    "LEJ": ("萊比錫機場", "萊比錫"), "IND": ("印第安納波利斯機場", "印第安納波利斯"), "OAK": ("奧克蘭機場", "舊金山灣區"), "RFD": ("洛克福機場", "洛克福"),
    "CGN": ("科隆機場", "科隆"), "EMA": ("東米德蘭機場", "東米德蘭"), "MIA": ("邁阿密機場", "邁阿密"), "OKC": ("奧克拉荷馬市機場", "奧克拉荷馬市"),
    "HHN": ("法蘭克福哈恩機場", "哈恩"), "NGO": ("中部國際機場", "名古屋"), "LUX": ("盧森堡機場", "盧森堡"),
}
FLY_PIN = ["TPE", "TSA", "RMQ", "KHH"]          # 台灣主要機場：選單最上面
FLY_DB = {}
FLY_NEAR = {}


def fly_db():
    """全世界的機場（第一次用到才讀）：代碼 → 代碼、名稱、城市、緯度、經度、國家、時區"""
    if not FLY_DB:
        zh = {a[0]: a for a in FLY_APS}
        zh.update({c: (c, *v) for c, v in FLY_ZH.items() if c not in zh})
        try:
            with open(os.path.join(HERE, "data", "airports.tsv"), encoding="utf-8") as f:
                for line in f:
                    x = line.rstrip("\n").split("\t")
                    if len(x) < 7 or line.startswith("#"):
                        continue
                    z = zh.get(x[0])
                    zc = x[7] if len(x) > 7 else ""
                    FLY_DB[x[0]] = (x[0], z[1] if z else x[1], z[2] if z else x[2], float(x[4]), float(x[5]), x[3], x[6], x[1] + " " + x[2] + " " + zc, zc)
        except OSError:
            pass
        for a in FLY_APS:                       # 找不到資料檔也至少有常用的
            FLY_DB.setdefault(a[0], (*a, "", "", "", ""))
    return FLY_DB


def fly_ap(a):
    return {"code": a[0], "name": a[1], "city": a[2], "lat": a[3], "lon": a[4], "cc": a[5], "tz": a[6]}


# 呼號前三碼 → 航班代碼、中文名稱
FLY_AL = {
    "EVA": ("BR", "長榮航空"), "CAL": ("CI", "中華航空"), "SJX": ("JX", "星宇航空"), "TTW": ("IT", "台灣虎航"),
    "MDA": ("AE", "華信航空"), "UIA": ("B7", "立榮航空"), "CPA": ("CX", "國泰航空"), "HKE": ("UO", "香港快運"),
    "CRK": ("HX", "香港航空"), "AMU": ("NX", "澳門航空"), "HGB": ("HB", "大灣區航空"), "AHK": ("LD", "華民航空"),
    "JAL": ("JL", "日本航空"), "ANA": ("NH", "全日空"), "APJ": ("MM", "樂桃航空"), "JJP": ("GK", "捷星日本"),
    "SKY": ("BC", "天馬航空"), "ADO": ("HD", "北海道國際航空"), "SNJ": ("6J", "Solaseed 航空"), "JTA": ("NU", "日本越洋航空"),
    "NCA": ("KZ", "日本貨物航空"), "IBX": ("FW", "伊別克斯航空"), "KAL": ("KE", "大韓航空"), "AAR": ("OZ", "韓亞航空"),
    "JNA": ("LJ", "真航空"), "TWB": ("TW", "德威航空"), "TZP": ("ZG", "ZIPAIR"), "AJX": ("NQ", "AirJapan"), "JSA": ("3K", "捷星亞洲"), "VAG": ("VU", "越旅航空"), "LAO": ("QV", "寮國航空"), "APZ": ("YP", "Air Premia"), "JJA": ("7C", "濟州航空"), "ABL": ("BX", "釜山航空"),
    "ESR": ("ZE", "易斯達航空"), "ASV": ("RS", "首爾航空"), "CCA": ("CA", "中國國際航空"), "CES": ("MU", "東方航空"),
    "CSN": ("CZ", "南方航空"), "CHH": ("HU", "海南航空"), "CXA": ("MF", "廈門航空"), "CSZ": ("ZH", "深圳航空"),
    "CSC": ("3U", "四川航空"), "CQH": ("9C", "春秋航空"), "DKH": ("HO", "吉祥航空"), "CSH": ("FM", "上海航空"),
    "CDG": ("SC", "山東航空"), "CAO": ("CA", "國貨航"), "CKK": ("CK", "中貨航"), "CSS": ("O3", "順豐航空"),
    "SIA": ("SQ", "新加坡航空"), "TGW": ("TR", "酷航"), "SQC": ("SQ", "新航貨運"), "THA": ("TG", "泰國航空"),
    "AIQ": ("FD", "泰國亞洲航空"), "TLM": ("SL", "泰國獅子航空"), "NOK": ("DD", "皇雀航空"), "TVJ": ("VZ", "泰國越捷航空"),
    "AXM": ("AK", "亞洲航空"), "XAX": ("D7", "全亞洲航空"), "MAS": ("MH", "馬來西亞航空"), "MXD": ("OD", "馬印航空"),
    "PAL": ("PR", "菲律賓航空"), "CEB": ("5J", "宿霧太平洋"), "APG": ("Z2", "菲律賓亞洲航空"), "HVN": ("VN", "越南航空"),
    "VJC": ("VJ", "越捷航空"), "BAV": ("QH", "越竹航空"), "GIA": ("GA", "印尼航空"), "LNI": ("JT", "獅子航空"), "AWQ": ("QZ", "印尼亞洲航空"), "TAX": ("XJ", "泰國全亞洲航空"),
    "UAE": ("EK", "阿聯酋航空"), "QTR": ("QR", "卡達航空"), "ETD": ("EY", "阿提哈德航空"), "THY": ("TK", "土耳其航空"),
    "KLM": ("KL", "荷蘭皇家航空"), "AFR": ("AF", "法國航空"), "DLH": ("LH", "漢莎航空"), "BAW": ("BA", "英國航空"),
    "FIN": ("AY", "芬蘭航空"), "SWR": ("LX", "瑞士航空"), "AUA": ("OS", "奧地利航空"), "ITY": ("AZ", "義大利航空"),
    "UAL": ("UA", "聯合航空"), "AAL": ("AA", "美國航空"), "DAL": ("DL", "達美航空"), "ASA": ("AS", "阿拉斯加航空"),
    "ACA": ("AC", "加拿大航空"), "QFA": ("QF", "澳洲航空"), "JST": ("JQ", "捷星航空"), "ANZ": ("NZ", "紐西蘭航空"),
    "ETH": ("ET", "衣索比亞航空"), "FDX": ("FX", "聯邦快遞"), "UPS": ("5X", "優比速"), "GTI": ("5Y", "亞特拉斯航空"),
    "CLX": ("CV", "盧森堡貨運"), "CKS": ("K4", "卡利塔航空"), "PAC": ("PO", "寶立航空"), "ABW": ("RU", "空橋貨運"),
    "BOX": ("3S", "德國貨運"), "GEC": ("LH", "漢莎貨運"),
    "DHK": ("D0", "DHL 航空"), "BCS": ("QY", "DHL 歐洲航空"), "DHX": ("ES", "DHL 國際航空"), "YZR": ("Y8", "揚子江快運"),
    "CYZ": ("8Y", "中國郵政航空"), "HYT": ("YG", "圓通航空"), "ABX": ("GB", "ABX 航空"), "ATN": ("8C", "ATI 航空"),
    "AZG": ("7L", "絲路西方航空"), "WGN": ("KD", "西方環球航空"), "NCR": ("N8", "國家航空"),
    "SFJ": ("7G", "星悅航空"), "SPQ": ("9G", "太陽富國航空"), "CDC": ("GJ", "長龍航空"), "AIC": ("AI", "印度航空"), "AVA": ("AV", "哥倫比亞航空"),
    "RBA": ("BI", "汶萊航空"), "CMP": ("CM", "巴拿馬航空"), "LOT": ("LO", "波蘭航空"), "BKP": ("PG", "曼谷航空"),
    "EOK": ("RF", "可依航空"), "AEA": ("UX", "歐洲航空"), "DAC": ("DA", "德安航空"),
}
# 機型代碼 → 好讀的名稱（接收站沒給時用）
# 台灣四個機場官網表上常見的航空公司：主機在背景先把標誌抓好（其他的出現在看板上才抓）
FLY_ALS = sorted(({v[0] for v in FLY_AL.values()} | set(
    "5J 7C 7G 9C 9G AA AC AE AF AI AK AS AV B7 BI BR BX CA CI CM CX CZ DL EK EY FD GK HB HO HU HX IT JL JX KE KL LJ LO MF MH MM MU "
    "NH NU NX NZ OD OZ PG PR QF SC SL SQ TG TK TR TW UA UO UX VJ VN VU VZ Z2 ZH QV ZE RF".split())))
FLY_TYPES = {
    "A319": "A319", "A320": "A320", "A20N": "A320neo", "A321": "A321", "A21N": "A321neo", "BCS1": "A220-100", "BCS3": "A220-300",
    "A306": "A300-600", "A332": "A330-200", "A333": "A330-300", "A338": "A330-800", "A339": "A330-900",
    "A343": "A340-300", "A346": "A340-600", "A359": "A350-900", "A35K": "A350-1000", "A388": "A380",
    "B737": "737-700", "B738": "737-800", "B739": "737-900", "B37M": "737 MAX 7", "B38M": "737 MAX 8", "B39M": "737 MAX 9",
    "B3XM": "737 MAX 10", "B744": "747-400", "B748": "747-8", "B752": "757-200", "B763": "767-300", "B764": "767-400",
    "B772": "777-200", "B77L": "777-200LR", "B77W": "777-300ER", "B773": "777-300", "B778": "777-8", "B779": "777-9",
    "B788": "787-8", "B789": "787-9", "B78X": "787-10", "MD11": "MD-11", "C919": "C919", "AJ27": "ARJ21",
    "E170": "E170", "E75L": "E175", "E190": "E190", "E195": "E195", "E290": "E190-E2", "E295": "E195-E2",
    "AT72": "ATR 72", "AT76": "ATR 72-600", "DH8D": "Dash 8-400", "CRJ9": "CRJ900", "CRJ7": "CRJ700",
    "A3ST": "Beluga", "A337": "BelugaXL", "A124": "An-124", "A225": "An-225", "IL76": "Il-76", "C17": "C-17",
    "C130": "C-130", "C30J": "C-130J", "K35R": "KC-135", "P8": "P-8", "GLF6": "Gulfstream G650", "GLEX": "Global Express", "GL5T": "Global 5000", "GL7T": "Global 7500", "GL8T": "Global 8000", "GLF4": "Gulfstream G450", "GLF5": "Gulfstream G550", "GA6C": "Gulfstream G600", "GA7C": "Gulfstream G700", "CL35": "Challenger 350", "CL60": "Challenger 650", "F2TH": "Falcon 2000", "FA7X": "Falcon 7X", "FA8X": "Falcon 8X",
    "B190": "Beech 1900", "C208": "Cessna 208", "H25B": "Hawker 800",
}
FLY_RARE = {"A388", "B748", "B742", "MD11", "A343", "A346", "A3ST", "A337", "A124", "A225", "IL76", "C17",
            "C5M", "K35R", "A400", "B52", "E3TF", "B764", "B762", "B763", "A306", "A338", "B779", "B778", "C919", "BCS1", "BCS3"}   # 還沒記夠 7 天時先用這張


FLY_RARE_OK = {}


def fly_rare(t, code):
    """少見的機型：照這個機場最近 30 天實際看到的天數算（3 天以下算少見）；還沒記滿 7 天就先用 FLY_RARE"""
    if not t:
        return False
    days, old = FLY["types"].get(code) or {}, time.strftime("%Y%m%d", time.localtime(time.time() - 30 * 86400))
    k = FLY_RARE_OK.get(code)
    if not k or k[0] != old:                  # 記滿 7 天了沒（一天算一次就好）
        k = FLY_RARE_OK[code] = (old, len({d for v in list(days.values()) for d in v if d > old}) >= 7)
    if not k[1]:
        return t in FLY_RARE
    return sum(d > old for d in days.get(t) or ()) <= 3


def fly_type_seen(code, t):
    """記下這個機場今天看到哪些機型（要降落、在地面、剛起飛的；路過的不算）"""
    if t:
        FLY["types"].setdefault(code, {}).setdefault(t, set()).add(time.strftime("%Y%m%d"))
# 貨機：貨運航空公司，或華航、長榮的貨運航班號（5000～6999、長榮 600～699）；看板以客機為主，不列出來
FLY_CARGO_ICAO = {"NCA", "CAO", "CKK", "CSS", "SQC", "FDX", "UPS", "GTI", "CLX", "CKS", "PAC", "ABW", "BOX", "GEC", "AHK",
                  "DHK", "DHX", "BCS", "YZR", "CYZ", "ICV", "ATN", "ABX", "MPH", "TAY", "NPT", "SOO", "WGN", "AJT", "KYE", "YTO", "AZG", "NCR", "HYT"}
FLY_CARGO_IATA = {"KZ", "CK", "O3", "FX", "5X", "5Y", "CV", "K4", "PO", "RU", "3S", "LD", "QY", "D0", "Y8", "CF", "M6", "GB", "YG", "C8", "K9", "7L", "KD", "N8", "8Y", "ES", "8C"}
FLY_SKYS = {"cache": {}, "until": 0, "left": None, "out": 0, "tok": "", "texp": 0, "tbad": 0, "err": ""}
FLY = {"cache": {}, "routes": {}, "lock": threading.Lock(), "last": 0.0, "bad": {}, "rq": set(), "rbusy": False, "fetch": threading.Lock(), "logged": {}, "seen": {}, "view": {}, "used": 0, "hex": {}, "hq": set(), "hbusy": False, "zh": {}, "gate": {}, "types": {}, "turn": {}}


def fly_cargo(fn, cs=""):
    if re.match(r"[A-Z]{3}\d", cs or "") and cs[:3] in FLY_CARGO_ICAO:
        return True
    m = re.fullmatch(r"([A-Z0-9]{2})(\d{1,4})[A-Z]?", fn or "")
    if not m:
        return False
    al, n = m.group(1), int(m.group(2))
    return al in FLY_CARGO_IATA or (al in ("CI", "BR") and 5000 <= n <= 6999) or (al == "BR" and 600 <= n <= 699) or al + str(n) in FLY_SCHED["cargo"]


# 桃園機場的客貨機定期班表（政府開放資料，每週更新）：表上寫貨機的班次一律算貨機；抓不到就照上面的規則
FLY_SCHED_URL = os.environ.get("SENTINEL_TPE_SCHED", "https://odp.taoyuan-airport.com/dataset/2022110903?format=csv")
FLY_SCHED = {"cargo": set(), "t": 0.0, "try": 0.0, "busy": False, "load": False}


def fly_sched_parse(text):
    """班表 CSV → 貨機班次（CI5148 這種寫法）；看不懂欄位就回空的"""
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return set()
    head = [h.strip().lower() for h in rows[0]]
    col = lambda *ks: next((i for i, h in enumerate(head) if any(k in h for k in ks)), None)
    kd, ka, kn = col("性質", "nature"), col("航空公司", "airline"), col("班次", "航班號", "flight")
    if kd is None or ka is None or kn is None:
        return set()
    out = set()
    for r in rows[1:]:
        if len(r) <= max(kd, ka, kn):
            continue
        d = r[kd].strip()
        if "貨" in d or d.upper() in ("C", "F", "CARGO", "FREIGHT", "FREIGHTER"):
            out.add(fly_fn(r[ka].strip().upper() + r[kn].strip().upper()))
    return out


def fly_sched_pull():
    try:
        b = fly_get(FLY_SCHED_URL, ua="Mozilla/5.0", timeout=60)
        try:
            text = b.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = b.decode("big5hkscs", "replace")
        got = fly_sched_parse(text)
        if not got:
            raise ValueError("看不懂班表的欄位")
        FLY_SCHED.update(cargo=got, t=time.time())
        os.makedirs(os.path.join(DATA_DIR, "fids"), exist_ok=True)
        with open(os.path.join(DATA_DIR, "fids", "tpe-cargo.json"), "w", encoding="utf-8") as f:
            json.dump(sorted(got), f)
    except Exception as e:  # noqa: BLE001
        fly_log(f"桃園機場貨機班表：{str(e)[:60] or type(e).__name__}")
    finally:
        FLY_SCHED["busy"] = False


def fly_sched_check():
    """一週抓一次（失敗的話 6 小時後再試），上次抓到的存在 DATA_DIR/fids/tpe-cargo.json"""
    now = time.time()
    if not FLY_SCHED["load"]:
        FLY_SCHED["load"] = True
        fn = os.path.join(DATA_DIR, "fids", "tpe-cargo.json")
        try:
            with open(fn, encoding="utf-8") as f:
                FLY_SCHED.update(cargo=set(json.load(f)), t=os.path.getmtime(fn))
        except (OSError, ValueError, TypeError):
            pass
    if FLY_SCHED_URL and not FLY_SCHED["busy"] and now - FLY_SCHED["t"] > 7 * 86400 and now - FLY_SCHED["try"] > 6 * 3600:
        FLY_SCHED.update({"busy": True, "try": now})
        threading.Thread(target=fly_sched_pull, daemon=True).start()


# 用途：貨運航空公司以外，客貨都飛的公司只有某些機型是貨機（例如國泰的 747 全部是貨機）
FLY_FREIGHT = {("CPA", "B748"), ("CPA", "B744"), ("CAL", "B744"), ("CAL", "B77L"), ("EVA", "B77L"), ("SIA", "B744"), ("SIA", "B77L"),
               ("CES", "B77L"), ("CSN", "B77L"), ("ETD", "B77L"), ("AFR", "B77L")}   # 只放這家公司這種機型「全部」都是貨機的
FLY_BIZ = r"^(SBR|MU30|WW24|ASTR|GALX|G150|G280|FA10|FA20|GLF|GA[5-8]C|GL[5-8XE]|GLEX|CL30|CL35|CL60|F2TH|F900|FA[5-8X]|C25|C5\d|C68|C700|C750|E5[05]P|E35L|E545|E550|LJ|H25|PC24|BE40|PRM1|HDJT|SF50|EA50|C510|BBJ|ACJ|A318|B737BBJ)"
FLY_GOV = r"(airborne service|coast guard|\bpolice\b|\bfire\b|government|ministry|\bnavy\b|\barmy\b|air force|空勤|海巡|警|消防)"


FLY_RGN = r"AT[4-7]\d|DH8|SF34|D328|E120|JS41|AN24|F50$"


def fly_use(cs, al, t, cat, mil, op="", fn=""):
    """這架飛機做什麼用：客機、貨機、私人／公務機、直升機、軍機、公務、小飛機；看不出來回空字串"""
    t, kind = str(t or "").upper(), fly_kind(t, "", cat)
    if mil:
        return "軍機"
    if re.search(FLY_GOV, op or "", re.I):
        return "公務飛機"
    if kind == "heli":
        return "直升機"
    pre = cs[:3] if re.match(r"[A-Z]{3}\d", cs or "") else ""
    if fly_cargo(fn, cs) or (pre, t) in FLY_FREIGHT or (not al and re.search(r"cargo|freight|logistics", op or "", re.I)):
        return "貨機"
    a = fly_act(t)
    if t and not al and (re.match(FLY_BIZ, t) or (a and a[0][2] == "J" and a[1] == "L")):     # 輕型噴射機都是私人／公務機
        return "私人／公務機"
    if al:
        return "客機"
    if re.match(FLY_RGN, t):                   # ATR、Dash 8 這類螺旋槳客機，沒有航班號也不是小飛機
        return "客機"
    if kind in ("ga", "tp") or str(cat or "").upper() in ("A1", "B1", "B4"):
        return "小飛機"
    if t and re.match(FLY_BIZ, t):
        return "私人／公務機"
    return ""


def fly_cut(m, n):
    """太長的機型名稱：在字和字之間切，不把數字切一半（Global 7000 不會變 Global 700）"""
    return m if len(m) <= n else m[:n + 1].rsplit(" ", 1)[0]


FLY_CARGO_M = {"B744": "747-400F", "B748": "747-8F", "B77L": "777F", "B763": "767-300F", "B762": "767-200F", "B752": "757-200F",
               "B738": "737-800F", "B734": "737-400F", "B733": "737-300F", "A332": "A330-200F", "A333": "A330-300F", "A321": "A321F",
               "A306": "A300-600F", "MD11": "MD-11F", "B77W": "777-300ERF", "DC10": "DC-10F", "A310": "A310F"}   # 同一個國際民航組織代碼客貨機都用：確定是貨機時改寫貨機型號


def fly_cargo_model(t, m):
    """貨機的型號：機型代碼分不出客貨，是貨機就寫成「747-400F」這種（原本已經寫貨機的不動）"""
    m = m or ""
    if re.search(r"(F|BCF|SF|P2F|PCF|Freighter)\b", m, re.I):
        return m
    return FLY_CARGO_M.get((t or "").upper()) or m


def fly_model(m):
    """機型寫法統一：官網的「B777-300」「A320-271」和收到的「777-300ER」「A320neo」用同一種寫法"""
    m = re.sub(r"\s+", " ", str(m or "")).strip()
    b = re.fullmatch(r"B?(7[0-8]7)[- ]?(\d{1,3}(?:ER|LR|F)?|MAX ?\d+)", m, re.I)
    if b:
        return f"{b.group(1)}-{b.group(2).upper()}" if not b.group(2).upper().startswith("MAX") else f"{b.group(1)} MAX {b.group(2)[3:].strip()}"
    a = re.fullmatch(r"(A3[12][019])[- ]?\d{3}(N)?X?", m, re.I)
    if a:
        return a.group(1).upper() + ("neo" if a.group(2) else "")
    return {"A350-100": "A350-1000"}.get(m.upper(), m)


# 雷達上飛機的樣子：q4 四發、wb 雙發廣體、nb 窄體、tp 螺旋槳、ga 小飛機、heli 直升機（看機型代碼，沒有就看機型名稱、訊號裡的大小分類）
FLY_KINDS = [("heli", r"^(EC\d|H1\d\d$|H[1-6]\d$|AS3|AS5|AS6|B06|B407|B412|B429|R22|R44|R66|S76|S92|AW1|A1[0-8]9|BK17|UH\d|UHEL|H60|MI8|EH10|NH90)"),
             ("q4", r"^(A38|B74|A34|IL9|IL7|A124|A225|C17$|C5M|K35|E3[TC]F|A400|B52|BA46|RJ[178]|P3$|C130|C30J)"),
             ("wb", r"^(A30|A310|A33|A35|B76|B77|B78|MD1|DC10|L101|IL86|A3ST|A337)"),
             ("tp", r"^(AT[4-7]|DH8|DHC|F50|SF34|D328|B190|C208|JS\d|ATP|Y12|AN2|AN24|AN26|L410|BE20|BE9|PC12|MU2|C212|CN35|E120|SW4|DO28)"),
             ("ga", r"^(C1\d\d|C2[0-9][0-9]|P28|PA\d|SR2|DA[2-6]|BE3|BE[56]\d|M20|TB\d|RV\d|G115|ULAC|GLID|GLIM|GYRO|C42)"),
             ("nb", r"^(A1[89]N|A2[01]N|A3[12]\d|B7[0-5]|B3[789]M|B3XM|BCS|E1\d|E2\d|E7|E9|CRJ|C919|AJ27|MD8|MD9|B71|SU95|F70|F100|GLF|GL\d|GA[5-8]C|GLEX|CL|LJ|FA|H25|C25|C5\d|C6\d|C7[05]0|E5[05]|E35L|E545|E550|HDJT|BE40|PRM1|SF50|EA50|PC24|P8$)")]
FLY_KIND_M = [("q4", r"(A380|747|A340|Il-76|An-124|C-17|C-130)"), ("wb", r"(A330|A350|777|787|767|A300|MD-11)"),
              ("tp", r"(ATR|Dash 8|Q400|Beech 1900|Cessna 208)"), ("nb", r"(A31[89]|A32[01]|737|757|A220|E1[79]\d|CRJ|C919|ARJ)")]


FLY_ACT = {}


def fly_act(t):
    """機型代碼查國際民航組織的表（data/actypes.tsv）：(種類, 尾流等級)，例如 ("L2J", "M")；查不到回 None"""
    if not FLY_ACT:
        try:
            with open(os.path.join(HERE, "data", "actypes.tsv"), encoding="utf-8") as f:
                for line in f:
                    p = line.split()
                    if len(p) == 3 and not line.startswith("#"):
                        FLY_ACT[p[0]] = (p[1], p[2])
        except OSError:
            pass
        FLY_ACT.setdefault("", None)          # 讀過了（沒有檔案也不要一直讀）
    return FLY_ACT.get(str(t or "").upper())


def fly_kind(t, model="", cat=""):
    t, model = str(t or "").upper(), str(model or "")
    a = fly_act(t)
    if a:                                     # 照國際民航組織的分類：直升機、四發、重型噴射機是廣體、其他噴射機、螺旋槳、小飛機
        (k, n, e), w = a[0], a[1]
        if k == "H":
            return "heli"
        if n in "468":
            return "q4"
        if e == "J":
            return "wb" if w in "HJ" else "nb"
        if e == "T" or k == "R":
            return "tp"
        return "ga"
    for k, rx in FLY_KINDS:
        if t and re.match(rx, t):
            return k
    for k, rx in FLY_KIND_M:
        if re.search(rx, model, re.I):
            return k
    return {"A7": "heli", "A5": "wb", "A4": "nb", "A3": "nb", "A2": "ga", "A1": "ga"}.get(str(cat or "").upper(), "")


def fly_dist(la1, lo1, la2, lo2):
    """兩點距離（公里）和方位角"""
    p1, p2, dl = math.radians(la1), math.radians(la2), math.radians(lo2 - lo1)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    d = 6371 * 2 * math.asin(min(1, math.sqrt(a)))
    b = math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)))
    return d, (b + 360) % 360


def fly_fetch(ap):
    """抓機場附近的飛機：一個來源失敗就換下一個（剛失敗的先跳過一下，全都失敗過就照順序再試）；每秒最多問一次"""
    lat, lon = ap[3], ap[4]
    err = "連不上"
    srcs = [s for s in FLY_SRC if time.time() < FLY["bad"].get(s[0], 0)]
    for name, url, home in [s for s in FLY_SRC if s not in srcs] + srcs:
        wait = FLY["last"] + 1.1 - time.time()
        if wait > 0:
            time.sleep(wait)
        FLY["last"] = time.time()
        try:
            req = urllib.request.Request(url.format(lat=lat, lon=lon, d=FLY_NM), headers={"User-Agent": "vps-sentinel"})
            with urllib.request.urlopen(req, timeout=8) as r:
                d = json.loads(r.read())
            ac = d.get("ac", d.get("aircraft")) if isinstance(d, dict) else None
            if ac is None and isinstance(d, dict) and ("now" in d or "total" in d):
                ac = []                       # 附近一架都沒有
            if not isinstance(ac, list):
                raise ValueError("格式不對")
            FLY["bad"].pop(name, None)
            return ac, name, home
        except Exception as e:  # noqa: BLE001
            FLY["bad"][name] = time.time() + (15 if isinstance(e, urllib.error.HTTPError) and e.code == 429 else 60)
            err = f"{name}：{str(e)[:60]}"
            fly_log(err)
    raise RuntimeError(err)


def fly_sky_tok():
    """有填 OpenSky 帳號：換一張通行證（大約 30 分鐘，快過期才重換）；帳號不對就先不登入"""
    cid, sec = C.get("OPENSKY_ID", ""), C.get("OPENSKY_SECRET", "")
    now = time.time()
    if not (cid and sec) or now < FLY_SKYS["tbad"]:
        return ""
    if FLY_SKYS["tok"] and now < FLY_SKYS["texp"]:
        return FLY_SKYS["tok"]
    body = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": cid, "client_secret": sec}).encode()
    try:
        req = urllib.request.Request(FLY_SKY_AUTH, data=body, headers={"User-Agent": "vps-sentinel", "Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(req, timeout=8) as r:
            d = json.loads(r.read())
        FLY_SKYS.update(tok=str(d["access_token"]), texp=now + max(60, int(d.get("expires_in") or 1800) - 60), err="")
        return FLY_SKYS["tok"]
    except urllib.error.HTTPError as e:
        bad = e.code in (400, 401, 403)
        FLY_SKYS.update(tbad=now + (600 if bad else 60), err="帳號不對" if bad else f"登入失敗（{e.code}）")
    except Exception as e:  # noqa: BLE001
        FLY_SKYS.update(tbad=now + 60, err=f"登入失敗（{str(e)[:40]}）")
    fly_log(f"OpenSky 登入：{FLY_SKYS['err']}")
    return ""


def fly_sky_gap():
    """OpenSky 隔幾秒問一次：今天剩下的次數，平均分給一天裡大約三成的時間（有人在看的時候）"""
    gap = 20 if C.get("OPENSKY_ID") and C.get("OPENSKY_SECRET") else FLY_SKY_EVERY
    if FLY_SKYS["left"] is not None:
        gap = max(gap, (86400 - time.time() % 86400) * .3 / max(1, FLY_SKYS["left"]))   # 次數每天 0 點（世界時間）重算
    return min(900, gap)


def fly_sky_need(ap, fids, ac):
    """非必要不問 OpenSky：官網表上快落地、剛起飛的班機，愛好者那邊收得到的飛機不夠多，才需要問"""
    if fids is None:
        return True                                    # 沒有官網表（或還沒抓到）：看不出來，照問
    now = time.time()
    want = 0
    for r in fids:
        t = r.get("est") or r.get("sch") or 0
        if r.get("st") == "取消":
            continue
        if (r.get("io") == "arr" and now - 600 < t < now + 2400 and r.get("st") != "已到") \
                or (r.get("io") == "dep" and now - 1200 < t < now + 300):
            want += 1
    if not want:
        return False                                   # 這段時間沒有班機起降
    near = 0
    for a in ac or []:
        try:
            if a.get("alt_baro") != "ground" and fly_dist(ap[3], ap[4], float(a["lat"]), float(a["lon"]))[0] < 80:
                near += 1
        except (AttributeError, KeyError, TypeError, ValueError):
            continue
    return near < want                                 # 愛好者收得到的比要起降的少：才補


def fly_sky(ap, use=True):
    """OpenSky 的飛機，換成跟 adsb.fi 一樣的格式；位置照速度推算到現在。use=False：只用上次問到的（不花次數）"""
    hit = FLY_SKYS["cache"].get(ap[0])
    now = time.time()
    gap = fly_sky_gap()
    if use and (not hit or now - hit[0] >= gap) and now >= FLY_SKYS["until"]:
        r = FLY_NM * 1.852 / 111
        q = {"la0": round(ap[3] - r, 3), "la1": round(ap[3] + r, 3),
             "lo0": round(ap[4] - r / max(.2, math.cos(math.radians(ap[3]))), 3), "lo1": round(ap[4] + r / max(.2, math.cos(math.radians(ap[3]))), 3)}
        tok = fly_sky_tok()
        try:
            hd = {"User-Agent": "vps-sentinel", **({"Authorization": "Bearer " + tok} if tok else {})}
            req = urllib.request.Request(FLY_SKY.format(**q), headers=hd)
            with urllib.request.urlopen(req, timeout=6) as res:
                d = json.loads(res.read())
                left = res.headers.get("X-Rate-Limit-Remaining")
            hit = FLY_SKYS["cache"][ap[0]] = (now, float(d.get("time") or now), d.get("states") or [])
            FLY_SKYS.update(out=0, left=int(left) if left and left.isdigit() else FLY_SKYS["left"])
        except Exception as e:  # noqa: BLE001
            wait = 60
            if isinstance(e, urllib.error.HTTPError) and e.code == 429:      # 今天的次數用完了
                try:
                    wait = int(e.headers.get("X-Rate-Limit-Retry-After-Seconds") or 3600)
                except ValueError:
                    wait = 3600
                FLY_SKYS.update(out=now + min(wait, 86400), left=0)
            elif isinstance(e, urllib.error.HTTPError) and e.code == 401 and tok:   # 通行證過期：下次重換
                FLY_SKYS.update(tok="", texp=0)
                wait = 5
            FLY_SKYS["until"] = now + min(wait, 86400)
            fly_log(f"OpenSky：{str(e)[:60]}")
    keep = min(600, max(120, gap * 2.5))           # 問得比較少的時候，上一次的位置留久一點（照速度推算）
    if not hit or now - hit[0] > keep:
        return []
    out = []
    for x in hit[2]:
        try:
            if not isinstance(x, list) or len(x) < 15 or x[5] is None or x[6] is None:
                continue
            seen = max(0, now - float(x[3] or hit[1]))
            v, trk = float(x[9] or 0), x[10]
            lat, lon = float(x[6]), float(x[5])
            if trk is not None and v and seen < keep and not x[8]:   # 推算到現在的位置
                k = v * seen / 111320
                lat += k * math.cos(math.radians(trk))
                lon += k * math.sin(math.radians(trk)) / max(.2, math.cos(math.radians(lat)))
            alt = x[7] if x[7] is not None else x[13]
            if alt is not None and x[11] and seen < keep and not x[8]:
                alt = max(0.0, float(alt) + float(x[11]) * seen)
            out.append({"hex": str(x[0] or ""), "flight": str(x[1] or "").strip(), "lat": lat, "lon": lon,
                        "alt_baro": "ground" if x[8] else (round(float(alt) / 0.3048) if alt is not None else None),
                        "gs": v * 1.94384, "track": trk, "baro_rate": float(x[11] or 0) * 196.85,
                        "squawk": x[14], "seen_pos": 0 if seen < keep else 999})   # 已經推算到現在了
        except (TypeError, ValueError):
            continue
    return out


# 台灣機場官網的航班表（表定、預計時間、登機門、狀態）；台灣的機場附近愛好者常收不到飛機訊號，用官網補
FLY_FIDS_URL = {
    "TPE": os.environ.get("SENTINEL_FIDS_TPE", "https://www.taoyuan-airport.com/uploads/flightx/a_flight_v4.txt"),
    "KHH": os.environ.get("SENTINEL_FIDS_KHH", "https://www.kia.gov.tw/data/"),
    "RMQ": os.environ.get("SENTINEL_FIDS_RMQ", "https://www.tca.gov.tw/?act=fids&code=api_departure_arrival&airFlyIO="),
    "TSA": os.environ.get("SENTINEL_FIDS_TSA", "https://www.tsa.gov.tw/api/airFlyTab/Paging"),
}
FLY_FIDS_NAME = {"TPE": ("桃園機場", "https://www.taoyuan-airport.com"), "KHH": ("高雄機場", "https://www.kia.gov.tw"),
                 "RMQ": ("台中機場", "https://www.tca.gov.tw"), "TSA": ("松山機場", "https://www.tsa.gov.tw")}
FLY_FIDS_EVERY = 60
FLY_FIDS = {}
FLY_TW = timezone(timedelta(hours=8))
FLY_IATA_T = {"319": "A319", "320": "A320", "32N": "A320neo", "321": "A321", "32Q": "A321neo", "330": "A330", "332": "A330-200",
              "333": "A330-300", "339": "A330-900", "359": "A350-900", "351": "A350-1000", "388": "A380", "738": "737-800",
              "7M8": "737 MAX 8", "772": "777-200", "77W": "777-300ER", "788": "787-8", "789": "787-9", "781": "787-10",
              "AT7": "ATR 72", "ATR": "ATR 72", "E90": "E190", "E95": "E195"}
KHH_ARR = {1: "準時", 2: "已到", 3: "延誤", 4: "轉降", 5: "取消", 6: "提早"}
KHH_DEP = {1: "準時", 2: "報到", 3: "登機", 4: "已飛", 5: "延誤", 6: "延誤", 7: "取消", 8: "提早"}


def fly_get(url, data=None, ua="Mozilla/5.0 (vps-sentinel)", timeout=10):
    hd = {"User-Agent": ua}
    if data is not None:
        data = json.dumps(data).encode()
        hd["Content-Type"] = "application/json"
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=hd), timeout=timeout) as r:
        return r.read()


# 飛機照片：planespotters.net 的公開介面（不用註冊；要寫攝影者、連回照片頁）；照註冊號查，主機記 14 天（查不到的也記，3 天後再查）
FLY_PHOTO_URL = os.environ.get("SENTINEL_FLY_PHOTO") or "https://api.planespotters.net/pub/photos/{by}/{key}"
FLY_PHOTO_FILE = os.path.join(DATA_DIR, "fly-photos.json")
FLY_PHOTOS = {"d": None, "lock": threading.Lock()}


def fly_photo(reg, hx=""):
    """回傳 {"src", "big", "link", "by"}；查不到回 {}"""
    reg = str(reg or "").upper().strip()
    hx = str(hx or "").lower().strip()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{1,9}", reg):
        reg = ""
    if not re.fullmatch(r"[0-9a-f]{6}", hx):
        hx = ""
    if not reg and not hx:
        return {}
    k = reg or "~" + hx
    with FLY_PHOTOS["lock"]:
        if FLY_PHOTOS["d"] is None:
            try:
                with open(FLY_PHOTO_FILE, encoding="utf-8") as f:
                    FLY_PHOTOS["d"] = json.load(f)
            except (OSError, ValueError):
                FLY_PHOTOS["d"] = {}
        hit = FLY_PHOTOS["d"].get(k)
    if hit and time.time() - hit.get("at", 0) < (14 if hit.get("src") else 3) * 86400:
        return {x: hit[x] for x in ("src", "big", "link", "by") if hit.get(x)}
    out = {}
    try:
        d = json.loads(fly_get(FLY_PHOTO_URL.replace("{by}", "reg" if reg else "hex").replace("{key}", urllib.parse.quote(reg or hx)), timeout=8))
        ph = (d.get("photos") or [None])[0] if isinstance(d, dict) else None
        if isinstance(ph, dict):
            src = str((ph.get("thumbnail") or {}).get("src") or "")
            big = str((ph.get("thumbnail_large") or {}).get("src") or "")
            link = str(ph.get("link") or "")
            if src.startswith("https://") and link.startswith("https://"):
                out = {"src": src, "big": big if big.startswith("https://") else src, "link": link, "by": str(ph.get("photographer") or "")[:60]}
    except (OSError, ValueError, AttributeError):
        if hit:                                   # 連不上：先用舊的
            return {x: hit[x] for x in ("src", "big", "link", "by") if hit.get(x)}
        return {}
    with FLY_PHOTOS["lock"]:
        d = FLY_PHOTOS["d"]
        d[k] = {"at": time.time(), **out}
        if len(d) > 3000:                         # 太多就丟掉最舊的
            for x in sorted(d, key=lambda x: d[x].get("at", 0))[:len(d) - 2500]:
                d.pop(x)
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(FLY_PHOTO_FILE + ".tmp", "w", encoding="utf-8") as f:
                json.dump(d, f)
            os.replace(FLY_PHOTO_FILE + ".tmp", FLY_PHOTO_FILE)
        except OSError:
            pass
    return out


# 機場天氣（METAR，美國航空氣象中心，不用註冊）：背景抓，10 分鐘一次
FLY_ICAO = {"TPE": "RCTP", "TSA": "RCSS", "RMQ": "RCMQ", "KHH": "RCKH"}
FLY_WX = {}                                   # 機場代碼 → [抓的時間, 整理好的天氣, 正在抓]
FLY_METAR = os.environ.get("SENTINEL_FLY_METAR") or "https://aviationweather.gov/api/data/metar?ids={icao}&format=raw"


def fly_metar(raw):
    """整理 METAR：風向（度，-1 是不定）、風速／陣風（節）、能見度（公尺）、溫度"""
    s, out = " " + raw.strip() + " ", {"raw": raw.strip()}
    m = re.search(r" (\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS) ", s)
    if m:
        k = 1 if m[4] == "KT" else 1.944
        out["wd"], out["ws"] = -1 if m[1] == "VRB" else int(m[1]), round(int(m[2]) * k)
        if m[3]:
            out["wg"] = round(int(m[3]) * k)
    m = re.search(r" (\d{4}) ", s[s.find("KT ") if "KT " in s else 0:])
    if " CAVOK " in s or m:
        out["vis"] = 10000 if " CAVOK " in s else int(m[1])
    m = re.search(r" (M?\d{2})/(?:M?\d{2})? ", s)
    if m:
        out["tmp"] = -int(m[1][1:]) if m[1][0] == "M" else int(m[1])
    tk = re.findall(r" ([+-]?(?:VC)?[A-Z]{2,8})(?= )", s.split(" RMK ")[0].split(" NOSIG")[0])
    for k, v in (("TS", "雷雨"), ("SH", "陣雨"), ("RA", "下雨"), ("DZ", "毛毛雨"), ("FG", "起霧"), ("BR", "薄霧"), ("HZ", "霾")):
        if any(k in t and not t.startswith(("Q", "R", "NO", "CAV", "FEW", "SCT", "BKN", "OVC", "VC")) for t in tk[1:]):
            out["wx"] = v
            break
    return out


def fly_wx_pull(code):
    try:
        raw = fly_get(FLY_METAR.replace("{icao}", FLY_ICAO[code]), timeout=8).decode("utf-8", "replace").strip().splitlines()
        FLY_WX[code] = [time.time(), fly_metar(raw[0]) if raw else None, False]
    except Exception:
        FLY_WX[code] = [time.time() - 480, (FLY_WX.get(code) or [0, None])[1], False]   # 抓不到：2 分鐘後再試，舊的先留著


def fly_wx(code):
    if code not in FLY_ICAO:
        return None
    c = FLY_WX.get(code)
    if (not c or time.time() - c[0] > 600) and not (c and c[2]):
        FLY_WX[code] = [c[0] if c else 0, c[1] if c else None, True]
        threading.Thread(target=fly_wx_pull, args=(code,), daemon=True).start()
    c = FLY_WX[code]
    return c[1] if c[1] and time.time() - c[0] < 7200 else None   # 超過 2 小時的不給


# 機場、航空公司標誌：第一次跟官網／Google 抓，存在主機上（DATA_DIR/fly-logos），之後網頁直接跟主機拿，不會一張一張慢慢冒出來
FLY_APLG = {"TPE": "https://www.taoyuan-airport.com/assets/img/logo.svg", "TSA": "https://www.tsa.gov.tw/static/img/pavicon.png",
            "RMQ": "https://www.tca.gov.tw/assets/images/icon.ico", "KHH": "https://www.kia.gov.tw/images/apple-touch-icon.png"}
FLY_LOGO_MISS = {}                            # 抓不到的：一小時內不再問


def fly_ccs():
    """機場資料裡有的國家代碼（國旗只給這些）"""
    if not FLY_CC:
        FLY_CC.update(a[5] for a in fly_db().values() if re.fullmatch(r"[A-Z]{2}", a[5] or ""))
    return FLY_CC


FLY_CC = set()


def fly_logo_type(b):
    """看檔頭認圖片種類（只收圖片）"""
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if b[:4] == b"\x00\x00\x01\x00":
        return "image/x-icon"
    if b[:4] == b"GIF8":
        return "image/gif"
    if b"<svg" in b[:1024]:
        return "image/svg+xml"
    return ""


# 航空公司標誌：先問 Google，沒有的再問下一個；各家沒有這間公司時會給一張假圖，要認出來丟掉
FLY_LGSRC = [x for x in os.environ.get("SENTINEL_FLY_LGSRC", "").split() if x] or [
    "https://www.gstatic.com/flights/airline_logos/70px/{c}.png", "https://images.kiwi.com/airlines/128/{c}.png", "https://pics.avs.io/200/200/{c}.png",
    "https://www.flightaware.com/images/airline_logos/90p/{i}.png"]   # {i}：國際民航組織的三碼（順豐只有這家有）
FLY_LGFAKE = {}                               # 標誌庫 → 它的假圖（拿不存在的代碼問一次記下來）
FLY_LGFAKE0 = {"36bdb8b3212413fb100da318789d0e9fa716b0a5",    # Google 認得這家、但沒有標誌時給的灰色機尾（不認得的回 404，問不出來）
               "f95495733fa572408fb4ce898c7935d2ad33e15a"}    # Kiwi 的灰色小飛機
FLY_ALSEEN = set()                            # 看板上出現過的航空公司（標誌只抓這些，不讓人亂問）
FLY_LGOK = set()                              # 主機上有真的標誌的航空公司


def fly_lg_fake(src):
    if src not in FLY_LGFAKE:
        fakes, ok = set(), False
        for c in ("0Q", "Q0"):
            try:
                fakes.add(hashlib.sha1(fly_get(src.format(c=c, i="Q" + c), timeout=10)).hexdigest())
                ok = True
            except urllib.error.HTTPError:
                ok = True                     # 沒有就回錯誤：不用認假圖
            except Exception:  # noqa: BLE001
                pass
        if not ok:
            return None                       # 連不上：這次先不用這個標誌庫
        FLY_LGFAKE[src] = fakes | FLY_LGFAKE0
    return FLY_LGFAKE[src]


def fly_lg_get(code):
    """一個一個標誌庫問，第一張真的標誌就用"""
    for src in FLY_LGSRC:
        i = next((k for k, v in FLY_AL.items() if v[0] == code and k[:1] != "-"), "")
        if "{i}" in src and not i:
            continue
        fakes = fly_lg_fake(src)
        if fakes is None:
            continue
        try:
            b = fly_get(src.format(c=code, i=i), timeout=10)
        except Exception:  # noqa: BLE001
            continue
        if fly_logo_type(b) and len(b) <= 512 * 1024 and hashlib.sha1(b).hexdigest() not in fakes:
            return b
    raise ValueError("沒有標誌")


def fly_logo(key):
    """回傳 (圖片, 種類)；只給認得的機場（FLY_APLG）、國旗和看板上出現過的航空公司，30 天重抓一次"""
    url = FLY_APLG.get(key, "")
    if key[:1] == "@" and key[1:] in fly_ccs():                # 國旗（@JP）
        url = f"https://flagcdn.com/w80/{key[1:].lower()}.png"
    al = not url and re.fullmatch(r"[A-Z0-9]{2}", key) and (key in FLY_ALS or key in FLY_ALSEEN)
    if not url and not al:
        return None
    url = os.environ.get("SENTINEL_FLY_LOGO", "").replace("{key}", key) or url
    fn = os.path.join(DATA_DIR, "fly-logos", key.replace("@", "flag-"))
    old = None
    try:
        with open(fn, "rb") as f:
            old = f.read()
        if al:
            FLY_LGOK.add(key)
        if time.time() - os.path.getmtime(fn) < 30 * 86400:
            return old, fly_logo_type(old)
    except OSError:
        pass
    if FLY_LOGO_MISS.get(key, 0) > time.time():
        return (old, fly_logo_type(old)) if old else None
    try:
        b = fly_get(url, timeout=10) if url else fly_lg_get(key)
        if len(b) > 512 * 1024 or not fly_logo_type(b):
            raise ValueError("不是圖片")
        os.makedirs(os.path.dirname(fn), exist_ok=True)
        with open(fn + ".tmp", "wb") as f:
            f.write(b)
        os.replace(fn + ".tmp", fn)
        if al:
            FLY_LGOK.add(key)
        return b, fly_logo_type(b)
    except Exception:  # noqa: BLE001
        FLY_LOGO_MISS[key] = time.time() + (86400 if al else 3600)
        return (old, fly_logo_type(old)) if old else None


def fly_logo_new(rows):
    """看板上第一次出現的航空公司：背景去抓標誌，下次更新網頁就看得到"""
    new = {m[1] for p in rows if (m := re.match(r"([A-Z0-9]{2})\d", p.get("fn") or "")) and re.search(r"[A-Z]", m[1])} - FLY_ALSEEN
    if new:
        FLY_ALSEEN.update(new)
        threading.Thread(target=lambda: [fly_logo(c) for c in sorted(new)], daemon=True).start()


def fly_logo_warm():
    """背景先把標誌都抓好存著（打開看板就是現成的）"""
    d = os.path.join(DATA_DIR, "fly-logos")
    fakes = set().union(*[fly_lg_fake(x) or set() for x in FLY_LGSRC])
    try:
        for k in os.listdir(d):
            if re.fullmatch(r"[A-Z0-9]{2}", k):
                with open(os.path.join(d, k), "rb") as f:
                    if hashlib.sha1(f.read()).hexdigest() in fakes | FLY_LGFAKE0:   # 以前存到的假圖：丟掉重抓
                        os.remove(os.path.join(d, k))
                        continue
                FLY_LGOK.add(k)
    except OSError:
        pass
    for k in [*FLY_APLG, *FLY_ALS]:
        fly_logo(k)
        time.sleep(0.2)


def fly_ts(day, hm):
    """「2026/10/25」「07:10」這類時間 → 時間戳（台灣時間）"""
    hm = str(hm or "").strip().replace(":", "")[:4]
    if not re.fullmatch(r"\d{4}", hm):
        return None
    try:
        d = date.fromisoformat(str(day).replace("/", "-")[:10]) if day else datetime.now(FLY_TW).date()
        return datetime(d.year, d.month, d.day, int(hm[:2]) % 24, int(hm[2:]) % 60, tzinfo=FLY_TW).timestamp()
    except ValueError:                        # 「0000-00-00」這種空的日期
        return None


FLY_ZH_ALIAS = {"馬公": "MZG", "南竿": "LZN", "北竿": "MFK", "台北松山": "TSA", "松山": "TSA", "台北桃園": "TPE", "小港": "KHH",
                "金邊": "KTI", "暹粒": "SAI", "長灘島": "KLO", "沖繩": "OKA", "那霸": "OKA", "宮古島": "SHI"}   # 官網常用的其他叫法


def fly_zh_code(name):
    """官網只給中文地名（例如「沖繩」「仁川」）時，找出機場代碼"""
    name = re.sub(r"[A-Z]{3}$", "", str(name or "").strip())
    if not name:
        return ""
    if name in FLY_ZH_ALIAS:
        return FLY_ZH_ALIAS[name]
    for a in [*FLY_APS, *((c, *v) for c, v in FLY_ZH.items())]:
        if name in (a[2], a[1], a[1].replace("機場", "")) or a[2].startswith(name):
            return a[0]
    return next((c for c, v in FLY["zh"].items() if v == name), "")


def fly_al_zh(iata):
    for v in FLY_AL.values():
        if v[0] == iata:
            return v[1]
    return iata


def fly_st(st):
    """官網的狀態文字只留中文、統一說法"""
    st = re.sub(r"[A-Za-z ]+", "", str(st or "")).strip()
    return {"延遲": "延誤", "抵達": "已到", "離站": "已飛", "出發": "已飛", "登機中": "登機", "備降": "轉降", "改降": "轉降", "延遲登機": "延誤", "時間更改": "改時間"}.get(st, st)


def fly_bx(arr, belt, desk):
    """抵達寫行李轉盤、出發寫報到櫃台（官網有給才有）"""
    v = str((belt if arr else desk) or "").strip().lstrip("0")
    return f"{'轉盤' if arr else '櫃台'} {v}" if v and v not in ("-", "0") else ""


def fly_fids_tpe():
    out = []
    for line in fly_get(FLY_FIDS_URL["TPE"], ua="Mozilla/5.0", timeout=15).decode("big5hkscs", "replace").splitlines():   # 帶自己名字的有時候拿到空的
        x = [c.strip() for c in line.split(",")]
        if len(x) < 15 or x[1] not in ("A", "D"):
            continue
        x[12] = re.sub(r"\s*[(（]\s*[A-Z]{3}\s*[)）]\s*$", "", x[12])   # 「杜拜(DXB)」：代碼前面已經有了
        fly_learn(x[10], x[12])
        out.append({"io": "arr" if x[1] == "A" else "dep", "fn": x[2] + x[4].lstrip("0"), "al": x[3], "sch": fly_ts(x[6], x[7]),
                    "est": fly_ts(x[8], x[9]), "pc": x[10], "pl": x[12] or fly_city(x[10]) or x[11], "gate": x[5], "term": f"第{'一二三'[int(x[0]) - 1]}航廈" if x[0] in ("1", "2", "3") else "",
                    "st": fly_st(x[13]), "type": x[14], "bx": fly_bx(x[1] == "A", x[18] if len(x) > 18 else "", x[19] if len(x) > 19 else "")})
    return out


def fly_fids_khh():
    out = []
    for io, f, st in (("arr", "arr.json", KHH_ARR), ("dep", "dep.json", KHH_DEP)):
        for r in json.loads(fly_get(FLY_FIDS_URL["KHH"] + f).decode("utf-8-sig")):
            if not isinstance(r, dict):
                continue
            k = "A" if io == "arr" else "D"
            sch = str(r.get("ST" + k) or "")
            est = str((r.get("arrtime") if io == "arr" else r.get("deptime")) or r.get("AT" + k) or "")
            pc = str(r.get("DepartureAirportIATA" if io == "arr" else "ArrivalAirportIATA") or "")
            out.append({"io": io, "fn": str(r.get("airLineNum") or ""), "al": fly_al_zh(str(r.get("airLineIATA") or "")),
                        "sch": fly_ts(sch[:10], sch[11:16]), "est": fly_ts(est[:10], est[11:16]) if est else None, "pc": pc,
                        "pl": fly_city(pc) or (fly_db().get(pc) or [0, 0, pc])[2], "gate": "", "term": "",
                        "bx": fly_bx(io == "arr", r.get("BHSNo"), r.get("ckinisland") or (f"{r.get('ckindeskstart')}–{r.get('ckindeskend')}" if r.get("ckindeskstart") else "")),
                        "st": st.get(int(r.get("status" + io) or 0), ""), "type": FLY_IATA_T.get(str(r.get("airPlaneType") or ""), str(r.get("airPlaneType") or "")),
                        "share": [c.strip() for c in str(r.get("CodeShare") or "").split(";") if c.strip()]})
    return out


def fly_fids_rmq():
    out, got = [], {}

    def one(n):
        try:
            got[n] = fly_get(FLY_FIDS_URL["RMQ"] + str(n), timeout=60)
        except Exception as e:  # noqa: BLE001
            got[n] = e
    ths = [threading.Thread(target=one, args=(n,), daemon=True) for n in (1, 2)]      # 台中官網很慢：出發、抵達同時抓
    [t.start() for t in ths]
    [t.join(70) for t in ths]
    for io, n in (("dep", 1), ("arr", 2)):
        b = got.get(n)
        if not isinstance(b, bytes):
            raise b or TimeoutError("逾時")
        for r in json.loads(b.decode("utf-8-sig")).get("data") or []:
            pl = str(r.get("opponentPort") or "").strip()
            out.append({"io": io, "fn": str(r.get("AirLineIATA") or "").strip() + str(r.get("airLineNum") or "").strip(),
                        "al": re.sub(r"<[^>]+>", "", str(r.get("mainAirlineHtml") or "")).strip(), "sch": fly_ts(None, r.get("scheduleTime")),
                        "est": fly_ts(None, r.get("actualTime")), "pc": fly_zh_code(pl), "pl": pl, "gate": str(r.get("airBoardingGate") or ""),
                        "term": "", "st": fly_st(r.get("airFlyStatus")), "type": "",
                        "share": [re.sub(r"\s+", "", x) for x in re.findall(r"<div>([^<]+)</div>", str(r.get("codeShareFlightHtml") or ""))]})
    return out


def fly_fids_tsa():
    out = []
    for io, n in (("dep", 1), ("arr", 2)):
        for line in (1, 2):
            body = {"AirFlyLine": line, "AirFlyIO": n, "Limit": 999, "Culture": 1, "FlightNumber": None, "AirLineCode": None,
                    "AirportCode": None, "Sort": "ExpectDepartureTime" if n == 1 else "ExpectArrivalTime", "Order": "asc"}
            for r in json.loads(fly_get(FLY_FIDS_URL["TSA"], body).decode("utf-8-sig")).get("rows") or []:
                k = "Departure" if io == "dep" else "Arrival"
                pl = str(r.get("GoalAirportName" if io == "dep" else "UpAirportName") or "")
                m = re.match(r"(.*?)([A-Z]{3})$", pl)
                if m:
                    fly_learn(m.group(2), m.group(1))
                out.append({"io": io, "fn": str(r.get("FlightNumber") or "").strip(), "al": re.sub(r"(公司|股份有限公司)$", "", str(r.get("AirLineName") or "")),
                            "sch": fly_ts(None, r.get("Expect" + k + "Time")), "est": fly_ts(None, r.get("Real" + k + "Time")),
                            "pc": m.group(2) if m else "", "pl": m.group(1) if m else pl, "gate": "", "term": "",
                            "st": fly_st(r.get("AirFlyStatus")), "type": str(r.get("AirPlaneType") or ""), "bx": fly_bx(io == "arr", "", r.get("CheckInCount"))})
    return out


FLY_FIDS_GET = {"TPE": fly_fids_tpe, "KHH": fly_fids_khh, "RMQ": fly_fids_rmq, "TSA": fly_fids_tsa}


def fly_gate_track(code, rows, now=None):
    """記住每班的登機門、機型：被改了（A5 → D3、A321 → A350）就在這班加上原本的 gate0、type0；改回原本的不算"""
    now, mem = now or time.time(), FLY["gate"]
    for r in rows:
        k = f"{code}:{r['io']}:{fly_fn(r['fn'])}:{int(r['sch'])}"
        m = mem.setdefault(k, {"t": r["sch"]})
        for f, ok in (("gate", bool), ("type", fly_fam)):
            v = r.get(f) or ""
            if not ok(v):                              # 暫時沒寫：不算改
                continue
            was = m.get(f)
            if was is None:
                m[f] = v
            elif (was != v) if f == "gate" else (fly_fam(was) != fly_fam(v)):
                m[f], m[f + "0"] = v, m.get(f + "0") or was
                if (m[f + "0"] == v) if f == "gate" else (fly_fam(m[f + "0"]) == fly_fam(v)):
                    m.pop(f + "0")
            else:
                m[f] = v
            if m.get(f + "0"):
                r[f + "0"] = m[f + "0"]
    if len(mem) > 3000:
        for k, m in list(mem.items()):
            if m.get("t", 0) < now - 12 * 3600:
                mem.pop(k, None)


def fly_fids_pull(code, hit):
    try:
        keep = {}
        got = FLY_FIDS_GET[code]()
        if not got:
            raise ValueError("拿到空的航班表")      # 不要把上一次好好的表蓋掉
        for r in got:
            if not r["fn"] or not r["sch"]:
                continue
            r["type"] = fly_model(r["type"])
            al = fly_al_zh(r["fn"][:2])
            if al != r["fn"][:2]:                       # 航空公司名稱照同一張表（官網有的寫「韓商泰瑞航空」，雷達寫「德威航空」）
                r["al"] = al
            if r.get("pc") == "MYJ":                    # 日本的松山（愛媛）：官網寫「松山」會跟台北松山搞混
                r["pl"] = "愛媛"
            while r.get("est") and r["est"] < r["sch"] - 12 * 3600:   # 跨過半夜：官網的預計日期沒跟著換（或沒給日期），補一天
                r["est"] += 86400
            k = (r["io"], r["sch"], r["pc"] or r["pl"], r.get("gate") or "", r.get("term") or "")   # 同時間同地點的兩家公司（例如長榮、樂桃都 16:05 從成田來）登機門不同，不能當成同一班
            if k in keep and keep[k]["type"] and r["type"] and keep[k]["type"] != r["type"]:
                k += (r["fn"],)                          # 機型不同：一定是兩班飛機
            if k in keep:                              # 同一班飛機掛好幾個航班號
                keep[k].setdefault("share", []).append(r["fn"])
                keep[k]["type"] = keep[k]["type"] or r["type"]
            else:
                keep[k] = r
        hit["rows"], hit["ok"] = list(keep.values()), time.time()
        fly_gate_track(code, hit["rows"])
        try:                                           # 存一份：重新啟動（更新）後不用再等官網
            os.makedirs(os.path.join(DATA_DIR, "fids"), exist_ok=True)
            with open(os.path.join(DATA_DIR, "fids", code + ".json"), "w", encoding="utf-8") as f:
                json.dump(hit["rows"], f, ensure_ascii=False)
        except OSError:
            pass
    except Exception as e:  # noqa: BLE001
        fly_log(f"{FLY_FIDS_NAME[code][0]}官網：{str(e)[:60]}")
    finally:
        hit["busy"], hit["done"] = False, True


FLY_FIDS_KEEP = {"RMQ": 3 * 3600}                    # 台中官網常常好一陣子連不上：上次抓到的表用久一點，總比只剩幾架好


def fly_fids(code, wait=1.5):
    """官網航班表：1 分鐘更新一次（在背景抓，看板不用等）；抓不到就先用上一次的，15 分鐘內都算數（台中 3 小時）。
    第一次還沒抓完回傳 "wait"：網頁先轉圈圈，不要先秀幾架收得到訊號的、過幾秒又冒出一大堆"""
    if code not in FLY_FIDS_GET:
        return None
    if code == "TPE":
        fly_sched_check()
    hit = FLY_FIDS.get(code)
    now = time.time()
    if hit is None:
        hit = FLY_FIDS[code] = {"ok": 0, "try": 0, "rows": [], "busy": False, "done": False}
        fn = os.path.join(DATA_DIR, "fids", code + ".json")
        try:                                           # 上次存的還新（15 分鐘內）：先拿來用，背景再更新
            if now - os.path.getmtime(fn) < FLY_FIDS_KEEP.get(code, 900):
                with open(fn, encoding="utf-8") as f:
                    hit.update(rows=json.load(f), ok=os.path.getmtime(fn), done=True)
        except (OSError, ValueError):
            pass
    if not hit["busy"] and now - hit["try"] >= (FLY_FIDS_EVERY if hit["ok"] >= hit["try"] else 20):    # 上次失敗的話 20 秒後再試
        hit["try"], hit["busy"] = now, True
        th = threading.Thread(target=fly_fids_pull, args=(code, hit), daemon=True)
        th.start()
        if not hit["done"] and wait:
            th.join(wait)                              # 通常一下子就好，順便等一下
    if not hit["done"]:
        return "wait"
    return hit["rows"] if time.time() - hit["ok"] < FLY_FIDS_KEEP.get(code, 900) else None


def fly_log(msg):
    """航班資料出錯記一筆（同樣的錯 30 分鐘記一次就好）"""
    if FLY["logged"].get(msg, 0) < time.time() - 1800:
        FLY["logged"][msg] = time.time()
        log(f"機場起降：{msg}")


def fly_place(a):
    code = str(a.get("iata") or a.get("iata_code") or a.get("icao") or a.get("icao_code") or "")[:4].upper()
    return {"code": code, "name": fly_city(code) or str(a.get("location") or a.get("municipality") or a.get("name") or "")[:24]}


def fly_city(code):
    """機場代碼 → 中文城市名（常用表、官網航班表學到的）；都沒有就回空字串"""
    if code in FLY_ZH:
        return FLY_ZH[code][1]
    for a in FLY_APS:
        if a[0] == code:
            return a[2]
    return FLY["zh"].get(code, "") or (fly_db().get(code) or ("",) * 9)[8]


def fly_learn(code, name):
    """官網航班表上有代碼又有中文名稱：記下來，高雄官網、航線查詢只給代碼時就用得到"""
    if re.fullmatch(r"[A-Z]{3}", code or "") and re.search(r"[\u4e00-\u9fff]", name or "") and FLY["zh"].get(code) != name:
        FLY["zh"][code] = name[:12]


def fly_adsbdb(cs):
    """adsb.lol 查不到的航線，再問 adsbdb（一班一班問）"""
    try:
        req = urllib.request.Request(FLY_ROUTE2 + urllib.parse.quote(cs), headers={"User-Agent": "vps-sentinel"})
        with urllib.request.urlopen(req, timeout=6) as r:
            fr = (json.loads(r.read()).get("response") or {}).get("flightroute") or {}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None, True                 # 這班沒有資料
        return None, f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:60] or type(e).__name__
    o, d = fr.get("origin"), fr.get("destination")
    return ([fly_place(o), fly_place(d)] if isinstance(o, dict) and isinstance(d, dict) else None), True


FLY_RTP = {"until": 0.0, "gap": 60}                  # adsbdb 被擋時先停多久


def fly_routes():
    """在背景查航線（從哪裡飛到哪裡）；查到的記 6 小時，查不到的 30 分鐘後再試，沒問成功的 5 分鐘後再試"""
    while True:
        with FLY["lock"]:
            todo = list(FLY["rq"])[:40]
            FLY["rq"].difference_update(todo)
            if not todo:
                FLY["rbusy"] = False
                return
        now = time.time()
        got = {}
        try:
            body = json.dumps({"planes": [{"callsign": c, "lat": la, "lng": lo} for c, la, lo in todo]}).encode()
            req = urllib.request.Request(FLY_ROUTE, data=body, headers={"Content-Type": "application/json", "User-Agent": "vps-sentinel"})
            with urllib.request.urlopen(req, timeout=10) as r:
                for x in json.loads(r.read()) or []:
                    cs = str(x.get("callsign") or "").strip().upper()
                    aps = x.get("_airports") or []
                    if cs and len(aps) >= 2 and x.get("plausible", 1) not in (0, False, "0"):
                        got[cs] = [fly_place(a) for a in (aps[0], aps[-1])]
        except Exception as e:  # noqa: BLE001
            fly_log(f"adsb.lol 航線：{str(e)[:60]}")
        ask = [c for c, _, _ in todo if c not in got]
        bad, wait = "", time.time() < FLY_RTP["until"]
        if ask and not wait:
            with ThreadPoolExecutor(3) as ex:          # 一班一班問，三個一起問比較快
                for c, (rt, ok) in zip(ask, ex.map(fly_adsbdb, ask)):
                    if rt:
                        got[c] = rt
                    if ok is not True:
                        bad = bad or ok
            if bad:                                    # 被擋或連不上：先停一下（越停越久），沒問到的過幾分鐘再問，不要記成查不到
                FLY_RTP["until"], FLY_RTP["gap"] = time.time() + FLY_RTP["gap"], min(FLY_RTP["gap"] * 2, 900)
                fly_log(f"adsbdb 航線：{bad}")
            else:
                FLY_RTP["gap"] = 60
        for c, _, _ in todo:
            FLY["routes"][c] = (now, got[c]) if c in got else (now - 1500 if bad or wait else now, None)   # 沒問成功的 5 分鐘後再試
        if len(FLY["routes"]) > 3000:            # 過期的航線丟掉，不然開久了會越存越多
            for c, v in list(FLY["routes"].items()):
                if now - v[0] > 6 * 3600:
                    FLY["routes"].pop(c, None)


def fly_hex_fill(ac):
    """收到的飛機沒有註冊號或機型：用之前查過的補上，沒查過的排進背景去查"""
    now, want = time.time(), []
    for a in ac:
        if not isinstance(a, dict) or (a.get("r") and a.get("t")):
            continue
        h = str(a.get("hex") or "").lower().lstrip("~")
        if not re.fullmatch(r"[0-9a-f]{6}", h):
            continue
        k = FLY["hex"].get(h)
        if k and (k.get("r") or k.get("t")):
            a["r"], a["t"] = a.get("r") or k.get("r") or "", a.get("t") or k.get("t") or ""
        elif not k or now - k.get("at", 0) > 7 * 86400:      # 查不到的，一週後再試
            want.append(h)
    if want:
        with FLY["lock"]:
            FLY["hq"].update(want)
            if FLY["hbusy"]:
                return
            FLY["hbusy"] = True
        threading.Thread(target=fly_hexes, daemon=True).start()


def fly_tdb_part(name):
    """資料庫的一個分檔（gzip 壓縮的 JSON）：主機上存的一週內就直接用"""
    hit = FLY_TDBS.get(name)
    if hit and time.time() - hit[0] < 7 * 86400:
        return hit[1]
    fn = os.path.join(FLY_TDB_DIR, name + ".js")
    try:
        if time.time() - os.path.getmtime(fn) < 7 * 86400:
            with open(fn, "rb") as f:
                d = json.loads(gzip.decompress(f.read()))
            FLY_TDBS[name] = (os.path.getmtime(fn), d)
            return d
    except (OSError, ValueError, EOFError):
        pass
    req = urllib.request.Request(FLY_TDB + name + ".js", headers={"User-Agent": "vps-sentinel"})
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read(8 << 20)
    d = json.loads(gzip.decompress(raw))
    if not isinstance(d, dict):
        raise ValueError("格式不對")
    try:
        os.makedirs(FLY_TDB_DIR, exist_ok=True)
        with open(fn + ".tmp", "wb") as f:
            f.write(raw)
        os.replace(fn + ".tmp", fn)
    except OSError:
        pass
    FLY_TDBS[name] = (time.time(), d)
    return d


def fly_tdb(h):
    """飛機編號 → (註冊號, 機型)；資料庫裡沒有回 None"""
    h, name = h.upper(), h[:1].upper()
    while True:
        d = fly_tdb_part(name)
        nxt = h[:len(name) + 1]
        if nxt in (d.get("children") or []) and len(nxt) < len(h):
            name = nxt
            continue
        x = d.get(h[len(name):])
        return (str(x[0] or "")[:12].upper(), str(x[1] or "")[:4].upper()) if isinstance(x, list) and len(x) >= 2 else None


def fly_hexes():
    """在背景查飛機編號；連不上就先停"""
    bad = 0
    while bad < 3:
        with FLY["lock"]:
            h = FLY["hq"].pop() if FLY["hq"] else ""
            if not h:
                break
        try:
            x = fly_tdb(h)
            FLY["hex"][h] = {"at": time.time(), "r": x[0], "t": x[1]} if x else {"at": time.time()}   # 沒有的也記住，一週後再查
            bad = 0
        except Exception as e:  # noqa: BLE001
            bad += 1
            fly_log(f"飛機資料庫：{str(e)[:60]}")
            time.sleep(2)
    with FLY["lock"]:
        if bad >= 3:
            FLY["hq"].clear()
        FLY["hbusy"] = False
    if len(FLY["hex"]) > 20000:
        for k in sorted(FLY["hex"], key=lambda k: FLY["hex"][k].get("at", 0))[:5000]:
            FLY["hex"].pop(k, None)


def fly_route(cs, lat, lon):
    if not re.fullmatch(r"[A-Z]{3}\d[A-Z0-9]{0,4}", cs):
        return None                       # 私人飛機、註冊號當呼號的查不到
    hit = FLY["routes"].get(cs)
    if hit and time.time() - hit[0] < (6 * 3600 if hit[1] else 1800):
        return hit[1]
    with FLY["lock"]:
        FLY["rq"].add((cs, lat, lon))
        if not FLY["rbusy"]:
            FLY["rbusy"] = True
            threading.Thread(target=fly_routes, daemon=True).start()
    return hit[1] if hit else None


def fly_nearby(ap):
    """附近 100 公里內的其他機場（只算一次）"""
    hit = FLY_NEAR.get(ap[0])
    if hit is None:
        hit = FLY_NEAR[ap[0]] = [(x[0], x[3], x[4]) for x in fly_db().values()
                                 if x[0] != ap[0] and abs(x[3] - ap[3]) < 1 and fly_dist(ap[3], ap[4], x[3], x[4])[0] < 100]
    return hit


def fly_closest(ap, lat, lon, trk=None, way=0):
    """飛機是哪個機場的：way=1 找前方最近的（要降落），-1 找後方最近的（剛起飛），0 就是最近的"""
    best, bd = None, 1e9
    for c, la, lo in [(ap[0], ap[3], ap[4])] + fly_nearby(ap):
        d, b = fly_dist(la, lo, lat, lon)
        if way and trk is not None and abs((float(trk) - (b + (180 if way > 0 else 0)) % 360 + 540) % 360 - 180) >= 60:
            continue
        if d < bd:
            best, bd = c, d
    return best


FLY_HOLD = (8 * 60, 300)                        # 8 分鐘內同一個方向轉了 300 度以上：在盤旋


def fly_hold(hx, trk, now=None):
    """記下每架飛機的航向，算最近幾分鐘轉了幾圈；在盤旋就回傳 True（剛轉完再留 3 分鐘，不會一下有一下沒有）"""
    if not hx or trk is None:
        return False
    now = now or time.time()
    win, need = FLY_HOLD
    with FLY["lock"]:
        h = FLY["turn"].setdefault(hx, {"s": [], "on": 0})
        s = h["s"]
        if s and now - s[-1][0] > 120:          # 中間斷太久，轉幾度算不出來：重新記
            s.clear()
        if not s or now - s[-1][0] >= 5:
            s.append((now, float(trk)))
        while s and now - s[0][0] > win:
            s.pop(0)
        turn = sum(((b[1] - a[1] + 180) % 360) - 180 for a, b in zip(s, s[1:]))
        if abs(turn) >= need:
            h["on"] = now
        if len(FLY["turn"]) > 3000:
            for k in [k for k, v in FLY["turn"].items() if not v["s"] or now - v["s"][-1][0] > 600]:
                FLY["turn"].pop(k, None)
        return bool(h["on"]) and now - h["on"] < 180


def fly_plane(a, ap):
    """一架飛機：整理成看板一列；判斷是要降落、剛起飛、在地面還是路過"""
    try:
        lat, lon = float(a["lat"]), float(a["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    if float(a.get("seen_pos", a.get("seen", 0)) or 0) > 60:
        return None
    code = ap[0]
    gnd = a.get("alt_baro") == "ground"
    alt = 0 if gnd else a.get("alt_baro", a.get("alt_geom"))
    if not isinstance(alt, (int, float)):
        return None
    gs = float(a.get("gs") or 0)
    vr = a.get("baro_rate", a.get("geom_rate")) or 0
    trk = a.get("track", a.get("true_heading"))
    d, brg = fly_dist(ap[3], ap[4], lat, lon)
    cs = str(a.get("flight") or "").strip().upper()
    t = str(a.get("t") or "").upper()
    reg = str(a.get("r") or "").upper()
    al = FLY_AL.get(cs[:3]) if re.match(r"[A-Z]{3}\d", cs) else None
    fn = fly_fn(al[0] + cs[3:]) if al else cs
    rt = (fly_route(cs, lat, lon) if cs else None) or fly_fids_route(fn)
    org, dst = (rt[0]["code"], rt[1]["code"]) if rt else ("", "")
    toward = trk is not None and abs((float(trk) - (brg + 180) % 360 + 540) % 360 - 180) < 60
    # 離機場不遠、正在下降靠近／爬升離開：照飛的樣子判斷，查到的航線可能是別的航段（同一個班號飛好幾段很常見）
    near = {c for c, _, _ in fly_nearby(ap)}           # 查到的航線是附近別的機場（例如在松山看到要降落桃園的）：照航線
    land = not gnd and vr < -300 and dst not in near and (
        (alt < 15000 and d < 60 and toward and fly_closest(ap, lat, lon, trk, 1) == code)
        or (alt < 6500 and d < 25 and fly_closest(ap, lat, lon) == code))     # 很低很近、在繞圈排隊或順風邊：機頭不一定對著機場
    lift = not gnd and alt < 15000 and d < 60 and vr > 300 and not toward and org not in near and fly_closest(ap, lat, lon, trk, -1) == code
    me = {"code": code, "name": fly_city(code) or ap[2]}
    if land and rt and dst != code:                    # 例如查到「達拉斯 → 安克拉治」，其實是安克拉治飛來的下一段
        rt, dst = [{**rt[1], "guess": True} if org != code else None, me], code
    elif lift and rt and org != code:
        rt, org = [me, None], code                   # 下一站猜不到
    if gnd or (alt < 400 and gs < 60):
        if d > 6 or not (cs or reg) or fly_closest(ap, lat, lon) != code:
            return None                       # 太遠、別的機場的，或沒名字的停機
        ph = "gnd"
        if rt and code not in (org, dst):     # 停在這裡，查到的航線卻兩頭都不是這裡（多段航線的別段）：寧可寫不知道
            rt = None
    elif land or (dst == code and org != code):
        ph = "arr"
    elif lift or (org == code and dst != code):
        ph = "dep"
    elif rt and org and dst:
        ph = "over"                           # 查得到航線、又不是這個機場的
    elif alt < 14000 and vr < -250 and toward:
        ph = "arr" if fly_closest(ap, lat, lon, trk, 1) == code else "over"
    elif alt < 14000 and vr > 250 and not toward:
        ph = "dep" if fly_closest(ap, lat, lon, trk, -1) == code else "over"
    elif alt < 5000 and d < 20 and fly_closest(ap, lat, lon) == code:
        ph = "arr" if toward else "dep"
    else:
        ph = "over"
    if not rt and ph in ("arr", "dep") and d < 30 and alt < 10000:     # 查不到航線：很確定在這裡落地／剛從這裡起飛的，先寫這一頭
        me, far = {"code": code, "name": fly_city(code) or ap[2], "guess": True}, None
        rt = [far, me] if ph == "arr" else [me, far]
    hold = ph != "gnd" and d < 80 and fly_hold(str(a.get("hex") or "").lower(), trk)
    if hold and ph == "over" and not (rt and rt[0] and rt[1]) and alt < 20000 and fly_closest(ap, lat, lon) == code:
        ph = "arr"                            # 查不到航線、在這個機場附近繞圈：多半是在等降落
    eta = round(d / (gs * 1.852) * 60) if ph == "arr" and gs > 50 and not hold else None
    if hold:
        st = "盤旋等待" if ph == "arr" else "盤旋中"
    elif ph == "arr":
        st = "即將降落" if alt < 2000 and d < 10 else "進場中"           # 幾點降落看時間那欄
    elif ph == "dep":
        st = "剛起飛" if d < 12 else "爬升中" if vr > 250 else "離開中"
    elif ph == "gnd":
        st = "在跑道上" if gs > 40 else "滑行中" if gs >= 5 else "停在機坪"
    else:
        st = "路過"
    sq = str(a.get("squawk") or "")
    emg = {"7700": "緊急狀況", "7600": "通訊故障", "7500": "劫機"}.get(sq) or (
        "緊急狀況" if str(a.get("emergency") or "none") not in ("none", "") else "")
    mil = bool(int(a.get("dbFlags") or 0) & 1)
    op = str(a.get("ownOp") or "")
    return {
        "id": str(a.get("hex") or "")[:8], "cs": cs, "fn": fn, "al": al[1] if al else str(a.get("ownOp") or "")[:24],
        "reg": reg, "t": t, "model": FLY_TYPES.get(t) or fly_model(fly_cut(str(a.get("desc") or t).title(), 32)),
        "org": rt[0] if rt else None, "dst": rt[1] if rt else None,
        "alt": round(alt * 0.3048), "spd": round(gs * 1.852), "vr": round(float(vr) * 0.00508, 1),
        "d": round(d, 1), "eta": eta, "trk": round(float(trk)) if trk is not None else None,
        "x": round(d * math.sin(math.radians(brg)), 2), "y": round(d * math.cos(math.radians(brg)), 2),
        "ph": ph, "st": emg or st, "emg": bool(emg), "hold": hold, "sq": sq, "mil": mil, "rare": mil or fly_rare(t, ap[0]),
        "cat": str(a.get("category") or "")[:2], "use": fly_use(cs, al, t, a.get("category"), mil, op, fn),
    }


def fly_fids_find(fn):
    """在四個台灣機場的官網航班表找這班（共掛班號也算），回傳最接近現在的 (機場, 那一筆)"""
    if not fn:
        return None
    now, best, bd = time.time(), None, 4 * 3600
    for c in FLY_PIN:
        hit = FLY_FIDS.get(c) or {}
        rows = hit.get("rows") or []
        if hit.get("_ix") is None or hit["_ix"][0] is not rows:     # 表換過才重建索引
            ix = {}
            for r in rows:
                for f in [r.get("fn"), *(r.get("share") or [])]:
                    ix.setdefault(fly_fn(f), []).append(r)
            hit["_ix"] = (rows, ix)
        for r in hit["_ix"][1].get(fn, []):
            dt = abs((r.get("est") or r.get("sch") or 0) - now)
            if dt < bd:
                best, bd = (c, r), dt
    return best


def fly_fids_route(fn):
    """查不到航線的班機：去四個台灣機場的官網航班表找（例如在松山看到要飛桃園的那班）"""
    hit = fly_fids_find(fn)
    if not hit or not hit[1].get("pc"):
        return None
    c, r = hit
    me = {"code": c, "name": fly_city(c)}
    far = {"code": r["pc"], "name": fly_city(r["pc"]) or r.get("pl") or r["pc"]}
    return (far, me) if r.get("io") == "arr" else (me, far)


def fly_fn(fn):
    """班機號碼統一寫法：CI054 → CI54（呼號會補 0，官網表不會，不統一就對不起來）"""
    m = re.match(r"([A-Z0-9]{2})0*(\d+)([A-Z]?)$", fn or "")
    return m.group(1) + m.group(2) + m.group(3) if m else fn


FLY_FAM = {"A19N": "A31", "A20N": "A32", "A21N": "A32", "B37M": "B73", "B38M": "B73", "B39M": "B73", "B3XM": "B73"}


def fly_fam(m):
    """機型的大類（A32、B77…），用來比對兩邊說的是不是同一種飛機；看不出來回空字串"""
    m = re.sub(r"[^A-Z0-9]", "", str(m or "").upper())
    if m in FLY_FAM:
        return FLY_FAM[m]
    m = re.sub(r"^(7[0-8]7)", r"B\1", m)
    x = re.match(r"([AB])(3[0-8]|7[0-8])", m)
    if x:
        return x.group(1) + x.group(2)
    if m.startswith("AT"):
        return "ATR"
    return "X" + m[:3] if re.search(r"[A-Z]", m) and re.search(r"\d", m) else ""     # 其他機型（E190、DH8D…）：各自一類


def fly_fix_type(p, r):
    """飛機資料庫的機型跟機場官網排的不同（例如舊註冊號留著四發的 A340）：照官網，註冊號也不可信"""
    a, b = fly_fam(p.get("t") or p.get("model")), fly_fam(r.get("type"))
    if a and b and a != b:
        p.update(t="", model=r["type"], reg="")


def fly_merge(ap, fids, rows, io):
    """官網的航班表配上收得到訊號的飛機：表上有的顯示即時位置、幾分鐘後落地；表上沒有的（貨機、私人飛機）不列"""
    now = time.time()
    live = {}
    for p in rows:
        if p["fn"]:
            live.setdefault(fly_fn(p["fn"]), p)
    me, out, used = {"code": ap[0], "name": ap[2]}, [], set()
    other = "dep" if io == "arr" else "arr"

    def plane(r):
        """這一筆配得到的飛機（同一班號接著飛下一段時：正在降落的不算出發、正在起飛的不算抵達）"""
        p = next((live[fly_fn(f)] for f in [r["fn"], *(r.get("share") or [])] if fly_fn(f) in live), None)
        return None if p and p["ph"] == other else p

    show = []
    for r in fids:
        if r["io"] != io or fly_cargo(r["fn"]):
            continue
        t = r["est"] or r["sch"]
        done = r["st"] in ("已到", "已飛")
        if t > now + 12 * 3600 or t < now - (20 if done else 90) * 60 and not (done and t > now - 90 * 60 and (plane(r) or {}).get("ph") == io):
            continue                                   # 還沒到、還沒飛的留久一點（官網常常慢半拍）；寫已飛但其實剛起飛（排隊滑行很久）的也留著
        show.append(r)
    pick = {}                                          # 同一班號今天、明天都在表上：天上那架只配給時間最接近的那一筆
    for i, r in enumerate(show):
        p = plane(r)
        if p and abs((r["est"] or r["sch"]) - now) < pick.get(p["id"], (1e18, 0))[0]:
            pick[p["id"]] = (abs((r["est"] or r["sch"]) - now), i)
    for i, r in enumerate(show):
        done = r["st"] in ("已到", "已飛")
        pl = {"code": r["pc"], "name": r["pl"]}
        row = {"id": f"f-{io}-{r['fn']}-{int(r['sch'])}", "fn": r["fn"], "cs": "", "al": r["al"], "reg": "", "t": r["type"], "model": r["type"],
               "org": pl if io == "arr" else me, "dst": me if io == "arr" else pl, "ph": io, "st": r["st"], "emg": False, "mil": False, "rare": False,
               "use": "客機", "fids": True, "sch": r["sch"], "est": r["est"], "gate": r["gate"], "gate0": r.get("gate0") or "", "bx": r.get("bx") or "", "type0": r.get("type0") or "", "term": r["term"], "share": r.get("share") or []}
        p = plane(r)
        if p and pick.get(p["id"], (0, -1))[1] != i:
            p = None
        sk = io + ":" + fly_fn(r["fn"])
        seen = FLY["seen"].get(sk)
        if p:
            fly_fix_type(p, r)
            if p.get("reg") or p.get("t"):            # 記住這班收到的飛機資料：停好關掉訊號後一樣查得到
                FLY["seen"][sk] = {"at": now, "sch": r["sch"], "reg": p["reg"], "t": p["t"], "model": p["model"]}
            used.add(p["id"])
            row.update({k: p[k] for k in ("id", "cs", "reg", "t", "model", "alt", "spd", "vr", "d", "eta", "trk", "x", "y", "sq", "emg", "mil", "rare", "hold") if p.get(k) or k not in ("t", "model", "hold")})   # 收到的訊號沒有機型：留官網的
            row["live"] = True
            if p["mil"]:
                row["use"] = "軍機"
            if io == "dep" and p["ph"] == "over" and (p.get("vr") or 0) >= 0 and now > (r["est"] or r["sch"]) - 900 and r["st"] != "取消":
                row["st"] = "已飛"                     # 已經在天上了（查到的航線不對，沒算成出發）
            elif p["ph"] == io and not done and r["st"] != "取消":
                row["st"] = p["st"]                    # 天上的飛機：用即時的「即將降落」「剛起飛」
                if io == "arr" and p["eta"] is not None:
                    row["est"] = now + p["eta"] * 60
            if p["emg"] or (p.get("hold") and io == "arr" and not done and r["st"] != "取消"):
                row["st"] = p["st"] if p["emg"] else "盤旋等待"    # 緊急、在空中繞圈等降落：照即時的寫
        elif seen and seen.get("sch") == r["sch"] and now - seen.get("at", 0) < 6 * 3600:
            row.update(reg=seen.get("reg") or "", t=seen.get("t") or row["t"], model=seen.get("model") or row["model"], seen=seen["at"])
            fly_fix_type(row, r)
        if not done and r["st"] != "取消" and not row["emg"]:    # 官網常常慢半拍：用雷達上真的飛機校正
            t0 = row["est"] or row["sch"]
            if p and p["ph"] == "gnd" and (p.get("d") or 99) < 6:
                if io == "arr":
                    row["st"] = "已到"                 # 已經停在這個機場了
                elif (p.get("spd") or 0) > 5 and now > t0 - 1800:
                    row["st"] = "滑行中"
            if row["st"] not in ("已到", "已飛", "滑行中") and not (p and p["ph"] == io) and now > t0 + 300:
                row["lag"] = True                      # 過了時間還沒到／還沒飛：照現在的時間排，網頁算晚幾分
                if row["st"] in ("準時", "提早", "改時間", "時間更改", ""):
                    row["st"] = "還沒到" if io == "arr" else "還沒飛"
        row["at"] = now if row.get("lag") else (row["est"] or row["sch"] or now)   # 排序用的時間
        out.append(row)
    out.sort(key=lambda o: o["at"])
    if len(FLY["seen"]) > 2000:
        for k, v in list(FLY["seen"].items()):
            if now - v.get("at", 0) > 6 * 3600:
                FLY["seen"].pop(k, None)
    return out[:300]                                   # 網頁照時段分開看，可以多給一點


def fly_gnd(ap, fids, gnd):
    """地面的飛機：只留官網表上有的班機，補上航線和航空公司"""
    me, by, out = {"code": ap[0], "name": ap[2]}, {}, []
    for r in fids:
        for f in [r["fn"], *(r.get("share") or [])]:
            by.setdefault(fly_fn(f), r)
    for p in gnd:
        r = by.get(fly_fn(p["fn"]))
        if not r or fly_cargo(r["fn"]):
            continue
        fly_fix_type(p, r)
        pl = {"code": r["pc"], "name": r["pl"]}
        out.append(dict(p, fn=r["fn"], al=r["al"], io=r["io"], org=pl if r["io"] == "arr" else me, dst=me if r["io"] == "arr" else pl,
                        model=p["model"] or r["type"], gate=r["gate"], bx=r.get("bx") or ""))
    return out


def fly_night(ap, now=None):
    """桃園以外的台灣機場，半夜 0～6 點沒有班機，不用去抓"""
    h = datetime.fromtimestamp(now or time.time(), FLY_TW).hour
    return ap[5] == "TW" and ap[0] != "TPE" and h < 6


def fly_board(code, bg=False):
    """一個機場的看板；bg=True 是背景在抓（沒人在看這個機場就不花 OpenSky 的次數）"""
    db = fly_db()
    ap = db.get(code) or db["TPE"]
    if not bg:
        FLY["view"][ap[0]] = FLY["used"] = time.time()
        fly_bg_start()
    if fly_night(ap):
        return {"ok": True, "t": time.time(), "ap": fly_ap(ap), "night": True, "src": "", "home": "", "srcs": [],
                "fids": True, "arr": [], "dep": [], "gnd": [], "over": [], "rest": []}
    for c in FLY_PIN:                     # 其他台灣機場的官網表也在背景先抓好，換機場就不用等
        if c != ap[0] and c in db and not fly_night(db[c]) and not bg:
            fly_fids(c, 0)
    with FLY["fetch"]:                    # 好幾個人同時看：只抓一次
        hit = FLY["cache"].get(ap[0])
        if hit and time.time() - hit["t"] < FLY_EVERY:
            return hit
        fids = fly_fids(ap[0])
        if fids == "wait":                    # 官網表第一次還沒抓到：先叫網頁等一下，到齊了再一次給
            return {"ok": True, "loading": True, "t": time.time(), "ap": fly_ap(ap), "src": "", "home": "", "srcs": [],
                    "fids": True, "arr": [], "dep": [], "gnd": [], "over": [], "rest": []}
        try:
            ac, src, home = fly_fetch(ap)
        except RuntimeError as e:
            ac, src, home, err = None, "", "", e
        look = not bg or time.time() - FLY["view"].get(ap[0], 0) < 60      # 有人正在看這個機場
        more = fly_sky(ap, look and fly_sky_need(ap, fids, ac))
        if ac is None and not more and fids is None:
            raise err
        ac = ac or []
        have = {str(a.get("hex") or "").lower() for a in ac if isinstance(a, dict)}
        add = [a for a in more if a["hex"].lower() not in have]
        ac = ac + add
    srcs = [[src, home]] if src else []
    if fids is not None:
        srcs.insert(0, [FLY_FIDS_NAME[ap[0]][0] + "官網", FLY_FIDS_NAME[ap[0]][1]])
    if add:
        srcs.append(["OpenSky", "https://opensky-network.org"])
    fly_hex_fill(ac)
    rows, cargo = [], []
    for a in ac:                              # 一架資料怪怪的就跳過，不要整個看板都出不來
        try:
            p = fly_plane(a, ap) if isinstance(a, dict) else None
        except Exception as e:  # noqa: BLE001
            fly_log(f"有一架資料讀不懂（{type(e).__name__}）")
            p = None
        if not p:
            continue
        if p["ph"] != "over":
            fly_type_seen(ap[0], p["t"])
        if p["use"] == "貨機":                        # 貨機不列在看板，只畫在雷達上
            cargo.append(p)
            continue
        hit = fly_fids_find(p["fn"])
        if hit:                                        # 任何一個台灣機場的官網表排了這班：機型照官網（路過的也是）
            fly_fix_type(p, hit[1])
            if not p["mil"]:
                p["use"] = "客機"                      # 官網表只有客機
        rows.append(p)
    by = lambda ph: [p for p in rows if p["ph"] == ph]           # noqa: E731
    arr = sorted(by("arr"), key=lambda p: (p["eta"] if p["eta"] is not None else 999, p["d"]))
    dep = sorted(by("dep"), key=lambda p: p["d"])
    gnd = sorted(by("gnd"), key=lambda p: (-p["spd"], p["fn"]))
    over = by("over")
    rest = []
    if fids is not None:
        arr, dep, gnd = fly_merge(ap, fids, rows, "arr"), fly_merge(ap, fids, rows, "dep"), fly_gnd(ap, fids, gnd)
        got = {p["id"] for p in arr + dep + gnd}
        rest = [p for p in rows if p["ph"] != "over" and p["id"] not in got]   # 對不上官網表的：不列在看板，但雷達上照樣畫出來
        over = [p for p in over if p["id"] not in got]                       # 配上官網表的就不是路過
    rest += cargo
    for p in arr + dep + gnd + over + rest:
        p["kind"] = fly_kind(p.get("t"), p.get("model"), p.get("cat"))
        if p.get("use") == "貨機":
            p["model"] = fly_cargo_model(p.get("t"), p.get("model"))
    fly_logo_new(arr + dep + gnd + over + rest)
    out = {"ok": True, "t": time.time(), "ap": fly_ap(ap), "src": src or (srcs[0][0] if srcs else ""), "home": home, "srcs": srcs,
           "fids": fids is not None, "arr": arr, "dep": dep, "gnd": gnd, "over": over, "rest": rest, "als": sorted(FLY_LGOK), "lgv": VERSION,
           "skyout": FLY_SKYS["out"] if FLY_SKYS["out"] > time.time() and fly_sky_need(ap, fids, ac) else 0}   # OpenSky 今天的次數用完了：網頁寫幾點恢復
    out["cargo"] = sorted([p for p in cargo if p["ph"] != "over"], key=lambda p: ({"arr": 0, "gnd": 1}.get(p["ph"], 2), p["eta"] if p["eta"] is not None else 999, p["d"]))   # 「貨機」分頁：要降落、在地面、剛起飛的貨機
    out["ccs"] = {x["code"]: db[x["code"]][5] for p in arr + dep + gnd + over + rest for x in (p.get("org"), p.get("dst"))
                  if x and x.get("code") in db and db[x["code"]][5]}   # 地名旁邊的國旗：機場代碼 → 國家
    out["lat"] = {c: round(db[c][3], 2) for c in out["ccs"]}
    out["wx"] = fly_wx(ap[0])   # 地點選單：同一國的城市由北到南排
    fly_track(ap[0], rows + cargo)
    FLY["cache"][ap[0]] = out
    return out


def sky_conf(cfg):
    """設定 → OpenSky 帳號：看狀態、儲存（先試著登入一次）、移除"""
    act = cfg.get("action")
    if act == "save":
        cid, sec = str(cfg.get("id") or "").strip(), str(cfg.get("secret") or "").strip()
        if not cid or not sec or not re.fullmatch(r"[\w.@+-]{1,200}", cid) or not re.fullmatch(r"\S{1,400}", sec):
            return False, "兩格都要貼上"
        old = C.get("OPENSKY_ID", ""), C.get("OPENSKY_SECRET", "")
        C["OPENSKY_ID"], C["OPENSKY_SECRET"] = cid, sec
        FLY_SKYS.update(tok="", texp=0, tbad=0, err="")
        if not fly_sky_tok():
            C["OPENSKY_ID"], C["OPENSKY_SECRET"] = old
            err, FLY_SKYS["tok"] = FLY_SKYS["err"] or "登入失敗", ""
            FLY_SKYS.update(tbad=0, err="")
            return False, "client_id 或 client_secret 不對" if err == "帳號不對" else err
        write_conf({"OPENSKY_ID": cid, "OPENSKY_SECRET": sec})
        FLY_SKYS.update(until=0, out=0, left=None)     # 次數變多了：馬上可以再問
        log("機場起降：OpenSky 帳號已設定")
    elif act == "off":
        write_conf({"OPENSKY_ID": "", "OPENSKY_SECRET": ""})
        C["OPENSKY_ID"] = C["OPENSKY_SECRET"] = ""
        FLY_SKYS.update(tok="", texp=0, err="", left=None)
    on = bool(C.get("OPENSKY_ID") and C.get("OPENSKY_SECRET"))
    return True, {"ok": True, "on": on, "id": C.get("OPENSKY_ID", "") if on else "", "left": FLY_SKYS["left"],
                  "out": FLY_SKYS["out"] if FLY_SKYS["out"] > time.time() else 0, "err": FLY_SKYS["err"] if on else ""}


def fly_seen_load():
    """上次記下的班機資料（停好關掉訊號的飛機）；最近 7 天有人看過機場起降，就接著在背景抓"""
    try:
        with open(FLY_HEX_FILE, encoding="utf-8") as f:
            FLY["hex"].update({k: v for k, v in json.load(f).items() if isinstance(v, dict)})
    except (OSError, ValueError, AttributeError):
        pass
    try:
        with open(FLY_SEEN_FILE, encoding="utf-8") as f:
            d = json.load(f)
        if d.get("v") == 2:                   # 舊版用 hexdb 查到的機型有過時的，不沿用
            FLY["seen"].update({k: v for k, v in (d.get("seen") or {}).items() if isinstance(v, dict) and time.time() - v.get("at", 0) < 6 * 3600})
        FLY["zh"].update({k: v for k, v in (d.get("zh") or {}).items() if isinstance(v, str)})
        FLY["gate"].update({k: v for k, v in (d.get("gate") or {}).items() if isinstance(v, dict) and time.time() - v.get("t", 0) < 12 * 3600})
        FLY["used"] = float(d.get("used") or 0)
        old = time.strftime("%Y%m%d", time.localtime(time.time() - 30 * 86400))
        for c, ts in (d.get("types") or {}).items():
            if isinstance(ts, dict):
                FLY["types"][c] = {t: {x for x in v if isinstance(x, str) and x > old} for t, v in ts.items() if isinstance(v, list)}
    except (OSError, ValueError, AttributeError, TypeError):
        return
    if time.time() - FLY["used"] < 7 * 86400:
        fly_bg_start()


FLY_TRK_FILE = os.path.join(DATA_DIR, "fly-tracks.json")
FLY_TRK = {"g": {}, "last": {}, "day": ""}            # g：機場 → 抵達／出發 → "x,y"（1 公里一格）→ 飛過幾次


def fly_track(code, planes):
    """記下抵達、出發的飛機飛過哪些格子：飛得多的格子連起來，就是這個機場常走的進場、離場路線"""
    now, day = time.time(), time.strftime("%Y%m%d")
    with FLY["lock"]:
        if FLY_TRK["day"] != day:                     # 每天淡一點：很久沒人飛的路線慢慢消失
            for ps in FLY_TRK["g"].values():
                for cs in ps.values():
                    for k in [k for k, v in cs.items() if v * .92 < .5]:
                        del cs[k]
                    for k in cs:
                        cs[k] *= .92
            FLY_TRK["day"] = day
        g = FLY_TRK["g"].setdefault(code, {"arr": {}, "dep": {}})
        for p in planes:
            if p.get("ph") not in ("arr", "dep") or p.get("x") is None or (p.get("alt") or 0) > 7000 or math.hypot(p["x"], p["y"]) > 90:
                continue
            k, x, y = code + p["id"], p["x"], p["y"]
            o = FLY_TRK["last"].get(k)
            d = math.hypot(x - o[0], y - o[1]) if o and now - o[2] < 120 else 0
            if o and now - o[2] < 120 and d < .5:     # 同一個位置抓到兩次（背景和網頁各問一次）不重複算
                continue
            n = int(d / .5) if d < 25 else 0           # 這次和上次的位置之間也補上（30 秒飛好幾公里，不然會斷成點點）
            cells = {f"{round(x + (o[0] - x) * i / (n + 1))},{round(y + (o[1] - y) * i / (n + 1))}" for i in range(n + 1)} if n else {f"{round(x)},{round(y)}"}
            if o and n:
                cells.discard(f"{round(o[0])},{round(o[1])}")
            for c in cells:
                g[p["ph"]][c] = g[p["ph"]].get(c, 0) + 1
            FLY_TRK["last"][k] = (x, y, now)
        for k in [k for k, v in FLY_TRK["last"].items() if now - v[2] > 300]:
            del FLY_TRK["last"][k]


def fly_tracks(code):
    """常走的路線給雷達畫：[x, y, 濃淡 1～99, …]，太少飛過的格子不給"""
    out = {"ok": True}
    for ph in ("arr", "dep"):
        cs = dict((FLY_TRK["g"].get(code) or {}).get(ph) or {})
        top = max(cs.values(), default=0)
        lst = []
        if top >= 3:
            lt = math.log(top + 1)
            for c, v in sorted(cs.items(), key=lambda kv: -kv[1])[:5000]:
                a = round(math.log(v + 1) / lt * 99)
                if a >= 15 and v >= 2:
                    lst += [*map(int, c.split(",")), a]
        out[ph] = lst
    return out


def fly_tracks_load():
    try:
        with open(FLY_TRK_FILE, encoding="utf-8") as f:
            d = json.load(f)
        FLY_TRK["day"] = str(d.get("day") or "")
        FLY_TRK["g"] = {c: {ph: {k: float(v) for k, v in cs.items()} for ph, cs in ps.items() if ph in ("arr", "dep")} for c, ps in (d.get("g") or {}).items() if c in FLY_PIN}
    except (OSError, ValueError, AttributeError, TypeError):
        pass


def fly_seen_save():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = FLY_SEEN_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"v": 2, "used": FLY["used"], "seen": dict(FLY["seen"]), "zh": dict(FLY["zh"]), "gate": dict(FLY["gate"]),
                       "types": {c: {t: sorted(v)[-30:] for t, v in ts.items()} for c, ts in list(FLY["types"].items())}}, f, ensure_ascii=False)
        os.replace(tmp, FLY_SEEN_FILE)
        with open(FLY_HEX_FILE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(dict(FLY["hex"]), f)
        os.replace(FLY_HEX_FILE + ".tmp", FLY_HEX_FILE)
        with FLY["lock"]:
            trk = json.dumps({"day": FLY_TRK["day"], "g": {c: {ph: {k: round(v, 1) for k, v in cs.items()} for ph, cs in ps.items()} for c, ps in FLY_TRK["g"].items()}}, separators=(",", ":"))
        with open(FLY_TRK_FILE + ".tmp", "w", encoding="utf-8") as f:
            f.write(trk)
        os.replace(FLY_TRK_FILE + ".tmp", FLY_TRK_FILE)
    except OSError as e:
        fly_log(f"存不了班機資料：{e}")


def fly_bg_start():
    if watchers():                                    # 被監看的主機：機場起降由主要主機抓，這台完全不跑
        return
    with FLY["lock"]:
        if FLY.get("bg"):
            return
        FLY["bg"] = True
    threading.Thread(target=fly_loop, daemon=True).start()


def fly_loop():
    """用過機場起降之後，主機就一直在背景抓四個機場（官網表、飛機位置）：打開就是新的，停好的飛機也記得；7 天沒人看就停"""
    saved = time.time()
    threading.Thread(target=fly_logo_warm, daemon=True).start()
    while time.time() - FLY["used"] < 7 * 86400:
        time.sleep(FLY_BG)
        if watchers():                        # 後來被配對成被監看的主機：停掉，交給主要主機抓
            break
        for c in FLY_PIN:
            try:
                fly_board(c, True)
            except Exception as e:  # noqa: BLE001
                fly_log(f"背景抓{c}：{str(e)[:60]}")
        if time.time() - saved > 300:
            saved = time.time()
            fly_seen_save()
    FLY["bg"] = False
    fly_seen_save()


# 雷達底圖上標的地名（名稱、緯度、經度）
FLY_TOWNS = [
    ("台北", 25.04, 121.56), ("板橋", 25.01, 121.46), ("基隆", 25.13, 121.74), ("淡水", 25.17, 121.44),
    ("桃園", 24.99, 121.31), ("中壢", 24.96, 121.22), ("新竹", 24.80, 120.97), ("苗栗", 24.56, 120.82),
    ("台中", 24.15, 120.67), ("清水", 24.27, 120.57), ("彰化", 24.08, 120.54), ("南投", 23.91, 120.68),
    ("斗六", 23.71, 120.54), ("嘉義", 23.48, 120.45), ("台南", 22.99, 120.21), ("高雄", 22.63, 120.30),
    ("屏東", 22.67, 120.49), ("小琉球", 22.34, 120.37), ("宜蘭", 24.76, 121.75), ("花蓮", 23.99, 121.60),
    ("台東", 22.76, 121.14), ("馬公", 23.57, 119.58), ("恆春", 22.00, 120.75), ("金門", 24.44, 118.36), ("馬祖", 26.16, 119.95),
    ("蘭嶼", 22.05, 121.55), ("綠島", 22.66, 121.49),
]
# 台灣附近的其他地方（拉遠才看得到，字比較淡）
FLY_FAR = [("廈門", 24.48, 118.09), ("泉州", 24.87, 118.68), ("福州", 26.07, 119.30), ("莆田", 25.45, 119.01), ("汕頭", 23.35, 116.68),
           ("溫州", 28.00, 120.67), ("與那國島", 24.46, 123.00), ("石垣島", 24.40, 124.18), ("宮古島", 24.78, 125.30), ("巴丹群島", 20.45, 121.97)]
# 放大後才出現的鄉鎮
FLY_TOWNS2 = [
    ("大園", 25.06, 121.20), ("蘆竹", 25.05, 121.29), ("龜山", 25.00, 121.34), ("八德", 24.93, 121.29),
    ("平鎮", 24.92, 121.21), ("楊梅", 24.91, 121.15), ("新屋", 24.97, 121.10), ("觀音", 25.03, 121.08),
    ("林口", 25.08, 121.39), ("新莊", 25.04, 121.45), ("三重", 25.06, 121.49), ("士林", 25.09, 121.52),
    ("內湖", 25.08, 121.59), ("汐止", 25.07, 121.66), ("新店", 24.97, 121.54), ("三峽", 24.93, 121.37),
    ("大溪", 24.88, 121.29), ("竹北", 24.84, 121.00), ("湖口", 24.90, 121.04), ("八里", 25.15, 121.40),
    ("金山", 25.22, 121.64), ("沙鹿", 24.23, 120.57), ("大甲", 24.35, 120.62), ("豐原", 24.25, 120.72),
    ("后里", 24.31, 120.71), ("潭子", 24.21, 120.71), ("大雅", 24.23, 120.65), ("梧棲", 24.25, 120.53),
    ("大肚", 24.15, 120.54), ("太平", 24.13, 120.72), ("大里", 24.10, 120.68), ("烏日", 24.10, 120.62),
    ("鹿港", 24.06, 120.43), ("員林", 23.96, 120.57), ("通霄", 24.49, 120.68), ("苑裡", 24.44, 120.65),
    ("東勢", 24.26, 120.83), ("草屯", 23.97, 120.68), ("鳳山", 22.63, 120.36), ("岡山", 22.80, 120.30),
    ("楠梓", 22.73, 120.33), ("左營", 22.69, 120.29), ("前鎮", 22.59, 120.31), ("林園", 22.50, 120.39),
    ("大寮", 22.61, 120.40), ("旗山", 22.89, 120.48), ("東港", 22.47, 120.45), ("仁武", 22.70, 120.35),
    ("路竹", 22.86, 120.26), ("永康", 23.03, 120.25), ("美濃", 22.90, 120.54), ("潮州", 22.55, 120.54),
    ("枋寮", 22.37, 120.59),
]
# 跑道（大約）：方位角、長度（公里）、往左平移（公里），畫在雷達正中間
FLY_RWY = {"TPE": [(53, 3.66, .75), (53, 3.8, -.75)], "TSA": [(96, 2.6, 0)], "RMQ": [(3, 3.66, 0)], "KHH": [(93, 3.15, 0)]}
# 導航台（OurAirports，公有領域）：代碼、種類（V＝VOR／TACAN，N＝NDB）、緯度、經度
FLY_NAV = [("AP", "N", 25.1761, 121.523), ("APU", "V", 25.1769, 121.522), ("BM", "N", 23.5203, 119.609), ("CCK", "V", 24.2626, 120.618),
           ("CHI", "V", 23.4649, 120.391), ("GI", "N", 22.6761, 121.483), ("GID", "V", 22.6728, 121.486), ("HCN", "V", 21.9281, 120.844),
           ("HL", "N", 24.6464, 120.774), ("HLG", "V", 24.64, 120.783), ("HLN", "V", 24.0185, 121.64), ("HSU", "V", 24.8217, 120.938),
           ("KS", "N", 25.0558, 121.217), ("KT", "N", 22.0438, 120.731), ("KU", "N", 23.5842, 120.389), ("KW", "N", 21.9317, 120.839),
           ("LK", "N", 25.0743, 121.424), ("LKU", "V", 25.0761, 121.427), ("LU", "N", 25.1394, 121.801), ("LY", "N", 22.0767, 121.508),
           ("MKG", "V", 23.5954, 119.637), ("MR", "N", 22.9783, 120.29), ("MS", "N", 24.7319, 121.741), ("NN", "N", 23.1247, 120.202),
           ("O", "N", 25.0654, 121.632), ("PIT", "V", 22.6707, 120.46), ("RA", "N", 24.8617, 121.253), ("SG", "N", 25.0704, 121.53),
           ("SK", "N", 22.5778, 120.326), ("SN", "N", 24.1363, 120.655), ("SW", "N", 24.9948, 121.491), ("TC", "N", 24.2535, 120.619),
           ("TIA", "V", 25.0884, 121.233), ("TNN", "V", 23.1356, 120.206), ("TWS", "V", 22.9499, 120.205), ("TYN", "V", 25.0625, 121.245),
           ("WK", "N", 24.2333, 120.823), ("YU", "N", 24.0177, 121.627), ("ZN", "N", 22.7599, 121.159)]


def fly_ter():
    """地形高度（data/terrain.bin，tools/terrain.py 產生）：(說明, 高度表)；沒有就是 None"""
    if "ter" not in FLY:
        try:
            with open(os.path.join(HERE, "data", "terrain.bin"), "rb") as f:
                head, body = f.read().split(b"\n", 1)
            m = json.loads(head)
            FLY["ter"] = (m, body) if len(body) == m["w"] * m["h"] else None
        except (OSError, ValueError, KeyError):
            FLY["ter"] = None
    return FLY["ter"]
FLY_GEO = {}


def fly_geo(code):
    """雷達底圖：機場附近的海岸線和地名，換算成離機場幾公里（往東、往北為正）"""
    if code in FLY_GEO:
        return FLY_GEO[code]
    a = fly_db().get(code)
    if not a:
        return {"ok": False, "error": "沒有這個機場"}
    lat0, lon0, kx, ky, lim = a[3], a[4], 111.32 * math.cos(math.radians(a[3])), 110.57, 140
    xy = lambda la, lo: ((lo - lon0) * kx, (la - lat0) * ky)  # noqa: E731
    path = {"t": [], "f": []}                        # 台灣整座島和附近的陸地都給（不切成方框，拉遠也不會有假的直線）
    try:
        with open(os.path.join(HERE, "data", "coast.tsv"), encoding="utf-8") as f:
            for line in f:
                if line.startswith("#") or not line.strip():
                    continue
                k, *ps = line.split()
                pts = [xy(float(p.split(",")[1]), float(p.split(",")[0])) for p in ps]
                if k not in path or not any(math.hypot(x, y) < 900 for x, y in pts):
                    continue
                seg = []
                for x, y in pts:
                    c = f"{x:.1f} {-y:.1f}"
                    if not seg or seg[-1] != c:
                        seg.append(c)
                if len(seg) > 2:
                    path[k].append("M" + "L".join(seg) + "Z")
    except OSError:
        pass
    towns = []
    for lv, lst in ((1, FLY_TOWNS), (2, FLY_TOWNS2), (0, FLY_FAR)):
        for n, la, lo in lst:
            x, y = xy(la, lo)
            if math.hypot(x, y) < (lim if lv == 2 else 900):
                towns.append([n, round(x, 1), round(y, 1), lv])
    aps, rwy = [], []                                # 附近的機場和它們的跑道
    for c, n, _, la, lo in FLY_APS:
        x, y = (0, 0) if c == code else xy(la, lo)
        if c != code and (math.hypot(x, y) >= lim or not (21.5 < la < 26.5 and 118 < lo < 122.5)):
            continue
        if c != code:
            aps.append([c, n, round(x, 1), round(y, 1)])
        for h, ln, off in FLY_RWY.get(c, []):
            a, b = math.radians(h), math.radians(h - 90)
            cx, cy = x + off * math.sin(b), y + off * math.cos(b)
            dx, dy = ln / 2 * math.sin(a), ln / 2 * math.cos(a)
            rwy.append([round(cx - dx, 2), round(cy - dy, 2), round(cx + dx, 2), round(cy + dy, 2)])
    apm = {"rw": [], "tw": [], "ap": [], "tm": []}   # 這個機場的跑道、滑行道、機坪、航廈（OpenStreetMap，放大才畫）
    try:
        with open(os.path.join(HERE, "data", "apmap.tsv"), encoding="utf-8") as f:
            for line in f:
                p = line.split()
                if len(p) < 5 or p[0] != code or p[1] not in apm:
                    continue
                pts = [v for q in p[3:] for la, lo in [(float(q.split(",")[1]), float(q.split(",")[0]))] for v in (round(xy(la, lo)[0], 4), round(xy(la, lo)[1], 4))]
                apm[p[1]].append([int(p[2]), *pts] if p[1] == "rw" else pts)
    except (OSError, ValueError, IndexError):
        pass
    nav = [[n, k, round(x, 1), round(y, 1)] for n, k, la, lo in FLY_NAV for x, y in [xy(la, lo)] if math.hypot(x, y) < lim]
    ter = fly_ter()
    if ter:                                          # 地形那張圖放在哪（公里）：左邊、上面、寬、高
        m = ter[0]
        x0, y1 = xy(m["la"], m["lo"])
        ter = [round(x0, 2), round(y1, 2), round(m["w"] * m["d"] * kx, 2), round(m["h"] * m["d"] * ky, 2), m["w"], m["h"]]
    FLY_GEO[code] = {"ok": True, "coast": "".join(path["t"]), "far": "".join(path["f"]), "towns": towns, "aps": aps, "rwy": rwy, "nav": nav, "ter": ter, "apm": apm}
    return FLY_GEO[code]


def fly_api(q):
    """只開放台灣的四個機場（官網航班表準）；國外的資料不夠準，先不給選"""
    pin = [fly_ap(fly_db()[c]) for c in FLY_PIN if c in fly_db()]
    if "q" in q:
        return {"ok": True, "list": pin, "pin": pin}
    if "geo" in q:
        c = str(q["geo"][0]).upper()[:4]
        return fly_geo(c if c in FLY_PIN else "TPE")
    if "trk" in q:
        c = str(q["trk"][0]).upper()[:4]
        return fly_tracks(c if c in FLY_PIN else "TPE")
    if "photo" in q:                              # 飛機照片（註冊號，沒有就用飛機編號）
        return {"ok": True, **fly_photo(q["photo"][0], (q.get("hex") or [""])[0])}
    code = str(q.get("ap", ["TPE"])[0]).upper()[:4]
    try:
        return fly_board(code if code in FLY_PIN else "TPE")
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"航班資料暫時拿不到（{e}）"}


# ── 機場起降分享：自己選能看多久、幾支手機、哪個機場（只能看機場起降） ──
SHARE_FILE = os.path.join(DATA_DIR, "fly-share.json")
SHARE_LOCK = threading.Lock()
SHARE_SECS = int(os.environ.get("SENTINEL_SHARE_SECS") or 3600)
SHARE_TIMES = (3600, 6 * 3600, 86400, 7 * 86400)   # 能選的時間
SHARE_DEVS = (1, 3, 0)                              # 幾支手機能看（0 = 不限）


def share_fix(v):
    """舊版存的是一支手機（dev 是字串）：換成清單"""
    if isinstance(v.get("dev"), str):
        v["dev"] = [v["dev"]] if v["dev"] else []
    v.setdefault("max", 1)
    v.setdefault("ap", "")
    v.setdefault("name", "")
    v.setdefault("t0", v.get("exp", 0) - SHARE_SECS)
    return v


def share_load():
    try:
        with open(SHARE_FILE, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        d = {}
    now = time.time()
    return {k: share_fix(v) for k, v in d.items() if isinstance(v, dict) and v.get("exp", 0) > now} if isinstance(d, dict) else {}


def share_save(d):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = SHARE_FILE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(d, f)
    os.replace(tmp, SHARE_FILE)


def share_new(secs=None, devs=1, ap="", name=""):
    """新的分享連結代碼（只存雜湊）"""
    secs = int(secs) if str(secs or "").isdigit() and int(secs) in SHARE_TIMES else SHARE_SECS
    devs = int(devs) if str(devs).isdigit() and int(devs) in SHARE_DEVS else 1
    ap = str(ap or "").upper()
    ap = ap if ap in FLY_PIN else ""
    name = re.sub(r"[\x00-\x1f]", "", str(name or "")).strip()[:20]
    code = "fs_" + "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))   # 網址 /s/八碼（猜錯會等一秒、又只認打開過的手機）
    with SHARE_LOCK:
        d = share_load()
        if len(d) >= 50:                         # 太多還沒過期的：最舊的先失效
            for k in sorted(d, key=lambda k: d[k]["exp"])[:len(d) - 49]:
                d.pop(k)
        now = time.time()
        d[hashlib.sha256(code.encode()).hexdigest()] = {"exp": now + secs, "t0": now, "dev": [], "max": devs, "ap": ap, "name": name}
        share_save(d)
    return code, secs


def share_list():
    """已分享、還沒過期的連結（id 是雜湊的前 12 碼，拿不回原本的連結）"""
    now = time.time()
    return sorted(({"id": k[:12], "name": v["name"], "ap": v["ap"], "max": v["max"], "used": len(v["dev"]),
                    "left": int(v["exp"] - now), "t0": int(v["t0"])} for k, v in share_load().items()), key=lambda x: -x["t0"])


def share_del(sid):
    """提前收回：打開過的手機也會立刻看不到"""
    sid = str(sid or "")
    with SHARE_LOCK:
        d = share_load()
        ks = [k for k in d if sid and k.startswith(sid)] if len(sid) == 12 else []
        for k in ks:
            d.pop(k)
        if ks:
            share_save(d)
    return bool(ks)


def share_claim(code, dev):
    """朋友打開連結：還有名額的裝置拿到自己的通行碼，之後只認這些裝置"""
    h = hashlib.sha256(str(code or "").encode()).hexdigest()
    with SHARE_LOCK:
        d = share_load()
        e = d.get(h)
        if not e:
            return None, "連結已經失效", ""
        if dev and any(hmac.compare_digest(hashlib.sha256(str(dev).encode()).hexdigest(), x) for x in e["dev"]):
            return dev, int(e["exp"] - time.time()), e["ap"]
        if e["max"] and len(e["dev"]) >= e["max"]:
            return None, "這個連結已經在別的手機打開過" if e["max"] == 1 else f"這個連結已經有 {e['max']} 支手機打開過", ""
        dev = secrets.token_urlsafe(16)
        e["dev"].append(hashlib.sha256(dev.encode()).hexdigest())
        share_save(d)
    return dev, int(e["exp"] - time.time()), e["ap"]


def share_ok(given):
    """X-Share：代碼:通行碼；對的話回傳那個分享（ap 是限定的機場）"""
    code, _, dev = str(given or "").partition(":")
    if not code.startswith("fs_") or not dev:
        return None
    e = share_load().get(hashlib.sha256(code.encode()).hexdigest())
    hd = hashlib.sha256(dev.encode()).hexdigest()
    return e if e and any(hmac.compare_digest(hd, x) for x in e["dev"]) else None
