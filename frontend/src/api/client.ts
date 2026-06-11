import type {
  Category,
  Itinerary,
  ItinerarySummary,
  POI,
  SuggestionResponse,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const TOKEN_KEY = "itravel_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const t = getToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra;
}

export interface CandidatesResult {
  pois: POI[];
  degraded: boolean;
}

// 卡片流候选 POI。regenerate=false 即时走桩（初始填充）；true 调 LLM 重生成该类目。
async function fetchCandidates(
  city: string,
  category: Category,
  exclude: string[],
  regenerate: boolean,
): Promise<CandidatesResult> {
  const params = new URLSearchParams({
    city,
    category,
    exclude: exclude.join(","),
    regenerate: String(regenerate),
  });
  const res = await fetch(`${API_BASE}/poi/candidates?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`/poi/candidates 返回 ${res.status}`);
  }
  const body = (await res.json()) as {
    pois: Partial<POI>[];
    degraded: boolean;
  };
  // 后端候选只回 name/category/lng/lat/address/rec_reason，补齐为完整 POI 形状。
  const pois: POI[] = body.pois.map((p) => ({
    id: 0,
    amap_id: null,
    name: p.name ?? "",
    category: (p.category ?? "play") as Category,
    lng: p.lng ?? null,
    lat: p.lat ?? null,
    address: p.address ?? null,
    rec_reason: p.rec_reason ?? null,
    sources: [],
  }));
  return { pois, degraded: body.degraded };
}

export function getCandidates(
  city: string,
  category: Category,
  exclude: string[] = [],
): Promise<CandidatesResult> {
  return fetchCandidates(city, category, exclude, false);
}

export function regenerateCandidates(
  city: string,
  category: Category,
  exclude: string[] = [],
): Promise<CandidatesResult> {
  return fetchCandidates(city, category, exclude, true);
}

export async function getHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) {
    throw new Error(`/health 返回 ${res.status}`);
  }
  return res.json();
}

export async function listItineraries(): Promise<ItinerarySummary[]> {
  const res = await fetch(`${API_BASE}/itineraries`, { headers: authHeaders() });
  if (res.status === 401) {
    clearToken();
    return [];
  }
  if (!res.ok) {
    throw new Error(`/itineraries 返回 ${res.status}`);
  }
  return res.json();
}

export async function getItinerary(id: number): Promise<Itinerary> {
  const res = await fetch(`${API_BASE}/itineraries/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`/itineraries/${id} 返回 ${res.status}`);
  }
  return res.json();
}

// 保存当前行程（草案树）到后端，绑定当前登录用户（M5）。返回落库后的完整树。
export async function saveItinerary(itinerary: Itinerary): Promise<Itinerary> {
  const payload = {
    title: itinerary.title,
    city: itinerary.city,
    status: "saved",
    days: itinerary.days.map((d) => ({
      day_index: d.day_index,
      stops: d.stops.map((s) => ({
        order_index: s.order_index,
        arrive_time: s.arrive_time,
        stay_minutes: s.stay_minutes,
        poi: {
          amap_id: s.poi.amap_id,
          name: s.poi.name,
          category: s.poi.category,
          lng: s.poi.lng,
          lat: s.poi.lat,
          address: s.poi.address,
          rec_reason: s.poi.rec_reason,
          sources: s.poi.sources.map((src) => ({
            url: src.url,
            summary: src.summary,
          })),
        },
      })),
      transits: buildTransitCreate(d),
    })),
  };
  const res = await fetch(`${API_BASE}/itineraries`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`保存失败：${res.status}`);
  }
  return res.json();
}

