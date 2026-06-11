import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, Plane } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { usePlanFlowStore } from "../../store/planFlowStore";
import type { PlanningMode } from "../../types";
import "./IntroGate.css";

export default function IntroGate() {
  const setMode = usePlanFlowStore((s) => s.setMode);
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);

  function choose(mode: PlanningMode) {
    if (leaving) return;
    setMode(mode);
    setLeaving(true);
    const to = mode === "traffic_first" ? "/plan/cities" : "/plan/route";
    window.setTimeout(() => navigate(to), 500);
  }

  const cards: {
    mode: PlanningMode;
    num: string;
    title: string;
    desc: string;
    icon: typeof Plane;
  }[] = [
    {
      mode: "traffic_first",
      num: "01",
      title: "从大交通与日期开始",
      desc: "先比较往返机票和日期，再据此安排每天的游玩节奏。",
      icon: Plane,
    },
    {
      mode: "route_first",
      num: "02",
      title: "从游玩景点开始",
      desc: "先挑想去的地点，地图实时打点，最后反推交通与日程。",
      icon: Compass,
    },
  ];

  return (
    <div className={`tg-root ${leaving ? "tg-leaving" : ""}`}>
      <div className="tg-grain" aria-hidden="true" />
      <div className="tg-shell">
        <span className="tg-eyebrow tg-rise" style={{ animationDelay: "40ms" }}>
          <span className="tg-dot" />
          itravel · 智能旅程规划
        </span>

        <h1 className="tg-title tg-rise" style={{ animationDelay: "120ms" }}>
          这趟旅行，想<span className="tg-em">怎么开始</span>？
        </h1>

        <p className="tg-sub tg-rise" style={{ animationDelay: "220ms" }}>
          先选一个起点，剩下的交给地图、日程和对话，吃住行一站排好。
        </p>

        <div className="tg-grid">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div key={card.mode} className={index === 1 ? "md:mt-10" : ""}>
                <motion.button
                  onClick={() => choose(card.mode)}
                  className="tg-card"
                  initial={reduce ? false : { opacity: 0, y: 22 }}
                  animate={reduce ? undefined : { opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.32 + index * 0.11,
                    type: "spring",
                    stiffness: 220,
                    damping: 24,
                  }}
                  whileHover={reduce ? undefined : { y: -6 }}
                  whileTap={reduce ? undefined : { scale: 0.99 }}
                >
                  <span className="tg-card-num">{card.num}</span>
                  <span className="tg-card-icon">
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <span className="tg-card-title">{card.title}</span>
                  <span className="tg-card-desc">{card.desc}</span>
                  <span className="tg-card-cta">
                    选择并继续
                    <span className="tg-arrow">→</span>
                  </span>
                </motion.button>
              </div>
            );
          })}
        </div>

        <div className="tg-foot tg-rise" style={{ animationDelay: "560ms" }}>
          <span>实时地图打点</span>
          <span>顺路日程</span>
          <span>一句话改方案</span>
        </div>
      </div>
    </div>
  );
}
