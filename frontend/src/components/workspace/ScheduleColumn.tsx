import { useEffect } from "react";
import {
  Car,
  Clock3,
  Coffee,
  Footprints,
  GripVertical,
  Hotel,
  MapPin,
  Sparkles,
  TrainFront,
  Undo2,
  Utensils,
  X,
} from "lucide-react";
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
import { useStore } from "zustand";
import { Badge } from "../ui/badge";
import { useItineraryStore, useTemporalStore } from "../../store/itineraryStore";
import type { Category, Day, Stop, Transit, TransitMode } from "../../types";

const CATEGORY_LABEL: Record<Category, string> = { eat: "吃", stay: "住", play: "玩" };
const CATEGORY_VARIANT: Record<Category, "clay" | "moss" | "sky"> = {
  play: "sky",
  eat: "clay",
  stay: "moss",
};
const CATEGORY_ICON: Record<Category, typeof Utensils> = {
  eat: Utensils,
  stay: Hotel,
  play: MapPin,
};

const MODES: { mode: TransitMode; icon: typeof Car; label: string }[] = [
  { mode: "driving", icon: Car, label: "驾车" },
  { mode: "transit", icon: TrainFront, label: "公共交通" },
  { mode: "walking", icon: Footprints, label: "步行" },
];

function formatDuration(sec: number | null): string {
  if (sec == null) return "算时长";
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} 分钟`;
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分`;
}

