import { useParams } from "@tanstack/react-router";

export function WorkspaceDetail() {
  const params = useParams({ strict: false });
  const workspaceId = (params as { workspaceId?: string }).workspaceId;
  return (
    <div className="m-6 rounded-md border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
      <h2 className="mb-2 text-base font-semibold text-foreground">
        Workspace {workspaceId}
      </h2>
      <p>Workspace detail layout ships in milestone M3 (see MIGRATION_PLAN.md).</p>
    </div>
  );
}
