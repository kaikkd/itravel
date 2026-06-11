import { useEffect } from "react";
import IntroGate from "./components/flow/IntroGate";
import OriginDestinationStep from "./components/flow/OriginDestinationStep";
import WorkspaceLayout from "./components/workspace/WorkspaceLayout";
import AuthDialog from "./components/auth/AuthDialog";
import Toast from "./components/Toast";
import { usePlanFlowStore } from "./store/planFlowStore";
import { useAuthStore } from "./store/authStore";

export default function App() {
  const phase = usePlanFlowStore((s) => s.phase);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // 仅用已存 token 尝试恢复会话；无 token 保持访客态（不再静默登录）。
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <>
      {phase === "intro" && <IntroGate />}
      {phase === "places" && <OriginDestinationStep />}
      {phase === "workspace" && <WorkspaceLayout />}
      <AuthDialog />
      <Toast />
    </>
  );
}
