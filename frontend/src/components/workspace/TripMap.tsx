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

function pinContent(order: number, label: string): string {
  return `
    <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;">
      <div style="background:#c96442;color:#fff;font:600 12px/1 Inter,sans-serif;padding:6px 9px;border-radius:999px;box-shadow:0 6px 16px rgba(60,45,30,.28);white-space:nowrap;">
        ${order}. ${label}
      </div>
      <div style="width:2px;height:10px;background:#c96442;"></div>
    </div>`;
}

// 二次贝塞尔上拱弧线：sign 控制偏移方向（去/返程分开）。
function bezierArc(
  from: [number, number],
  to: [number, number],
  sign: number,
): [number, number][] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const lift = dist * 0.26 * sign;
  const cx = mx + nx * lift;
  const cy = my + ny * lift;
  const N = 64;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = 1 - t;
    pts.push([
      a * a * x1 + 2 * a * t * cx + t * t * x2,
      a * a * y1 + 2 * a * t * cy + t * t * y2,
    ]);
  }
  return pts;
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  return (-Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

function planeContent(angleDeg: number): string {
  return `
    <div style="transform:translate(-50%,-50%) rotate(${angleDeg}deg);filter:drop-shadow(0 3px 6px rgba(60,45,30,.35));">
      <svg width="30" height="30" viewBox="0 0 32 32">
        <path d="M30 16 C30 17 29 17.6 27.6 17.8 L20 19 L15.5 27 C15.2 27.6 14.7 28 14 28 L12.4 28 L14.2 19.4 L7.6 20.4 L5.6 23.2 C5.4 23.5 5.1 23.7 4.7 23.7 L3.4 23.7 L4.6 19.2 L3.4 16 L4.6 12.8 L3.4 8.3 L4.7 8.3 C5.1 8.3 5.4 8.5 5.6 8.8 L7.6 11.6 L14.2 12.6 L12.4 4 L14 4 C14.7 4 15.2 4.4 15.5 5 L20 13 L27.6 14.2 C29 14.4 30 15 30 16 Z"
          fill="#c96442" stroke="#fffdf9" stroke-width="0.8" stroke-linejoin="round"/>
      </svg>
    </div>`;
}

// 高铁车头（侧视流线型），按行进方向旋转。
function trainContent(angleDeg: number): string {
  return `
    <div style="transform:translate(-50%,-50%) rotate(${angleDeg}deg);filter:drop-shadow(0 3px 6px rgba(60,45,30,.35));">
      <svg width="34" height="20" viewBox="0 0 34 20">
        <path d="M2 13 L2 8 C2 7 2.6 6.4 3.6 6.2 L18 4 C24 3.2 30 6 33 10 C33.4 10.5 33.4 11.5 33 12 L32 13 Z"
          fill="#3f6f8f" stroke="#fffdf9" stroke-width="0.8" stroke-linejoin="round"/>
        <rect x="6" y="7.5" width="3" height="2.4" rx="0.5" fill="#fffdf9"/>
        <rect x="10.5" y="7.2" width="3" height="2.4" rx="0.5" fill="#fffdf9"/>
        <rect x="15" y="6.9" width="3" height="2.4" rx="0.5" fill="#fffdf9"/>
        <circle cx="9" cy="14.5" r="1.4" fill="#2a2622"/>
        <circle cx="22" cy="14.5" r="1.4" fill="#2a2622"/>
      </svg>
    </div>`;
}

function vehicleContent(kind: string, angleDeg: number): string {
  return kind === "train" ? trainContent(angleDeg) : planeContent(angleDeg);
}

// 平滑缓动：两端慢、中间快，飞行/行进更自然。
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export default function TripMap({ collapsed = false }: { collapsed?: boolean }) {
  const itinerary = useItineraryStore((s) => s.itinerary);
  const applyTransitResult = useItineraryStore((s) => s.applyTransitResult);
  const outbound = useFlightStore((s) => s.outbound);
  const returnFlight = useFlightStore((s) => s.returnFlight);
  const flightsConfirmed = useFlightStore((s) => s.flightsConfirmed);
  const mode = usePlanFlowStore((s) => s.mode);
  const origin = usePlanFlowStore((s) => s.origin);
  const primaryDestination = usePlanFlowStore((s) => s.primaryDestination)();

  const days = itinerary?.days ?? [];

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapAny>(null);
  const amapRef = useRef<AMapAny>(null);
  const overlaysRef = useRef<AMapAny[]>([]);
  const pathCacheRef = useRef<
    Map<string, { path: [number, number][]; duration: number | null; distance: number | null }>
  >(new Map());
  const drawSeqRef = useRef(0);
  const flightOverlaysRef = useRef<AMapAny[]>([]);
  const animatedFlightIdsRef = useRef<Set<string>>(new Set());
  const rafIdsRef = useRef<number[]>([]);
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

  // 机票曲线飞行动画（交通优先、确认前）。
  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap || !ready || collapsed) return;

    if (mode !== "traffic_first" || flightsConfirmed) {
      if (flightOverlaysRef.current.length) {
        map.remove(flightOverlaysRef.current);
        flightOverlaysRef.current = [];
      }
      animatedFlightIdsRef.current.clear();
      return;
    }

    const fromAir = findCity(origin)?.airport ?? outbound?.from;
    const toAir = findCity(primaryDestination)?.airport ?? outbound?.to;
    if (!fromAir || !toAir) return;

    type Leg = {
      id: string;
      kind: string;
      from: [number, number];
      to: [number, number];
      sign: number;
    };
    const legs: Leg[] = [];
    if (outbound) {
      legs.push({
        id: outbound.id,
        kind: outbound.kind,
        from: [fromAir.lng, fromAir.lat],
        to: [toAir.lng, toAir.lat],
        sign: 1,
      });
    }
    if (returnFlight) {
      legs.push({
        id: returnFlight.id,
        kind: returnFlight.kind,
        from: [toAir.lng, toAir.lat],
        to: [fromAir.lng, fromAir.lat],
        sign: 1,
      });
    }

    let fitted = false;
    for (const leg of legs) {
      if (animatedFlightIdsRef.current.has(leg.id)) continue;
      animatedFlightIdsRef.current.add(leg.id);
      // 高铁走近乎贴地的平缓弧（贴铁路直线感），飞机走明显上拱弧。
      const lift = leg.kind === "train" ? 0.06 : 1;
      const pts = bezierArc(leg.from, leg.to, leg.sign * lift);
      if (!fitted) {
        fitted = true;
        const fitLine = new AMap.Polyline({ path: pts, strokeOpacity: 0 });
        map.add(fitLine);
        map.setFitView([fitLine], false, [90, 90, 90, 90]);
        map.remove(fitLine);
      }
      animateArc(pts, leg.kind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, collapsed, mode, flightsConfirmed, outbound?.id, returnFlight?.id, origin, primaryDestination]);

  useEffect(() => {
    return () => {
      rafIdsRef.current.forEach((id) => cancelAnimationFrame(id));
      rafIdsRef.current = [];
    };
  }, []);

  function animateArc(pts: [number, number][], kind = "flight") {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!AMap || !map || pts.length < 2) return;

    const color = kind === "train" ? "#3f6f8f" : "#c96442";
    const offsetY = kind === "train" ? -10 : -14;

    // 渐显尾迹底线（淡）+ 走过的实线，营造拖尾。
    const trail = new AMap.Polyline({
      path: pts,
      strokeColor: color,
      strokeWeight: 2,
      strokeOpacity: 0.18,
      strokeStyle: kind === "train" ? "dashed" : "solid",
      strokeDasharray: kind === "train" ? [6, 6] : undefined,
      lineJoin: "round",
      lineCap: "round",
    });
    map.add(trail);
    flightOverlaysRef.current.push(trail);

    const line = new AMap.Polyline({
      path: [pts[0]],
      strokeColor: color,
      strokeWeight: kind === "train" ? 4 : 3,
      strokeOpacity: 0.95,
      lineJoin: "round",
      lineCap: "round",
    });
    map.add(line);
    flightOverlaysRef.current.push(line);

    const vehicle = new AMap.Marker({
      position: pts[0],
      content: vehicleContent(kind, bearingDeg(pts[0], pts[1])),
      offset: new AMap.Pixel(0, offsetY),
      zIndex: 200,
    });
    map.add(vehicle);
    flightOverlaysRef.current.push(vehicle);

    const segments = pts.length - 1;
    const duration = kind === "train" ? 1900 : 1600;
    const start = performance.now();

    const tick = (now: number) => {
      if (!mapRef.current) return;
      const raw = Math.min(1, (now - start) / duration);
      const p = easeInOut(raw); // 平滑缓动，两端慢中间快（#5）
      const k = Math.max(1, Math.floor(p * segments));
      line.setPath(pts.slice(0, k + 1));
      vehicle.setPosition(pts[k]);
      vehicle.setContent(vehicleContent(kind, bearingDeg(pts[k - 1], pts[k])));
      if (raw < 1) {
        rafIdsRef.current.push(requestAnimationFrame(tick));
        return;
      }
      map.remove(vehicle);
      const apexIndex = Math.floor(pts.length / 2);
      const apex = pts[apexIndex];
      const dir = bearingDeg(pts[apexIndex - 1], pts[apexIndex + 1] ?? apex);
      const stat = new AMap.Marker({
        position: apex,
        content: vehicleContent(kind, dir),
        offset: new AMap.Pixel(0, kind === "train" ? -16 : -22),
        zIndex: 200,
      });
      map.add(stat);
      flightOverlaysRef.current.push(stat);
    };
    rafIdsRef.current.push(requestAnimationFrame(tick));
  }

  // 确认机票后放大到到达地（行程尚空时）。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (mode === "traffic_first" && flightsConfirmed) {
      const city = findCity(primaryDestination);
      if (city) map.setZoomAndCenter(11, [city.lng, city.lat]);
    }
  }, [ready, flightsConfirmed, mode, primaryDestination]);

  // 行程打点 + 路径渲染（每段都渲染所选小交通）。
  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap || !ready) return;
    if (collapsed) return;
    if (mode === "traffic_first" && !flightsConfirmed) return;

    const seq = ++drawSeqRef.current;
    map.remove(overlaysRef.current);
    overlaysRef.current = [];

    const stops = filledStops(days);
    for (const stop of stops) {
      const marker = new AMap.Marker({
        position: [stop.lng, stop.lat],
        content: pinContent(stop.order, stop.name),
        offset: new AMap.Pixel(0, 0),
      });
      overlaysRef.current.push(marker);
    }
    if (overlaysRef.current.length > 0) {
      map.add(overlaysRef.current);
      map.setFitView(overlaysRef.current, false, [80, 80, 80, 80]);
    }

    // 按天相邻 filled 段：渲染路径并标注方式+时长，结果回写 SSOT。
    for (const day of days) {
      const dayStops = day.stops.filter(
        (s) => s.poi.lng != null && s.poi.lat != null,
      );
      for (let i = 0; i < dayStops.length - 1; i++) {
        const from = dayStops[i];
        const to = dayStops[i + 1];
        const transit = day.transits.find(
          (t) => t.from_stop_id === from.id && t.to_stop_id === to.id,
        );
        if (!transit) continue;
        const fromPt: [number, number] = [from.poi.lng!, from.poi.lat!];
        const toPt: [number, number] = [to.poi.lng!, to.poi.lat!];
        drawSegment(seq, transit, fromPt, toPt);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, collapsed, reopenNonce, itinerary, mode, flightsConfirmed]);

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
