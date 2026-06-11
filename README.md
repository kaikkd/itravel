# 智能旅游规划伴侣（Smart Travel Planner Agent）

重「行程规划与可视化」、弱「AI 纯文本聊天」的 Web 端智能旅游规划 Agent。
界面对齐 Claude.com 设计语言（米白底 + 赤陶主色 + 衬线标题），用「分步决策 → 卡片/地图/日程」帮用户把吃住行定下来，聊天只作简短辅助。

产品规格见 [`docs/prd.md`](docs/prd.md)，技术方案见 [`docs/dev_doc.md`](docs/dev_doc.md)。

## 核心体验

访客无需登录即可完整规划（登录仅在主动点击右上角用户按钮或「保存计划」时触发）：

```
入口（两个上升悬浮框）
  ├─ 大交通 / 往返日期优先 ── 先选机票（曲线飞行动画）→ 确认 → 转为行程表
  └─ 游玩景点 / 顺路路线优先 ─┐
                              ↓
选择城市（出发 / 目的 / 返回，多选）+ 离线中国省份地图按省高亮
  ↓
工作台：左「行程表 + 对话区」 · 右「标准地图」（可折叠）
  ↓
和 itravel 聊天 → 后端流式 SSE 规划 → 骨架屏占位 → 逐天填充「每日全景时间轴」
  ↓
每天 = 三餐(吃) + 2~3 景点(玩，顺路排序) + 当晚酒店(住) + 段间交通耗时
  ↓
拖拽卡片重排（⌘/Ctrl+Z 撤销）；切换 驾车/公共交通/步行 → 地图打点连线并标注时长
  ↓
点「保存计划」：访客先登录/注册，再绑定账号持久化；「我的行程」可载入继续编辑
```

- 单一数据源（SSOT）：行程树是唯一权威状态，日程表 / 地图 / 对话均为其只读投影。
- 对话区：保留多轮气泡历史，AI 一句话回复 + 可折叠的「计划改动」卡（展示本轮新增了哪些地点）。
- 工作台地图可折叠：行程表与地图间的按钮收起地图、左侧铺满居中；右下角浮标可重新展开。
- 三态与动效：骨架屏 + 逐天流式填充；卡片层叠落入、对话气泡进场、时间轴连线生长、保存 Toast；进入工作台中心「浮尘吹散」一次性提示，对话框 AI 执行中匀速呼吸。

## 技术栈

- 前端：React + Vite + TypeScript；Zustand（流程 / 行程 SSOT+zundo 撤销 / 对话 / 机票 / UI）；@dnd-kit 拖拽；Tailwind v4 + shadcn 风格组件；lucide-react 图标；高德 JS API 2.0（标准图层）。
- 后端：Python + FastAPI + SQLModel + SQLite，`uv` 管理环境。自研确定性 Workflow（意图→POI→顺路→交通→渲染）+ 完整系统提示词约束 LLM 产出每日时间轴。
- LLM：OpenAI 兼容 / Azure OpenAI，凭证经 `.env` 注入；缺失/失败时自动回退高德桩候选（`degraded`，不白屏）。
- 鉴权：argon2id 密码哈希 + JWT（HS256），登录失败限频；启动自动建表（无默认账号，访客可规划）。

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

启动钩子会自动建表（无需手动 `init_db`；无默认账号，访客可直接规划）。`uv run python -m app.seed` 可选，塞一条「成都三天」示例行程。
测试：在 `backend` 目录执行 `uv run pytest`（CRUD / Workflow 契约 / 候选 / 交通 / 鉴权 / schema 校验，39 项）。

### 前端（终端 2）

```bash
cd frontend
npm install
cp .env.example .env                 # VITE_API_BASE 默认 http://localhost:8000
npm run dev                          # http://localhost:5173（被占用自动切 5174）
```

测试：`npm test`；类型检查 + 构建：`npm run build`。

## 账号与登录

