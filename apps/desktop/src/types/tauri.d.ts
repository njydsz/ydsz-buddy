// Type declarations for Tauri 2 APIs
// These are temporary declarations until the actual @tauri-apps packages are installed

declare module "@tauri-apps/api/core" {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

declare module "@tauri-apps/api/event" {
  export interface Event<T> {
    id: number;
    event: string;
    payload: T;
  }

  export type UnlistenFn = () => void;

  export function listen<T>(
    event: string,
    handler: (event: Event<T>) => void,
  ): Promise<UnlistenFn>;

  export function emit(event: string, payload?: unknown): Promise<void>;
}

declare module "@tauri-apps/plugin-notification" {
  export function isPermissionGranted(): Promise<boolean>;
  export function requestPermission(): Promise<"granted" | "denied" | "default">;
  export function sendNotification(options: {
    title: string;
    body?: string;
    silent?: boolean;
  }): void;
}

declare module "@tauri-apps/plugin-dialog" {
  export function open(options?: {
    directory?: boolean;
    multiple?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }): Promise<string | string[] | null>;

  export function save(options?: {
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }): Promise<string | null>;

  export function confirm(message: string, options?: { title?: string }): Promise<boolean>;
}

declare module "@tauri-apps/plugin-shell" {
  export function open(path: string, openWith?: string): Promise<void>;
}

declare module "@tauri-apps/plugin-clipboard-manager" {
  export function writeImage(image: Uint8Array): Promise<void>;
  export function readText(): Promise<string | null>;
  export function writeText(text: string): Promise<void>;
}
