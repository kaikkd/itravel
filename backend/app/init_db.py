from pathlib import Path

from app.config import settings
from app.db import init_db


def _ensure_sqlite_dir() -> None:
    url = settings.database_url
    prefix = "sqlite:///"
    if url.startswith(prefix):
        db_path = Path(url[len(prefix):])
        db_path.parent.mkdir(parents=True, exist_ok=True)


def main() -> None:
    _ensure_sqlite_dir()
    init_db()
    print(f"建表成功 — DATABASE_URL={settings.database_url}")


if __name__ == "__main__":
    main()
