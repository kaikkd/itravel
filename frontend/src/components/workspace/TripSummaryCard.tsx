import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Moon,
  Plane,
  Sparkles,
  Sun,
  TrainFront,
  Wallet,
} from "lucide-react";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useFlightStore } from "../../store/flightStore";
import { formatMinutes } from "../../lib/flights";
import type { Flight } from "../../types";

// 数字滚动动画：从 0 缓动到目标值。
function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setVal(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function LegIcon({ kind }: { kind: Flight["kind"] }) {
  const Icon = kind === "train" ? TrainFront : Plane;
  return (
    <div className="leg-float flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-clay to-clay-bright text-white shadow-soft">
      <Icon className="h-5 w-5" />
    </div>
  );
}

function LegRow({ label, leg }: { label: string; leg: Flight }) {
  return (
    <div className="flex items-center gap-3">
      <LegIcon kind={leg.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-stone">
          <span className="font-semibold text-clay">{label}</span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {leg.dateLabel}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-ink">
          <span>{leg.departTime}</span>
          <span className="text-stone">{leg.from.city}</span>
          <ArrowRight className="h-3.5 w-3.5 text-stone" />
          <span>{leg.arriveTime}</span>
          <span className="text-stone">{leg.to.city}</span>
        </div>
        <div className="mt-0.5 text-xs text-stone">
          {leg.airline} {leg.flightNo} · {leg.duration} · {leg.baggage}
        </div>
      </div>
      <div className="text-base font-bold text-clay">¥{leg.price}</div>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  unit,
  label,
  i,
}: {
  icon: typeof Sun;
  value: number | string;
  unit?: string;
  label: string;
  i: number;
}) {
  return (
    <div
      className="glass summary-rise rounded-2xl p-3 text-center"
      style={{ ["--i" as string]: i }}
    >
      <Icon className="mx-auto h-4 w-4 text-clay" />
      <div className="mt-1 text-xl font-black text-ink">
        {value}
        {unit && <span className="ml-0.5 text-xs font-semibold text-stone">{unit}</span>}
      </div>
      <div className="text-[11px] text-stone">{label}</div>
    </div>
  );
}

export default function TripSummaryCard() {
  const origin = usePlanFlowStore((s) => s.origin);
  const dest = usePlanFlowStore((s) => s.primaryDestination)();
  const dayCount = usePlanFlowStore((s) => s.dayCount);
  const outbound = useFlightStore((s) => s.outbound);
  const returnFlight = useFlightStore((s) => s.returnFlight);

  const nightCount = Math.max(0, dayCount - 1);
  const totalTransit =
    (outbound?.durationMinutes ?? 0) + (returnFlight?.durationMinutes ?? 0);
  const totalPrice = (outbound?.price ?? 0) + (returnFlight?.price ?? 0);

  const animDays = useCountUp(dayCount);
  const animPrice = useCountUp(totalPrice);

  const nothingPicked = !outbound && !returnFlight;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      {/* 头图 */}
      <div
        className="summary-rise relative overflow-hidden rounded-3xl bg-gradient-to-br from-clay to-clay-bright p-6 text-white shadow-float"
        style={{ ["--i" as string]: 0 }}
      >
        <div className="sheen pointer-events-none absolute inset-0" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            你的行程概览
          </div>
          <div className="mt-3 flex items-center gap-2 font-serif text-3xl font-semibold">
            <MapPin className="h-6 w-6" />
            {origin || "出发地"}
            <ArrowRight className="h-5 w-5 opacity-80" />
            {dest || "目的地"}
          </div>
          <p className="mt-1 text-sm text-white/85">
            {nothingPicked
              ? "在左侧选择去程与返程，这里会实时汇总你的行程。"
              : "已为你汇总所选大交通，确认后即可开始规划每日行程。"}
          </p>
        </div>
      </div>

      {/* 关键指标 */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat icon={Sun} value={animDays} unit="天" label="行程天数" i={1} />
        <Stat icon={Moon} value={nightCount} unit="晚" label="在地住宿" i={2} />
        <Stat
          icon={Clock3}
          value={totalTransit > 0 ? formatMinutes(totalTransit) : "—"}
          label="往返在途"
          i={3}
        />
      </div>

      {/* 已选交通 */}
      <div
        className="glass summary-rise space-y-4 rounded-3xl p-5"
        style={{ ["--i" as string]: 4 }}
      >
        <h3 className="font-serif text-base font-semibold text-ink">已选大交通</h3>
        {outbound ? (
          <LegRow label="去程" leg={outbound} />
        ) : (
          <EmptyLeg label="去程" />
        )}
        <div className="border-t border-dashed border-line" />
        {returnFlight ? (
          <LegRow label="返程" leg={returnFlight} />
        ) : (
          <EmptyLeg label="返程" />
        )}
      </div>

      {/* 费用合计 */}
      <div
        className="summary-rise mt-auto flex items-center justify-between rounded-3xl border border-clay-soft bg-clay-soft/40 p-5"
        style={{ ["--i" as string]: 5 }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Wallet className="h-4 w-4 text-clay" />
          往返交通合计
        </div>
        <div className="text-2xl font-black text-clay">
          ¥{animPrice}
          <span className="ml-1 text-xs font-semibold text-stone">/人</span>
        </div>
      </div>
    </div>
  );
}

function EmptyLeg({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-stone">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-line text-line-strong">
        <Plane className="h-5 w-5" />
      </div>
      <span>
        还没选{label}，去左侧挑一班吧。
      </span>
    </div>
  );
}
