/**
 * @file Composer Review 模式提示横幅
 *
 * 当用户切换到 Review 模式时，在 Composer 上方展示一个轻量级提示横幅：
 *
 * - **当前生效模式**：明确告知用户处于代码审查模式
 * - **快速操作**：
 *   - 打开 Diff 面板（若未打开）
 *   - 选择审查目标（未提交变更 / 与基线分支对比）
 * - **最佳实践提示**：引导用户在 diff 上提问、引用 file:line 格式
 * - **不打扰设计**：仅在切换瞬间高亮 6 秒后转为低饱和度常驻徽标
 *
 * ## 使用场景
 *
 * - ChatView Composer 上方
 *
 * ## 注意事项
 *
 * - 与 Plan 模式横幅互斥（互斥的 mode 提示只展示一个）
 * - 模式切换会自动触发打开 Diff 面板（见 ChatView.handleInteractionModeChange）
 */

import { memo, useEffect, useState } from "react";
import { EyeIcon, ExternalLinkIcon, SearchIcon } from "~/lib/icons";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface ComposerReviewModeHintProps {
  /** Review 模式是否激活 */
  active: boolean;
  /** Diff 面板是否已打开 */
  diffOpen: boolean;
  /** 打开 Diff 面板的回调 */
  onOpenDiffPanel?: () => void;
  /** 触发审查目标选择器的回调（与 `/review` 斜杠命令联动） */
  onPickReviewTarget?: () => void;
}

/**
 * Review 模式提示横幅
 */
export const ComposerReviewModeHint = memo(function ComposerReviewModeHint({
  active,
  diffOpen,
  onOpenDiffPanel,
  onPickReviewTarget,
}: ComposerReviewModeHintProps) {
  // 进入 Review 模式后，6 秒内高亮提示，6 秒后转为低饱和度常驻徽标。
  const [highlighted, setHighlighted] = useState(false);
  useEffect(() => {
    if (!active) {
      setHighlighted(false);
      return;
    }
    setHighlighted(true);
    const handle = window.setTimeout(() => setHighlighted(false), 6_000);
    return () => window.clearTimeout(handle);
  }, [active]);

  if (!active) return null;

  return (
    <div
      data-testid="composer-review-mode-hint"
      data-highlighted={highlighted ? "true" : "false"}
      className={cn(
        "mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] transition-colors",
        highlighted
          ? "border-(--color-review-accent,var(--color-text-foreground-secondary))/40 bg-(--color-review-accent-soft,color-mix(in%20srgb,%20var(--color-text-foreground-secondary)%2010%25,%20transparent)) text-foreground"
          : "border-border/60 bg-muted/30 text-muted-foreground",
      )}
    >
      <EyeIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="font-medium text-foreground">Review 模式</span>
      <span className="hidden text-muted-foreground sm:inline">
        针对 diff 的代码审查 — 可在右侧查看变更，或直接提问
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {!diffOpen && onOpenDiffPanel ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={onOpenDiffPanel}
            title="打开 diff 面板查看待审查的代码变更"
            className="h-6 px-2 text-[11px]"
          >
            <ExternalLinkIcon className="size-3" />
            <span>打开 Diff</span>
          </Button>
        ) : null}
        {onPickReviewTarget ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onPickReviewTarget}
            title="选择 review 目标：未提交变更 / 与基线分支对比"
            className="h-6 px-2 text-[11px]"
          >
            <SearchIcon className="size-3" />
            <span>选择审查范围</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
});
