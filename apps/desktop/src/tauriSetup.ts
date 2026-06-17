// Tauri 2 initialization setup - replaces Electron's preload mechanism
import { invoke } from "@tauri-apps/api/core";
import { createTauriBridge, setCachedWsUrl } from "./tauriBridge";
import type { DesktopBridge } from "@remi-code/contracts";

/**
 * Initializes the Tauri 2 desktop bridge and sets it on the window object.
 * This replaces Electron's contextBridge.exposeInMainWorld mechanism.
 *
 * @returns The initialized DesktopBridge instance
 */
export async function initTauriBridge(): Promise<DesktopBridge> {
  // Fetch the WebSocket URL from Rust and cache it
  try {
    const wsUrl = await invoke<string | null>("get_ws_url");
    setCachedWsUrl(wsUrl);
  } catch (error) {
    console.error("Failed to fetch WebSocket URL from Tauri:", error);
    setCachedWsUrl(null);
  }

  // Create the bridge instance
  const bridge = createTauriBridge();

  // Expose it on the window object for the web app to detect
  if (typeof window !== "undefined") {
    (window as any).desktopBridge = bridge;
  }

  return bridge;
}

/**
 * Checks if the desktop bridge is available.
 * @returns true if running in desktop mode with Tauri
 */
export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "desktopBridge" in window;
}

/**
 * Gets the desktop bridge if available.
 * @returns The DesktopBridge instance or null if not in desktop mode
 */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as any).desktopBridge ?? null;
}
