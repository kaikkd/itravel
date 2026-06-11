import json
import math
import re
from dataclasses import dataclass, field

from app import amap_stub, llm, validators
from app.schemas import (
    DayCreate,
    ItineraryCreate,
    POICreate,
    StopCreate,
    TransitCreate,
)

# 自研轻量确定性 Workflow（PRD §7.3）：意图→POI→顺路→交通→渲染。
# 每个节点纯函数、可独立测试、可降级。LLM 只产出「每日全景时间轴」结构化 JSON，
# 顺路排序 / 交通估算 / 契约校验 / 降级回填均由确定性 Python 完成。


# ---- 意图 ----


@dataclass
class Intent:
    city: str
    day_count: int
    origin: str = ""
    return_city: str = ""
    preferences: list[str] = field(default_factory=list)
    raw: str = ""


_CN_NUM = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7}
_KNOWN_CITIES = ["成都", "重庆", "北京", "上海", "杭州", "西安", "广州", "深圳", "昆明"]
_PREF_KEYWORDS = ("辣", "美食", "亲子", "文艺", "购物", "自然", "历史", "轻松", "小众")


def parse_intent(query: str) -> Intent:
    """启发式抽取 city + 天数 + 偏好；用于无结构化输入或补挖 free_text 关键词。"""
    q = (query or "").strip()
    city = next((c for c in _KNOWN_CITIES if c in q), "")
    if not city:
        m = re.match(r"^([一-龥]{2,4})(?:耍|玩|游|旅游|行)", q)
        city = m.group(1) if m else "成都"

    day_count = 3
    m = re.search(r"(\d+)\s*天", q)
    if m:
        day_count = int(m.group(1))
    else:
        m = re.search(r"([一二两三四五六七])\s*天", q)
        if m:
            day_count = _CN_NUM.get(m.group(1), 3)
    day_count = max(1, min(day_count, 10))

    prefs = [kw for kw in _PREF_KEYWORDS if kw in q]
    return Intent(city=city, day_count=day_count, preferences=prefs, raw=q)


def _extract_prefs(text: str) -> list[str]:
    return [kw for kw in _PREF_KEYWORDS if kw in (text or "")]


def build_intent(req) -> Intent:
    """结构化字段为主，从 free_text 正则补挖偏好关键词。req 为 PlanStreamIn。"""
    prefs = list(req.preferences or [])
    for kw in _extract_prefs(req.free_text):
        if kw not in prefs:
            prefs.append(kw)
    return Intent(
        city=req.destination,
        day_count=max(1, min(int(req.day_count or 3), 10)),
        origin=req.origin or "",
        return_city=req.return_city or req.origin or "",
        preferences=prefs,
        raw=req.free_text or "",
    )


# ---- 每日时间轴中间结构 ----


@dataclass
class PlanStop:
    slot: str  # breakfast|lunch|dinner|attraction|hotel
    poi: POICreate
    arrive_time: str | None = None
    stay_minutes: int | None = None


@dataclass
class DayPlan:
    day_index: int
    stops: list[PlanStop] = field(default_factory=list)


# ---- 系统提示词（完整 SP）----

