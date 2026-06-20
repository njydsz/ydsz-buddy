/**
 * @file 工作区索引路由
 * @description 工作区路由的索引页面，自动重定向到第一个可用的工作区页面。
 * 当用户访问 `/_chat/workspace/` 时，从工作区存储中读取第一个工作区 ID，
 * 并通过 `replace` 导航跳转到对应的工作区详情页，避免在历史记录中留下中间页。
 * @layer 路由页面
 * @exports Route - TanStack Router 路由定义，路径为 `/_chat/workspace/`
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useWorkspaceStore } from "~/workspaceStore";

/**
 * 工作区索引路由视图组件
 * @description 读取第一个工作区 ID 并自动重定向到该工作区详情页。
 * 使用 `redirectedRef` 确保仅在首次检测到有效 ID 时执行一次跳转，
 * 避免重复导航。无工作区时渲染空内容。
 */
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

  return null;
}

/** 工作区索引路由定义，组件为 WorkspaceIndexRouteView */
export const Route = createFileRoute("/_chat/workspace/")({
  component: WorkspaceIndexRouteView,
});
