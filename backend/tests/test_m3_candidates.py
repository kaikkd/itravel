import json

from fastapi.testclient import TestClient

from app.main import app
from app.routers import poi
from app.schemas import POICreate
from app.services import amap_service
from app.services import plan_service

client = TestClient(app)


def _mock_stream(content: str):
    def _gen(messages, max_tokens=2000):
        yield content
    return _gen


def test_candidates_initial_uses_poi_service_no_llm(monkeypatch):
    # 初始填充（regenerate=false）走 POI 数据服务，绝不调 LLM
    def _boom(*a, **k):
        raise AssertionError("初始填充不应调用 LLM")

    monkeypatch.setattr(poi.llm, "stream_chat", _boom)
    monkeypatch.setattr(
        poi.poi_service.amap_service,
        "candidates",
        lambda city, category, exclude, limit=4, **_kwargs: amap_service.CandidateResult(
            pois=[
                POICreate(
                    name="西湖风景名胜区",
                    category="play",
                    lng=120.143222,
                    lat=30.236064,
                )
            ],
            degraded=False,
        ),
    )
    r = client.get("/poi/candidates", params={"city": "成都", "category": "play"})
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is False
    assert [p["name"] for p in body["pois"]] == ["西湖风景名胜区"]
    assert all("name" in p for p in body["pois"])


def test_candidates_regenerate_llm_excludes(monkeypatch):
    payload = {"pois": [
        {"name": "新景点A", "category": "play", "lng": 104.05, "lat": 30.65,
         "rec_reason": "小众宝藏"},
        {"name": "新景点B", "category": "play", "lng": 104.06, "lat": 30.66},
    ]}
    monkeypatch.setattr(poi.llm, "stream_chat", _mock_stream(json.dumps(payload)))
    r = client.get("/poi/candidates", params={
        "city": "成都", "category": "play",
        "exclude": "武侯祠,宽窄巷子", "regenerate": "true",
    })
    body = r.json()
    assert body["degraded"] is False
    names = [p["name"] for p in body["pois"]]
    assert "新景点A" in names
    assert "武侯祠" not in names and "宽窄巷子" not in names


def test_candidates_regenerate_filters_wrong_category(monkeypatch):
    # LLM 串了别的类目 → 被过滤；剩余仍有合法目标类目项
    payload = {"pois": [
        {"name": "对类目", "category": "eat", "lng": 104.08, "lat": 30.66},
        {"name": "错类目", "category": "play", "lng": 104.09, "lat": 30.66},
    ]}
    monkeypatch.setattr(poi.llm, "stream_chat", _mock_stream(json.dumps(payload)))
    r = client.get("/poi/candidates", params={
        "city": "成都", "category": "eat", "regenerate": "true",
    })
    body = r.json()
    names = [p["name"] for p in body["pois"]]
    assert "对类目" in names
    assert "错类目" not in names


def test_candidates_regenerate_non_json_degrades(monkeypatch):
    monkeypatch.setattr(poi.llm, "stream_chat", _mock_stream("抱歉无法规划"))
    r = client.get("/poi/candidates", params={
        "city": "成都", "category": "play", "regenerate": "true",
    })
    body = r.json()
    assert body["degraded"] is True  # 走桩兜底
    assert len(body["pois"]) >= 1


def test_plan_candidates_llm_failure_uses_amap_service(monkeypatch):
    monkeypatch.setattr(plan_service.llm, "stream_chat", _mock_stream("抱歉无法推荐"))
    monkeypatch.setattr(
        plan_service.amap_service,
        "candidates",
        lambda city, category, keyword="", limit=8, **_kwargs: amap_service.CandidateResult(
            pois=[
                POICreate(
                    name="灵隐寺",
                    category="play",
                    lng=120.1012,
                    lat=30.2400,
                    address="杭州市西湖区",
                )
            ],
            degraded=False,
        ),
    )

    r = client.post(
        "/plan/candidates",
        json={"city": "杭州", "category": "play", "limit": 4},
    )

    body = r.json()
    assert body["degraded"] is False
    assert [p["name"] for p in body["pois"]] == ["灵隐寺"]


def test_candidates_bad_category():
    r = client.get("/poi/candidates", params={"city": "成都", "category": "drink"})
    assert r.status_code == 200
    assert r.json()["pois"] == []
