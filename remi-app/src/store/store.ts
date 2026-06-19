import { create } from "zustand";
import { getNativeApi } from "@/lib/nativeApi";
import { isTauri } from "@/lib/env";
import type { AppState, AppStore } from "./types";

/**
 * The single client store. The Tauri shell owns the HTTP/WS server
 * and the IPC bridge; the store subscribes to lifecycle events and
 * normalizes them into React-friendly state.
 */
export const createAppStore = () =>
  create<AppState>()((set, get) => ({
    serverReady: false,
    serverInfo: null,
    appPaths: null,
    transport: "closed",
    projects: [],
    threads: [],
    threadsHydrated: false,

    async bootstrap() {
      // Step 1: ask the Tauri side for paths and server info. In a
      // browser dev session we fall back to the Vite-provided URLs.
      const api = getNativeApi();
      try {
        if (isTauri && api) {
          const [paths, server] = await Promise.all([
            api.getAppPaths().catch(() => null),
            api.getServerInfo().catch(() => null),
          ]);
          set({ appPaths: paths, serverInfo: server, serverReady: server !== null });
        } else {
          set({
            serverInfo: { host: "127.0.0.1", port: 3845 },
            serverReady: true,
            transport: "connecting",
          });
        }
      } catch (err) {
        // Non-fatal: the WS transport layer will retry.
        console.warn("[remi-app] bootstrap failed", err);
      }

      // Step 2: kick off the WS transport. The transport itself
      // listens for `thread.*` / `terminal.*` events and feeds back
      // into this store through the imperative setters below.
      const { startTransport } = await import("@/lib/wsTransport");
      await startTransport({
        getServerInfo: () => get().serverInfo,
        onState: (state) => set({ transport: state }),
      });
    },

    reset() {
      set({
        projects: [],
        threads: [],
        threadsHydrated: false,
        transport: "closed",
      });
    },
  })) as () => AppStore;
