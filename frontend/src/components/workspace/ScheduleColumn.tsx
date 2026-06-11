import { useState } from "react";
import {
  Car,
  Clock3,
  Footprints,
  GripVertical,
  Hotel,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  TrainFront,
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
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { fetchCandidates } from "../../api/client";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useItineraryStore } from "../../store/itineraryStore";
import type { Category, Day, POI, Stop, Transit, TransitMode } from "../../types";

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
  const selectCandidate = useItineraryStore((s) => s.selectCandidate);
  const selectedDayIndex = useItineraryStore((s) => s.selectedDayIndex);
  const setSelectedDay = useItineraryStore((s) => s.setSelectedDay);
  const city = usePlanFlowStore((s) => s.primaryDestination)();

  // 手动加点弹窗（#1）：记录目标天，拉候选供挑选。
  const [addDay, setAddDay] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<POI[]>([]);
  const [loadingCands, setLoadingCands] = useState(false);

  function openAdd(dayIndex: number) {
    setAddDay(dayIndex);
    setLoadingCands(true);
    setCandidates([]);
    fetchCandidates(city, { limit: 10 })
      .then((r) => setCandidates(r.pois))
      .catch(() => setCandidates([]))
      .finally(() => setLoadingCands(false));
  }

  function pickCandidate(poi: POI) {
    if (addDay == null) return;
    selectCandidate(poi, addDay);
    setAddDay(null);
  }

  const streaming = phase === "streaming";
  const totalStops = itinerary?.days.reduce((n, d) => n + d.stops.length, 0) ?? 0;
  const empty = phase === "idle" || (!streaming && totalStops === 0);

  const usedNames = new Set(
    addDay != null
      ? (itinerary?.days.find((d) => d.day_index === addDay)?.stops ?? []).map(
          (s) => s.poi.name,
        )
      : [],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 py-1">
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
            active={day.day_index === selectedDayIndex}
            onActivate={() => setSelectedDay(day.day_index)}
            onRemove={(stopId) => removeStop(day.id, stopId)}
            onReorder={(from, to) => reorderStops(day.id, from, to)}
            onSetMode={(transitId, mode) => setTransitMode(day.id, transitId, mode)}
            onAdd={() => openAdd(day.day_index)}
            streaming={streaming}
          />
        ))}
      </div>

      {/* 手动加点弹窗 */}
      <Dialog open={addDay != null} onOpenChange={(o) => !o && setAddDay(null)}>
        <DialogContent className="max-w-lg border-line bg-surface">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-ink">
              给第 {addDay} 天添加地点
            </DialogTitle>
            <DialogDescription className="text-stone">
              来自 itravel 的「{city}」候选，点选后加入当天并在地图打点。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[56vh] space-y-2 overflow-y-auto">
            {loadingCands && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在找好地方…
              </div>
            )}
            {!loadingCands && candidates.length === 0 && (
              <p className="py-10 text-center text-sm text-stone">
                暂无候选，确认后端在运行后重试。
              </p>
            )}
            {candidates.map((poi) => {
              const used = usedNames.has(poi.name);
              const Icon = CATEGORY_ICON[poi.category] ?? MapPin;
              return (
                <button
                  key={poi.name}
                  disabled={used}
                  onClick={() => pickCandidate(poi)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                    used
                      ? "cursor-not-allowed border-line bg-sand opacity-60"
                      : "border-line bg-surface hover:-translate-y-0.5 hover:border-clay"
                  }`}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay-soft text-clay">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={CATEGORY_VARIANT[poi.category]}>
                        {CATEGORY_LABEL[poi.category]}
                      </Badge>
                      <span className="font-semibold text-ink">{poi.name}</span>
                      {used && <span className="text-xs text-stone">已在行程</span>}
                    </div>
                    {poi.rec_reason && (
                      <p className="mt-1 text-sm text-stone">{poi.rec_reason}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
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
  active,
  onActivate,
  onRemove,
  onReorder,
  onSetMode,
  onAdd,
  streaming,
}: {
  day: Day;
  active: boolean;
  onActivate: () => void;
  onRemove: (stopId: number) => void;
  onReorder: (from: number, to: number) => void;
  onSetMode: (transitId: number, mode: TransitMode) => void;
  onAdd: () => void;
  streaming: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const transitBetween = (fromId: number, toId: number): Transit | undefined =>
    day.transits.find((t) => t.from_stop_id === fromId && t.to_stop_id === toId);

  function handleDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const from = day.stops.findIndex((s) => s.id === a.id);
    const to = day.stops.findIndex((s) => s.id === over.id);
    if (from !== -1 && to !== -1) onReorder(from, to);
  }

  return (
    <section
      onClick={onActivate}
      className={`day-enter cursor-pointer overflow-hidden rounded-3xl border bg-ivory/50 transition-all ${
        active
          ? "border-clay shadow-soft ring-1 ring-clay/30"
          : "border-line hover:border-clay-soft"
      }`}
      style={{ ["--i"]: day.day_index - 1 } as React.CSSProperties}
    >
      {/* 醒目的天标题，营造 schedule 的层次（#2）；点击聚焦该天地图（#3） */}
      <div
        className={`flex items-center justify-between px-4 py-3 ${
          active
            ? "bg-gradient-to-r from-clay/18 to-transparent"
            : "bg-gradient-to-r from-clay/10 to-transparent"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-clay text-sm font-black text-white shadow-soft">
            D{day.day_index}
          </span>
          <h3 className="font-serif text-base font-semibold text-ink">
            第 {day.day_index} 天
          </h3>
          {active && (
            <span className="rounded-full bg-clay/15 px-2 py-0.5 text-[11px] font-semibold text-clay">
              地图显示中
            </span>
          )}
        </div>
        <Badge variant="soft">{day.stops.length} 个安排</Badge>
      </div>

      <div className="px-4 pb-4 pt-3">
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
              {/* 时间轴左竖线 */}
              <div className="relative space-y-1 pl-1">
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

        <button
          onClick={onAdd}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-2.5 text-xs font-semibold text-stone transition-colors hover:border-clay hover:text-clay"
        >
          <Plus className="h-3.5 w-3.5" />
          给这天加地点
        </button>
      </div>
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

  // dnd-kit 的 transform 独占外层元素；进场动画放到内层 wrapper，避免冲突（#2 修复）。
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={`relative ${isDragging ? "z-10" : ""}`}
    >
      <div
        className={`stop-card flex items-start gap-2 rounded-2xl border border-line bg-surface p-3 shadow-soft ${
          isDragging ? "dragging" : ""
        }`}
        style={{ ["--i" as string]: order - 1 }}
      >
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 flex h-8 w-6 cursor-grab touch-none items-center justify-center text-line-strong transition-colors hover:text-stone active:cursor-grabbing"
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
              <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-clay">
                <Clock3 className="h-3 w-3" />
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
    <div className="my-1 ml-4 flex items-center gap-2 border-l-2 border-dashed border-line-strong py-1 pl-4">
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
