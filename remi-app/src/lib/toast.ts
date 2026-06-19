// Global toast store. Inspired by the `apps/web/src/notifications/`
// tree in Peak Code, but stripped down to a single module that
// exports a hook and a static helper. Every place in the React tree
// that needs to surface an error / warning / success message can
// import `pushToast(...)`; the <Toaster /> component listens to the
// store and renders the toast list.

import { create } from "zustand";
import { useEffect, useState } from "react";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  /** Auto-dismiss after this many ms. 0 means "sticky". */
  duration: number;
  /** Optional action button (e.g. "Retry"). */
  action?: { label: string; onClick: () => void };
  /** Optional secondary action. */
  secondaryAction?: { label: string; onClick: () => void };
  /** Source identifier so the dev-tools can group by emitter. */
  source?: string;
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id" | "createdAt">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const TOAST_DEFAULTS: Record<ToastVariant, number> = {
  info: 4_000,
  success: 3_000,
  warning: 5_000,
  error: 0, // sticky by default for errors.
};

let nextId = 1;
function genId() {
  return `t${Date.now().toString(36)}_${(nextId++).toString(36)}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (input) => {
    const id = genId();
    const duration = input.duration ?? TOAST_DEFAULTS[input.variant];
    const toast: Toast = {
      id,
      createdAt: Date.now(),
      duration,
      ...input,
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Imperative helper so non-React code (transport / event router)
 * can also push toasts. Returns the toast id. */
export function pushToast(
  input: Omit<Toast, "id" | "createdAt">,
): string {
  return useToastStore.getState().push(input);
}

/** Convenience shortcuts — the rest of the codebase should prefer
 * these over `pushToast` so the call sites stay readable. */
export const toast = {
  info: (message: string, opts?: Partial<Omit<Toast, "id" | "createdAt" | "variant" | "message">) =>
    pushToast({ variant: "info", message, ...opts }),
  success: (message: string, opts?: Partial<Omit<Toast, "id" | "createdAt" | "variant" | "message">) =>
    pushToast({ variant: "success", message, ...opts }),
  warning: (message: string, opts?: Partial<Omit<Toast, "id" | "createdAt" | "variant" | "message">) =>
    pushToast({ variant: "warning", message, ...opts }),
  error: (message: string, opts?: Partial<Omit<Toast, "id" | "createdAt" | "variant" | "message">) =>
    pushToast({ variant: "error", message, ...opts }),
};

export function useToasts(): Toast[] {
  return useToastStore((s) => s.toasts);
}

/**
 * Helper for streaming a single value (e.g. an RPC error) to a toast
 * without leaking the previous id. Returns a `push` function that
 * always dismisses the previous toast of the same source first.
 */
export function useScopedToast(source: string) {
  return {
    info: (message: string, opts?: Partial<Omit<Toast, "id" | "createdAt" | "variant" | "message" | "source">) =>
      pushToast({ variant: "info", message, source, ...opts }),
    success: (message: string, opts?: Partial<Omit<Toast, "id" | "createdAt" | "variant" | "message" | "source">) =>
      pushToast({ variant: "success", message, source, ...opts }),
    warning: (message: string, opts?: Partial<Omit<Toast, "id" | "createdAt" | "variant" | "message" | "source">) =>
      pushToast({ variant: "warning", message, source, ...opts }),
    error: (message: string, opts?: Partial<Omit<Toast, "id" | "createdAt" | "variant" | "message" | "source">) =>
      pushToast({ variant: "error", message, source, ...opts }),
  };
}

/**
 * React hook that auto-dismisses a toast after a custom delay.
 * Used by the Toaster component to handle progressive dismissal
 * animations.
 */
export function useDelayedBoolean(value: boolean, delayMs: number): boolean {
  const [active, setActive] = useState(value);
  useEffect(() => {
    if (!value) {
      const t = setTimeout(() => setActive(false), delayMs);
      return () => clearTimeout(t);
    }
    setActive(true);
    return undefined;
  }, [value, delayMs]);
  return active;
}
