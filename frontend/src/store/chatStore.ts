import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ChatMessage, PlanChange } from "../types";

// 对话记录（PRD「弱聊天」）：多轮气泡 + AI 计划改动折叠卡。
// 与 itineraryStore 并列：messages 供对话区渲染，也回传后端作 history 上下文。

let _msgSeq = 1;
function nextMsgId(): string {
  return `m-${_msgSeq++}`;
}

interface ChatState {
  messages: ChatMessage[];
  addUser: (content: string) => void;
  addPendingAssistant: () => string; // 返回消息 id
  resolveAssistant: (id: string, content: string, change?: PlanChange) => void;
  failAssistant: (id: string, content: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  immer((set) => ({
    messages: [],
    addUser: (content) =>
      set((state) => {
        state.messages.push({ id: nextMsgId(), role: "user", content });
      }),
    addPendingAssistant: () => {
      const id = nextMsgId();
      set((state) => {
        state.messages.push({
          id,
          role: "assistant",
          content: "",
          pending: true,
        });
      });
      return id;
    },
    resolveAssistant: (id, content, change) =>
      set((state) => {
        const msg = state.messages.find((m) => m.id === id);
        if (msg) {
          msg.content = content;
          msg.pending = false;
          msg.change = change;
        }
      }),
    failAssistant: (id, content) =>
      set((state) => {
        const msg = state.messages.find((m) => m.id === id);
        if (msg) {
          msg.content = content;
          msg.pending = false;
        }
      }),
    reset: () =>
      set((state) => {
        state.messages = [];
      }),
  })),
);
