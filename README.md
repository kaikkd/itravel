# 智能旅游规划伴侣（Smart Travel Planner Agent）

重「行程规划与可视化」、弱「AI 纯文本聊天」的 Web 端智能旅游规划 Agent。
界面对齐 Claude.com 设计语言（米白底 + 赤陶主色 + 衬线标题），用「分步决策 → 卡片/地图/日程」帮用户把吃住行定下来，聊天只作简短辅助。

产品规格见 [`docs/prd.md`](docs/prd.md)，技术方案见 [`docs/dev_doc.md`](docs/dev_doc.md)。

## 核心体验

进入网站即用默认管理员静默登录（无登录页），随后是一条多步流程：

```
入口（两个上升悬浮框）
  ├─ 大交通 / 往返日期优先 ── 先选机票（曲线飞行动画）→ 确认 → 转为行程表
  └─ 游玩景点 / 顺路路线优先 ─┐
                              ↓
选择城市（出发 / 目的 / 返回，多选）+ 离线中国省份地图按省高亮
  ↓
工作台：左「行程表 + 底部对话框」 · 右「标准地图」（可折叠）
  ↓
和 itravel 聊天 → 后端 LLM 结构化候选 → 点左侧空位添加 → 地图打点
  ↓
同日相邻地点：切换 驾车 / 公共交通 / 步行 → 点时钟按需调高德算时长并在路线上方标注
```

- 工作台地图可折叠：行程表与地图间的按钮收起地图、左侧铺满居中；右下角浮标可重新展开（展开时刷新一次渲染，折叠期间不再随行程表更新）。
- 三态与动效：进入工作台中心「浮尘吹散」一次性提示；对话框边缘提示结束闪一次、AI 执行中匀速呼吸。

## 技术栈

- 前端：React + Vite + TypeScript；Zustand（流程 / 行程 / UI 状态）；Tailwind v4 + shadcn 风格组件；lucide-react 图标；高德 JS API 2.0（标准图层）。
- 后端：Python + FastAPI + SQLModel + SQLite，`uv` 管理环境。
- LLM：OpenAI 兼容 / Azure OpenAI，凭证经 `.env` 注入；缺失时自动回退内置候选（不白屏）。
- 鉴权：argon2id 密码哈希 + JWT（HS256），登录失败限频；启动自动建表并创建默认管理员。

## 环境准备

| 依赖 | 版本建议 |
| --- | --- |
| Node.js | ≥ 20 LTS |
| Python | ≥ 3.11（由 `uv` 自动安装） |
| uv | 最新版（`brew install uv`） |

## 启动

### 后端（终端 1）

```bash
cd backend
uv sync                              # 创建 .venv 并安装依赖
cp .env.example .env                 # 按需填写 LLM / 高德 凭证（可留空）
uv run uvicorn app.main:app --reload --port 8000
```

启动钩子会自动建表并创建默认管理员（无需手动 `init_db`）。`uv run python -m app.seed` 可选，塞一条「成都三天」示例行程。
测试：在 `backend` 目录执行 `uv run pytest`（CRUD / LLM 契约 / 候选 / 交通 / 鉴权 / schema 校验，33 项）。

### 前端（终端 2）

```bash
cd frontend
npm install
cp .env.example .env                 # VITE_API_BASE 默认 http://localhost:8000
npm run dev                          # http://localhost:5173（被占用自动切 5174）
```

测试：`npm test`；类型检查 + 构建：`npm run build`。

## 默认账号（无登录页）

- 进入即静默登录默认管理员：`admin@123.com` / `12345678`（后端启动时自动创建）。
- 行程「保存」绑定该账号；`backend/.env` 的 `JWT_SECRET` 本地随便填长随机串，上线务必替换。

## LLM 配置

在 `backend/.env` 填入凭证后，聊天走真实 LLM 结构化候选；留空则自动回退内置候选（`degraded`）。

