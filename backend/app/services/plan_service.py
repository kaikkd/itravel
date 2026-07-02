import json
import logging
from collections.abc import Callable, Iterator

from app import llm, validators, workflow
from app.services import amap_service
from app.schemas import ItineraryCreate

logger = logging.getLogger(__name__)


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _id_counter() -> Callable[[], int]:
    """递减负数 id 生成器，区别于后端正 id；流式期间跨天共享以保证唯一。"""
    cid = -1

    def nid() -> int:
        nonlocal cid
        value = cid
        cid -= 1
        return value

    return nid


def _synth_day(day_in, nid: Callable[[], int]) -> dict:
    """单天 DayCreate → 前端 day 树（合成负 id，transit 引用本天 stop id）。"""
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
    return {
        "id": nid(),
        "day_index": day_in.day_index,
        "stops": stops,
        "transits": transits,
    }


def synth_tree(draft: ItineraryCreate) -> dict:
    """Build frontend Itinerary shape with synthetic negative ids.

    Planning drafts intentionally do not hit the database; explicit save binds
    the tree to the logged-in user later.
    """
    nid = _id_counter()
    days = [_synth_day(day_in, nid) for day_in in draft.days]
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


def _skeleton_for(city: str, day_count: int) -> dict:
    return {
        "city": city,
        "day_count": day_count,
        "days": [
            {"day_index": i, "slots": list(_SKELETON_SLOTS)}
            for i in range(1, day_count + 1)
        ],
    }


def _success_reply(intent: workflow.Intent, day_n: int | None = None) -> str:
    n = day_n if day_n is not None else intent.day_count
    return f"已为你排好「{intent.city}」{n} 天的行程，含吃住玩，左侧可微调。"


def _degraded_reply(intent: workflow.Intent) -> str:
    return f"AI 暂不可用，先用「{intent.city}」热门地点为你拼了行程，可在左侧调整。"


def _finish_tree(intent: workflow.Intent, synth_days: list[dict], nid: Callable[[], int]) -> dict:
    """把已逐天合成的 day 列表收口成整树（复用同一批 day 与共享 id）。"""
    return {
        "id": nid(),
        "user_id": None,
        "title": f"{intent.city}{intent.day_count}日游",
        "city": intent.city,
        "status": "draft",
        "day_count": max(len(synth_days), 1),
        "days": synth_days,
    }


def _stream_default(req, intent: workflow.Intent) -> Iterator[str]:
    """默认（day_count）路径：边流式边按天下发，第一天约数秒即可出现。"""
    yield sse("skeleton", _skeleton(intent))
    yield sse("status", {"text": "AI 规划中…"})

    nid = _id_counter()
    synth_days: list[dict] = []
    reply_done = False

    def emit_day(day_plan) -> str:
        ordered = workflow.order_day_stops(day_plan)
        day_tree = _synth_day(workflow.assemble_day(ordered), nid)
        synth_days.append(day_tree)
        return sse("day", day_tree)

    for kind, payload in workflow.stream_plan_days(req):
        if kind == "reply":
            yield sse("reply", {"text": _clip_reply(payload, _success_reply(intent))})
            reply_done = True
        elif kind == "day":
            yield emit_day(payload)
        elif kind == "end":
            if synth_days:
                break
            # 流式未产出任何天：用全量解析救回的天，或退到高德桩。
            recovered = payload.get("fallback_days") or []
            degraded = not recovered
            days = recovered or workflow._fallback_plan(intent)
            if degraded:
                logger.info("plan_degraded reason=llm_unavailable_or_invalid city=%s", intent.city)
                yield sse("degraded", {"reason": "llm_unavailable_or_invalid"})
            if not reply_done:
                fb = _degraded_reply(intent) if degraded else _success_reply(intent)
                yield sse("reply", {"text": _clip_reply(payload.get("reply"), fb)})
                reply_done = True
            for d in days:
                yield emit_day(d)

    yield sse("itinerary", _finish_tree(intent, synth_days, nid))
    yield sse("done", {"itinerary_id": None})


def _stream_from_pois(req, intent: workflow.Intent) -> Iterator[str]:
    """route_first（poi_list）路径：需先估天数再发骨架，沿用缓冲式规划。"""
    yield sse("status", {"text": "AI 估算天数并编排…"})
    try:
        days, est_days, degraded = workflow.recommend_plan_from_pois(req)
    except Exception:
        logger.exception("plan_from_pois_failed city=%s", intent.city)
        days, est_days = workflow._fallback_plan_from_pois(req, intent)
        degraded = True
    yield sse("estimate", {"day_count": est_days})
    yield sse("skeleton", _skeleton_for(intent.city, max(len(days), 1)))
    if degraded:
        logger.info("plan_degraded reason=llm_unavailable_or_invalid city=%s", intent.city)
        yield sse("degraded", {"reason": "llm_unavailable_or_invalid"})

    ordered = [workflow.order_day_stops(d) for d in days]
    tree = synth_tree(workflow.assemble_draft(req, ordered))
    llm_reply = getattr(days[0], "_reply", None) if days else None
    fallback = _degraded_reply(intent) if degraded else _success_reply(intent, len(tree["days"]))
    yield sse("reply", {"text": _clip_reply(llm_reply, fallback)})
    for day in tree["days"]:
        yield sse("day", day)
    yield sse("itinerary", tree)
    yield sse("done", {"itinerary_id": None})


