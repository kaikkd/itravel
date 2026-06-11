import { useEffect } from "react";
import IntroGate from "./components/flow/IntroGate";
import OriginDestinationStep from "./components/flow/OriginDestinationStep";
import WorkspaceLayout from "./components/workspace/WorkspaceLayout";
import { usePlanFlowStore } from "./store/planFlowStore";
import { useAuthStore } from "./store/authStore";

export default function App() {
  const phase = usePlanFlowStore((s) => s.phase);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // 无登录页：进入即用默认管理员静默建立会话。
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (phase === "intro") return <IntroGate />;
  if (phase === "places") return <OriginDestinationStep />;
  return <WorkspaceLayout />;
}
