from dataclasses import dataclass

import httpx
from cachetools import TTLCache

from app import amap_stub, validators
from app.config import settings
from app.schemas import POICreate

_SEARCH_URL = "https://restapi.amap.com/v3/place/text"
_CACHE: TTLCache = TTLCache(maxsize=256, ttl=3600)

_CATEGORY_KEYWORD = {
    "eat": "美食",
    "stay": "酒店",
    "play": "景点",
}
_CATEGORY_TYPES = {
    "eat": "050000",
    "stay": "100000",
    "play": "110000",
}


@dataclass
class CandidateResult:
    pois: list[POICreate]
    degraded: bool


def clear_cache() -> None:
    _CACHE.clear()


def _cache_key(city: str, category: str, keyword: str, limit: int) -> str:
    return f"{city.strip()}|{category}|{keyword.strip()}|{limit}"


def _text(value) -> str | None:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def _parse_location(value) -> tuple[float, float] | None:
    if not isinstance(value, str) or "," not in value:
        return None
    lng_s, lat_s = value.split(",", 1)
    try:
        lng, lat = float(lng_s), float(lat_s)
    except ValueError:
        return None
    if not validators.valid_coord(lng, lat):
        return None
    return lng, lat


def _poi_from_amap(raw: dict, category: str) -> POICreate | None:
    name = _text(raw.get("name"))
    loc = _parse_location(raw.get("location"))
    if not name or loc is None:
        return None
    lng, lat = loc
    return POICreate(
        amap_id=_text(raw.get("id")),
        name=name,
        category=category,
        lng=lng,
        lat=lat,
        address=_text(raw.get("address")),
    )


def _query_amap(city: str, category: str, keyword: str, limit: int) -> list[POICreate]:
    if not settings.amap_key:
        return []
    query = keyword.strip() or _CATEGORY_KEYWORD.get(category, "景点")
    offset = max(1, min(max(limit, 10), 25))
    params = {
        "key": settings.amap_key,
        "keywords": query,
        "types": _CATEGORY_TYPES.get(category, ""),
        "city": city,
        "citylimit": "true",
        "offset": str(offset),
        "page": "1",
        "extensions": "base",
        "output": "JSON",
    }
    response = httpx.get(_SEARCH_URL, params=params, timeout=4.0)
    data = response.json()
    if data.get("status") != "1":
        return []
    pois = data.get("pois")
    if not isinstance(pois, list):
        return []
    parsed = [_poi_from_amap(p, category) for p in pois if isinstance(p, dict)]
    return [p for p in parsed if p is not None]


def candidates(
    city: str,
    category: str,
    *,
    keyword: str = "",
    exclude: set[str] | None = None,
    limit: int = 4,
) -> CandidateResult:
    exclude = exclude or set()
    if not settings.amap_key:
        fallback = amap_stub.candidates(city, category, exclude=exclude, limit=limit)
        return CandidateResult(pois=fallback, degraded=True)

    query_limit = max(limit * 2, limit)
    key = _cache_key(city, category, keyword, query_limit)

    pois = _CACHE.get(key)
    if pois is None:
        try:
            pois = _query_amap(city, category, keyword, query_limit)
        except Exception:
            pois = []
        if pois:
            _CACHE[key] = pois

    filtered = [p for p in pois if p.name not in exclude] if pois else []
    if filtered:
        return CandidateResult(pois=filtered[:limit], degraded=False)

    fallback = amap_stub.candidates(city, category, exclude=exclude, limit=limit)
    return CandidateResult(pois=fallback, degraded=True)
