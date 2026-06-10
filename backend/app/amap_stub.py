from app.schemas import POICreate

# 高德 POI 桩：内置成都真实景点（含坐标），作为：
#   1）首屏骨架来源（TTFP ≤5s）
#   2）LLM 失败时的垫底降级（热门排序，PRD §8.3）
# 接口签名对齐真实高德，后续替换实现即可（dev_doc 单一接口抽象）。

_CITY_POIS: dict[str, list[dict]] = {
    "成都": [
        {"name": "武侯祠", "category": "play", "lng": 104.0476, "lat": 30.6464,
         "address": "武侯区武侯祠大街231号", "amap_id": "B0FFFAB6E0"},
        {"name": "锦里古街", "category": "eat", "lng": 104.0486, "lat": 30.6447,
         "address": "武侯区武侯祠大街231号附1号", "amap_id": "B0FFFAB6E1"},
        {"name": "成都大熊猫繁育研究基地", "category": "play", "lng": 104.1466,
         "lat": 30.7339, "address": "成华区熊猫大道1375号", "amap_id": "B0FFFAB6E2"},
        {"name": "宽窄巷子", "category": "play", "lng": 104.0617, "lat": 30.6694,
         "address": "青羊区金河路口", "amap_id": "B0FFFAB6E3"},
        {"name": "春熙路", "category": "eat", "lng": 104.0817, "lat": 30.6566,
         "address": "锦江区春熙路步行街", "amap_id": "B0FFFAB6E4"},
        {"name": "杜甫草堂", "category": "play", "lng": 104.0289, "lat": 30.6695,
         "address": "青羊区青华路37号", "amap_id": "B0FFFAB6E5"},
        {"name": "都江堰景区", "category": "play", "lng": 103.6177, "lat": 31.0036,
         "address": "都江堰市公园路", "amap_id": "B0FFFAB6E6"},
        {"name": "太古里", "category": "stay", "lng": 104.0810, "lat": 30.6520,
         "address": "锦江区中纱帽街8号", "amap_id": "B0FFFAB6E7"},
    ],
}

_DEFAULT_POIS: list[dict] = [
    {"name": "市中心广场", "category": "play", "lng": None, "lat": None,
     "address": None, "amap_id": None},
]


def _to_poi(d: dict) -> POICreate:
    return POICreate(
        amap_id=d.get("amap_id"),
        name=d["name"],
        category=d["category"],
        lng=d.get("lng"),
        lat=d.get("lat"),
        address=d.get("address"),
        rec_reason=d.get("rec_reason"),
    )


def hot_pois(city: str, limit: int = 6) -> list[POICreate]:
    """城市热门 POI（垫底/骨架）。未知城市回默认占位。"""
    rows = _CITY_POIS.get(city, _DEFAULT_POIS)
    return [_to_poi(d) for d in rows[:limit]]


def search_pois(city: str, keyword: str = "", limit: int = 10) -> list[POICreate]:
    """占位检索：按 keyword 简单过滤名称，命中不足回热门。"""
    rows = _CITY_POIS.get(city, _DEFAULT_POIS)
    if keyword:
        hit = [d for d in rows if keyword in d["name"]]
        if hit:
            return [_to_poi(d) for d in hit[:limit]]
    return [_to_poi(d) for d in rows[:limit]]


def candidates(
    city: str,
    category: str,
    exclude: set[str] | None = None,
    limit: int = 4,
) -> list[POICreate]:
    """卡片流类目候选/兜底：优先同类目，不足时跨类回补，保证尽量 ≥3 张。"""
    exclude = exclude or set()
    rows = _CITY_POIS.get(city, _DEFAULT_POIS)
    pool = [d for d in rows if d["name"] not in exclude]
    same = [d for d in pool if d.get("category") == category]
    others = [d for d in pool if d.get("category") != category]
    picked = same + others  # 同类目优先，再用其它类目回补凑数
    return [_to_poi(d) for d in picked[:limit]]
