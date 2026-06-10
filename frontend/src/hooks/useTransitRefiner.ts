import { useEffect, useRef } from "react";
import { recomputeTransits } from "../api/client";
import { useItineraryStore, useTemporalStore } from "../store/itineraryStore";
import type { Day, Stop, Transit } from "../types";

// 增量交通重算 + 竞态控制（dev_doc §5.1 / §5.3）：
// itinerary 变化 → 防抖 300ms → 仅取需要刷新的相邻段批量调后端 → seq 丢弃过期响应。
// 写回用 temporal.pause/resume 包裹，精算结果不进 Undo 栈。

const DEBOUNCE_MS = 300;

function stopById(day: Day, id: number): Stop | undefined {
  return day.stops.find((s) => s.id === id);
}

// 需要刷新的段：距离为空（新建/拖拽后 relink 占位），或步行模式（M3 占位）需升级为驾车精算
function pendingSegments(day: Day): Transit[] {
  return day.transits.filter((t) => t.distance_meters == null || t.mode !== "driving");
}

export function useTransitRefiner(): void {
  const itinerary = useItineraryStore((s) => s.itinerary);
  const applyTransits = useItineraryStore((s) => s.applyTransits);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!itinerary) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const seq = ++seqRef.current;

      for (const day of itinerary.days) {
        const pending = pendingSegments(day);
        if (pending.length === 0) continue;

        const segments = pending.map((t) => {
          const from = stopById(day, t.from_stop_id);
          const to = stopById(day, t.to_stop_id);
          return {
            from_lng: from?.poi.lng ?? null,
            from_lat: from?.poi.lat ?? null,
            to_lng: to?.poi.lng ?? null,
            to_lat: to?.poi.lat ?? null,
            mode: "driving",
          };
        });

        const dayId = day.id;
        const segMeta = pending.map((t) => ({
          from_stop_id: t.from_stop_id,
          to_stop_id: t.to_stop_id,
        }));

        recomputeTransits(segments)
          .then((results) => {
            // 过期响应（用户已再次编辑）→ 丢弃，最终态以 Store 为准（§5.3）
            if (seq !== seqRef.current) return;
            const fresh: Transit[] = results.map((r, i) => ({
              id: 0,
              from_stop_id: segMeta[i].from_stop_id,
              to_stop_id: segMeta[i].to_stop_id,
              mode: "driving",
              distance_meters: r.distance_meters,
              duration_seconds: r.duration_seconds,
              polyline: null,
            }));
            // 精算写回不入 Undo 栈
            useTemporalStore.getState().pause();
            applyTransits(dayId, fresh);
            useTemporalStore.getState().resume();
          })
          .catch(() => {
            // 重算失败 → 保留本地估算占位，不阻断
          });
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [itinerary, applyTransits]);
}
