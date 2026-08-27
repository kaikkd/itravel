import math
from collections.abc import Callable
from typing import Any

from pydantic import ValidationError

from app.agent.schemas import ToolCall, ToolContext, ToolResult, ToolSpec, ToolWarning
from app.tools.harness_tools import (
    compute_transit_tool,
    estimate_visit_duration_tool,
    parse_user_intent_tool,
    route_sort_day_tool,
    validate_itinerary_tool,
)

ToolHandler = Callable[[dict[str, Any], ToolContext], ToolResult]


class ToolRegistry:
    def __init__(self) -> None:
        # specs 面向 planner/调试展示，handlers 面向真实执行；分开存放便于
        # 后续只暴露工具说明，而不暴露 Python callable。
        self._specs: dict[str, ToolSpec] = {}
        self._handlers: dict[str, ToolHandler] = {}

    def register(
        self,
        *,
        name: str,
        description: str,
        handler: ToolHandler,
        input_schema: dict[str, Any] | None = None,
        output_schema: dict[str, Any] | None = None,
    ) -> None:
        self._specs[name] = ToolSpec(
            name=name,
            description=description,
            input_schema=input_schema or {},
            output_schema=output_schema or {},
        )
        self._handlers[name] = handler

    def list_specs(self) -> list[ToolSpec]:
        return [self._specs[name] for name in sorted(self._specs)]

    def get_spec(self, name: str) -> ToolSpec:
        return self._specs[name]

    def call(self, call: ToolCall, context: ToolContext | None = None) -> ToolResult:
        context = context or ToolContext()
        handler = self._handlers.get(call.name)
        if handler is None:
            # 未知工具不抛异常，而是转成 ToolResult。这样 agent runner 可以把
            # 错误写入 trace，继续做降级或复盘，而不是中断整次 harness。
            return ToolResult(
                ok=False,
                degraded=True,
                error="unknown_tool",
                warnings=[
                    ToolWarning(
                        code="unknown_tool",
                        severity="error",
                        message=f"Tool not registered: {call.name}",
                        details={"tool_name": call.name},
                    )
                ],
            )
        errors = _validate_schema(self._specs[call.name].input_schema, call.args)
        if errors:
            return _invalid_tool_args_result(call.name, errors)
        try:
            return handler(call.args, context)
        except ValidationError as exc:
            # handler 内部的 Pydantic 模型负责成对坐标等跨字段约束。
            # 这类异常仍属于调用参数错误，不应被误报为工具内部故障。
            errors = [
                f"args.{'.'.join(str(part) for part in item['loc'])}: {item['msg']}"
                for item in exc.errors(include_url=False)
            ]
            return _invalid_tool_args_result(call.name, errors)
        except Exception as exc:
            # tool 内部异常统一包成结构化结果，避免某个工具失败导致 agent
            # 轨迹缺失；真实错误类型仍保留在 error 字段中。
            return ToolResult(
                ok=False,
                degraded=True,
                error=exc.__class__.__name__,
                warnings=[
                    ToolWarning(
                        code="tool_exception",
                        severity="error",
                        message=str(exc),
                        details={"tool_name": call.name},
                    )
                ],
            )


