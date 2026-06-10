import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

import app.models  # noqa: F401 — 注册全部表到 metadata
from app import crud
from app.schemas import (
    DayCreate,
    ItineraryCreate,
    POICreate,
    SourceCreate,
    StopCreate,
    TransitCreate,
)


@pytest.fixture
def session():
    # 内存 SQLite + StaticPool，保证多次连接共享同一库
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _sample() -> ItineraryCreate:
    return ItineraryCreate(
        title="成都耍三天",
        city="成都",
        days=[
            DayCreate(
                day_index=1,
                stops=[
                    StopCreate(
                        order_index=2,  # 故意乱序，验证读取按 order_index 排序
                        poi=POICreate(name="锦里", category="eat"),
                    ),
                    StopCreate(
                        order_index=1,
                        poi=POICreate(
                            name="武侯祠",
                            category="play",
                            lng=104.0,
                            lat=30.6,
                            sources=[SourceCreate(url="https://e.com/a", summary="x")],
                        ),
                    ),
                ],
                transits=[
                    TransitCreate(
                        from_order_index=1, to_order_index=2, mode="walking"
                    )
                ],
            ),
            DayCreate(
                day_index=2,
                stops=[
                    StopCreate(
                        order_index=1,
                        poi=POICreate(name="熊猫基地", category="play"),
                    )
                ],
            ),
        ],
    )


def test_create_and_read_nested_tree(session: Session):
    created = crud.create_itinerary(session, _sample())
    read = crud.get_itinerary(session, created.id)

    assert read is not None
    assert read.title == "成都耍三天"
    assert read.day_count == 2
    assert len(read.days) == 2

    # Day 按 day_index 排序
    assert [d.day_index for d in read.days] == [1, 2]

    day1 = read.days[0]
    # Stop 按 order_index 排序（输入乱序）
    assert [s.order_index for s in day1.stops] == [1, 2]
    assert day1.stops[0].poi.name == "武侯祠"
    assert day1.stops[1].poi.name == "锦里"

    # 嵌套 Source
    assert len(day1.stops[0].poi.sources) == 1
    assert day1.stops[0].poi.sources[0].url == "https://e.com/a"

    # Transit 连接当天相邻 Stop
    assert len(day1.transits) == 1
    t = day1.transits[0]
    assert t.from_stop_id == day1.stops[0].id
    assert t.to_stop_id == day1.stops[1].id


def test_list_and_delete(session: Session):
    created = crud.create_itinerary(session, _sample())

    summaries = crud.list_itineraries(session)
    assert len(summaries) == 1
    assert summaries[0].id == created.id

    assert crud.delete_itinerary(session, created.id) is True
    assert crud.get_itinerary(session, created.id) is None
    assert crud.list_itineraries(session) == []
