import json
from pathlib import Path

from evals.travel_plan_eval import evaluate_records, load_jsonl, summarize_metrics


def _compliant_day():
    stops = [
        ("breakfast", "eat", "早餐", "08:00", 45, 104.00),
        ("attraction", "play", "景点", "10:00", 120, 104.01),
        ("lunch", "eat", "午餐", "12:30", 60, 104.02),
        ("dinner", "eat", "晚餐", "18:30", 75, 104.03),
        ("hotel", "stay", "酒店", "21:00", 600, 104.04),
    ]
    return {
        "day_index": 1,
        "stops": [
            {
                "order_index": index,
                "slot": slot,
                "arrive_time": arrive_time,
                "stay_minutes": stay_minutes,
                "poi": {
                    "name": name,
                    "category": category,
                    "lng": lng,
                    "lat": 30.65,
                },
            }
            for index, (slot, category, name, arrive_time, stay_minutes, lng) in enumerate(
                stops, start=1
            )
        ],
        "transits": [
            {
                "from_order_index": index,
                "to_order_index": index + 1,
                "mode": "walking",
                "distance_meters": 1000,
                "duration_seconds": 800,
            }
            for index in range(1, len(stops))
        ],
    }


def test_eval_summarizes_replay_records():
    records = [
        {
            "id": "ok",
            "degraded": False,
            "days": [_compliant_day()],
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
    assert metrics["compliance_rate"] == 0.5
    assert metrics["degradation_rate"] == 0.5
    assert metrics["avg_stop_count"] == 3.0
    assert metrics["missing_coord_rate"] == 1 / 6
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
    assert summary["compliance_rate"] == 0.0
    assert summary["avg_stop_count"] == 2
    assert summary["missing_coord_rate"] == 0.5
    assert summary["tool_warning_count"] == 1


def test_eval_uses_harness_validation_result_for_compliance():
    records = [
        {
            "id": "invalid-agent-record",
            "degraded": True,
            "result": {
                "state": {
                    "sorted_stops": [{"poi": {"name": "A", "lng": 104.0, "lat": 30.6}}],
                    "validation": {"valid": False},
                },
                "warnings": [{"code": "incomplete_day_structure"}],
            },
        }
    ]

    summary = summarize_metrics(evaluate_records(records))

    assert summary["compliance_rate"] == 0.0


def test_eval_rejects_old_workflow_record_with_incomplete_transit_contract():
    day = _compliant_day()
    day["transits"].pop()

    summary = summarize_metrics(
        evaluate_records([{"id": "bad-transit", "degraded": False, "days": [day]}])
    )

    assert summary["compliance_rate"] == 0.0


def test_eval_uses_aggregate_counts_from_redacted_harness_record():
    records = [
        {
            "id": "redacted-agent-record",
            "record_mode": "redacted",
            "degraded": True,
            "result": {
                "state": {
                    "summary": {
                        "sorted_stop_count": 5,
                        "missing_coord_count": 1,
                        "transit_count": 4,
                    },
                    "validation": {"valid": False},
                },
                "warnings": [{"code": "missing_coordinates"}],
            },
        }
    ]

    summary = summarize_metrics(evaluate_records(records))

    assert summary["avg_stop_count"] == 5
    assert summary["missing_coord_rate"] == 0.2
    assert summary["compliance_rate"] == 0.0
