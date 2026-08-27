from typing import Any, Literal, Self

from pydantic import BaseModel, Field, model_validator


WarningSeverity = Literal["info", "warning", "error"]


class ToolWarning(BaseModel):
    code: str
    message: str = ""
    severity: WarningSeverity = "warning"
    details: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    ok: bool = True
    data: dict[str, Any] = Field(default_factory=dict)
    warnings: list[ToolWarning] = Field(default_factory=list)
    degraded: bool = False
    error: str | None = None

    @model_validator(mode="after")
    def failed_tool_is_always_degraded(self) -> Self:
        # ok=False 表示工具未完成契约，不能同时被标记为健康结果。
        # 在模型层建立不变量，避免不同 runner 各自遗漏失败传播。
        if not self.ok:
            self.degraded = True
        return self


class ToolCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    call_id: str = ""


class ToolContext(BaseModel):
    run_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ToolSpec(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)


class ToolTraceEntry(BaseModel):
    call: ToolCall
    result: ToolResult


class HarnessRequest(BaseModel):
    query: str = ""
    stops: list[dict[str, Any]] = Field(default_factory=list)
    start_lng: float | None = None
    start_lat: float | None = None


class HarnessRunResult(BaseModel):
    state: dict[str, Any] = Field(default_factory=dict)
    trace: list[ToolTraceEntry] = Field(default_factory=list)
    warnings: list[ToolWarning] = Field(default_factory=list)
    degraded: bool = False
