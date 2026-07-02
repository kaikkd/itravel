from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "sqlite:///./data/app.db"

    # LLM（OpenAI 兼容 / Azure OpenAI；缺失也能起服务，调用时才校验）
    # azure_endpoint 非空 → 走 AzureOpenAI；否则走 OpenAI(base_url=openai_base_url)
    openai_base_url: str = ""
    openai_api_key: str = ""
    openai_model: str = "gpt-5.2-2025-12-11"
    azure_endpoint: str = ""
    openai_api_version: str = "2024-02-01"
    tt_logid: str = ""  # 可选；为空时每请求自动生成 uuid4

    # 推理参数（可选）：DeepSeek / GPT-5 等推理模型才需要，普通模型留空即不发送。
    # reasoning_effort: minimal / low / medium / high。
    openai_reasoning_effort: str = ""
    # DeepSeek 思考模式（三态字符串）：
    #   enabled  → 透传 extra_body={"thinking": {"type": "enabled"}}
    #   disabled → 透传 {"type": "disabled"}（关键：deepseek-v4 等默认开思考，
    #              只省略该参数仍会先生成思维链，导致首个正文 token 延迟数秒～十几秒）
    #   留空     → 不发送，交给模型默认
    # 兼容 true/false：true→enabled，false→disabled。
    openai_thinking: str = ""

    # 高德 Web 服务 Key（可选）：未配置时 POI / 交通服务自动走本地兜底。
    amap_key: str = ""

    jwt_secret: str = "dev-only-change-me"

    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
