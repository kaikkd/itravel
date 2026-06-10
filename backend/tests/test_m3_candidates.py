import json

from fastapi.testclient import TestClient

from app.main import app
from app.routers import poi

client = TestClient(app)


def _mock_stream(content: str):
    def _gen(messages, max_tokens=2000):
        yield content
    return _gen


def test_candidates_initial_uses_stub_no_llm(monkeypatch):
    # 初始填充（regenerate=false）即时走桩，绝不调 LLM
    def _boom(*a, **k):
        raise AssertionError("初始填充不应调用 LLM")

    monkeypatch.setattr(poi.llm, "stream_chat", _boom)
    r = client.get("/poi/candidates", params={"city": "成都", "category": "play"})
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is False
    assert len(body["pois"]) >= 3
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


def test_candidates_bad_category():
    r = client.get("/poi/candidates", params={"city": "成都", "category": "drink"})
    assert r.status_code == 200
    assert r.json()["pois"] == []
