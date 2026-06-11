import { useEffect, useRef, useState } from "react";
import { MapPinned } from "lucide-react";
import { AMapNotConfigured, isAMapConfigured, loadAMap } from "../../lib/amap";
import { findCity } from "../../lib/cityCatalog";
import { useItineraryStore } from "../../store/itineraryStore";
import { useFlightStore } from "../../store/flightStore";
import { usePlanFlowStore } from "../../store/planFlowStore";
import type { Day, Transit, TransitMode } from "../../types";

type AMapAny = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface FilledStop {
  stopId: number;
  order: number;
  name: string;
  lng: number;
  lat: number;
}

const MODE_COLOR: Record<string, string> = {
  driving: "#c96442",
  transit: "#3f6f8f",
  walking: "#4f7a5b",
};

const MODE_LABEL: Record<string, string> = {
  driving: "驾车",
  transit: "公共交通",
  walking: "步行",
};

function filledStops(days: Day[]): FilledStop[] {
  const out: FilledStop[] = [];
  let order = 0;
  for (const day of days) {
    for (const stop of day.stops) {
      if (stop.poi.lng != null && stop.poi.lat != null) {
        order += 1;
        out.push({
          stopId: stop.id,
          order,
          name: stop.poi.name,
          lng: stop.poi.lng,
          lat: stop.poi.lat,
        });
      }
    }
  }
  return out;
}

// 激活天的点：clay 色 + 序号 + 名称气泡。
function pinContent(order: number, label: string): string {
  return `
    <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;">
      <div style="background:#c96442;color:#fff;font:600 12px/1 Inter,sans-serif;padding:6px 9px;border-radius:999px;box-shadow:0 6px 16px rgba(60,45,30,.28);white-space:nowrap;">
        ${order}. ${label}
      </div>
      <div style="width:2px;height:10px;background:#c96442;"></div>
    </div>`;
}

// 非激活天的点：弱化为小灰点，减少重叠干扰。
function dimPinContent(): string {
  return `
    <div style="transform:translate(-50%,-50%);">
      <div style="width:10px;height:10px;border-radius:999px;background:#b9b1a3;border:2px solid #fffdf9;box-shadow:0 2px 6px rgba(60,45,30,.2);"></div>
    </div>`;
}


