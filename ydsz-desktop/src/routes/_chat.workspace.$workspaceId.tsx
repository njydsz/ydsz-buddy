/**
 * @file 工作区详情路由模块
 * @description 处理指定工作区的详情页面渲染，根据 URL 参数中的 workspaceId 加载对应的工作区视图。
 *   如果指定的工作区不存在且存在备用工作区，则自动重定向到备用工作区。
 * @layer 路由层
 * @depends WorkspaceView, useWorkspaceStore
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import WorkspaceView from "~/components/WorkspaceView";
import { useWorkspaceStore } from "~/workspaceStore";

/**
 * 工作区详情路由视图组件
 * @description 根据 URL 参数加载指定工作区，如果工作区不存在则返回 null 或重定向到备用工作区
 * @returns 工作区视图组件或 null
 */
function WorkspaceRouteView() {
  const navigate = useNavigate();
  const { workspaceId } = Route.useParams();
  const workspace = useWorkspaceStore((state) =>
    state.workspacePages.find((entry) => entry.id === workspaceId),
  );
  const fallbackWorkspaceId = useWorkspaceStore((state) => state.workspacePages[0]?.id ?? null);

  useEffect(() => {
    if (workspace || !fallbackWorkspaceId) {
      return;
    }
    void navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: fallbackWorkspaceId },
      replace: true,
    });
  }, [fallbackWorkspaceId, navigate, workspace]);

  if (!workspace) {
    return null;
  }

  return <WorkspaceView workspaceId={workspace.id} />;
}

/**
 * 工作区详情路由配置
 * @description 定义 /_chat/workspace/$workspaceId 路由，用于渲染特定工作区的详情页面
 */
export const Route = createFileRoute("/_chat/workspace/$workspaceId")({
  component: WorkspaceRouteView,
});
