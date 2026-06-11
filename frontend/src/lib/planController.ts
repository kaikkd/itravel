import { streamPlan } from "../api/client";
import type { ChatTurnPayload, PlanStreamRequest } from "../api/client";
import { useChatStore } from "../store/chatStore";
import { useItineraryStore } from "../store/itineraryStore";
import type { Itinerary, PlanChange } from "../types";

// 把 SSOT 行程序列化为后端 ItineraryCreate 形态（无 id），用于多轮最小改动。
function toCurrentPlan(itinerary: Itinerary | null): unknown {
  if (!itinerary || itinerary.days.every((d) => d.stops.length === 0)) {
    return undefined;
  }
  return {
    title: itinerary.title,
    city: itinerary.city,
    status: "draft",
    days: itinerary.days.map((d) => ({
      day_index: d.day_index,
      stops: d.stops.map((s) => ({
        order_index: s.order_index,
        arrive_time: s.arrive_time,
        stay_minutes: s.stay_minutes,
        poi: {
          name: s.poi.name,
          category: s.poi.category,
          lng: s.poi.lng,
          lat: s.poi.lat,
          address: s.poi.address,
          rec_reason: s.poi.rec_reason,
        },
      })),
      transits: [],
    })),
  };
}

// 比较规划前后，得出本轮 AI 新增了哪些 POI（用于对话折叠卡）。
function diffPlan(before: Itinerary | null, after: Itinerary): PlanChange {
  const beforeNames = new Set<string>();
  before?.days.forEach((d) => d.stops.forEach((s) => beforeNames.add(`${d.day_index}:${s.poi.name}`)));
  const added: { dayIndex: number; names: string[] }[] = [];
  let total = 0;
  for (const day of after.days) {
    const fresh = day.stops
      .filter((s) => !beforeNames.has(`${day.day_index}:${s.poi.name}`))
      .map((s) => s.poi.name);
    total += day.stops.length;
    if (fresh.length) added.push({ dayIndex: day.day_index, names: fresh });
  }
  return { city: after.city, dayCount: after.days.length, added, totalStops: total };
}

export interface RunPlanArgs {
  destination: string;
  origin?: string;
  returnCity?: string;
  dayCount?: number;
  freeText: string;
}

// 驱动一次流式规划：把用户消息入对话，流式填充 SSOT，结束后结算 AI 回复 + 改动卡。
export function runPlan(args: RunPlanArgs): () => void {
  const chat = useChatStore.getState();
  const itin = useItineraryStore.getState();

  chat.addUser(args.freeText);
  const assistantId = chat.addPendingAssistant();

  const before = itin.itinerary;
  const history: ChatTurnPayload[] = useChatStore
    .getState()
    .messages.filter((m) => !m.pending && m.content)
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content }));

  itin.startStreaming();

  let replyText = "";

  const req: PlanStreamRequest = {
    destination: args.destination,
    origin: args.origin ?? "",
    return_city: args.returnCity ?? "",
    day_count: args.dayCount ?? 3,
    free_text: args.freeText,
    history,
    current_plan: toCurrentPlan(before),
  };

  return streamPlan(req, {
    onStatus: (text) => useItineraryStore.getState().setStatus(text),
    onSkeleton: (skeleton) => useItineraryStore.getState().setSkeleton(skeleton),
    onReply: (text) => {
      replyText = text;
    },
    onDay: (day) => useItineraryStore.getState().applyDay(day),
    onDegraded: () => useItineraryStore.getState().setDegraded(true),
    onItinerary: (itinerary) => useItineraryStore.getState().setItinerary(itinerary),
    onDone: () => {
      const after = useItineraryStore.getState().itinerary;
      const change = after ? diffPlan(before, after) : undefined;
      useChatStore.getState().resolveAssistant(
        assistantId,
        replyText || "已为你更新行程，左侧可继续微调。",
        change,
      );
    },
    onError: () => {
      useItineraryStore.getState().setPhase("error");
      useChatStore
        .getState()
        .failAssistant(assistantId, "生成失败，请确认后端在运行后重试。");
    },
  });
}
