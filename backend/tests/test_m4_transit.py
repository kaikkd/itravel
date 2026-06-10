import app.transit as transit


def test_estimate_without_key(monkeypatch):
    # 无 amap_key → haversine 驾车估算，degraded=True
    monkeypatch.setattr(transit.settings, "amap_key", "")
    transit._cache.clear()
    r = transit.recompute_segment(104.0476, 30.6464, 104.0617, 30.6694)
    assert r["degraded"] is True
    assert r["distance_meters"] > 0
    assert r["duration_seconds"] > 0


def test_missing_coords_returns_empty(monkeypatch):
    monkeypatch.setattr(transit.settings, "amap_key", "")
    r = transit.recompute_segment(None, None, 104.06, 30.66)
    assert r["distance_meters"] is None
    assert r["duration_seconds"] is None


def test_cache_hit_skips_recompute(monkeypatch):
    monkeypatch.setattr(transit.settings, "amap_key", "")
    transit._cache.clear()

    calls = {"n": 0}
    real_estimate = transit._estimate

    def _counting(*a, **k):
        calls["n"] += 1
        return real_estimate(*a, **k)

    monkeypatch.setattr(transit, "_estimate", _counting)
    a = transit.recompute_segment(104.04, 30.64, 104.06, 30.66)
    b = transit.recompute_segment(104.04, 30.64, 104.06, 30.66)
    assert a == b
    assert calls["n"] == 1  # 第二次命中缓存，不重复计算


def test_recompute_endpoint(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    monkeypatch.setattr(transit.settings, "amap_key", "")
    client = TestClient(app)
    resp = client.post(
        "/transit/recompute",
        json={
            "segments": [
                {
                    "from_lng": 104.04,
                    "from_lat": 30.64,
                    "to_lng": 104.06,
                    "to_lat": 30.66,
                    "mode": "driving",
                }
            ]
        },
    )
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    assert results[0]["distance_meters"] > 0
