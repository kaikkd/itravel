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


# ---- slot 校验 ----


def test_normalize_slot():
    assert validators.normalize_slot("breakfast", None) == ("breakfast", "eat")
    assert validators.normalize_slot("hotel", "stay") == ("hotel", "stay")
    # slot 缺失从 category 推导
    assert validators.normalize_slot(None, "play") == ("attraction", "play")
    # 都非法
    assert validators.normalize_slot("xx", "drink") == (None, None)


def test_validate_arrive_time_and_stay():
    assert validators.validate_arrive_time("08:00") == "08:00"
    assert validators.validate_arrive_time("23:59") == "23:59"
    assert validators.validate_arrive_time("24:00") is None
    assert validators.validate_arrive_time("8點") is None
    assert validators.validate_stay_minutes(60) == 60
    assert validators.validate_stay_minutes(0) is None
    assert validators.validate_stay_minutes(9999) is None
    assert validators.validate_stay_minutes("60") is None


def test_validate_llm_day_stops_filters_dirty():
    raw = [
        {"slot": "breakfast", "name": "甜水面", "lng": 104.05, "lat": 30.65,
         "arrive_time": "08:00", "stay_minutes": 45, "rec_reason": "本地早餐"},
        {"slot": "attraction", "name": "坏坐标", "lng": 999, "lat": 999},  # 越界丢弃
        {"slot": "hotel", "name": "缺坐标酒店"},  # 时间轴场景缺坐标丢弃
        {"slot": "xx", "name": "非法槽位", "lng": 104, "lat": 30},  # slot 非法丢弃
    ]
    stops = validators.validate_llm_day_stops(raw)
    names = [poi.name for _, poi, _, _ in stops]
    assert names == ["甜水面"]
    slot, poi, at, sm = stops[0]
    assert slot == "breakfast" and poi.category == "eat"
    assert at == "08:00" and sm == 45


# ---- recommend_plan (mock llm) ----


def _mock_stream(content: str):
    def _gen(messages, max_tokens=2000):
        yield content
    return _gen


class _SelPoi:
    def __init__(self, name, lng, lat, category="play", address=None):
        self.name = name
        self.category = category
        self.lng = lng
        self.lat = lat
        self.address = address


class _Req:
    """轻量 PlanStreamIn 替身（recommend_plan 只读这些属性）。"""

    def __init__(
        self,
        destination="成都",
        day_count=3,
        free_text="",
        plan_source="day_count",
        pace=None,
        selected_pois=None,
    ):
        self.destination = destination
        self.origin = ""
        self.return_city = ""
        self.day_count = day_count
        self.preferences = []
        self.free_text = free_text
        self.history = []
        self.current_plan = None
        self.plan_source = plan_source
        self.pace = pace
        self.selected_pois = selected_pois or []


def _full_day(day_index: int) -> dict:
    return {
        "day_index": day_index,
        "stops": [
            {"slot": "breakfast", "category": "eat", "name": f"早餐{day_index}",
             "lng": 104.05, "lat": 30.65, "arrive_time": "08:00", "stay_minutes": 45,
             "rec_reason": "本地味道"},
            {"slot": "attraction", "category": "play", "name": f"景点A{day_index}",
             "lng": 104.06, "lat": 30.66, "arrive_time": "10:00", "stay_minutes": 120},
            {"slot": "attraction", "category": "play", "name": f"景点B{day_index}",
             "lng": 104.08, "lat": 30.67, "arrive_time": "14:00", "stay_minutes": 120},
            {"slot": "lunch", "category": "eat", "name": f"午餐{day_index}",
             "lng": 104.07, "lat": 30.66, "arrive_time": "12:00", "stay_minutes": 60},
            {"slot": "dinner", "category": "eat", "name": f"晚餐{day_index}",
             "lng": 104.08, "lat": 30.66, "arrive_time": "18:30", "stay_minutes": 75},
            {"slot": "hotel", "category": "stay", "name": f"酒店{day_index}",
             "lng": 104.08, "lat": 30.65, "arrive_time": "21:00", "stay_minutes": 600},
        ],
    }


