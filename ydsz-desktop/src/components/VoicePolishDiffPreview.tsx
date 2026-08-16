/**
 * @file VoicePolishDiffPreview.tsx
 * @description Composer 上方展示的"语音转写润色前后对比"banner。
 *
 * 行为契约:
 * 1. 显示润色前后的 diff 段(added/removed/kept 高亮)
 * 2. 显示变更摘要(变更数 + 变更率)
 * 3. 显示倒计时进度条(30s 后自动接受)
 * 4. 用户可点"撤销"回原始 transcript
 * 5. 用户可点"关闭"立即接受润色版
 *
 * 受控组件: 父组件维护 startedAt 与 onAccept/onRevert 回调
 */

import { memo, useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  SparklesIcon,
  Undo2Icon,
  XIcon,
} from "~/lib/icons";

import { Button } from "./ui/button";
import { cn } from "~/lib/utils";
import { useTranslation } from "../i18n/I18nContext";

import {
  computePolishDiffCountdown,
  planPolishDiffDisplay,
  summarizePolishDiff,
  VOICE_POLISH_PREVIEW_WINDOW_MS,
} from "../lib/voicePolishDiffPreviewLogic";
import type {
  PolishDiffDisplaySegment,
  PolishDiffSummary,
} from "../lib/voicePolishDiffPreviewLogic";
import type { PolishDiffSegment, PolishDiffStats } from "../lib/voicePolishDiff";

/** 组件属性 */
export interface VoicePolishDiffPreviewProps {
  /** 原始转写文本(润色前) */
  original: string;
  /** 润色后文本 */
  polished: string;
  /** diff 段(由 diffPolishResult 计算) */
  segments: ReadonlyArray<PolishDiffSegment>;
  /** diff 统计(由 summarizePolishDiff 计算) */
  stats: PolishDiffStats;
  /** 启动时间戳(performance.now() / Date.now() 都可) */
  startedAt: number;
  /** 倒计时窗口毫秒(默认 30s) */
  windowMs?: number;
  /** 自动接受回调(倒计时结束时调用) */
  onAccept: () => void;
  /** 撤销回原文回调 */
  onRevert: () => void;
  /** 手动关闭回调(等价于 onAccept) */
  onDismiss: () => void;
  /** 自定义 className */
  className?: string;
}

const kindToClassName: Record<PolishDiffSegment["kind"], string> = {
  kept: "text-muted-foreground/80",
  added: "rounded-sm bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  removed:
    "rounded-sm bg-rose-500/15 text-rose-700 line-through decoration-rose-500/60 dark:text-rose-300",
};

/** 内部小型 hook: 维持每秒一次 re-render 以更新进度条 */
function usePolishPreviewTicker(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 250);
    return () => {
      window.clearInterval(id);
    };
  }, [active]);
  return tick;
}

interface SegmentRowProps {
  segment: PolishDiffDisplaySegment;
}

const SegmentRow = memo(function SegmentRow({ segment }: SegmentRowProps) {
  if (segment.kind === "kept") {
    return (
      <span className={cn("whitespace-pre-wrap break-words", kindToClassName.kept)}>
        {segment.text}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "whitespace-pre-wrap break-words px-0.5",
        kindToClassName[segment.kind],
      )}
      data-diff-kind={segment.kind}
    >
      {segment.text}
    </span>
  );
});

/**
 * Voice polish diff preview 组件
 */
export const VoicePolishDiffPreview = memo(function VoicePolishDiffPreview(
  props: VoicePolishDiffPreviewProps,
) {
  const { language, messages } = useTranslation();
  const voicePolishMessages = messages.voicePolish;
  const windowMs = props.windowMs ?? VOICE_POLISH_PREVIEW_WINDOW_MS;
  // 触发 ticker: 250ms 一次更新倒计时
  usePolishPreviewTicker(true);
  const now = Date.now();
  const countdown = computePolishDiffCountdown(props.startedAt, now, windowMs);
  const locale: "zh" | "en" = language === "zh" ? "zh" : "en";
  const summary: PolishDiffSummary = useMemo(
    () => summarizePolishDiff({ stats: props.stats, locale }),
    [props.stats, locale],
  );
  const display = useMemo(
    () => planPolishDiffDisplay(props.segments),
    [props.segments],
  );

  // 倒计时归零 → 自动接受
  useEffect(() => {
    if (!countdown.expired) return;
    props.onAccept();
  }, [countdown.expired, props]);

  const remainingSeconds = Math.ceil(countdown.remainingMs / 1000);

  return (
    <div
      data-testid="voice-polish-diff-preview"
      data-voice-polish-summary={summary.label}
      data-voice-polish-remaining-ms={countdown.remainingMs}
      role="status"
      aria-live="polite"
      className={cn(
        "relative mx-auto flex w-11/12 flex-col gap-2 rounded-t-2xl border border-b-0 border-(--color-border) bg-background/80 px-3 py-2 text-[12px] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] backdrop-blur-sm",
        props.className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <SparklesIcon className="size-3 shrink-0 text-(--color-text-foreground-secondary)" />
          <span className="truncate text-[12px] font-medium text-foreground/85">
            {voicePolishMessages.previewTitle}
          </span>
          <span className="shrink-0 text-[11px] text-(--color-text-foreground-secondary)">
            · {summary.label}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-testid="voice-polish-revert"
            onClick={props.onRevert}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            <Undo2Icon className="size-3" aria-hidden="true" />
            {voicePolishMessages.previewRevert}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-testid="voice-polish-dismiss"
            onClick={props.onDismiss}
            aria-label={voicePolishMessages.previewDismiss}
            className="size-6 p-0"
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div
        data-testid="voice-polish-diff-segments"
        className="max-h-24 overflow-y-auto rounded-md border border-(--color-border-light) bg-background/40 px-2 py-1.5 text-[12px] leading-5"
      >
        {display.segments.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          display.segments.map((segment, index) => (
            <SegmentRow key={`${segment.kind}-${index}`} segment={segment} />
          ))
        )}
        {display.truncated ? (
          <span
            data-testid="voice-polish-diff-truncated"
            className="ml-1 text-[11px] italic text-(--color-text-foreground-secondary)"
          >
            {voicePolishMessages.previewTruncated}
          </span>
        ) : null}
      </div>

      <footer className="flex items-center gap-2 text-[11px] text-(--color-text-foreground-secondary)">
        <CheckIcon className="size-3 shrink-0" aria-hidden="true" />
        <span className="shrink-0 tabular-nums">
          {voicePolishMessages.previewAutoAccept(remainingSeconds)}
        </span>
        <div
          className="relative h-1 flex-1 overflow-hidden rounded-full bg-(--color-background-button-secondary)"
          aria-hidden="true"
        >
          <div
            data-testid="voice-polish-progress"
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/70 transition-[width] duration-200 ease-linear"
            style={{ width: `${Math.round(countdown.progress * 100)}%` }}
          />
        </div>
      </footer>
    </div>
  );
});
