from app.services import amap_service


class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


def test_candidates_without_key_uses_stub_without_network(monkeypatch):
    amap_service.clear_cache()
    monkeypatch.setattr(amap_service.settings, "amap_key", "")

    def _boom(*_args, **_kwargs):
        raise AssertionError("AMap should not be called without AMAP_KEY")

    monkeypatch.setattr(amap_service.httpx, "get", _boom)

    result = amap_service.candidates(city="成都", category="play", limit=3)

    assert result.degraded is True
    assert len(result.pois) >= 3
    assert all(p.category in {"eat", "stay", "play"} for p in result.pois)


def test_candidates_with_key_parses_response_and_caches(monkeypatch):
    amap_service.clear_cache()
    monkeypatch.setattr(amap_service.settings, "amap_key", "test-key")
    calls = []

    def _fake_get(url, params, timeout):
        calls.append((url, params, timeout))
        return _Resp(
            {
                "status": "1",
                "pois": [
                    {
                        "id": "B001",
                        "name": "西湖风景名胜区",
                        "address": "杭州市西湖区",
                        "location": "120.143222,30.236064",
                    },
                    {
                        "id": "B002",
                        "name": "坏坐标",
                        "address": "杭州市",
                        "location": "999,999",
                    },
                ],
            }
        )

    monkeypatch.setattr(amap_service.httpx, "get", _fake_get)

    first = amap_service.candidates(city="杭州", category="play", limit=5)
    second = amap_service.candidates(city="杭州", category="play", limit=5)

    assert first.degraded is False
    assert [p.name for p in first.pois] == ["西湖风景名胜区"]
    assert first.pois[0].amap_id == "B001"
    assert first.pois[0].lng == 120.143222
    assert second.pois[0].name == "西湖风景名胜区"
    assert len(calls) == 1
    assert calls[0][1]["citylimit"] == "true"


def test_candidates_filters_excluded_and_degrades_when_empty(monkeypatch):
    amap_service.clear_cache()
    monkeypatch.setattr(amap_service.settings, "amap_key", "test-key")

    def _fake_get(*_args, **_kwargs):
        return _Resp(
            {
                "status": "1",
                "pois": [
                    {
                        "id": "B001",
                        "name": "武侯祠",
                        "address": "武侯区",
                        "location": "104.0476,30.6464",
                    }
                ],
            }
        )

    monkeypatch.setattr(amap_service.httpx, "get", _fake_get)

    result = amap_service.candidates(
        city="成都", category="play", exclude={"武侯祠"}, limit=4
    )

    assert result.degraded is True
    assert "武侯祠" not in [p.name for p in result.pois]
    assert len(result.pois) >= 1
