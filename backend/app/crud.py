from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.models import (
    POI,
    Day,
    Itinerary,
    Source,
    Stop,
    Transit,
)
from app.schemas import (
    DayRead,
    ItineraryCreate,
    ItineraryRead,
    ItinerarySummary,
    POIRead,
    SourceRead,
    StopRead,
    TransitRead,
)


def create_itinerary(session: Session, payload: ItineraryCreate) -> Itinerary:
    """在单个事务内插入整棵行程树。"""
    itinerary = Itinerary(
        user_id=payload.user_id,
        title=payload.title,
        city=payload.city,
        status=payload.status,
        day_count=max(len(payload.days), 1),
    )
    session.add(itinerary)
    session.flush()  # 拿到 itinerary.id

    for day_in in payload.days:
        day = Day(itinerary_id=itinerary.id, day_index=day_in.day_index)
        session.add(day)
        session.flush()

        # order_index -> stop_id，供 Transit 映射相邻段
        order_to_stop_id: dict[int, int] = {}
        for stop_in in day_in.stops:
            poi = POI(
                amap_id=stop_in.poi.amap_id,
                name=stop_in.poi.name,
                category=stop_in.poi.category,
                lng=stop_in.poi.lng,
                lat=stop_in.poi.lat,
                address=stop_in.poi.address,
                rec_reason=stop_in.poi.rec_reason,
            )
            session.add(poi)
            session.flush()

            for src in stop_in.poi.sources:
                session.add(Source(poi_id=poi.id, url=src.url, summary=src.summary))

            stop = Stop(
                day_id=day.id,
                poi_id=poi.id,
                order_index=stop_in.order_index,
                arrive_time=stop_in.arrive_time,
                stay_minutes=stop_in.stay_minutes,
            )
            session.add(stop)
            session.flush()
            order_to_stop_id[stop_in.order_index] = stop.id

        for transit_in in day_in.transits:
            from_id = order_to_stop_id.get(transit_in.from_order_index)
            to_id = order_to_stop_id.get(transit_in.to_order_index)
            if from_id is None or to_id is None:
                continue  # 引用了不存在的 stop，跳过
            session.add(
                Transit(
                    from_stop_id=from_id,
                    to_stop_id=to_id,
                    mode=transit_in.mode,
                    duration_seconds=transit_in.duration_seconds,
                    distance_meters=transit_in.distance_meters,
                    polyline=transit_in.polyline,
                )
            )

    itinerary.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(itinerary)
    return itinerary


def get_itinerary(
    session: Session, itinerary_id: int, user_id: int | None = None
) -> ItineraryRead | None:
    """显式逐层查询 + 手动排序组装嵌套 DTO（不依赖懒加载）。
    传入 user_id 时校验归属，非本人视为不存在。"""
    itinerary = session.get(Itinerary, itinerary_id)
    if itinerary is None:
        return None
    if user_id is not None and itinerary.user_id != user_id:
        return None

    days = session.exec(
        select(Day)
        .where(Day.itinerary_id == itinerary_id)
        .order_by(Day.day_index)
    ).all()

    day_reads: list[DayRead] = []
    for day in days:
        stops = session.exec(
            select(Stop).where(Stop.day_id == day.id).order_by(Stop.order_index)
        ).all()

        stop_ids = [s.id for s in stops]
        stop_reads: list[StopRead] = []
        for stop in stops:
            poi = session.get(POI, stop.poi_id)
            sources = session.exec(
                select(Source).where(Source.poi_id == stop.poi_id)
            ).all()
            poi_read = POIRead(
                id=poi.id,
                amap_id=poi.amap_id,
                name=poi.name,
                category=poi.category,
                lng=poi.lng,
                lat=poi.lat,
                address=poi.address,
                rec_reason=poi.rec_reason,
                sources=[
                    SourceRead(id=s.id, url=s.url, summary=s.summary) for s in sources
                ],
            )
            stop_reads.append(
                StopRead(
                    id=stop.id,
                    order_index=stop.order_index,
                    arrive_time=stop.arrive_time,
                    stay_minutes=stop.stay_minutes,
                    poi=poi_read,
                )
            )

        transits = (
            session.exec(
                select(Transit).where(Transit.from_stop_id.in_(stop_ids))
            ).all()
            if stop_ids
            else []
        )
        transit_reads = [
            TransitRead(
                id=t.id,
                from_stop_id=t.from_stop_id,
                to_stop_id=t.to_stop_id,
                mode=t.mode,
                duration_seconds=t.duration_seconds,
                distance_meters=t.distance_meters,
                polyline=t.polyline,
            )
            for t in transits
        ]

        day_reads.append(
            DayRead(
                id=day.id,
                day_index=day.day_index,
                stops=stop_reads,
                transits=transit_reads,
            )
        )

    return ItineraryRead(
        id=itinerary.id,
        user_id=itinerary.user_id,
        title=itinerary.title,
        city=itinerary.city,
        status=itinerary.status,
        day_count=itinerary.day_count,
        days=day_reads,
    )


def list_itineraries(
    session: Session, user_id: int | None = None
) -> list[ItinerarySummary]:
    stmt = select(Itinerary).order_by(Itinerary.created_at.desc())
    if user_id is not None:
        stmt = stmt.where(Itinerary.user_id == user_id)
    rows = session.exec(stmt).all()
    return [
        ItinerarySummary(
            id=i.id,
            title=i.title,
            city=i.city,
            status=i.status,
            day_count=i.day_count,
        )
        for i in rows
    ]


def delete_itinerary(
    session: Session, itinerary_id: int, user_id: int | None = None
) -> bool:
    """删除行程及其全部子节点。传入 user_id 时校验归属。"""
    itinerary = session.get(Itinerary, itinerary_id)
    if itinerary is None:
        return False
    if user_id is not None and itinerary.user_id != user_id:
        return False

    days = session.exec(select(Day).where(Day.itinerary_id == itinerary_id)).all()
    for day in days:
        stops = session.exec(select(Stop).where(Stop.day_id == day.id)).all()
        stop_ids = [s.id for s in stops]
        if stop_ids:
            for t in session.exec(
                select(Transit).where(Transit.from_stop_id.in_(stop_ids))
            ).all():
                session.delete(t)
        for stop in stops:
            for src in session.exec(
                select(Source).where(Source.poi_id == stop.poi_id)
            ).all():
                session.delete(src)
            poi = session.get(POI, stop.poi_id)
            session.delete(stop)
            if poi is not None:
                session.delete(poi)
        session.delete(day)

    session.delete(itinerary)
    session.commit()
    return True
