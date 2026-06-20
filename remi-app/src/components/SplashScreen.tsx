/**
 * @file SplashScreen.tsx
 * @description 品牌启动画面组件，在应用路由或会话加载期间显示，
 *              支持错误消息展示和重试按钮。
 */

export function SplashScreen({
  errorMessage,
  onRetry,
}: {
  errorMessage?: string | null;
  onRetry?: (() => void) | null;
}) {
  const showRetry = Boolean(errorMessage && onRetry);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background">
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
