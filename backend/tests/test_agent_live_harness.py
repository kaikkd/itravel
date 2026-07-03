import json
import os
from pathlib import Path

import pytest

from app.agent.live_runner import LLMAgentHarnessRunner
from app.agent.planner import PlannerResult, parse_planner_response
from app.agent.recorder import AgentHarnessRecorder
from app.agent.schemas import HarnessRequest, ToolCall
from app.config import settings


def _sample_request() -> HarnessRequest:
    return HarnessRequest(
        query="成都一天轻松逛吃，先去近一点的景点",
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


def test_planner_response_filters_unknown_tools_and_keeps_raw_text():
    parsed = parse_planner_response(
        """
        ```json
        {
          "tool_calls": [
            {"name": "parse_user_intent", "args": {}},
            {"name": "search_private_api", "args": {"q": "成都"}},
            {"name": "route_sort_day", "args": {}}
          ]
        }
        ```
        """,
        allowed_tool_names={"parse_user_intent", "route_sort_day"},
        fallback_tool_names=["parse_user_intent"],
    )

    assert [call.name for call in parsed.tool_calls] == ["parse_user_intent", "route_sort_day"]
    assert parsed.raw_response.startswith("```json")
    assert parsed.degraded is True
    assert parsed.warnings[0].code == "planner_unknown_tool"


def test_planner_response_adds_missing_v0_tools_to_keep_harness_complete():
    parsed = parse_planner_response(
        '{"tool_calls":[{"name":"parse_user_intent","args":{}}]}',
        allowed_tool_names={
            "parse_user_intent",
            "route_sort_day",
            "compute_transit",
            "validate_itinerary",
        },
        fallback_tool_names=[
            "parse_user_intent",
            "route_sort_day",
            "compute_transit",
            "validate_itinerary",
        ],
    )

    assert [call.name for call in parsed.tool_calls] == [
        "parse_user_intent",
        "route_sort_day",
        "compute_transit",
        "validate_itinerary",
    ]
    assert parsed.degraded is True
    assert any(w.code == "planner_missing_required_tool" for w in parsed.warnings)


def test_live_harness_records_planner_and_tool_trace(tmp_path):
    class FakePlanner:
        def plan(self, request, registry):
            return PlannerResult(
                raw_response='{"tool_calls":[{"name":"parse_user_intent"}]}',
                tool_calls=[
                    ToolCall(name="parse_user_intent"),
                    ToolCall(name="route_sort_day"),
                    ToolCall(name="compute_transit"),
                    ToolCall(name="validate_itinerary"),
                ],
            )

    record_path = tmp_path / "agent_replay.jsonl"
    runner = LLMAgentHarnessRunner(
        planner=FakePlanner(),
        recorder=AgentHarnessRecorder(record_path),
    )

    result = runner.run(_sample_request())

    assert [entry.call.name for entry in result.trace] == [
        "parse_user_intent",
        "route_sort_day",
        "compute_transit",
        "validate_itinerary",
    ]
    lines = record_path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["schema_version"] == "agent_harness_v0"
    assert record["request"]["query"].startswith("成都一天")
    assert record["planner"]["tool_calls"][0]["name"] == "parse_user_intent"
    assert record["result"]["trace"][1]["call"]["name"] == "route_sort_day"
    assert "openai_api_key" not in json.dumps(record).lower()


@pytest.mark.skipif(
    os.getenv("ITRAVEL_RUN_LIVE_LLM_TEST") != "1",
    reason="set ITRAVEL_RUN_LIVE_LLM_TEST=1 to spend API credits and record live data",
)
def test_live_harness_can_call_configured_llm_and_record_response():
    assert settings.openai_api_key, "OPENAI_API_KEY must be configured for live harness test"
    record_path = Path(
        os.getenv(
            "ITRAVEL_AGENT_RECORD_PATH",
            "../evals/fixtures/agent_harness_live.jsonl",
        )
    )
    runner = LLMAgentHarnessRunner(recorder=AgentHarnessRecorder(record_path))

    result = runner.run(_sample_request())

    assert result.trace
    assert record_path.exists()
    last_record = json.loads(record_path.read_text(encoding="utf-8").splitlines()[-1])
    assert last_record["schema_version"] == "agent_harness_v0"
    assert last_record["planner"]["raw_response"]
    assert last_record["result"]["trace"]
