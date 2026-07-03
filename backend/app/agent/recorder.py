import json
from datetime import UTC, datetime
from pathlib import Path

from app.agent.planner import PlannerResult
from app.agent.schemas import HarnessRequest, HarnessRunResult


class AgentHarnessRecorder:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def record(
        self,
        *,
        request: HarnessRequest,
        planner_result: PlannerResult,
        result: HarnessRunResult,
    ) -> dict:
        record = {
            "schema_version": "agent_harness_v0",
            "created_at": datetime.now(UTC).isoformat(),
            "id": f"agent-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}",
            "degraded": result.degraded,
            "request": request.model_dump(mode="json"),
            "planner": planner_result.model_dump(),
            "result": result.model_dump(mode="json"),
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
        return record
