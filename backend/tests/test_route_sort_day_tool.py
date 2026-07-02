from app.tools.schemas import RouteStop, ToolPOI
from app.tools.route_sort_day import normalize_stop_role, route_sort_day


def _stop(name: str, slot: str, category: str, lng=None, lat=None) -> RouteStop:
    return RouteStop(
        slot=slot,
        poi=ToolPOI(name=name, category=category, lng=lng, lat=lat),
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

    assert ordered.degraded is False
    assert ordered.warnings == []
    assert [s.poi.name for s in ordered.stops] == [
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

    assert ordered.degraded is True
    assert [(w.code, w.severity) for w in ordered.warnings] == [
        ("missing_coordinates", "warning")
    ]
    assert [s.poi.name for s in ordered.stops] == [
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


def test_route_sort_day_accepts_chinese_slots_and_preserves_original_values():
    stops = [
        _stop("酒店", "住宿", "stay", 104.08, 30.65),
        _stop("午餐", "午餐", "eat", 104.06, 30.65),
        _stop("远景点", "景点", "play", 104.20, 30.65),
        _stop("早餐", "早餐", "eat", 104.00, 30.65),
        _stop("近景点", "游玩", "play", 104.02, 30.65),
        _stop("晚餐", "晚饭", "eat", 104.07, 30.65),
    ]

    ordered = route_sort_day(stops, start_lng=104.0, start_lat=30.65)

    assert ordered.degraded is False
    assert [s.poi.name for s in ordered.stops] == [
        "早餐",
        "近景点",
        "午餐",
        "远景点",
        "晚餐",
        "酒店",
    ]
    assert ordered.stops[0].slot == "早餐"


def test_route_sort_day_falls_back_from_category_without_guessing_meal_slots():
    stops = [
        _stop("空 slot 景点", "", "play", 104.02, 30.65),
        _stop("空 slot 酒店", "", "stay", 104.08, 30.65),
        _stop("空 slot 餐厅", "", "eat", 104.06, 30.65),
    ]

    ordered = route_sort_day(stops, start_lng=104.0, start_lat=30.65)

    assert ordered.degraded is True
    assert [s.poi.name for s in ordered.stops] == [
        "空 slot 景点",
        "空 slot 酒店",
        "空 slot 餐厅",
    ]
    assert [(w.code, w.severity) for w in ordered.warnings] == [
        ("category_role_fallback", "info"),
        ("category_role_fallback", "info"),
        ("ambiguous_meal_role", "warning"),
    ]


def test_route_sort_day_warns_when_inferring_role_from_unknown_slot():
    stops = [
        _stop("早餐", "breakfast", "eat", 104.00, 30.65),
        _stop("未知活动", "自由活动", "play", 104.03, 30.65),
        _stop("景点", "attraction", "play", 104.02, 30.65),
    ]

    ordered = route_sort_day(stops, start_lng=104.0, start_lat=30.65)

    assert ordered.degraded is False
    assert [s.poi.name for s in ordered.stops] == ["早餐", "景点", "未知活动"]
    assert [(w.code, w.severity, w.stop_name) for w in ordered.warnings] == [
        ("category_role_fallback", "info", "未知活动")
    ]


def test_normalize_stop_role_is_public_and_returns_warning_severity():
    role, warning = normalize_stop_role(_stop("随便逛", "自由活动", "play"))

    assert role == "attraction"
    assert warning is not None
    assert warning.code == "category_role_fallback"
    assert warning.severity == "info"


def test_route_sort_day_marks_unknown_role_as_error():
    unknown = RouteStop(
        slot="自由活动",
        poi=ToolPOI(name="未知地点", category="other", lng=104.03, lat=30.65),
    )

    ordered = route_sort_day([unknown], start_lng=104.0, start_lat=30.65)

    assert ordered.degraded is True
    assert ordered.warnings[0].code == "unknown_role"
    assert ordered.warnings[0].severity == "error"
