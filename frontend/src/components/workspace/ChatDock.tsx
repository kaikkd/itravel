import { useEffect, useRef, useState } from "react";
import { ArrowUp, Plus, Sparkles } from "lucide-react";
import { suggestItinerary } from "../../api/client";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useTripStore } from "../../store/tripStore";
import { useUiStore } from "../../store/uiStore";

function pickGreeting(dest: string): string {
  const h = new Date().getHours();
  const part =
    h < 6 ? "凌晨好" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
  const city = dest || "这趟旅行";
  const templates = [
    `${part}，想在${city}玩些什么？`,
    `${part}，这次去${city}，有什么特别想体验的吗？`,
    `${part}！告诉我你在${city}的偏好，我来帮你排行程。`,
    `${part}，${city}的美食、风景还是小众玩法，先安排哪样？`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

export default function ChatDock() {
  const origin = usePlanFlowStore((s) => s.origin);
  const returnCity = usePlanFlowStore((s) => s.returnCity);
  const dayCount = usePlanFlowStore((s) => s.dayCount);
  const primaryDestination = usePlanFlowStore((s) => s.primaryDestination)();
  const hasSuggestions = useTripStore((s) => s.hasSuggestions);
  const loading = useTripStore((s) => s.loadingSuggestions);
  const setLoading = useTripStore((s) => s.setLoadingSuggestions);
  const setSuggestions = useTripStore((s) => s.setSuggestions);
  const flashTick = useUiStore((s) => s.flashTick);

  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [greeting] = useState(() => pickGreeting(primaryDestination));
  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 外部信号（如中心提示结束）→ 边缘闪烁一次。
  useEffect(() => {
    if (flashTick === 0) return;
    setFlashing(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashing(false), 1000);
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [flashTick]);

  const inputStateClass = loading
    ? "input-pulse"
    : flashing
      ? "input-flash"
      : "";

  async function send() {
    const message = text.trim();
    if (!message || loading) return;
    setText("");
    setErrorMsg("");
    setReply("");
    setLoading(true);
    try {
      const resp = await suggestItinerary({
        destination: primaryDestination,
        origin,
        return_city: returnCity,
        day_count: dayCount,
        free_text: message,
      });
      setSuggestions(resp);
      setReply(
        resp.reply ||
          (resp.degraded
            ? "AI 暂不可用，已用热门候选兜底，去左侧空位挑选吧。"
            : "已整理好候选，点左侧闪烁的空位逐个添加。"),
      );
    } catch {
      setLoading(false);
      setErrorMsg("生成候选失败，请确认后端在运行后重试。");
    }
  }

  // 等待 LLM 时先显示推荐中；否则错误 > 回复 > 首条问候。
  const aiMessage = loading
    ? "itravel 正在为你推荐景点…"
    : errorMsg || reply || greeting;

  return (
    <div className="border-t border-line bg-surface px-4 py-3">
      <div className="w-full">
        {aiMessage && (
          <div className="mb-3 flex items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay text-white shadow-soft">
              <Sparkles className="h-4 w-4" />
            </div>
            <div
              className={`max-w-[88%] rounded-2xl rounded-tl-sm border border-line bg-ivory px-3.5 py-2 text-sm shadow-soft ${
                errorMsg ? "text-rose-500" : "text-ink"
              }`}
            >
              {aiMessage}
            </div>
          </div>
        )}
        <div
          className={`flex items-center gap-2 rounded-full border border-line bg-surface px-2 py-2 shadow-soft ${inputStateClass}`}
        >
          <button
            type="button"
            title="上传多媒体（即将支持）"
            aria-label="添加附件"
            className="flex h-9 w-9 items-center justify-center rounded-full text-stone transition-colors hover:bg-sand hover:text-ink"
          >
            <Plus className="h-5 w-5" />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={
              hasSuggestions
                ? "继续补充偏好，例如：第二天想轻松一点、爱吃辣…"
                : "和 itravel 聊聊：你想怎么玩？喜欢什么类型？"
            }
            className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-stone"
          />
          <button
            onClick={send}
            disabled={loading || !text.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-clay text-white transition-colors hover:bg-clay-bright disabled:opacity-40"
            aria-label="发送"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-2 text-center text-xs text-stone">
          {primaryDestination
            ? `已结合：${origin || "出发地"} → ${primaryDestination} · ${dayCount} 天`
            : "itravel 会结合你选择的城市与天数给出候选"}
        </div>
      </div>
    </div>
  );
}
