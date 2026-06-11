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

interface CachedCandidates {
  pois: POI[];
  degraded: boolean;
}

interface DraftPoisState {
  city: string;
  items: DraftPoi[];
  candidates: POI[];
  loadingCandidates: boolean;
  degraded: boolean;
  // 候选缓存：键为 city|category|keyword，命中则秒开、不再请求 LLM。
  candidatesCache: Record<string, CachedCandidates>;
  setCity: (c: string) => void;
  setCandidates: (pois: POI[], degraded: boolean, cacheKey?: string) => void;
  getCached: (cacheKey: string) => CachedCandidates | undefined;
  showCached: (cached: CachedCandidates) => void;
  setLoading: (loading: boolean) => void;
  add: (poi: POI) => void;
  remove: (key: string) => void;
  clear: () => void;
}

export const useDraftPoisStore = create<DraftPoisState>()(
  immer((set, get) => ({
    city: "",
    items: [],
    candidates: [],
    loadingCandidates: false,
    degraded: false,
    candidatesCache: {},
    setCity: (c) =>
      set((state) => {
        if (state.city !== c) {
          state.city = c;
          state.items = [];
          state.candidates = [];
          state.candidatesCache = {}; // 换城市作废旧缓存
        }
      }),
    setCandidates: (pois, degraded, cacheKey) =>
      set((state) => {
        state.candidates = pois;
        state.degraded = degraded;
        state.loadingCandidates = false;
        // 仅缓存成功结果，降级兜底不缓存（下次仍可重试拿真数据）。
        if (cacheKey && !degraded) {
          state.candidatesCache[cacheKey] = { pois, degraded };
        }
      }),
    getCached: (cacheKey) => get().candidatesCache[cacheKey],
    showCached: (cached) =>
      set((state) => {
        state.candidates = cached.pois;
        state.degraded = cached.degraded;
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
        state.candidatesCache = {};
      }),
  })),
);
