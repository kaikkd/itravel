import { Navigate } from "react-router-dom";
import { usePlanFlowStore } from "../store/planFlowStore";
import { useItineraryStore } from "../store/itineraryStore";

// 路由守卫：硬刷新缺前置状态时重定向回安全步骤（向导状态在 store，不在 URL）。
type Need = "mode" | "cities" | "routeCity" | "draft" | "itinerary";

export default function RequireFlow({
  need,
  children,
}: {
  need: Need;
  children: React.ReactNode;
}) {
  const mode = usePlanFlowStore((s) => s.mode);
  const destinations = usePlanFlowStore((s) => s.destinations);
  const routeCity = usePlanFlowStore((s) => s.routeCity);
  const hasItinerary = useItineraryStore((s) => s.itinerary != null);

  let ok = true;
  let to = "/";
  switch (need) {
    case "mode":
      ok = mode != null;
      to = "/";
      break;
    case "cities":
      ok = destinations.length > 0 || mode === "traffic_first";
      to = "/plan/cities";
      break;
    case "routeCity":
      ok = mode === "route_first";
      to = "/plan/route";
      break;
    case "draft":
      ok = Boolean(routeCity);
      to = "/plan/route";
      break;
    case "itinerary":
      ok = hasItinerary;
      to = "/";
      break;
  }

  if (!ok) return <Navigate to={to} replace />;
  return <>{children}</>;
}
