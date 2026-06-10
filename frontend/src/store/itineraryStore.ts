import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";
import type { Itinerary, POI, Stop, Transit } from "../types";

// SSOT 单一数据源（dev_doc §4.1）：唯一权威的行程树，三视图均为其只读投影。
// 编辑只改 Store、不落库（保存才落库，M5）。结构变更入 zundo 快照栈支持 Undo（§4.3）。
// 交通段：relinkTransits 先本地估算占位，useTransitRefiner 防抖后用后端重算结果覆盖（§5.1/§5.3）。

export type Phase = "idle" | "streaming" | "done" | "error";

// 客户端临时 id：递减负数，区别于后端正 id（落库留 M5）
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

// 相邻两两步行估算（~1.3m/s），重建该 Day 的 Transit 段。M4 换增量精算。
function relinkTransits(stops: Stop[]): Transit[] {
  const transits: Transit[] = [];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const cur = stops[i];
    const dist = _haversineM(prev.poi, cur.poi);
    transits.push({
      id: nextClientId(),
      from_stop_id: prev.id,
      to_stop_id: cur.id,
      mode: "walking",
      distance_meters: dist,
      duration_seconds: dist != null ? Math.round(dist / 1.3) : null,
      polyline: null,
    });
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
  skeleton: POI[];
  selectedDayIndex: number;
  setItinerary: (itinerary: Itinerary) => void;
  setPhase: (phase: Phase) => void;
  setStatus: (text: string) => void;
  setDegraded: (degraded: boolean) => void;
  setSkeleton: (pois: POI[]) => void;
  setSelectedDay: (dayIndex: number) => void;
  selectCandidate: (poi: POI, dayIndex?: number) => void;
  removeStop: (dayId: number, stopId: number) => void;
  reorderStops: (dayId: number, fromIndex: number, toIndex: number) => void;
  applyTransits: (dayId: number, transits: Transit[]) => void;
  startStreaming: () => void;
  clear: () => void;
}

export const useItineraryStore = create<ItineraryState>()(
  temporal(
    immer((set) => ({
    itinerary: null,
    phase: "idle",
    statusText: "",
    degraded: false,
    skeleton: [],
    selectedDayIndex: 1,
    setItinerary: (itinerary) =>
      set((state) => {
        state.itinerary = itinerary;
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
    setSkeleton: (pois) =>
      set((state) => {
        state.skeleton = pois;
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
        day.transits = relinkTransits(day.stops);
      }),
    removeStop: (dayId, stopId) =>
      set((state) => {
        if (!state.itinerary) return;
        const day = state.itinerary.days.find((d) => d.id === dayId);
        if (!day) return;
        day.stops = day.stops.filter((s) => s.id !== stopId);
        reindex(day.stops);
        day.transits = relinkTransits(day.stops);
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
    applyTransits: (dayId, transits) =>
      set((state) => {
        if (!state.itinerary) return;
        const day = state.itinerary.days.find((d) => d.id === dayId);
        if (!day) return;
        // 仅覆盖耗时/距离，保留 relinkTransits 建立的 from/to 拓扑
        const byKey = new Map(
          transits.map((t) => [`${t.from_stop_id}_${t.to_stop_id}`, t]),
        );
        for (const t of day.transits) {
          const fresh = byKey.get(`${t.from_stop_id}_${t.to_stop_id}`);
          if (fresh) {
            t.distance_meters = fresh.distance_meters;
            t.duration_seconds = fresh.duration_seconds;
            t.mode = fresh.mode;
          }
        }
      }),
    startStreaming: () =>
      set((state) => {
        state.phase = "streaming";
        state.statusText = "";
        state.degraded = false;
        state.skeleton = [];
        state.itinerary = null;
        state.selectedDayIndex = 1;
      }),
    clear: () =>
      set((state) => {
        state.itinerary = null;
        state.phase = "idle";
        state.statusText = "";
        state.degraded = false;
        state.skeleton = [];
        state.selectedDayIndex = 1;
      }),
  })),
    {
      // 仅把行程树纳入撤销栈（dev_doc §4.3）；交通精算结果不入栈见 useTransitRefiner
      partialize: (state) => ({ itinerary: state.itinerary }),
      limit: 50,
      equality: (a, b) =>
        JSON.stringify(a.itinerary) === JSON.stringify(b.itinerary),
    },
  ),
);

// zundo 时间旅行 API（undo/redo/clear/pause/resume）
export const useTemporalStore = useItineraryStore.temporal;
