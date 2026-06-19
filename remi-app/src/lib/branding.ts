// Application branding constants.
//
// These mirror the values that lived in `apps/web/src/branding.ts` in
// the original Peak Code repo. Keeping them in one place lets us roll
// the product name / version label without hunting through the React
// tree.

export const APP_BASE_NAME = "Remi Code";
export const APP_STAGE_LABEL = import.meta.env.DEV ? "Dev" : "Alpha";
export const APP_DISPLAY_NAME = `${APP_BASE_NAME} (${APP_STAGE_LABEL})`;
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";

/**
 * `true` when the React UI is running inside the Tauri webview.
 * In every other context (plain browser dev session) we fall back to
 * the standalone WebSocket transport.
 */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
