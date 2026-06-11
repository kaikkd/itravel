import { create } from "zustand";
import type { Flight, TravelMode } from "../types";

// 大交通流程状态（交通优先模式，mock 数据 + 动画）。
// 去程/返程的出行方式可分别选（飞机/高铁，#4）。

interface FlightState {
  outboundMode: TravelMode;
  returnMode: TravelMode;
  outbound: Flight | null;
  returnFlight: Flight | null;
  flightsConfirmed: boolean;
  setOutboundMode: (m: TravelMode) => void;
  setReturnMode: (m: TravelMode) => void;
  setOutbound: (flight: Flight) => void;
  setReturnFlight: (flight: Flight) => void;
  confirmFlights: () => void;
  reset: () => void;
}

export const useFlightStore = create<FlightState>((set) => ({
  outboundMode: "flight",
  returnMode: "flight",
  outbound: null,
  returnFlight: null,
  flightsConfirmed: false,
  // 切换出行方式时清空已选（班次不通用）。
  setOutboundMode: (m) => set({ outboundMode: m, outbound: null }),
  setReturnMode: (m) => set({ returnMode: m, returnFlight: null }),
  setOutbound: (flight) => set({ outbound: flight }),
  setReturnFlight: (flight) => set({ returnFlight: flight }),
  confirmFlights: () => set({ flightsConfirmed: true }),
  reset: () =>
    set({
      outboundMode: "flight",
      returnMode: "flight",
      outbound: null,
      returnFlight: null,
      flightsConfirmed: false,
    }),
}));
