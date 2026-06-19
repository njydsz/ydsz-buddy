import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { rpc } from "@/lib/rpc";
import { useAppStore } from "@/store";

export function ChatEmptyState() {
  const navigate = useNavigate();
  const projects = useAppStore((s) => s.projects);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ["projects", "list"],
    queryFn: () => rpc.projectsList(),
  });

  const onCreate = async (projectId: string) => {
    setCreating(true);
    setError(null);
    try {
      const thread = await rpc.threadCreate(projectId, "New chat");
      queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      navigate({ to: "/$threadId", params: { threadId: thread.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const list = projects.length > 0 ? projects : (projectsQuery.data ?? []);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Start a new conversation
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a project to open a new thread. Remi Code streams assistant replies
          in real time, executes tools against your repository, and keeps every
          turn inspectable in the diff panel.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {list.map((project) => (
            <button
              key={project.id}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition hover:border-primary hover:bg-accent disabled:opacity-50"
              onClick={() => onCreate(project.id)}
              disabled={creating}
            >
              {project.name}
              <span className="ml-2 text-xs text-muted-foreground">{project.kind}</span>
            </button>
          ))}
          {list.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
              No projects yet. Add a project in <strong>Settings → Projects</strong> first.
            </div>
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
