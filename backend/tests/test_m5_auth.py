import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

import app.models  # noqa: F401 — 注册表
from app import auth
from app.db import get_session
from app.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def _override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override
    auth._fail_log.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _reg(client, email="a@b.com", pw="password123"):
    return client.post("/auth/register", json={"email": email, "password": pw})


def test_register_hashes_password(client):
    r = _reg(client)
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["email"] == "a@b.com"


def test_register_duplicate_email(client):
    _reg(client)
    r = _reg(client)
    assert r.status_code == 409


def test_register_weak_password(client):
    r = client.post("/auth/register", json={"email": "x@y.com", "password": "123"})
    assert r.status_code == 422


def test_login_wrong_password(client):
    _reg(client)
    r = client.post("/auth/login", json={"email": "a@b.com", "password": "wrongpass1"})
    assert r.status_code == 401


def test_login_rate_limited_after_5(client):
    _reg(client)
    for _ in range(5):
        client.post("/auth/login", json={"email": "a@b.com", "password": "bad"})
    r = client.post("/auth/login", json={"email": "a@b.com", "password": "bad"})
    assert r.status_code == 429


def test_me_requires_token(client):
    assert client.get("/auth/me").status_code == 401
    token = _reg(client).json()["access_token"]
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "a@b.com"


def test_itinerary_ownership_isolation(client):
    ta = _reg(client, "a@b.com").json()["access_token"]
    tb = _reg(client, "c@d.com").json()["access_token"]
    ha = {"Authorization": f"Bearer {ta}"}
    hb = {"Authorization": f"Bearer {tb}"}

    payload = {
        "title": "成都游",
        "city": "成都",
        "days": [
            {
                "day_index": 1,
                "stops": [
                    {
                        "order_index": 1,
                        "poi": {"name": "武侯祠", "category": "play",
                                "lng": 104.04, "lat": 30.64},
                    }
                ],
                "transits": [],
            }
        ],
    }
    created = client.post("/itineraries", json=payload, headers=ha)
    assert created.status_code == 200
    iid = created.json()["id"]

    # A 能看到自己的
    assert client.get("/itineraries", headers=ha).json()
    assert client.get(f"/itineraries/{iid}", headers=ha).status_code == 200
    # B 看不到 A 的
    assert client.get("/itineraries", headers=hb).json() == []
    assert client.get(f"/itineraries/{iid}", headers=hb).status_code == 404


def test_itinerary_requires_auth(client):
    assert client.get("/itineraries").status_code == 401
