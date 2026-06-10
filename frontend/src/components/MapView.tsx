import { useEffect, useRef, useState } from "react";
import { useItineraryStore } from "../store/itineraryStore";
import type { Day, Stop } from "../types";
import { AMapNotConfigured, isAMapConfigured, loadAMap } from "../lib/amap";
import { Alert, Badge, EmptyState } from "./ui";

type AMapAny = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function stopsWithCoords(days: Day[]): Stop[] {
  return days.flatMap((d) =>
    d.stops.filter((s) => s.poi.lng != null && s.poi.lat != null),
  );
}

function dayCoordStops(day: Day): Stop[] {
  return day.stops.filter((s) => s.poi.lng != null && s.poi.lat != null);
}

function MapFallback({ days, note }: { days: Day[]; note: string }) {
  const pts = stopsWithCoords(days);
  return (
    <div className="map-fallback">
      <div>
        <Alert tone="warning">{note}</Alert>
        {pts.length === 0 ? (
          <EmptyState
            title="暂无可打点坐标"
            description="行程中坐标缺失的 POI 会仅在日程表展示。"
          />
        ) : (
          <ul className="map-coordinate-list">
            {pts.map((s) => (
              <li key={s.id}>
                {s.order_index}. {s.poi.name}（{s.poi.lng?.toFixed(4)},{" "}
                {s.poi.lat?.toFixed(4)}）
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function MapView() {
  const itinerary = useItineraryStore((s) => s.itinerary);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapAny>(null);
  const amapRef = useRef<AMapAny>(null);
  const overlaysRef = useRef<AMapAny[]>([]);
  const drawSeqRef = useRef(0);
  const [loadError, setLoadError] = useState<string>("");

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
          zoom: 11,
          center: [104.066, 30.657],
          viewMode: "2D",
        });
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

  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap || !itinerary) return;

    const seq = ++drawSeqRef.current;
    map.remove(overlaysRef.current);
    overlaysRef.current = [];

    const days = itinerary.days;

    for (const stop of stopsWithCoords(days)) {
      const marker = new AMap.Marker({
        position: [stop.poi.lng, stop.poi.lat],
        label: {
          content: `${stop.order_index}. ${stop.poi.name}`,
          direction: "top",
        },
      });
      overlaysRef.current.push(marker);
    }
    if (overlaysRef.current.length > 0) {
      map.add(overlaysRef.current);
      map.setFitView(overlaysRef.current);
    }

    for (const day of days) {
      const coordStops = dayCoordStops(day);
      if (coordStops.length < 2) continue;

      const pts: [number, number][] = coordStops.map((s) => [
        s.poi.lng as number,
        s.poi.lat as number,
      ]);
      const start = pts[0];
      const end = pts[pts.length - 1];
      const waypoints = pts.slice(1, -1);

      const driving = new AMap.Driving({
        policy: AMap.DrivingPolicy.LEAST_TIME,
        hideMarkers: true,
      });

      driving.search(
        start,
        end,
        { waypoints },
        (status: string, result: AMapAny) => {
          if (seq !== drawSeqRef.current) return;
          const m = mapRef.current;
          if (!m) return;

          if (status === "complete" && result?.routes?.length) {
            const path: [number, number][] = [];
            for (const step of result.routes[0].steps) {
              path.push(...step.path);
            }
            const line = new AMap.Polyline({
              path,
              strokeColor: "#2563eb",
              strokeWeight: 5,
              strokeOpacity: 0.9,
              lineJoin: "round",
              lineCap: "round",
            });
            m.add(line);
            overlaysRef.current.push(line);
          } else {
            const line = new AMap.Polyline({
              path: pts,
              strokeColor: "#94a3b8",
              strokeWeight: 3,
              strokeOpacity: 0.85,
              strokeStyle: "dashed",
            });
            m.add(line);
            overlaysRef.current.push(line);
          }
        },
      );
    }
  }, [itinerary]);

  const days = itinerary?.days ?? [];

  if (loadError) {
    return <MapFallback days={days} note={loadError} />;
  }

  if (!itinerary) {
    return (
      <div className="map-empty">
        <EmptyState
          title="地图将在生成行程后联动"
          description="右侧会展示 POI 打点、路线轨迹，以及坐标缺失的局部降级提示。"
        />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Badge>蓝色实线：高德驾车路线</Badge>
        <Badge>灰色虚线：无可达路线兜底</Badge>
      </div>
    </div>
  );
}
