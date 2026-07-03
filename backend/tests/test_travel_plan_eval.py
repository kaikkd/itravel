import json
from pathlib import Path

from evals.travel_plan_eval import evaluate_records, load_jsonl, summarize_metrics


def test_eval_summarizes_replay_records():
    records = [
        {
            "id": "ok",
            "degraded": False,
            "days": [
                {
                    "stops": [
                        {"poi": {"name": "A", "lng": 104.0, "lat": 30.6}},
                        {"poi": {"name": "B", "lng": 104.1, "lat": 30.7}},
                    ]
                }
            ],
            "tool_warnings": [],
        },
        {
            "id": "bad",
            "degraded": True,
            "days": [{"stops": [{"poi": {"name": "C", "lng": None, "lat": None}}]}],
            "tool_warnings": [{"code": "missing_coordinates"}],
        },
    ]

    cases = evaluate_records(records)
    metrics = summarize_metrics(cases)

    assert metrics["case_count"] == 2
    assert metrics["compliance_rate"] == 1.0
    assert metrics["degradation_rate"] == 0.5
    assert metrics["avg_stop_count"] == 1.5
    assert metrics["missing_coord_rate"] == 1 / 3
    assert metrics["tool_warning_count"] == 1


def test_eval_json_output_is_serializable():
    metrics = summarize_metrics(evaluate_records([]))

    assert json.loads(json.dumps(metrics))["case_count"] == 0


def test_eval_loads_replay_fixture_without_api_key():
    fixture = Path(__file__).resolve().parents[2] / "evals/fixtures/travel_plan_replay.jsonl"
    records = load_jsonl(fixture)
    summary = summarize_metrics(evaluate_records(records))

    assert summary["case_count"] == 2
    assert summary["degradation_rate"] == 0.5


def test_eval_collects_agent_harness_record_stops():
    records = [
        {
            "id": "agent-record",
            "degraded": True,
            "result": {
                "state": {
                    "sorted_stops": [
                        {"poi": {"name": "A", "lng": 104.0, "lat": 30.6}},
                        {"poi": {"name": "B", "lng": None, "lat": None}},
                    ]
                },
                "warnings": [{"code": "missing_coordinates"}],
            },
        }
    ]

    summary = summarize_metrics(evaluate_records(records))

    assert summary["case_count"] == 1
    assert summary["compliance_rate"] == 1.0
    assert summary["avg_stop_count"] == 2
    assert summary["missing_coord_rate"] == 0.5
    assert summary["tool_warning_count"] == 1
