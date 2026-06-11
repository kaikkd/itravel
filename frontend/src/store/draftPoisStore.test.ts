import { beforeEach, describe, expect, it } from "vitest";
import { useDraftPoisStore } from "./draftPoisStore";
import type { POI } from "../types";

function poi(name: string): POI {
  return {
    id: 0,
    amap_id: null,
    name,
    category: "play",
    lng: 104.06,
    lat: 30.66,
    address: null,
    rec_reason: null,
    sources: [],
  };
}

describe("draftPoisStore", () => {
  beforeEach(() => {
    useDraftPoisStore.getState().clear();
  });

  it("add appends and dedupes by name", () => {
    const s = useDraftPoisStore.getState();
    s.add(poi("宽窄巷子"));
    s.add(poi("武侯祠"));
    s.add(poi("宽窄巷子")); // 重复
    expect(useDraftPoisStore.getState().items.length).toBe(2);
  });

  it("remove drops by key", () => {
    useDraftPoisStore.getState().add(poi("宽窄巷子"));
    const key = useDraftPoisStore.getState().items[0].key;
    useDraftPoisStore.getState().remove(key);
    expect(useDraftPoisStore.getState().items.length).toBe(0);
  });

  it("setCity resets items when city changes", () => {
    const s = useDraftPoisStore.getState();
    s.setCity("成都");
    s.add(poi("宽窄巷子"));
    s.setCity("杭州"); // 切城市清空
    expect(useDraftPoisStore.getState().items.length).toBe(0);
    expect(useDraftPoisStore.getState().city).toBe("杭州");
  });
});
