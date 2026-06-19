import type { StoreApi } from "zustand";

export interface ThreadSummary {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
  isPinned?: boolean;
  sessionStatus:
    | "disconnected"
    | "connecting"
    | "ready"
    | "running"
    | "error"
    | "closed"
    | null;
  latestTurn: unknown | null;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
  lastVisitedAt?: string | null;
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

export type TransportStateName =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "reconnecting"
  | "disposed";

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
  transport: TransportStateName;
  /** Active project list. */
  projects: ProjectSummary[];
  /** Active thread list (the sidebar reads from this). */
  threads: ThreadSummary[];
  /** Shell snapshot hydration marker. */
  threadsHydrated: boolean;
  /** Last-active thread id (persisted across reloads). */
  activeThreadId: string | null;
  /** Last-active project id (persisted across reloads). */
  activeProjectId: string | null;
  /** Composer draft (persisted). */
  composerDraft: string;
  /** Sidebar collapsed state. */
  sidebarCollapsed: boolean;
  /** Theme. */
  theme: "light" | "dark" | "system";
  /** Language. */
  language: "en" | "zh-CN";
  /** Bootstrap entry — called by `<StoreProvider>`. */
  bootstrap: () => Promise<void>;
  /** Reset state on logout / workspace switch. */
  reset: () => void;
  /** Imperative setters (used by event router and RPC adapters). */
  setProjects: (projects: ProjectSummary[]) => void;
  setThreads: (threads: ThreadSummary[]) => void;
  setThreadsHydrated: (hydrated: boolean) => void;
  setServerReady: (ready: boolean) => void;
  setServerInfo: (info: { host: string; port: number } | null) => void;
  setAppPaths: (paths: AppState["appPaths"]) => void;
  setTransport: (state: TransportStateName) => void;
  setActiveThread: (id: string | null) => void;
  setActiveProject: (id: string | null) => void;
  setComposerDraft: (draft: string) => void;
  toggleSidebar: () => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setLanguage: (language: "en" | "zh-CN") => void;
  upsertThread: (thread: ThreadSummary) => void;
  upsertProject: (project: ProjectSummary) => void;
  removeThread: (id: string) => void;
  removeProject: (id: string) => void;
}

export type AppStore = AppState & StoreApi<AppState>;
