from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# 嵌套读写 DTO，与 table 模型分离，避免跨 session 懒加载问题。
# 写入用 *Create（无 id），读取用 *Read（含 id），列表用 Summary。


Category = Literal["eat", "stay", "play"]
ItineraryStatus = Literal["draft", "saved"]
TransitMode = Literal["walking", "driving"]


def _valid_coord(lng: float | None, lat: float | None) -> bool:
    if lng is None and lat is None:
        return True
    if lng is None or lat is None:
        return False
    return -180.0 <= lng <= 180.0 and -90.0 <= lat <= 90.0


class SourceCreate(BaseModel):
    url: str
    summary: str = ""

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("来源链接必须是 http/https URL")
        return value


class POICreate(BaseModel):
    amap_id: str | None = None
    name: str
    category: Category
    lng: float | None = None
    lat: float | None = None
    address: str | None = None
    rec_reason: str | None = None
    sources: list[SourceCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_coordinates(self):
        if not _valid_coord(self.lng, self.lat):
            raise ValueError("经纬度必须同时为空或同时合法")
        return self

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("POI 名称不能为空")
        return value

    @field_validator("rec_reason")
    @classmethod
    def validate_rec_reason(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 50:
            return value[:49] + "…"
        return value


class StopCreate(BaseModel):
    order_index: int = Field(ge=1)
    poi: POICreate
    arrive_time: str | None = None
    stay_minutes: int | None = Field(default=None, ge=1)


class TransitCreate(BaseModel):
    # 用当天 Stop 的 order_index 指明相邻段，落库时映射为真实 stop_id
    from_order_index: int = Field(ge=1)
    to_order_index: int = Field(ge=1)
    mode: TransitMode
    duration_seconds: int | None = None
    distance_meters: int | None = None
    polyline: str | None = None


class DayCreate(BaseModel):
    day_index: int = Field(ge=1)
    stops: list[StopCreate] = Field(default_factory=list)
    transits: list[TransitCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_stop_order(self):
        if self.stops:
            orders = sorted(s.order_index for s in self.stops)
            expected = list(range(1, len(self.stops) + 1))
            if orders != expected:
                raise ValueError("Stop order_index 必须从 1 连续递增")
        return self


class ItineraryCreate(BaseModel):
    title: str
    city: str
    user_id: int | None = None
    status: ItineraryStatus = "draft"
    days: list[DayCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_itinerary(self):
        if self.days:
            day_indexes = sorted(d.day_index for d in self.days)
            expected = list(range(1, len(self.days) + 1))
            if day_indexes != expected:
                raise ValueError("day_index 必须从 1 连续递增")
        if self.status == "saved":
            poi_count = sum(len(day.stops) for day in self.days)
            if len(self.days) < 1 or poi_count < 3:
                raise ValueError("保存行程至少需要 1 天且不少于 3 个 POI")
        return self


# ---- 读取 DTO ----


class SourceRead(BaseModel):
    id: int
    url: str
    summary: str


class POIRead(BaseModel):
    id: int
    amap_id: str | None
    name: str
    category: Category
    lng: float | None
    lat: float | None
    address: str | None
    rec_reason: str | None
    sources: list[SourceRead] = Field(default_factory=list)


class StopRead(BaseModel):
    id: int
    order_index: int
    arrive_time: str | None
    stay_minutes: int | None
    poi: POIRead


class TransitRead(BaseModel):
    id: int
    from_stop_id: int
    to_stop_id: int
    mode: TransitMode
    duration_seconds: int | None
    distance_meters: int | None
    polyline: str | None


class DayRead(BaseModel):
    id: int
    day_index: int
    stops: list[StopRead] = Field(default_factory=list)
    transits: list[TransitRead] = Field(default_factory=list)


class ItineraryRead(BaseModel):
    id: int
    user_id: int | None
    title: str
    city: str
    status: ItineraryStatus
    day_count: int
    days: list[DayRead] = Field(default_factory=list)


class ItinerarySummary(BaseModel):
    id: int
    title: str
    city: str
    status: ItineraryStatus
    day_count: int
