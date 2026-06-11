import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";
import type { Itinerary, PlanSkeleton, POI, Stop, Transit, TransitMode } from "../types";

// SSOT 单一数据源（PRD §8.4）：唯一权威的行程树，日程表/地图/对话均为其只读投影。
// 编辑只改 Store、不落库（保存才落库）。结构变更入 zundo 快照栈支持 Undo（§13.4）。

export type Phase = "idle" | "streaming" | "done" | "error";

// 客户端临时 id：递减负数，区别于后端正 id
let _clientId = -1;
function nextClientId(): number {
  return _clientId--;
}

function _haversineM(a: POI, b: POI): number | null {
  if (a.lng == null || a.lat == null || b.lng == null || b.lat == null) {
    return null;
  }
  const R = 6371000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dPhi = ((b.lat - a.lat) * Math.PI) / 180;
  const dLmb = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLmb / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// 相邻两两估算：≤2km 步行(~1.3m/s)，否则驾车(~8.3m/s)。本地占位，地图侧可精算覆盖。
function estimateTransit(prev: Stop, cur: Stop): Transit {
  const dist = _haversineM(prev.poi, cur.poi);
  const mode: TransitMode = dist != null && dist <= 2000 ? "walking" : "driving";
  const speed = mode === "walking" ? 1.3 : 8.3;
  return {
    id: nextClientId(),
    from_stop_id: prev.id,
    to_stop_id: cur.id,
    mode,
    distance_meters: dist,
    duration_seconds: dist != null ? Math.round(dist / speed) : null,
    polyline: null,
  };
}

function relinkTransits(stops: Stop[], existing: Transit[] = []): Transit[] {
  // 尽量保留已有段的 mode（用户可能切过），仅几何变化时重估。
  const prevByKey = new Map(
    existing.map((t) => [`${t.from_stop_id}_${t.to_stop_id}`, t]),
  );
  const transits: Transit[] = [];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const cur = stops[i];
    const kept = prevByKey.get(`${prev.id}_${cur.id}`);
    transits.push(kept ?? estimateTransit(prev, cur));
  }
  return transits;
}

function reindex(stops: Stop[]): void {
  stops.forEach((s, i) => {
    s.order_index = i + 1;
  });
}

interface ItineraryState {
  itinerary: Itinerary | null;
  phase: Phase;
  statusText: string;
  degraded: boolean;
  skeleton: PlanSkeleton | null;
  selectedDayIndex: number;
  setItinerary: (itinerary: Itinerary) => void;
  setPhase: (phase: Phase) => void;
  setStatus: (text: string) => void;
  setDegraded: (degraded: boolean) => void;
  setSkeleton: (skeleton: PlanSkeleton | null) => void;
  applyDay: (day: Itinerary["days"][number]) => void;
  setSelectedDay: (dayIndex: number) => void;
  selectCandidate: (poi: POI, dayIndex?: number) => void;
  removeStop: (dayId: number, stopId: number) => void;
  reorderStops: (dayId: number, fromIndex: number, toIndex: number) => void;
  setTransitMode: (dayId: number, transitId: number, mode: TransitMode) => void;
  applyTransitResult: (
    dayId: number,
    transitId: number,
    result: { duration_seconds: number | null; distance_meters: number | null; polyline?: string | null },
  ) => void;
  startStreaming: () => void;
  clear: () => void;
}

// 流式期间从 skeleton 初始化一棵空树骨架，day 事件逐天填充。
function shellFromSkeleton(skeleton: PlanSkeleton): Itinerary {
  return {
    id: nextClientId(),
    user_id: null,
    title: `${skeleton.city}${skeleton.day_count}日游`,
    city: skeleton.city,
    status: "draft",
    day_count: skeleton.day_count,
    days: skeleton.days.map((d) => ({
      id: nextClientId(),
      day_index: d.day_index,
      stops: [],
      transits: [],
    })),
  };
}