def test_recommend_plan_valid(monkeypatch):
    payload = {"reply": "已安排好成都三天行程", "days": [_full_day(d) for d in (1, 2, 3)]}
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(json.dumps(payload)))
    days, degraded = workflow.recommend_plan(_Req())
    assert degraded is False
    assert len(days) == 3
    # 每天都含吃/玩/住
    cats = {s.poi.category for s in days[0].stops}
    assert {"eat", "play", "stay"} <= cats
    assert getattr(days[0], "_reply", "") == "已安排好成都三天行程"


def test_recommend_plan_json_in_fence(monkeypatch):
    payload = {"reply": "ok", "days": [_full_day(1)]}
    fenced = "```json\n" + json.dumps(payload) + "\n```"
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(fenced))
    days, degraded = workflow.recommend_plan(_Req(day_count=1))
    assert degraded is False
    assert len(days) == 1


def test_recommend_plan_non_json_degrades(monkeypatch):
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream("抱歉我无法帮你规划"))
    days, degraded = workflow.recommend_plan(_Req())
    assert degraded is True  # 走高德桩兜底
    assert len(days) == 3


def test_recommend_plan_backfills_missing_meals(monkeypatch):
    # 只给一个景点，三餐/住宿缺失 → 应回补（仍非 degraded）
    payload = {"days": [{"day_index": 1, "stops": [
        {"slot": "attraction", "category": "play", "name": "武侯祠",
         "lng": 104.04, "lat": 30.64},
    ]}]}
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(json.dumps(payload)))
    days, degraded = workflow.recommend_plan(_Req(day_count=1))
    assert degraded is False
    cats = [s.poi.category for s in days[0].stops]
    assert cats.count("eat") >= 1
    assert "stay" in cats


# ---- order + assemble ----


def test_order_day_stops_timeline_backbone(monkeypatch):
    payload = {"days": [_full_day(1)]}
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(json.dumps(payload)))
    days, _ = workflow.recommend_plan(_Req(day_count=1))
    ordered = workflow.order_day_stops(days[0])
    slots = [s.slot for s in ordered.stops]
    # 骨架：早餐在最前，酒店在最后，午餐在景点之间
    assert slots[0] == "breakfast"
    assert slots[-1] == "hotel"
    assert "lunch" in slots and "dinner" in slots


def test_assemble_draft_carries_time_and_transit(monkeypatch):
    payload = {"days": [_full_day(d) for d in (1, 2)]}
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(json.dumps(payload)))
    req = _Req(day_count=2)
    days, _ = workflow.recommend_plan(req)
    ordered = [workflow.order_day_stops(d) for d in days]
    draft = workflow.assemble_draft(req, ordered)
    assert len(draft.days) == 2
    for day in draft.days:
        orders = [s.order_index for s in day.stops]
        assert orders == list(range(1, len(day.stops) + 1))  # 连续递增
        assert all(s.arrive_time for s in day.stops)  # 时间携带
        # 相邻段都有交通
        assert len(day.transits) == len(day.stops) - 1


# ---- POST /plan/stream 端点（SSE 事件序列）----


def test_plan_stream_endpoint_event_sequence(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    payload = {"reply": "已排好成都1天行程", "days": [_full_day(1)]}
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(json.dumps(payload)))

    client = TestClient(app)
    resp = client.post(
        "/plan/stream",
        json={"destination": "成都", "day_count": 1, "free_text": "轻松逛吃"},
    )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    events = [
        line.split("event: ", 1)[1]
        for line in resp.text.splitlines()
        if line.startswith("event: ")
    ]
    assert events == [
        "status", "intent", "skeleton", "status", "reply", "day", "itinerary", "done"
    ]


# ---- 截断 JSON 修复（#3）----


