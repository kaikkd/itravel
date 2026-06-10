import { useEffect, useRef, useState } from "react";
import {
  getHealth,
  getItinerary,
  listItineraries,
  saveItinerary,
  streamPlan,
} from "./api/client";
import Schedule from "./components/Schedule";
import MapView from "./components/MapView";
import Feed from "./components/Feed";
import AuthPanel from "./components/AuthPanel";
import { useItineraryStore, useTemporalStore } from "./store/itineraryStore";
import { useAuthStore } from "./store/authStore";
import { useTransitRefiner } from "./hooks/useTransitRefiner";
import { Alert, Badge, Button } from "./components/ui";

type Status = "loading" | "ok" | "error";
type ToastKind = "info" | "success" | "warning" | "error";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const BUDGETS = ["轻松游", "性价比", "品质优先"];
const PREFS = ["美食", "历史", "自然", "亲子", "文艺", "购物"];

export default function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState("");
  const [query, setQuery] = useState("成都耍三天");
  const [destination, setDestination] = useState("成都");
  const [days, setDays] = useState(3);
  const [budget, setBudget] = useState("性价比");
  const [prefs, setPrefs] = useState<string[]>(["美食"]);
  const [saveMsg, setSaveMsg] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const closeStreamRef = useRef<(() => void) | null>(null);
  const toastIdRef = useRef(1);

  const itinerary = useItineraryStore((s) => s.itinerary);
  const setItinerary = useItineraryStore((s) => s.setItinerary);
  const startStreaming = useItineraryStore((s) => s.startStreaming);
  const setPhase = useItineraryStore((s) => s.setPhase);
  const setStatusText = useItineraryStore((s) => s.setStatus);
  const setSkeleton = useItineraryStore((s) => s.setSkeleton);
  const setDegraded = useItineraryStore((s) => s.setDegraded);
  const phase = useItineraryStore((s) => s.phase);

  const user = useAuthStore((s) => s.user);
  const loadMe = useAuthStore((s) => s.loadMe);
  const logout = useAuthStore((s) => s.logout);

  // 增量交通重算（防抖+seq），全局挂一次
  useTransitRefiner();

  function pushToast(message: string, kind: ToastKind = "info", action?: Toast["action"]) {
    const id = toastIdRef.current++;
    setToasts((items) => [...items.slice(-2), { id, message, kind, action }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 4200);
  }

  // 启动：恢复登录态
  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  // 后端连通 + 登录态下加载本人最近行程
  useEffect(() => {
    async function load() {
      try {
        await getHealth();
        setStatus("ok");
        if (user) {
          const summaries = await listItineraries();
          if (summaries.length > 0) {
            const full = await getItinerary(summaries[0].id);
            setItinerary(full);
          }
        }
      } catch (err: unknown) {
        setStatus("error");
        setDetail(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
  }, [setItinerary, user]);

  useEffect(() => {
    return () => closeStreamRef.current?.();
  }, []);

  // Ctrl+Z 撤销 / Ctrl+Shift+Z 重做（PRD §13.4）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          useTemporalStore.getState().redo();
          pushToast("已重做上一处编辑", "info");
        } else {
          useTemporalStore.getState().undo();
          pushToast("已撤销上一处编辑", "success", {
            label: "重做",
            onClick: () => useTemporalStore.getState().redo(),
          });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function togglePref(pref: string) {
    setPrefs((items) =>
      items.includes(pref) ? items.filter((item) => item !== pref) : [...items, pref],
    );
  }

  function buildPlanQuery() {
    const structured = `${destination}${days}天，${budget}`;
    const prefText = prefs.length > 0 ? `，偏好${prefs.join("、")}` : "";
    const freeText = query.trim();
    return freeText ? `${freeText}。条件：${structured}${prefText}` : `${structured}${prefText}`;
  }

  function handlePlan() {
    const planQuery = buildPlanQuery();
    if (!planQuery.trim()) return;
    setSaveMsg("");
    closeStreamRef.current?.();
    startStreaming();
    closeStreamRef.current = streamPlan(planQuery.trim(), {
      onStatus: setStatusText,
      onIntent: (intent) => {
        setDestination(intent.city);
        setDays(intent.day_count);
      },
      onSkeleton: setSkeleton,
      onDegraded: () => {
        setDegraded(true);
        pushToast("AI 暂不可用，已切换为热门推荐兜底", "warning");
      },
      onItinerary: setItinerary,
      onDone: () => {
        setPhase("done");
        closeStreamRef.current = null;
      },
      onError: () => {
        setPhase("error");
        closeStreamRef.current = null;
        pushToast("规划流连接中断，请重试", "error");
      },
    });
  }

  async function handleSave() {
    if (!itinerary) return;
    setSaveMsg("");
    try {
      const saved = await saveItinerary(itinerary);
      setItinerary(saved);
      setSaveMsg("已保存");
      pushToast("行程已保存到当前账号", "success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "保存失败";
      setSaveMsg(msg);
      pushToast(msg, "error");
    }
  }

  const label =
    status === "loading"
      ? "正在连接后端…"
      : status === "ok"
        ? "后端连接成功"
        : "后端连接失败";
  const planning = phase === "streaming";
  const totalStops =
    itinerary?.days.reduce((sum, day) => sum + day.stops.length, 0) ?? 0;
  const statusTone =
    status === "ok" ? "success" : status === "error" ? "danger" : "default";

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <div className="brand-mark">行</div>
          <div>
            <h1>智能旅游规划伴侣</h1>
            <p>把推荐、日程和地图放在同一个可编辑工作台里。</p>
          </div>
        </div>
        <div className="topbar-actions">
          <Badge tone={statusTone}>{label}</Badge>
          {user ? (
            <>
              <Badge>{user.email}</Badge>
              <Button variant="ghost" onClick={logout}>
                登出
              </Button>
            </>
          ) : (
            <Badge tone="warning">未登录，保存需登录</Badge>
          )}
        </div>
      </header>

      {detail && <Alert tone="error">{detail}</Alert>}

      {!user && (
        <section>
          <AuthPanel />
        </section>
      )}

      <section className="planner-card">
        <input
          className="planner-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handlePlan()}
          placeholder="例如：成都耍三天，爱吃辣"
        />
        <Button onClick={handlePlan} disabled={planning}>
          {planning ? "规划中…" : "开始规划"}
        </Button>

        <div className="chip-row" aria-label="规划条件">
          <span className="chip is-strong">
            目的地
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              aria-label="目的地"
              style={{
                width: 56,
                border: 0,
                background: "transparent",
                color: "inherit",
                fontWeight: 700,
              }}
            />
          </span>
          <span className="chip is-strong">
            天数
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="天数"
              style={{ border: 0, background: "transparent", color: "inherit" }}
            >
              {Array.from({ length: 7 }, (_, idx) => idx + 1).map((day) => (
                <option key={day} value={day}>
                  {day} 天
                </option>
              ))}
            </select>
          </span>
          {BUDGETS.map((item) => (
            <button
              key={item}
              className={`chip ${budget === item ? "is-strong" : ""}`}
              onClick={() => setBudget(item)}
              type="button"
            >
              {item}
            </button>
          ))}
          {PREFS.map((item) => (
            <button
              key={item}
              className={`chip ${prefs.includes(item) ? "is-strong" : ""}`}
              onClick={() => togglePref(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {/* 编辑工具条：撤销/重做 + 保存（PRD §13.4 / §8.2） */}
      {itinerary && (
        <div className="chip-row">
          <Badge tone={itinerary.status === "saved" ? "success" : "warning"}>
            {itinerary.status === "saved" ? "已保存" : "草稿"}
          </Badge>
          <Badge>
            {itinerary.city} · {itinerary.day_count} 天 · {totalStops} 个地点
          </Badge>
          <Button
            variant="ghost"
            onClick={() => {
              useTemporalStore.getState().undo();
              pushToast("已撤销上一处编辑", "success", {
                label: "重做",
                onClick: () => useTemporalStore.getState().redo(),
              });
            }}
          >
            撤销
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              useTemporalStore.getState().redo();
              pushToast("已重做上一处编辑", "info");
            }}
          >
            重做
          </Button>
          <Button
            variant={user ? "success" : "ghost"}
            onClick={handleSave}
            disabled={!user}
            title={user ? "" : "登录后可保存"}
          >
            保存行程
          </Button>
          {saveMsg && <span className="chip">{saveMsg}</span>}
        </div>
      )}

      {/* 双栏联动（PRD §13.1）：左日程表 ~40% / 右地图 ~60%；底部卡片流浮层 */}
      <div className="workspace">
        <section className="workspace-panel">
          <div className="panel-scroll">
            <div className="section-title">
              <div>
                <p className="section-kicker">Schedule</p>
                <h2>动态日程表</h2>
              </div>
              <Badge>可拖拽编辑</Badge>
            </div>
            {planning && <Alert>正在流式生成草案，骨架会逐步被真实内容替换。</Alert>}
            <Schedule />
          </div>
        </section>
        <section className="workspace-panel map-panel">
          <MapView />
        </section>
      </div>

      <Feed />
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Badge
                tone={
                  toast.kind === "success"
                    ? "success"
                    : toast.kind === "warning"
                      ? "warning"
                      : toast.kind === "error"
                        ? "danger"
                        : "default"
                }
              >
                {toast.kind === "success"
                  ? "成功"
                  : toast.kind === "warning"
                    ? "降级"
                    : toast.kind === "error"
                      ? "错误"
                      : "提示"}
              </Badge>
              <span style={{ flex: 1 }}>{toast.message}</span>
              {toast.action && (
                <Button variant="ghost" onClick={toast.action.onClick}>
                  {toast.action.label}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
