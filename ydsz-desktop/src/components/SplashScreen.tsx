// FILE: SplashScreen.tsx
// Purpose: Render the branded startup face while the app is still booting a route or session.
// Layer: Shared app loading presentation
/**
 * @file 启动屏
 *
 * 应用启动 / 路由加载 / 会话初始化过程中展示的占位界面：
 *
 * - **品牌 logo**：ydsz-buddy
 * - **分阶段进度**：展示 native-api / server-welcome / shell-snapshot / settings / route-ready / ui-ready
 *   六个阶段的实时状态（pending / in_progress / done / error）
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
 * - `showStageProgress=false` 时仅展示品牌 logo（用于路由级 fallback）
 */
import { BootProgressView } from "./BootProgressView";

export function SplashScreen({
  errorMessage,
  onRetry,
  showStageProgress = true,
}: {
  errorMessage?: string | null;
  onRetry?: (() => void) | null;
  showStageProgress?: boolean;
}) {
  const showRetry = Boolean(errorMessage && onRetry);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-7 select-none">
        <img
          alt="云顶数字 Buddy"
          className="size-24 rounded-[26px] object-cover"
          draggable={false}
          src="/ydsz-buddy.png"
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
        ) : showStageProgress ? (
          <BootProgressView onRetry={onRetry} />
        ) : null}
      </div>
    </div>
  );
}
