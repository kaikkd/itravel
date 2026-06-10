from fastapi import APIRouter
from pydantic import BaseModel

from app.services import transit_service

router = APIRouter(prefix="/transit", tags=["transit"])


class SegmentIn(BaseModel):
    from_lng: float | None = None
    from_lat: float | None = None
    to_lng: float | None = None
    to_lat: float | None = None
    mode: str = "driving"


class RecomputeIn(BaseModel):
    segments: list[SegmentIn] = []


@router.post("/recompute")
def recompute(payload: RecomputeIn) -> dict:
    return {"results": transit_service.recompute_segments(payload.segments)}