_PLAN_SYSTEM_PROMPT = """你是「itravel」的中国境内旅行行程规划专家，为用户编排「每日全景时间轴」。

【你的目标】
为目的地城市规划一份贴合用户需求、当天顺路、可直接执行的逐日行程。每一天都是一条完整的时间轴：从早餐到晚上入住，告诉用户「几点、在哪、做什么、怎么走、住哪里」。

【每天必须包含（缺一不可）】
1. 三餐：早餐(breakfast)、午餐(lunch)、晚餐(dinner) 各一个，category 均为 "eat"，应是当地有代表性、口碑好的餐厅或美食地点，且尽量靠近当天游玩区域。
2. 游玩点：2 到 3 个景点 / 体验地，category 为 "play"，按当天地理位置顺路串联（不要让用户走回头路）。
3. 住宿：1 个酒店 / 民宿(hotel)，category 为 "stay"，作为当天最后一站，位置应方便次日出行，并兼顾用户预算与偏好。

【字段与格式要求】
- 只输出一个 JSON 对象，禁止任何解释、前后缀文字或 markdown 代码块（不要 ```）。
- 顶层格式：{"reply": string, "days": [{"day_index": int, "stops": [stop, ...]}, ...]}。
- 每个 stop：{"slot": "breakfast|lunch|dinner|attraction|hotel", "category": "eat|play|stay", "name": string, "lng": number, "lat": number, "address": string, "arrive_time": "HH:MM", "stay_minutes": int, "rec_reason": string}。
- stops 顺序即时间顺序：早餐 → 上午游玩 → 午餐 → 下午游玩 → 晚餐 → 入住，arrive_time 单调递增、贴合常识（早餐约 08:00，午餐约 12:00，晚餐约 18:30，入住约 21:00）。
- lng/lat 必须是高德地图 GCJ-02 火星坐标系的真实经纬度，精度到小数点后 4 位以上；绝不可编造或留空。坐标必须落在中国境内（经度 73~135.5，纬度 3~53.7）。
- rec_reason 为推荐理由，必须 ≤50 个字符，具体说明为什么推荐它（如特色菜、看点、适合人群），不要套话。
- reply 是给用户的一句话中文回复，≤40 个字符、不得换行，概述本次安排的亮点与如何贴合用户需求，例如「按你想轻松逛吃的节奏，安排了宽窄巷子＋本地火锅，晚上住春熙路」。

【顺路与节奏原则】
- 同一天内地点应集中在相近区域，减少通勤；不要把跨城或相距很远的点塞进同一天。
- 节奏适中：每天 2~3 个游玩点即可，避免赶场；若用户要求「轻松」，可减到 2 个并拉长停留时间。
- 多日行程中，按区域/主题合理分配，避免不同天重复同一地点。

【先思考再输出】
在生成 JSON 前，先在心里完成以下推理（不要输出推理过程）：①确认目的地与天数；②每天选定一个地理片区；③在该片区内选 2~3 个游玩点并排出顺路顺序；④就近为每餐选餐厅；⑤选一个方便的住宿。完成后只输出最终 JSON。

【多轮修改】
若对话历史中已存在一份行程，且用户提出调整（如「第二天轻松点」「把川菜换成清淡的」「加一天」），你必须在原行程基础上做最小必要改动：只改动用户提到的部分，保留其余天与地点不变，并在 reply 里说明改了什么（如「第二天减到两个景点，午餐换成清淡的」）。除非用户要求，否则不要推翻整份行程重排。

【降级与诚实】
- 只规划用户指定的目的地城市，不要擅自加别的城市。
- 如果某个槽位实在没有合适且坐标可靠的地点，宁可少给也不要编造坐标；但三餐与住宿应尽力补齐。"""


def _compact_plan(current_plan) -> str:
    """把当前行程压缩为精简 JSON，供多轮修改注入（控 token）。"""
    days = []
    for d in current_plan.days:
        stops = [
            {"name": s.poi.name, "category": s.poi.category, "lng": s.poi.lng, "lat": s.poi.lat}
            for s in d.stops
        ]
        days.append({"day_index": d.day_index, "stops": stops})
    return json.dumps({"days": days}, ensure_ascii=False)


def _plan_messages(req, intent: Intent) -> list[dict]:
    pref = "、".join(intent.preferences) if intent.preferences else "无特别偏好"
    messages: list[dict] = [{"role": "system", "content": _PLAN_SYSTEM_PROMPT}]
    for turn in req.history or []:
        role = turn.role if turn.role in ("user", "assistant") else "user"
        messages.append({"role": role, "content": turn.content})
    if req.current_plan is not None and req.current_plan.days:
        messages.append(
            {
                "role": "assistant",
                "content": "当前行程如下（请在此基础上按用户要求修改）："
                + _compact_plan(req.current_plan),
            }
        )
    user = (
        f"出发地：{intent.origin or '未指定'}；目的地：{intent.city}；"
        f"返回地：{intent.return_city or '未指定'}；共 {intent.day_count} 天；"
        f"偏好：{pref}；用户最新诉求：{req.free_text or '无'}。"
        f"请为「{intent.city}」规划 {intent.day_count} 天的每日全景时间轴，"
        f"每天包含三餐+2~3个游玩点+1个住宿，严格按上面的 JSON 契约输出。"
    )
    messages.append({"role": "user", "content": user})
    return messages


