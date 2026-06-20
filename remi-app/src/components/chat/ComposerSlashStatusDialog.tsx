/**
 * @file ComposerSlashStatusDialog
 * @description 编辑器会话状态对话框，展示当前会话的运行时控件和线程状态，
 *              包括模型、快速模式、推理力度、环境、分支、上下文窗口和速率限制等信息。
 */

import type { ResolvedThreadWorkspaceState } from "~/shared/threadEnvironment";
import type { ProviderInteractionMode } from "~/contracts";
import type { DraftThreadEnvMode } from "../../composerDraftStore";
import {
  type ContextWindowSnapshot,
  formatContextWindowTokens,
  formatCostUsd,
} from "../../lib/contextWindow";
import type { RateLimitStatus } from "./RateLimitBanner";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { ContextWindowMeter } from "./ContextWindowMeter";

/**
 * 格式化速率限制状态为可读消息。
 *
 * @param rateLimitStatus - 速率限制状态
 * @returns 格式化后的消息文本
 */
function formatRateLimitMessage(rateLimitStatus: RateLimitStatus): string {
  const resetSuffix = rateLimitStatus.resetsAt
    ? ` Resets at ${new Date(rateLimitStatus.resetsAt).toLocaleTimeString()}.`
    : "";
  if (rateLimitStatus.status === "rejected") {
    return `Rate limit reached.${resetSuffix}`;
  }
  const utilizationSuffix =
    typeof rateLimitStatus.utilization === "number"
      ? ` (${Math.round(rateLimitStatus.utilization * 100)}% used)`
      : "";
  return `Approaching rate limit${utilizationSuffix}.${resetSuffix}`;
}

/**
 * 格式化环境模式标签。
 *
 * @param envMode - 环境模式（本地或工作树）
 * @param envState - 已解析的线程工作区状态
 * @returns 环境标签文本
 */
function formatEnvironmentLabel(
  envMode: DraftThreadEnvMode,
  envState: ResolvedThreadWorkspaceState,
): string {
  if (envMode === "local") {
    return "Local";
  }
  return envState === "worktree-pending" ? "New worktree (pending)" : "Worktree";
}

/**
 * 编辑器会话状态对话框组件。
 * 展示当前会话的模型配置、环境状态、上下文窗口使用量和速率限制等信息。
 *
 * @param props.open - 对话框打开状态
 * @param props.onOpenChange - 对话框打开状态变更回调
 * @param props.selectedModel - 当前选中的模型
 * @param props.fastModeEnabled - 是否启用快速模式
 * @param props.selectedPromptEffort - 当前推理力度
 * @param props.interactionMode - 交互模式
 * @param props.envMode - 环境模式
 * @param props.envState - 环境状态
 * @param props.branch - 当前分支
 * @param props.contextWindow - 上下文窗口快照
 * @param props.cumulativeCostUsd - 累计费用（美元）
 * @param props.rateLimitStatus - 速率限制状态
 * @param props.activeContextWindowLabel - 活跃上下文窗口标签
 * @param props.pendingContextWindowLabel - 待定上下文窗口标签
 */
export function ComposerSlashStatusDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedModel: string | null | undefined;
  fastModeEnabled: boolean;
  selectedPromptEffort: string | null;
  interactionMode: ProviderInteractionMode;
  envMode: DraftThreadEnvMode;
  envState: ResolvedThreadWorkspaceState;
  branch: string | null;
  contextWindow: ContextWindowSnapshot | null;
  cumulativeCostUsd: number | null;
  rateLimitStatus: RateLimitStatus | null;
  activeContextWindowLabel?: string | null;
  pendingContextWindowLabel?: string | null;
}) {
  const {
    open,
    onOpenChange,
    selectedModel,
    fastModeEnabled,
    selectedPromptEffort,
    interactionMode,
    envMode,
    envState,
    branch,
    contextWindow,
    cumulativeCostUsd,
    rateLimitStatus,
    activeContextWindowLabel,
    pendingContextWindowLabel,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Session Status</DialogTitle>
          <DialogDescription>
            Runtime controls and local thread state for the active composer.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Model</p>
              <p className="font-medium text-foreground">{selectedModel}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Fast Mode</p>
              <p className="font-medium text-foreground">{fastModeEnabled ? "On" : "Off"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Reasoning</p>
              <p className="font-medium text-foreground">{selectedPromptEffort ?? "Default"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Mode</p>
              <p className="font-medium text-foreground">
                {interactionMode === "plan" ? "Plan" : "Default"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Environment
              </p>
              <p className="font-medium text-foreground">
                {formatEnvironmentLabel(envMode, envState)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Branch</p>
              <p className="font-medium text-foreground">{branch ?? "Unknown"}</p>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Context Window
                </p>
                <p className="text-sm text-muted-foreground">
                  Latest usage reported by the active thread.
                </p>
                {pendingContextWindowLabel ? (
                  <p className="text-sm text-muted-foreground">
                    Current session: {activeContextWindowLabel ?? "Unknown"}. Next turn:{" "}
                    {pendingContextWindowLabel}.
                  </p>
                ) : null}
              </div>
              {contextWindow ? (
                <ContextWindowMeter
                  usage={contextWindow}
                  cumulativeCostUsd={cumulativeCostUsd}
                  activeWindowLabel={activeContextWindowLabel}
                  pendingWindowLabel={pendingContextWindowLabel}
                />
              ) : null}
            </div>
            {contextWindow ? (
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Used</p>
                  <p className="font-medium text-foreground">
                    {formatContextWindowTokens(contextWindow.usedTokens)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Remaining</p>
                  <p className="font-medium text-foreground">
                    {formatContextWindowTokens(contextWindow.remainingTokens)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Window</p>
                  <p className="font-medium text-foreground">
                    {formatContextWindowTokens(contextWindow.maxTokens)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cost</p>
                  <p className="font-medium text-foreground">
                    {cumulativeCostUsd !== null
                      ? formatCostUsd(cumulativeCostUsd)
                      : "Not available"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Context usage has not been reported yet for this thread.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 bg-card p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Rate Limits</p>
            {rateLimitStatus ? (
              <p className="text-sm text-foreground">{formatRateLimitMessage(rateLimitStatus)}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active rate-limit warning for this thread.
              </p>
            )}
          </div>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
