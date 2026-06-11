import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, LogOut, MapPinned, Save, User } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { saveItinerary } from "../../api/client";
import ThemeToggle from "../ThemeToggle";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useItineraryStore } from "../../store/itineraryStore";
import { useChatStore } from "../../store/chatStore";
import { useFlightStore } from "../../store/flightStore";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";
import MyTripsDialog from "./MyTripsDialog";

export default function TopNav() {
  const origin = usePlanFlowStore((s) => s.origin);
  const primaryDestination = usePlanFlowStore((s) => s.primaryDestination)();
  const resetFlow = usePlanFlowStore((s) => s.reset);
  const itinerary = useItineraryStore((s) => s.itinerary);
  const clearItinerary = useItineraryStore((s) => s.clear);
  const resetChat = useChatStore((s) => s.reset);
  const resetFlights = useFlightStore((s) => s.reset);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const openAuth = useUiStore((s) => s.openAuth);
  const showToast = useUiStore((s) => s.showToast);
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [tripsOpen, setTripsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalStops =
    itinerary?.days.reduce((n, d) => n + d.stops.length, 0) ?? 0;
  const canSave = totalStops >= 3;

  function goHome() {
    clearItinerary();
    resetChat();
    resetFlights();
    resetFlow();
    navigate("/");
  }

  async function doSave() {
    if (!itinerary) return;
    setSaving(true);
    try {
      await saveItinerary(itinerary);
      showToast("行程已保存");
    } catch (e) {
      showToast((e as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function onSaveClick() {
    if (!canSave) {
      showToast("至少安排 3 个地点后再保存");
      return;
    }
    if (!user) {
      openAuth(() => void doSave()); // 访客：先登录，成功后继续保存
      return;
    }
    void doSave();
  }

  return (
    <header className="relative z-50 flex items-center justify-between border-b border-line bg-surface/80 px-5 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-clay to-clay-bright text-sm font-black text-white shadow-soft">
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
      </div>

      <nav className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={goHome}>
          <Home className="h-4 w-4" />
          首页
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onSaveClick}
          disabled={saving}
          className={canSave ? "" : "opacity-60"}
        >
          <Save className="h-4 w-4" />
          {saving ? "保存中…" : "保存计划"}
        </Button>

        <ThemeToggle />

        {/* 右上角用户按钮 */}
        <div className="relative">
          <button
            onClick={() => (user ? setMenuOpen((o) => !o) : openAuth())}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-clay hover:text-clay"
            title={user ? user.email : "登录"}
            aria-label={user ? "用户菜单" : "登录"}
          >
            {user ? (
              <span className="text-sm font-bold uppercase">
                {user.email[0]}
              </span>
            ) : (
              <User className="h-4 w-4" />
            )}
          </button>

          {user && menuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setMenuOpen(false)}
              />
              <div className="chat-enter absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
                <div className="border-b border-line px-4 py-3">
                  <div className="text-xs text-stone">已登录</div>
                  <div className="truncate text-sm font-semibold text-ink">
                    {user.email}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setTripsOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-sand"
                >
                  <MapPinned className="h-4 w-4 text-clay" />
                  我的行程
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                    showToast("已退出登录");
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-sand"
                >
                  <LogOut className="h-4 w-4 text-stone" />
                  退出登录
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      <MyTripsDialog open={tripsOpen} onOpenChange={setTripsOpen} />
    </header>
  );
}
