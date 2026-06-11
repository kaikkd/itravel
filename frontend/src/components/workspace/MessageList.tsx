import { useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin, Sparkles } from "lucide-react";
import type { ChatMessage, PlanChange } from "../../types";

function ChangeCard({ change }: { change: PlanChange }) {
  const [open, setOpen] = useState(false);
  const addedCount = change.added.reduce((n, d) => n + d.names.length, 0);
  if (addedCount === 0 && change.totalStops === 0) return null;

  const summary =
    addedCount > 0
      ? `已更新行程 · 新增 ${addedCount} 个地点`
      : `已更新行程 · 共 ${change.totalStops} 个地点`;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line bg-surface/70">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink transition-colors hover:bg-sand/50"
      >
        <MapPin className="h-3.5 w-3.5 text-clay" />
        <span className="flex-1">{summary}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-stone transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-line px-3 py-2 change-detail">
          {change.added.length === 0 ? (
            <p className="text-xs text-stone">本轮微调了顺序或交通，未新增地点。</p>
          ) : (
            change.added.map((d) => (
              <div key={d.dayIndex} className="text-xs text-stone">
                <span className="font-semibold text-ink">第 {d.dayIndex} 天</span>
                ：{d.names.join("、")}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end chat-enter">
        <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-clay px-3.5 py-2 text-sm text-white shadow-soft">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 chat-enter">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay text-white shadow-soft">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="max-w-[88%]">
        <div className="rounded-2xl rounded-tl-sm border border-line bg-ivory px-3.5 py-2 text-sm text-ink shadow-soft">
          {msg.pending ? <TypingDots /> : msg.content}
        </div>
        {!msg.pending && msg.change && <ChangeCard change={msg.change} />}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="typing-dot" />
      <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
      <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
    </span>
  );
}

export default function MessageList({
  messages,
  loading,
  statusText,
}: {
  messages: ChatMessage[];
  loading: boolean;
  statusText: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, statusText]);

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <Bubble key={m.id} msg={m} />
      ))}
      {loading && statusText && (
        <div className="flex items-center gap-2 pl-10 text-xs text-stone status-enter">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" />
          {statusText}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
