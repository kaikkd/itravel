import json

import pytest

from app import validators, workflow


# ---- validators ----


def test_count_codepoints():
    assert validators.count_codepoints("abc") == 3
    assert validators.count_codepoints("成都耍") == 3
    assert validators.count_codepoints("a成🐼") == 3  # emoji 计 1


def test_truncate_rec():
    s = "辣" * 60
    out = validators.truncate_rec(s)
    assert validators.count_codepoints(out) == 50
    assert out.endswith("…")
    assert validators.truncate_rec("短文案") == "短文案"


def test_valid_coord():
    assert validators.valid_coord(104.05, 30.65) is True  # 成都
    assert validators.valid_coord(0.0, 0.0) is False  # 海上/越界
    assert validators.valid_coord(None, None) is False


def test_valid_category():
    assert validators.valid_category("eat") is True
    assert validators.valid_category("drink") is False


def test_validate_llm_pois_filters_dirty():
    raw = [
        {"name": "武侯祠", "category": "play", "lng": 104.04, "lat": 30.64},
        {"name": "坏坐标", "category": "play", "lng": 999, "lat": 999},  # 越界丢弃
        {"name": "无类目", "category": "xx", "lng": 104, "lat": 30},  # 类目非法丢弃
        {"category": "eat", "lng": 104, "lat": 30},  # 缺 name 丢弃
        {"name": "无坐标茶馆", "category": "eat"},  # 缺坐标保留(降级)
        {"name": "长文案", "category": "play", "lng": 104, "lat": 30,
         "rec_reason": "辣" * 80},  # 截断
    ]
    pois = validators.validate_llm_pois(raw)
    names = [p.name for p in pois]
    assert "武侯祠" in names
    assert "坏坐标" not in names
    assert "无类目" not in names
    assert "无坐标茶馆" in names
    tea = next(p for p in pois if p.name == "无坐标茶馆")
    assert tea.lng is None and tea.lat is None
    long_one = next(p for p in pois if p.name == "长文案")
    assert validators.count_codepoints(long_one.rec_reason) == 50


# ---- parse_intent ----


def test_parse_intent():
    i = workflow.parse_intent("成都耍三天，爱吃辣")
    assert i.city == "成都"
    assert i.day_count == 3
    assert "辣" in i.preferences

    i2 = workflow.parse_intent("重庆玩5天")
    assert i2.city == "重庆"
    assert i2.day_count == 5


# ---- recommend_pois (mock llm) ----


def _mock_stream(content: str):
    def _gen(messages, max_tokens=2000):
        yield content
    return _gen


def test_recommend_pois_valid(monkeypatch):
    payload = {"pois": [
        {"name": "武侯祠", "category": "play", "lng": 104.04, "lat": 30.64,
         "rec_reason": "三国地标"},
        {"name": "锦里", "category": "eat", "lng": 104.05, "lat": 30.64},
        {"name": "宽窄巷子", "category": "play", "lng": 104.06, "lat": 30.66},
    ]}
    monkeypatch.setattr(
        workflow.llm, "stream_chat", _mock_stream(json.dumps(payload))
    )
    i = workflow.parse_intent("成都三天")
    pois, degraded = workflow.recommend_pois(i)
    assert degraded is False
    assert len(pois) == 3


def test_recommend_pois_json_in_fence(monkeypatch):
    payload = {"pois": [
        {"name": "A", "category": "play", "lng": 104.0, "lat": 30.6},
        {"name": "B", "category": "eat", "lng": 104.1, "lat": 30.6},
        {"name": "C", "category": "play", "lng": 104.2, "lat": 30.6},
    ]}
    fenced = "```json\n" + json.dumps(payload) + "\n```"
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(fenced))
    pois, degraded = workflow.recommend_pois(workflow.parse_intent("成都三天"))
    assert degraded is False
    assert len(pois) == 3


def test_recommend_pois_non_json_degrades(monkeypatch):
    monkeypatch.setattr(
        workflow.llm, "stream_chat", _mock_stream("抱歉我无法帮你规划")
    )
    pois, degraded = workflow.recommend_pois(workflow.parse_intent("成都三天"))
    assert degraded is True  # 走高德桩兜底
    assert len(pois) >= 3


# ---- route + assemble ----


def test_route_split_and_assemble(monkeypatch):
    payload = {"pois": [
        {"name": f"P{n}", "category": "play", "lng": 104.0 + n / 100, "lat": 30.6}
        for n in range(6)
    ]}
    monkeypatch.setattr(
        workflow.llm, "stream_chat", _mock_stream(json.dumps(payload))
    )
    i = workflow.parse_intent("成都三天")
    pois, _ = workflow.recommend_pois(i)
    buckets = workflow.route_and_split(pois, i)
    draft = workflow.assemble_draft(i, buckets)
    assert len(draft.days) == 3
    total_stops = sum(len(d.stops) for d in draft.days)
    assert total_stops == 6  # 全部 POI 分到天里
    for day in draft.days:
        orders = [s.order_index for s in day.stops]
        assert orders == sorted(orders)  # order 连续递增
