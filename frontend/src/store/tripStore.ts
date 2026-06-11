import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  Flight,
  SlotPoi,
  SlotTransit,
  SuggestionPoi,
  SuggestionResponse,
  TransitMode,
  TripDay,
} from "../types";

let _slotSeq = 1;
function nextSlotId(): string {
  return `slot-${_slotSeq++}`;
}

export function transitKey(dayIndex: number, fromSlotId: string): string {
  return `${dayIndex}:${fromSlotId}`;
}

const DEFAULT_TRANSIT: SlotTransit = {
  mode: "driving",
  durationSeconds: null,
  distanceMeters: null,
  showPath: false,
};

function emptyDay(dayIndex: number, slots = 3): TripDay {
  return {
    dayIndex,
    label: `第 ${dayIndex} 天`,
    slots: Array.from({ length: slots }, () => ({ id: nextSlotId(), poi: null })),
  };
}

interface TripState {
  city: string;
  days: TripDay[];
  suggestions: Record<number, SuggestionPoi[]>;
  hasSuggestions: boolean;
  loadingSuggestions: boolean;
  degraded: boolean;
  transits: Record<string, SlotTransit>;
  outbound: Flight | null;
  returnFlight: Flight | null;
  flightsConfirmed: boolean;

  initDays: (city: string, dayCount: number) => void;
  setLoadingSuggestions: (loading: boolean) => void;
  setSuggestions: (resp: SuggestionResponse) => void;
  fillSlot: (dayIndex: number, slotId: string, poi: SlotPoi) => void;
  clearSlot: (dayIndex: number, slotId: string) => void;
  addSlot: (dayIndex: number) => void;
  removeSlot: (dayIndex: number, slotId: string) => void;
  setTransitMode: (dayIndex: number, fromSlotId: string, mode: TransitMode) => void;
  requestTransit: (dayIndex: number, fromSlotId: string) => void;
  setTransitResult: (
    dayIndex: number,
    fromSlotId: string,
    result: { durationSeconds: number | null; distanceMeters: number | null },
  ) => void;
  setOutbound: (flight: Flight) => void;
  setReturnFlight: (flight: Flight) => void;
  confirmFlights: () => void;
  reset: () => void;
}

export const useTripStore = create<TripState>()(
  immer((set) => ({
    city: "",
    days: [],
    suggestions: {},
    hasSuggestions: false,
    loadingSuggestions: false,
    degraded: false,
    transits: {},
    outbound: null,
    returnFlight: null,
    flightsConfirmed: false,

    initDays: (city, dayCount) =>
      set((state) => {
        state.city = city;
        state.days = Array.from({ length: Math.max(1, dayCount) }, (_, i) =>
          emptyDay(i + 1),
        );
        state.suggestions = {};
        state.hasSuggestions = false;
        state.degraded = false;
        state.transits = {};
      }),

    setLoadingSuggestions: (loading) =>
      set((state) => {
        state.loadingSuggestions = loading;
      }),

    setSuggestions: (resp) =>
      set((state) => {
        // 候选写入按天的 map；不足的天补空天。
        while (state.days.length < resp.day_count) {
          state.days.push(emptyDay(state.days.length + 1));
        }
        const map: Record<number, SuggestionPoi[]> = {};
        for (const day of resp.days) {
          map[day.day_index] = day.candidates;
        }
        state.suggestions = map;
        state.hasSuggestions = true;
        state.degraded = resp.degraded;
        state.loadingSuggestions = false;
      }),

    fillSlot: (dayIndex, slotId, poi) =>
      set((state) => {
        const day = state.days.find((d) => d.dayIndex === dayIndex);
        const slot = day?.slots.find((s) => s.id === slotId);
        if (slot) slot.poi = poi;
      }),

    clearSlot: (dayIndex, slotId) =>
      set((state) => {
        const day = state.days.find((d) => d.dayIndex === dayIndex);
        const slot = day?.slots.find((s) => s.id === slotId);
        if (slot) slot.poi = null;
        delete state.transits[transitKey(dayIndex, slotId)];
      }),

    addSlot: (dayIndex) =>
      set((state) => {
        const day = state.days.find((d) => d.dayIndex === dayIndex);
        if (day) day.slots.push({ id: nextSlotId(), poi: null });
      }),

    removeSlot: (dayIndex, slotId) =>
      set((state) => {
        const day = state.days.find((d) => d.dayIndex === dayIndex);
        if (!day) return;
        day.slots = day.slots.filter((s) => s.id !== slotId);
        delete state.transits[transitKey(dayIndex, slotId)];
      }),

    setTransitMode: (dayIndex, fromSlotId, mode) =>
      set((state) => {
        const key = transitKey(dayIndex, fromSlotId);
        const existing = state.transits[key] ?? { ...DEFAULT_TRANSIT };
        // 切换方式后清空旧时长/路径，等待重新按需计算。
        state.transits[key] = {
          ...existing,
          mode,
          durationSeconds: null,
          distanceMeters: null,
          showPath: false,
        };
      }),

    requestTransit: (dayIndex, fromSlotId) =>
      set((state) => {
        const key = transitKey(dayIndex, fromSlotId);
        const existing = state.transits[key] ?? { ...DEFAULT_TRANSIT };
        // 点击时钟：标记需要按需计算路径/时长，由地图侧执行。
        state.transits[key] = {
          ...existing,
          durationSeconds: null,
          distanceMeters: null,
          showPath: true,
        };
      }),

    setTransitResult: (dayIndex, fromSlotId, result) =>
      set((state) => {
        const key = transitKey(dayIndex, fromSlotId);
        const existing = state.transits[key] ?? { ...DEFAULT_TRANSIT };
        state.transits[key] = {
          ...existing,
          durationSeconds: result.durationSeconds,
          distanceMeters: result.distanceMeters,
          showPath: true,
        };
      }),

    setOutbound: (flight) =>
      set((state) => {
        state.outbound = flight;
      }),

    setReturnFlight: (flight) =>
      set((state) => {
        state.returnFlight = flight;
      }),

    confirmFlights: () =>
      set((state) => {
        state.flightsConfirmed = true;
      }),

    reset: () =>
      set((state) => {
        state.city = "";
        state.days = [];
        state.suggestions = {};
        state.hasSuggestions = false;
        state.loadingSuggestions = false;
        state.degraded = false;
        state.transits = {};
        state.outbound = null;
        state.returnFlight = null;
        state.flightsConfirmed = false;
      }),
  })),
);

export { DEFAULT_TRANSIT };
