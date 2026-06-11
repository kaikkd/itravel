import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app import auth
from app.config import settings
from app.db import engine, init_db
from app.routers import auth as auth_router
from app.routers import itineraries, plan, poi, transit

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 启动即建表 + 确保默认管理员存在（无登录页方案）。
    try:
        init_db()
        with Session(engine) as session:
            auth.ensure_default_admin(session)
    except Exception:
        logger.exception("startup_bootstrap_failed")
    yield


app = FastAPI(title="智能旅游规划 Agent — BFF", version="0.1.0", lifespan=lifespan)

if settings.jwt_secret == "dev-only-change-me":
    logger.warning("jwt_secret_uses_default_value environment=local")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(itineraries.router)
app.include_router(plan.router)
app.include_router(poi.router)
app.include_router(transit.router)
app.include_router(auth_router.router)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "request method=%s path=%s status=%s elapsed_ms=%.1f",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