export const useItineraryStore = create<ItineraryState>()(
  temporal(
    immer((set) => ({
      itinerary: null,
      phase: "idle",
      statusText: "",
      degraded: false,
      skeleton: null,
      selectedDayIndex: 1,
      setItinerary: (itinerary) =>
        set((state) => {
          state.itinerary = itinerary;
          state.phase = "done";
          // 默认聚焦第一个有地点的天，保证行程表高亮与地图一致。
          const firstWithStops = itinerary.days.find((d) => d.stops.length > 0);
          if (firstWithStops) state.selectedDayIndex = firstWithStops.day_index;
        }),
      setPhase: (phase) =>
        set((state) => {
          state.phase = phase;
        }),
      setStatus: (text) =>
        set((state) => {
          state.statusText = text;
        }),
      setDegraded: (degraded) =>
        set((state) => {
          state.degraded = degraded;
        }),
      setSkeleton: (skeleton) =>
        set((state) => {
          state.skeleton = skeleton;
          if (skeleton) state.itinerary = shellFromSkeleton(skeleton);
        }),
      applyDay: (day) =>
        set((state) => {
          if (!state.itinerary) return;
          const idx = state.itinerary.days.findIndex(
            (d) => d.day_index === day.day_index,
          );
          if (idx === -1) state.itinerary.days.push(day);
          else state.itinerary.days[idx] = day;
        }),
      setSelectedDay: (dayIndex) =>
        set((state) => {
          state.selectedDayIndex = dayIndex;
        }),
      selectCandidate: (poi, dayIndex) =>
        set((state) => {
          if (!state.itinerary) return;
          const di = dayIndex ?? state.selectedDayIndex;
          const day = state.itinerary.days.find((d) => d.day_index === di);
          if (!day) return;
          const stop: Stop = {
            id: nextClientId(),
            order_index: day.stops.length + 1,
            arrive_time: null,
            stay_minutes: null,
            poi: { ...poi, id: nextClientId() },
          };
          day.stops.push(stop);
          day.transits = relinkTransits(day.stops, day.transits);
        }),
      removeStop: (dayId, stopId) =>
        set((state) => {
          if (!state.itinerary) return;
          const day = state.itinerary.days.find((d) => d.id === dayId);
          if (!day) return;
          day.stops = day.stops.filter((s) => s.id !== stopId);
          reindex(day.stops);
          day.transits = relinkTransits(day.stops, day.transits);
        }),
      reorderStops: (dayId, fromIndex, toIndex) =>
        set((state) => {
          if (!state.itinerary) return;
          const day = state.itinerary.days.find((d) => d.id === dayId);
          if (!day) return;
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= day.stops.length ||
            toIndex >= day.stops.length
          ) {
            return;
          }
          const [moved] = day.stops.splice(fromIndex, 1);
          day.stops.splice(toIndex, 0, moved);
          reindex(day.stops);
          day.transits = relinkTransits(day.stops);
        }),
      setTransitMode: (dayId, transitId, mode) =>
        set((state) => {
          if (!state.itinerary) return;
          const day = state.itinerary.days.find((d) => d.id === dayId);
          const transit = day?.transits.find((t) => t.id === transitId);
          if (!transit) return;
          transit.mode = mode;
          // 切换方式后清空旧结果，等待地图重算覆盖。
          transit.duration_seconds = null;
          transit.distance_meters = null;
          transit.polyline = null;
        }),
      applyTransitResult: (dayId, transitId, result) =>
        set((state) => {
          if (!state.itinerary) return;
          const day = state.itinerary.days.find((d) => d.id === dayId);
          const transit = day?.transits.find((t) => t.id === transitId);
          if (!transit) return;
          transit.duration_seconds = result.duration_seconds;
          transit.distance_meters = result.distance_meters;
          if (result.polyline !== undefined) transit.polyline = result.polyline;
        }),
      startStreaming: () =>
        set((state) => {
          state.phase = "streaming";
          state.statusText = "";
          state.degraded = false;
          state.skeleton = null;
          state.itinerary = null;
          state.selectedDayIndex = 1;
        }),
      clear: () =>
        set((state) => {
          state.itinerary = null;
          state.phase = "idle";
          state.statusText = "";
          state.degraded = false;
          state.skeleton = null;
          state.selectedDayIndex = 1;
        }),
    })),
    {
      // 仅把行程树纳入撤销栈（PRD §13.4）
      partialize: (state) => ({ itinerary: state.itinerary }),
      limit: 50,
      equality: (a, b) =>
        JSON.stringify(a.itinerary) === JSON.stringify(b.itinerary),
    },
  ),
);

// zundo 时间旅行 API（undo/redo/clear/pause/resume）
export const useTemporalStore = useItineraryStore.temporal;
