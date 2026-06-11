import { useEffect } from "react";
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
} from "react-router-dom";
import IntroGate from "./components/flow/IntroGate";
import OriginDestinationStep from "./components/flow/OriginDestinationStep";
import RouteStartChoice from "./components/flow/RouteStartChoice";
import CityChatStep from "./components/flow/CityChatStep";
import AttractionBoardStep from "./components/flow/AttractionBoardStep";
import PaceChoiceStep from "./components/flow/PaceChoiceStep";
import WorkspaceLayout from "./components/workspace/WorkspaceLayout";
import AuthDialog from "./components/auth/AuthDialog";
import Toast from "./components/Toast";
import RequireFlow from "./components/RequireFlow";
import { useAuthStore } from "./store/authStore";

// 根布局：路由出口 + 全局浮层（登录弹窗 / Toast 跨路由持久挂载）。
function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  return (
    <>
      <Outlet />
      <AuthDialog />
      <Toast />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <IntroGate /> },
      {
        path: "/plan/cities",
        element: (
          <RequireFlow need="mode">
            <OriginDestinationStep />
          </RequireFlow>
        ),
      },
      {
        path: "/plan/route",
        element: (
          <RequireFlow need="mode">
            <RouteStartChoice />
          </RequireFlow>
        ),
      },
      {
        path: "/plan/route/city-chat",
        element: (
          <RequireFlow need="mode">
            <CityChatStep />
          </RequireFlow>
        ),
      },
      {
        path: "/plan/route/attractions",
        element: (
          <RequireFlow need="draft">
            <AttractionBoardStep />
          </RequireFlow>
        ),
      },
      {
        path: "/plan/route/pace",
        element: (
          <RequireFlow need="draft">
            <PaceChoiceStep />
          </RequireFlow>
        ),
      },
      { path: "/workspace", element: <WorkspaceLayout /> },
      { path: "*", element: <IntroGate /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
