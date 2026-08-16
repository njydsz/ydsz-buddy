// FILE: ComposerVoiceRecorderBar.tsx
// Purpose: Renders the expanded WhatsApp-style voice recorder UI inside the chat composer.
// Layer: Chat composer presentation
// Depends on: live waveform samples and caller-owned record/cancel/send actions.
/**
 * @file Composer 语音录制条
 *
 * 仿 WhatsApp 风格的扩展语音录制 UI：
 *
 * - **实时波形**：基于 `samples` 数组渲染
 * - **录音时长**：通过 `durationLabel` 展示
 * - **操作按钮**：取消 / 停止 / 发送
 * - **转录中**：spinner
 * - **下发动画（P1-8）**：
 *     - `pulseStage`：录音中整条呼吸脉冲（红点+边框呼吸）
 *     - `conveyor`：转写中波形条持续向右滚动
 *     - `flyOutSignal`：外部触发的"飞入输入框"动画，每段波形向右上飘出
 * - 兼容 `useReducedMotion`：开启时所有动画降级为静态
 *
 * ## 核心导出
 *
 * - `ComposerVoiceRecorderBar`：主组件
 *
 * ## 使用场景
 *
 * - Composer 中长按语音按钮展开
 *
 * ## 注意事项
 *
 * - 状态由 `useComposerVoiceController` 提供
 * - 波形 sample 通过 `requestAnimationFrame` 滚动
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { FiArrowUp } from "react-icons/fi";
import { IoStopSharp } from "react-icons/io5";
import { Loader2Icon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { useReducedMotion } from "~/hooks/useReducedMotion";

interface ComposerVoiceRecorderBarProps {
  disabled?: boolean;
  durationLabel: string;
  isRecording: boolean;
  isTranscribing: boolean;
  waveformLevels: readonly number[];
  /**
   * 外部触发的"飞入输入框"信号：
   * 每次值变化时，最新一段波形会向右上飘出后淡出。
   * 用于在润色完成时给用户"已交付"的视觉反馈。
   */
  flyOutSignal?: number;
  onCancel: () => void;
  onSubmit: () => void;
}

const BAR_WIDTH_PX = 2;
const BAR_GAP_PX = 2;
const BAR_MIN_HEIGHT_PX = 3;
const BAR_MAX_HEIGHT_PX = 22;

