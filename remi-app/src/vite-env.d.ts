/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_URL?: string;
  readonly VITE_DEV_SERVER_PORT?: string;
  readonly APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Tauri v2 injects a `__TAURI_INTERNALS__` runtime and an `invoke`
// function on the window. The official @tauri-apps/api package wraps
// them, but we expose the underlying types here for our native API
// bridge.
declare global {
  interface Window {
    readonly __TAURI_INTERNALS__?: {
      readonly invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      readonly metadata?: { currentWindow: { label: string } };
    };
    readonly __TAURI_OS_PLUGIN_INTERNALS__?: unknown;
  }
}

export {};
