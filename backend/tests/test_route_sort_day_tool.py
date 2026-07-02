from app.schemas import POICreate
from app.tools.route_sort_day import route_sort_day
from app.workflow import PlanStop


def _stop(name: str, slot: str, category: str, lng=None, lat=None) -> PlanStop:
    return PlanStop(
        slot=slot,
        poi=POICreate(name=name, category=category, lng=lng, lat=lat),
    )


def test_route_sort_day_keeps_timeline_slots_and_sorts_attractions_by_distance():
    stops = [
        _stop("酒店", "hotel", "stay", 104.08, 30.65),
        _stop("午餐", "lunch", "eat", 104.06, 30.65),
        _stop("远景点", "attraction", "play", 104.20, 30.65),
        _stop("早餐", "breakfast", "eat", 104.00, 30.65),
        _stop("近景点", "attraction", "play", 104.02, 30.65),
        _stop("中景点", "attraction", "play", 104.04, 30.65),
        _stop("晚餐", "dinner", "eat", 104.07, 30.65),
    ]

    ordered = route_sort_day(stops, start_lng=104.0, start_lat=30.65)

    assert [s.poi.name for s in ordered] == [
        "早餐",
        "近景点",
        "中景点",
        "午餐",
        "远景点",
        "晚餐",
        "酒店",
    ]


def test_route_sort_day_puts_missing_coordinates_after_sortable_attractions():
    stops = [
        _stop("早餐", "breakfast", "eat", 104.00, 30.65),
        _stop("未知坐标景点", "attraction", "play"),
        _stop("远景点", "attraction", "play", 104.20, 30.65),
        _stop("近景点", "attraction", "play", 104.02, 30.65),
        _stop("午餐", "lunch", "eat", 104.06, 30.65),
    ]

    ordered = route_sort_day(stops, start_lng=104.0, start_lat=30.65)

    assert [s.poi.name for s in ordered] == [
        "早餐",
        "近景点",
        "远景点",
        "未知坐标景点",
        "午餐",
    ]


def test_route_sort_day_does_not_mutate_input_stops():
    stops = [
        _stop("午餐", "lunch", "eat", 104.06, 30.65),
        _stop("近景点", "attraction", "play", 104.02, 30.65),
        _stop("早餐", "breakfast", "eat", 104.00, 30.65),
    ]

    route_sort_day(stops, start_lng=104.0, start_lat=30.65)

    assert [s.poi.name for s in stops] == ["午餐", "近景点", "早餐"]
