import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ChoiceOption {
  key: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  tone: string; // tailwind gradient classes, e.g. "from-clay/15 to-clay-soft"
}

// 上浮卡片选择器：复用 IntroGate 的视觉语言（floating-card + rise + 错峰）。
// 供 RouteStartChoice / PaceChoiceStep 等步骤共用，保证全流程风格一致（#12）。
export default function FloatingChoice({
  badge,
  title,
  subtitle,
  options,
  onPick,
  columns = 2,
}: {
  badge?: string;
  title: string;
  subtitle?: string;
  options: ChoiceOption[];
  onPick: (key: string) => void;
  columns?: 2 | 3;
}) {
  const [leaving, setLeaving] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  function choose(key: string) {
    if (leaving) return;
    setPicked(key);
    setLeaving(true);
    window.setTimeout(() => onPick(key), 560);
  }

  const gridCols = columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div
        className="mb-12 text-center"
        style={{ animation: "var(--animate-rise-in)" }}
      >
        {badge && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-clay">
            <Sparkles className="h-4 w-4" />
            {badge}
          </div>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-4 max-w-xl text-base text-stone md:text-lg">
            {subtitle}
          </p>
        )}
      </div>

      <div className={`grid w-full max-w-5xl gap-6 ${gridCols}`}>
        {options.map((opt, index) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              onClick={() => choose(opt.key)}
              className="group floating-card relative overflow-hidden p-8 text-left transition-transform duration-300 hover:-translate-y-2"
              style={{
                animation: leaving
                  ? "var(--animate-rise-out)"
                  : "var(--animate-rise-in)",
                animationDelay: leaving
                  ? `${index * 80}ms`
                  : `${index * 120}ms`,
                opacity: leaving && picked !== opt.key ? 0.5 : undefined,
              }}
            >
              <div
                className={`absolute inset-0 -z-0 bg-gradient-to-br ${opt.tone} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
              />
              <div className="relative z-10">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-ink text-cream shadow-soft transition-transform duration-300 group-hover:scale-105">
                  <Icon className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                  {opt.title}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-stone">
                  {opt.desc}
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
