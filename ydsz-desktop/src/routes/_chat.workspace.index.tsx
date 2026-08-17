/**
 * @file 工作区首页路由组件
 * @description 处理工作区首页的路由逻辑，自动重定向到第一个工作区页面。
 *   如果没有任何工作区，则显示代码模式的着陆页。
 * @layer 路由层
 * @depends 工作区管理, 着陆页组件
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { UnifiedLandingPage } from "../components/UnifiedLandingPage";
import { AppTopChrome } from "../components/AppTopChrome";
import { LandingModeSwitcher } from "../components/LandingModeSwitcher";
import { YdszBuddyWordmark } from "../components/Sidebar";
import { SidebarInset } from "../components/ui/sidebar";
import { useWorkspaceStore } from "../workspaceStore";

function WorkspaceIndexRouteView() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((state) => state.workspacePages[0]?.id ?? null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!workspaceId || redirectedRef.current) {
      return;
    }
    redirectedRef.current = true;
    void navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId },
      replace: true,
    });
  }, [navigate, workspaceId]);

  if (workspaceId) {
    return null;
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <AppTopChrome
          logo={
            <span className="inline-flex size-5 shrink-0 items-center justify-center">
              <YdszBuddyWordmark />
            </span>
          }
          title={<LandingModeSwitcher mode="code" />}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <UnifiedLandingPage mode="code" />
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/workspace/")({
  component: WorkspaceIndexRouteView,
});
