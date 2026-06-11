import { useEffect, useRef, useState } from "react";
import { Map as MapIcon, PanelRightClose } from "lucide-react";
import TopNav from "./TopNav";
import ChatDock from "./ChatDock";
import ScheduleColumn from "./ScheduleColumn";
import FlightBoard from "./FlightBoard";
import TripMap from "./TripMap";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useFlightStore } from "../../store/flightStore";
import { useUiStore } from "../../store/uiStore";

const INTRO_TEXT = "和 itravel 聊聊你的旅行吧～";

export default function WorkspaceLayout() {
  const mode = usePlanFlowStore((s) => s.mode);
  const flightsConfirmed = useFlightStore((s) => s.flightsConfirmed);
  const bumpFlash = useUiStore((s) => s.bumpFlash);

  const showFlights = mode === "traffic_first" && !flightsConfirmed;
  const chatActive = mode === "route_first" || flightsConfirmed;

  const [showIntro, setShowIntro] = useState(false);
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const introShownRef = useRef(false);

  // 进入聊天阶段时一次性浮现中心提示，约 2s 后吹散并触发对话框边缘闪烁。
  useEffect(() => {
    if (!chatActive || introShownRef.current) return;
    introShownRef.current = true;
    setShowIntro(true);
    const timer = setTimeout(() => {
      setShowIntro(false);
      bumpFlash();
    }, 2000);
    return () => clearTimeout(timer);
  }, [chatActive, bumpFlash]);

  const ease = "cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div className="flex h-screen flex-col bg-cream">
      <TopNav />

      <main className="relative flex min-h-0 flex-1 items-stretch gap-3 p-4">
        {/* 左列：行程表/机票 + 底部对话框 */}
        <section
          className="flex min-w-[360px] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-soft"
          style={{ width: mapCollapsed ? "100%" : "42%", transition: `width 500ms ${ease}` }}
        >
          <div
            className={`flex min-h-0 flex-1 flex-col ${
              mapCollapsed ? "mx-auto w-full max-w-3xl" : ""
            }`}
          >
            <div className="min-h-0 flex-1 overflow-hidden">
              {showFlights ? <FlightBoard /> : <ScheduleColumn />}
            </div>
            {chatActive && <ChatDock />}
          </div>
        </section>

        {/* 折叠按钮：行程表与地图之间 */}
        {!mapCollapsed && (
          <button
            onClick={() => setMapCollapsed(true)}
            title="收起地图"
            aria-label="收起地图"
            className="z-10 flex h-11 w-7 shrink-0 items-center justify-center self-center rounded-full border border-line bg-surface text-stone shadow-soft transition-colors hover:text-clay"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        )}

        {/* 右列：标准地图（延伸到底部） */}
        <section
          className="relative min-h-0 overflow-hidden rounded-3xl border border-line bg-surface shadow-soft"
          style={{
            width: mapCollapsed ? "0%" : "58%",
            opacity: mapCollapsed ? 0 : 1,
            transition: `width 500ms ${ease}, opacity 400ms ${ease}`,
          }}
        >
          <TripMap collapsed={mapCollapsed} />
        </section>

        {/* 中心浮现提示（一次性，约 2s 后浮尘吹散） */}
        {showIntro && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
            <div className="intro-backdrop" />
            <div className="center-prompt relative text-center text-3xl font-semibold md:text-5xl">
              {Array.from(INTRO_TEXT).map((ch, i) => (
                <span
                  key={i}
                  className="dust"
                  style={{ ["--d"]: `${i * 24}ms` } as React.CSSProperties}
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* 折叠后右下角浮标：重新展开地图 */}
      {mapCollapsed && (
        <button
          onClick={() => setMapCollapsed(false)}
          title="展开地图"
          aria-label="展开地图"
          className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-clay text-white shadow-float transition-transform hover:scale-105"
        >
          <MapIcon className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
