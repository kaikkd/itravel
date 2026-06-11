import json
import logging
from collections.abc import Iterator

from app import workflow
from app.schemas import ItineraryCreate

logger = logging.getLogger(__name__)


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


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


def _clip_reply(reply: str | None, fallback: str) -> str:
    text = reply.strip().replace("\n", " ") if isinstance(reply, str) else ""
    if not text:
        return fallback
    return text if len(text) <= 60 else text[:59] + "…"


# 时间轴骨架槽位（不调 LLM，用于 TTFP ≤5s 首屏占位）。
_SKELETON_SLOTS = ["breakfast", "attraction", "lunch", "attraction", "dinner", "hotel"]


def _skeleton(intent: workflow.Intent) -> dict:
    return {
        "city": intent.city,
        "day_count": intent.day_count,
        "days": [
            {"day_index": i, "slots": list(_SKELETON_SLOTS)}
            for i in range(1, intent.day_count + 1)
        ],
    }


def stream_plan_events(req) -> Iterator[str]:
    """每日全景时间轴流式规划。req 为 PlanStreamIn。"""
    yield sse("status", {"text": "理解你的需求…"})
    intent = workflow.build_intent(req)
    yield sse(
        "intent",
        {
            "city": intent.city,
            "day_count": intent.day_count,
            "preferences": intent.preferences,
        },
    )
    yield sse("skeleton", _skeleton(intent))

    yield sse("status", {"text": "AI 规划中…"})
    try:
        days, degraded = workflow.recommend_plan(req)
    except Exception:
        logger.exception("plan_recommend_failed city=%s", intent.city)
        days, degraded = workflow._fallback_plan(intent), True
    if degraded:
        logger.info("plan_degraded reason=llm_unavailable_or_invalid city=%s", intent.city)
        yield sse("degraded", {"reason": "llm_unavailable_or_invalid"})

    ordered = [workflow.order_day_stops(d) for d in days]
    draft = workflow.assemble_draft(req, ordered)
    tree = synth_tree(draft)

    llm_reply = getattr(days[0], "_reply", None) if days else None
    fallback_reply = (
        f"AI 暂不可用，先用「{intent.city}」热门地点为你拼了行程，可在左侧调整。"
        if degraded
        else f"已为你排好「{intent.city}」{intent.day_count} 天的行程，含吃住玩，左侧可微调。"
    )
    yield sse("reply", {"text": _clip_reply(llm_reply, fallback_reply)})

    for day in tree["days"]:
        yield sse("day", day)
    yield sse("itinerary", tree)
    yield sse("done", {"itinerary_id": None})
