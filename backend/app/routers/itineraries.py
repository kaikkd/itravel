from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import auth
from app.db import get_session
from app.models.models import User
from app.schemas import ItineraryCreate, ItineraryRead, ItinerarySummary
from app.services import itinerary_service

router = APIRouter(prefix="/itineraries", tags=["itineraries"])


@router.post("", response_model=ItineraryRead)
def create_itinerary(
    payload: ItineraryCreate,
    session: Session = Depends(get_session),
    current: User = Depends(auth.get_current_user),
) -> ItineraryRead:
    return itinerary_service.create_for_user(session, payload, current.id)


@router.get("", response_model=list[ItinerarySummary])
def list_itineraries(
    session: Session = Depends(get_session),
    current: User = Depends(auth.get_current_user),
) -> list[ItinerarySummary]:
    return itinerary_service.list_for_user(session, current.id)


@router.get("/{itinerary_id}", response_model=ItineraryRead)
def get_itinerary(
    itinerary_id: int,
    session: Session = Depends(get_session),
    current: User = Depends(auth.get_current_user),
) -> ItineraryRead:
    return itinerary_service.get_for_user(session, itinerary_id, current.id)


@router.delete("/{itinerary_id}")
def delete_itinerary(
    itinerary_id: int,
    session: Session = Depends(get_session),
    current: User = Depends(auth.get_current_user),
) -> dict[str, bool]:
    return itinerary_service.delete_for_user(session, itinerary_id, current.id)
