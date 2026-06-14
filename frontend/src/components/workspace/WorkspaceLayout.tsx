import { useEffect, useRef, useState } from "react";
import { Map as MapIcon, PanelRightClose } from "lucide-react";
import TopNav from "./TopNav";
import ChatDock from "./ChatDock";
import ScheduleColumn from "./ScheduleColumn";
import FlightBoard from "./FlightBoard";
import TripMap from "./TripMap";
import TripSummaryCard from "./TripSummaryCard";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useFlightStore } from "../../store/flightStore";
import { useItineraryStore } from "../../store/itineraryStore";
import { useUiStore } from "../../store/uiStore";

const INTRO_TEXT = "和 itravel 聊聊你的旅行吧～";

export default function WorkspaceLayout() {
  const mode = usePlanFlowStore((s) => s.mode);
  const flightsConfirmed = useFlightStore((s) => s.flightsConfirmed);
  const hasItinerary = useItineraryStore((s) => s.itinerary != null);
  const bumpFlash = useUiStore((s) => s.bumpFlash);

  const showFlights = mode === "traffic_first" && !flightsConfirmed;
  const chatActive = mode === "route_first" || flightsConfirmed;

  const [showIntro, setShowIntro] = useState(false);
  // 地图只服务于行程规划阶段（大交通阶段右侧是行程概览卡，不再有地图）。
  // 进入行程规划先不展示地图，选到地点后再展开（#6）。
  const [mapCollapsed, setMapCollapsed] = useState(true);
  const userToggledMap = useRef(false);
  const introShownRef = useRef(false);

  // 有了行程地点自动展开地图一次；用户手动收起后不再自动覆盖。
  useEffect(() => {
    if (userToggledMap.current) return;
    if (hasItinerary) setMapCollapsed(false);
  }, [hasItinerary]);

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

  function collapseMap() {
    userToggledMap.current = true;
    setMapCollapsed(true);
  }
  function expandMap() {
    userToggledMap.current = true;
    setMapCollapsed(false);
  }

  const ease = "cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div className="flex h-screen flex-col bg-cream">
      <TopNav />

      <main className="relative flex min-h-0 flex-1 items-stretch gap-3 p-4">
        {/* 左列：选票栏 / 行程表 + 独立对话卡 */}
        <section
          className={`flex min-h-0 min-w-0 flex-col gap-3 ${
            !showFlights && mapCollapsed ? "mx-auto w-full max-w-3xl" : ""
          }`}
          style={{
            // 大交通：选票栏 70%；行程规划：地图展开时左列填充剩余、折叠时居中。
            flexBasis: showFlights ? "70%" : mapCollapsed ? undefined : "0%",
            flexGrow: showFlights ? 0 : 1,
            flexShrink: showFlights ? 0 : 1,
            transition: `flex-basis 500ms ${ease}`,
          }}
        >
          {showFlights ? (
            // 机票分支保留卡片外观
            <div className="min-h-0 flex-1 overflow-hidden glass rounded-3xl">
              <FlightBoard />
            </div>
          ) : (
            // 行程表分支去掉外层卡壳：每天的卡片直接作为顶层卡片，在此区域内滚动（#2）
            <div className="min-h-0 flex-1 overflow-hidden">
              <ScheduleColumn />
            </div>
          )}
          {chatActive && (
            <div className="shrink-0 overflow-hidden glass rounded-3xl">
              <ChatDock />
            </div>
          )}
        </section>

        {/* 折叠按钮：仅行程规划阶段、地图展开时显示 */}
        {!showFlights && !mapCollapsed && (
          <button
            onClick={collapseMap}
            title="收起地图"
            aria-label="收起地图"
            className="glass z-10 flex h-11 w-7 shrink-0 items-center justify-center self-center rounded-full text-stone transition-colors hover:text-clay"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        )}

        {/* 右列：大交通阶段=行程概览卡（30%，常显）；行程规划阶段=地图（45%，可折叠） */}
        {showFlights ? (
          <section
            className="summary-rise relative min-h-0 overflow-hidden glass rounded-3xl"
            style={{ flexBasis: "30%", flexGrow: 1, flexShrink: 1 }}
          >
            <TripSummaryCard />
          </section>
        ) : (
          <section
            className="relative min-h-0 overflow-hidden glass rounded-3xl"
            style={{
              flexBasis: mapCollapsed ? "0%" : "45%",
              flexGrow: 0,
              flexShrink: 1,
              opacity: mapCollapsed ? 0 : 1,
              pointerEvents: mapCollapsed ? "none" : undefined,
              transition: `flex-basis 500ms ${ease}, opacity 400ms ${ease}`,
            }}
          >
            <TripMap collapsed={mapCollapsed} />
          </section>
        )}

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

      {/* 折叠后右下角浮标：重新展开地图。仅行程规划阶段、已有行程时可用。 */}
      {!showFlights && mapCollapsed && hasItinerary && (
        <button
          onClick={expandMap}
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
