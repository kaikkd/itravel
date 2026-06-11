import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { getItinerary, listItineraries } from "../../api/client";
import { useItineraryStore } from "../../store/itineraryStore";
import { useUiStore } from "../../store/uiStore";
import type { ItinerarySummary } from "../../types";

export default function MyTripsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [trips, setTrips] = useState<ItinerarySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const setItinerary = useItineraryStore((s) => s.setItinerary);
  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listItineraries()
      .then(setTrips)
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, [open]);

  async function loadTrip(id: number) {
    try {
      const itinerary = await getItinerary(id);
      setItinerary(itinerary);
      onOpenChange(false);
      showToast("已载入行程");
    } catch {
      showToast("载入失败，请重试");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-line bg-surface">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-ink">我的行程</DialogTitle>
          <DialogDescription className="text-stone">
            已保存的行程，点击载入到工作台继续编辑。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-stone">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          )}
          {!loading && trips.length === 0 && (
            <p className="py-8 text-center text-sm text-stone">
              还没有保存的行程，规划完成后点「保存计划」即可。
            </p>
          )}
          {trips.map((t) => (
            <button
              key={t.id}
              onClick={() => loadTrip(t.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-ivory p-4 text-left transition-all hover:border-clay"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clay-soft text-clay">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">{t.title}</div>
                <div className="text-xs text-stone">
                  {t.city} · {t.day_count} 天
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
