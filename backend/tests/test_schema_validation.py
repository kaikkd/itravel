import pytest
from pydantic import ValidationError

from app.schemas import (
    DayCreate,
    ItineraryCreate,
    POICreate,
    SourceCreate,
    StopCreate,
)


def test_saved_itinerary_requires_minimum_pois():
    with pytest.raises(ValidationError):
        ItineraryCreate(
            title="空行程",
            city="成都",
            status="saved",
            days=[DayCreate(day_index=1, stops=[])],
        )


def test_source_url_requires_http_scheme():
    with pytest.raises(ValidationError):
        SourceCreate(url="javascript:alert(1)", summary="bad")


def test_invalid_category_is_rejected():
    with pytest.raises(ValidationError):
        POICreate(name="咖啡馆", category="drink")


def test_day_and_stop_indexes_must_be_contiguous():
    with pytest.raises(ValidationError):
        ItineraryCreate(
            title="跳天数",
            city="成都",
            days=[
                DayCreate(
                    day_index=2,
                    stops=[
                        StopCreate(
                            order_index=1,
                            poi=POICreate(name="武侯祠", category="play"),
                        )
                    ],
                )
            ],
        )
