from typing import Literal

from pydantic import BaseModel, Field

StopRole = Literal["breakfast", "lunch", "dinner", "attraction", "hotel", "unknown"]
ToolPOICategory = Literal["eat", "play", "stay", "other"]
WarningSeverity = Literal["info", "warning", "error"]
RouteSortWarningCode = Literal[
    "missing_coordinates",
    "unknown_role",
    "category_role_fallback",
    "ambiguous_meal_role",
]


class ToolPOI(BaseModel):
    name: str
    category: ToolPOICategory
    lng: float | None = None
    lat: float | None = None
    address: str | None = None
    amap_id: str | None = None


class RouteStop(BaseModel):
    slot: str = ""
    poi: ToolPOI
    arrive_time: str | None = None
    stay_minutes: int | None = Field(default=None, ge=1)


class RouteSortWarning(BaseModel):
    code: RouteSortWarningCode
    severity: WarningSeverity = "warning"
    stop_name: str
    slot: str = ""
    category: str | None = None
    message: str = ""


class RouteSortResult(BaseModel):
    stops: list[RouteStop]
    degraded: bool = False
    warnings: list[RouteSortWarning] = Field(default_factory=list)
