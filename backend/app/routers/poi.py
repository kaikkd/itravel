from fastapi import APIRouter, Query

from app import llm  # re-exported for existing tests that monkeypatch app.routers.poi.llm
from app.services import poi_service

router = APIRouter(prefix="/poi", tags=["poi"])


@router.get("/candidates")
def candidates(
    city: str = Query(..., min_length=1),
    category: str = Query(...),
    exclude: str = Query(""),
    regenerate: bool = Query(False),
) -> dict:
    return poi_service.get_candidates(city, category, exclude, regenerate)
