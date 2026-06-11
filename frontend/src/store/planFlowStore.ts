import { create } from "zustand";
import type { PlanningMode } from "../types";

// 顶层流程状态机：入口 -> 选地 -> 工作台。
export type FlowPhase = "intro" | "places" | "workspace";
export type PlaceRole = "origin" | "destination" | "return";

interface PlanFlowState {
  phase: FlowPhase;
  mode: PlanningMode | null;
  origin: string;
  destinations: string[];
  returnCity: string;
  dayCount: number;
  setMode: (mode: PlanningMode) => void;
  goPhase: (phase: FlowPhase) => void;
  setOrigin: (city: string) => void;
  toggleDestination: (city: string) => void;
  setReturnCity: (city: string) => void;
  setDayCount: (n: number) => void;
  primaryDestination: () => string;
  reset: () => void;
}

const initial = {
  phase: "intro" as FlowPhase,
  mode: null as PlanningMode | null,
  origin: "",
  destinations: [] as string[],
  returnCity: "",
  dayCount: 3,
};

export const usePlanFlowStore = create<PlanFlowState>((set, get) => ({
  ...initial,
  setMode: (mode) => set({ mode }),
  goPhase: (phase) => set({ phase }),
  setOrigin: (city) => set({ origin: city }),
  toggleDestination: (city) =>
    set((state) => ({
      destinations: state.destinations.includes(city)
        ? state.destinations.filter((c) => c !== city)
        : [...state.destinations, city],
    })),
  setReturnCity: (city) => set({ returnCity: city }),
  setDayCount: (n) => set({ dayCount: Math.max(1, Math.min(n, 10)) }),
  primaryDestination: () => get().destinations[0] ?? "",
  reset: () => set({ ...initial }),
}));