- Azure OpenAI（如 ByteDance modelhub）：填 `AZURE_ENDPOINT` + `OPENAI_API_KEY` + `OPENAI_API_VERSION` + `OPENAI_MODEL`。
- 标准 OpenAI 兼容：留空 `AZURE_ENDPOINT`，填 `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL`。
- 切换供应商只改 env（`app/llm.py` 按 `AZURE_ENDPOINT` 是否为空自动选客户端）。
- 聊天→候选的 system prompt 在 [`backend/app/services/plan_service.py`](backend/app/services/plan_service.py) 的 `_suggest_messages()`。

## 地图配置

在 `frontend/.env` 填入高德 JS API 2.0 凭证后，右侧地图实时打点连线；留空则地图区降级为坐标列表（不白屏）。

- 控制台 https://console.amap.com/dev/key/app → 应用管理 → 创建应用 → 添加 Key → 服务平台选「Web端(JS API)」。
- 拿到 `VITE_AMAP_JS_KEY` 与安全密钥 `VITE_AMAP_SECURITY_CODE`（jscode，JS API 2.0 必填）。
- 交通时长/路径由前端高德插件（`AMap.Driving/Walking/Transfer`）按需计算；后端 `AMAP_KEY` 为 `POST /transit/recompute` 兜底用。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| POST | `/auth/register` `/auth/login`，GET `/auth/me` | 鉴权（默认管理员自动登录） |
| GET（SSE） | `/plan/stream?q=` | 流式规划草案（旧链路，保留） |
| POST | `/plan/suggestions` | 结合出发/目的/返回 + 偏好的结构化候选（含一句话 `reply`） |
| GET | `/poi/candidates` | 卡片类目候选 / LLM 重生成 |
| POST | `/transit/recompute` | 相邻交通段时长/距离兜底计算 |
| GET/POST/DELETE | `/itineraries*` | 行程读写（需 Bearer，绑定用户） |

## 自检

- `curl http://localhost:8000/health` → `{"status":"ok"}`。
- 默认管理员：`curl -X POST .../auth/login -d '{"email":"admin@123.com","password":"12345678"}'` 得 token。
- 结构化候选：`curl -X POST .../plan/suggestions -H 'Content-Type: application/json' -d '{"destination":"成都","origin":"北京","day_count":2,"free_text":"想轻松逛吃"}'` → `{reply, days[], degraded}`。

## 目录结构

```
itravel/
├── backend/         # FastAPI BFF（uv 管理）
│   └── app/
│       ├── config / db / main(lifespan 建表+管理员) / init_db / seed
│       ├── models/ schemas.py / crud.py
│       ├── llm.py / validators.py / amap_stub.py / workflow.py
│       ├── auth.py / transit.py
│       ├── services/   # plan / poi / transit / itinerary 业务层
│       └── routers/    # auth / itineraries / plan / poi / transit
├── frontend/        # Vite + React + TS + Tailwind
│   └── src/
│       ├── assets/chinaGeo.ts        # 离线中国省界（按省高亮）
│       ├── lib/        # amap / cityCatalog / flights / utils
│       ├── store/      # planFlow / trip / auth / ui
│       ├── components/flow/        # IntroGate / OriginDestinationStep / ChinaMap
│       ├── components/workspace/   # WorkspaceLayout / ScheduleColumn / FlightBoard / ChatDock / TripMap / TopNav
│       └── components/ui/          # shadcn 风格基础组件
└── docs/            # prd.md, dev_doc.md
```

## 环境变量

密钥不入库、不进 Git，仅通过各自的 `.env` 注入（参考 `backend/.env.example`、`frontend/.env.example`）。

- 后端：`DATABASE_URL`、`AZURE_ENDPOINT` / `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_API_VERSION` / `OPENAI_MODEL`、`AMAP_KEY`、`JWT_SECRET`、`CORS_ORIGINS`
- 前端：`VITE_API_BASE`、`VITE_AMAP_JS_KEY`、`VITE_AMAP_SECURITY_CODE`

## 说明

- 机票、机场坐标、社媒来源等为 mock，仅用于流程演示；POI 候选优先真实 LLM、失败回退内置。
- 暂不涉及线上部署（Nginx / HTTPS / Redis / 镜像），仅保证本地跑通。
