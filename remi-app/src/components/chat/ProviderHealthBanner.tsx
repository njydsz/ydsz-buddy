/**
 * @file ProviderHealthBanner
 * @description 显示服务提供者健康状态横幅，当提供者处于错误或警告状态时展示提示信息，
 *              支持关闭操作。
 */

import { PROVIDER_DISPLAY_NAMES, type ServerProviderStatus } from "~/contracts";
import { memo } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { CircleAlertIcon, XIcon } from "~/lib/icons";

/**
 * 服务提供者健康状态横幅组件。
 * 当服务提供者处于错误或警告状态时显示提示信息，包含状态标题、描述和关闭按钮。
 *
 * @param props.onDismiss - 关闭横幅的回调函数
 * @param props.status - 服务提供者状态信息，为 null 或 ready 时不渲染
 */
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
