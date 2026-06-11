import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, MapPin, Sparkles } from "lucide-react";
import { suggestCity, type CityOption, type ChatTurnPayload } from "../../api/client";
import { usePlanFlowStore } from "../../store/planFlowStore";
import { useDraftPoisStore } from "../../store/draftPoisStore";

interface Bubble {
  role: "user" | "assistant";
  text: string;
}

// route_first path B：还没定城市，先聊兴趣让 AI 推荐候选城市。
export default function CityChatStep() {
  const navigate = useNavigate();
  const setRouteCity = usePlanFlowStore((s) => s.setRouteCity);
  const setDraftCity = useDraftPoisStore((s) => s.setCity);

  const [messages, setMessages] = useState<Bubble[]>([
    { role: "assistant", text: "想看什么样的风景？比如「海边吃海鲜」「古镇慢生活」「雪山徒步」，我来帮你挑城市。" },
  ]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function send() {
    const msg = text.trim();
    if (!msg || loading) return;
    setText("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setLoading(true);
    const history: ChatTurnPayload[] = messages.map((m) => ({
      role: m.role,
      content: m.text,
    }));
    try {
      const res = await suggestCity(msg, history);
      setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
      setCities(res.cities);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "推荐失败了，确认后端在运行后再试一次？" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function pickCity(city: string) {
    if (leaving) return;
    setRouteCity(city);
    setDraftCity(city);
    setLeaving(true);
    window.setTimeout(() => navigate("/plan/route/attractions"), 460);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div
        className="floating-card flex h-[72vh] w-full max-w-2xl flex-col overflow-hidden"
        style={{
          animation: leaving ? "var(--animate-rise-out)" : "var(--animate-rise-in)",
        }}
      >
        <div className="border-b border-line px-6 py-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-clay">
            <Sparkles className="h-3.5 w-3.5" />
            和 itravel 聊聊，帮你挑城市
          </div>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-ink">你想看什么样的风景？</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end chat-enter">
                <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-clay px-3.5 py-2 text-sm text-white shadow-soft">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2 chat-enter">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay text-white shadow-soft">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-line bg-ivory px-3.5 py-2 text-sm text-ink shadow-soft">
                  {m.text}
                </div>
              </div>
            ),
          )}

          {cities.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-10 chat-enter">
              {cities.map((c) => (
                <button
                  key={c.name}
                  onClick={() => pickCity(c.name)}
                  className="group flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-clay"
                >
                  <MapPin className="h-4 w-4 text-clay" />
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span className="text-xs text-stone">{c.reason}</span>
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 pl-10 text-xs text-stone">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" />
              itravel 正在挑城市…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-line px-6 py-4">
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-2 py-2 shadow-soft">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="描述你的兴趣，如：想去看海、吃海鲜、节奏慢一点"
              className="h-9 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-stone"
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
    </div>
  );
}
