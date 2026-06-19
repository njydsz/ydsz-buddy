import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { rpc } from "@/lib/rpc";
import { useAppStore } from "@/store";
import { SidebarSearchPalette } from "./SidebarSearchPalette";
import { useTheme } from "@/hooks/useTheme";
import { useT } from "@/i18n";
import { ProviderHealthBar } from "./ProviderHealthBar";
import { TransportStatusBanner } from "./TransportStatusBanner";
import { useTransportState } from "@/hooks/useTransport";
import { toast } from "@/lib/toast";
import { log } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { APP_DISPLAY_NAME, APP_VERSION } from "@/lib/branding";

const PROJECT_COLLAPSE_KEY = "remi:project:expanded";

function readExpandedProjectIds(): string[] {
  try {
    const raw = window.localStorage.getItem(PROJECT_COLLAPSE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeExpandedProjectIds(ids: string[]) {
  try {
    window.localStorage.setItem(PROJECT_COLLAPSE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function Sidebar() {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const activeThreadId = (params as { threadId?: string }).threadId ?? null;

  const projects = useAppStore((s) => s.projects);
  const threads = useAppStore((s) => s.threads);
  const setActiveThread = useAppStore((s) => s.setActiveThread);
  const setProjects = useAppStore((s) => s.setProjects);
  const setThreads = useAppStore((s) => s.setThreads);
  const setThreadsHydrated = useAppStore((s) => s.setThreadsHydrated);
  const setTransport = useAppStore((s) => s.setTransport);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const { theme, toggle: toggleTheme } = useTheme();
  const transport = useTransportState();

  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>(
    () => readExpandedProjectIds(),
  );

  const queryClient = useQueryClient();

  // Hydrate the projects + threads from the server. The query is
  // reactive: when the WebSocket re-emits the welcome snapshot, we
  // refresh the queries. The `staleTime: Infinity` keeps the list
  // stable until the server pushes an update.
  const projectsQuery = useQuery({
    queryKey: ["projects", "list"],
    queryFn: () => rpc.projectsList(),
    refetchInterval: transport === "open" ? 30_000 : false,
  });

  const threadsQuery = useQuery({
    queryKey: ["threads", "list"],
    queryFn: () => rpc.threadList(),
    refetchInterval: transport === "open" ? 30_000 : false,
  });

  useEffect(() => {
    if (projectsQuery.data) setProjects(projectsQuery.data);
  }, [projectsQuery.data, setProjects]);

  useEffect(() => {
    if (threadsQuery.data) {
      setThreads(threadsQuery.data);
      setThreadsHydrated(true);
    }
  }, [threadsQuery.data, setThreads, setThreadsHydrated]);

  // Track transport state in the store so other components can read it.
  useEffect(() => {
    setTransport(transport);
  }, [transport, setTransport]);

  const upsertProject = useMutation({
    mutationFn: (input: { name: string; cwd: string }) =>
      rpc.projectsAdd(input),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      toast.success(`Added project ${project.name}`);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      log.error("projects.add failed", { error: e.message });
    },
  });

  const onToggleProject = (id: string) => {
    setExpandedProjectIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      writeExpandedProjectIds(next);
      return next;
    });
  };

  const onSelectThread = (id: string) => {
    setActiveThread(id);
    navigate({ to: "/$threadId", params: { threadId: id } });
  };

  const grouped = useMemo(() => {
    const map = new Map<string, typeof threads>();
    for (const thread of threads) {
      const arr = map.get(thread.projectId) ?? [];
      arr.push(thread);
      map.set(thread.projectId, arr);
    }
    for (const [key, value] of map) {
      value.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      map.set(key, value);
    }
    return map;
  }, [threads]);

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 flex-col items-center border-r border-border/60 bg-card/40 py-2">
        <button
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
        >
          ▶
        </button>
        <button
          className="mt-2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={toggleTheme}
          aria-label={t("sidebar.toggleTheme")}
        >
          {theme === "dark" ? "☾" : "☀"}
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-72 flex-col border-r border-border/60 bg-card/40">
      <header className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-sm font-semibold tracking-tight">
          {APP_DISPLAY_NAME}
        </span>
        <div className="flex items-center gap-1">
          <button
            className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={toggleTheme}
            aria-label={t("sidebar.toggleTheme")}
            title={t("sidebar.toggleTheme")}
          >
            {theme === "dark" ? "☾" : "☀"}
          </button>
          <button
            className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            ◀
          </button>
        </div>
      </header>
      <TransportStatusBanner />
      <ProviderHealthBar />
      <SidebarSearchPalette
        projects={projects}
        threads={threads}
        onSelectThread={onSelectThread}
      />
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {projects.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            {projectsQuery.isLoading ? t("sidebar.loading") : "—"}
          </div>
        ) : null}
        {projects.map((project) => {
          const isExpanded = expandedProjectIds.includes(project.id);
          const projectThreads = grouped.get(project.id) ?? [];
          return (
            <div key={project.id} className="mb-3">
              <button
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                onClick={() => onToggleProject(project.id)}
              >
                <span className="truncate">
                  {isExpanded ? "▾" : "▸"} {project.name}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {projectThreads.length}
                </span>
              </button>
              {isExpanded && (
                <ul className="mt-1 space-y-0.5">
                  {projectThreads.map((thread) => (
                    <li key={thread.id}>
                      <button
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition",
                          activeThreadId === thread.id
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                        )}
                        onClick={() => onSelectThread(thread.id)}
                      >
                        <span className="flex min-w-0 items-center gap-1">
                          {thread.isPinned ? (
                            <span className="text-amber-400" title="Pinned">
                              ★
                            </span>
                          ) : null}
                          <span className="truncate">
                            {thread.title || t("chat.empty.heading")}
                          </span>
                        </span>
                        <span className="ml-2 flex shrink-0 items-center gap-1">
                          {thread.hasPendingApprovals ? (
                            <span
                              className="h-2 w-2 rounded-full bg-amber-500"
                              title="Pending approval"
                            />
                          ) : null}
                          {thread.hasPendingUserInput ? (
                            <span
                              className="h-2 w-2 rounded-full bg-blue-500"
                              title="Awaiting input"
                            />
                          ) : null}
                          {thread.sessionStatus === "running" ? (
                            <span
                              className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"
                              title="Running"
                            />
                          ) : null}
                          {thread.sessionStatus === "error" ? (
                            <span
                              className="h-2 w-2 rounded-full bg-red-500"
                              title="Error"
                            />
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                  {projectThreads.length === 0 ? (
                    <li className="px-2 py-1 text-xs text-muted-foreground/60">
                      —
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <footer className="border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
        v{APP_VERSION} · {transport === "open" ? "Online" : "Offline"}
      </footer>
    </aside>
  );
}
