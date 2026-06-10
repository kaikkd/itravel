# 后端（BFF）

FastAPI + SQLModel + SQLite，用 `uv` 管理环境。详见根目录 `README.md`。

```bash
uv sync
cp .env.example .env          # 按需填写 LLM / 高德 凭证
uv run python -m app.init_db  # 建表
uv run uvicorn app.main:app --reload --port 8000
```
