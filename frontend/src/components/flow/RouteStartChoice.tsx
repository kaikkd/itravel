import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Compass, MapPin, Search, Sparkles } from "lucide-react";
import { searchCities } from "../../lib/cityCatalog";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useDraftPoisStore } from "../../store/draftPoisStore";

// route_first 第一步：「已有想去的城市」vs「只有感兴趣的景点类型」。
export default function RouteStartChoice() {
  const navigate = useNavigate();
  const setRouteStart = usePlanFlowStore((s) => s.setRouteStart);
  const setRouteCity = usePlanFlowStore((s) => s.setRouteCity);
  const setDraftCity = useDraftPoisStore((s) => s.setCity);

  const [picking, setPicking] = useState(false); // 选了「已有城市」→ 展开城市搜索
  const [leaving, setLeaving] = useState(false); // 两卡选择视图离场
  const [pickerLeaving, setPickerLeaving] = useState(false); // 城市选择视图离场（返回）
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchCities(query), [query]);

  function pickHasCity() {
    if (leaving) return;
    setRouteStart("has_city");
    // 先让两卡淡出上浮，再切到城市选择视图（带 rise-in），避免硬切。
    setLeaving(true);
    window.setTimeout(() => {
      setPicking(true);
      setLeaving(false);
    }, 480);
  }

  function backToChoice() {
    if (pickerLeaving) return;
    // 城市选择视图淡出后再切回两卡视图。
    setPickerLeaving(true);
    window.setTimeout(() => {
      setPicking(false);
      setPickerLeaving(false);
    }, 420);
  }

  function confirmCity(city: string) {
    if (pickerLeaving) return;
    setRouteCity(city);
    setDraftCity(city);
    setPickerLeaving(true);
    window.setTimeout(() => navigate("/plan/route/attractions"), 460);
  }

  function pickOnlyTypes() {
    if (leaving) return;
    setRouteStart("only_types");
    setLeaving(true);
    window.setTimeout(() => navigate("/plan/route/city-chat"), 560);
  }

  if (picking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <div
          className="floating-card w-full max-w-2xl p-8"
          style={{
            animation: pickerLeaving
              ? "var(--animate-rise-out)"
              : "var(--animate-rise-in)",
          }}
        >
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-clay">
            <MapPin className="h-3.5 w-3.5" />
            已有想去的城市
          </div>
          <h2 className="font-serif text-2xl font-semibold text-ink">想去哪座城市？</h2>
          <p className="mt-1 text-sm text-stone">选定后我们直接去挑景点，最后帮你排成日程。</p>

          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索城市，如 成都 / 杭州 / 四川"
              className="h-12 w-full rounded-full border border-line bg-ivory pl-11 pr-4 text-sm outline-none focus:border-clay"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {results.map((city) => (
              <button
                key={city.name}
                onClick={() => confirmCity(city.name)}
                className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-all hover:-translate-y-0.5 hover:border-clay hover:text-clay"
              >
                {city.name}
                <span className="ml-1.5 text-xs text-stone">{city.province}</span>
              </button>
            ))}
            {results.length === 0 && (
              <span className="text-sm text-stone">没有匹配的城市，换个关键词试试。</span>
            )}
          </div>

          <button
            onClick={backToChoice}
            className="mt-6 text-sm font-semibold text-stone hover:text-clay"
          >
            ← 返回选择
          </button>
        </div>
      </div>
    );
  }

  const cards = [
    {
      key: "has_city",
      title: "已有想去的城市",
      desc: "心里有目的地了？直接挑景点，最后我们帮你排成顺路日程。",
      icon: MapPin,
      tone: "from-clay/15 to-clay-soft",
      onClick: pickHasCity,
    },
    {
      key: "only_types",
      title: "只有感兴趣的景点类型",
      desc: "还没定城市？告诉我你想看什么，AI 帮你挑合适的目的地。",
      icon: Compass,
      tone: "from-moss/12 to-moss/5",
      onClick: pickOnlyTypes,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div
        className="mb-12 text-center"
        style={{
          animation: leaving
            ? "var(--animate-rise-out)"
            : "var(--animate-rise-in)",
        }}
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-clay">
          <Sparkles className="h-4 w-4" />
          从游玩景点开始
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-5xl">
          你已经有想去的城市了吗？
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-stone md:text-lg">
          两种方式都可以——先定城市再挑景点，或先聊兴趣让 AI 帮你定城市。
        </p>
      </div>

      <div className="grid w-full max-w-5xl gap-6 md:grid-cols-2">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              onClick={card.onClick}
              className="group floating-card relative overflow-hidden p-8 text-left transition-transform duration-300 hover:-translate-y-2"
              style={{
                animation: leaving
                  ? "var(--animate-rise-out)"
                  : "var(--animate-rise-in)",
                animationDelay: `${index * 120}ms`,
              }}
            >
              <div
                className={`absolute inset-0 -z-0 bg-gradient-to-br ${card.tone} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
              />
              <div className="relative z-10">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-ink text-cream shadow-soft transition-transform duration-300 group-hover:scale-105">
                  <Icon className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                  {card.title}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-stone">{card.desc}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-clay">
                  {card.key === "has_city" ? "选择城市" : "聊聊兴趣"}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
