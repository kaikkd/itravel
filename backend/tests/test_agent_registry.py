from app.agent.registry import ToolRegistry, build_default_registry
from app.agent.schemas import ToolCall, ToolContext, ToolResult


def test_registry_registers_and_calls_tool():
    registry = ToolRegistry()

    def echo(args, context):
        return ToolResult(data={"echo": args["value"], "run_id": context.run_id})

    registry.register(
        name="echo",
        description="Echo a value",
        handler=echo,
        input_schema={"type": "object"},
        output_schema={"type": "object"},
    )

    result = registry.call(ToolCall(name="echo", args={"value": "hi"}), ToolContext(run_id="r1"))

    assert result.ok is True
    assert result.data == {"echo": "hi", "run_id": "r1"}
    assert registry.get_spec("echo").description == "Echo a value"


def test_registry_unknown_tool_returns_structured_error():
    registry = ToolRegistry()

    result = registry.call(ToolCall(name="missing", args={}), ToolContext())

    assert result.ok is False
    assert result.degraded is True
    assert result.error == "unknown_tool"
    assert result.warnings[0].code == "unknown_tool"


def test_failed_tool_result_enforces_degraded_model_invariant():
    result = ToolResult(ok=False, degraded=False, error="failed")

    assert result.degraded is True


def test_default_registry_exposes_route_sort_day():
    registry = build_default_registry()
    spec_names = {spec.name for spec in registry.list_specs()}

    assert "route_sort_day" in spec_names

    result = registry.call(
        ToolCall(
            name="route_sort_day",
            args={
                "stops": [
                    {
                        "slot": "早餐",
                        "poi": {"name": "早餐店", "category": "eat", "lng": 104.0, "lat": 30.65},
                    },
                    {
                        "slot": "景点",
                        "poi": {"name": "近景点", "category": "play", "lng": 104.02, "lat": 30.65},
                    },
                ],
                "start_lng": 104.0,
                "start_lat": 30.65,
            },
        ),
        ToolContext(run_id="registry-test"),
    )

    assert result.ok is True
    assert result.data["stops"][0]["poi"]["name"] == "早餐店"
    assert result.data["stops"][1]["poi"]["name"] == "近景点"


def test_registry_validates_required_input_schema_before_calling_handler():
    registry = build_default_registry()

    result = registry.call(ToolCall(name="parse_user_intent", args={}), ToolContext())

    assert result.ok is False
    assert result.degraded is True
    assert result.error == "invalid_tool_args"
    assert result.warnings[0].code == "invalid_tool_args"


def test_registry_rejects_invalid_compute_transit_mode():
    registry = build_default_registry()

    result = registry.call(
        ToolCall(
            name="compute_transit",
            args={
                "from_lng": 104.0,
                "from_lat": 30.65,
                "to_lng": 104.01,
                "to_lat": 30.65,
                "mode": "flying",
            },
        ),
        ToolContext(),
    )

    assert result.ok is False
    assert result.error == "invalid_tool_args"


def test_registry_validates_route_stop_items_before_handler_execution():
    registry = build_default_registry()

    result = registry.call(
        ToolCall(name="route_sort_day", args={"stops": [{"slot": "attraction"}]}),
        ToolContext(),
    )

    assert result.ok is False
    assert result.error == "invalid_tool_args"
    assert "args.stops[0].poi is required" in result.warnings[0].details["errors"]


def test_registry_maps_nested_pydantic_validation_to_invalid_tool_args():
    registry = build_default_registry()

    result = registry.call(
        ToolCall(
            name="route_sort_day",
            args={
                "stops": [
                    {
                        "slot": "attraction",
                        "poi": {
                            "name": "半截坐标",
                            "category": "play",
                            "lng": 104.0,
                            "lat": None,
                        },
                    }
                ]
            },
        ),
        ToolContext(),
    )

    assert result.ok is False
    assert result.degraded is True
    assert result.error == "invalid_tool_args"
    assert result.warnings[0].code == "invalid_tool_args"
