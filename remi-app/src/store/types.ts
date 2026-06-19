import type { StoreApi } from "zustand";

export interface ThreadSummary {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
  isPinned?: boolean;
  sessionStatus: "disconnected" | "connecting" | "ready" | "running" | "error" | "closed" | null;
  latestTurn: unknown | null;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  kind: "project" | "workspace";
  remoteName: string;
  folderName: string;
  cwd: string;
  expanded: boolean;
}

export interface AppState {
  /** Whether the embedded server has emitted its port. */
  serverReady: boolean;
  /** Resolved host/port of the embedded server. */
  serverInfo: { host: string; port: number } | null;
  /** Resolved user paths from the Tauri side. */
  appPaths: {
    dataDir: string;
    configDir: string;
    cacheDir: string;
    homeDir: string;
  } | null;
  /** WebSocket transport state. */
  transport: "connecting" | "open" | "closed" | "disposed";
  /** Active project list. */
  projects: ProjectSummary[];
  /** Active thread list (the sidebar reads from this). */
  threads: ThreadSummary[];
  /** Shell snapshot hydration marker. */
  threadsHydrated: boolean;
  /** Bootstrap entry — called by `<StoreProvider>`. */
  bootstrap: () => Promise<void>;
  /** Reset state on logout / workspace switch. */
  reset: () => void;
}

export type AppStore = AppState & StoreApi<AppState>;
