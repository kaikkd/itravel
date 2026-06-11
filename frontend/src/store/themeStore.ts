import { create } from "zustand";

// 主题：浅色默认，可手动切换深色，localStorage 记忆。
// 首屏防闪烁由 index.html 内联脚本在 paint 前给 <html> 加 .dark；此处保持状态同步。
export type Theme = "light" | "dark";

const STORAGE_KEY = "itravel_theme";

function readInitial(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function apply(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readInitial(),
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    apply(next);
    set({ theme: next });
  },
  setTheme: (theme) => {
    apply(theme);
    set({ theme });
  },
}));
