from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# SQLite 需要 check_same_thread=False 以配合 FastAPI 多线程；其它数据库忽略此参数。
connect_args = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)

engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)


def init_db() -> None:
    # 导入 models 以注册到 SQLModel.metadata
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
