/**
 * @file Composer 输入反馈组件
 * @description 显示字符计数、@提及加载状态、长文截断警告和草稿保存状态
 * @module components/ComposerInputFeedback
 */

import { Loader2Icon, AlertCircleIcon, CheckCircleIcon, ScissorsIcon } from "lucide-react";
import { memo, useCallback, type FC } from "react";
import { cn } from "~/lib/utils";
import {
  ANIMATION_CONFIG,
  getAnimationDuration,
  getTransition,
} from "~/lib/animation";
import {
  type CharCountStatus,
  CHAR_LIMIT_SUGGESTED,
  CHAR_LIMIT_WARNING,
} from "~/hooks/useSmartInputFeedback";

/**
 * 字符计数状态对应的颜色类名
 */
const CHAR_COUNT_STATUS_COLORS: Record<CharCountStatus, string> = {
  normal: "text-muted-foreground",
  warning: "text-warning",
  danger: "text-destructive",
  exceeded: "text-destructive font-semibold",
};

/**
 * Composer 输入反馈组件属性
 */
export interface ComposerInputFeedbackProps {
  /** 当前字符数 */
  charCount: number;
  /** 字符计数状态 */
  charCountStatus: CharCountStatus;
  /** 字符限制 */
  charLimit?: number;
  /** 是否显示 @提及加载指示器 */
  showMentionLoading?: boolean;
  /** 是否显示长文截断警告 */
  showTruncationWarning?: boolean;
  /** 截断文本回调 */
  onTruncate?: () => void;
  /** 忽略截断警告回调 */
  onDismissTruncationWarning?: () => void;
  /** 草稿最后保存时间戳 */
  lastSavedAt?: number | null;
  /** 是否正在保存草稿 */
  isSaving?: boolean;
  /** 是否偏好减少动画 */
  prefersReducedMotion?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 字符计数显示组件
 */
const CharCountDisplay: FC<{
  charCount: number;
  charCountStatus: CharCountStatus;
  charLimit: number;
  prefersReducedMotion: boolean;
}> = memo(({ charCount, charCountStatus, charLimit, prefersReducedMotion }) => {
  const showLimit = charCount >= CHAR_LIMIT_WARNING;

  const transition = getTransition(
    ["color", "opacity"],
    ANIMATION_CONFIG.duration.fast,
    ANIMATION_CONFIG.easing.easeOut,
    prefersReducedMotion
  );

  return (
    <span
      className={cn(
        "text-xs tabular-nums transition-colors",
        CHAR_COUNT_STATUS_COLORS[charCountStatus]
      )}
      style={{ transition }}
      aria-live="polite"
      aria-label={`字符数: ${charCount}${showLimit ? ` / ${charLimit}` : ""}`}
    >
      {charCount.toLocaleString()}
      {showLimit && (
        <span className="text-muted-foreground/60">
          {" / "}
          {charLimit.toLocaleString()}
        </span>
      )}
    </span>
  );
});

CharCountDisplay.displayName = "CharCountDisplay";

/**
 * @提及加载指示器组件
 */
const MentionLoadingIndicator: FC<{
  show: boolean;
  prefersReducedMotion: boolean;
}> = memo(({ show, prefersReducedMotion }) => {
  const duration = getAnimationDuration(
    ANIMATION_CONFIG.duration.fast,
    prefersReducedMotion
  );

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs text-info",
        show ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      style={{
        transition: `opacity ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`,
      }}
      aria-hidden={!show}
    >
      <Loader2Icon
        className={cn(
          "h-3 w-3 animate-spin",
          !show && "opacity-0"
        )}
        aria-hidden="true"
      />
      <span>搜索提及...</span>
    </span>
  );
});

MentionLoadingIndicator.displayName = "MentionLoadingIndicator";

/**
 * 长文截断警告组件
 */
const TruncationWarningBanner: FC<{
  show: boolean;
  charCount: number;
  onTruncate: () => void;
  onDismiss: () => void;
  prefersReducedMotion: boolean;
}> = memo(({ show, charCount, onTruncate, onDismiss, prefersReducedMotion }) => {
  const duration = getAnimationDuration(
    ANIMATION_CONFIG.duration.normal,
    prefersReducedMotion
  );

  const handleTruncate = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onTruncate();
    },
    [onTruncate]
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDismiss();
    },
    [onDismiss]
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning",
        show
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-1 pointer-events-none"
      )}
      style={{
        transition: `opacity ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}, transform ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`,
      }}
      role="alert"
      aria-hidden={!show}
    >
      <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        文本较长 ({charCount.toLocaleString()} 字符)，可能影响性能
      </span>
      <button
        type="button"
        onClick={handleTruncate}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-warning hover:bg-warning/20 transition-colors"
        aria-label="智能截断文本"
      >
        <ScissorsIcon className="h-3 w-3" aria-hidden="true" />
        <span>截断</span>
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        className="rounded px-1.5 py-0.5 text-warning/70 hover:bg-warning/20 hover:text-warning transition-colors"
        aria-label="忽略警告"
      >
        忽略
      </button>
    </div>
  );
});

TruncationWarningBanner.displayName = "TruncationWarningBanner";

/**
 * 草稿保存状态指示器组件
 */
