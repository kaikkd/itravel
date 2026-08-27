import json
import os
from datetime import UTC, datetime
from pathlib import Path

from app.agent.planner import PlannerResult
from app.agent.schemas import HarnessRequest, HarnessRunResult, ToolWarning

DEFAULT_RECORD_PATH = Path(__file__).resolve().parents[3] / ".agent_records/agent_harness_live.jsonl"
REDACTED = "[REDACTED]"


class AgentHarnessRecorder:
    """把 harness 运行写成 JSONL；默认只保留不含用户原文的摘要。"""

    def __init__(
        self,
        path: str | Path | None = None,
        *,
        include_sensitive: bool = False,
    ) -> None:
        # 路径和内容敏感度分别显式控制：即使调用方传入自定义路径，默认也
        # 不保存 query、POI、坐标、planner 原文或工具参数。
        self.path = Path(path) if path is not None else DEFAULT_RECORD_PATH
        self.include_sensitive = include_sensitive

    def record(
        self,
        *,
        request: HarnessRequest,
        planner_result: PlannerResult,
        result: HarnessRunResult,
    ) -> dict:
        record = {
            "schema_version": "agent_harness_v0",
            "record_mode": "full" if self.include_sensitive else "redacted",
            "created_at": datetime.now(UTC).isoformat(),
            "id": f"agent-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}",
            "degraded": result.degraded,
            "request": request.model_dump(mode="json"),
            "planner": planner_result.model_dump(),
            "result": result.model_dump(mode="json"),
        }
        if not self.include_sensitive:
            record = _redact_record(record, request, planner_result, result)

        # 记录器不读取 env 或 provider 配置；默认文件同时使用私有目录和
        # 0600 权限，降低本地记录被误提交或被其他用户读取的风险。
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        file_descriptor = os.open(
            self.path,
            os.O_APPEND | os.O_CREAT | os.O_WRONLY,
            0o600,
        )
        os.chmod(self.path, 0o600)
        with os.fdopen(file_descriptor, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
        return record


def _redact_record(
    record: dict,
    request: HarnessRequest,
    planner_result: PlannerResult,
    result: HarnessRunResult,
) -> dict:
    validation = result.state.get("validation", {})
    safe_validation = {
        key: validation[key]
        for key in ("valid", "day_count")
        if isinstance(validation, dict) and key in validation
    }
    sorted_stops = result.state.get("sorted_stops", [])
    transits = result.state.get("transits", [])
    missing_coord_count = sum(
        1
        for stop in sorted_stops
        if stop.get("poi", {}).get("lng") is None
        or stop.get("poi", {}).get("lat") is None
    )
    return {
        **{key: record[key] for key in ("schema_version", "record_mode", "created_at", "id")},
        "degraded": result.degraded,
        "request": {
            "query": REDACTED if request.query else "",
            "stop_count": len(request.stops),
            "has_start_coordinates": request.start_lng is not None
            and request.start_lat is not None,
        },
        "planner": {
            "raw_response": REDACTED if planner_result.raw_response else "",
            "tool_calls": [
                {"name": call.name, "args": {}, "call_id": call.call_id}
                for call in planner_result.tool_calls
            ],
            "warnings": [_redact_warning(item) for item in planner_result.warnings],
            "degraded": planner_result.degraded,
        },
        "result": {
            "state": {
                "summary": {
                    "sorted_stop_count": len(sorted_stops),
                    "missing_coord_count": missing_coord_count,
                    "transit_count": len(transits),
                },
                "validation": safe_validation,
            },
            "trace": [
                {
                    "call": {
                        "name": entry.call.name,
                        "args": {},
                        "call_id": entry.call.call_id,
                    },
                    "result": {
                        "ok": entry.result.ok,
                        "data": {},
                        "warnings": [
                            _redact_warning(item) for item in entry.result.warnings
                        ],
                        "degraded": entry.result.degraded,
                        "error": entry.result.error,
                    },
                }
                for entry in result.trace
            ],
            "warnings": [_redact_warning(item) for item in result.warnings],
            "degraded": result.degraded,
        },
    }


def _redact_warning(warning: ToolWarning) -> dict:
    return {
        "code": warning.code,
        "severity": warning.severity,
        "message": "",
        "details": {},
    }
