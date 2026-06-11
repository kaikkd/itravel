import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, MapPin, Plane, Search, X } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import ChinaMap from "./ChinaMap";
import {
  cityProvince,
  searchCities,
} from "../../lib/cityCatalog";
import { usePlanFlowStore, type PlaceRole } from "../../store/planFlowStore";

const ROLE_LABEL: Record<PlaceRole, string> = {
  origin: "出发地",
  destination: "目的地",
  return: "返回地",
};

export default function OriginDestinationStep() {
  const {
    origin,
    destinations,
    returnCity,
    dayCount,
    setOrigin,
    toggleDestination,
    setReturnCity,
    setDayCount,
  } = usePlanFlowStore();
  const navigate = useNavigate();

  const [role, setRole] = useState<PlaceRole>("origin");
  const [query, setQuery] = useState("");
  const [leaving, setLeaving] = useState(false);

  const results = useMemo(() => searchCities(query), [query]);

  function pick(cityName: string) {
    if (role === "origin") {
      setOrigin(cityName);
      setRole("destination");
    } else if (role === "destination") {
      toggleDestination(cityName);
    } else {
      setReturnCity(cityName);
    }
  }

  function isSelected(cityName: string): boolean {
    return (
      origin === cityName ||
      destinations.includes(cityName) ||
      returnCity === cityName
    );
  }

  const destinationProvinces = destinations
    .map((c) => cityProvince(c))
    .filter((p): p is string => Boolean(p));
  const canStart = Boolean(origin) && destinations.length > 0;

  function start() {
    if (!canStart || leaving) return;
    if (!returnCity) setReturnCity(origin);
    setLeaving(true);
    window.setTimeout(() => navigate("/workspace"), 560);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 md:px-8">
      <div
        className="floating-card grid w-full max-w-6xl gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
        style={{
          animation: leaving
            ? "var(--animate-rise-out)"
            : "var(--animate-rise-in)",
        }}
      >
        {/* 左：选择面板 */}
        <div className="flex flex-col gap-6 p-8">
          <div>
            <Badge variant="clay">第 1 步 · 选择城市</Badge>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
              你从哪出发，想去哪？
            </h2>
            <p className="mt-2 text-sm text-stone">
              依次选择出发地、目的地（可多选）和返回地，右侧地图会实时高亮对应省份。
            </p>
          </div>

          {/* 角色切换 */}
          <div className="inline-flex rounded-full bg-sand p-1">
            {(Object.keys(ROLE_LABEL) as PlaceRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
                  role === r ? "bg-surface text-ink shadow-soft" : "text-stone"
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>

          {/* 搜索 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`搜索${ROLE_LABEL[role]}城市，如 成都 / 四川`}
              className="h-12 w-full rounded-full border border-line bg-ivory pl-11 pr-4 text-sm outline-none focus:border-clay"
            />
          </div>

          {/* 候选城市 chips */}
          <div className="flex flex-wrap gap-2">
            {results.map((city) => (
              <button
                key={city.name}
                onClick={() => pick(city.name)}
                className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-all ${
                  isSelected(city.name)
                    ? "border-clay bg-clay-soft text-clay"
                    : "border-line bg-surface text-ink hover:border-clay-soft"
                }`}
              >
                {city.name}
                <span className="ml-1.5 text-xs text-stone">{city.province}</span>
              </button>
            ))}
            {results.length === 0 && (
              <span className="text-sm text-stone">没有匹配的城市，换个关键词试试。</span>
            )}
          </div>

          {/* 已选摘要 */}
          <div className="space-y-2 rounded-2xl border border-line bg-ivory p-4 text-sm">
            <SummaryRow icon={<Plane className="h-4 w-4" />} label="出发地">
              {origin ? (
                <Chip text={origin} onClear={() => setOrigin("")} />
              ) : (
                <span className="text-stone">未选择</span>
              )}
            </SummaryRow>
            <SummaryRow icon={<MapPin className="h-4 w-4" />} label="目的地">
              {destinations.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {destinations.map((c) => (
                    <Chip key={c} text={c} onClear={() => toggleDestination(c)} />
                  ))}
                </div>
              ) : (
                <span className="text-stone">未选择</span>
              )}
            </SummaryRow>
            <SummaryRow icon={<ArrowRight className="h-4 w-4" />} label="返回地">
              {returnCity ? (
                <Chip text={returnCity} onClear={() => setReturnCity("")} />
              ) : (
                <span className="text-stone">默认同出发地</span>
              )}
            </SummaryRow>
          </div>

          {/* 天数 + 开始 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-stone">计划天数</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDayCount(dayCount - 1)}
                  className="h-8 w-8 rounded-full border border-line text-lg leading-none text-ink hover:bg-sand"
                >
                  −
                </button>
                <span className="w-8 text-center text-lg font-semibold">{dayCount}</span>
                <button
                  onClick={() => setDayCount(dayCount + 1)}
                  className="h-8 w-8 rounded-full border border-line text-lg leading-none text-ink hover:bg-sand"
                >
                  +
                </button>
              </div>
            </div>
            <Button size="lg" disabled={!canStart} onClick={start}>
              开始规划
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 右：中国地图 */}
        <div className="relative min-h-[420px] border-t border-line bg-gradient-to-br from-ivory to-sand p-6 md:border-l md:border-t-0">
          <div className="absolute left-6 top-6 z-10 flex flex-wrap gap-2">
            <Badge variant="sky">出发</Badge>
            <Badge variant="clay">目的</Badge>
            <Badge variant="moss">返回</Badge>
          </div>
          <div className="flex h-full items-center justify-center">
            <ChinaMap
              originProvince={cityProvince(origin)}
              destinationProvinces={destinationProvinces}
              returnProvince={cityProvince(returnCity)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-sand text-stone">
        {icon}
      </span>
      <span className="w-14 shrink-0 pt-0.5 font-semibold text-ink">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Chip({ text, onClear }: { text: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-clay-soft px-2.5 py-1 text-xs font-semibold text-clay">
      {text}
      <button onClick={onClear} className="hover:text-ink">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