def stream_plan_events(req) -> Iterator[str]:
    """每日全景时间轴流式规划。req 为 PlanStreamIn。

    plan_source=day_count（默认）：按指定天数规划，按天渐进下发。
    plan_source=poi_list：基于用户已选 POI + 节奏，先让 LLM 估天数再排程（#11）。
    """
    from_pois = getattr(req, "plan_source", "day_count") == "poi_list"
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

    if from_pois:
        yield from _stream_from_pois(req, intent)
    else:
        yield from _stream_default(req, intent)


# ---- 景点候选（route_first 选景点板，#11）----

_CATEGORY_CN = {"eat": "餐饮美食", "stay": "酒店住宿", "play": "景点/体验"}


def _poi_out(p) -> dict:
    return {
        "amap_id": p.amap_id,
        "name": p.name,
        "category": p.category,
        "lng": p.lng,
        "lat": p.lat,
        "address": p.address,
        "rec_reason": p.rec_reason,
    }


def candidate_pois(
    *, city: str, category: str | None, keyword: str, limit: int
) -> dict:
    """LLM 按城市+类型推荐知名候选；失败/空回退高德桩。返回 {pois, degraded}。"""
    cat_cn = _CATEGORY_CN.get(category or "play", "知名景点与体验")
    kw = f"，偏好关键词：{keyword}" if keyword else ""
    system = (
        "你是中国境内旅游推荐助手。只输出 JSON，不要任何解释或 markdown 代码块。"
        '输出格式：{"pois":[{"name":str,"category":"eat|stay|play","lng":number,'
        '"lat":number,"address":str,"rec_reason":str}]}。'
        "lng/lat 必须是高德 GCJ-02 真实坐标且在中国境内；rec_reason ≤50 字。"
    )
    user = (
        f"请推荐「{city}」最值得去的 {cat_cn} {limit} 个{kw}，"
        "按知名度/口碑排序，覆盖代表性地点。"
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    try:
        buf = "".join(llm.stream_chat(messages, max_tokens=2000))
        data = workflow._extract_json(buf)
        raw = data.get("pois", []) if isinstance(data, dict) else []
        pois = validators.validate_llm_pois(raw)
        if category:
            same = [p for p in pois if p.category == category]
            pois = same or pois  # 类目过滤，过滤空则不强制
        if pois:
            return {"pois": [_poi_out(p) for p in pois[:limit]], "degraded": False}
    except Exception:
        logger.info("candidates_degraded city=%s category=%s", city, category)
    result = amap_service.candidates(
        city,
        category or "play",
        keyword=keyword,
        limit=limit,
    )
    return {"pois": [_poi_out(p) for p in result.pois], "degraded": result.degraded}


# ---- 候选城市（route_first path B 选城，#11）----


def suggest_city(*, free_text: str, history: list) -> dict:
    """LLM 按兴趣/景点类型推荐候选城市；失败回退常见城市。返回 {reply, cities, degraded}。"""
    system = (
        "你是中国境内旅游目的地推荐助手。只输出 JSON，不要任何解释或 markdown 代码块。"
        '输出格式：{"reply":str,"cities":[{"name":str,"reason":str}]}。'
        "reply 是一句话中文回复（≤40 字）；推荐 3-5 个中国城市，name 为城市名（如「成都」），"
        "reason 说明为何契合用户兴趣（≤30 字）。"
    )
    messages = [{"role": "system", "content": system}]
    for turn in history or []:
        role = getattr(turn, "role", "user")
        messages.append({"role": role, "content": getattr(turn, "content", "")})
    messages.append(
        {"role": "user", "content": f"我的旅行兴趣/想看的景点类型：{free_text or '随便逛逛'}。请推荐合适的城市。"}
    )
    try:
        buf = "".join(llm.stream_chat(messages, max_tokens=800))
        data = workflow._extract_json(buf)
        cities = data.get("cities") if isinstance(data, dict) else None
        if isinstance(cities, list) and cities:
            clean = [
                {"name": str(c.get("name", "")).strip(), "reason": str(c.get("reason", "")).strip()}
                for c in cities
                if isinstance(c, dict) and str(c.get("name", "")).strip()
            ]
            if clean:
                reply = _clip_reply(
                    data.get("reply") if isinstance(data, dict) else None,
                    "为你挑了几个合适的城市，点选一个继续。",
                )
                return {"reply": reply, "cities": clean[:5], "degraded": False}
    except Exception:
        logger.info("suggest_city_degraded")
    # 兜底：常见目的地
    fallback = [
        {"name": "成都", "reason": "美食与休闲都很丰富"},
        {"name": "杭州", "reason": "山水人文兼具"},
        {"name": "西安", "reason": "历史古迹集中"},
        {"name": "重庆", "reason": "山城夜景与火锅"},
    ]
    return {
        "reply": "AI 暂不可用，先给你几个热门城市参考。",
        "cities": fallback,
        "degraded": True,
    }
