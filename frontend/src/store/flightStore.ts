import { create } from "zustand";
import type { Flight } from "../types";

// 机票流程状态（交通优先模式，mock 数据 + 飞行动画）。
// 与行程 SSOT 分离：这是流程态而非行程树。

interface FlightState {
  outbound: Flight | null;
  returnFlight: Flight | null;
  flightsConfirmed: boolean;
  setOutbound: (flight: Flight) => void;
  setReturnFlight: (flight: Flight) => void;
  confirmFlights: () => void;
  reset: () => void;
}

export const useFlightStore = create<FlightState>((set) => ({
  outbound: null,
  returnFlight: null,
  flightsConfirmed: false,
  setOutbound: (flight) => set({ outbound: flight }),
  setReturnFlight: (flight) => set({ returnFlight: flight }),
  confirmFlights: () => set({ flightsConfirmed: true }),
  reset: () =>
    set({ outbound: null, returnFlight: null, flightsConfirmed: false }),
}));
