# itravel

**itravel** — 行程优先、弱 AI 聊天的 Web 端智能旅行规划 Agent。
界面默认暖纸浅色、支持浅 / 深一键切换（Space Grotesk 展示标题 + 单一 ember 强调色），用「分步决策 → 卡片 / 地图 / 日程」帮你把吃住行定下来，聊天只作简短辅助。

产品规格见 [`docs/prd.md`](docs/prd.md)，技术方案见 [`docs/dev_doc.md`](docs/dev_doc.md)。

## 预览

![itravel 首页](docs/screenshots/home.png)

## 核心体验

访客无需登录即可完整规划（登录仅在主动点击右上角用户按钮或「保存计划」时触发）。入口两张上浮悬浮卡，对应两条流程：

### A. 大交通 / 往返日期优先

```
入口 →（选出发 / 目的 / 返回城市 + 天数，离线中国省份地图按省高亮）
  → 工作台：左「选票栏（70%）」· 右「行程概览卡」
      · 去程 / 返程可分别选 飞机 或 高铁（mock 班次带真实日期）
      · 右侧概览卡实时汇总：城市、所选交通、几天几晚、往返在途时长、费用合计（带动效）
  → 确认大交通 → 进入对话规划每日行程
```

### B. 游玩景点 / 顺路路线优先

```
入口 → 选「已有想去的城市」 or「只有感兴趣的景点类型」
  ├─ 已有城市 → 搜索选定城市 ─┐
  └─ 只有类型 → 和 AI 聊兴趣，推荐候选城市并选定 ─┘
                                ↓
  选景点堆叠板：按 景点 / 美食 浏览候选（LLM 生成，可搜索 / 换一批 / 缓存秒开），逐个堆入
                                ↓
  选旅行节奏（紧凑 / 适中 / 轻松）→ LLM 估算合理天数并把已选景点排进日程
                                ↓
                            进入工作台
```

### 工作台（两条流程的共同终点）

```
左「行程表 + 对话区」 · 右「标准地图」（可折叠）
  → 和 itravel 聊天 → 后端流式 SSE 规划 → 先显「AI 正在规划」→ 骨架屏 → 逐天填充
  → 每天 = 三餐(吃) + 2~3 景点(玩，顺路排序) + 当晚酒店(住) + 段间交通耗时
  → 拖拽卡片重排；点某天 / 某地点 → 地图聚焦那天的路线
  → 点「保存计划」：访客先登录 / 注册，再绑定账号持久化；「我的行程」可载入继续编辑
```

- **单一数据源（SSOT）**：行程树是唯一权威状态，日程表 / 地图 / 对话均为其只读投影。
- **对话区**：保留多轮气泡历史，AI 一句话回复 + 可折叠的「计划改动」卡（展示本轮新增了哪些地点）。
- **地图按天聚焦**：非当前天的点用聚合（MarkerCluster）弱化，只绘制当前选中天的路线；点行程表里的某天 / 某地点即切换聚焦。可折叠，右下角浮标重新展开。
- **真实路由**：每个步骤有独立 URL（`/`、`/plan/cities`、`/plan/route`、`/plan/route/attractions`、`/workspace` 等），浏览器前进 / 后退可用；硬刷新缺前置状态会安全回退。
- **三态与动效**：进场骨架屏 + 逐天流式填充；卡片层叠落入、对话气泡进场、概览卡数字滚动与扫光、保存 Toast；进入工作台中心「浮尘吹散」一次性提示，对话框 AI 执行中匀速呼吸。

## 技术栈

- **前端**：React + Vite + TypeScript；react-router-dom 路由；Zustand 状态（流程 planFlow / 行程 itinerary（SSOT + zundo）/ 对话 chat / 选景点草稿 draftPois / 机票 flight / UI）；@dnd-kit 拖拽；Tailwind v4 + shadcn 风格组件；lucide-react 图标；高德 JS API 2.0（标准图层 + 点聚合）。
- **后端**：Python + FastAPI + SQLModel + SQLite，`uv` 管理环境。自研确定性 Workflow（意图 → POI → 顺路 → 交通 → 渲染）+ 完整系统提示词约束 LLM 产出「每日全景时间轴」；支持「给定天数规划」与「给定已选景点 + 节奏，LLM 估天数再排程」两种模式。
- **LLM**：OpenAI 兼容 / Azure OpenAI，凭证经 `.env` 注入；缺失 / 失败时自动回退高德桩候选（`degraded`，不白屏）。长 JSON 设按天数估算的 token 预算，并对被截断的输出做兜底修复。
- **鉴权**：argon2id 密码哈希 + JWT（HS256），登录失败限频；启动自动建表（无默认账号，访客可规划）。

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
测试：在 `backend` 目录执行 `uv run pytest`（CRUD / Workflow 契约（含截断修复、POI 列表估天数）/ 候选 / 选城 / 交通 / 鉴权 / schema 校验，**46 项**）。

### 前端（终端 2）

```bash
cd frontend
npm install
cp .env.example .env                 # VITE_API_BASE 默认 http://localhost:8000
npm run dev                          # http://localhost:5173（被占用自动切 5174）
```

测试：`npm test`（Vitest，10 项）；类型检查 + 构建：`npm run build`。

## 账号与登录

- 无登录页、无默认账号：访客可完整体验规划流程（草案存于前端，不落库）。
- 登录 / 注册（邮箱 + 密码，注册二次确认、密码 ≥8）仅在点击右上角用户按钮或「保存计划」时弹出。
- 行程「保存」绑定登录账号持久化（要求 ≥1 天且 ≥3 个地点）；`backend/.env` 的 `JWT_SECRET` 本地随便填长随机串，上线务必替换。

## LLM 配置

