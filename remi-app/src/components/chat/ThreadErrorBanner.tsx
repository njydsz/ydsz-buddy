/**
 * @file 线程错误横幅组件
 *
 * 本组件展示线程执行过程中的错误提示：
 *
 * - **错误信息**：标题、详细描述、错误码
 * - **恢复操作**：重试、回滚、查看详情
 * - **可关闭**：用户可手动关闭
 *
 * ## 核心导出
 *
 * - `ThreadErrorBanner`：横幅组件
 *
 * ## 使用场景
 *
 * - 线程执行失败时展示
 * - 网络异常
 * - Provider 错误
 *
 * ## 注意事项
 *
 * - 严重错误（导致线程无法继续）应阻断操作
 * - 错误信息包含修复建议
 */

import { memo } from "react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { CircleAlertIcon, XIcon } from "~/lib/icons";

export const ThreadErrorBanner = memo(function ThreadErrorBanner({
  error,
  onDismiss,
}: {
  error: string | null;
  onDismiss?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="pt-3 mx-auto max-w-3xl">
      <Alert variant="error">
        <CircleAlertIcon />
        <AlertDescription className="line-clamp-3" title={error}>
          {error}
        </AlertDescription>
        {onDismiss && (
          <AlertAction>
            <button
              type="button"
              aria-label="Dismiss error"
              className="inline-flex size-6 items-center justify-center rounded-md text-destructive/60 transition-colors hover:text-destructive"
              onClick={onDismiss}
            >
              <XIcon className="size-3.5" />
            </button>
          </AlertAction>
        )}
      </Alert>
    </div>
  );
});