export default function ScheduleColumn() {
  const itinerary = useItineraryStore((s) => s.itinerary);
  const phase = useItineraryStore((s) => s.phase);
  const degraded = useItineraryStore((s) => s.degraded);
  const skeleton = useItineraryStore((s) => s.skeleton);
  const removeStop = useItineraryStore((s) => s.removeStop);
  const reorderStops = useItineraryStore((s) => s.reorderStops);
  const setTransitMode = useItineraryStore((s) => s.setTransitMode);
  const undo = useStore(useTemporalStore, (s) => s.undo);
  const pastStates = useStore(useTemporalStore, (s) => s.pastStates);

  // Ctrl/Cmd+Z 撤销结构变更（PRD §13.4）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const streaming = phase === "streaming";
  const totalStops =
    itinerary?.days.reduce((n, d) => n + d.stops.length, 0) ?? 0;
  const empty = phase === "idle" || (!streaming && totalStops === 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">行程表</h2>
          <p className="text-xs text-stone">
            {streaming
              ? "itravel 正在为你编排每日时间轴…"
              : totalStops > 0
                ? "拖动卡片可调整顺序，⌘/Ctrl+Z 撤销。"
                : "先和 itravel 聊聊，行程会出现在这里。"}
          </p>
        </div>
        {pastStates.length > 0 && (
          <button
            onClick={() => undo()}
            title="撤销"
            className="flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-stone transition-colors hover:border-clay hover:text-clay"
          >
            <Undo2 className="h-3.5 w-3.5" />
            撤销
          </button>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {degraded && (
          <div className="rounded-2xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            AI 暂不可用，已用热门地点兜底，仍可自由调整。
          </div>
        )}

        {empty && <EmptyState />}

        {streaming && skeleton && totalStops === 0 && (
          <SkeletonDays count={skeleton.day_count} />
        )}

        {itinerary?.days.map((day) => (
          <DayBlock
            key={day.id}
            day={day}
            onRemove={(stopId) => removeStop(day.id, stopId)}
            onReorder={(from, to) => reorderStops(day.id, from, to)}
            onSetMode={(transitId, mode) => setTransitMode(day.id, transitId, mode)}
            streaming={streaming}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clay-soft text-clay">
        <Sparkles className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-ink">还没有行程</p>
      <p className="max-w-xs text-xs text-stone">
        在下方对话框描述你的旅行，比如「成都耍三天，爱吃辣，想轻松点」，
        itravel 会为你排好每天的吃住玩。
      </p>
    </div>
  );
}

function SkeletonDays({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, di) => (
        <section
          key={di}
          className="rounded-3xl border border-line bg-ivory/60 p-4"
          style={{ ["--i"]: di } as React.CSSProperties}
        >
          <div className="skeleton mb-3 h-5 w-24 rounded-full" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function DayBlock({
  day,
  onRemove,
  onReorder,
  onSetMode,
  streaming,
}: {
  day: Day;
  onRemove: (stopId: number) => void;
  onReorder: (from: number, to: number) => void;
  onSetMode: (transitId: number, mode: TransitMode) => void;
  streaming: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const transitBetween = (fromId: number, toId: number): Transit | undefined =>
    day.transits.find((t) => t.from_stop_id === fromId && t.to_stop_id === toId);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = day.stops.findIndex((s) => s.id === active.id);
    const to = day.stops.findIndex((s) => s.id === over.id);
    if (from !== -1 && to !== -1) onReorder(from, to);
  }

  return (
    <section
      className="rounded-3xl border border-line bg-ivory/60 p-4"
      style={{ ["--i"]: day.day_index - 1 } as React.CSSProperties}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-base font-semibold text-ink">
          第 {day.day_index} 天
        </h3>
        <Badge variant="soft">{day.stops.length} 个安排</Badge>
      </div>

      {day.stops.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-6 text-center text-xs text-stone">
          {streaming ? "编排中…" : "这一天还空着"}
        </div>
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
            <div className="space-y-1">
              {day.stops.map((stop, i) => {
                const prev = i > 0 ? day.stops[i - 1] : null;
                const transit = prev ? transitBetween(prev.id, stop.id) : null;
                return (
                  <div key={stop.id}>
                    {transit && (
                      <TransitRow
                        transit={transit}
                        onSetMode={(mode) => onSetMode(transit.id, mode)}
                      />
                    )}
                    <SortableStop
                      stop={stop}
                      order={i + 1}
                      onRemove={() => onRemove(stop.id)}
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function SortableStop({
  stop,
  order,
  onRemove,
}: {
  stop: Stop;
  order: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stop.id });
  const Icon = CATEGORY_ICON[stop.poi.category] ?? MapPin;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ["--i" as string]: order - 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`stop-drop flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-soft ${
        isDragging ? "dragging" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-1 cursor-grab touch-none text-line-strong transition-colors hover:text-stone active:cursor-grabbing"
        aria-label="拖拽排序"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-xs font-bold text-white">
        {order}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant={CATEGORY_VARIANT[stop.poi.category]}>
            <Icon className="mr-0.5 h-3 w-3" />
            {CATEGORY_LABEL[stop.poi.category]}
          </Badge>
          <span className="truncate font-semibold text-ink">{stop.poi.name}</span>
          {stop.arrive_time && (
            <span className="ml-auto flex items-center gap-1 text-xs text-stone">
              <Coffee className="h-3 w-3" />
              {stop.arrive_time}
            </span>
          )}
        </div>
        {stop.poi.rec_reason && (
          <p className="mt-1 text-sm text-stone">{stop.poi.rec_reason}</p>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs text-stone">
          {stop.stay_minutes != null && <span>停留约 {stop.stay_minutes} 分钟</span>}
          {stop.poi.address && <span className="truncate">{stop.poi.address}</span>}
        </div>
        {stop.poi.lng == null && (
          <p className="mt-1 text-xs text-warning">坐标缺失，地图不打点。</p>
        )}
      </div>
      <button
        onClick={onRemove}
        className="rounded-full p-1 text-stone transition-colors hover:bg-sand hover:text-ink"
        aria-label="移除"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function TransitRow({
  transit,
  onSetMode,
}: {
  transit: Transit;
  onSetMode: (mode: TransitMode) => void;
}) {
  const mode = (transit.mode as TransitMode) ?? "driving";
  return (
    <div className="my-1 ml-3.5 flex items-center gap-2 border-l-2 border-dashed border-line-strong py-1 pl-4">
      <div className="flex items-center gap-1 rounded-full bg-sand p-0.5">
        {MODES.map(({ mode: m, icon: Icon, label }) => (
          <button
            key={m}
            onClick={() => onSetMode(m)}
            title={label}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
              mode === m ? "bg-surface text-clay shadow-soft" : "text-stone hover:text-ink"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <span className="flex h-7 items-center gap-1 rounded-full border border-line bg-surface px-2 text-xs font-semibold text-stone">
        <Clock3 className="h-3.5 w-3.5" />
        {formatDuration(transit.duration_seconds)}
      </span>
    </div>
  );
}
