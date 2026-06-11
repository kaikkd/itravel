import { useMemo } from "react";
import {
  CalendarDays,
  Check,
  Luggage,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  TrainFront,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  defaultDepartDate,
  outboundFlights,
  outboundTrains,
  returnFlights,
  returnTrains,
} from "../../lib/flights";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useFlightStore } from "../../store/flightStore";
import type { Flight, TravelMode } from "../../types";

function ModeToggle({
  value,
  onChange,
}: {
  value: TravelMode;
  onChange: (m: TravelMode) => void;
}) {
  const opts: { mode: TravelMode; icon: typeof Plane; label: string }[] = [
    { mode: "flight", icon: Plane, label: "飞机" },
    { mode: "train", icon: TrainFront, label: "高铁" },
  ];
  return (
    <div className="inline-flex rounded-full bg-sand p-1">
      {opts.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
            value === mode ? "bg-surface text-clay shadow-soft" : "text-stone hover:text-ink"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function TicketRow({
  ticket,
  selected,
  onSelect,
}: {
  ticket: Flight;
  selected: boolean;
  onSelect: () => void;
}) {
  const isTrain = ticket.kind === "train";
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 ${
        selected
          ? "border-clay bg-clay-soft/50 shadow-soft"
          : "border-line bg-surface hover:border-clay-soft"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="soft">{ticket.platform}</Badge>
          <span className="text-sm font-semibold text-ink">
            {ticket.airline} {ticket.flightNo}
          </span>
        </div>
        <div className="text-lg font-bold text-clay">¥{ticket.price}</div>
      </div>
      <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-stone">
        <CalendarDays className="h-3 w-3" />
        {ticket.dateLabel}
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm text-ink">
        <span className="font-semibold">{ticket.departTime}</span>
        <span className="flex flex-1 items-center">
          <span className="flex-1 border-t border-dashed border-line-strong" />
          {isTrain ? (
            <TrainFront className="mx-1 h-3.5 w-3.5 text-stone" />
          ) : (
            <Plane className="mx-1 h-3.5 w-3.5 text-stone" />
          )}
          <span className="flex-1 border-t border-dashed border-line-strong" />
        </span>
        <span className="text-xs text-stone">{ticket.duration}</span>
        <span className="flex-1 border-t border-dashed border-line-strong" />
        <span className="font-semibold">{ticket.arriveTime}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-stone">
        <span>
          {ticket.from.code} {ticket.from.city} → {ticket.to.city} {ticket.to.code}
        </span>
        <span className="inline-flex items-center gap-1">
          <Luggage className="h-3 w-3" />
          {ticket.baggage}
        </span>
      </div>
      <div className="mt-2 text-xs text-stone">{ticket.dateNote}</div>
      {selected && (
        <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-clay">
          <Check className="h-3 w-3" />
          已选择
        </div>
      )}
    </button>
  );
}

export default function FlightBoard() {
  const origin = usePlanFlowStore((s) => s.origin);
  const primaryDestination = usePlanFlowStore((s) => s.primaryDestination)();
  const dayCount = usePlanFlowStore((s) => s.dayCount);
  const outboundMode = useFlightStore((s) => s.outboundMode);
  const returnMode = useFlightStore((s) => s.returnMode);
  const outbound = useFlightStore((s) => s.outbound);
  const returnFlight = useFlightStore((s) => s.returnFlight);
  const setOutboundMode = useFlightStore((s) => s.setOutboundMode);
  const setReturnMode = useFlightStore((s) => s.setReturnMode);
  const setOutbound = useFlightStore((s) => s.setOutbound);
  const setReturnFlight = useFlightStore((s) => s.setReturnFlight);
  const confirmFlights = useFlightStore((s) => s.confirmFlights);

  // 出发日默认今天+7；返程日 = 出发日 + (天数-1)。
  const departDate = useMemo(() => defaultDepartDate(), []);
  const returnDate = useMemo(() => {
    const d = new Date(departDate);
    d.setDate(d.getDate() + Math.max(0, dayCount - 1));
    return d;
  }, [departDate, dayCount]);

  const outList = useMemo(
    () =>
      outboundMode === "flight"
        ? outboundFlights(origin, primaryDestination, departDate)
        : outboundTrains(origin, primaryDestination, departDate),
    [origin, primaryDestination, outboundMode, departDate],
  );
  const retList = useMemo(
    () =>
      returnMode === "flight"
        ? returnFlights(origin, primaryDestination, returnDate)
        : returnTrains(origin, primaryDestination, returnDate),
    [origin, primaryDestination, returnMode, returnDate],
  );

  const canConfirm = Boolean(outbound && returnFlight);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <div>
        <Badge variant="clay">交通优先 · 先定大交通</Badge>
        <h2 className="mt-2 text-xl font-semibold text-ink">
          {origin || "出发地"} ⇆ {primaryDestination || "目的地"}
        </h2>
        <p className="mt-1 text-sm text-stone">
          去程与返程可分别选飞机或高铁，选好后进入行程规划。
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <PlaneTakeoff className="h-4 w-4 text-clay" /> 去程
          </div>
          <ModeToggle value={outboundMode} onChange={setOutboundMode} />
        </div>
        {outList.map((t) => (
          <TicketRow
            key={t.id}
            ticket={t}
            selected={outbound?.id === t.id}
            onSelect={() => setOutbound(t)}
          />
        ))}
      </section>

      {outbound && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <PlaneLanding className="h-4 w-4 text-moss" /> 返程
            </div>
            <ModeToggle value={returnMode} onChange={setReturnMode} />
          </div>
          {retList.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              selected={returnFlight?.id === t.id}
              onSelect={() => setReturnFlight(t)}
            />
          ))}
        </section>
      )}

      <div className="sticky bottom-0 mt-auto bg-surface pt-3">
        <Button className="w-full" size="lg" disabled={!canConfirm} onClick={confirmFlights}>
          <Check className="h-4 w-4" />
          确认大交通，开始规划行程
        </Button>
      </div>
    </div>
  );
}
