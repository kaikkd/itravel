import { beforeEach, describe, expect, it } from "vitest";
import { useItineraryStore, useTemporalStore } from "./itineraryStore";
import type { Itinerary, POI } from "../types";

function poi(name: string, lng: number, lat: number): POI {
  return {
    id: 0,
    amap_id: null,
    name,
    category: "play",
    lng,
    lat,
    address: null,
    rec_reason: null,
    sources: [],
  };
}

function fixture(): Itinerary {
  return {
    id: -1,
    user_id: null,
    title: "成都游",
    city: "成都",
    status: "draft",
    day_count: 1,
    days: [
      {
        id: -10,
        day_index: 1,
        stops: [
          {
            id: -11,
            order_index: 1,
            arrive_time: null,
            stay_minutes: null,
            poi: poi("A", 104.04, 30.64),
          },
          {
            id: -12,
            order_index: 2,
            arrive_time: null,
            stay_minutes: null,
            poi: poi("B", 104.06, 30.66),
          },
        ],
        transits: [],
      },
    ],
  };
}

describe("itineraryStore", () => {
  beforeEach(() => {
    useItineraryStore.getState().clear();
    useTemporalStore.getState().clear();
    useItineraryStore.getState().setItinerary(fixture());
  });

  it("selectCandidate appends a stop and relinks transits", () => {
    const day = useItineraryStore.getState().itinerary!.days[0];
    useItineraryStore.getState().selectCandidate(poi("C", 104.08, 30.68), 1);
    const after = useItineraryStore.getState().itinerary!.days[0];
    expect(after.stops.length).toBe(3);
    expect(after.stops.map((s) => s.order_index)).toEqual([1, 2, 3]);
    expect(after.transits.length).toBe(2); // stops-1
    void day;
  });

  it("removeStop reindexes order and relinks", () => {
    const dayId = useItineraryStore.getState().itinerary!.days[0].id;
    const firstStop = useItineraryStore.getState().itinerary!.days[0].stops[0].id;
    useItineraryStore.getState().removeStop(dayId, firstStop);
    const after = useItineraryStore.getState().itinerary!.days[0];
    expect(after.stops.length).toBe(1);
    expect(after.stops[0].order_index).toBe(1);
    expect(after.transits.length).toBe(0);
  });

  it("reorderStops swaps order and rebuilds transits", () => {
    const dayId = useItineraryStore.getState().itinerary!.days[0].id;
    const namesBefore = useItineraryStore
      .getState()
      .itinerary!.days[0].stops.map((s) => s.poi.name);
    expect(namesBefore).toEqual(["A", "B"]);
    useItineraryStore.getState().reorderStops(dayId, 0, 1);
    const after = useItineraryStore.getState().itinerary!.days[0];
    expect(after.stops.map((s) => s.poi.name)).toEqual(["B", "A"]);
    expect(after.stops.map((s) => s.order_index)).toEqual([1, 2]);
  });

  it("relinkTransits produces stops-1 segments with estimates", () => {
    const day = useItineraryStore.getState().itinerary!.days[0];
    // 初始 fixture transits 为空，加入一个触发 relink
    useItineraryStore.getState().selectCandidate(poi("C", 104.08, 30.68), 1);
    const after = useItineraryStore.getState().itinerary!.days[0];
    expect(after.transits.length).toBe(after.stops.length - 1);
    expect(after.transits[0].distance_meters).toBeGreaterThan(0);
    void day;
  });

  it("undo reverts the last structural change", () => {
    useItineraryStore.getState().selectCandidate(poi("C", 104.08, 30.68), 1);
    expect(useItineraryStore.getState().itinerary!.days[0].stops.length).toBe(3);
    useTemporalStore.getState().undo();
    expect(useItineraryStore.getState().itinerary!.days[0].stops.length).toBe(2);
  });
});
