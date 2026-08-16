/**
 * @file Provider 健康横幅组件
 *
 * 本组件展示 Provider 健康状态不可用时的提示横幅：
 *
 * - **不可用提示**：Provider 未配置 / 凭证错误 / 服务不可达
 * - **操作入口**：跳转到设置
 * - **自动隐藏**：Provider 恢复后自动消失
 *
 * ## 核心导出
 *
 * - `ProviderHealthBanner`：横幅组件
 *
 * ## 使用场景
 *
 * - Composer 顶部
 * - Provider 切换后的反馈
 *
 * ## 注意事项
 *
 * - 多个 Provider 不可用时合并展示
 * - 提供"重试"按钮
 */

import { PROVIDER_DISPLAY_NAMES, type ServerProviderStatus } from "~/contracts";
import { memo } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { CircleAlertIcon, XIcon } from "~/lib/icons";

export const ProviderHealthBanner = memo(function ProviderHealthBanner({
  onDismiss,
  status,
}: {
  onDismiss?: () => void;
  status: ServerProviderStatus | null;
}) {
  if (!status || status.status === "ready") {
    return null;
  }

  const providerLabel = PROVIDER_DISPLAY_NAMES[status.provider] ?? status.provider;
  const defaultMessage =
    status.status === "error"
      ? `${providerLabel} provider is unavailable.`
      : `${providerLabel} provider has limited availability.`;
  const title = `${providerLabel} provider status`;

  return (
    <div className="pt-3 mx-auto max-w-3xl">
      <Alert variant={status.status === "error" ? "error" : "warning"}>
        <CircleAlertIcon />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="line-clamp-3" title={status.message ?? defaultMessage}>
          {status.message ?? defaultMessage}
        </AlertDescription>
        {onDismiss ? (
          <AlertAction>
            <Button
              aria-label="Dismiss provider status"
              size="icon-xs"
              title="Dismiss provider status"
              variant="ghost"
              onClick={onDismiss}
            >
              <XIcon className="size-3.5" />
            </Button>
          </AlertAction>
        ) : null}
      </Alert>
    </div>
  );
});
