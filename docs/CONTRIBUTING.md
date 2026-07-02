# Contributing to itravel

欢迎参与 itravel。这个项目当前处在本地 MVP 阶段，目标是把「旅行意图输入 -> LLM 结构化规划 -> 行程表/地图联动 -> 登录保存」的核心闭环稳定跑通，再逐步补真实数据、评估、部署和 Agent 能力。

## 本地环境

建议版本：

| 依赖 | 版本 |
| --- | --- |
| Node.js | 20 LTS 或更新 |
| npm | 随 Node 安装 |
| Python | 3.11 或更新 |
| uv | 最新稳定版 |

macOS 可用 Homebrew 安装 `uv`：

```bash
brew install uv
```

## 后端启动

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

`backend/.env` 可以先保留空 LLM / 高德凭证。缺少外部凭证时，规划和候选接口会走降级逻辑，仍可用于本地验证主链路。
`AMAP_KEY` 是可选增强；不配置时不会强制调用高德 Web 服务，也不需要任何付费服务。

受限沙箱或 CI 环境如果不能写用户级缓存，可把 `uv` 缓存放到项目目录：

```bash
UV_CACHE_DIR=.uv-cache uv sync
UV_CACHE_DIR=.uv-cache uv run pytest
```

## 前端启动

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

默认前端地址为 `http://localhost:5173`，后端地址来自 `frontend/.env` 的 `VITE_API_BASE`，默认指向 `http://localhost:8000`。

受限沙箱或 CI 环境如果不能写用户级 npm cache，可把 npm 缓存放到项目目录：

```bash
npm install --cache .npm-cache
```

## 验证命令

提交前至少运行：

```bash
cd backend
uv run pytest

cd ../frontend
npm test -- --run
npm run build
```

健康检查：

```bash
curl http://localhost:8000/health
```

如果当前环境不能绑定本地端口，可以用 FastAPI `TestClient` 做进程内冒烟：

```bash
cd backend
uv run python -c 'from fastapi.testclient import TestClient; from app.main import app; r = TestClient(app).get("/health"); print(r.status_code, r.json())'
```

## 常见问题

### `uv: command not found`

安装 `uv` 后重新打开终端，或确认 `/opt/homebrew/bin` 在 `PATH` 中：

```bash
brew install uv
uv --version
```

### `sqlite3.OperationalError: unable to open database file`

本地默认数据库是 `backend/data/app.db`。应用启动时会自动创建父目录；如果你改了 `DATABASE_URL`，请确认 SQLite 文件所在目录可写。

### `Operation not permitted` with `--reload`

`uvicorn --reload` 会启用文件监听。部分受限沙箱不允许文件监听或端口绑定。普通本地终端可以继续使用 `--reload`；受限环境可去掉 `--reload`，或用上面的 `TestClient` 健康检查替代端口冒烟。

### `ENOTFOUND registry.npmjs.org` or PyPI download failures

这是网络/DNS 问题，不是项目代码问题。确认网络可访问 npm registry 和 PyPI 后重试安装命令。

## 贡献建议

- 保持改动小而清晰。一个 PR 只解决一个主题。
- 后端行为变更优先补 pytest；前端状态逻辑优先补 Vitest。
- 外部服务相关能力必须保留降级路径，不能因为缺 LLM 或地图 Key 导致主流程白屏。
- 密钥只放本地 `.env`，不要提交真实 API key。
