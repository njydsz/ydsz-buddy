/**
 * True when running inside the Tauri desktop bridge, false in a regular browser.
 * The Tauri bridge sets window.nativeApi before any web-app code executes.
 */
export const isElectron =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);
