from app.db import engine, init_db
from app.schemas import (
    DayCreate,
    ItineraryCreate,
    POICreate,
    SourceCreate,
    StopCreate,
    TransitCreate,
)
from sqlmodel import Session

from app import crud

# 「成都三天」示例行程，用于 M1 验收：手工塞一条行程并读出渲染到日程表。
SAMPLE = ItineraryCreate(
    title="成都耍三天",
    city="成都",
    status="draft",
    days=[
        DayCreate(
            day_index=1,
            stops=[
                StopCreate(
                    order_index=1,
                    arrive_time="09:30",
                    stay_minutes=120,
                    poi=POICreate(
                        amap_id="B001",
                        name="武侯祠",
                        category="play",
                        lng=104.0476,
                        lat=30.6464,
                        address="武侯区武侯祠大街231号",
                        rec_reason="三国文化地标，红墙竹影出片",
                        sources=[
                            SourceCreate(
                                url="https://example.com/wuhouci",
                                summary="武侯祠游览攻略",
                            )
                        ],
                    ),
                ),
                StopCreate(
                    order_index=2,
                    arrive_time="12:00",
                    stay_minutes=90,
                    poi=POICreate(
                        amap_id="B002",
                        name="锦里古街",
                        category="eat",
                        lng=104.0486,
                        lat=30.6447,
                        address="武侯区武侯祠大街231号附1号",
                        rec_reason="小吃一条街，三大炮必尝",
                    ),
                ),
            ],
            transits=[
                TransitCreate(
                    from_order_index=1,
                    to_order_index=2,
                    mode="walking",
                    duration_seconds=300,
                    distance_meters=350,
                )
            ],
        ),
        DayCreate(
            day_index=2,
            stops=[
                StopCreate(
                    order_index=1,
                    arrive_time="10:00",
                    stay_minutes=180,
                    poi=POICreate(
                        amap_id="B003",
                        name="大熊猫繁育研究基地",
                        category="play",
                        lng=104.1466,
                        lat=30.7339,
                        address="成华区熊猫大道1375号",
                        rec_reason="近距离看大熊猫，早到避开人潮",
                    ),
                ),
            ],
        ),
        DayCreate(
            day_index=3,
            stops=[
                # 故意缺经纬度，验证前端「仅列表展示」降级（PRD §5.3.3）
                StopCreate(
                    order_index=1,
                    arrive_time="11:00",
                    poi=POICreate(
                        name="某网红茶馆（坐标待补）",
                        category="eat",
                        rec_reason="盖碗茶 + 采耳，体验慢生活",
                    ),
                ),
            ],
        ),
    ],
)


def main() -> None:
    init_db()
    with Session(engine) as session:
        itinerary = crud.create_itinerary(session, SAMPLE)
        print(f"示例行程已插入 — id={itinerary.id}, title={itinerary.title}")


if __name__ == "__main__":
    main()