在 `backend/.env` 填入凭证后，规划 / 候选 / 选城走真实 LLM；留空则自动回退内置桩（`degraded`）。

- Azure OpenAI（如 ByteDance modelhub）：填 `AZURE_ENDPOINT` + `OPENAI_API_KEY` + `OPENAI_API_VERSION` + `OPENAI_MODEL`。
- 标准 OpenAI 兼容：留空 `AZURE_ENDPOINT`，填 `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL`。
- 切换供应商只改 env（`app/llm.py` 按 `AZURE_ENDPOINT` 是否为空自动选客户端）。
- 约束 LLM 产出「每日全景时间轴」的完整系统提示词在 [`backend/app/workflow.py`](backend/app/workflow.py) 的 `_PLAN_SYSTEM_PROMPT`。

## 地图配置

在 `frontend/.env` 填入高德 JS API 2.0 凭证后，工作台右侧地图实时打点连线；留空则地图区降级为坐标列表（不白屏）。

- 控制台 https://console.amap.com/dev/key/app → 应用管理 → 创建应用 → 添加 Key → 服务平台选「Web端(JS API)」。
- 拿到 `VITE_AMAP_JS_KEY` 与安全密钥 `VITE_AMAP_SECURITY_CODE`（jscode，JS API 2.0 必填）。
- 交通时长 / 路径由前端高德插件（`AMap.Driving/Walking/Transfer`）按需计算；点聚合用 `AMap.MarkerCluster`；后端 `AMAP_KEY` 为 `POST /transit/recompute` 兜底用。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| POST / GET | `/auth/register` `/auth/login` `/auth/me` | 邮箱 + 密码鉴权（签发 JWT） |
| POST（SSE） | `/plan/stream` | 流式规划「每日全景时间轴」：`status/intent/(estimate)/skeleton/reply/day/itinerary/done`。`plan_source=day_count` 按天数规划；`plan_source=poi_list` 据已选景点 + `pace` 让 LLM 估天数再排程。支持 `history` + `current_plan` 多轮修改 |
| POST | `/plan/candidates` | 景点 / 美食候选（LLM 生成，按城市 + 类目，失败回退高德桩） |
| POST | `/plan/suggest-city` | 据兴趣 / 景点类型推荐候选城市（route_first path B） |
| POST | `/transit/recompute` | 相邻交通段时长 / 距离兜底计算 |
| GET / POST / DELETE | `/itineraries*` | 行程读写（需 Bearer，绑定用户） |

## 自检

- `curl http://localhost:8000/health` → `{"status":"ok"}`。
- 注册并登录：`curl -X POST .../auth/register -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"itravel123"}'` 得 token。
- 流式规划：`curl -N -X POST .../plan/stream -H 'Content-Type: application/json' -d '{"destination":"成都","origin":"北京","day_count":2,"free_text":"想轻松逛吃"}'` → 一串 `event: status/intent/skeleton/reply/day/itinerary/done`。
- 景点候选：`curl -X POST .../plan/candidates -H 'Content-Type: application/json' -d '{"city":"杭州","category":"play","limit":4}'` → `{pois, degraded}`。

## 目录结构

```
itravel/
├── backend/         # FastAPI BFF（uv 管理）
│   └── app/
│       ├── config / db / main(lifespan 建表) / init_db / seed
│       ├── models/ schemas.py / crud.py
│       ├── llm.py / validators.py / amap_stub.py / workflow.py(含 _PLAN_SYSTEM_PROMPT)
│       ├── auth.py / transit.py
│       ├── services/   # plan(流式 + 候选 + 选城) / poi / transit / itinerary 业务层
│       └── routers/    # auth / itineraries / plan / poi / transit
├── frontend/        # Vite + React + TS + Tailwind + react-router
│   └── src/
│       ├── App.tsx                   # 路由表 + 根布局（AuthDialog / Toast 持久挂载）
│       ├── assets/chinaGeo.ts        # 离线中国省界（按省高亮）
│       ├── lib/        # amap / cityCatalog / flights / planController(流式编排) / utils
│       ├── store/      # planFlow / itinerary(SSOT) / chat / draftPois / flight / auth / ui
│       ├── components/RequireFlow.tsx · Toast.tsx
│       ├── components/flow/        # IntroGate / OriginDestinationStep / ChinaMap /
│       │                           #   RouteStartChoice / CityChatStep /
│       │                           #   AttractionBoardStep / PaceChoiceStep / FloatingChoice
│       ├── components/workspace/   # WorkspaceLayout / ScheduleColumn / FlightBoard /
│       │                           #   TripSummaryCard / ChatDock / MessageList /
│       │                           #   TripMap / TopNav / MyTripsDialog
│       ├── components/auth/        # AuthDialog（登录 / 注册弹窗）
│       └── components/ui/          # shadcn 风格基础组件
└── docs/            # prd.md, dev_doc.md
```

## 环境变量

密钥不入库、不进 Git，仅通过各自的 `.env` 注入（参考 `backend/.env.example`、`frontend/.env.example`）。

- 后端：`DATABASE_URL`、`AZURE_ENDPOINT` / `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_API_VERSION` / `OPENAI_MODEL`、`AMAP_KEY`、`JWT_SECRET`、`CORS_ORIGINS`
- 前端：`VITE_API_BASE`、`VITE_AMAP_JS_KEY`、`VITE_AMAP_SECURITY_CODE`

## 说明

- 机票 / 高铁班次、机场与车站坐标等为 mock（带按出发日推算的真实日期），仅用于流程演示；POI 候选优先真实 LLM、失败回退内置桩。
- 暂不涉及线上部署（Nginx / HTTPS / Redis / 镜像），仅保证本地跑通。
