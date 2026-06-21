// FILE: SplashScreen.tsx
// Purpose: Render the branded startup face while the app is still booting a route or session.
// Layer: Shared app loading presentation
/**
 * @file 启动屏
 *
 * 应用启动 / 路由加载 / 会话初始化过程中展示的占位界面：
 *
 * - **品牌 logo**：Remi Claw
 * - **加载动画**：温和的 pulse
 * - **错误态**：展示错误信息 + 重试按钮
 *
 * ## 核心导出
 *
 * - `SplashScreen`：主组件
 *
 * ## 使用场景
 *
 * - 应用首次加载
 * - 路由 Suspense 兜底
 * - 关键初始化失败时
 *
 * ## 注意事项
 *
 * - `errorMessage` 与 `onRetry` 同时存在时才显示重试按钮
 * - `select-none` 防止加载中文本被误选
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
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-5 select-none">
        <img
          alt="Remi Claw"
          className="size-24 rounded-[26px] object-cover"
          draggable={false}
          src="/remi-claw.png"
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
