import { useState } from "react";
import { Compass, Plane, Sparkles } from "lucide-react";
import { usePlanFlowStore } from "../../store/planFlowStore";
import type { PlanningMode } from "../../types";

export default function IntroGate() {
  const setMode = usePlanFlowStore((s) => s.setMode);
  const goPhase = usePlanFlowStore((s) => s.goPhase);
  const [leaving, setLeaving] = useState(false);

  function choose(mode: PlanningMode) {
    if (leaving) return;
    setMode(mode);
    setLeaving(true);
    window.setTimeout(() => goPhase("places"), 560);
  }

  const cards: {
    mode: PlanningMode;
    title: string;
    desc: string;
    icon: typeof Plane;
    tone: string;
  }[] = [
    {
      mode: "traffic_first",
      title: "从大交通 / 往返日期开始",
      desc: "先比较往返机票与日期，再据此安排每天的游玩节奏。",
      icon: Plane,
      tone: "from-clay/15 to-clay-soft",
    },
    {
      mode: "route_first",
      title: "从游玩景点开始",
      desc: "先挑想去的地点，地图实时打点，最后反推交通与日程。",
      icon: Compass,
      tone: "from-moss/12 to-moss/5",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div
        className="mb-12 text-center"
        style={{ animation: "var(--animate-rise-in)" }}
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-clay">
          <Sparkles className="h-4 w-4" />
          itravel · 智能旅程规划
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-ink md:text-6xl">
          你想怎么开始这趟旅行？
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-stone md:text-lg">
          重行程计划，弱 AI 聊天。先选一个起点，剩下的交给地图、日程和 itravel。
        </p>
      </div>

      <div className="grid w-full max-w-5xl gap-6 md:grid-cols-2">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <button
              key={card.mode}
              onClick={() => choose(card.mode)}
              className="group floating-card relative overflow-hidden p-8 text-left transition-transform duration-300 hover:-translate-y-2"
              style={{
                animation: leaving
                  ? "var(--animate-rise-out)"
                  : "var(--animate-rise-in)",
                animationDelay: leaving ? `${index * 80}ms` : `${index * 120}ms`,
              }}
            >
              <div
                className={`absolute inset-0 -z-0 bg-gradient-to-br ${card.tone} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
              />
              <div className="relative z-10">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-ink text-cream shadow-soft">
                  <Icon className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                  {card.title}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-stone">
                  {card.desc}
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-clay">
                  选择并继续
                  <span className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
