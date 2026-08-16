/**
 * @file Linear Tasks 路由模块
 * @description 在共享聊天外壳下注册独立的 Linear 任务浏览器路由,
 *   对应 /_chat/linear 路径,渲染 LinearTaskBrowser 组件。
 *   用户可在不进入对话线程的情况下直接浏览 Linear 任务,
 *   并从任务创建 worktree 线程(依赖已通过 setup 视图配置 API Key)。
 * @layer 路由层
 */

import { useNavigate } from "@tanstack/react-router";

import { AppTopChrome } from "~/components/AppTopChrome";
import { LinearTaskBrowser } from "~/components/LinearTaskBrowser";
import { YdszBuddyWordmark } from "~/components/Sidebar";
import { SidebarInset } from "~/components/ui/sidebar";
import { ListTodoIcon } from "~/lib/icons";
import { useMessages } from "~/i18n/I18nContext";
import { useWorkspaceStore } from "~/workspaceStore";
import { useFocusedChatContext } from "~/focusedChatContext";
import { ThreadId } from "@ydsz-buddy/contracts";

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
  // workspace 关联的 threadId(v4 起 workspace 真正承载 AI 会话);
  // 用于 LinearTaskBrowser 内部从任务创建线程时校验上下文。
  const workspaceThreadId = workspace?.threadId ?? null;
  const { activeProjectId } = useFocusedChatContext();

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
              <ListTodoIcon className="size-4 shrink-0" aria-hidden />
              {messages.sidebar.linearLabel}
            </h2>
          }
        />
        <div className="min-h-0 min-w-0 flex-1">
          {cwd ? (
            <LinearTaskBrowser
              mode="sidebar"
              threadId={
                (workspaceThreadId
                  ? ThreadId.makeUnsafe(workspaceThreadId)
                  : null) ?? ThreadId.makeUnsafe("workspace:linear")
              }
              projectCwd={cwd}
              projectId={activeProjectId}
              onClose={() => {
                void navigate({ to: "/" });
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6">
              <div className="flex max-w-md flex-col items-center gap-3 text-center select-none">
                <ListTodoIcon className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {messages.sidebar.linearNoWorkspace}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}
