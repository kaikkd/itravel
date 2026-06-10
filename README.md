# 智能旅游规划伴侣（Smart Travel Planner Agent）

重「行程规划与可视化」、弱「AI 纯文本聊天」的 Web 端智能旅游规划 Agent。
产品规格见 [`docs/prd.md`](docs/prd.md)，技术方案见 [`docs/dev_doc.md`](docs/dev_doc.md)。

> 当前进度：**M6 本地跑通完成**（M0 脚手架 → M1 数据骨架 → M2 LLM 草案链路 → M3 三视图与交互 → M4 增量重算与竞态 → M5 鉴权与保存 → M6 测试收尾）。达成 dev_doc §9.5「本地跑通」完成定义。

## 技术栈

- 前端：React + Vite + TypeScript（状态管理 Zustand + Immer；撤销 zundo；拖拽 dnd-kit）
- 后端：Python + FastAPI + SQLModel + SQLite，`uv` 管理环境
- LLM：OpenAI 兼容 / Azure OpenAI（SSE 流式），凭证经 `.env` 注入
- 地图：高德 JS API 2.0（地图打点/驾车路线）；交通重算走高德 Web 服务 API（缺 key 时 haversine 估算）
- 鉴权：argon2id 密码哈希 + JWT（HS256），登录失败限频

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
cp .env.example .env                 # 按需填写 LLM / 高德 凭证（本期可留空）
uv run python -m app.init_db         # 建表（生成 data/app.db）
uv run python -m app.seed            # 塞一条「成都三天」示例行程（可选）
uv run uvicorn app.main:app --reload --port 8000
```

测试：`uv run pytest`（CRUD / LLM 契约 / 候选 / 交通重算 / 鉴权用例，29 项）。

### 前端（终端 2）

```bash
cd frontend
npm install
cp .env.example .env                 # VITE_API_BASE 默认 http://localhost:8000
npm run dev                          # http://localhost:5173
```

测试：`npm test`（Store 勾选/删除/拖拽/撤销用例）；类型检查：`npx tsc -b`。

## 鉴权与保存（M5）

- 首次使用先在页面顶部「注册」（邮箱 + 密码 ≥8 + 二次确认，前端即时校验），注册即自动登录。
- 规划可不登录直接体验；「保存行程」需登录，保存后行程与账号绑定，刷新/重登仍在。
- 密码用 argon2id 哈希入库（禁明文）；JWT 存浏览器 `localStorage`；登录失败 5 次/分钟触发限频。
- `backend/.env` 的 `JWT_SECRET` 本地随便填长随机串；上线务必替换。

## 交通重算（M4）

- 拖拽改序/增删 Stop → 前端防抖 300ms 后只对受影响的相邻段调 `POST /transit/recompute`，进程内 `TTLCache` 缓存（键 `from_to_mode`，TTL 1h）。
- 后端有服务端高德 `AMAP_KEY`（Web 服务 API，与前端 JS Key 是两类 Key）→ 真实驾车耗时/距离；否则 haversine 估算兜底（`degraded`）。
- 竞态：请求带单调 seq，过期响应丢弃，最终态以 SSOT 为准；撤销 `Ctrl+Z` / 重做 `Ctrl+Shift+Z`。

## LLM 配置（M2）

在 `backend/.env` 填入凭证后，规划走真实 LLM；留空则自动降级为高德桩热门推荐（不白屏）。

- Azure OpenAI（如 ByteDance modelhub）：填 `AZURE_ENDPOINT` + `OPENAI_API_KEY` + `OPENAI_API_VERSION` + `OPENAI_MODEL`。
- 标准 OpenAI 兼容：留空 `AZURE_ENDPOINT`，填 `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL`。
- 切换供应商只改 env，无需改代码（`app/llm.py` 按 `AZURE_ENDPOINT` 是否为空自动选客户端）。

## 地图配置（M3）

在 `frontend/.env` 填入高德 JS API 2.0 凭证后，右侧地图实时打点连线；留空则地图区降级为坐标列表（不白屏）。

- 控制台 https://console.amap.com/dev/key/app → 应用管理 → 创建应用 → 添加 Key → 服务平台选「Web端(JS API)」。
- 同时拿到 `VITE_AMAP_JS_KEY` 与安全密钥 `VITE_AMAP_SECURITY_CODE`（jscode，JS API 2.0 必填，否则地图不出图）。

## 自检

- `curl http://localhost:8000/health` 返回 `{"status":"ok"}`（HTTP 200）。
- 鉴权：`curl -X POST .../auth/register -d '{"email":"a@b.com","password":"password123"}'` 得 token；`/itineraries` 不带 token → 401，带 `Authorization: Bearer <token>` → 本人列表。
- 规划流（注意中文需 URL 编码，不落库、合成负 id 树）：
  `curl -sN --get http://localhost:8000/plan/stream --data-urlencode 'q=成都耍三天'`
  → 依次收到 `status → intent → skeleton → itinerary（≥3 POI）→ done`；LLM 不可用时多一个 `degraded`。
