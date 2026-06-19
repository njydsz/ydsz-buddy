import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Last-resort error boundary. We try hard to keep the React tree
 * alive — a single broken component should not kill the whole
 * application. The boundary re-renders a fallback and prints a
 * "Reload" button that resets the in-memory state and refreshes the
 * route.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The Rust side listens for this event through the
    // `tauri-plugin-log` plugin — keeping a single channel of
    // observability for the React tree.
    // eslint-disable-next-line no-console
    console.error("[remi-app] uncaught error", error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ error: null });
    // Force a soft reset of the router so route loaders re-run.
    if (typeof window !== "undefined") {
      window.location.assign(window.location.pathname);
    }
  };

  override render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
          <h1 className="text-xl font-semibold">Something went wrong.</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <pre className="max-h-48 max-w-2xl overflow-auto rounded-md border border-border/60 bg-card/40 p-3 text-left text-xs text-muted-foreground">
            {this.state.error.stack ?? String(this.state.error)}
          </pre>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            onClick={this.handleReload}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
