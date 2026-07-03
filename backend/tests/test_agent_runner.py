from app.agent.runner import AgentHarnessRunner
from app.agent.schemas import HarnessRequest


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
