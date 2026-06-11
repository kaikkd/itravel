import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "../store/themeStore";
import { cn } from "../lib/utils";

export default function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={dark ? "切换到浅色" : "切换到深色"}
      aria-label="切换主题"
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-clay hover:text-clay active:scale-95",
        className,
      )}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
