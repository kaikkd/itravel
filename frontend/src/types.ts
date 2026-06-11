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

// ---- 结构化候选（POST /plan/suggestions） ----

export interface SuggestionPoi {
  name: string;
  category: Category;
  lng: number | null;
  lat: number | null;
  address: string | null;
  rec_reason: string | null;
}

export interface SuggestionDay {
  day_index: number;
  candidates: SuggestionPoi[];
}

export interface SuggestionResponse {
  city: string;
  day_count: number;
  reply: string;
  days: SuggestionDay[];
  degraded: boolean;
}

// ---- 行程工作台（前端 trip store） ----

export interface SlotPoi {
  name: string;
  category: Category;
  lng: number | null;
  lat: number | null;
  address: string | null;
  rec_reason: string | null;
}

export interface SlotTransit {
  mode: TransitMode;
  durationSeconds: number | null;
  distanceMeters: number | null;
  showPath: boolean;
}

export interface TripSlot {
  id: string;
  poi: SlotPoi | null;
}

export interface TripDay {
  dayIndex: number;
  label: string;
  slots: TripSlot[];
}

// ---- 机票（mock，用于交通优先与飞行动画） ----

export interface Airport {
  code: string;
  name: string;
  city: string;
  lng: number;
  lat: number;
}

export interface Flight {
  id: string;
  platform: string;
  airline: string;
  flightNo: string;
  from: Airport;
  to: Airport;
  departTime: string;
  arriveTime: string;
  duration: string;
  price: number;
  baggage: string;
  dateNote: string;
}
