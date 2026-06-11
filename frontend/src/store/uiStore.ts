import { create } from "zustand";

// 轻量 UI 信号：用自增计数触发对话框边缘的一次性闪烁。
interface UiState {
  flashTick: number;
  bumpFlash: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  flashTick: 0,
  bumpFlash: () => set((state) => ({ flashTick: state.flashTick + 1 })),
}));
