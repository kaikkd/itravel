import { useNavigate } from "react-router-dom";
import { Flame, Leaf, Scale } from "lucide-react";
import FloatingChoice, { type ChoiceOption } from "./FloatingChoice";
import { usePlanFlowStore, type Pace } from "../../store/planFlowStore";
import { useDraftPoisStore } from "../../store/draftPoisStore";
import { runPlanFromPois } from "../../lib/planController";

const OPTIONS: ChoiceOption[] = [
  {
    key: "compact",
    title: "紧凑",
    desc: "景点排得满，少留白，把时间用足。",
    icon: Flame,
    tone: "from-clay/15 to-clay-soft",
  },
  {
    key: "balanced",
    title: "适中",
    desc: "松弛有度，每天 3 个左右，节奏舒服。",
    icon: Scale,
    tone: "from-sky/12 to-sky/5",
  },
  {
    key: "relaxed",
    title: "轻松",
    desc: "慢慢逛，每天少而精，多留点闲暇。",
    icon: Leaf,
    tone: "from-moss/12 to-moss/5",
  },
];

// route_first 最后一步：选节奏 → LLM 估天数并排程 → 进工作台。
export default function PaceChoiceStep() {
  const navigate = useNavigate();
  const setPace = usePlanFlowStore((s) => s.setPace);
  const routeCity = usePlanFlowStore((s) => s.routeCity);
  const items = useDraftPoisStore((s) => s.items);

  function onPick(key: string) {
    const pace = key as Pace;
    setPace(pace);
    runPlanFromPois({ city: routeCity, pace, items });
    // 立即进工作台，流式骨架 + 逐天填充由工作台接管。
    navigate("/workspace");
  }

  return (
    <FloatingChoice
      badge="第 3 步 · 选节奏"
      title="你想玩得多紧凑？"
      subtitle={`已选 ${items.length} 个地点，itravel 会按你的节奏估算天数并排成顺路日程。`}
      options={OPTIONS}
      onPick={onPick}
      columns={3}
    />
  );
}
