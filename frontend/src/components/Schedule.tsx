import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useItineraryStore } from "../store/itineraryStore";
import type { Category, Day, Stop, Transit } from "../types";
import { Alert, Badge, Button, EmptyState, SkeletonLine } from "./ui";

const CATEGORY_LABEL: Record<Category, string> = {
  eat: "吃",
  stay: "住",
  play: "玩",
};

function SkeletonList({
  pois,
  statusText,
}: {
  pois: { name?: string }[];
  statusText: string;
}) {
  const rows = pois.length > 0 ? pois : Array.from({ length: 4 });
  return (
    <section className="schedule-root">
      <Alert>{statusText || "规划中，正在生成第一批候选地点…"}</Alert>
      <ul className="stop-list">
        {rows.map((p, idx) => {
          const name = (p as { name?: string } | undefined)?.name;
          return (
          <li key={idx} className="stop-row">
            <span className="drag-handle" aria-hidden="true" />
            <div className="stop-main">
              {name ? (
                <div className="stop-heading">
                  <span className="stop-order">{idx + 1}.</span>
                  <strong>{name}</strong>
                  <Badge>候选</Badge>
                </div>
              ) : (
                <>
                  <SkeletonLine width="62%" height={14} />
                  <div style={{ marginTop: 10 }}>
                    <SkeletonLine width="82%" />
                  </div>
                </>
              )}
            </div>
          </li>
          );
        })}
      </ul>
    </section>
  );
}

function StopRow({ stop, onRemove }: { stop: Stop; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stop.id });
  const { poi } = stop;
  const hasCoords = poi.lng != null && poi.lat != null;

  return (
    <li
      ref={setNodeRef}
      className={`stop-row ${isDragging ? "is-dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="拖拽排序"
        className="drag-handle"
      >
        ⠿
      </button>

      <div className="stop-main">
        <div className="stop-heading">
          <span className="stop-order">{stop.order_index}.</span>
          <strong title={poi.name}>{poi.name}</strong>
          <Badge>{CATEGORY_LABEL[poi.category]}</Badge>
          {stop.arrive_time && (
            <Badge>
              {stop.arrive_time}
              {stop.stay_minutes != null ? ` · ${stop.stay_minutes}min` : ""}
            </Badge>
          )}
        </div>
        {poi.rec_reason && <div className="stop-reason">{poi.rec_reason}</div>}
        {poi.sources.length > 0 && (
          <div className="stop-reason">
            来源：
            {poi.sources.map((src, idx) => (
              <a
                key={`${src.url}-${idx}`}
                href={src.url}
                target="_blank"
                rel="noreferrer"
              >
                {idx > 0 ? "、" : ""}
                {src.summary || "公开链接"}
              </a>
            ))}
          </div>
        )}
        {!hasCoords && (
          <div className="stop-warning">坐标缺失，仅列表展示，地图不打点。</div>
        )}
      </div>

      <Button variant="danger" onClick={onRemove} aria-label={`删除 ${poi.name}`}>
        删除
      </Button>
    </li>
  );
}

function TransitRow({ transit }: { transit: Transit | undefined }) {
  const km =
    transit?.distance_meters != null
      ? (transit.distance_meters / 1000).toFixed(1)
      : null;
  const min =
    transit?.duration_seconds != null
      ? Math.max(1, Math.round(transit.duration_seconds / 60))
      : null;
  const modeLabel = transit?.mode === "walking" ? "步行" : "驾车";
  return (
    <div className="transit-row">
      <span className="transit-line" aria-hidden="true" />
      {km != null && min != null ? (
        <span>
          {modeLabel} · {km} km · {min} 分钟
        </span>
      ) : (
        <span>交通估算中…</span>
      )}
    </div>
  );
}

function DayBlock({ day }: { day: Day }) {
  const reorderStops = useItineraryStore((s) => s.reorderStops);
  const removeStop = useItineraryStore((s) => s.removeStop);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = day.stops.findIndex((s) => s.id === active.id);
    const to = day.stops.findIndex((s) => s.id === over.id);
    if (from === -1 || to === -1) return;
    reorderStops(day.id, from, to);
  }

  const transitByFrom = new Map(day.transits.map((t) => [t.from_stop_id, t]));

  return (
    <article className="day-block">
      <div className="day-title">
        <h3>第 {day.day_index} 天</h3>
        <Badge>{day.stops.length} 个地点</Badge>
      </div>
      {day.stops.length === 0 ? (
        <EmptyState
          title="这一天还没有安排"
          description="从底部候选卡片流加入地点，或者重新生成规划草案。"
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={day.stops.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="stop-list">
              {day.stops.map((stop, idx) => (
                <li key={stop.id} style={{ listStyle: "none" }}>
                  <StopRow stop={stop} onRemove={() => removeStop(day.id, stop.id)} />
                  {idx < day.stops.length - 1 && (
                    <TransitRow transit={transitByFrom.get(stop.id)} />
                  )}
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </article>
  );
}

export default function Schedule() {
  const itinerary = useItineraryStore((s) => s.itinerary);
  const phase = useItineraryStore((s) => s.phase);
  const statusText = useItineraryStore((s) => s.statusText);
  const skeleton = useItineraryStore((s) => s.skeleton);
  const degraded = useItineraryStore((s) => s.degraded);
  const selectedDayIndex = useItineraryStore((s) => s.selectedDayIndex);
  const setSelectedDay = useItineraryStore((s) => s.setSelectedDay);

  if (phase === "streaming" && !itinerary) {
    return <SkeletonList pois={skeleton} statusText={statusText} />;
  }

  if (!itinerary) {
    if (phase === "error") {
      return (
        <EmptyState
          title="规划失败"
          description="规划流连接中断，请检查后端服务后重新提交。"
        />
      );
    }
    return (
      <EmptyState
        title="还没有行程"
        description="在上方描述目的地和偏好，生成第一份可编辑草案。"
      />
    );
  }

  return (
    <section className="schedule-root">
      <div className="schedule-header">
        <p className="section-kicker">当前草案</p>
        <h2>{itinerary.title}</h2>
        <div className="chip-row">
          <Badge>{itinerary.city}</Badge>
          <Badge>{itinerary.day_count} 天</Badge>
          <Badge tone={itinerary.status === "saved" ? "success" : "warning"}>
            {itinerary.status === "saved" ? "已保存" : "草稿"}
          </Badge>
        </div>
      </div>

      {degraded && (
        <Alert tone="warning">AI 暂不可用，已用热门推荐兜底，行程仍可编辑。</Alert>
      )}

      <div className="day-tabs">
        <span className="section-kicker">候选卡片加入到</span>
        <select
          className="form-input"
          value={selectedDayIndex}
          onChange={(e) => setSelectedDay(Number(e.target.value))}
          style={{ width: 132, minHeight: 38 }}
        >
          {itinerary.days.map((d) => (
            <option key={d.id} value={d.day_index}>
              第 {d.day_index} 天
            </option>
          ))}
        </select>
      </div>

      {itinerary.days.map((day) => (
        <DayBlock key={day.id} day={day} />
      ))}
    </section>
  );
}
