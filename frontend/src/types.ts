// 镜像后端 ItineraryRead（app/schemas.py），三视图均从此结构投影。

export type Category = "eat" | "stay" | "play";

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