def _repair_truncated_json(t: str) -> str:
    """对被 max_tokens 截断的 JSON 尽力补全。

    思路：截到最后一个完整闭合的对象（最后一个 `}`），丢弃半截元素，
    再按括号栈补齐缺失的闭合符。仅用于解析失败后的兜底。
    """
    start = t.find("{")
    if start == -1:
        return t
    s = t[start:]
    last_brace = s.rfind("}")
    if last_brace == -1:
        return s
    s = s[: last_brace + 1]
    # 在这个前缀上重算括号栈（跳过字符串内字符）
    stack: list[str] = []
    in_str = False
    escape = False
    for ch in s:
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]" and stack:
            stack.pop()
    s = s.rstrip().rstrip(",")
    s += "".join(reversed(stack))
    return s


def _extract_json(text: str) -> dict:
    """去掉可能的 markdown fence，截取首个 {...} 解析；截断时尽力修复。"""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    start = t.find("{")
    end = t.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = t[start : end + 1]
    else:
        candidate = t
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        repaired = _repair_truncated_json(t)
        return json.loads(repaired)


# ---- 规划（单次 LLM 调用 + 1 次修复重试）----

_DEFAULT_TIMES = {
    "breakfast": "08:00",
    "attraction": "10:00",
    "lunch": "12:00",
    "dinner": "18:30",
    "hotel": "21:00",
}
_DEFAULT_STAY = {
    "breakfast": 45,
    "lunch": 60,
    "dinner": 75,
    "attraction": 120,
    "hotel": 600,
}


def _parse_days(raw_days: list) -> list[DayPlan]:
    days: list[DayPlan] = []
    for raw in raw_days:
        if not isinstance(raw, dict):
            continue
        index = int(raw.get("day_index") or len(days) + 1)
        stops = [
            PlanStop(slot=slot, poi=poi, arrive_time=at, stay_minutes=sm)
            for slot, poi, at, sm in validators.validate_llm_day_stops(
                raw.get("stops", []) or []
            )
        ]
        if stops:
            days.append(DayPlan(day_index=index, stops=stops))
    return days


def _has_slot(day: DayPlan, category: str) -> bool:
    return any(s.poi.category == category for s in day.stops)


def _backfill_day(day: DayPlan, city: str) -> None:
    """某天缺三餐/住宿时，从高德桩就近回补，保证时间轴完整（非整体降级）。"""
    used = {s.poi.name for s in day.stops}
    eat_count = sum(1 for s in day.stops if s.poi.category == "eat")
    for _ in range(max(0, 3 - eat_count)):
        for poi in amap_stub.candidates(city, "eat", exclude=used):
            day.stops.append(PlanStop(slot="lunch", poi=poi))
            used.add(poi.name)
            break
    if not _has_slot(day, "stay"):
        for poi in amap_stub.candidates(city, "stay", exclude=used):
            day.stops.append(PlanStop(slot="hotel", poi=poi))
            used.add(poi.name)
            break


def _budget_tokens(day_count: int) -> int:
    """按天数估算输出 token 预算：每天约 7 个 stop × 含坐标/地址/推荐语。"""
    return min(8000, 1200 + day_count * 1400)


