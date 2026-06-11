from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services import plan_service

router = APIRouter(prefix="/plan", tags=["plan"])


@router.get("/stream")
def plan_stream(q: str = Query(..., min_length=1)) -> StreamingResponse:
    return StreamingResponse(
        plan_service.stream_plan_events(q),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class SuggestIn(BaseModel):
    destination: str
    origin: str = ""
    return_city: str = ""
    day_count: int = 3
    preferences: list[str] = []
    free_text: str = ""


@router.post("/suggestions")
def plan_suggestions(body: SuggestIn) -> dict:
    """结合出发/目的/返回与偏好，返回每天结构化候选 POI（LLM，失败回退桩）。"""
    return plan_service.suggest_itinerary(
        origin=body.origin,
        destination=body.destination,
        return_city=body.return_city,
        day_count=body.day_count,
        preferences=body.preferences,
        free_text=body.free_text,
    )