def test_extract_json_repairs_truncation():
    full = {"reply": "ok", "days": [_full_day(1)]}
    s = json.dumps(full, ensure_ascii=False)
    # 在中途砍断，模拟 max_tokens 截断
    truncated = s[: int(len(s) * 0.7)]
    data = workflow._extract_json(truncated)
    assert isinstance(data, dict)
    assert data.get("days")  # 至少救回部分天
    assert len(data["days"][0]["stops"]) >= 1


def test_budget_tokens_scales_with_days():
    assert workflow._budget_tokens(1) < workflow._budget_tokens(7)
    assert workflow._budget_tokens(100) <= 8000  # 有上限


# ---- route_first：从 POI 列表估天数并排程（#11）----


def test_recommend_plan_from_pois_valid(monkeypatch):
    payload = {
        "day_count": 2,
        "reply": "按适中节奏排了两天",
        "days": [_full_day(1), _full_day(2)],
    }
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(json.dumps(payload)))
    req = _Req(
        plan_source="poi_list",
        pace="balanced",
        selected_pois=[
            _SelPoi("宽窄巷子", 104.06, 30.66),
            _SelPoi("武侯祠", 104.04, 30.64),
        ],
    )
    days, est, degraded = workflow.recommend_plan_from_pois(req)
    assert degraded is False
    assert est == 2
    assert len(days) == 2


def test_recommend_plan_from_pois_degrades(monkeypatch):
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream("抱歉无法规划"))
    req = _Req(
        plan_source="poi_list",
        pace="compact",
        selected_pois=[_SelPoi(f"景点{i}", 104.0 + i / 100, 30.6) for i in range(9)],
    )
    days, est, degraded = workflow.recommend_plan_from_pois(req)
    assert degraded is True
    # 紧凑=每天4个景点，9个景点 → 3天
    assert est == 3
    assert len(days) == 3
    # 用户已选景点都应保留
    all_names = {s.poi.name for d in days for s in d.stops}
    assert "景点0" in all_names and "景点8" in all_names


def test_plan_stream_poi_list_event_sequence(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    payload = {"day_count": 1, "reply": "排好了", "days": [_full_day(1)]}
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(json.dumps(payload)))

    client = TestClient(app)
    resp = client.post(
        "/plan/stream",
        json={
            "destination": "成都",
            "plan_source": "poi_list",
            "pace": "balanced",
            "selected_pois": [{"name": "宽窄巷子", "lng": 104.06, "lat": 30.66}],
        },
    )
    assert resp.status_code == 200
    events = [
        line.split("event: ", 1)[1]
        for line in resp.text.splitlines()
        if line.startswith("event: ")
    ]
    # poi_list 模式：estimate 在 skeleton 之前
    assert events[:4] == ["status", "intent", "status", "estimate"]
    assert "skeleton" in events and events[-1] == "done"


# ---- 新增 JSON 接口：候选 / 选城（#11）----


def test_candidates_endpoint(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    payload = {"pois": [
        {"name": "宽窄巷子", "category": "play", "lng": 104.06, "lat": 30.66, "rec_reason": "成都名片"},
        {"name": "杜甫草堂", "category": "play", "lng": 104.02, "lat": 30.66},
    ]}
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(json.dumps(payload)))
    client = TestClient(app)
    resp = client.post("/plan/candidates", json={"city": "成都", "category": "play"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["degraded"] is False
    assert len(body["pois"]) == 2


def test_suggest_city_endpoint(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    payload = {"reply": "看你爱古迹", "cities": [
        {"name": "西安", "reason": "历史古迹集中"},
        {"name": "北京", "reason": "故宫长城"},
    ]}
    monkeypatch.setattr(workflow.llm, "stream_chat", _mock_stream(json.dumps(payload)))
    client = TestClient(app)
    resp = client.post("/plan/suggest-city", json={"free_text": "我喜欢历史古迹"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["degraded"] is False
    assert any(c["name"] == "西安" for c in body["cities"])