const DraftSaveStatusIndicator: FC<{
  lastSavedAt: number | null;
  isSaving: boolean;
  prefersReducedMotion: boolean;
}> = memo(({ lastSavedAt, isSaving, prefersReducedMotion }) => {
  const duration = getAnimationDuration(
    ANIMATION_CONFIG.duration.fast,
    prefersReducedMotion
  );

  // 格式化保存时间
  const formatSavedTime = useCallback((timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 1000) {
      return "刚刚保存";
    }
    if (diff < 60000) {
      return `${Math.floor(diff / 1000)} 秒前保存`;
    }
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)} 分钟前保存`;
    }

    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, []);

  const showSaved = lastSavedAt !== null && !isSaving;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        isSaving ? "text-muted-foreground" : showSaved ? "text-success" : "opacity-0"
      )}
      style={{
        transition: `opacity ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}, color ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`,
      }}
      aria-live="polite"
    >
      {isSaving ? (
        <>
          <Loader2Icon className="h-3 w-3 animate-spin" aria-hidden="true" />
          <span>保存中...</span>
        </>
      ) : showSaved ? (
        <>
          <CheckCircleIcon className="h-3 w-3" aria-hidden="true" />
          <span>{formatSavedTime(lastSavedAt)}</span>
        </>
      ) : null}
    </span>
  );
});

DraftSaveStatusIndicator.displayName = "DraftSaveStatusIndicator";

/**
 * Composer 输入反馈组件
 *
 * @description
 * 在 Composer 输入框下方显示智能反馈信息：
 * - 字符计数（接近限制时变色警告）
 * - @提及补全加载指示器
 * - 长文截断警告（提供智能截断选项）
 * - 草稿自动保存状态
 *
 * @param props - 组件属性
 * @returns 反馈 UI 组件
 *
 * @example
 * ```tsx
 * <ComposerInputFeedback
 *   charCount={charCount}
 *   charCountStatus={charCountStatus}
 *   showMentionLoading={isSearching}
 *   showTruncationWarning={showWarning}
 *   onTruncate={handleTruncate}
 *   lastSavedAt={lastSavedAt}
 *   isSaving={isSaving}
 * />
 * ```
 */
export const ComposerInputFeedback: FC<ComposerInputFeedbackProps> = memo(
  ({
    charCount,
    charCountStatus,
    charLimit = CHAR_LIMIT_SUGGESTED,
    showMentionLoading = false,
    showTruncationWarning = false,
    onTruncate,
    onDismissTruncationWarning,
    lastSavedAt = null,
    isSaving = false,
    prefersReducedMotion = false,
    className,
  }) => {
    const handleTruncate = useCallback(() => {
      onTruncate?.();
    }, [onTruncate]);

    const handleDismissTruncationWarning = useCallback(() => {
      onDismissTruncationWarning?.();
    }, [onDismissTruncationWarning]);

    // 是否显示任何反馈内容
    const hasFeedback =
      charCount > 0 || showMentionLoading || showTruncationWarning || lastSavedAt !== null;

    if (!hasFeedback && charCountStatus === "normal") {
      return null;
    }

    return (
      <div
        className={cn(
          "flex flex-col gap-1.5 px-3 py-1.5",
          className
        )}
        role="status"
        aria-label="输入反馈"
      >
        {/* 长文截断警告（单独一行） */}
        <TruncationWarningBanner
          show={showTruncationWarning}
          charCount={charCount}
          onTruncate={handleTruncate}
          onDismiss={handleDismissTruncationWarning}
          prefersReducedMotion={prefersReducedMotion}
        />

        {/* 主反馈行 */}
        <div className="flex items-center justify-between gap-2">
          {/* 左侧：@提及加载状态 */}
          <div className="flex items-center gap-2">
            <MentionLoadingIndicator
              show={showMentionLoading}
              prefersReducedMotion={prefersReducedMotion}
            />
          </div>

          {/* 右侧：草稿保存状态 + 字符计数 */}
          <div className="flex items-center gap-3">
            <DraftSaveStatusIndicator
              lastSavedAt={lastSavedAt}
              isSaving={isSaving}
              prefersReducedMotion={prefersReducedMotion}
            />
            <CharCountDisplay
              charCount={charCount}
              charCountStatus={charCountStatus}
              charLimit={charLimit}
              prefersReducedMotion={prefersReducedMotion}
            />
          </div>
        </div>
      </div>
    );
  }
);

ComposerInputFeedback.displayName = "ComposerInputFeedback";

/**
 * 仅字符计数组件（用于紧凑布局）
 */
export const CompactCharCount: FC<{
  charCount: number;
  charCountStatus: CharCountStatus;
  charLimit?: number;
  className?: string;
}> = memo(({ charCount, charCountStatus, charLimit = CHAR_LIMIT_SUGGESTED, className }) => {
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        CHAR_COUNT_STATUS_COLORS[charCountStatus],
        className
      )}
      aria-live="polite"
    >
      {charCount.toLocaleString()}
      {charCount >= CHAR_LIMIT_WARNING && (
        <span className="text-muted-foreground/60">
          {" / "}
          {charLimit.toLocaleString()}
        </span>
      )}
    </span>
  );
});

CompactCharCount.displayName = "CompactCharCount";
