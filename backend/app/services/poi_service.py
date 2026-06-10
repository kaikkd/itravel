import logging

from app import amap_stub, llm, validators, workflow

logger = logging.getLogger(__name__)

CATEGORIES = {"eat", "stay", "play"}
CAT_LABEL = {"eat": "美食/吃", "stay": "住宿", "play": "景点/玩乐"}


def build_category_prompt(city: str, category: str, exclude: list[str]) -> list[dict]:
    label = CAT_LABEL.get(category, category)
    avoid = "、".join(exclude) if exclude else "无"
    system = (
        "你是旅游规划助手。只输出 JSON，不要任何解释或 markdown 代码块。"
        '输出格式：{"pois":[{"name":str,"category":"'
        f'{category}","lng":number,"lat":number,"address":str,"rec_reason":str}}]}}。'
        "rec_reason 不超过 50 字。lng/lat 用真实经纬度（GCJ-02）。"
    )
    user = (
        f"为「{city}」推荐 4 个「{label}」类（category 固定为 {category}）的 POI，"
        f"按推荐价值排序。避免重复以下已出现过的地点：{avoid}。"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


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


def regenerate_llm(city: str, category: str, exclude: list[str]) -> tuple[list, bool]:
    messages = build_category_prompt(city, category, exclude)
    exclude_set = set(exclude)
    for attempt in range(2):
        try:
            buffer = "".join(llm.stream_chat(messages))
            data = workflow._extract_json(buffer)
            raw = data.get("pois", []) if isinstance(data, dict) else []
            pois = validators.validate_llm_pois(raw)
            pois = [p for p in pois if p.category == category and p.name not in exclude_set]
            if pois:
                return pois, False
            if attempt == 0:
                messages = messages + [
                    {"role": "user", "content": "候选不足或格式不符，请重新只输出合规 JSON。"}
                ]
                continue
        except Exception:
            if attempt == 0:
                continue
            logger.exception("poi_regenerate_failed city=%s category=%s", city, category)
            break
    logger.info("poi_degraded city=%s category=%s", city, category)
    return amap_stub.candidates(city, category, exclude=exclude_set), True


def get_candidates(
    city: str,
    category: str,
    exclude: str = "",
    regenerate: bool = False,
) -> dict:
    if category not in CATEGORIES:
        return {"pois": [], "degraded": False}
    exclude_items = [s.strip() for s in exclude.split(",") if s.strip()]

    if regenerate:
        pois, degraded = regenerate_llm(city, category, exclude_items)
    else:
        pois, degraded = amap_stub.candidates(
            city, category, exclude=set(exclude_items)
        ), False

    return {"pois": poi_dicts(pois), "degraded": degraded}
