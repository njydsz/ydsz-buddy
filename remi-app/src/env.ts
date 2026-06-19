/**
 * True when running inside the Tauri desktop shell, false in a regular browser.
 * Tauri injects `window.__TAURI__` when running inside the WebView.
 */
export const isTauri =
  typeof window !== "undefined" && "__TAURI__" in window;

/**
 * Desktop environment detection - true when running as Tauri desktop app
 */
export const isDesktop = isTauri;

/**
 * Backward compatibility - project migrated from Electron to Tauri
 */
export const isElectron = false;
