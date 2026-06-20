/**
 * @file ComposerVoiceRecorderBar.tsx
 * @description 聊天编辑器中的语音录制条，展示 WhatsApp 风格的实时波形、录制时长和取消/发送按钮。
 */

import { memo, useEffect, useRef, useState } from "react";
import { FiArrowUp } from "react-icons/fi";
import { IoStopSharp } from "react-icons/io5";

import { Loader2Icon } from "~/lib/icons";
import { cn } from "~/lib/utils";

/**
 * ComposerVoiceRecorderBar 组件的属性接口
 */
interface ComposerVoiceRecorderBarProps {
  /** 是否禁用操作按钮 */
  disabled?: boolean;
  /** 录制时长标签 */
  durationLabel: string;
  /** 是否正在录制 */
  isRecording: boolean;
  /** 是否正在转录 */
  isTranscribing: boolean;
  /** 实时波形电平数组 */
  waveformLevels: readonly number[];
  /** 取消录制的回调 */
  onCancel: () => void;
  /** 发送语音的回调 */
  onSubmit: () => void;
}

/** 波形条宽度（像素） */
const BAR_WIDTH_PX = 2;
/** 波形条间距（像素） */
const BAR_GAP_PX = 2;
/** 波形条最小高度（像素） */
const BAR_MIN_HEIGHT_PX = 3;
/** 波形条最大高度（像素） */
const BAR_MAX_HEIGHT_PX = 22;

/**
 * ComposerVoiceRecorderBar 组件
 * @description 语音录制条，展示实时波形、录制时长和取消/发送按钮
 * @param props.disabled - 是否禁用操作按钮
 * @param props.durationLabel - 录制时长标签
 * @param props.isRecording - 是否正在录制
 * @param props.isTranscribing - 是否正在转录
 * @param props.waveformLevels - 实时波形电平数组
 * @param props.onCancel - 取消录制的回调
 * @param props.onSubmit - 发送语音的回调
 */
export const ComposerVoiceRecorderBar = memo(function ComposerVoiceRecorderBar(
  props: ComposerVoiceRecorderBarProps,
) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [visibleBarCount, setVisibleBarCount] = useState(96);

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

  const visibleLevels = props.waveformLevels.slice(-visibleBarCount);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <div ref={trackRef} className="relative flex h-7 min-w-0 flex-1 items-center overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-zinc-300 dark:border-zinc-700"
        />
        <div
          className="relative ml-auto flex h-full items-center"
          style={{ gap: `${BAR_GAP_PX}px` }}
        >
          {visibleLevels.map((level, index) => {
            const clamped = Math.max(0.04, Math.min(1, level));
            const height = Math.round(
              BAR_MIN_HEIGHT_PX + clamped * (BAR_MAX_HEIGHT_PX - BAR_MIN_HEIGHT_PX),
            );
            const positionFromRight = visibleLevels.length - index;
            return (
              <span
                key={positionFromRight}
                aria-hidden="true"
                className={cn(
                  "shrink-0 rounded-[1px] bg-zinc-900 dark:bg-zinc-100",
                  props.isTranscribing && "opacity-55",
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
