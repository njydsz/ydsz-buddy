import { useToasts, type Toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const VARIANT_STYLES: Record<
  Toast["variant"],
  { bg: string; border: string; icon: string; ring: string }
> = {
  info: {
    bg: "bg-card",
    border: "border-border",
    icon: "text-foreground",
    ring: "ring-primary/20",
  },
  success: {
    bg: "bg-card",
    border: "border-emerald-500/40",
    icon: "text-emerald-400",
    ring: "ring-emerald-500/20",
  },
  warning: {
    bg: "bg-card",
    border: "border-amber-500/40",
    icon: "text-amber-400",
    ring: "ring-amber-500/20",
  },
  error: {
    bg: "bg-card",
    border: "border-red-500/50",
    icon: "text-red-400",
    ring: "ring-red-500/30",
  },
};

const ICON: Record<Toast["variant"], string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

/**
 * Stacked, top-right toast container. Mirrors the visual style of
 * `apps/web/src/components/Toaster.tsx` in the original Peak Code
 * web app but uses no third-party toaster library.
 */
export function Toaster() {
  const toasts = useToasts();
  const sorted = useMemo(
    () => toasts.slice().sort((a, b) => b.createdAt - a.createdAt),
    [toasts],
  );
  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
      role="region"
      aria-label="Notifications"
    >
      {sorted.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const styles = VARIANT_STYLES[toast.variant];
  return (
    <div
      className={cn(
        "pointer-events-auto rounded-md border p-3 text-sm text-foreground shadow-lg ring-1",
        styles.bg,
        styles.border,
        styles.ring,
      )}
      role="status"
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5 text-base leading-none", styles.icon)}>
          {ICON[toast.variant]}
        </span>
        <div className="min-w-0 flex-1">
          {toast.title ? (
            <div className="mb-0.5 text-sm font-medium">{toast.title}</div>
          ) : null}
          <div className="whitespace-pre-wrap break-words text-foreground/90">
            {toast.message}
          </div>
          {(toast.action || toast.secondaryAction) && (
            <div className="mt-2 flex items-center gap-2">
              {toast.action ? (
                <button
                  className="rounded bg-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/30"
                  onClick={() => {
                    toast.action!.onClick();
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
              {toast.secondaryAction ? (
                <button
                  className="rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    toast.secondaryAction!.onClick();
                  }}
                >
                  {toast.secondaryAction.label}
                </button>
              ) : null}
            </div>
          )}
        </div>
        <button
          className="ml-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => useToastsDismiss(toast.id)}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}

import { useToastStore } from "@/lib/toast";
function useToastsDismiss(id: string) {
  return useToastStore.getState().dismiss(id);
}
