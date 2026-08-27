from app.agent.registry import build_default_registry
from app.agent.schemas import ToolCall, ToolContext


def _call(name: str, args: dict):
    return build_default_registry().call(ToolCall(name=name, args=args), ToolContext(run_id="tools-test"))


def test_parse_user_intent_tool_extracts_city_days_and_preferences():
    result = _call("parse_user_intent", {"query": "重庆玩两天，想吃辣，轻松一点"})

    assert result.ok is True
    assert result.data["city"] == "重庆"
    assert result.data["day_count"] == 2
    assert "辣" in result.data["preferences"]
    assert "轻松" in result.data["preferences"]


def test_estimate_visit_duration_tool_uses_route_role_defaults():
    result = _call("estimate_visit_duration", {"slot": "attraction"})

    assert result.ok is True
    assert result.data["stay_minutes"] == 120
    assert result.degraded is False


def test_compute_transit_tool_degrades_when_coordinates_missing():
    result = _call(
        "compute_transit",
        {
            "from_lng": None,
            "from_lat": 30.65,
            "to_lng": 104.02,
            "to_lat": 30.65,
            "mode": "driving",
        },
    )

    assert result.ok is True
    assert result.degraded is True
    assert result.data["duration_seconds"] is None


def test_validate_itinerary_tool_reports_contract_warnings():
    result = _call(
        "validate_itinerary",
        {
            "itinerary": {
                "title": "测试",
                "city": "成都",
                "status": "draft",
                "days": [
                    {
                        "day_index": 1,
                        "stops": [
                            {
                                "order_index": 1,
                                "arrive_time": "12:00",
                                "poi": {"name": "A", "category": "play", "lng": None, "lat": None},
                            },
                            {
                                "order_index": 2,
                                "arrive_time": "10:00",
                                "poi": {"name": "A", "category": "play", "lng": 104.0, "lat": 30.6},
                            },
                        ],
                    }
                ],
            }
        },
    )

    assert result.ok is True
    assert result.degraded is True
    codes = {warning.code for warning in result.warnings}
    assert {"missing_coordinates", "duplicate_poi", "non_monotonic_time"} <= codes


def test_validate_itinerary_tool_uses_explicit_stop_slots_for_day_structure():
    result = _call(
        "validate_itinerary",
        {
            "itinerary": {
                "title": "测试",
                "city": "成都",
                "status": "draft",
                "days": [
                    {
                        "day_index": 1,
                        "stops": [
                            {
                                "order_index": 1,
                                "slot": "breakfast",
                                "arrive_time": "08:00",
                                "poi": {"name": "早餐", "category": "eat", "lng": 104.0, "lat": 30.6},
                            },
                            {
                                "order_index": 2,
                                "slot": "attraction",
                                "arrive_time": "10:00",
                                "poi": {"name": "景点", "category": "play", "lng": 104.1, "lat": 30.7},
                            },
                            {
                                "order_index": 3,
                                "slot": "lunch",
                                "arrive_time": "12:00",
                                "poi": {"name": "午餐", "category": "eat", "lng": 104.2, "lat": 30.8},
                            },
                            {
                                "order_index": 4,
                                "slot": "dinner",
                                "arrive_time": "18:30",
                                "poi": {"name": "晚餐", "category": "eat", "lng": 104.3, "lat": 30.9},
                            },
                            {
                                "order_index": 5,
                                "slot": "hotel",
                                "arrive_time": "21:00",
                                "poi": {"name": "酒店", "category": "stay", "lng": 104.4, "lat": 31.0},
                            },
                        ],
                    }
                ],
            }
        },
    )

    assert result.ok is True
    assert result.degraded is False
    assert result.data["valid"] is True


def test_validate_itinerary_tool_warns_on_invalid_time_and_stay_minutes():
    result = _call(
        "validate_itinerary",
        {
            "itinerary": {
                "title": "测试",
                "city": "成都",
                "status": "draft",
                "days": [
                    {
                        "day_index": 1,
                        "stops": [
                            {
                                "order_index": 1,
                                "slot": "breakfast",
                                "arrive_time": "99:99",
                                "stay_minutes": 9999,
                                "poi": {"name": "早餐", "category": "eat", "lng": 104.0, "lat": 30.6},
                            },
                            {
                                "order_index": 2,
                                "slot": "attraction",
                                "arrive_time": "10:00",
                                "stay_minutes": 120,
                                "poi": {"name": "景点", "category": "play", "lng": 104.1, "lat": 30.7},
                            },
                            {
                                "order_index": 3,
                                "slot": "lunch",
                                "arrive_time": "12:00",
                                "stay_minutes": 60,
                                "poi": {"name": "午餐", "category": "eat", "lng": 104.2, "lat": 30.8},
                            },
                            {
                                "order_index": 4,
                                "slot": "dinner",
                                "arrive_time": "18:30",
                                "stay_minutes": 75,
                                "poi": {"name": "晚餐", "category": "eat", "lng": 104.3, "lat": 30.9},
                            },
                            {
                                "order_index": 5,
                                "slot": "hotel",
                                "arrive_time": "21:00",
                                "stay_minutes": 600,
                                "poi": {"name": "酒店", "category": "stay", "lng": 104.4, "lat": 31.0},
                            },
                        ],
                    }
                ],
            }
        },
    )

    codes = {warning.code for warning in result.warnings}
    assert {"invalid_arrive_time", "invalid_stay_minutes"} <= codes
    assert result.data["valid"] is False


def test_validate_itinerary_tool_warns_on_coordinates_outside_china():
    result = _call(
        "validate_itinerary",
        {
            "itinerary": {
                "title": "测试",
                "city": "成都",
                "days": [
                    {
                        "day_index": 1,
                        "stops": [
                            {
                                "order_index": 1,
                                "slot": "attraction",
                                "poi": {"name": "越界景点", "category": "play", "lng": 1.0, "lat": 1.0},
                            }
                        ],
                    }
                ],
            }
        },
    )

    assert any(w.code == "invalid_coordinates" for w in result.warnings)
    assert result.data["valid"] is False
