import { Home } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useTripStore } from "../../store/tripStore";

export default function TopNav() {
  const mode = usePlanFlowStore((s) => s.mode);
  const origin = usePlanFlowStore((s) => s.origin);
  const primaryDestination = usePlanFlowStore((s) => s.primaryDestination)();
  const resetFlow = usePlanFlowStore((s) => s.reset);
  const resetTrip = useTripStore((s) => s.reset);

  function goHome() {
    resetTrip();
    resetFlow();
  }

  return (
    <header className="flex items-center justify-between border-b border-line bg-surface/80 px-5 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-clay to-clay-bright text-sm font-black text-white">
          行
        </div>
        <span className="font-serif text-lg font-semibold tracking-tight text-ink">
          itravel
        </span>
        {primaryDestination && (
          <Badge variant="soft">
            {origin || "出发地"} → {primaryDestination}
          </Badge>
        )}
        {mode && (
          <Badge variant={mode === "traffic_first" ? "sky" : "moss"}>
            {mode === "traffic_first" ? "交通优先" : "路线优先"}
          </Badge>
        )}
      </div>
      <nav>
        <Button variant="ghost" size="sm" onClick={goHome}>
          <Home className="h-4 w-4" />
          首页
        </Button>
      </nav>
    </header>
  );
}