- 无登录页、无默认账号：访客可完整体验规划流程（草案存于前端，不落库）。
- 登录/注册（邮箱 + 密码，注册二次确认、密码 ≥8）仅在点击右上角用户按钮或「保存计划」时弹出。
- 行程「保存」绑定登录账号持久化（要求 ≥1 天且 ≥3 个地点）；`backend/.env` 的 `JWT_SECRET` 本地随便填长随机串，上线务必替换。

## LLM 配置

在 `backend/.env` 填入凭证后，聊天走真实 LLM 结构化候选；留空则自动回退内置候选（`degraded`）。

- Azure OpenAI（如 ByteDance modelhub）：填 `AZURE_ENDPOINT` + `OPENAI_API_KEY` + `OPENAI_API_VERSION` + `OPENAI_MODEL`。
- 标准 OpenAI 兼容：留空 `AZURE_ENDPOINT`，填 `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL`。
- 切换供应商只改 env（`app/llm.py` 按 `AZURE_ENDPOINT` 是否为空自动选客户端）。
- 约束 LLM 产出「每日全景时间轴」的完整系统提示词在 [`backend/app/workflow.py`](backend/app/workflow.py) 的 `_PLAN_SYSTEM_PROMPT`。

## 地图配置

在 `frontend/.env` 填入高德 JS API 2.0 凭证后，右侧地图实时打点连线；留空则地图区降级为坐标列表（不白屏）。

- 控制台 https://console.amap.com/dev/key/app → 应用管理 → 创建应用 → 添加 Key → 服务平台选「Web端(JS API)」。
- 拿到 `VITE_AMAP_JS_KEY` 与安全密钥 `VITE_AMAP_SECURITY_CODE`（jscode，JS API 2.0 必填）。
- 交通时长/路径由前端高德插件（`AMap.Driving/Walking/Transfer`）按需计算；后端 `AMAP_KEY` 为 `POST /transit/recompute` 兜底用。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| POST | `/auth/register` `/auth/login`，GET `/auth/me` | 邮箱+密码鉴权（签发 JWT） |
| POST（SSE） | `/plan/stream` | 流式规划「每日全景时间轴」：`status/intent/skeleton/reply/day/itinerary/done`，支持 `history` + `current_plan` 多轮修改 |
| POST | `/transit/recompute` | 相邻交通段时长/距离兜底计算 |
| GET/POST/DELETE | `/itineraries*` | 行程读写（需 Bearer，绑定用户） |

## 自检

- `curl http://localhost:8000/health` → `{"status":"ok"}`。
- 注册并登录：`curl -X POST .../auth/register -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"itravel123"}'` 得 token。
- 流式规划：`curl -N -X POST .../plan/stream -H 'Content-Type: application/json' -d '{"destination":"成都","origin":"北京","day_count":2,"free_text":"想轻松逛吃"}'` → 一串 `event: status/intent/skeleton/reply/day/itinerary/done`。

## 目录结构

```
itravel/
├── backend/         # FastAPI BFF（uv 管理）
│   └── app/
│       ├── config / db / main(lifespan 建表) / init_db / seed
│       ├── models/ schemas.py / crud.py
│       ├── llm.py / validators.py / amap_stub.py / workflow.py(含 _PLAN_SYSTEM_PROMPT)
│       ├── auth.py / transit.py
│       ├── services/   # plan(流式) / poi / transit / itinerary 业务层
│       └── routers/    # auth / itineraries / plan / poi / transit
├── frontend/        # Vite + React + TS + Tailwind
│   └── src/
│       ├── assets/chinaGeo.ts        # 离线中国省界（按省高亮）
│       ├── lib/        # amap / cityCatalog / flights / planController(流式编排) / utils
│       ├── store/      # planFlow / itinerary(SSOT) / chat / flight / auth / ui
│       ├── components/flow/        # IntroGate / OriginDestinationStep / ChinaMap
│       ├── components/workspace/   # WorkspaceLayout / ScheduleColumn / FlightBoard / ChatDock / MessageList / TripMap / TopNav / MyTripsDialog
│       ├── components/auth/        # AuthDialog（登录/注册弹窗）
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
