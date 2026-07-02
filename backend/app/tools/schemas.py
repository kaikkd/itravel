from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import POICreate

StopRole = Literal["breakfast", "lunch", "dinner", "attraction", "hotel", "unknown"]
RouteSortWarningCode = Literal[
    "missing_coordinates",
    "unknown_role",
    "category_role_fallback",
    "ambiguous_meal_role",
]


class RouteStop(BaseModel):
    slot: str = ""
    poi: POICreate
    arrive_time: str | None = None
    stay_minutes: int | None = Field(default=None, ge=1)


class RouteSortWarning(BaseModel):
    code: RouteSortWarningCode
    stop_name: str
    slot: str = ""
    category: str | None = None
    message: str = ""


class RouteSortResult(BaseModel):
    stops: list[RouteStop]
    degraded: bool = False
    warnings: list[RouteSortWarning] = Field(default_factory=list)
