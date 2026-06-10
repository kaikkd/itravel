import json
import logging
from collections.abc import Iterator

from app import amap_stub, workflow
from app.schemas import ItineraryCreate

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
