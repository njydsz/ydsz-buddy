import { type ErrorComponentProps, Link } from "@tanstack/react-router";

/**
 * Default error component for TanStack Router. Replaces
 * `apps/web/src/routes/__root.tsx`'s `RootRouteErrorView` so route
 * loader errors (e.g. RPC failure) render a friendly message instead
 * of a white screen.
 */
export function RootRouteError({ error }: ErrorComponentProps) {
  const err = error as Error | undefined;
  const message = err?.message || "Unknown error";
  const status = (error as { status?: number })?.status;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <h1 className="text-xl font-semibold">
        {status === 404 ? "Page not found" : "Route error"}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Link
        to="/"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        Back to home
      </Link>
    </div>
  );
}
