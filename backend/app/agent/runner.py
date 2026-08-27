import math
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
    """固定流程的 v0 harness，用于离线验证工具链，不改变现有产品流程。"""

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
        # 每次工具调用都进入 trace，测试和 eval 可以直接复盘输入、输出和 warning。
        trace.append(ToolTraceEntry(call=call, result=result))
        warnings.extend(result.warnings)
        return result

    def run(self, request: HarnessRequest) -> HarnessRunResult:
        # v0 先采用确定性顺序，保证同一输入能产生可比较的 trace；
        # LLM-planned runner 会复用同一套 registry 和 result schema。
        context = ToolContext(run_id=uuid.uuid4().hex)
        trace: list[ToolTraceEntry] = []
        warnings: list[ToolWarning] = []
        state: dict = {}

        # 1. 解析用户意图，得到城市、天数和偏好等后续工具共享的状态。
        intent = self._call(
            "parse_user_intent",
            {"query": request.query},
            context,
            trace,
            warnings,
        )
        state["intent"] = intent.data

        # 2. 对单日 stops 做顺路排序，排序结果会成为交通计算和校验的输入。
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

        # 3. 对排序后的相邻 stops 逐段计算交通，保留 from/to order 便于 replay。
        transits = []
        for idx, (prev_stop, cur_stop) in enumerate(zip(sorted_stops, sorted_stops[1:]), start=1):
            prev = prev_stop["poi"]
            cur = cur_stop["poi"]
            mode = _transit_mode_for_stops(prev_stop, cur_stop)
            transit = self._call(
                "compute_transit",
                {
                    "from_order_index": idx,
                    "to_order_index": idx + 1,
                    "from_lng": prev.get("lng"),
                    "from_lat": prev.get("lat"),
                    "to_lng": cur.get("lng"),
                    "to_lat": cur.get("lat"),
                    "mode": mode,
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

        # 4. 将工具中间状态组装成最小 itinerary 草案，再走统一契约校验。
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
            degraded=any(entry.result.degraded or not entry.result.ok for entry in trace),
        )


def _itinerary_from_stops(intent: dict, stops: list[dict]) -> dict:
    # validate_itinerary 复用现有 ItineraryCreate schema，因此这里把 tool
    # stop 转成最小可校验草案；未知 category 先过滤，避免污染 schema 校验。
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
                        # slot/time/stay 都是校验契约的一部分，组装中间草案时
                        # 必须原样保留，不能因 schema 暂未建模 slot 而丢失。
                        "slot": stop.get("slot", ""),
                        "arrive_time": stop.get("arrive_time"),
                        "stay_minutes": stop.get("stay_minutes"),
                        "poi": stop["poi"],
                    }
                    for idx, stop in enumerate(valid, start=1)
                ],
            }
        ],
    }


def _transit_mode_for_stops(from_stop: dict, to_stop: dict) -> str:
    """短距离优先步行；坐标不足或超过阈值时使用驾车。"""
    origin = from_stop.get("poi", {})
    destination = to_stop.get("poi", {})
    coords = (
        origin.get("lng"),
        origin.get("lat"),
        destination.get("lng"),
        destination.get("lat"),
    )
    if any(value is None for value in coords):
        return "driving"
    distance = _haversine_m(*coords)
    return "walking" if distance <= 2000 else "driving"


def _haversine_m(from_lng: float, from_lat: float, to_lng: float, to_lat: float) -> int:
    radius = 6371000.0
    p1, p2 = math.radians(from_lat), math.radians(to_lat)
    dphi = math.radians(to_lat - from_lat)
    dlambda = math.radians(to_lng - from_lng)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return int(2 * radius * math.asin(math.sqrt(h)))