// 后端 Transit 用当天 order_index 指明相邻段；据 stop_id → order_index 映射转换
function buildTransitCreate(d: Itinerary["days"][number]) {
  const idToOrder = new Map(d.stops.map((s) => [s.id, s.order_index]));
  return d.transits
    .map((t) => ({
      from_order_index: idToOrder.get(t.from_stop_id),
      to_order_index: idToOrder.get(t.to_stop_id),
      mode: t.mode,
      duration_seconds: t.duration_seconds,
      distance_meters: t.distance_meters,
      polyline: t.polyline,
    }))
    .filter((t) => t.from_order_index != null && t.to_order_index != null);
}

// ---- 鉴权（M5） ----

export interface AuthResult {
  access_token: string;
  user_id: number;
  email: string;
}

export async function register(
  email: string,
  password: string,
): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `注册失败：${res.status}`);
  }
  return res.json();
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `登录失败：${res.status}`);
  }
  return res.json();
}

export async function getMe(): Promise<{ id: number; email: string } | null> {
  const t = getToken();
  if (!t) return null;
  const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  if (!res.ok) {
    clearToken();
    return null;
  }
  return res.json();
}

// ---- 交通重算（M4） ----

export interface SegmentIn {
  from_lng: number | null;
  from_lat: number | null;
  to_lng: number | null;
  to_lat: number | null;
  mode: string;
}
export interface SegmentResult {
  distance_meters: number | null;
  duration_seconds: number | null;
  degraded: boolean;
}

export async function recomputeTransits(
  segments: SegmentIn[],
): Promise<SegmentResult[]> {
  const res = await fetch(`${API_BASE}/transit/recompute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments }),
  });
  if (!res.ok) {
    throw new Error(`/transit/recompute 返回 ${res.status}`);
  }
  const body = (await res.json()) as { results: SegmentResult[] };
  return body.results;
}

// ---- 结构化候选（结合出发/目的/返回 + 偏好 + 自由文本） ----

export interface SuggestRequest {
  destination: string;
  origin?: string;
  return_city?: string;
  day_count?: number;
  preferences?: string[];
  free_text?: string;
}

export async function suggestItinerary(
  req: SuggestRequest,
): Promise<SuggestionResponse> {
  const res = await fetch(`${API_BASE}/plan/suggestions`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`/plan/suggestions 返回 ${res.status}`);
  }
  return res.json();
}

export interface PlanHandlers {
  onStatus?: (text: string) => void;
  onIntent?: (data: { city: string; day_count: number }) => void;
  onSkeleton?: (pois: POI[]) => void;
  onItinerary?: (itinerary: Itinerary) => void;
  onDegraded?: (reason: string) => void;
  onDone?: (itineraryId: number) => void;
  onError?: (err: Error) => void;
}

// SSE 流式规划。done/error 时关闭连接，禁用 EventSource 自动重连。
export function streamPlan(q: string, handlers: PlanHandlers): () => void {
  const url = `${API_BASE}/plan/stream?q=${encodeURIComponent(q)}`;
  const es = new EventSource(url);

  es.addEventListener("status", (e) =>
    handlers.onStatus?.(JSON.parse((e as MessageEvent).data).text),
  );
  es.addEventListener("intent", (e) =>
    handlers.onIntent?.(JSON.parse((e as MessageEvent).data)),
  );
  es.addEventListener("skeleton", (e) =>
    handlers.onSkeleton?.(JSON.parse((e as MessageEvent).data).pois),
  );
  es.addEventListener("itinerary", (e) =>
    handlers.onItinerary?.(JSON.parse((e as MessageEvent).data)),
  );
  es.addEventListener("degraded", (e) =>
    handlers.onDegraded?.(JSON.parse((e as MessageEvent).data).reason),
  );
  es.addEventListener("done", (e) => {
    handlers.onDone?.(JSON.parse((e as MessageEvent).data).itinerary_id);
    es.close();
  });
  es.onerror = () => {
    // 流正常结束（done 后服务端关闭）也会触发 onerror；用 readyState 区分
    if (es.readyState === EventSource.CLOSED) return;
    handlers.onError?.(new Error("规划流连接中断"));
    es.close();
  };

  return () => es.close();
}
