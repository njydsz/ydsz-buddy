/**
 * @file CodingPlanLoginCard
 * @description 国产 Coding Plan 订阅登录卡（P1-5）
 *
 * 用户在「Provider 设置」页面看到的"使用 Coding Plan 登录"入口卡，
 * 引导用户走智谱 BigModel OAuth Device Flow 一键登录。
 *
 * ## 视觉状态
 *
 * - **idle**：显示「使用 Coding Plan 登录」按钮
 * - **requesting**：按钮显示 loading
 * - **awaiting-user**：显示 user_code + verification_uri + 倒计时 + 复制按钮
 * - **authorized**：显示绿色"已绑定"标识
 * - **failed**：显示错误信息 + "重试" 按钮
 * - **cancelled**：显示 "已取消" + "重新发起" 按钮
 *
 * ## 设计原则
 *
 * - **进度条**：30s 倒计时使用进度条（满足 P1 增强页要求）
 * - **data-testid**：所有交互元素带 data-testid 属性,便于 E2E
 * - **summary 行**：进度条下方显示"剩余时间" + "下一步"提示
 *
 * @module components/CodingPlanLoginCard
 */

import { useState } from "react";
import { useZhipuDeviceFlow } from "../hooks/useZhipuDeviceFlow";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Spinner } from "./ui/spinner";
import {
  CircleCheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  CircleAlertIcon,
  RefreshCwIcon,
} from "../lib/icons";
import { cn } from "../lib/utils";

export interface CodingPlanLoginCardProps {
  /** Coding Plan Provider ID,默认 "zhipu" */
  provider?: "zhipu" | "deepseek" | "moonshot" | "qwen";
  /** Provider 显示名 */
  providerDisplayName?: string;
  /** 成功绑定后回调 */
  onBound?: (providerKind: string) => void;
  /** 类名透传 */
  className?: string;
}

/**
 * Coding Plan 订阅登录卡
 */
export function CodingPlanLoginCard({
  provider = "zhipu",
  providerDisplayName = "智谱 BigModel (GLM)",
  onBound,
  className,
}: CodingPlanLoginCardProps) {
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const {
    phase,
    grant,
    errorMessage,
    boundProvider,
    isSupported,
    start,
    cancel,
    reset,
    secondsRemaining,
    copyUserCode,
  } = useZhipuDeviceFlow(provider);

  const totalExpiresIn = grant?.expires_in ?? 0;
  const progressPct =
    totalExpiresIn > 0
      ? Math.max(0, Math.min(100, (secondsRemaining / totalExpiresIn) * 100))
      : 0;

  // 已绑定分支（成功态）
  if (phase === "authorized" && boundProvider) {
    return (
      <Card
        data-testid="coding-plan-card"
        data-phase="authorized"
        className={cn(
          "border-green-500/40 bg-green-50/30 dark:bg-green-950/20",
          className,
        )}
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <CircleCheckIcon
              data-testid="coding-plan-success-icon"
              className="size-5 text-green-600"
            />
            <CardTitle className="text-base">
              {providerDisplayName} Coding Plan 已绑定
            </CardTitle>
          </div>
          <CardDescription>
            access_token 已安全存储在系统密钥库中,无需手动复制 API Key。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            data-testid="coding-plan-rebind"
            variant="outline"
            size="sm"
            onClick={reset}
          >
            <RefreshCwIcon className="size-3.5" />
            重新绑定
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 不支持 Device Flow 的 Provider：降级提示
  if (!isSupported) {
    return (
      <Card data-testid="coding-plan-card" data-phase="unsupported" className={className}>
        <CardHeader>
          <CardTitle className="text-base">Coding Plan 订阅登录</CardTitle>
          <CardDescription>
            {providerDisplayName} 暂未提供官方 Device Flow,请在下方手动填入 API Key。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card data-testid="coding-plan-card" data-phase={phase} className={className}>
      <CardHeader>
        <CardTitle className="text-base">使用 Coding Plan 登录</CardTitle>
        <CardDescription>
          一键授权后,ydsz-buddy 会自动用订阅额度调用 {providerDisplayName},无需 API Key。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* idle / failed / cancelled：显示「开始」按钮 */}
        {(phase === "idle" || phase === "failed" || phase === "cancelled") && (
          <div className="flex flex-col gap-2">
            {phase === "failed" && errorMessage && (
              <Alert variant="error" data-testid="coding-plan-error">
                <CircleAlertIcon className="size-4" />
                <AlertTitle>授权失败</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            {phase === "cancelled" && (
              <Alert data-testid="coding-plan-cancelled">
                <AlertDescription>已取消授权,可重新发起。</AlertDescription>
              </Alert>
            )}
            <Button
              data-testid="coding-plan-start"
              onClick={start}
              disabled={phase === "failed" || phase === "cancelled" ? false : false}
            >
              {phase === "failed" ? "重新发起授权" : "使用 Coding Plan 登录"}
            </Button>
          </div>
        )}

        {/* requesting：显示 loading */}
        {phase === "requesting" && (
          <div
            data-testid="coding-plan-requesting"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner className="size-4" />
            正在向 {providerDisplayName} 申请授权…
          </div>
        )}

        {/* awaiting-user：显示 user_code + 倒计时进度条 */}
        {phase === "awaiting-user" && grant && (
          <div data-testid="coding-plan-awaiting" className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="mb-2 font-medium">在浏览器中完成授权：</p>
              <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
                <li>
                  打开
                  <a
                    data-testid="coding-plan-verification-uri"
                    href={grant.verification_uri_complete ?? grant.verification_uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mx-1 inline-flex items-center gap-0.5 text-primary underline underline-offset-2"
                  >
                    {grant.verification_uri}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </li>
                <li>
                  输入或粘贴用户码
                  <code
                    data-testid="coding-plan-user-code"
                    className="mx-1 select-all rounded bg-background px-2 py-0.5 font-mono text-foreground"
                  >
                    {grant.user_code}
                  </code>
                  <Button
                    data-testid="coding-plan-copy-user-code"
                    variant="ghost"
                    size="sm"
                    className="ml-1 h-6 px-2"
                    onClick={async () => {
                      const ok = await copyUserCode();
                      setCopyHint(ok ? "已复制" : "复制失败");
                      setTimeout(() => setCopyHint(null), 1500);
                    }}
                  >
                    <CopyIcon className="size-3" />
                    {copyHint ?? "复制"}
                  </Button>
                </li>
                <li>在 {providerDisplayName} 网站确认授权</li>
              </ol>
            </div>

            {/* 倒计时进度条 */}
            <div data-testid="coding-plan-progress" className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>剩余时间</span>
                <span data-testid="coding-plan-countdown">
                  {Math.floor(secondsRemaining / 60)
                    .toString()
                    .padStart(2, "0")}
                  :{(secondsRemaining % 60).toString().padStart(2, "0")}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressPct)}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {secondsRemaining > 0
                  ? "授权完成后会自动跳到下一步,无需手动操作。"
                  : "已超时,请重新发起授权。"}
              </p>
            </div>

            <Button
              data-testid="coding-plan-cancel"
              variant="ghost"
              size="sm"
              onClick={cancel}
            >
              取消授权
            </Button>
          </div>
        )}

        {/* 成功回调 */}
        {boundProvider && (
          <div className="text-xs text-muted-foreground" data-testid="coding-plan-bound-provider">
            已绑定: {boundProvider}
            {onBound && (
              <span className="ml-1">
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => onBound(boundProvider)}
                >
                  应用到当前 Provider
                </Button>
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
