/**
 * True when the React UI is running inside the Tauri webview.
 * Replaces Peak Code's `isElectron` flag in `apps/web/src/env.ts`.
 */
export const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
