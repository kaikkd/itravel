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


class SelectedPoi(BaseModel):
    name: str
    category: Literal["eat", "stay", "play"] = "play"
    lng: float | None = None
    lat: float | None = None
    address: str | None = None


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
    # route_first：基于用户已选 POI + 节奏估算天数并排程（#11）
    plan_source: Literal["day_count", "poi_list"] = "day_count"
    pace: Literal["compact", "balanced", "relaxed"] | None = None
    selected_pois: list[SelectedPoi] = []


class CandidatesIn(BaseModel):
    city: str
    category: Literal["eat", "stay", "play"] | None = None
    keyword: str = ""
    limit: int = Field(default=8, ge=1, le=20)


class SuggestCityIn(BaseModel):
    free_text: str = ""
    history: list[ChatTurn] = []


@router.post("/stream")
def plan_stream(body: PlanStreamIn) -> StreamingResponse:
    """每日全景时间轴流式规划（SSE）：status/intent/skeleton/(estimate)/reply/day/itinerary/done。"""
    return StreamingResponse(
        plan_service.stream_plan_events(body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/candidates")
def plan_candidates(body: CandidatesIn) -> dict:
    """景点/类目候选：LLM 按城市+类型推荐知名地点，失败回退高德桩（#11）。"""
    return plan_service.candidate_pois(
        city=body.city,
        category=body.category,
        keyword=body.keyword,
        limit=body.limit,
    )


@router.post("/suggest-city")
def plan_suggest_city(body: SuggestCityIn) -> dict:
    """按兴趣/景点类型推荐候选城市（route_first path B），失败回退桩（#11）。"""
    return plan_service.suggest_city(free_text=body.free_text, history=body.history)
