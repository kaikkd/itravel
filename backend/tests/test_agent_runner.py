from app.agent.runner import AgentHarnessRunner
from app.agent.registry import ToolRegistry
from app.agent.schemas import HarnessRequest, ToolResult


def _full_day_stops():
    return [
        {
            "slot": "breakfast",
            "arrive_time": "08:00",
            "stay_minutes": 45,
            "poi": {"name": "早餐", "category": "eat", "lng": 104.00, "lat": 30.65},
        },
        {
            "slot": "attraction",
            "arrive_time": "10:00",
            "stay_minutes": 120,
            "poi": {"name": "景点", "category": "play", "lng": 104.01, "lat": 30.65},
        },
        {
            "slot": "lunch",
            "arrive_time": "12:00",
            "stay_minutes": 60,
            "poi": {"name": "午餐", "category": "eat", "lng": 104.02, "lat": 30.65},
        },
        {
            "slot": "dinner",
            "arrive_time": "18:30",
            "stay_minutes": 75,
            "poi": {"name": "晚餐", "category": "eat", "lng": 104.03, "lat": 30.65},
        },
        {
            "slot": "hotel",
            "arrive_time": "21:00",
            "stay_minutes": 600,
            "poi": {"name": "酒店", "category": "stay", "lng": 104.04, "lat": 30.65},
        },
    ]


def test_runner_v0_produces_deterministic_trace_and_state():
    runner = AgentHarnessRunner()

    result = runner.run(
        HarnessRequest(
            query="成都玩一天，轻松一点",
            stops=[
                {
                    "slot": "景点",
                    "poi": {"name": "远景点", "category": "play", "lng": 104.20, "lat": 30.65},
                },
                {
                    "slot": "景点",
                    "poi": {"name": "近景点", "category": "play", "lng": 104.02, "lat": 30.65},
                },
            ],
            start_lng=104.0,
            start_lat=30.65,
        )
    )

    assert [entry.call.name for entry in result.trace] == [
        "parse_user_intent",
        "route_sort_day",
        "compute_transit",
        "validate_itinerary",
    ]
    assert result.state["intent"]["city"] == "成都"
    assert result.state["sorted_stops"][0]["poi"]["name"] == "近景点"
    assert result.state["transits"][0]["from_order_index"] == 1
    assert result.state["transits"][0]["to_order_index"] == 2
    assert result.degraded is True  # validate_itinerary warns because this is not a full day draft


def test_runner_v0_computes_all_adjacent_transits():
    runner = AgentHarnessRunner()

    result = runner.run(
        HarnessRequest(
            query="成都玩一天",
            stops=[
                {
                    "slot": "景点",
                    "poi": {"name": "A", "category": "play", "lng": 104.00, "lat": 30.65},
                },
                {
                    "slot": "景点",
                    "poi": {"name": "B", "category": "play", "lng": 104.01, "lat": 30.65},
                },
                {
                    "slot": "景点",
                    "poi": {"name": "C", "category": "play", "lng": 104.02, "lat": 30.65},
                },
            ],
        )
    )

    assert [entry.call.name for entry in result.trace].count("compute_transit") == 2
    assert len(result.state["transits"]) == 2


def test_runner_v0_preserves_slot_and_arrive_time_before_validation():
    runner = AgentHarnessRunner()

    result = runner.run(HarnessRequest(query="成都玩一天", stops=_full_day_stops()))

    assert result.state["validation"]["valid"] is True
    assert result.degraded is True  # short-distance transits still use estimated fallback
    assert not any(w.code == "incomplete_day_structure" for w in result.warnings)


def test_runner_v0_reports_non_monotonic_time_from_original_stops():
    stops = _full_day_stops()
    stops[1]["arrive_time"] = "14:00"
    runner = AgentHarnessRunner()

    result = runner.run(HarnessRequest(query="成都玩一天", stops=stops))

    assert any(w.code == "non_monotonic_time" for w in result.warnings)


def test_runner_v0_marks_not_ok_tool_results_as_degraded():
    registry = ToolRegistry()

    def fail(args, context):
        return ToolResult(ok=False, degraded=False, error="boom")

    def route(args, context):
        return ToolResult(data={"stops": []})

    def validate(args, context):
        return ToolResult(data={"valid": True, "day_count": 1})

    registry.register(name="parse_user_intent", description="", handler=fail)
    registry.register(name="route_sort_day", description="", handler=route)
    registry.register(name="validate_itinerary", description="", handler=validate)

    result = AgentHarnessRunner(registry).run(HarnessRequest(query="成都玩一天", stops=[]))

    assert result.degraded is True


def test_runner_v0_aggregates_tool_warnings():
    runner = AgentHarnessRunner()

    result = runner.run(
        HarnessRequest(
            query="成都玩一天",
            stops=[
                {
                    "slot": "自由活动",
                    "poi": {"name": "未知", "category": "other", "lng": 104.0, "lat": 30.65},
                }
            ],
        )
    )

    assert result.degraded is True
    assert any(w.code == "unknown_role" for w in result.warnings)


def test_runner_v0_uses_walking_mode_for_short_adjacent_segments():
    runner = AgentHarnessRunner()

    result = runner.run(
        HarnessRequest(
            query="成都玩一天",
            stops=[
                {
                    "slot": "景点",
                    "poi": {"name": "A", "category": "play", "lng": 104.0000, "lat": 30.6500},
                },
                {
                    "slot": "景点",
                    "poi": {"name": "B", "category": "play", "lng": 104.0005, "lat": 30.6500},
                },
            ],
        )
    )

    assert result.state["transits"][0]["mode"] == "walking"
