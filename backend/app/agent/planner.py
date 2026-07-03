import json
import re
from typing import Protocol

from app import llm
from app.agent.registry import ToolRegistry
from app.agent.schemas import HarnessRequest, ToolCall, ToolWarning


DEFAULT_TOOL_PLAN = [
    "parse_user_intent",
    "route_sort_day",
    "compute_transit",
    "validate_itinerary",
]


class PlannerResult:
    def __init__(
        self,
        *,
        raw_response: str = "",
        tool_calls: list[ToolCall] | None = None,
        warnings: list[ToolWarning] | None = None,
        degraded: bool = False,
    ) -> None:
        self.raw_response = raw_response
        self.tool_calls = tool_calls or []
        self.warnings = warnings or []
        self.degraded = degraded

    def model_dump(self) -> dict:
        return {
            "raw_response": self.raw_response,
            "tool_calls": [call.model_dump(mode="json") for call in self.tool_calls],
            "warnings": [warning.model_dump(mode="json") for warning in self.warnings],
            "degraded": self.degraded,
        }


class ToolPlanner(Protocol):
    def plan(self, request: HarnessRequest, registry: ToolRegistry) -> PlannerResult:
        ...


class LLMToolPlanner:
    """让已配置的大模型生成工具计划，并在本地收紧到可执行边界。"""

    def __init__(self, fallback_tool_names: list[str] | None = None) -> None:
        self.fallback_tool_names = fallback_tool_names or DEFAULT_TOOL_PLAN

    def plan(self, request: HarnessRequest, registry: ToolRegistry) -> PlannerResult:
        specs = registry.list_specs()
        allowed = {spec.name for spec in specs}
        # 把 registry 中的工具说明暴露给模型，而不是暴露内部函数实现；
        # 模型只负责规划“调用哪些工具”，真实执行仍由本地 runner 完成。
        messages = [
            {
                "role": "system",
                "content": (
                    "You are the iTravel agent harness planner. Return only JSON. "
                    "Select a short, safe sequence of registered tools. Do not invent tools. "
                    "For harness v0, include every recommended_v0_sequence tool in order. "
                    'Use this schema: {"tool_calls":[{"name": string, "args": object}]}'
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "query": request.query,
                        "stop_count": len(request.stops),
                        "available_tools": [
                            {
                                "name": spec.name,
                                "description": spec.description,
                                "input_schema": spec.input_schema,
                            }
                            for spec in specs
                        ],
                        "recommended_v0_sequence": self.fallback_tool_names,
                    },
                    ensure_ascii=False,
                ),
            },
        ]
        raw = "".join(llm.stream_chat(messages, max_tokens=800))
        return parse_planner_response(
            raw,
            allowed_tool_names=allowed,
            fallback_tool_names=self.fallback_tool_names,
        )


def parse_planner_response(
    raw_response: str,
    *,
    allowed_tool_names: set[str],
    fallback_tool_names: list[str],
) -> PlannerResult:
    warnings: list[ToolWarning] = []
    tool_calls: list[ToolCall] = []
    degraded = False
    try:
        # 模型可能包 markdown fence；先清理再按 JSON 解析，解析失败直接走固定链路。
        payload = json.loads(_strip_json_fence(raw_response))
    except json.JSONDecodeError as exc:
        warnings.append(
            ToolWarning(
                code="planner_invalid_json",
                severity="error",
                message=str(exc),
            )
        )
        return PlannerResult(
            raw_response=raw_response.strip(),
            tool_calls=_fallback_calls(fallback_tool_names),
            warnings=warnings,
            degraded=True,
        )

    raw_calls = payload.get("tool_calls", []) if isinstance(payload, dict) else []
    if not isinstance(raw_calls, list):
        raw_calls = []
    for item in raw_calls:
        if not isinstance(item, dict):
            degraded = True
            warnings.append(
                ToolWarning(
                    code="planner_invalid_tool_call",
                    severity="warning",
                    message="Planner returned a non-object tool call.",
                )
            )
            continue
        name = str(item.get("name") or "")
        if name not in allowed_tool_names:
            # 过滤模型幻觉出来的工具名，只记录 warning，不让未知工具进入执行阶段。
            degraded = True
            warnings.append(
                ToolWarning(
                    code="planner_unknown_tool",
                    severity="warning",
                    message=f"Planner selected an unknown tool: {name}",
                    details={"tool_name": name},
                )
            )
            continue
        args = item.get("args") if isinstance(item.get("args"), dict) else {}
        tool_calls.append(ToolCall(name=name, args=args))

    if not tool_calls:
        degraded = True
        warnings.append(
            ToolWarning(
                code="planner_empty_tool_plan",
                severity="warning",
                message="Planner did not return any usable tool calls; using fallback plan.",
            )
        )
        tool_calls = _fallback_calls(fallback_tool_names)
    else:
        # v0 harness 需要稳定、可比较的 trace。即使模型漏掉某个工具，也补齐
        # 最小工具链，避免不同 prompt/model 版本生成不可回放的半截记录。
        existing = {call.name for call in tool_calls}
        missing = [
            name
            for name in fallback_tool_names
            if name in allowed_tool_names and name not in existing
        ]
        if missing:
            degraded = True
            warnings.append(
                ToolWarning(
                    code="planner_missing_required_tool",
                    severity="warning",
                    message="Planner omitted required v0 tools; appended them in fallback order.",
                    details={"missing_tools": missing},
                )
            )
            tool_calls.extend(_fallback_calls(missing))

    return PlannerResult(
        raw_response=raw_response.strip(),
        tool_calls=tool_calls,
        warnings=warnings,
        degraded=degraded,
    )


def _fallback_calls(tool_names: list[str]) -> list[ToolCall]:
    return [ToolCall(name=name) for name in tool_names]


def _strip_json_fence(text: str) -> str:
    stripped = text.strip()
    stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
    stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()
