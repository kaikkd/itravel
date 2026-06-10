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
    return OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
    )


def stream_chat(
    messages: list[dict], max_tokens: int = 2000
) -> Iterator[str]:
    """流式逐 token yield delta 文本。首字快以满足 TTFP/TTFI。"""
    client = build_client()
    stream = client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,  # type: ignore[arg-type]
        max_tokens=max_tokens,
        stream=True,
    )
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content
