import math
from collections.abc import Sequence

from app.tools.schemas import RouteSortResult, RouteSortWarning, RouteStop, StopRole


def _has_coord(stop: RouteStop) -> bool:
    poi = stop.poi
    return poi.lng is not None and poi.lat is not None


def _haversine_m(a_lng: float, a_lat: float, b_lng: float, b_lat: float) -> int:
    radius = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dphi = math.radians(b_lat - a_lat)
    dlmb = math.radians(b_lng - a_lng)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return int(2 * radius * math.asin(math.sqrt(h)))


_ROLE_ALIASES: dict[str, StopRole] = {
    "breakfast": "breakfast",
    "morning_meal": "breakfast",
    "早餐": "breakfast",
    "早饭": "breakfast",
    "早茶": "breakfast",
    "lunch": "lunch",
    "noon_meal": "lunch",
    "午餐": "lunch",
    "午饭": "lunch",
    "dinner": "dinner",
    "evening_meal": "dinner",
    "晚餐": "dinner",
    "晚饭": "dinner",
    "attraction": "attraction",
    "sight": "attraction",
    "sightseeing": "attraction",
    "poi": "attraction",
    "play": "attraction",
    "景点": "attraction",
    "游玩": "attraction",
    "体验": "attraction",
    "hotel": "hotel",
    "lodging": "hotel",
    "stay": "hotel",
    "住宿": "hotel",
    "酒店": "hotel",
}


def _normalize_role(stop: RouteStop) -> tuple[StopRole, RouteSortWarning | None]:
    slot_key = (stop.slot or "").strip().lower()
    category = stop.poi.category
    if slot_key in _ROLE_ALIASES:
        return _ROLE_ALIASES[slot_key], None

    if category == "play":
        return "attraction", RouteSortWarning(
            code="category_role_fallback",
            stop_name=stop.poi.name,
            slot=stop.slot,
            category=category,
            message="Unrecognized slot; inferred attraction role from POI category.",
        )
    if category == "stay":
        return "hotel", RouteSortWarning(
            code="category_role_fallback",
            stop_name=stop.poi.name,
            slot=stop.slot,
            category=category,
            message="Unrecognized slot; inferred hotel role from POI category.",
        )
    if category == "eat":
        return "unknown", RouteSortWarning(
            code="ambiguous_meal_role",
            stop_name=stop.poi.name,
            slot=stop.slot,
            category=category,
            message="Meal category does not identify breakfast, lunch, or dinner.",
        )

    return "unknown", RouteSortWarning(
        code="unknown_role",
        stop_name=stop.poi.name,
        slot=stop.slot,
        category=category,
        message="Could not infer a route sorting role.",
    )


def _nearest_attractions(
    attractions: Sequence[RouteStop],
    start_lng: float | None,
    start_lat: float | None,
) -> list[RouteStop]:
    with_coords = [
        (stop, float(stop.poi.lng), float(stop.poi.lat))
        for stop in attractions
        if _has_coord(stop)
    ]
    without_coords = [stop for stop in attractions if not _has_coord(stop)]
    if len(with_coords) <= 1:
        return [item[0] for item in with_coords] + without_coords

    remaining = with_coords[:]
    ordered: list[RouteStop] = []

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
    attractions: list[RouteStop],
    has_lunch: bool,
    has_evening_anchor: bool,
) -> tuple[list[RouteStop], list[RouteStop]]:
    if not has_lunch or not has_evening_anchor:
        return attractions, []
    half = math.ceil(len(attractions) / 2)
    return attractions[:half], attractions[half:]


def route_sort_day(
    stops: Sequence[RouteStop],
    start_lng: float | None = None,
    start_lat: float | None = None,
) -> RouteSortResult:
    """Return a deterministic day timeline sorted by slot semantics and distance.

    Input slots may use canonical English values or common Chinese aliases.
    The algorithm works on normalized roles and returns warnings for fallback
    decisions that an agent harness may want to inspect.
    """
    original = list(stops)
    warnings: list[RouteSortWarning] = []
    grouped: dict[StopRole, list[RouteStop]] = {
        "breakfast": [],
        "lunch": [],
        "dinner": [],
        "attraction": [],
        "hotel": [],
        "unknown": [],
    }
    for stop in original:
        role, warning = _normalize_role(stop)
        grouped[role].append(stop)
        if warning is not None:
            warnings.append(warning)
        if not _has_coord(stop):
            warnings.append(
                RouteSortWarning(
                    code="missing_coordinates",
                    stop_name=stop.poi.name,
                    slot=stop.slot,
                    category=stop.poi.category,
                    message="Stop has no complete coordinate pair.",
                )
            )

    attractions = grouped["attraction"]
    sorted_attractions = _nearest_attractions(attractions, start_lng, start_lat)
    morning, afternoon = _split_attractions(
        sorted_attractions,
        has_lunch=bool(grouped["lunch"]),
        has_evening_anchor=bool(grouped["dinner"] or grouped["hotel"]),
    )

    ordered: list[RouteStop] = []
    ordered.extend(grouped["breakfast"])
    ordered.extend(morning)
    ordered.extend(grouped["lunch"])
    ordered.extend(afternoon)
    ordered.extend(grouped["dinner"])
    ordered.extend(grouped["hotel"])
    ordered.extend(grouped["unknown"])

    return RouteSortResult(
        stops=ordered,
        degraded=bool(warnings),
        warnings=warnings,
    )
