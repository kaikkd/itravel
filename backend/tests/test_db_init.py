from sqlmodel import create_engine

from app import db


def test_init_db_creates_sqlite_parent_directory(tmp_path, monkeypatch):
    database_path = tmp_path / "nested" / "app.db"
    test_engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )

    monkeypatch.setattr(db, "engine", test_engine)

    db.init_db()

    assert database_path.parent.is_dir()
    assert database_path.exists()
