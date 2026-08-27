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
        try:
            raw = "".join(llm.stream_chat(messages, max_tokens=800))
        except Exception as exc:
            # provider 不可用时仍执行确定性的 v0 工具链，并在 trace 中明确
            # 标记 planner 降级，避免一次模型故障中断整个 harness。
            return PlannerResult(
                tool_calls=_fallback_calls(
                    [name for name in self.fallback_tool_names if name in allowed]
                ),
                warnings=[
                    ToolWarning(
                        code="planner_unavailable",
                        severity="warning",
                        message=str(exc),
                    )
                ],
                degraded=True,
            )
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
            tool_calls=_fallback_calls(
                [name for name in fallback_tool_names if name in allowed_tool_names]
            ),
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
        tool_calls = _fallback_calls(
            [name for name in fallback_tool_names if name in allowed_tool_names]
        )
    else:
        # v0 harness 需要稳定、可比较的 trace。required 工具按固定顺序
        # 去重；模型提供的 args 只保留首次出现的合法调用。
        first_calls: dict[str, ToolCall] = {}
        for call in tool_calls:
            first_calls.setdefault(call.name, call)
        required_names = [name for name in fallback_tool_names if name in allowed_tool_names]
        existing = set(first_calls)
        missing = [
            name
            for name in required_names
            if name not in existing
        ]
        if missing:
            degraded = True
            warnings.append(
                ToolWarning(
                    code="planner_missing_required_tool",
                    severity="warning",
                    message="Planner omitted required v0 tools; restored the fixed v0 sequence.",
                    details={"missing_tools": missing},
                )
            )
        optional: list[ToolCall] = []
        seen_optional: set[str] = set()
        for call in tool_calls:
            if call.name in required_names or call.name in seen_optional:
                continue
            optional.append(call)
            seen_optional.add(call.name)
        early_optional = [call for call in optional if call.name == "estimate_visit_duration"]
        remaining_optional = [call for call in optional if call.name != "estimate_visit_duration"]
        normalized: list[ToolCall] = []
        for name in required_names:
            if name == "validate_itinerary":
                normalized.extend(remaining_optional)
                remaining_optional = []
            normalized.append(first_calls.get(name, ToolCall(name=name)))
            if name == "parse_user_intent":
                normalized.extend(early_optional)
                early_optional = []
        normalized.extend(early_optional)
        normalized.extend(remaining_optional)
        if [call.name for call in normalized] != [call.name for call in tool_calls]:
            degraded = True
            warnings.append(
                ToolWarning(
                    code="planner_tool_order_normalized",
                    severity="warning",
                    message="Planner tool calls were reordered and deduplicated for harness v0.",
                )
            )
        tool_calls = normalized

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
