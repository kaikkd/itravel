import uuid

from app.agent.planner import LLMToolPlanner, PlannerResult, ToolPlanner
from app.agent.recorder import AgentHarnessRecorder
from app.agent.registry import ToolRegistry, build_default_registry
from app.agent.runner import _itinerary_from_stops
from app.agent.schemas import (
    HarnessRequest,
    HarnessRunResult,
    ToolCall,
    ToolContext,
    ToolTraceEntry,
    ToolWarning,
)


class LLMAgentHarnessRunner:
    """LLM-planned v0 harness with bounded tools and replay recording."""

    def __init__(
        self,
        *,
        registry: ToolRegistry | None = None,
        planner: ToolPlanner | None = None,
        recorder: AgentHarnessRecorder | None = None,
    ) -> None:
        self.registry = registry or build_default_registry()
        self.planner = planner or LLMToolPlanner()
        self.recorder = recorder

    def run(self, request: HarnessRequest) -> HarnessRunResult:
        context = ToolContext(run_id=uuid.uuid4().hex)
        trace: list[ToolTraceEntry] = []
        warnings: list[ToolWarning] = []
        state: dict = {}

        planner_result = self.planner.plan(request, self.registry)
        warnings.extend(planner_result.warnings)
        state["planner"] = planner_result.model_dump()

        for planned_call in planner_result.tool_calls:
            self._execute_planned_call(planned_call, request, context, state, trace, warnings)

        result = HarnessRunResult(
            state=state,
            trace=trace,
            warnings=warnings,
            degraded=planner_result.degraded or any(entry.result.degraded for entry in trace),
        )
        if self.recorder is not None:
            self.recorder.record(
                request=request,
                planner_result=planner_result,
                result=result,
            )
        return result

    def _execute_planned_call(
        self,
        planned_call: ToolCall,
        request: HarnessRequest,
        context: ToolContext,
        state: dict,
        trace: list[ToolTraceEntry],
        warnings: list[ToolWarning],
    ) -> None:
        if planned_call.name == "parse_user_intent":
            result = self._call(
                ToolCall(name=planned_call.name, args={"query": request.query}),
                context,
                trace,
                warnings,
            )
            state["intent"] = result.data
            return

        if planned_call.name == "route_sort_day":
            result = self._call(
                ToolCall(
                    name=planned_call.name,
                    args={
                        "stops": request.stops,
                        "start_lng": request.start_lng,
                        "start_lat": request.start_lat,
                    },
                ),
                context,
                trace,
                warnings,
            )
            state["sorted_stops"] = result.data.get("stops", [])
            return

        if planned_call.name == "compute_transit":
            self._compute_all_adjacent_transits(context, state, trace, warnings)
            return

        if planned_call.name == "validate_itinerary":
            itinerary = _itinerary_from_stops(
                state.get("intent", {}),
                state.get("sorted_stops", request.stops),
            )
            result = self._call(
                ToolCall(name=planned_call.name, args={"itinerary": itinerary}),
                context,
                trace,
                warnings,
            )
            state["validation"] = result.data
            return

        result = self._call(planned_call, context, trace, warnings)
        state.setdefault("tool_results", {})[planned_call.name] = result.data

    def _compute_all_adjacent_transits(
        self,
        context: ToolContext,
        state: dict,
        trace: list[ToolTraceEntry],
        warnings: list[ToolWarning],
    ) -> None:
        sorted_stops = state.get("sorted_stops", [])
        transits = []
        for idx, (prev_stop, cur_stop) in enumerate(zip(sorted_stops, sorted_stops[1:]), start=1):
            prev = prev_stop["poi"]
            cur = cur_stop["poi"]
            result = self._call(
                ToolCall(
                    name="compute_transit",
                    args={
                        "from_order_index": idx,
                        "to_order_index": idx + 1,
                        "from_lng": prev.get("lng"),
                        "from_lat": prev.get("lat"),
                        "to_lng": cur.get("lng"),
                        "to_lat": cur.get("lat"),
                        "mode": "driving",
                    },
                ),
                context,
                trace,
                warnings,
            )
            transits.append(
                {
                    "from_order_index": idx,
                    "to_order_index": idx + 1,
                    **result.data,
                }
            )
        state["transits"] = transits

    def _call(
        self,
        call: ToolCall,
        context: ToolContext,
        trace: list[ToolTraceEntry],
        warnings: list[ToolWarning],
    ):
        result = self.registry.call(call, context)
        trace.append(ToolTraceEntry(call=call, result=result))
        warnings.extend(result.warnings)
        return result
