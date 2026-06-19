import { create, type StoreApi } from "zustand";
import { getNativeApi } from "@/lib/nativeApi";
import { isTauri } from "@/lib/env";
import {
  DEFAULT_PERSISTED_STATE,
  loadPersistedState,
  savePersistedState,
} from "./persistence";
import type { AppState } from "./types";

/**
 * The single client store. The Tauri shell owns the HTTP/WS server
 * and the IPC bridge; the store subscribes to lifecycle events and
 * normalizes them into React-friendly state.
 */
export const createAppStore = (): StoreApi<AppState> => {
  const persisted = loadPersistedState();

  return create<AppState>()((set, get) => {
    const persist = (overrides: Partial<typeof persisted> = {}) => {
      const current = get();
      savePersistedState({
        ...DEFAULT_PERSISTED_STATE,
        activeThreadId: current.activeThreadId,
        activeProjectId: current.activeProjectId,
        composerDraft: current.composerDraft,
        sidebarCollapsed: current.sidebarCollapsed,
        theme: current.theme,
        language: current.language,
        expandedProjectIds: current.projects
          .filter((p) => p.expanded)
          .map((p) => p.id),
        windowBounds: null,
        ...overrides,
      });
    };

    return {
      serverReady: false,
      serverInfo: null,
      appPaths: null,
      transport: "closed",
      projects: [],
      threads: [],
      threadsHydrated: false,
      activeThreadId: persisted.activeThreadId,
      activeProjectId: persisted.activeProjectId,
      composerDraft: persisted.composerDraft,
      sidebarCollapsed: persisted.sidebarCollapsed,
      theme: persisted.theme,
      language: persisted.language,

      async bootstrap() {
        const api = getNativeApi();
        try {
          if (isTauri && api) {
            const [paths, server] = await Promise.all([
              api.getAppPaths().catch(() => null),
              api.getServerInfo().catch(() => null),
            ]);
            set({
              appPaths: paths,
              serverInfo: server,
              serverReady: server !== null,
            });
          } else {
            set({
              serverInfo: { host: "127.0.0.1", port: 3845 },
              serverReady: true,
              transport: "connecting",
            });
          }
        } catch (err) {
          console.warn("[remi-app] bootstrap failed", err);
        }

        const { startTransport } = await import("@/lib/wsTransport");
        await startTransport({
          getServerInfo: () => get().serverInfo,
          onState: (state) => set({ transport: state }),
          onHealth: (snapshot) => {
            set({ transport: snapshot.state });
          },
          heartbeatMs: 15_000,
          callTimeoutMs: 30_000,
        });
      },

      reset() {
        set({
          projects: [],
          threads: [],
          threadsHydrated: false,
          transport: "closed",
        });
        persist();
      },

      setProjects(projects) {
        set({ projects });
        persist();
      },
      setThreads(threads) {
        set({ threads });
      },
      setThreadsHydrated(hydrated) {
        set({ threadsHydrated: hydrated });
      },
      setServerReady(ready) {
        set({ serverReady: ready });
      },
      setServerInfo(info) {
        set({ serverInfo: info, serverReady: info !== null });
      },
      setAppPaths(paths) {
        set({ appPaths: paths });
      },
      setTransport(state) {
        set({ transport: state });
      },
      setActiveThread(id) {
        set({ activeThreadId: id });
        persist();
      },
      setActiveProject(id) {
        set({ activeProjectId: id });
        persist();
      },
      setComposerDraft(draft) {
        set({ composerDraft: draft });
        persist();
      },
      toggleSidebar() {
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
        persist();
      },
      setTheme(theme) {
        set({ theme });
        persist();
      },
      setLanguage(language) {
        set({ language });
        persist();
      },
      upsertThread(thread) {
        set((s) => {
          const idx = s.threads.findIndex((t) => t.id === thread.id);
          if (idx < 0) return { threads: [...s.threads, thread] };
          const next = s.threads.slice();
          next[idx] = thread;
          return { threads: next };
        });
      },
      upsertProject(project) {
        set((s) => {
          const idx = s.projects.findIndex((p) => p.id === project.id);
          if (idx < 0) return { projects: [...s.projects, project] };
          const next = s.projects.slice();
          next[idx] = project;
          return { projects: next };
        });
        persist();
      },
      removeThread(id) {
        set((s) => ({ threads: s.threads.filter((t) => t.id !== id) }));
      },
      removeProject(id) {
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
        persist();
      },
    };
  });
};
