import type {
  Itinerary,
  ItinerarySummary,
  PlanSkeleton,
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

// ---- 已保存行程（M5） ----

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

// 保存当前行程（草案树）到后端，绑定当前登录用户。返回落库后的完整树。
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
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `保存失败：${res.status}`);
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
      mode: t.mode === "transit" ? "driving" : t.mode, // 后端仅 walking/driving
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

// ---- 流式规划（POST /plan/stream，fetch + ReadableStream SSE） ----

export interface ChatTurnPayload {
  role: "user" | "assistant";
  content: string;
}

export interface PlanStreamRequest {
  destination: string;
  origin?: string;
  return_city?: string;
  day_count?: number;
  preferences?: string[];
  free_text?: string;
  history?: ChatTurnPayload[];
  // 当前行程（无 id 的 Create 形态），用于多轮最小改动
  current_plan?: unknown;
}

export interface PlanHandlers {
  onStatus?: (text: string) => void;
  onIntent?: (data: { city: string; day_count: number; preferences: string[] }) => void;
  onSkeleton?: (skeleton: PlanSkeleton) => void;
  onReply?: (text: string) => void;
  onDay?: (day: Itinerary["days"][number]) => void;
  onItinerary?: (itinerary: Itinerary) => void;
  onDegraded?: (reason: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

// EventSource 不能带 body/Authorization，改用 fetch POST + ReadableStream 解析 SSE。
// 返回取消函数。
export function streamPlan(
  req: PlanStreamRequest,
  handlers: PlanHandlers,
): () => void {
  const controller = new AbortController();

  const dispatch = (event: string, data: string) => {
    let parsed: unknown = {};
    try {
      parsed = data ? JSON.parse(data) : {};
    } catch {
      parsed = {};
    }
    const p = parsed as Record<string, unknown>;
    switch (event) {
      case "status":
        handlers.onStatus?.(String(p.text ?? ""));
        break;
      case "intent":
        handlers.onIntent?.(parsed as { city: string; day_count: number; preferences: string[] });
        break;
      case "skeleton":
        handlers.onSkeleton?.(parsed as PlanSkeleton);
        break;
      case "reply":
        handlers.onReply?.(String(p.text ?? ""));
        break;
      case "day":
        handlers.onDay?.(parsed as Itinerary["days"][number]);
        break;
      case "itinerary":
        handlers.onItinerary?.(parsed as Itinerary);
        break;
      case "degraded":
        handlers.onDegraded?.(String(p.reason ?? ""));
        break;
      case "done":
        handlers.onDone?.();
        break;
    }
  };

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/plan/stream`, {
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        }),
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`/plan/stream 返回 ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE 事件以空行分隔
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = "message";
          const dataLines: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length) dispatch(event, dataLines.join("\n"));
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      handlers.onError?.(err instanceof Error ? err : new Error("规划流连接中断"));
    }
  })();

  return () => controller.abort();
}
