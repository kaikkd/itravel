import { useEffect, useRef, useState } from "react";
import { ArrowUp, Plus, Sparkles } from "lucide-react";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useItineraryStore } from "../../store/itineraryStore";
import { useChatStore } from "../../store/chatStore";
import { useUiStore } from "../../store/uiStore";
import { runPlan } from "../../lib/planController";
import MessageList from "./MessageList";

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
  const phase = useItineraryStore((s) => s.phase);
  const statusText = useItineraryStore((s) => s.statusText);
  const messages = useChatStore((s) => s.messages);
  const flashTick = useUiStore((s) => s.flashTick);

  const loading = phase === "streaming";
  const hasMessages = messages.length > 0;

  const [text, setText] = useState("");
  const [greeting] = useState(() => pickGreeting(primaryDestination));
  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

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

  useEffect(() => () => cancelRef.current?.(), []);

  const inputStateClass = loading ? "input-pulse" : flashing ? "input-flash" : "";

  function send() {
    const message = text.trim();
    if (!message || loading) return;
    setText("");
    cancelRef.current = runPlan({
      destination: primaryDestination,
      origin,
      returnCity,
      dayCount,
      freeText: message,
    });
  }

  return (
    <div className="flex flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-clay text-white">
          <Sparkles className="h-3 w-3" />
        </div>
        <span className="text-xs font-semibold text-ink">和 itravel 对话</span>
      </div>

      <div className="max-h-[18vh] min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {hasMessages ? (
          <MessageList
            messages={messages}
            loading={loading}
            statusText={statusText}
          />
        ) : (
          <div className="flex items-start gap-2 chat-enter">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay text-white shadow-soft">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-line bg-ivory px-3.5 py-2 text-sm text-ink shadow-soft">
              {greeting}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-3 pt-1">
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
              hasMessages
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
      </div>
    </div>
  );
}
