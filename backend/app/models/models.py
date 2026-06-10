from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# 行程数据模型，对齐 PRD §10 ER：
# Itinerary → Day[] → Stop[] →（POI, 相邻 Stop 间 Transit），POI → Source[]


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str = ""  # M5 启用 argon2id；当前仅占位
    created_at: datetime = Field(default_factory=_utcnow)


class Itinerary(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    title: str
    city: str
    status: str = "draft"  # draft / saved
    day_count: int = 1
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class Day(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    itinerary_id: int = Field(foreign_key="itinerary.id", index=True)
    day_index: int  # 1-based，连续


class POI(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    amap_id: str | None = Field(default=None, index=True)
    name: str
    category: str  # eat / stay / play
    lng: float | None = None
    lat: float | None = None
    address: str | None = None
    rec_reason: str | None = None  # 推荐语；字数校验留 M2


class Stop(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    day_id: int = Field(foreign_key="day.id", index=True)
    poi_id: int = Field(foreign_key="poi.id", index=True)
    order_index: int  # 当天排序与连线顺序
    arrive_time: str | None = None  # HH:MM；耗时预估属 P1
    stay_minutes: int | None = None


class Transit(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    from_stop_id: int = Field(foreign_key="stop.id", index=True)
    to_stop_id: int = Field(foreign_key="stop.id", index=True)
    mode: str  # walking / driving 等
    duration_seconds: int | None = None
    distance_meters: int | None = None
    polyline: str | None = None  # 轨迹点串；增量重算留 M4


class Source(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    poi_id: int = Field(foreign_key="poi.id", index=True)
    url: str
    summary: str = ""
