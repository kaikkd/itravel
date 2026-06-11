import { useState } from "react";
import {
  Car,
  Clock3,
  Footprints,
  MapPin,
  Plus,
  Sparkles,
  TrainFront,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { DEFAULT_TRANSIT, transitKey, useTripStore } from "../../store/tripStore";
import type { Category, SuggestionPoi, TransitMode, TripDay } from "../../types";

const CATEGORY_LABEL: Record<Category, string> = { eat: "吃", stay: "住", play: "玩" };
const CATEGORY_VARIANT: Record<Category, "clay" | "moss" | "sky"> = {
  play: "sky",
  eat: "clay",
  stay: "moss",
};

const MODES: { mode: TransitMode; icon: typeof Car; label: string }[] = [
  { mode: "driving", icon: Car, label: "驾车" },
  { mode: "transit", icon: TrainFront, label: "公共交通" },
  { mode: "walking", icon: Footprints, label: "步行" },
];

function formatDuration(sec: number | null): string {
  if (sec == null) return "";
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} 分钟`;
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分`;
}

export default function ScheduleColumn() {
  const days = useTripStore((s) => s.days);
  const suggestions = useTripStore((s) => s.suggestions);
  const hasSuggestions = useTripStore((s) => s.hasSuggestions);
  const transits = useTripStore((s) => s.transits);
  const fillSlot = useTripStore((s) => s.fillSlot);
  const clearSlot = useTripStore((s) => s.clearSlot);
  const addSlot = useTripStore((s) => s.addSlot);
  const removeSlot = useTripStore((s) => s.removeSlot);
  const setTransitMode = useTripStore((s) => s.setTransitMode);
  const requestTransit = useTripStore((s) => s.requestTransit);

  const [openSlot, setOpenSlot] = useState<{ dayIndex: number; slotId: string } | null>(
    null,
  );

  const activeCandidates: SuggestionPoi[] = openSlot
    ? suggestions[openSlot.dayIndex] ?? []
    : [];
  const usedNames = openSlot
    ? new Set(
        (days.find((d) => d.dayIndex === openSlot.dayIndex)?.slots ?? [])
          .map((s) => s.poi?.name)
          .filter(Boolean) as string[],
      )
    : new Set<string>();

  function pickCandidate(poi: SuggestionPoi) {
    if (!openSlot) return;
    fillSlot(openSlot.dayIndex, openSlot.slotId, {
      name: poi.name,
      category: poi.category,
      lng: poi.lng,
      lat: poi.lat,
      address: poi.address,
      rec_reason: poi.rec_reason,
    });
    setOpenSlot(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink">行程表</h2>
        <p className="text-xs text-stone">
          {hasSuggestions
            ? "点击闪烁的空位，从 itravel 候选里挑选地点。"
            : "先和 itravel 聊聊，候选会出现在这里。"}
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {days.map((day) => (
          <DayBlock
            key={day.dayIndex}
            day={day}
            hasSuggestions={hasSuggestions}
            hasCandidates={(suggestions[day.dayIndex] ?? []).length > 0}
            transits={transits}
            onOpenSlot={(slotId) => setOpenSlot({ dayIndex: day.dayIndex, slotId })}
            onClearSlot={(slotId) => clearSlot(day.dayIndex, slotId)}
            onAddSlot={() => addSlot(day.dayIndex)}
            onRemoveSlot={(slotId) => removeSlot(day.dayIndex, slotId)}
            onSetMode={(slotId, mode) => setTransitMode(day.dayIndex, slotId, mode)}
            onCompute={(slotId) => requestTransit(day.dayIndex, slotId)}
          />
        ))}
      </div>

      <Dialog open={openSlot != null} onOpenChange={(o) => !o && setOpenSlot(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>选择一个地点</DialogTitle>
            <DialogDescription>
              来自 itravel 的候选，点选后即加入行程并在地图打点。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {activeCandidates.length === 0 && (
              <p className="text-sm text-stone">这一天还没有候选，回到对话框补充偏好。</p>
            )}
            {activeCandidates.map((poi) => {
              const used = usedNames.has(poi.name);
              return (
                <button
                  key={poi.name}
                  disabled={used}
                  onClick={() => pickCandidate(poi)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${
                    used
                      ? "cursor-not-allowed border-line bg-sand opacity-60"
                      : "border-line bg-surface hover:border-clay"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={CATEGORY_VARIANT[poi.category]}>
                      {CATEGORY_LABEL[poi.category]}
                    </Badge>
                    <span className="font-semibold text-ink">{poi.name}</span>
                    {used && <span className="text-xs text-stone">已加入</span>}
                  </div>
                  {poi.rec_reason && (
                    <p className="mt-1.5 text-sm text-stone">{poi.rec_reason}</p>
                  )}
                  {poi.address && (
                    <p className="mt-1 text-xs text-stone">{poi.address}</p>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DayBlock({
  day,
  hasSuggestions,
  hasCandidates,
  transits,
  onOpenSlot,
  onClearSlot,
  onAddSlot,
  onRemoveSlot,
  onSetMode,
  onCompute,
}: {
  day: TripDay;
  hasSuggestions: boolean;
  hasCandidates: boolean;
  transits: Record<string, { mode: TransitMode; durationSeconds: number | null; showPath: boolean }>;
  onOpenSlot: (slotId: string) => void;
  onClearSlot: (slotId: string) => void;
  onAddSlot: () => void;
  onRemoveSlot: (slotId: string) => void;
  onSetMode: (slotId: string, mode: TransitMode) => void;
  onCompute: (slotId: string) => void;
}) {
  const filledCount = day.slots.filter((s) => s.poi).length;
  let order = 0;
  let prevFilledId: string | null = null;

  return (
    <section className="rounded-3xl border border-line bg-ivory/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-base font-semibold text-ink">{day.label}</h3>
        <Badge variant="soft">{filledCount} 个地点</Badge>
      </div>

      <div className="space-y-2">
        {day.slots.map((slot) => {
          if (slot.poi) {
            order += 1;
            const fromId = prevFilledId;
            prevFilledId = slot.id;
            const transit = fromId
              ? transits[transitKey(day.dayIndex, fromId)] ?? DEFAULT_TRANSIT
              : null;
            return (
              <div key={slot.id}>
                {fromId && transit && (
                  <TransitRow
                    transit={transit}
                    onSetMode={(mode) => onSetMode(fromId, mode)}
                    onCompute={() => onCompute(fromId)}
                  />
                )}
                <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-xs font-bold text-white">
                    {order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={CATEGORY_VARIANT[slot.poi.category]}>
                        {CATEGORY_LABEL[slot.poi.category]}
                      </Badge>
                      <span className="truncate font-semibold text-ink">
                        {slot.poi.name}
                      </span>
                    </div>
                    {slot.poi.rec_reason && (
                      <p className="mt-1 text-sm text-stone">{slot.poi.rec_reason}</p>
                    )}
                    {slot.poi.lng == null && (
                      <p className="mt-1 text-xs text-warning">坐标缺失，地图不打点。</p>
                    )}
                  </div>
                  <button
                    onClick={() => onClearSlot(slot.id)}
                    className="rounded-full p-1 text-stone hover:bg-sand hover:text-ink"
                    aria-label="移除"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          }

          const flashing = hasSuggestions && hasCandidates;
          return (
            <div key={slot.id} className="flex items-stretch gap-2">
              <button
                onClick={() => onOpenSlot(slot.id)}
                disabled={!flashing}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-medium transition-all ${
                  flashing
                    ? "slot-flash cursor-pointer border-clay-soft text-clay"
                    : "cursor-default border-line text-stone"
                }`}
              >
                {flashing ? (
                  <>
                    <Sparkles className="h-4 w-4" />
                    点击添加地点
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4" />
                    等待 itravel 候选
                  </>
                )}
              </button>
              <button
                onClick={() => onRemoveSlot(slot.id)}
                title="删除该位置"
                aria-label="删除该位置"
                className="flex w-10 shrink-0 items-center justify-center rounded-2xl border border-line text-stone transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={onAddSlot}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-stone hover:text-clay"
      >
        <Plus className="h-3 w-3" />
        增加一个位置
      </button>
    </section>
  );
}

function TransitRow({
  transit,
  onSetMode,
  onCompute,
}: {
  transit: { mode: TransitMode; durationSeconds: number | null; showPath: boolean };
  onSetMode: (mode: TransitMode) => void;
  onCompute: () => void;
}) {
  const computing = transit.showPath && transit.durationSeconds == null;
  return (
    <div className="my-1 ml-3.5 flex items-center gap-2 border-l-2 border-dashed border-line-strong py-1 pl-4">
      <div className="flex items-center gap-1 rounded-full bg-sand p-0.5">
        {MODES.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => onSetMode(mode)}
            title={label}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
              transit.mode === mode
                ? "bg-surface text-clay shadow-soft"
                : "text-stone hover:text-ink"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <button
        onClick={onCompute}
        title="计算耗时"
        className="flex h-7 items-center gap-1 rounded-full border border-line bg-surface px-2 text-xs font-semibold text-stone hover:border-clay hover:text-clay"
      >
        <Clock3 className="h-3.5 w-3.5" />
        {computing
          ? "计算中…"
          : transit.durationSeconds != null
            ? formatDuration(transit.durationSeconds)
            : "算时长"}
      </button>
    </div>
  );
}
