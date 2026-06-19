import { useState, useMemo } from "react";
import { FiSearch } from "react-icons/fi";
import type { ProjectSummary, ThreadSummary } from "@/store/types";

interface Props {
  projects: ProjectSummary[];
  threads: ThreadSummary[];
  onSelectThread: (threadId: string) => void;
}

export function SidebarSearchPalette({ projects, threads, onSelectThread }: Props) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const lower = query.toLowerCase().trim();
    if (!lower) return threads.slice(0, 10);
    return threads
      .filter((t) => t.title.toLowerCase().includes(lower))
      .slice(0, 10);
  }, [query, threads]);

  return (
    <div className="border-b border-border/60 p-2">
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
        <FiSearch className="text-muted-foreground" />
        <input
          className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder="Search threads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul className="mt-1 max-h-32 overflow-y-auto text-xs">
        {matches.map((thread) => {
          const project = projects.find((p) => p.id === thread.projectId);
          return (
            <li key={thread.id}>
              <button
                className="block w-full truncate rounded px-2 py-1 text-left text-foreground/80 hover:bg-accent hover:text-foreground"
                onClick={() => onSelectThread(thread.id)}
              >
                <span className="text-muted-foreground">{project?.name ?? "—"}</span>
                <span className="mx-1 text-muted-foreground/40">/</span>
                {thread.title || "New thread"}
              </button>
            </li>
          );
        })}
        {matches.length === 0 ? (
          <li className="px-2 py-1 text-muted-foreground">No matches</li>
        ) : null}
      </ul>
    </div>
  );
}
