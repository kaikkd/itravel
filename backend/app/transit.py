import math

import httpx
from cachetools import TTLCache

from app.config import settings

# 两点交通段重算（dev_doc §5.1 增量重算 / §5.2 进程内缓存）。
# 缓存键 from_to_mode，TTL 1h；命中即复用，避免拖拽高频打爆高德 QPS（R1）。
# 有服务端 amap_key → 调高德 Web 服务驾车 API；否则 haversine 估算兜底（degraded）。

_cache: TTLCache = TTLCache(maxsize=512, ttl=3600)

_DRIVING_URL = "https://restapi.amap.com/v3/direction/driving"
_DETOUR = 1.3  # 直线→实际路网绕路系数
_CITY_SPEED = 8.3  # m/s ≈ 30km/h 城区车速


def _key(flng, flat, tlng, tlat, mode) -> str:
    return f"{flng:.5f},{flat:.5f}_{tlng:.5f},{tlat:.5f}_{mode}"


def _haversine_m(flng, flat, tlng, tlat) -> int:
    r = 6371000.0
    p1, p2 = math.radians(flat), math.radians(tlat)
    dphi = math.radians(tlat - flat)
    dlmb = math.radians(tlng - flng)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(h)))


def _estimate(flng, flat, tlng, tlat) -> dict:
    straight = _haversine_m(flng, flat, tlng, tlat)
    dist = int(straight * _DETOUR)
    return {
        "distance_meters": dist,
        "duration_seconds": int(dist / _CITY_SPEED),
        "degraded": True,
    }


def _amap_driving(flng, flat, tlng, tlat) -> dict | None:
    """调高德 Web 服务驾车 API；任何异常返回 None 由上层兜底。"""
    try:
        resp = httpx.get(
            _DRIVING_URL,
            params={
                "key": settings.amap_key,
                "origin": f"{flng},{flat}",
                "destination": f"{tlng},{tlat}",
            },
            timeout=4.0,
        )
        data = resp.json()
        if data.get("status") != "1" or not data.get("route", {}).get("paths"):
            return None
        path = data["route"]["paths"][0]
        return {
            "distance_meters": int(path["distance"]),
            "duration_seconds": int(path["duration"]),
            "degraded": False,
        }
    except Exception:
        return None


def recompute_segment(
    from_lng: float | None,
    from_lat: float | None,
    to_lng: float | None,
    to_lat: float | None,
    mode: str = "driving",
) -> dict:
    """单段重算。坐标缺失 → 空段；其余优先高德、失败 haversine 估算。"""
    if None in (from_lng, from_lat, to_lng, to_lat):
        return {"distance_meters": None, "duration_seconds": None, "degraded": True}

    k = _key(from_lng, from_lat, to_lng, to_lat, mode)
    if k in _cache:
        return _cache[k]

    result = None
    if settings.amap_key:
        result = _amap_driving(from_lng, from_lat, to_lng, to_lat)
    if result is None:
        result = _estimate(from_lng, from_lat, to_lng, to_lat)

    _cache[k] = result
    return result
