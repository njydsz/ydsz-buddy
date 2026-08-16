/**
 * @file Pull Requests 路由模块
 * @description 在共享聊天外壳下注册独立的 GitHub Pull Requests 浏览器路由,
 *   对应 /_chat/pulls 路径,渲染 PullRequestBrowser 组件。
 *   用户可在不进入对话线程的情况下直接浏览当前工作区的 GitHub PRs,
 *   并执行合并 / 关闭 / 重开 / 评论等操作(依赖系统 `gh` CLI 已认证)。
 * @layer 路由层
 */

import { useNavigate } from "@tanstack/react-router";

import { AppTopChrome } from "~/components/AppTopChrome";
import { PullRequestBrowser } from "~/components/PullRequestBrowser";
import { YdszBuddyWordmark } from "~/components/Sidebar";
import { SidebarInset } from "~/components/ui/sidebar";
import { GitPullRequestIcon } from "~/lib/icons";
import { useMessages } from "~/i18n/I18nContext";
import { useWorkspaceStore } from "~/workspaceStore";

export function Component() {
  const messages = useMessages();
  const navigate = useNavigate();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspace = useWorkspaceStore((state) =>
    state.workspacePages.find((entry) => entry.id === activeWorkspaceId) ??
      state.workspacePages[0] ??
      null,
  );
  const cwd = workspace?.cwd ?? null;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <AppTopChrome
          logo={
            <span className="inline-flex size-5 shrink-0 items-center justify-center">
              <YdszBuddyWordmark />
            </span>
          }
          title={
            <h2 className="flex max-w-[clamp(16rem,50vw,40rem)] cursor-default items-center gap-2 truncate text-sm font-medium text-foreground">
              <GitPullRequestIcon className="size-4 shrink-0" aria-hidden />
              {messages.sidebar.pullsLabel}
            </h2>
          }
        />
        <div className="min-h-0 min-w-0 flex-1">
          {cwd ? (
            <PullRequestBrowser
              mode="sidebar"
              projectCwd={cwd}
              onClose={() => {
                void navigate({ to: "/" });
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6">
              <div className="flex max-w-md flex-col items-center gap-3 text-center select-none">
                <GitPullRequestIcon className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {messages.sidebar.pullsNoWorkspace}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}
