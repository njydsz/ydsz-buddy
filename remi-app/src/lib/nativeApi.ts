// Thin wrapper around `window.__TAURI_INTERNALS__.invoke` so that the
// rest of the React app can call native commands as plain async
// functions. This is the Tauri v2 successor to Peak Code's
// `window.desktopBridge.*` Electron contextBridge surface.

import { isTauri } from "./env";

export interface AppPaths {
  dataDir: string;
  configDir: string;
  cacheDir: string;
  homeDir: string;
  webviewUrl: string;
}

export interface ServerInfo {
  host: string;
  port: number;
}

export interface ConfirmArgs {
  title?: string;
  message: string;
  kind?: "info" | "warning" | "destructive";
}

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface OpenInEditorArgs {
  path: string;
  editor?: string;
}

export interface SetThemeArgs {
  theme: "light" | "dark" | "system";
}

export interface NativeApi {
  getAppPaths(): Promise<AppPaths>;
  getServerInfo(): Promise<ServerInfo>;
  openInEditor(args: OpenInEditorArgs): Promise<void>;
  showInFolder(path: string): Promise<void>;
  openExternalUrl(url: string): Promise<void>;
  showConfirmDialog(args: ConfirmArgs): Promise<boolean>;
  showContextMenu(args: {
    items: ContextMenuItem[];
    position?: ContextMenuPosition;
  }): Promise<string | null>;
  setWindowTheme(args: SetThemeArgs): Promise<void>;
  restartServer(): Promise<ServerInfo>;
  quitApp(): Promise<void>;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals?.invoke) {
    throw new Error(`Tauri internals not available (command: ${cmd})`);
  }
  return internals.invoke(cmd, args) as Promise<T>;
}

export const nativeApi: NativeApi | null = isTauri
  ? {
      getAppPaths: () => tauriInvoke<AppPaths>("get_app_paths"),
      getServerInfo: () => tauriInvoke<ServerInfo>("get_server_info"),
      openInEditor: (args) => tauriInvoke<void>("open_in_editor", { args }),
      showInFolder: (path) => tauriInvoke<void>("show_in_folder", { path }),
      openExternalUrl: (url) => tauriInvoke<void>("open_external_url", { url }),
      showConfirmDialog: (args) =>
        tauriInvoke<boolean>("show_confirm_dialog", { args }),
      showContextMenu: (args) =>
        tauriInvoke<string | null>("show_context_menu", { args }),
      setWindowTheme: (args) => tauriInvoke<void>("set_window_theme", { args }),
      restartServer: () => tauriInvoke<ServerInfo>("restart_server"),
      quitApp: () => tauriInvoke<void>("quit_app"),
    }
  : null;

export function getNativeApi(): NativeApi | null {
  return nativeApi;
}

export function requireNativeApi(): NativeApi {
  if (!nativeApi) {
    throw new Error(
      "Remi Code native API is only available inside the Tauri webview",
    );
  }
  return nativeApi;
}
