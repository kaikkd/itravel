from typing import Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.schemas import ItineraryCreate
from app.services import plan_service

router = APIRouter(prefix="/plan", tags=["plan"])


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class PlanStreamIn(BaseModel):
    destination: str
    origin: str = ""
    return_city: str = ""
    day_count: int = Field(default=3, ge=1, le=10)
    preferences: list[str] = []
    free_text: str = ""
    # 多轮上下文：前端 SSOT 保存的对话与当前行程，回传以支持「最小改动」式修改。
    history: list[ChatTurn] = []
    current_plan: ItineraryCreate | None = None
    conversation_id: str | None = None  # 预留：协议前向兼容，当前不持久化


@router.post("/stream")
def plan_stream(body: PlanStreamIn) -> StreamingResponse:
    """每日全景时间轴流式规划（SSE）：status/intent/skeleton/reply/day/itinerary/done。"""
    return StreamingResponse(
        plan_service.stream_plan_events(body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