def recommend_plan(req) -> tuple[list[DayPlan], bool]:
    """返回 (per-day 时间轴, degraded)。LLM 失败/校验空 → 高德桩兜底。req 为 PlanStreamIn。"""
    intent = build_intent(req)
    messages = _plan_messages(req, intent)
    max_tokens = _budget_tokens(intent.day_count)
    for attempt in range(2):
        try:
            buf = "".join(llm.stream_chat(messages, max_tokens=max_tokens))
            data = _extract_json(buf)
            raw_days = data.get("days", []) if isinstance(data, dict) else []
            reply = data.get("reply") if isinstance(data, dict) else None
            days = _parse_days(raw_days)
            if days:
                for day in days:
                    _backfill_day(day, intent.city)
                _attach_reply(days, reply)
                return days, False
            if attempt == 0:
                messages = messages + [
                    {"role": "user", "content": "格式不符或为空，请重新只输出合规 JSON。"}
                ]
                continue
        except Exception:
            if attempt == 0:
                continue
            break
    return _fallback_plan(intent), True


# reply 通过附在首日的属性传出（避免改 dataclass 签名影响测试）。
def _attach_reply(days: list[DayPlan], reply) -> None:
    text = reply.strip().replace("\n", " ") if isinstance(reply, str) else ""
    if days:
        setattr(days[0], "_reply", text)


# ---- route_first：从用户已选 POI + 紧凑度 估算天数并排日程（#11） ----

_PACE_LABEL = {"compact": "紧凑（每天景点多、少留白）", "balanced": "适中（松弛有度）", "relaxed": "轻松（每天少而精、慢慢逛）"}
_PACE_PER_DAY = {"compact": 4, "balanced": 3, "relaxed": 2}


def _from_pois_messages(req, intent: Intent) -> list[dict]:
    pace = _PACE_LABEL.get(req.pace or "balanced", _PACE_LABEL["balanced"])
    selected = [
        {"name": p.name, "category": p.category, "lng": p.lng, "lat": p.lat,
         "address": p.address}
        for p in (req.selected_pois or [])
    ]
    sys = _PLAN_SYSTEM_PROMPT + (
        "\n\n【本次特殊要求：基于用户已选景点排程】\n"
        "用户已经选定了下面这批必游景点，请你：①按「" + pace + "」的节奏，"
        "估算一个合理的游玩天数 day_count；②把用户已选景点分配到每一天（不要替换或删除用户已选的景点，"
        "可顺路重排）；③为每天补齐三餐与一个住宿；④顶层 JSON 额外输出 day_count 字段，"
        '即 {"day_count": int, "reply": str, "days": [...]}。其余格式与上面的契约一致。'
    )
    user = (
        f"目的地：{intent.city}；节奏：{pace}。用户已选景点（JSON）：\n"
        + json.dumps(selected, ensure_ascii=False)
        + "\n请估算天数并把这些景点排进每日全景时间轴，补齐三餐与住宿，严格按 JSON 契约输出。"
    )
    return [{"role": "system", "content": sys}, {"role": "user", "content": user}]


def _fallback_plan_from_pois(req, intent: Intent) -> tuple[list[DayPlan], int]:
    """LLM 不可用时：按 pace 每天景点数确定性切分用户已选 POI，桩补三餐住宿。"""
    from app.schemas import POICreate

    play = [
        POICreate(name=p.name, category="play", lng=p.lng, lat=p.lat, address=p.address)
        for p in (req.selected_pois or [])
    ]
    per = _PACE_PER_DAY.get(req.pace or "balanced", 3)
    day_count = max(1, math.ceil(len(play) / per)) if play else intent.day_count
    days: list[DayPlan] = []
    for di in range(day_count):
        chunk = play[di * per : (di + 1) * per]
        stops = [PlanStop(slot="attraction", poi=p) for p in chunk]
        day = DayPlan(day_index=di + 1, stops=stops)
        _backfill_day(day, intent.city)
        days.append(day)
    return days, day_count


