from app import transit, validators, workflow
from app.agent.schemas import ToolContext, ToolResult, ToolWarning
from app.schemas import ItineraryCreate
from app.tools.route_sort_day import route_sort_day
from app.tools.schemas import RouteStop

_SLOT_ALIASES = {
    "breakfast": "breakfast",
    "早餐": "breakfast",
    "早饭": "breakfast",
    "lunch": "lunch",
    "午餐": "lunch",
    "午饭": "lunch",
    "dinner": "dinner",
    "晚餐": "dinner",
    "晚饭": "dinner",
    "attraction": "attraction",
    "play": "attraction",
    "景点": "attraction",
    "游玩": "attraction",
    "hotel": "hotel",
    "stay": "hotel",
    "住宿": "hotel",
    "酒店": "hotel",
}


def parse_user_intent_tool(args: dict, context: ToolContext) -> ToolResult:
    intent = workflow.parse_intent(str(args.get("query", "")))
    return ToolResult(
        data={
            "city": intent.city,
            "day_count": intent.day_count,
            "origin": intent.origin,
            "return_city": intent.return_city,
            "preferences": intent.preferences,
            "raw": intent.raw,
        }
    )


def estimate_visit_duration_tool(args: dict, context: ToolContext) -> ToolResult:
    slot = str(args.get("slot") or args.get("role") or "")
    minutes = workflow._DEFAULT_STAY.get(slot, 90)
    return ToolResult(data={"slot": slot, "stay_minutes": minutes})


def compute_transit_tool(args: dict, context: ToolContext) -> ToolResult:
    data = transit.recompute_segment(
        args.get("from_lng"),
        args.get("from_lat"),
        args.get("to_lng"),
        args.get("to_lat"),
        str(args.get("mode") or "driving"),
    )
    return ToolResult(data=data, degraded=bool(data.get("degraded")))


def route_sort_day_tool(args: dict, context: ToolContext) -> ToolResult:
    stops = [RouteStop.model_validate(item) for item in args.get("stops", [])]
    sorted_result = route_sort_day(
        stops,
        start_lng=args.get("start_lng"),
        start_lat=args.get("start_lat"),
    )
    warnings = [
        ToolWarning(
            code=w.code,
            severity=w.severity,
            message=w.message,
            details={"stop_name": w.stop_name, "slot": w.slot, "category": w.category},
        )
        for w in sorted_result.warnings
    ]
    return ToolResult(
        data=sorted_result.model_dump(),
        warnings=warnings,
        degraded=sorted_result.degraded,
    )


def validate_itinerary_tool(args: dict, context: ToolContext) -> ToolResult:
    warnings: list[ToolWarning] = []
    raw_itinerary = args.get("itinerary", {})
    try:
        itinerary = ItineraryCreate.model_validate(raw_itinerary)
    except Exception as exc:
        return ToolResult(
            ok=False,
            degraded=True,
            error="invalid_itinerary_schema",
            warnings=[
                ToolWarning(
                    code="invalid_itinerary_schema",
                    severity="error",
                    message=str(exc),
                )
            ],
        )

    seen: set[str] = set()
    raw_days = raw_itinerary.get("days", []) if isinstance(raw_itinerary, dict) else []
    for day_index, day in enumerate(itinerary.days):
        raw_stops = (
            raw_days[day_index].get("stops", [])
            if day_index < len(raw_days) and isinstance(raw_days[day_index], dict)
            else []
        )
        slots = []
        last_time = -1
        for stop_index, stop in enumerate(day.stops):
            raw_stop = raw_stops[stop_index] if stop_index < len(raw_stops) else {}
            name = stop.poi.name
            if name in seen:
                warnings.append(
                    ToolWarning(
                        code="duplicate_poi",
                        severity="warning",
                        message=f"Duplicate POI: {name}",
                        details={"poi_name": name, "day_index": day.day_index},
                    )
                )
            seen.add(name)
            if stop.poi.lng is None or stop.poi.lat is None:
                warnings.append(
                    ToolWarning(
                        code="missing_coordinates",
                        severity="warning",
                        message=f"Missing coordinates: {name}",
                        details={"poi_name": name, "day_index": day.day_index},
                    )
                )
            slot = _slot_from_raw_stop(raw_stop, stop.poi.category)
            if slot:
                slots.append(slot)
            minutes = _hhmm_to_min(stop.arrive_time)
            if minutes is not None:
                if minutes < last_time:
                    warnings.append(
                        ToolWarning(
                            code="non_monotonic_time",
                            severity="warning",
                            message="Stop arrive_time is earlier than a previous stop.",
                            details={"day_index": day.day_index, "order_index": stop.order_index},
                        )
                    )
                last_time = max(last_time, minutes)
        required = {"breakfast", "lunch", "dinner", "attraction", "hotel"}
        if not required <= set(slots):
            warnings.append(
                ToolWarning(
                    code="incomplete_day_structure",
                    severity="warning",
                    message="Day does not contain breakfast, lunch, dinner, attraction, and hotel roles.",
                    details={"day_index": day.day_index, "slots": slots},
                )
            )

    return ToolResult(
        data={"valid": not warnings, "day_count": len(itinerary.days)},
        warnings=warnings,
        degraded=bool(warnings),
    )


def _slot_from_raw_stop(raw_stop, category: str) -> str | None:
    raw_slot = raw_stop.get("slot") if isinstance(raw_stop, dict) else ""
    slot = _SLOT_ALIASES.get(str(raw_slot or "").strip().lower())
    if slot:
        return slot
    return validators.CATEGORY_TO_SLOT.get(category)


def _hhmm_to_min(value: str | None) -> int | None:
    if not value or ":" not in value:
        return None
    try:
        hour, minute = value.split(":", 1)
        return int(hour) * 60 + int(minute)
    except ValueError:
        return None