- 候选卡片流：`curl --get .../poi/candidates --data-urlencode 'city=成都' --data-urlencode 'category=eat'` 即时返回桩候选；带 `regenerate=true` 调 LLM 重生成（含 `exclude` 去重）。
- 交通重算：`curl -X POST .../transit/recompute -d '{"segments":[{"from_lng":104.04,"from_lat":30.64,"to_lng":104.06,"to_lat":30.66,"mode":"driving"}]}'` 返回 `distance_meters/duration_seconds/degraded`。

### P0 GWT 验收清单（dev_doc §8.2）

1. **路径B生成**：输入「成都耍三天」→ ≤5s 骨架、≤30s ≥3 POI 草案。
2. **卡片勾选/剔除**：加入→入日程表+地图打点；剔除→该类目 LLM 重生成。
3. **拖拽增量重算**：拖动改序 → 仅相邻段耗时/距离更新、地图轨迹同步、无全量请求。
4. **空行程状态**：无 POI → 空态引导；地图无 key/无坐标 → 降级坐标列表。
5. **接口超时降级**：LLM 失败 → 桩兜底 `degraded`；交通无 key → haversine 估算。
6. **保存行程**：登录后保存置 saved，刷新/重登仍在。
7. **登录鉴权**：正确密码签发凭证、行程绑定账号；两次密码不一致前端拦截；错误密码连续 5 次限频。

> 契约校验（§6.3）当前覆盖 ①JSON schema ③推荐语 ≤50 码点 ④坐标范围；②「反查 amap_id 真实存在」因高德 POI 仍用桩，按既有口径跳过，待真接高德补齐。

## 目录结构

```
itravel/
├── backend/         # FastAPI BFF（uv 管理）
│   └── app/         # config / db / main / init_db / seed
│       ├── models/  # SQLModel 行程 ER（Itinerary/Day/Stop/POI/Transit/Source）
│       ├── schemas.py / crud.py
│       ├── llm.py / validators.py / amap_stub.py / workflow.py  # M2 LLM 链路
│       ├── transit.py / auth.py                                  # M4 重算 / M5 鉴权
│       └── routers/ # itineraries / plan / poi / transit / auth 路由
├── frontend/        # Vite + React + TS
│   └── src/         # App / api/client / store(SSOT+auth) / hooks / components
└── docs/            # prd.md, dev_doc.md
```

## 环境变量

密钥不入库、不进 Git，仅通过各自的 `.env` 注入（参考 `backend/.env.example`、`frontend/.env.example`）。

- 后端：`DATABASE_URL`、`AZURE_ENDPOINT` / `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_API_VERSION` / `OPENAI_MODEL`、`AMAP_KEY`（Web 服务 API，供交通重算）、`JWT_SECRET`、`CORS_ORIGINS`
- 前端：`VITE_API_BASE`、`VITE_AMAP_JS_KEY`、`VITE_AMAP_SECURITY_CODE`
