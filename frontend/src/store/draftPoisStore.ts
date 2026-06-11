import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { POI } from "../types";

// route_first「选景点」阶段的草稿 POI 列表：无天数概念的 flat 堆叠板。
// 刻意不用 itineraryStore（避免污染日程撤销栈），plain zustand + immer。

export interface DraftPoi {
  key: string;
  poi: POI;
}

let _seq = 1;
function nextKey(): string {
  return `draft-${_seq++}`;
}

interface DraftPoisState {
  city: string;
  items: DraftPoi[];
  candidates: POI[];
  loadingCandidates: boolean;
  degraded: boolean;
  setCity: (c: string) => void;
  setCandidates: (pois: POI[], degraded: boolean) => void;
  setLoading: (loading: boolean) => void;
  add: (poi: POI) => void;
  remove: (key: string) => void;
  clear: () => void;
}

export const useDraftPoisStore = create<DraftPoisState>()(
  immer((set) => ({
    city: "",
    items: [],
    candidates: [],
    loadingCandidates: false,
    degraded: false,
    setCity: (c) =>
      set((state) => {
        if (state.city !== c) {
          state.city = c;
          state.items = [];
          state.candidates = [];
        }
      }),
    setCandidates: (pois, degraded) =>
      set((state) => {
        state.candidates = pois;
        state.degraded = degraded;
        state.loadingCandidates = false;
      }),
    setLoading: (loading) =>
      set((state) => {
        state.loadingCandidates = loading;
      }),
    add: (poi) =>
      set((state) => {
        if (state.items.some((it) => it.poi.name === poi.name)) return; // 去重
        state.items.push({ key: nextKey(), poi });
      }),
    remove: (key) =>
      set((state) => {
        state.items = state.items.filter((it) => it.key !== key);
      }),
    clear: () =>
      set((state) => {
        state.items = [];
        state.candidates = [];
        state.city = "";
        state.degraded = false;
      }),
  })),
);
