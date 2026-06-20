/**
 * @file ThreadErrorBanner.tsx
 * @description 线程错误横幅组件，在线程出错时显示错误信息和关闭按钮。
 */

import { memo } from "react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { CircleAlertIcon, XIcon } from "~/lib/icons";

/**
 * ThreadErrorBanner 组件
 * @description 线程错误横幅，显示错误信息和可选的关闭按钮
 * @param props.error - 错误信息（为 null 时不渲染）
 * @param props.onDismiss - 关闭错误横幅的回调（可选）
 */
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
