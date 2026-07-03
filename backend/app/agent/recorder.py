import json
from datetime import UTC, datetime
from pathlib import Path

from app.agent.planner import PlannerResult
from app.agent.schemas import HarnessRequest, HarnessRunResult


class AgentHarnessRecorder:
    """把 live harness 运行写成 JSONL，供后续离线 replay 和 eval 使用。"""

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
        # 记录里只保存请求、工具计划、trace 和结构化结果；不要写入 env、
        # provider 配置或 API key，避免 replay fixture 变成密钥泄露面。
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
        return record