def recommend_plan_from_pois(req) -> tuple[list[DayPlan], int, bool]:
    """返回 (per-day 时间轴, 估算天数, degraded)。给定已选 POI + pace 让 LLM 估天数并排程。"""
    intent = build_intent(req)
    n = max(1, len(req.selected_pois or []))
    messages = _from_pois_messages(req, intent)
    for attempt in range(2):
        try:
            buf = "".join(llm.stream_chat(messages, max_tokens=_budget_tokens(n)))
            data = _extract_json(buf)
            raw_days = data.get("days", []) if isinstance(data, dict) else []
            reply = data.get("reply") if isinstance(data, dict) else None
            est = data.get("day_count") if isinstance(data, dict) else None
            days = _parse_days(raw_days)
            if days:
                for day in days:
                    _backfill_day(day, intent.city)
                _attach_reply(days, reply)
                est_days = int(est) if isinstance(est, (int, float)) and est else len(days)
                return days, est_days, False
            if attempt == 0:
                messages = messages + [
                    {"role": "user", "content": "格式不符或为空，请重新只输出合规 JSON。"}
                ]
                continue
        except Exception:
            if attempt == 0:
                continue
            break
    days, est_days = _fallback_plan_from_pois(req, intent)
    return days, est_days, True


def _fallback_plan(intent: Intent) -> list[DayPlan]:
    """LLM 不可用时用高德桩拼出每日时间轴，保证离线可演示。"""
    days: list[DayPlan] = []
    for di in range(1, intent.day_count + 1):
        used: set[str] = set()
        stops: list[PlanStop] = []
        for slot in ("breakfast", "attraction", "lunch", "attraction", "dinner", "hotel"):
            category = validators.SLOT_TO_CATEGORY[slot]
            picked = amap_stub.candidates(intent.city, category, exclude=used)
            if picked:
                poi = picked[0]
                used.add(poi.name)
                stops.append(PlanStop(slot=slot, poi=poi))
        days.append(DayPlan(day_index=di, stops=stops))
    return days


# ---- 顺路排序（餐/酒店钉死骨架，景点最近邻）----


def _haversine_m(a: POICreate, b: POICreate) -> int | None:
    if None in (a.lng, a.lat, b.lng, b.lat):
        return None
    r = 6371000.0
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dphi = math.radians(b.lat - a.lat)
    dlmb = math.radians(b.lng - a.lng)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(h)))


def _nearest_neighbor_order(pois: list[POICreate]) -> list[POICreate]:
    """对有坐标的 POI 做最近邻排序「不走回头路」；无坐标的追加在尾部。"""
    with_coords = [p for p in pois if p.lng is not None and p.lat is not None]
    without = [p for p in pois if p.lng is None or p.lat is None]
    if len(with_coords) <= 2:
        return with_coords + without
    remaining = with_coords[:]
    ordered = [remaining.pop(0)]
    while remaining:
        last = ordered[-1]
        nxt = min(remaining, key=lambda p: _haversine_m(last, p) or 1 << 30)
        ordered.append(nxt)
        remaining.remove(nxt)
    return ordered + without


_SLOT_RANK = {"breakfast": 0, "lunch": 2, "dinner": 4, "hotel": 5}


def order_day_stops(day: DayPlan) -> DayPlan:
    """按时间轴骨架重排：早餐→上午景点→午餐→下午景点→晚餐→酒店。

    餐与酒店按 slot 钉死，景点用最近邻顺路排序后均分到上午/下午两段。
    """
    meals = {s.slot: s for s in day.stops if s.slot in ("breakfast", "lunch", "dinner")}
    hotel = next((s for s in day.stops if s.slot == "hotel"), None)
    attractions = [s for s in day.stops if s.slot == "attraction"]

    if attractions:
        ordered_pois = _nearest_neighbor_order([s.poi for s in attractions])
        by_poi = {id(s.poi): s for s in attractions}
        attractions = [by_poi[id(p)] for p in ordered_pois]
    half = math.ceil(len(attractions) / 2) if attractions else 0
    morning, afternoon = attractions[:half], attractions[half:]

    sequence: list[PlanStop] = []
    if "breakfast" in meals:
        sequence.append(meals["breakfast"])
    sequence.extend(morning)
    if "lunch" in meals:
        sequence.append(meals["lunch"])
    sequence.extend(afternoon)
    if "dinner" in meals:
        sequence.append(meals["dinner"])
    if hotel is not None:
        sequence.append(hotel)
    # 兜底：把未归类的 stop（理论上没有）追加在尾部
    classified = set(id(s) for s in sequence)
    sequence.extend(s for s in day.stops if id(s) not in classified)

    return DayPlan(day_index=day.day_index, stops=sequence)


