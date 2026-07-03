from collections.abc import Callable
from typing import Any

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
        try:
            return handler(call.args, context)
        except Exception as exc:
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
                "from_lng": {"type": ["number", "null"]},
                "from_lat": {"type": ["number", "null"]},
                "to_lng": {"type": ["number", "null"]},
                "to_lat": {"type": ["number", "null"]},
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
                "stops": {"type": "array"},
                "start_lng": {"type": ["number", "null"]},
                "start_lat": {"type": ["number", "null"]},
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