export default function TripMap({ collapsed = false }: { collapsed?: boolean }) {
  const itinerary = useItineraryStore((s) => s.itinerary);
  const selectedDayIndex = useItineraryStore((s) => s.selectedDayIndex);
  const applyTransitResult = useItineraryStore((s) => s.applyTransitResult);
  const flightsConfirmed = useFlightStore((s) => s.flightsConfirmed);
  const mode = usePlanFlowStore((s) => s.mode);
  const primaryDestination = usePlanFlowStore((s) => s.primaryDestination)();

  const days = itinerary?.days ?? [];

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapAny>(null);
  const amapRef = useRef<AMapAny>(null);
  const overlaysRef = useRef<AMapAny[]>([]);
  const clusterRef = useRef<AMapAny>(null);
  const pathCacheRef = useRef<
    Map<string, { path: [number, number][]; duration: number | null; distance: number | null }>
  >(new Map());
  const drawSeqRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [reopenNonce, setReopenNonce] = useState(0);
  const [loadError, setLoadError] = useState("");

  // 展开时等宽度过渡结束后 resize + 触发一次重绘刷新。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || collapsed) return;
    const t = setTimeout(() => {
      map.resize?.();
      setReopenNonce((n) => n + 1);
    }, 520);
    return () => clearTimeout(t);
  }, [collapsed, ready]);

  // 初始化标准图层地图。
  useEffect(() => {
    if (!isAMapConfigured()) {
      setLoadError("地图未配置 Key，已降级为坐标列表。");
      return;
    }
    let cancelled = false;
    loadAMap()
      .then((AMap: AMapAny) => {
        if (cancelled || !containerRef.current) return;
        amapRef.current = AMap;
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 5,
          center: [104.066, 35],
          viewMode: "2D",
          mapStyle: "amap://styles/normal",
        });
        setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof AMapNotConfigured
            ? "地图未配置 Key，已降级为坐标列表。"
            : "地图加载失败，已降级为坐标列表。",
        );
      });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  // 进入地图（确认大交通后/路线优先）时，若行程尚空先定位到目的城市。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const city = findCity(primaryDestination);
    if (city && days.every((d) => d.stops.length === 0)) {
      map.setZoomAndCenter(11, [city.lng, city.lat]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, primaryDestination]);

  // 行程打点 + 路径渲染：非激活天弱化并聚合，仅激活天高亮打点 + 画路线（#3）。
  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap || !ready) return;
    if (collapsed) return;
    if (mode === "traffic_first" && !flightsConfirmed) return;

    const seq = ++drawSeqRef.current;
    map.remove(overlaysRef.current);
    overlaysRef.current = [];
    if (clusterRef.current) {
      clusterRef.current.setMap(null);
      clusterRef.current = null;
    }

    // 选出激活天（缺省回退到第一个有点的天）。
    const daysWithPts = days.filter((d) =>
      d.stops.some((s) => s.poi.lng != null && s.poi.lat != null),
    );
    const activeDay =
      daysWithPts.find((d) => d.day_index === selectedDayIndex) ?? daysWithPts[0];

    // 非激活天的点：聚合为小灰点，减少重叠（MarkerCluster 不可用时退化为直接打点）。
    const dimData: { lnglat: [number, number] }[] = [];
    for (const day of daysWithPts) {
      if (activeDay && day.day_index === activeDay.day_index) continue;
      for (const s of day.stops) {
        if (s.poi.lng != null && s.poi.lat != null) {
          dimData.push({ lnglat: [s.poi.lng, s.poi.lat] });
        }
      }
    }
    if (dimData.length && AMap.MarkerCluster) {
      clusterRef.current = new AMap.MarkerCluster(map, dimData, {
        gridSize: 60,
        renderMarker: (ctx: AMapAny) => {
          ctx.marker.setContent(dimPinContent());
          ctx.marker.setOffset(new AMap.Pixel(0, 0));
        },
      });
    } else if (dimData.length) {
      for (const d of dimData) {
        const m = new AMap.Marker({
          position: d.lnglat,
          content: dimPinContent(),
          offset: new AMap.Pixel(0, 0),
        });
        overlaysRef.current.push(m);
      }
    }

    // 激活天的点：高亮序号气泡。
    const activeMarkers: AMapAny[] = [];
    if (activeDay) {
      let order = 0;
      for (const s of activeDay.stops) {
        if (s.poi.lng == null || s.poi.lat == null) continue;
        order += 1;
        const marker = new AMap.Marker({
          position: [s.poi.lng, s.poi.lat],
          content: pinContent(order, s.poi.name),
          offset: new AMap.Pixel(0, 0),
          zIndex: 150,
        });
        activeMarkers.push(marker);
        overlaysRef.current.push(marker);
      }
    }
    if (overlaysRef.current.length > 0) map.add(overlaysRef.current);
    // 视野聚焦到激活天的点（无点则保持当前视野）。
    if (activeMarkers.length > 0) {
      map.setFitView(activeMarkers, false, [90, 90, 90, 90]);
    }

    // 仅画激活天的相邻段路线，标注方式+时长，结果回写 SSOT。
    if (activeDay) {
      const dayStops = activeDay.stops.filter(
        (s) => s.poi.lng != null && s.poi.lat != null,
      );
      for (let i = 0; i < dayStops.length - 1; i++) {
        const from = dayStops[i];
        const to = dayStops[i + 1];
        const transit = activeDay.transits.find(
          (t) => t.from_stop_id === from.id && t.to_stop_id === to.id,
        );
        if (!transit) continue;
        const fromPt: [number, number] = [from.poi.lng!, from.poi.lat!];
        const toPt: [number, number] = [to.poi.lng!, to.poi.lat!];
        drawSegment(seq, transit, fromPt, toPt);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, collapsed, reopenNonce, itinerary, selectedDayIndex, mode, flightsConfirmed]);

  function drawSegment(
    seq: number,
    transit: Transit,
    from: [number, number],
    to: [number, number],
  ) {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!AMap || !map) return;
    const transitMode = (transit.mode as TransitMode) ?? "driving";
    const dayId =
      itinerary?.days.find((d) => d.transits.some((t) => t.id === transit.id))?.id ?? 0;
    const sig = `${from[0]},${from[1]}->${to[0]},${to[1]}:${transitMode}`;
    const cached = pathCacheRef.current.get(sig);
    if (cached) {
      paintSegment(transitMode, cached.path, from, to);
      if (transit.duration_seconds == null) {
        applyTransitResult(dayId, transit.id, {
          duration_seconds: cached.duration,
          distance_meters: cached.distance,
        });
      }
      return;
    }

    const onResult = (
      path: [number, number][],
      duration: number | null,
      distance: number | null,
    ) => {
      pathCacheRef.current.set(sig, { path, duration, distance });
      if (seq !== drawSeqRef.current) return;
      paintSegment(transitMode, path, from, to);
      applyTransitResult(dayId, transit.id, {
        duration_seconds: duration,
        distance_meters: distance,
      });
    };

    try {
      if (transitMode === "walking") {
        const walking = new AMap.Walking();
        walking.search(from, to, (status: string, result: AMapAny) => {
          if (status === "complete" && result?.routes?.length) {
            const route = result.routes[0];
            const path: [number, number][] = [];
            for (const step of route.steps) path.push(...step.path);
            onResult(path, route.time ?? null, route.distance ?? null);
          } else {
            onResult([from, to], null, null);
          }
        });
      } else if (transitMode === "transit") {
        const transfer = new AMap.Transfer({ city: primaryDestination || "全国" });
        transfer.search(from, to, (_status: string, result: AMapAny) => {
          const plan = result?.plans?.[0];
          onResult([from, to], plan?.time ?? null, plan?.distance ?? null);
        });
      } else {
        const driving = new AMap.Driving({ policy: AMap.DrivingPolicy.LEAST_TIME, hideMarkers: true });
        driving.search(from, to, (status: string, result: AMapAny) => {
          if (status === "complete" && result?.routes?.length) {
            const route = result.routes[0];
            const path: [number, number][] = [];
            for (const step of route.steps) path.push(...step.path);
            onResult(path, route.time ?? null, route.distance ?? null);
          } else {
            onResult([from, to], null, null);
          }
        });
      }
    } catch {
      onResult([from, to], null, null);
    }
  }

  function paintSegment(
    transitMode: TransitMode,
    path: [number, number][],
    from: [number, number],
    to: [number, number],
  ) {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!AMap || !map) return;
    const color = MODE_COLOR[transitMode];
    const isTransit = transitMode === "transit";
    const line = new AMap.Polyline({
      path: path.length >= 2 ? path : [from, to],
      strokeColor: color,
      strokeWeight: isTransit ? 4 : 5,
      strokeOpacity: 0.9,
      strokeStyle: isTransit ? "dashed" : "solid",
      strokeDasharray: isTransit ? [2, 12] : undefined,
      lineJoin: "round",
      lineCap: "round",
      showDir: !isTransit,
    });
    map.add(line);
    overlaysRef.current.push(line);

    const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const label = new AMap.Text({
      text: MODE_LABEL[transitMode],
      position: mid,
      offset: new AMap.Pixel(0, -12),
      style: {
        background: "#fffdf9",
        border: `1px solid ${color}`,
        color,
        "border-radius": "999px",
        padding: "2px 8px",
        "font-size": "12px",
        "font-weight": "600",
      },
    });
    map.add(label);
    overlaysRef.current.push(label);
  }

  if (loadError) {
    const stops = filledStops(days);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-ivory to-sand p-8 text-center">
        <MapPinned className="h-8 w-8 text-clay" />
        <div className="text-sm font-semibold text-warning">{loadError}</div>
        {stops.length === 0 ? (
          <p className="text-sm text-stone">添加地点后这里会显示坐标列表。</p>
        ) : (
          <ul className="w-full max-w-sm space-y-1 text-left text-sm text-stone">
            {stops.map((s) => (
              <li key={s.stopId}>
                {s.order}. {s.name}（{s.lng.toFixed(3)}, {s.lat.toFixed(3)}）
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
