import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useUiStore } from "../store/uiStore";

// 轻量全局 Toast：监听 uiStore.toastTick，弹入后约 2.6s 自动消失。
export default function Toast() {
  const toast = useUiStore((s) => s.toast);
  const toastTick = useUiStore((s) => s.toastTick);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (toastTick === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(t);
  }, [toastTick]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="toast-in flex items-center gap-2 rounded-full border border-line bg-ink px-4 py-2.5 text-sm font-semibold text-cream shadow-float">
        <CheckCircle2 className="h-4 w-4 text-moss" />
        {toast}
      </div>
    </div>
  );
}
