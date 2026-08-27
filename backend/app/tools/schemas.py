from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app import validators

StopRole = Literal["breakfast", "lunch", "dinner", "attraction", "hotel", "unknown"]
ToolPOICategory = Literal["eat", "play", "stay", "other"]
WarningSeverity = Literal["info", "warning", "error"]
RouteSortWarningCode = Literal[
    "missing_coordinates",
    "unknown_role",
    "category_role_fallback",
    "ambiguous_meal_role",
    "role_category_mismatch",
]


class ToolPOI(BaseModel):
    name: str
    category: ToolPOICategory
    lng: float | None = Field(default=None, allow_inf_nan=False)
    lat: float | None = Field(default=None, allow_inf_nan=False)
    address: str | None = None
    amap_id: str | None = None

    @model_validator(mode="after")
    def validate_coordinates(self):
        # 路由算法会直接对坐标做距离计算，因此在工具输入边界同时约束
        # 成对出现、有限数值和中国境内范围，避免脏值进入 haversine。
        if self.lng is None and self.lat is None:
            return self
        if not validators.valid_coord(self.lng, self.lat):
            raise ValueError("经纬度必须同时为空，或同时为中国境内的有限坐标")
        return self


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
