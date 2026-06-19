import { FiGitBranch } from "react-icons/fi";

interface Thread {
  id: string;
  title: string;
  projectId: string;
}

export function BranchToolbar({ thread }: { thread?: Thread }) {
  if (!thread) {
    return (
      <div className="flex h-9 items-center border-b border-border/60 bg-card/40 px-3 text-xs text-muted-foreground">
        Loading thread…
      </div>
    );
  }
  return (
    <div className="flex h-9 items-center gap-2 border-b border-border/60 bg-card/40 px-3 text-xs text-muted-foreground">
      <FiGitBranch className="text-foreground/70" />
      <span className="truncate text-foreground/90">{thread.title}</span>
    </div>
  );
}
