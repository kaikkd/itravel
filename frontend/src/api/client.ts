import type {
  Category,
  Itinerary,
  ItinerarySummary,
  PlanSkeleton,
  POI,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const TOKEN_KEY = "itravel_token";
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

interface RequestOptions extends RequestInit {
  onUnauthorized?: () => unknown;
  errorMessage?: string;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

function detailToMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (isRecord(item) && typeof item.msg === "string") return item.msg;
        return null;
      })
      .filter(Boolean)
      .join("；") || null;
  }
  return null;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const body = JSON.parse(text) as unknown;
      if (isRecord(body)) {
        const detail = detailToMessage(body.detail);
        if (detail) return detail;
        if (typeof body.message === "string") return body.message;
      }
    } catch {
      return text;
    }
  }
  return `${fallback}：${res.status}`;
}

async function requestJson<T>(
  path: string,
  { onUnauthorized, errorMessage, ...init }: RequestOptions = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (res.status === 401) {
    clearToken();
    if (onUnauthorized) return onUnauthorized() as T;
  }
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, errorMessage ?? `${path} 返回`));
  }
  return readJson<T>(res);
}

function postJson<T>(
  path: string,
  body: unknown,
  options: Omit<RequestOptions, "body" | "method"> = {},
): Promise<T> {
  return requestJson<T>(path, {
    ...options,
    method: "POST",
    headers: { ...JSON_HEADERS, ...(options.headers as Record<string, string> | undefined) },
    body: JSON.stringify(body),
  });
}

// ---- 已保存行程（M5） ----

export async function listItineraries(): Promise<ItinerarySummary[]> {
  return requestJson<ItinerarySummary[]>("/itineraries", {
    headers: authHeaders(),
    onUnauthorized: () => [],
  });
}

export async function getItinerary(id: number): Promise<Itinerary> {
  return requestJson<Itinerary>(`/itineraries/${id}`, {
    headers: authHeaders(),
  });
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

  return postJson<Itinerary>("/itineraries", payload, {
    headers: authHeaders(),
    errorMessage: "保存失败",
  });
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
  return postJson<AuthResult>("/auth/register", { email, password }, {
    errorMessage: "注册失败",
  });
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResult> {
  return postJson<AuthResult>("/auth/login", { email, password }, {
    errorMessage: "登录失败",
  });
}

export async function getMe(): Promise<{ id: number; email: string } | null> {
  const t = getToken();
  if (!t) return null;
  return requestJson<{ id: number; email: string } | null>("/auth/me", {
    headers: authHeaders(),
    onUnauthorized: () => null,
  });
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
  const body = await postJson<{ results: SegmentResult[] }>(
    "/transit/recompute",
    { segments },
  );
  return body.results;
}

// ---- 流式规划（POST /plan/stream，fetch + ReadableStream SSE） ----

export interface ChatTurnPayload {
  role: "user" | "assistant";
  content: string;
}

export interface SelectedPoiPayload {
  name: string;
  category?: Category;
  lng?: number | null;
  lat?: number | null;
  address?: string | null;
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
  // route_first：基于已选 POI + 节奏估算天数并排程
  plan_source?: "day_count" | "poi_list";
  pace?: "compact" | "balanced" | "relaxed";
  selected_pois?: SelectedPoiPayload[];
}

export interface PlanHandlers {
  onStatus?: (text: string) => void;
  onIntent?: (data: { city: string; day_count: number; preferences: string[] }) => void;
  onEstimate?: (data: { day_count: number }) => void;
  onSkeleton?: (skeleton: PlanSkeleton) => void;
  onReply?: (text: string) => void;
  onDay?: (day: Itinerary["days"][number]) => void;
  onItinerary?: (itinerary: Itinerary) => void;
  onDegraded?: (reason: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

function nextSseSeparator(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1 && crlf === -1) return null;
  if (lf === -1) return { index: crlf, length: 4 };
  if (crlf === -1) return { index: lf, length: 2 };
  return crlf < lf ? { index: crlf, length: 4 } : { index: lf, length: 2 };
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
      case "estimate":
        handlers.onEstimate?.(parsed as { day_count: number });
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
      if (res.status === 401) clearToken();
      if (!res.ok || !res.body) {
        throw new Error(await readErrorMessage(res, "/plan/stream 返回"));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE 事件以空行分隔，兼容 LF 与 CRLF。
        let sep = nextSseSeparator(buffer);
        while (sep) {
          const block = buffer.slice(0, sep.index);
          buffer = buffer.slice(sep.index + sep.length);
          let event = "message";
          const dataLines: string[] = [];
          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length) dispatch(event, dataLines.join("\n"));
          sep = nextSseSeparator(buffer);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      handlers.onError?.(err instanceof Error ? err : new Error("规划流连接中断"));
    }
  })();

  return () => controller.abort();
}

// ---- 景点候选 / 候选城市（route_first，#11） ----

function toPoi(p: Partial<POI>): POI {
  return {
    id: 0,
    amap_id: null,
    name: p.name ?? "",
    category: (p.category ?? "play") as Category,
    lng: p.lng ?? null,
    lat: p.lat ?? null,
    address: p.address ?? null,
    rec_reason: p.rec_reason ?? null,
    sources: [],
  };
}

export async function fetchCandidates(
  city: string,
  opts: { category?: Category; keyword?: string; limit?: number } = {},
): Promise<{ pois: POI[]; degraded: boolean }> {
  const body = await postJson<{ pois: Partial<POI>[]; degraded: boolean }>(
    "/plan/candidates",
    {
      city,
      category: opts.category ?? null,
      keyword: opts.keyword ?? "",
      limit: opts.limit ?? 8,
    },
  );
  return { pois: body.pois.map(toPoi), degraded: body.degraded };
}

export interface CityOption {
  name: string;
  reason: string;
}

export async function suggestCity(
  freeText: string,
  history: ChatTurnPayload[] = [],
): Promise<{ reply: string; cities: CityOption[]; degraded: boolean }> {
  return postJson<{ reply: string; cities: CityOption[]; degraded: boolean }>(
    "/plan/suggest-city",
    { free_text: freeText, history },
  );
}
