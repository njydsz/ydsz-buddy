// FILE: ParallelSessionsPanel.tsx
// Purpose: Sidebar 跨工程并行任务聚合面板。
//   聚合所有 workspace 下 session.status === "running" 的 thread,
//   按 project 分组展示,点击可跳转到对应 thread,实现「跨工程并行任务」可视化。
// Layer: Sidebar presentation component
// Exports: ParallelSessionsPanel

import { type Project, type SidebarThreadSummary } from "../types";
import { useStore } from "../store";
import { useNavigate } from "@tanstack/react-router";
import { useMessages } from "../i18n";
import { useMemo } from "react";
import { cn } from "~/lib/utils";
import { LoaderCircleIcon } from "~/lib/icons";

interface ParallelSessionGroup {
  project: Project;
  threads: SidebarThreadSummary[];
}

/**
 * 跨工程并行任务聚合面板。
 *
 * 从全局 store 读取所有 sidebar thread summary,过滤出 session.status === "running"
 * 的条目,按 project 分组后渲染为可点击列表。无运行任务时返回 null,不占位。
 *
 * 设计取舍:
 * - 不引入新的 store(复用 sidebarThreadSummaryById + projects),避免 v4→v5 迁移风险
 * - 不改后端(Reactor 已支持多 thread 异步并行,前端聚合即可)
 * - 仅在 Sidebar 渲染,不污染 ChatView
 */
export function ParallelSessionsPanel() {
  const sidebarThreadSummaryById = useStore((store) => store.sidebarThreadSummaryById);
  const projects = useStore((store) => store.projects);
  const navigate = useNavigate();
  const messages = useMessages();

  const { groups, totalRunning } = useMemo(() => {
    const runningThreads: SidebarThreadSummary[] = Object.values(
      sidebarThreadSummaryById,
    ).filter((thread) => thread.session?.status === "running");

    if (runningThreads.length === 0) {
      return { groups: [] as ParallelSessionGroup[], totalRunning: 0 };
    }

    const projectById = new Map<string, Project>(projects.map((p) => [p.id, p]));
    const grouped = new Map<string, SidebarThreadSummary[]>();
    for (const thread of runningThreads) {
      const list = grouped.get(thread.projectId) ?? [];
      list.push(thread);
      grouped.set(thread.projectId, list);
    }

    const result: ParallelSessionGroup[] = [];
    for (const [projectId, threads] of grouped) {
      const project = projectById.get(projectId);
      if (!project) {
        // project 已被删除的孤儿 thread,跳过(不展示无法定位工程的运行任务)
        continue;
      }
      // 按 updatedAt 倒序,最近活跃在前
      threads.sort((a, b) => {
        const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return bTime - aTime;
      });
      result.push({ project, threads });
    }
    // 工程间按运行任务数倒序,任务多的工程在前
    result.sort((a, b) => b.threads.length - a.threads.length);

    return { groups: result, totalRunning: runningThreads.length };
  }, [sidebarThreadSummaryById, projects]);

  if (totalRunning === 0) {
    return null;
  }

  const handleOpenThread = (threadId: string) => {
    void navigate({ to: "/$threadId", params: { threadId } });
  };

  return (
    <div
      className="mx-1.5 mb-1.5 rounded-lg border border-border/60 bg-(--sidebar-accent)/30 px-2 py-1.5"
      role="region"
      aria-label={messages.sidebar.parallelSessions}
      data-testid="parallel-sessions-panel"
    >
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <LoaderCircleIcon className="size-3.5 animate-spin text-emerald-500" />
        <span className="text-[11px] font-medium text-foreground/85">
          {messages.sidebar.parallelSessions}
        </span>
        <span className="ml-auto text-[10px] font-normal text-muted-foreground/70">
          {messages.sidebar.parallelSessionsRunning(totalRunning)}
        </span>
      </div>
      <ul className="space-y-0.5">
        {groups.map(({ project, threads }) =>
          threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => handleOpenThread(thread.id)}
                className={cn(
                  "group/parallel-session flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left",
                  "hover:bg-(--sidebar-accent) transition-colors",
                )}
                title={thread.title || thread.id}
                data-testid={`parallel-session-${thread.id}`}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-normal text-foreground/80">
                  {thread.title || thread.id}
                </span>
                <span className="shrink-0 truncate text-[10px] font-normal text-muted-foreground/60">
                  {project.localName || project.name}
                </span>
              </button>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}
