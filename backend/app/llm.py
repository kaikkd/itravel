import uuid
from collections.abc import Iterator

from openai import AzureOpenAI, OpenAI

from app.config import settings


class LLMNotConfigured(RuntimeError):
    """缺少 LLM 凭证；由 Workflow 捕获走降级，不崩服务。"""


def _logid() -> str:
    return settings.tt_logid or uuid.uuid4().hex


def build_client() -> OpenAI | AzureOpenAI:
    """azure_endpoint 非空走 Azure 协议，否则走标准 OpenAI 兼容。换供应商=改 env。"""
    if not settings.openai_api_key:
        raise LLMNotConfigured("OPENAI_API_KEY 未配置")

    if settings.azure_endpoint:
        return AzureOpenAI(
            api_key=settings.openai_api_key,
            api_version=settings.openai_api_version,
            azure_endpoint=settings.azure_endpoint,
            default_headers={"X-TT-LOGID": _logid()},
        )

    if not settings.openai_base_url:
        raise LLMNotConfigured("未配置 AZURE_ENDPOINT 或 OPENAI_BASE_URL")
    # 标准 OpenAI 兼容端点（如 DeepSeek base_url=https://api.deepseek.com）。
    return OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
    )


_THINKING_ON = {"enabled", "on", "true", "1", "yes"}
_THINKING_OFF = {"disabled", "off", "false", "0", "no"}


def _reasoning_kwargs() -> dict:
    """按 env 注入推理参数；普通模型留空即不发送，对各供应商无副作用。

    - reasoning_effort: OpenAI / DeepSeek 通用的推理力度（minimal/low/medium/high）。
    - thinking: DeepSeek 思考模式。关键点——deepseek-v4 等模型「默认开思考」，
      只省略该参数仍会先吐思维链（被我们丢弃），首个正文 token 延迟数秒～十几秒；
      因此关闭时必须**显式**发送 {"type": "disabled"}，而非省略。
      仅对非 Azure（标准 OpenAI 兼容，如 DeepSeek）端点发送，避免 Azure 因未知字段 400。
    """
    kwargs: dict = {}
    if settings.openai_reasoning_effort:
        kwargs["reasoning_effort"] = settings.openai_reasoning_effort
    if not settings.azure_endpoint:
        mode = settings.openai_thinking.strip().lower()
        if mode in _THINKING_ON:
            kwargs["extra_body"] = {"thinking": {"type": "enabled"}}
        elif mode in _THINKING_OFF:
            kwargs["extra_body"] = {"thinking": {"type": "disabled"}}
    return kwargs


def stream_chat(
    messages: list[dict], max_tokens: int = 4096
) -> Iterator[str]:
    """流式逐 token yield delta 文本。首字快以满足 TTFP/TTFI。

    每日全景时间轴 JSON 较长（多天 × 多 stop × 坐标/地址/推荐语），
    默认上调到 4096，调用方可按天数进一步覆盖，避免 JSON 被截断。
    """
    client = build_client()
    stream = client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,  # type: ignore[arg-type]
        max_tokens=max_tokens,
        stream=True,
        **_reasoning_kwargs(),
    )
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        # 只取正文；DeepSeek 思考模式的 reasoning_content（思维链）在此主动丢弃，
        # 避免污染下游 JSON 解析。
        if delta and delta.content:
            yield delta.content
