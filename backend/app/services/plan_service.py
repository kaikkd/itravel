import json
import logging
import math
from collections.abc import Iterator

from app import amap_stub, llm, validators, workflow
from app.schemas import ItineraryCreate, POICreate

logger = logging.getLogger(__name__)


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def poi_dicts(pois) -> list[dict]:
    return [
        {
            "name": p.name,
            "category": p.category,
            "lng": p.lng,
            "lat": p.lat,
            "address": p.address,
            "rec_reason": p.rec_reason,
        }
        for p in pois
    ]


def synth_tree(draft: ItineraryCreate) -> dict:
    """Build frontend Itinerary shape with synthetic negative ids.

    Planning drafts intentionally do not hit the database; explicit save binds
    the tree to the logged-in user later.
    """
    cid = -1

    def nid() -> int:
        nonlocal cid
        value = cid
        cid -= 1
        return value

    days = []
    for day_in in draft.days:
        order_to_stop_id: dict[int, int] = {}
        stops = []
        for stop_in in day_in.stops:
            stop_id = nid()
            order_to_stop_id[stop_in.order_index] = stop_id
            stops.append(
                {
                    "id": stop_id,
                    "order_index": stop_in.order_index,
                    "arrive_time": stop_in.arrive_time,
                    "stay_minutes": stop_in.stay_minutes,
                    "poi": {
                        "id": nid(),
                        "amap_id": stop_in.poi.amap_id,
                        "name": stop_in.poi.name,
                        "category": stop_in.poi.category,
                        "lng": stop_in.poi.lng,
                        "lat": stop_in.poi.lat,
                        "address": stop_in.poi.address,
                        "rec_reason": stop_in.poi.rec_reason,
                        "sources": [
                            {"id": nid(), "url": src.url, "summary": src.summary}
                            for src in stop_in.poi.sources
                        ],
                    },
                }
            )
        transits = []
        for transit_in in day_in.transits:
            from_stop_id = order_to_stop_id.get(transit_in.from_order_index)
            to_stop_id = order_to_stop_id.get(transit_in.to_order_index)
            if from_stop_id is None or to_stop_id is None:
                logger.warning(
                    "skip_invalid_transit draft_day=%s from_order=%s to_order=%s",
                    day_in.day_index,
                    transit_in.from_order_index,
                    transit_in.to_order_index,
                )
                continue
            transits.append(
                {
                    "id": nid(),
                    "from_stop_id": from_stop_id,
                    "to_stop_id": to_stop_id,
                    "mode": transit_in.mode,
                    "duration_seconds": transit_in.duration_seconds,
                    "distance_meters": transit_in.distance_meters,
                    "polyline": transit_in.polyline,
                }
            )
        days.append(
            {
                "id": nid(),
                "day_index": day_in.day_index,
                "stops": stops,
                "transits": transits,
            }
        )

    return {
        "id": nid(),
        "user_id": None,
        "title": draft.title,
        "city": draft.city,
        "status": draft.status,
        "day_count": max(len(draft.days), 1),
        "days": days,
    }


def _poi_card(poi: POICreate) -> dict:
    return {
        "name": poi.name,
        "category": poi.category,
        "lng": poi.lng,
        "lat": poi.lat,
        "address": poi.address,
        "rec_reason": poi.rec_reason,
    }


