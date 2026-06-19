import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { useAppStore } from "@/store";
import { SidebarSearchPalette } from "./SidebarSearchPalette";
import { useTheme } from "@/hooks/useTheme";

export function Sidebar() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const activeThreadId = (params as { threadId?: string }).threadId ?? null;

  const projects = useAppStore((s) => s.projects);
  const threads = useAppStore((s) => s.threads);
  const { theme, toggle } = useTheme();

  const { data: serverConfig } = useQuery({
    queryKey: ["server", "config"],
    queryFn: () => callServerConfig(),
    refetchInterval: 30_000,
  });

  return (
    <aside className="flex h-full w-72 flex-col border-r border-border/60 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-sm font-semibold tracking-tight">Remi Code</span>
        <button
          className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={toggle}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☾" : "☀"}
        </button>
      </div>
      <SidebarSearchPalette
        projects={projects}
        threads={threads}
        onSelectThread={(id) => navigate({ to: "/$threadId", params: { threadId: id } })}
      />
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {projects.map((project) => (
          <div key={project.id} className="mb-3">
            <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {project.name}
            </div>
            <ul className="space-y-0.5">
              {threads
                .filter((t) => t.projectId === project.id)
                .map((thread) => (
                  <li key={thread.id}>
                    <button
                      className={
                        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition " +
                        (activeThreadId === thread.id
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground")
                      }
                      onClick={() =>
                        navigate({ to: "/$threadId", params: { threadId: thread.id } })
                      }
                    >
                      <span className="truncate">{thread.title || "New thread"}</span>
                      {thread.hasPendingApprovals ? (
                        <span className="ml-2 h-2 w-2 rounded-full bg-amber-500" />
                      ) : null}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
        {projects.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            Loading projects…
          </div>
        ) : null}
      </div>
      <div className="border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
        v{serverConfig?.version ?? "0.0.0"} · {serverConfig?.runtimeMode ?? "desktop"}
      </div>
    </aside>
  );
}

async function callServerConfig() {
  return rpc.terminalList
    .then(() => ({
      version: "0.1.0",
      runtimeMode: "desktop" as const,
    }))
    .catch(() => ({ version: "0.0.0", runtimeMode: "desktop" as const }));
}
