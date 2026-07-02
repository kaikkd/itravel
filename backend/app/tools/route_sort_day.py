import math
from collections.abc import Sequence
from typing import Protocol, TypeVar

from app.schemas import POICreate


class RouteStop(Protocol):
    slot: str
    poi: POICreate


StopT = TypeVar("StopT", bound=RouteStop)


def _has_coord(poi: POICreate) -> bool:
    return poi.lng is not None and poi.lat is not None


def _haversine_m(a_lng: float, a_lat: float, b_lng: float, b_lat: float) -> int:
    radius = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dphi = math.radians(b_lat - a_lat)
    dlmb = math.radians(b_lng - a_lng)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return int(2 * radius * math.asin(math.sqrt(h)))


def _nearest_attractions(
    attractions: Sequence[StopT],
    start_lng: float | None,
    start_lat: float | None,
) -> list[StopT]:
    with_coords = [
        (stop, float(stop.poi.lng), float(stop.poi.lat))
        for stop in attractions
        if _has_coord(stop.poi)
    ]
    without_coords = [stop for stop in attractions if not _has_coord(stop.poi)]
    if len(with_coords) <= 1:
        return [item[0] for item in with_coords] + without_coords

    remaining = with_coords[:]
    ordered: list[StopT] = []

    if start_lng is not None and start_lat is not None:
        current_lng, current_lat = start_lng, start_lat
    else:
        first, current_lng, current_lat = remaining.pop(0)
        ordered.append(first)

    while remaining:
        next_stop, next_lng, next_lat = min(
            remaining,
            key=lambda item: _haversine_m(
                current_lng,
                current_lat,
                item[1],
                item[2],
            ),
        )
        ordered.append(next_stop)
        remaining.remove((next_stop, next_lng, next_lat))
        current_lng, current_lat = next_lng, next_lat

    return ordered + without_coords


def _split_attractions(
    attractions: list[StopT],
    has_lunch: bool,
    has_evening_anchor: bool,
) -> tuple[list[StopT], list[StopT]]:
    if not has_lunch or not has_evening_anchor:
        return attractions, []
    half = math.ceil(len(attractions) / 2)
    return attractions[:half], attractions[half:]


def route_sort_day(
    stops: Sequence[StopT],
    start_lng: float | None = None,
    start_lat: float | None = None,
) -> list[StopT]:
    """Return a deterministic day timeline sorted by slot semantics and distance.

    The tool keeps fixed meal/hotel slots on a simple day backbone, sorts
    attractions with nearest-neighbor routing, and leaves unclassified stops at
    the end in their original order.
    """
    original = list(stops)
    meals = {
        stop.slot: stop
        for stop in original
        if stop.slot in ("breakfast", "lunch", "dinner")
    }
    hotel = next((stop for stop in original if stop.slot == "hotel"), None)
    attractions = [stop for stop in original if stop.slot == "attraction"]
    sorted_attractions = _nearest_attractions(attractions, start_lng, start_lat)
    morning, afternoon = _split_attractions(
        sorted_attractions,
        has_lunch="lunch" in meals,
        has_evening_anchor=("dinner" in meals or hotel is not None),
    )

    ordered: list[StopT] = []
    if "breakfast" in meals:
        ordered.append(meals["breakfast"])
    ordered.extend(morning)
    if "lunch" in meals:
        ordered.append(meals["lunch"])
    ordered.extend(afternoon)
    if "dinner" in meals:
        ordered.append(meals["dinner"])
    if hotel is not None:
        ordered.append(hotel)

    used = {id(stop) for stop in ordered}
    ordered.extend(stop for stop in original if id(stop) not in used)
    return ordered
