import json
import math
import re
from dataclasses import dataclass, field

from app import amap_stub, llm, validators
from app.schemas import (
    DayCreate,
    ItineraryCreate,
    POICreate,
    StopCreate,
    TransitCreate,
)

# 自研轻量确定性 Workflow（PRD §7.3）：意图→POI→顺路→交通→渲染。
# 每个节点纯函数、可独立测试、可降级。


@dataclass
class Intent:
    city: str
    day_count: int
    preferences: list[str] = field(default_factory=list)
    raw: str = ""


_CN_NUM = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7}
# 简单城市词典；未命中时取「XX耍/玩/游」前缀或默认成都
_KNOWN_CITIES = ["成都", "重庆", "北京", "上海", "杭州", "西安", "广州", "深圳", "昆明"]


def parse_intent(query: str) -> Intent:
    """启发式抽取 city + 天数，缺失给默认（成都 / 3 天）。"""
    q = (query or "").strip()
    city = next((c for c in _KNOWN_CITIES if c in q), "")
    if not city:
        m = re.match(r"^([一-龥]{2,4})(?:耍|玩|游|旅游|行)", q)
        city = m.group(1) if m else "成都"

    day_count = 3
    m = re.search(r"(\d+)\s*天", q)
    if m:
        day_count = int(m.group(1))
    else:
        m = re.search(r"([一二两三四五六七])\s*天", q)
        if m:
            day_count = _CN_NUM.get(m.group(1), 3)
    day_count = max(1, min(day_count, 10))

    prefs: list[str] = []
    for kw in ("辣", "美食", "亲子", "文艺", "购物", "自然", "历史"):
        if kw in q:
            prefs.append(kw)

    return Intent(city=city, day_count=day_count, preferences=prefs, raw=q)


def _build_prompt(intent: Intent) -> list[dict]:
    pref = "、".join(intent.preferences) if intent.preferences else "无特别偏好"
    target = max(intent.day_count * 2, 3)
    sys = (
        "你是旅游规划助手。只输出 JSON，不要任何解释或 markdown 代码块。"
        "输出格式：{\"pois\":[{\"name\":str,\"category\":\"eat|stay|play\","
        "\"lng\":number,\"lat\":number,\"address\":str,\"rec_reason\":str}]}。"
        "rec_reason 不超过 50 字。lng/lat 用真实经纬度（GCJ-02）。"
    )
    user = (
        f"为「{intent.city}」规划 {intent.day_count} 天行程，偏好：{pref}。"
        f"推荐 {target} 个核心 POI（含吃/玩，可含住），按游览价值排序。"
    )
    return [
        {"role": "system", "content": sys},
        {"role": "user", "content": user},
    ]


def _extract_json(text: str) -> dict:
    """去掉可能的 markdown fence，截取首个 {...} 解析。"""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    start = t.find("{")
    end = t.rfind("}")
    if start != -1 and end != -1 and end > start:
        t = t[start : end + 1]
    return json.loads(t)


def recommend_pois(intent: Intent) -> tuple[list[POICreate], bool]:
    """返回 (pois, degraded)。LLM 失败/校验空 → 用高德桩兜底，degraded=True。"""
    messages = _build_prompt(intent)
    for attempt in range(2):  # 原始 + 1 次修复重试
        try:
            buf = "".join(llm.stream_chat(messages))
            data = _extract_json(buf)
            raw_pois = data.get("pois", []) if isinstance(data, dict) else []
            pois = validators.validate_llm_pois(raw_pois)
            if len(pois) >= 3:
                return pois, False
            if attempt == 0:
                messages = messages + [
                    {"role": "user", "content": "POI 不足或格式不符，请重新只输出合规 JSON。"}
                ]
                continue
        except Exception:
            if attempt == 0:
                continue
            break
    # 兜底：高德桩热门排序（PRD §8.3）
    return amap_stub.hot_pois(intent.city, limit=max(intent.day_count * 2, 3)), True


def _haversine_m(a: POICreate, b: POICreate) -> int | None:
    if None in (a.lng, a.lat, b.lng, b.lat):
        return None
    r = 6371000.0
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dphi = math.radians(b.lat - a.lat)
    dlmb = math.radians(b.lng - a.lng)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(h)))


def _nearest_neighbor_order(pois: list[POICreate]) -> list[POICreate]:
    """对有坐标的 POI 做最近邻排序「不走回头路」；无坐标的追加在尾部。"""
    with_coords = [p for p in pois if p.lng is not None and p.lat is not None]
    without = [p for p in pois if p.lng is None or p.lat is None]
    if len(with_coords) <= 2:
        return with_coords + without
    remaining = with_coords[:]
    ordered = [remaining.pop(0)]
    while remaining:
        last = ordered[-1]
        nxt = min(remaining, key=lambda p: _haversine_m(last, p) or 1 << 30)
        ordered.append(nxt)
        remaining.remove(nxt)
    return ordered + without


def route_and_split(pois: list[POICreate], intent: Intent) -> list[list[POICreate]]:
    """顺路排序 + 按天均分（PRD §5.1.2）。返回每天的 POI 列表。"""
    ordered = _nearest_neighbor_order(pois)
    days = max(1, intent.day_count)
    per = math.ceil(len(ordered) / days) if ordered else 0
    buckets: list[list[POICreate]] = []
    for i in range(days):
        chunk = ordered[i * per : (i + 1) * per] if per else []
        buckets.append(chunk)
    # 把空天的占位补齐（保证 day_count 一致）；多余 POI 已在最后一桶
    return buckets


def assemble_draft(
    intent: Intent, buckets: list[list[POICreate]]
) -> ItineraryCreate:
    """组装为 M1 的 ItineraryCreate，含 Stop 排序与相邻 Transit（步行估算）。"""
    days: list[DayCreate] = []
    for di, chunk in enumerate(buckets, start=1):
        stops: list[StopCreate] = []
        transits: list[TransitCreate] = []
        for oi, poi in enumerate(chunk, start=1):
            stops.append(StopCreate(order_index=oi, poi=poi))
            if oi > 1:
                prev = chunk[oi - 2]
                dist = _haversine_m(prev, poi)
                dur = int(dist / 1.3) if dist is not None else None  # ~步行 1.3m/s
                transits.append(
                    TransitCreate(
                        from_order_index=oi - 1,
                        to_order_index=oi,
                        mode="walking",
                        distance_meters=dist,
                        duration_seconds=dur,
                    )
                )
        days.append(DayCreate(day_index=di, stops=stops, transits=transits))

    title = f"{intent.city}{intent.day_count}日游"
    return ItineraryCreate(title=title, city=intent.city, status="draft", days=days)
