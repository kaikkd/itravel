import uuid

from app.agent.registry import ToolRegistry, build_default_registry
from app.agent.schemas import (
    HarnessRequest,
    HarnessRunResult,
    ToolCall,
    ToolContext,
    ToolTraceEntry,
    ToolWarning,
)


class AgentHarnessRunner:
    """Deterministic v0 harness that records tool calls without changing product flow."""

    def __init__(self, registry: ToolRegistry | None = None) -> None:
        self.registry = registry or build_default_registry()

    def _call(
        self,
        name: str,
        args: dict,
        context: ToolContext,
        trace: list[ToolTraceEntry],
        warnings: list[ToolWarning],
    ):
        call = ToolCall(name=name, args=args)
        result = self.registry.call(call, context)
        trace.append(ToolTraceEntry(call=call, result=result))
        warnings.extend(result.warnings)
        return result

    def run(self, request: HarnessRequest) -> HarnessRunResult:
        context = ToolContext(run_id=uuid.uuid4().hex)
        trace: list[ToolTraceEntry] = []
        warnings: list[ToolWarning] = []
        state: dict = {}

        intent = self._call(
            "parse_user_intent",
            {"query": request.query},
            context,
            trace,
            warnings,
        )
        state["intent"] = intent.data

        sorted_result = self._call(
            "route_sort_day",
            {
                "stops": request.stops,
                "start_lng": request.start_lng,
                "start_lat": request.start_lat,
            },
            context,
            trace,
            warnings,
        )
        sorted_stops = sorted_result.data.get("stops", [])
        state["sorted_stops"] = sorted_stops

        transits = []
        for idx, (prev_stop, cur_stop) in enumerate(zip(sorted_stops, sorted_stops[1:]), start=1):
            prev = prev_stop["poi"]
            cur = cur_stop["poi"]
            transit = self._call(
                "compute_transit",
                {
                    "from_order_index": idx,
                    "to_order_index": idx + 1,
                    "from_lng": prev.get("lng"),
                    "from_lat": prev.get("lat"),
                    "to_lng": cur.get("lng"),
                    "to_lat": cur.get("lat"),
                    "mode": "driving",
                },
                context,
                trace,
                warnings,
            )
            transits.append(
                {
                    "from_order_index": idx,
                    "to_order_index": idx + 1,
                    **transit.data,
                }
            )
        state["transits"] = transits

        itinerary = _itinerary_from_stops(state.get("intent", {}), sorted_stops)
        validation = self._call(
            "validate_itinerary",
            {"itinerary": itinerary},
            context,
            trace,
            warnings,
        )
        state["validation"] = validation.data

        return HarnessRunResult(
            state=state,
            trace=trace,
            warnings=warnings,
            degraded=any(entry.result.degraded for entry in trace),
        )


def _itinerary_from_stops(intent: dict, stops: list[dict]) -> dict:
    valid = [s for s in stops if s.get("poi", {}).get("category") in {"eat", "play", "stay"}]
    return {
        "title": f"{intent.get('city', '目的地')}行程草案",
        "city": intent.get("city", ""),
        "status": "draft",
        "days": [
            {
                "day_index": 1,
                "stops": [
                    {
                        "order_index": idx,
                        "arrive_time": None,
                        "stay_minutes": stop.get("stay_minutes"),
                        "poi": stop["poi"],
                    }
                    for idx, stop in enumerate(valid, start=1)
                ],
            }
        ],
    }
