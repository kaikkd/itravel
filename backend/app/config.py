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

    # 高德（M0 预留）
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
