import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { fetchCandidates } from "../../api/client";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useDraftPoisStore } from "../../store/draftPoisStore";
import type { Category, POI } from "../../types";

const CATS: { key: Category; label: string; icon: typeof MapPin }[] = [
  { key: "play", label: "景点", icon: MapPin },
  { key: "eat", label: "美食", icon: Utensils },
];

// route_first 选景点堆叠板：无天数概念，用户挨个把想去的地点堆进来。
export default function AttractionBoardStep() {
  const navigate = useNavigate();
  const routeCity = usePlanFlowStore((s) => s.routeCity);
  const {
    city,
    items,
    candidates,
    loadingCandidates,
    degraded,
    setCity,
    setCandidates,
    cacheCandidates,
    getCached,
    showCached,
    setLoading,
    add,
    remove,
  } = useDraftPoisStore();

  const [category, setCategory] = useState<Category>("play");
  const [keyword, setKeyword] = useState("");
  const [leaving, setLeaving] = useState(false);

  // 异步回来时据「当前所处类目/关键词」决定是否刷新可见列表，避免竞态覆盖。
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  // 同 key 的在途请求去重：可见加载与后台预取互不重复发车。
  const inflightRef = useRef<Set<string>>(new Set());

  // 进入时同步城市并拉候选。
  useEffect(() => {
    if (routeCity && city !== routeCity) setCity(routeCity);
  }, [routeCity, city, setCity]);

  // 拉某类目候选：命中缓存秒开；在途则等待；force=true 跳过缓存（「换一批」）。
  // 命中当前可见类目+关键词才刷新列表，否则只写缓存（后台预取）。
  function ensureCandidates(cat: Category, kw: string, force = false) {
    if (!routeCity) return;
    const cacheKey = `${routeCity}|${cat}|${kw}`;
    const isVisible = () =>
      categoryRef.current === cat && keywordRef.current === kw;
    if (!force) {
      const cached = getCached(cacheKey);
      if (cached) {
        if (isVisible()) showCached(cached);
        return;
      }
      if (inflightRef.current.has(cacheKey)) {
        if (isVisible()) setLoading(true);
        return;
      }
    }
    inflightRef.current.add(cacheKey);
    if (isVisible()) setLoading(true);
    fetchCandidates(routeCity, { category: cat, keyword: kw, limit: 8 })
      .then((r) => {
        if (isVisible()) setCandidates(r.pois, r.degraded, cacheKey);
        else cacheCandidates(cacheKey, r.pois, r.degraded);
      })
      .catch(() => {
        if (isVisible()) setCandidates([], true);
      })
      .finally(() => inflightRef.current.delete(cacheKey));
  }

  // 显示当前类目（挂载 / 切类目都走这里，命中缓存秒开）。
  useEffect(() => {
    ensureCandidates(category, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCity, category]);

  // 进入页面即并发预取「景点 + 美食」，切到美食时秒开，不必等点了才请求。
  useEffect(() => {
    for (const { key } of CATS) ensureCandidates(key, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCity]);

  const selectedNames = new Set(items.map((it) => it.poi.name));

  function goNext() {
    if (items.length === 0 || leaving) return;
    setLeaving(true);
    window.setTimeout(() => navigate("/plan/route/pace"), 460);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div
        className="floating-card grid max-h-[86vh] w-full max-w-6xl grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
        style={{
          animation: leaving ? "var(--animate-rise-out)" : "var(--animate-rise-in)",
        }}
      >
        {/* 左：候选货架（标题/类目/搜索固定，候选列表内滚动） */}
        <div className="flex min-h-0 flex-col gap-4 border-b border-line p-7 md:border-b-0 md:border-r">
          <div>
            <Badge variant="clay">第 2 步 · 选景点</Badge>
            <h2 className="mt-3 font-serif text-2xl font-semibold text-ink">
              「{routeCity || "目的地"}」想去哪些地方？
            </h2>
            <p className="mt-1 text-sm text-stone">挑出想去的，先不用管哪天去，最后我们帮你排顺路。</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-sand p-1">
              {CATS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    setCategory(key);
                    setKeyword("");
                  }}
                  className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
                    category === key ? "bg-surface text-clay shadow-soft" : "text-stone"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => ensureCandidates(category, keyword, true)}
              title="换一批"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-stone transition-colors hover:border-clay hover:text-clay"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ensureCandidates(category, keyword)}
              placeholder="想要的关键词，如 古迹 / 文艺 / 网红，回车搜索"
              className="h-11 w-full rounded-full border border-line bg-ivory pl-10 pr-4 text-sm outline-none focus:border-clay"
            />
          </div>

          {degraded && (
            <p className="shrink-0 text-xs text-warning">AI 暂不可用，以下为兜底候选。</p>
          )}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {loadingCandidates ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在为你找好地方…
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-16 text-center text-sm text-stone">没有候选，换个关键词或类目。</p>
            ) : (
              candidates.map((poi) => (
                <CandidateRow
                  key={poi.name}
                  poi={poi}
                  selected={selectedNames.has(poi.name)}
                  onAdd={() => add(poi)}
                />
              ))
            )}
          </div>
        </div>

        {/* 右：已选堆叠 */}
        <div className="flex min-h-0 flex-col bg-ivory/40 p-7">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-serif text-lg font-semibold text-ink">已选清单</h3>
            <Badge variant="soft">已选 {items.length} 个</Badge>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-clay-soft text-clay">
                  <Plus className="h-5 w-5" />
                </div>
                <p className="max-w-[16rem] text-xs text-stone">
                  点左侧候选把想去的地方加进来，堆好后一起去排日程。
                </p>
              </div>
            ) : (
              items.map((it, i) => (
                <div
                  key={it.key}
                  className="card-stack-in flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-soft"
                  style={{ ["--i" as string]: i }}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={it.poi.category === "eat" ? "clay" : "sky"}>
                        {it.poi.category === "eat" ? "吃" : "玩"}
                      </Badge>
                      <span className="truncate font-semibold text-ink">{it.poi.name}</span>
                    </div>
                    {it.poi.rec_reason && (
                      <p className="mt-1 text-xs text-stone">{it.poi.rec_reason}</p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(it.key)}
                    className="rounded-full p-1 text-stone transition-colors hover:bg-sand hover:text-ink"
                    aria-label="移除"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <Button
            size="lg"
            className="mt-4 w-full"
            disabled={items.length === 0}
            onClick={goNext}
          >
            <Sparkles className="h-4 w-4" />
            就这些，去排日程
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function CandidateRow({
  poi,
  selected,
  onAdd,
}: {
  poi: POI;
  selected: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      onClick={onAdd}
      disabled={selected}
      className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-all ${
        selected
          ? "cursor-default border-line bg-sand/60"
          : "border-line bg-surface hover:-translate-y-0.5 hover:border-clay"
      }`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          selected ? "bg-moss text-white" : "bg-clay-soft text-clay"
        }`}
      >
        {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">{poi.name}</div>
        {poi.rec_reason && <p className="mt-0.5 text-xs text-stone">{poi.rec_reason}</p>}
        {poi.address && <p className="mt-0.5 text-xs text-stone/70">{poi.address}</p>}
      </div>
    </button>
  );
}