def _suggest_messages(
    origin: str,
    destination: str,
    return_city: str,
    day_count: int,
    preferences: list[str],
    free_text: str,
) -> list[dict]:
    pref = "、".join(preferences) if preferences else "无特别偏好"
    system = (
        "你是专业的中国境内旅游行程规划助手。只输出 JSON，不要任何解释或 markdown 代码块。"
        '输出格式：{"reply":str,"days":[{"day_index":1,"candidates":['
        '{"name":str,"category":"eat|stay|play","lng":number,"lat":number,'
        '"address":str,"rec_reason":str}]}]}。'
        "reply 是给用户的一句话中文回复，必须简短（不超过 40 字、不要换行），"
        "说明推荐了哪几个代表性地点、贴合用户什么需求，例如「我给你推荐了宽窄巷子、人民公园，符合你想轻松逛吃的需求」。"
        "lng/lat 必须是高德 GCJ-02 真实坐标；rec_reason 不超过 50 字；"
        "每天给 4-6 个候选，覆盖吃和玩，可含住宿。"
    )
    user = (
        f"出发地：{origin or '未指定'}；目的地：{destination}；返回地：{return_city or origin or '未指定'}；"
        f"共 {day_count} 天；偏好：{pref}；用户补充：{free_text or '无'}。"
        f"请只为目的地「{destination}」规划 {day_count} 天，每天给出候选 POI（按游览价值排序）。"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _normalize_days(days: list[dict], day_count: int) -> list[dict]:
    """按 day_index 排序、重排为 1..day_count，缺失补空。"""
    by_index = {int(d["day_index"]): d["candidates"] for d in days if d.get("candidates")}
    ordered = sorted(by_index.items())
    result: list[dict] = []
    for slot, (_, candidates) in enumerate(ordered[:day_count], start=1):
        result.append({"day_index": slot, "candidates": candidates})
    for slot in range(len(result) + 1, day_count + 1):
        result.append({"day_index": slot, "candidates": []})
    return result


def _clip_reply(reply: str | None, fallback: str) -> str:
    text = reply.strip().replace("\n", " ") if isinstance(reply, str) else ""
    if not text:
        return fallback
    return text if len(text) <= 60 else text[:59] + "…"


def _fallback_suggestions(destination: str, day_count: int) -> dict:
    """LLM 不可用时用高德桩拆分到每天，保证离线可演示。"""
    pool = amap_stub.hot_pois(destination, limit=day_count * 4)
    days: list[dict] = []
    per = max(1, math.ceil(len(pool) / day_count)) if pool else 0
    for i in range(day_count):
        chunk = pool[i * per : (i + 1) * per] if per else []
        if not chunk:
            category = ("play", "eat", "stay")[i % 3]
            chunk = amap_stub.candidates(destination, category)
        days.append(
            {"day_index": i + 1, "candidates": [_poi_card(p) for p in chunk]}
        )
    return {
        "city": destination,
        "day_count": day_count,
        "reply": f"AI 暂不可用，先用「{destination}」的热门地点为你兜底，可在左侧逐个挑选。",
        "days": days,
        "degraded": True,
    }


def suggest_itinerary(
    *,
    origin: str,
    destination: str,
    return_city: str,
    day_count: int,
    preferences: list[str],
    free_text: str,
) -> dict:
    """结合上下文让 LLM 结构化输出每天候选 POI；失败回退高德桩。"""
    day_count = max(1, min(int(day_count or 3), 10))
    messages = _suggest_messages(
        origin, destination, return_city, day_count, preferences, free_text
    )
    for attempt in range(2):
        try:
            buffer = "".join(llm.stream_chat(messages))
            data = workflow._extract_json(buffer)
            raw_days = data.get("days", []) if isinstance(data, dict) else []
            parsed: list[dict] = []
            for raw in raw_days:
                if not isinstance(raw, dict):
                    continue
                index = int(raw.get("day_index") or len(parsed) + 1)
                candidates = validators.validate_llm_pois(raw.get("candidates", []) or [])
                if candidates:
                    parsed.append(
                        {
                            "day_index": index,
                            "candidates": [_poi_card(c) for c in candidates],
                        }
                    )
            if parsed:
                reply = _clip_reply(
                    data.get("reply") if isinstance(data, dict) else None,
                    f"已为你整理好「{destination}」的候选，点左侧空位逐个添加。",
                )
                return {
                    "city": destination,
                    "day_count": day_count,
                    "reply": reply,
                    "days": _normalize_days(parsed, day_count),
                    "degraded": False,
                }
            if attempt == 0:
                messages = messages + [
                    {"role": "user", "content": "格式不符或为空，请重新只输出合规 JSON。"}
                ]
                continue
        except Exception:
            if attempt == 0:
                continue
            logger.exception("plan_suggestions_failed destination=%s", destination)
            break
    logger.info("plan_suggestions_degraded destination=%s", destination)
    return _fallback_suggestions(destination, day_count)


def stream_plan_events(query: str) -> Iterator[str]:
    yield sse("status", {"text": "解析意图…"})
    intent = workflow.parse_intent(query)
    yield sse("intent", {"city": intent.city, "day_count": intent.day_count})

    skeleton = amap_stub.hot_pois(intent.city, limit=max(intent.day_count * 2, 3))
    yield sse("skeleton", {"pois": poi_dicts(skeleton)})

    yield sse("status", {"text": "AI 规划中…"})
    try:
        pois, degraded = workflow.recommend_pois(intent)
    except Exception:
        logger.exception("plan_recommend_failed city=%s", intent.city)
        pois, degraded = amap_stub.hot_pois(intent.city), True
    if degraded:
        logger.info("plan_degraded reason=llm_unavailable_or_invalid city=%s", intent.city)
        yield sse("degraded", {"reason": "llm_unavailable_or_invalid"})

    buckets = workflow.route_and_split(pois, intent)
    draft = workflow.assemble_draft(intent, buckets)

    yield sse("status", {"text": "生成行程…"})
    yield sse("itinerary", synth_tree(draft))
    yield sse("done", {})
