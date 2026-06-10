from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.services import plan_service

router = APIRouter(prefix="/plan", tags=["plan"])


@router.get("/stream")
def plan_stream(q: str = Query(..., min_length=1)) -> StreamingResponse:
    return StreamingResponse(
        plan_service.stream_plan_events(q),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