# ---- 组装为 ItineraryCreate（含交通段）----

_WALK_SPEED = 1.3  # m/s
_DRIVE_SPEED = 8.3  # m/s ≈ 30 km/h 市区
_WALK_MAX_M = 2000  # ≤2km 视为步行


def _transit_for(prev: POICreate, cur: POICreate, from_i: int, to_i: int) -> TransitCreate:
    dist = _haversine_m(prev, cur)
    if dist is None:
        return TransitCreate(
            from_order_index=from_i, to_order_index=to_i, mode="walking"
        )
    if dist <= _WALK_MAX_M:
        return TransitCreate(
            from_order_index=from_i,
            to_order_index=to_i,
            mode="walking",
            distance_meters=dist,
            duration_seconds=int(dist / _WALK_SPEED),
        )
    return TransitCreate(
        from_order_index=from_i,
        to_order_index=to_i,
        mode="driving",
        distance_meters=dist,
        duration_seconds=int(dist / _DRIVE_SPEED),
    )


def _hhmm_to_min(t: str | None) -> int | None:
    if not t or ":" not in t:
        return None
    try:
        h, m = t.split(":")
        return int(h) * 60 + int(m)
    except ValueError:
        return None


def _min_to_hhmm(total: int) -> str:
    total = max(0, min(total, 23 * 60 + 59))
    return f"{total // 60:02d}:{total % 60:02d}"


def _sequential_times(day: DayPlan) -> list[str]:
    """按最终顺序分配单调递增的到达时间：餐用 slot 锚点，其余顺延 + 30 分钟通勤。

    避免 LLM 原始 arrive_time 在重排后出现「下午景点显示在上午」的非单调问题。
    """
    times: list[str] = []
    cur = _hhmm_to_min(_DEFAULT_TIMES["breakfast"]) or 8 * 60
    for i, ps in enumerate(day.stops):
        anchor = _hhmm_to_min(_DEFAULT_TIMES.get(ps.slot))
        # 餐/酒店有合理锚点且不早于当前，则吸附到锚点
        if anchor is not None and ps.slot in ("breakfast", "lunch", "dinner", "hotel"):
            cur = max(cur, anchor)
        times.append(_min_to_hhmm(cur))
        stay = ps.stay_minutes or _DEFAULT_STAY.get(ps.slot, 90)
        cur += stay + (30 if i < len(day.stops) - 1 else 0)  # +通勤缓冲
    return times


def assemble_draft(req, days: list[DayPlan]) -> ItineraryCreate:
    """组装为 ItineraryCreate，含 Stop 排序、arrive_time/stay_minutes 与相邻 Transit。"""
    intent = build_intent(req)
    day_creates: list[DayCreate] = []
    for day in days:
        seq_times = _sequential_times(day)
        stops: list[StopCreate] = []
        transits: list[TransitCreate] = []
        for oi, ps in enumerate(day.stops, start=1):
            stops.append(
                StopCreate(
                    order_index=oi,
                    poi=ps.poi,
                    arrive_time=seq_times[oi - 1],
                    stay_minutes=ps.stay_minutes or _DEFAULT_STAY.get(ps.slot),
                )
            )
            if oi > 1:
                transits.append(
                    _transit_for(day.stops[oi - 2].poi, ps.poi, oi - 1, oi)
                )
        day_creates.append(
            DayCreate(day_index=day.day_index, stops=stops, transits=transits)
        )

    title = f"{intent.city}{intent.day_count}日游"
    return ItineraryCreate(title=title, city=intent.city, status="draft", days=day_creates)