export const ComposerVoiceRecorderBar = memo(function ComposerVoiceRecorderBar(
  props: ComposerVoiceRecorderBarProps,
) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [visibleBarCount, setVisibleBarCount] = useState(96);
  const { isReducedMotionEnabled } = useReducedMotion();
  // 缓存上一次的信号值用于驱动单次动画 key
  const lastFlyOutSignalRef = useRef<number | undefined>(props.flyOutSignal);
  // 初始 props.flyOutSignal 已有值时,首次渲染即激活飞入动画
  const [activeFlyOutKey, setActiveFlyOutKey] = useState(() =>
    props.flyOutSignal === undefined || isReducedMotionEnabled ? 0 : 1,
  );

  useEffect(() => {
    const node = trackRef.current;
    if (!node) {
      return;
    }
    const computeVisibleBars = () => {
      const width = node.clientWidth;
      if (width <= 0) {
        return;
      }
      setVisibleBarCount(Math.max(8, Math.floor(width / (BAR_WIDTH_PX + BAR_GAP_PX))));
    };
    computeVisibleBars();
    const observer = new ResizeObserver(computeVisibleBars);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // 飞入动画触发器：外部 flyOutSignal 变化时生成新 key，触发一次 CSS 动画
  useEffect(() => {
    if (props.flyOutSignal === undefined) {
      lastFlyOutSignalRef.current = undefined;
      return;
    }
    if (props.flyOutSignal === lastFlyOutSignalRef.current) {
      return;
    }
    lastFlyOutSignalRef.current = props.flyOutSignal;
    if (isReducedMotionEnabled) {
      // 减少动画偏好下不触发飞入动画,但仍更新 key 避免堆积
      return;
    }
    setActiveFlyOutKey((current) => current + 1);
  }, [props.flyOutSignal, isReducedMotionEnabled]);

  const visibleLevels = props.waveformLevels.slice(-visibleBarCount);
  const flyOutActive =
    !isReducedMotionEnabled && props.flyOutSignal !== undefined && activeFlyOutKey > 0;
  const pulseActive = props.isRecording && !props.isTranscribing;
  const conveyorActive = props.isTranscribing;

  const waveformBarClass = useMemo(
    () =>
      cn(
        "shrink-0 rounded-[1px] bg-zinc-900 dark:bg-zinc-100",
        conveyorActive && "opacity-55",
      ),
    [conveyorActive],
  );

  return (
    <div
      data-testid="voice-recorder-bar"
      data-state={
        props.isRecording && props.isTranscribing
          ? "transcribing"
          : props.isRecording
            ? "recording"
            : props.isTranscribing
              ? "transcribing"
              : "idle"
      }
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5",
        pulseActive && !isReducedMotionEnabled && "recorder-pulse",
      )}
    >
      <div
        ref={trackRef}
        className={cn(
          "relative flex h-7 min-w-0 flex-1 items-center overflow-hidden",
          pulseActive && !isReducedMotionEnabled && "recorder-track-pulse",
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-zinc-300 dark:border-zinc-700"
        />
        {/* 录音中红点呼吸指示器 */}
        {pulseActive && !isReducedMotionEnabled ? (
          <span
            aria-hidden="true"
            data-testid="voice-recorder-recording-dot"
            className="recorder-recording-dot pointer-events-none absolute left-1 top-1/2 -translate-y-1/2"
          />
        ) : null}
        <div
          className={cn(
            "relative ml-auto flex h-full items-center",
            conveyorActive && !isReducedMotionEnabled && "recorder-conveyor",
          )}
          style={{ gap: `${BAR_GAP_PX}px` }}
        >
          {visibleLevels.map((level, index) => {
            const clamped = Math.max(0.04, Math.min(1, level));
            const height = Math.round(
              BAR_MIN_HEIGHT_PX + clamped * (BAR_MAX_HEIGHT_PX - BAR_MIN_HEIGHT_PX),
            );
            const positionFromRight = visibleLevels.length - index;
            const isFlyOutTarget = flyOutActive && positionFromRight === 1;
            return (
              <span
                key={positionFromRight}
                aria-hidden="true"
                data-testid={isFlyOutTarget ? "voice-recorder-flyout" : undefined}
                data-flyout-key={isFlyOutTarget ? activeFlyOutKey : undefined}
                className={cn(
                  waveformBarClass,
                  isFlyOutTarget && "recorder-flyout",
                )}
                style={{
                  width: `${BAR_WIDTH_PX}px`,
                  height: `${height}px`,
                }}
              />
            );
          })}
        </div>
      </div>

      <span className="shrink-0 text-xs font-medium tabular-nums tracking-[0.02em] text-zinc-500 dark:text-zinc-400">
        {props.durationLabel}
      </span>

      <button
        type="button"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15 sm:h-7 sm:w-7"
        aria-label={props.isTranscribing ? "Transcribing voice note" : "Cancel voice note"}
        disabled={props.disabled || props.isTranscribing}
        onClick={props.onCancel}
      >
        {props.isTranscribing ? (
          <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
        ) : (
          <IoStopSharp aria-hidden="true" className="size-[11px]" />
        )}
      </button>

      <button
        type="button"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:h-7 sm:w-7"
        aria-label={props.isTranscribing ? "Transcribing voice note" : "Send voice note"}
        disabled={props.disabled || props.isTranscribing}
        onClick={props.onSubmit}
      >
        {props.isTranscribing ? (
          <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
        ) : (
          <FiArrowUp aria-hidden="true" className="size-[13px]" strokeWidth={2.25} />
        )}
      </button>
    </div>
  );
});
