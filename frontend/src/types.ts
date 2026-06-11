// 与后端 ItineraryRead（app/schemas.py）保持镜像的核心行程类型。

export type Category = "eat" | "stay" | "play";
export type PlanningMode = "traffic_first" | "route_first";
export type TransitMode = "driving" | "transit" | "walking";

export interface Source {
  id: number;
  url: string;
  summary: string;
}

export interface POI {
  id: number;
  amap_id: string | null;
  name: string;
  category: Category;
  lng: number | null;
  lat: number | null;
  address: string | null;
  rec_reason: string | null;
  sources: Source[];
}

export interface Stop {
  id: number;
  order_index: number;
  arrive_time: string | null;
  stay_minutes: number | null;
  poi: POI;
}

export interface Transit {
  id: number;
  from_stop_id: number;
  to_stop_id: number;
  mode: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  polyline: string | null;
}

export interface Day {
  id: number;
  day_index: number;
  stops: Stop[];
  transits: Transit[];
}

export interface Itinerary {
  id: number;
  user_id: number | null;
  title: string;
  city: string;
  status: string;
  day_count: number;
  days: Day[];
}

export interface ItinerarySummary {
  id: number;
  title: string;
  city: string;
  status: string;
  day_count: number;
}

// ---- 流式规划（POST /plan/stream，SSE） ----

// 时间轴槽位（吃住玩一等公民）。
export type Slot = "breakfast" | "lunch" | "dinner" | "attraction" | "hotel";

export interface PlanSkeletonDay {
  day_index: number;
  slots: Slot[];
}

export interface PlanSkeleton {
  city: string;
  day_count: number;
  days: PlanSkeletonDay[];
}

// ---- 对话（前端 chat store） ----

export interface PlanChange {
  // AI 本轮对计划的改动摘要（折叠卡）
  city: string;
  dayCount: number;
  added: { dayIndex: number; names: string[] }[];
  totalStops: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean; // 助手消息流式生成中
  change?: PlanChange; // 助手消息附带的计划改动折叠卡
}

// ---- 机票（mock，用于交通优先与飞行动画） ----

export interface Airport {
  code: string;
  name: string;
  city: string;
  lng: number;
  lat: number;
}

// 出行方式：飞机 / 高铁（每一程可分别选，#4）
export type TravelMode = "flight" | "train";

export interface Flight {
  id: string;
  kind: TravelMode; // flight | train
  platform: string; // OTA 平台（携程/12306 等）
  airline: string; // 航司 或 列车运营（如「复兴号」）
  flightNo: string; // 航班号 或 车次（G/D）
  from: Airport;
  to: Airport;
  departTime: string;
  arriveTime: string;
  duration: string;
  price: number;
  baggage: string; // 飞机：行李额；高铁：座席类型
  dateNote: string;
}
