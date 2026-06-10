from fastapi import HTTPException
from sqlmodel import Session

from app import crud
from app.schemas import ItineraryCreate, ItineraryRead, ItinerarySummary


def create_for_user(
    session: Session,
    payload: ItineraryCreate,
    user_id: int,
) -> ItineraryRead:
    payload.user_id = user_id
    itinerary = crud.create_itinerary(session, payload)
    result = crud.get_itinerary(session, itinerary.id, user_id=user_id)
    if result is None:
        raise HTTPException(status_code=500, detail="行程保存后读取失败")
    return result


def list_for_user(session: Session, user_id: int) -> list[ItinerarySummary]:
    return crud.list_itineraries(session, user_id=user_id)


def get_for_user(session: Session, itinerary_id: int, user_id: int) -> ItineraryRead:
    result = crud.get_itinerary(session, itinerary_id, user_id=user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="行程不存在")
    return result


def delete_for_user(session: Session, itinerary_id: int, user_id: int) -> dict[str, bool]:
    ok = crud.delete_itinerary(session, itinerary_id, user_id=user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="行程不存在")
    return {"deleted": True}