def build_default_registry() -> ToolRegistry:
    registry = ToolRegistry()
    # 这里集中声明 v0 默认工具集。planner 只看到这些注册过的工具，
    # runner 也只通过 registry 调用，避免后续工具散落在业务代码里。
    registry.register(
        name="parse_user_intent",
        description="Parse a travel query into destination, day count, and preferences.",
        handler=parse_user_intent_tool,
        input_schema={
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    )
    registry.register(
        name="estimate_visit_duration",
        description="Estimate stay minutes for a stop role.",
        handler=estimate_visit_duration_tool,
        input_schema={
            "type": "object",
            "properties": {
                "slot": {"type": "string"},
                "role": {"type": "string"},
            },
        },
    )
    registry.register(
        name="compute_transit",
        description="Compute or estimate transit between two coordinate pairs.",
        handler=compute_transit_tool,
        input_schema={
            "type": "object",
            "properties": {
                "from_lng": {"type": ["number", "null"], "minimum": 73, "maximum": 135.5},
                "from_lat": {"type": ["number", "null"], "minimum": 3, "maximum": 53.7},
                "to_lng": {"type": ["number", "null"], "minimum": 73, "maximum": 135.5},
                "to_lat": {"type": ["number", "null"], "minimum": 3, "maximum": 53.7},
                "mode": {"type": "string", "enum": ["driving", "walking"]},
            },
        },
    )
    registry.register(
        name="route_sort_day",
        description="Sort same-day stops by role semantics and nearest-neighbor attraction routing.",
        handler=route_sort_day_tool,
        input_schema={
            "type": "object",
            "properties": {
                "stops": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "slot": {"type": "string"},
                            "arrive_time": {"type": ["string", "null"]},
                            "stay_minutes": {
                                "type": ["integer", "null"],
                                "minimum": 1,
                            },
                            "poi": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "category": {
                                        "type": "string",
                                        "enum": ["eat", "play", "stay", "other"],
                                    },
                                    "lng": {
                                        "type": ["number", "null"],
                                        "minimum": 73,
                                        "maximum": 135.5,
                                    },
                                    "lat": {
                                        "type": ["number", "null"],
                                        "minimum": 3,
                                        "maximum": 53.7,
                                    },
                                },
                                "required": ["name", "category"],
                            },
                        },
                        "required": ["poi"],
                    },
                },
                "start_lng": {
                    "type": ["number", "null"],
                    "minimum": 73,
                    "maximum": 135.5,
                },
                "start_lat": {
                    "type": ["number", "null"],
                    "minimum": 3,
                    "maximum": 53.7,
                },
            },
            "required": ["stops"],
        },
    )
    registry.register(
        name="validate_itinerary",
        description="Validate an itinerary draft and return contract warnings.",
        handler=validate_itinerary_tool,
        input_schema={
            "type": "object",
            "properties": {"itinerary": {"type": "object"}},
            "required": ["itinerary"],
        },
    )
    return registry


def _validate_schema(schema: dict[str, Any], value: Any, path: str = "args") -> list[str]:
    """校验 registry v0 使用的 JSON Schema 子集，不引入额外运行时依赖。"""
    if not schema:
        return []
    expected = schema.get("type")
    expected_types = expected if isinstance(expected, list) else [expected]
    if expected and not any(_matches_type(value, item) for item in expected_types):
        return [f"{path} must be of type {expected}"]
    if "enum" in schema and value not in schema["enum"]:
        return [f"{path} must be one of {schema['enum']}"]

    errors: list[str] = []
    if isinstance(value, dict):
        required = schema.get("required", [])
        for name in required:
            if name not in value:
                errors.append(f"{path}.{name} is required")
        properties = schema.get("properties", {})
        for name, child in properties.items():
            if name in value:
                errors.extend(_validate_schema(child, value[name], f"{path}.{name}"))
    elif isinstance(value, list) and "items" in schema:
        for index, item in enumerate(value):
            errors.extend(_validate_schema(schema["items"], item, f"{path}[{index}]"))
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(value):
            errors.append(f"{path} must be finite")
            return errors
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path} must be >= {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path} must be <= {schema['maximum']}")
    return errors


def _invalid_tool_args_result(tool_name: str, errors: list[str]) -> ToolResult:
    return ToolResult(
        ok=False,
        error="invalid_tool_args",
        warnings=[
            ToolWarning(
                code="invalid_tool_args",
                severity="error",
                message="Tool arguments do not match the registered input schema.",
                details={"tool_name": tool_name, "errors": errors},
            )
        ],
    )


def _matches_type(value: Any, expected: str) -> bool:
    if expected == "null":
        return value is None
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    return True
