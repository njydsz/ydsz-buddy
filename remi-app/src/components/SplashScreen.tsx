// FILE: SplashScreen.tsx
// Purpose: Render the branded startup face while the app is still booting a route or session.
// Layer: Shared app loading presentation

import { WindowCaptionButtons } from "./WindowCaptionButtons";

export function SplashScreen({
  errorMessage,
  onRetry,
}: {
  errorMessage?: string | null;
  onRetry?: (() => void) | null;
}) {
  const showRetry = Boolean(errorMessage && onRetry);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background">
      <WindowCaptionButtons className="absolute top-0 right-0" />
      <div className="flex flex-col items-center gap-5 select-none">
        <img
          alt="Remi Code"
          className="size-24 rounded-[26px] object-cover"
          draggable={false}
          src="/remicode.png"
        />

        {errorMessage ? (
          <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
            <span className="text-sm text-muted-foreground/75">{errorMessage}</span>
            {showRetry ? (
              <button
                type="button"
                className="rounded-md border border-border/70 px-3 py-1.5 text-sm text-foreground/85 transition-colors hover:bg-(--sidebar-accent)"
                onClick={onRetry ?? undefined}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
