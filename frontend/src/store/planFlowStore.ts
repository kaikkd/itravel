import { create } from "zustand";
import type { PlanningMode } from "../types";

// 顶层流程的「向导数据」状态（导航由 react-router 接管，不再存 phase）。
export type PlaceRole = "origin" | "destination" | "return";
// route_first 子流程
export type RouteStart = "has_city" | "only_types";
export type Pace = "compact" | "balanced" | "relaxed";

interface PlanFlowState {
  // 共享
  mode: PlanningMode | null;
  origin: string;
  destinations: string[];
  returnCity: string;
  dayCount: number;

  // route_first 子流程
  routeStart: RouteStart | null;
  routeCity: string;
  pace: Pace | null;
  estimatedDayCount: number | null;

  setMode: (mode: PlanningMode) => void;
  setOrigin: (city: string) => void;
  toggleDestination: (city: string) => void;
  setReturnCity: (city: string) => void;
  setDayCount: (n: number) => void;
  setRouteStart: (r: RouteStart) => void;
  setRouteCity: (city: string) => void;
  setPace: (p: Pace) => void;
  setEstimatedDayCount: (n: number | null) => void;
  primaryDestination: () => string;
  reset: () => void;
}

const initial = {
  mode: null as PlanningMode | null,
  origin: "",
  destinations: [] as string[],
  returnCity: "",
  dayCount: 3,
  routeStart: null as RouteStart | null,
  routeCity: "",
  pace: null as Pace | null,
  estimatedDayCount: null as number | null,
};

export const usePlanFlowStore = create<PlanFlowState>((set, get) => ({
  ...initial,
  setMode: (mode) => set({ mode }),
  setOrigin: (city) => set({ origin: city }),
  toggleDestination: (city) =>
    set((state) => ({
      destinations: state.destinations.includes(city)
        ? state.destinations.filter((c) => c !== city)
        : [...state.destinations, city],
    })),
  setReturnCity: (city) => set({ returnCity: city }),
  setDayCount: (n) => set({ dayCount: Math.max(1, Math.min(n, 10)) }),
  setRouteStart: (routeStart) => set({ routeStart }),
  setRouteCity: (routeCity) => set({ routeCity }),
  setPace: (pace) => set({ pace }),
  setEstimatedDayCount: (estimatedDayCount) => set({ estimatedDayCount }),
  // route_first 用 routeCity；traffic_first 用首个目的地。
  primaryDestination: () => {
    const s = get();
    return s.mode === "route_first" ? s.routeCity : (s.destinations[0] ?? "");
  },
  reset: () => set({ ...initial }),
}));
