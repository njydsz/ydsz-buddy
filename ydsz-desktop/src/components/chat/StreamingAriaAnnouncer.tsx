/**
 * @file 流式响应 aria-live 播报组件
 * @description 为屏幕阅读器提供节流播报,避免每个 streaming chunk 都打断用户。
 *
 * ## 核心设计
 *
 * - **节流播报**: 只在完整段落/句子边界播报 (句号、换行、markdown 段落分隔)
 * - **延迟触发**: 从上次播报后等待 800ms,确保 chunk 已稳定为完整段
 * - **状态播报**: 流式开始时播报"正在生成回复",完成时播报"回复完成"
 * - **进度播报**: 长任务 (>10s) 每 5s 播报一次进度
 *
 * ## 无障碍标准
 *
 * - aria-live="polite" 不打断当前朗读
 * - aria-atomic="false" 仅朗读新增内容
 * - 符合 WCAG 2.1 AA 4.1.3 Status Messages
 */

import { memo, useEffect, useRef, useState } from "react";

interface StreamingAriaAnnouncerProps {
  /** 当前流式文本 */
  streamingText: string | null;
  /** 是否正在流式生成 */
  isStreaming: boolean;
  /** 是否刚完成流式生成 (用于播报完成状态) */
  justCompleted?: boolean;
  /** 流式开始时间 (用于进度播报) */
  streamingStartedAt?: number | null;
}

/** 检测文本是否到达完整段落/句子边界 */
function isAtSegmentBoundary(text: string): boolean {
  if (!text) return false;
  // 只去除首尾空格,保留换行符用于边界检测
  const trimmed = text.replace(/^[ \t]+|[ \t]+$/g, "");
  // 句号、问号、感叹号、中文标点、换行
  return /[.!?。！？]$|\n$/.test(trimmed);
}

/** 提取上次播报后新增的完整段落 */
function extractNewSegments(currentText: string, lastAnnouncedText: string): string | null {
  if (!currentText || currentText.length <= lastAnnouncedText.length) return null;
  // 找到上次播报后的新内容
  const newText = currentText.slice(lastAnnouncedText.length).trim();
  if (!newText) return null;
  // 只播报完整段落
  if (isAtSegmentBoundary(newText)) return newText;
  // 如果新内容包含段落分隔符 (双换行), 播报前面的完整段落
  const paragraphBreak = newText.lastIndexOf("\n\n");
  if (paragraphBreak > 0) {
    return newText.slice(0, paragraphBreak).trim();
  }
  return null;
}

/**
 * 流式响应 aria-live 播报组件
 *
 * 使用方式: 放在 MessagesTimeline 中,传入当前流式消息的文本
 */
export const StreamingAriaAnnouncer = memo(function StreamingAriaAnnouncer({
  streamingText,
  isStreaming,
  justCompleted = false,
  streamingStartedAt,
}: StreamingAriaAnnouncerProps) {
  const [announcement, setAnnouncement] = useState("");
  const lastAnnouncedTextRef = useRef("");
  const throttleTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const isStreamingRef = useRef(isStreaming);

  isStreamingRef.current = isStreaming;

  // 播报流式开始状态
  useEffect(() => {
    if (isStreaming && !justCompleted) {
      // 节流播报: 等待 800ms 确认文本已稳定为完整段
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
      throttleTimerRef.current = window.setTimeout(() => {
        if (!isStreamingRef.current) return;
        if (!streamingText) return;

        const newSegment = extractNewSegments(
          streamingText,
          lastAnnouncedTextRef.current,
        );
        if (newSegment) {
          // 截断过长段落 (屏幕阅读器一次性播报过长文本体验差)
          const truncated =
            newSegment.length > 500
              ? `${newSegment.slice(0, 500)}...`
              : newSegment;
          setAnnouncement(truncated);
          lastAnnouncedTextRef.current = streamingText;
        }
      }, 800);
    }
  }, [streamingText, isStreaming, justCompleted]);

  // 进度播报: 长任务 (>10s) 每 5s 播报一次
  useEffect(() => {
    if (!isStreaming || !streamingStartedAt) return;

    const checkProgress = () => {
      const elapsed = Date.now() - (streamingStartedAt ?? 0);
      if (elapsed > 10_000 && elapsed % 5_000 < 1_000) {
        const seconds = Math.round(elapsed / 1000);
        setAnnouncement(`回复生成中，已等待 ${seconds} 秒`);
      }
    };

    progressTimerRef.current = window.setInterval(checkProgress, 1000);
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, [isStreaming, streamingStartedAt]);

  // 播报完成状态
  useEffect(() => {
    if (justCompleted) {
      setAnnouncement("回复已完成");
      lastAnnouncedTextRef.current = "";
    }
  }, [justCompleted]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      role="status"
      className="sr-only"
      data-testid="streaming-aria-announcer"
    >
      {announcement}
    </div>
  );
});

/** 长任务进度条组件 (带 aria-valuenow) */
export const StreamingProgressBar = memo(function StreamingProgressBar({
  progress,
  isStreaming,
}: {
  progress: number;
  isStreaming: boolean;
}) {
  if (!isStreaming) return null;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="AI 回复生成进度"
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      data-testid="streaming-progress"
    >
      <div
        className="h-full bg-primary transition-all duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
});
