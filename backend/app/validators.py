import re

from app.schemas import POICreate

# 契约校验（PRD §11.3 字符计数 / §12.5 契约测试）。
# 不校验 LLM 具体文案，只校验：schema 合规、坐标合法、category 合法、推荐语字数。

REC_LIMIT = 50
VALID_CATEGORIES = {"eat", "stay", "play"}

# 每日全景时间轴的槽位与 category 映射（餐/玩/住一等公民）。
VALID_SLOTS = {"breakfast", "lunch", "dinner", "attraction", "hotel"}
SLOT_TO_CATEGORY = {
    "breakfast": "eat",
    "lunch": "eat",
    "dinner": "eat",
    "attraction": "play",
    "hotel": "stay",
}
CATEGORY_TO_SLOT = {"eat": "lunch", "play": "attraction", "stay": "hotel"}

STAY_MINUTES_MAX = 600
_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")

# 中国大致经纬度范围（软校验，越界视为脏数据丢弃）
CN_LNG_RANGE = (73.0, 135.5)
CN_LAT_RANGE = (3.0, 53.7)


def count_codepoints(s: str) -> int:
    """以 Unicode 码点计数（PRD §11.3 统一口径，前后端同源）。"""
    return len(s)


def truncate_rec(s: str, limit: int = REC_LIMIT) -> str:
    if count_codepoints(s) <= limit:
        return s
    return s[: limit - 1] + "…"


def valid_coord(lng: float | None, lat: float | None) -> bool:
    if lng is None or lat is None:
        return False
    if not (-180.0 <= lng <= 180.0 and -90.0 <= lat <= 90.0):
        return False
    return CN_LNG_RANGE[0] <= lng <= CN_LNG_RANGE[1] and (
        CN_LAT_RANGE[0] <= lat <= CN_LAT_RANGE[1]
    )


def valid_category(c: str | None) -> bool:
    return c in VALID_CATEGORIES


def validate_llm_pois(raw: list[dict]) -> list[POICreate]:
    """逐条过滤 LLM 返回的 POI：脏数据单条丢弃不阻塞（PRD §8.3）。"""
    result: list[POICreate] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        category = item.get("category")
        if not isinstance(name, str) or not name.strip():
            continue
        if not valid_category(category):
            continue
        raw_lng = item.get("lng")
        raw_lat = item.get("lat")
        has_coords = isinstance(raw_lng, (int, float)) and isinstance(
            raw_lat, (int, float)
        )
        if has_coords:
            lng, lat = float(raw_lng), float(raw_lat)
            if not valid_coord(lng, lat):
                # 提供了坐标但越界 → 脏数据，单条丢弃（PRD §8.3）
                continue
        else:
            # 未提供坐标 → 合法，保留 POI 按缺坐标降级列表展示（PRD §5.3.3）
            lng = lat = None
        rec = item.get("rec_reason")
        rec = truncate_rec(rec) if isinstance(rec, str) and rec.strip() else None
        address = item.get("address")
        address = address if isinstance(address, str) and address.strip() else None
        result.append(
            POICreate(
                name=name.strip(),
                category=category,
                lng=lng,
                lat=lat,
                address=address,
                rec_reason=rec,
            )
        )
    return result


def normalize_slot(
    slot: str | None, category: str | None
) -> tuple[str | None, str | None]:
    """解析 slot↔category：任一缺失则从另一个推导；都非法返回 (None, None)。"""
    if slot in VALID_SLOTS:
        return slot, SLOT_TO_CATEGORY[slot]
    if valid_category(category):
        return CATEGORY_TO_SLOT[category], category
    return None, None


def validate_arrive_time(value) -> str | None:
    """HH:MM（24 小时制）；非法返回 None。"""
    if isinstance(value, str) and _TIME_RE.match(value.strip()):
        return value.strip()
    return None


def validate_stay_minutes(value) -> int | None:
    """停留分钟数 1..600；非法返回 None。"""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        v = int(value)
        if 1 <= v <= STAY_MINUTES_MAX:
            return v
    return None


def validate_llm_day_stops(
    raw_stops: list,
) -> list[tuple[str, POICreate, str | None, int | None]]:
    """逐 stop 校验每日时间轴：返回 (slot, POICreate, arrive_time, stay_minutes)。

    时间轴为地图中心场景，坐标缺失/越界的 stop 直接丢弃（再由 workflow 回填），
    脏数据单条丢弃不阻塞整体（PRD §8.3）。
    """
    result: list[tuple[str, POICreate, str | None, int | None]] = []
    for item in raw_stops:
        if not isinstance(item, dict):
            continue
        slot, category = normalize_slot(item.get("slot"), item.get("category"))
        if slot is None or category is None:
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        raw_lng = item.get("lng")
        raw_lat = item.get("lat")
        if not (
            isinstance(raw_lng, (int, float))
            and not isinstance(raw_lng, bool)
            and isinstance(raw_lat, (int, float))
            and not isinstance(raw_lat, bool)
        ):
            continue
        lng, lat = float(raw_lng), float(raw_lat)
        if not valid_coord(lng, lat):
            continue
        rec = item.get("rec_reason")
        rec = truncate_rec(rec) if isinstance(rec, str) and rec.strip() else None
        address = item.get("address")
        address = address if isinstance(address, str) and address.strip() else None
        poi = POICreate(
            name=name.strip(),
            category=category,
            lng=lng,
            lat=lat,
            address=address,
            rec_reason=rec,
        )
        result.append(
            (
                slot,
                poi,
                validate_arrive_time(item.get("arrive_time")),
                validate_stay_minutes(item.get("stay_minutes")),
            )
        )
    return result
