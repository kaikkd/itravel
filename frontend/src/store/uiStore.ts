import { create } from "zustand";

// 轻量 UI 信号：对话框边缘闪烁、登录弹窗、Toast。
interface UiState {
  flashTick: number;
  bumpFlash: () => void;

  // 登录/注册弹窗：afterAuth 在登录成功后回调（如继续保存）。
  authOpen: boolean;
  afterAuth: (() => void) | null;
  openAuth: (afterAuth?: () => void) => void;
  closeAuth: () => void;

  // 轻量 Toast
  toast: string;
  toastTick: number;
  showToast: (text: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  flashTick: 0,
  bumpFlash: () => set((state) => ({ flashTick: state.flashTick + 1 })),

  authOpen: false,
  afterAuth: null,
  openAuth: (afterAuth) => set({ authOpen: true, afterAuth: afterAuth ?? null }),
  closeAuth: () => set({ authOpen: false, afterAuth: null }),

  toast: "",
  toastTick: 0,
  showToast: (text) =>
    set((state) => ({ toast: text, toastTick: state.toastTick + 1 })),
}));
