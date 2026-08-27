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

from app import validators  # noqa: E402


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
    redacted_summary = (
        record.get("result", {}).get("state", {}).get("summary", {})
    )
    stop_count = redacted_summary.get("sorted_stop_count", len(stops))
    missing_coord_count = redacted_summary.get("missing_coord_count", len(missing))
    return {
        "id": record.get("id", ""),
        "compliant": _record_compliant(record),
        "degraded": bool(record.get("degraded")),
        "stop_count": stop_count,
        "missing_coord_count": missing_coord_count,
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
    from app import workflow

    ordered = workflow.order_day_stops(day)
    assembled = workflow.assemble_day(ordered)
    stops = []
    for plan_stop, stop in zip(ordered.stops, assembled.stops):
        stops.append(
            {
                "order_index": stop.order_index,
                "slot": plan_stop.slot,
                "arrive_time": stop.arrive_time,
                "stay_minutes": stop.stay_minutes,
                "poi": stop.poi.model_dump(),
            }
        )
    return {
        "day_index": ordered.day_index,
        "stops": stops,
        "transits": [item.model_dump(mode="json") for item in assembled.transits],
    }


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


def _record_compliant(record: dict[str, Any]) -> bool:
    # agent harness 已执行统一 validator 时，以该结果为准；缺少 validator
    # 的中间记录不能仅凭“有 stops”就算合规。
    state = record.get("result", {}).get("state") or record.get("state") or {}
    validation = state.get("validation") if isinstance(state, dict) else None
    if isinstance(validation, dict) and "valid" in validation:
        return validation.get("valid") is True
    if isinstance(state, dict) and state.get("sorted_stops"):
        return False

    days = record.get("days") or []
    return bool(days) and all(_workflow_day_compliant(day) for day in days)


def _workflow_day_compliant(day: dict[str, Any]) -> bool:
    stops = day.get("stops") or []
    if not stops:
        return False

    roles: set[str] = set()
    previous_time = -1
    for stop in stops:
        poi = _poi(stop)
        if not validators.valid_category(poi.get("category")):
            return False
        if not validators.valid_coord(poi.get("lng"), poi.get("lat")):
            return False

        slot = stop.get("slot")
        if slot not in validators.VALID_SLOTS:
            return False
        if validators.SLOT_TO_CATEGORY[slot] != poi.get("category"):
            return False
        roles.add(slot)

        arrive_time = validators.validate_arrive_time(stop.get("arrive_time"))
        stay_minutes = validators.validate_stay_minutes(stop.get("stay_minutes"))
        if arrive_time is None or stay_minutes is None:
            return False
        current_time = _hhmm_to_minutes(arrive_time)
        if current_time <= previous_time:
            return False
        previous_time = current_time

    required = {"breakfast", "lunch", "dinner", "attraction", "hotel"}
    if not required <= roles:
        return False

    transits = day.get("transits") or []
    if len(transits) != len(stops) - 1:
        return False
    for index, segment in enumerate(transits, start=1):
        if segment.get("from_order_index") != index:
            return False
        if segment.get("to_order_index") != index + 1:
            return False
        if segment.get("mode") not in {"walking", "driving"}:
            return False
        distance = segment.get("distance_meters")
        duration = segment.get("duration_seconds")
        if not isinstance(distance, int) or distance < 0:
            return False
        if not isinstance(duration, int) or duration < 0:
            return False
    return True


def _hhmm_to_minutes(value: str) -> int:
    hour, minute = value.split(":", 1)
    return int(hour) * 60 + int(minute)


if __name__ == "__main__":
    main()
