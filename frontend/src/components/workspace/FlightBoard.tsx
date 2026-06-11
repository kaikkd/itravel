import { useMemo } from "react";
import { Check, Luggage, Plane, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { outboundFlights, returnFlights } from "../../lib/flights";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useTripStore } from "../../store/tripStore";
import type { Flight } from "../../types";

function FlightRow({
  flight,
  selected,
  onSelect,
}: {
  flight: Flight;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition-all ${
        selected
          ? "border-clay bg-clay-soft/50 shadow-soft"
          : "border-line bg-surface hover:border-clay-soft"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="soft">{flight.platform}</Badge>
          <span className="text-sm font-semibold text-ink">
            {flight.airline} {flight.flightNo}
          </span>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-clay">¥{flight.price}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm text-ink">
        <span className="font-semibold">{flight.departTime}</span>
        <span className="flex-1 border-t border-dashed border-line-strong" />
        <span className="text-xs text-stone">{flight.duration}</span>
        <span className="flex-1 border-t border-dashed border-line-strong" />
        <span className="font-semibold">{flight.arriveTime}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-stone">
        <span>
          {flight.from.code} {flight.from.city} → {flight.to.city} {flight.to.code}
        </span>
        <span className="inline-flex items-center gap-1">
          <Luggage className="h-3 w-3" />
          {flight.baggage}
        </span>
      </div>
      <div className="mt-2 text-xs text-stone">{flight.dateNote}</div>
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
  const outbound = useTripStore((s) => s.outbound);
  const returnFlight = useTripStore((s) => s.returnFlight);
  const setOutbound = useTripStore((s) => s.setOutbound);
  const setReturnFlight = useTripStore((s) => s.setReturnFlight);
  const confirmFlights = useTripStore((s) => s.confirmFlights);

  const outList = useMemo(
    () => outboundFlights(origin, primaryDestination),
    [origin, primaryDestination],
  );
  const retList = useMemo(
    () => returnFlights(origin, primaryDestination),
    [origin, primaryDestination],
  );

  const canConfirm = Boolean(outbound && returnFlight);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <div>
        <Badge variant="clay">交通优先 · 先定机票</Badge>
        <h2 className="mt-2 text-xl font-semibold text-ink">
          {origin || "出发地"} ⇆ {primaryDestination || "目的地"}
        </h2>
        <p className="mt-1 text-sm text-stone">
          选择去程后地图会渲染飞行动画，再选返程并确认，即可进入行程规划。
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <PlaneTakeoff className="h-4 w-4 text-clay" /> 去程
        </div>
        {outList.map((f) => (
          <FlightRow
            key={f.id}
            flight={f}
            selected={outbound?.id === f.id}
            onSelect={() => setOutbound(f)}
          />
        ))}
      </section>

      {outbound && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <PlaneLanding className="h-4 w-4 text-moss" /> 返程
          </div>
          {retList.map((f) => (
            <FlightRow
              key={f.id}
              flight={f}
              selected={returnFlight?.id === f.id}
              onSelect={() => setReturnFlight(f)}
            />
          ))}
        </section>
      )}

      <div className="sticky bottom-0 mt-auto bg-surface pt-3">
        <Button
          className="w-full"
          size="lg"
          disabled={!canConfirm}
          onClick={confirmFlights}
        >
          <Plane className="h-4 w-4" />
          确认机票，开始规划行程
        </Button>
      </div>
    </div>
  );
}
