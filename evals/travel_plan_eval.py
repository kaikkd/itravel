import argparse
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    # evals 位于仓库根目录，直接运行脚本时需要把 backend 加进 import path。
    sys.path.insert(0, str(BACKEND))


def evaluate_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_evaluate_record(record) for record in records]


def summarize_metrics(cases: list[dict[str, Any]]) -> dict[str, Any]:
    if not cases:
        return {
            "case_count": 0,
            "compliance_rate": 0.0,
            "degradation_rate": 0.0,
            "avg_stop_count": 0.0,
            "missing_coord_rate": 0.0,
            "tool_warning_count": 0,
        }
    stop_count = sum(case["stop_count"] for case in cases)
    missing = sum(case["missing_coord_count"] for case in cases)
    # 所有指标都从 case 级结果聚合，保证 replay 和 live 记录能共用同一套统计。
    return {
        "case_count": len(cases),
        "compliance_rate": sum(1 for c in cases if c["compliant"]) / len(cases),
        "degradation_rate": sum(1 for c in cases if c["degraded"]) / len(cases),
        "avg_stop_count": stop_count / len(cases),
        "missing_coord_rate": (missing / stop_count) if stop_count else 0.0,
        "tool_warning_count": sum(case["tool_warning_count"] for case in cases),
    }


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    records = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            records.append(json.loads(line))
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate travel plan outputs.")
    parser.add_argument("--replay", type=Path, default=None, help="JSONL replay file")
    parser.add_argument("--live-query", default="", help="Optional live LLM query; local use only")
    parser.add_argument("--destination", default="", help="Destination override for live mode")
    parser.add_argument("--days", type=int, default=0, help="Day count override for live mode")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    args = parser.parse_args()

    records = load_jsonl(args.replay) if args.replay else []
    if args.live_query:
        # live mode 只在本地手动触发；CI 和默认 replay 不会消耗 API key。
        records.append(_run_live_case(args.live_query, args.destination, args.days))
    cases = evaluate_records(records)
    metrics = summarize_metrics(cases)
    if args.json:
        print(json.dumps({"metrics": metrics, "cases": cases}, ensure_ascii=False, indent=2))
    else:
        for key, value in metrics.items():
            print(f"{key}: {value}")


def _evaluate_record(record: dict[str, Any]) -> dict[str, Any]:
    # 同时兼容旧 workflow 输出和新 agent harness JSONL record。
    stops = _collect_stops(record)
    missing = [
        stop
        for stop in stops
        if _poi(stop).get("lng") is None or _poi(stop).get("lat") is None
    ]
    return {
        "id": record.get("id", ""),
        "compliant": bool(record.get("days")) or bool(stops),
        "degraded": bool(record.get("degraded")),
        "stop_count": len(stops),
        "missing_coord_count": len(missing),
        "tool_warning_count": _warning_count(record),
    }


def _run_live_case(query: str, destination: str = "", days: int = 0) -> dict[str, Any]:
    from app import workflow

    # live eval 复用现有 workflow，不引入新的线上接口；输出会被转换成 replay 格式。
    parsed = workflow.parse_intent(query)
    req = SimpleNamespace(
        destination=destination or parsed.city,
        origin="",
        return_city="",
        day_count=days or parsed.day_count,
        preferences=parsed.preferences,
        free_text=query,
        history=[],
        current_plan=None,
    )
    day_plans, degraded = workflow.recommend_plan(req)
    return {
        "id": "live",
        "days": [_day_plan_to_record(day) for day in day_plans],
        "degraded": degraded,
        "tool_warnings": [],
    }


def _day_plan_to_record(day) -> dict[str, Any]:
    stops = []
    for idx, stop in enumerate(day.stops, start=1):
        stops.append(
            {
                "order_index": idx,
                "slot": stop.slot,
                "arrive_time": stop.arrive_time,
                "stay_minutes": stop.stay_minutes,
                "poi": stop.poi.model_dump(),
            }
        )
    return {"day_index": day.day_index, "stops": stops}


def _collect_stops(record: dict[str, Any]) -> list[dict[str, Any]]:
    # agent harness 的 POI 在 result.state.sorted_stops；旧 workflow 则在 days[].stops。
    if record.get("result", {}).get("state", {}).get("sorted_stops"):
        return record["result"]["state"]["sorted_stops"]
    if record.get("state", {}).get("sorted_stops"):
        return record["state"]["sorted_stops"]
    stops = []
    for day in record.get("days", []) or []:
        stops.extend(day.get("stops", []) or [])
    return stops


def _poi(stop: dict[str, Any]) -> dict[str, Any]:
    return stop.get("poi") or stop


def _warning_count(record: dict[str, Any]) -> int:
    if record.get("tool_warnings"):
        return len(record.get("tool_warnings", []) or [])
    if record.get("result", {}).get("warnings"):
        return len(record["result"]["warnings"])
    if record.get("warnings"):
        return len(record["warnings"])
    return 0


if __name__ == "__main__":
    main()
