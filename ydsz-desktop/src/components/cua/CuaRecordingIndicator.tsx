/**
 * @file CuaRecordingIndicator.tsx
 * @description CUA 录制状态指示器组件。
 *
 * 功能：
 * - 录制状态 pulse 动画
 * - 录制时长计时
 * - 停止录制按钮
 * - 快捷键提示
 *
 * ## 核心导出
 *
 * - `CuaRecordingIndicator`：主组件（memo 包裹）
 *
 * ## 使用场景
 *
 * - CUA 会话中显示当前录制状态
 * - 悬浮在对话区域右上角
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  PiRecord,
  PiStop,
  PiClock,
  PiVideoCamera,
} from "react-icons/pi";
import { cn } from "~/lib/utils";

// ============================================================================
// 类型定义
// ============================================================================

/** Props */
interface CuaRecordingIndicatorProps {
  /** 是否正在录制 */
  recording: boolean;
  /** 录制开始时间戳 (ms) */
  startedAt?: number;
  /** 录制时长上限（秒），达到后自动停止 */
  maxDurationSecs?: number;
  /** 停止录制回调 */
  onStop?: () => void;
  /** 录制开始回调 */
  onStart?: () => void;
  /** 是否可操作 */
  disabled?: boolean;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 格式化录制时长为 mm:ss 格式
 */
function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================================
// 录制计时器 Hook
// ============================================================================

function useRecordingTimer(
  recording: boolean,
  startedAt?: number,
  maxDurationSecs?: number,
  onTimeout?: () => void,
): { elapsed: string; isNearLimit: boolean; progressRatio: number } {
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  // 保持 onTimeout 引用最新
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (recording && startedAt) {
      // 立即设置一次
      setElapsedMs(Date.now() - startedAt);

      timerRef.current = setInterval(() => {
        const now = Date.now();
        setElapsedMs(() => {
          const elapsed = now - (startedAt ?? now);

          // 检查是否达到最大时长
          if (maxDurationSecs && elapsed >= maxDurationSecs * 1000) {
            onTimeoutRef.current?.();
          }

          return elapsed;
        });
      }, 500);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    }

    // 停止录制时重置
    setElapsedMs(0);
    return undefined;
  }, [recording, startedAt, maxDurationSecs]);

  const isNearLimit =
    maxDurationSecs !== undefined && elapsedMs >= (maxDurationSecs - 30) * 1000;
  const progressRatio =
    maxDurationSecs !== undefined
      ? Math.min(1, elapsedMs / (maxDurationSecs * 1000))
      : 0;

  return {
    elapsed: formatDuration(elapsedMs),
    isNearLimit,
    progressRatio,
  };
}

// ============================================================================
// CuaRecordingIndicator 主组件
// ============================================================================

function CuaRecordingIndicatorInner(props: CuaRecordingIndicatorProps) {
  const {
    recording,
    startedAt,
    maxDurationSecs = 300,
    onStop,
    onStart,
    disabled = false,
  } = props;

  const { elapsed, isNearLimit, progressRatio } = useRecordingTimer(
    recording,
    startedAt,
    maxDurationSecs,
    onStop,
  );

  const [error, setError] = useState<string | null>(null);

  // 开始录制
  const handleStart = useCallback(async () => {
    setError(null);
    try {
      const mod = await import("@tauri-apps/api/core");
      await mod.invoke("cua_start_recording", {});
      onStart?.();
    } catch {
      setError("录制功能尚未实现（后端 stub）");
    }
  }, [onStart]);

  // 停止录制
  const handleStop = useCallback(async () => {
    setError(null);
    try {
      const mod = await import("@tauri-apps/api/core");
      await mod.invoke("cua_stop_recording", {});
      onStop?.();
    } catch {
      setError("停止录制功能尚未实现（后端 stub）");
    }
  }, [onStop]);

  if (!recording) {
    // 非录制状态：显示开始按钮
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleStart}
            disabled={disabled}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all border",
              disabled
                ? "border-border/30 text-muted-foreground cursor-not-allowed opacity-50"
                : "border-border/50 text-muted-foreground hover:text-red-500 hover:border-red-500/50 hover:bg-red-500/10",
            )}
          >
            <PiVideoCamera className="text-sm" />
            开始录制
          </button>

          <span className="text-[10px] text-muted-foreground">
            快捷键: Ctrl+Shift+R
          </span>
        </div>

        {error && (
          <div className="px-3 py-1.5 text-[10px] text-red-500 bg-red-500/10 rounded-md">
            {error}
          </div>
        )}
      </div>
    );
  }

  // 录制状态：显示指示器
  return (
    <div className="space-y-2">
      {/* 录制指示器主体 */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md border transition-colors",
          isNearLimit
            ? "bg-red-500/10 border-red-500/40"
            : "bg-red-500/5 border-red-500/30",
        )}
      >
        {/* Pulse 动画指示器 */}
        <div className="relative flex items-center justify-center">
          <PiRecord className="text-red-500 text-base animate-pulse" />
          <span className="absolute inline-flex h-3 w-3 rounded-full bg-red-500/30 animate-ping" />
        </div>

        {/* 录制信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-red-500">
              正在录制
            </span>
            <div className="flex items-center gap-1 text-xs font-mono text-foreground">
              <PiClock className="text-[10px] text-muted-foreground" />
              {elapsed}
            </div>
          </div>

          {/* 进度条（接近上限时显示） */}
          {isNearLimit && maxDurationSecs && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-red-500/20 overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-all duration-500"
                  style={{ width: `${progressRatio * 100}%` }}
                />
              </div>
              <span className="text-[9px] text-red-400 font-mono">
                {maxDurationSecs - Math.floor((Date.now() - (startedAt ?? 0)) / 1000)}
              </span>
            </div>
          )}
        </div>

        {/* 停止按钮 */}
        <button
          onClick={handleStop}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-red-500/50 text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
        >
          <PiStop className="text-[10px]" />
          停止
        </button>
      </div>

      {/* 快捷键提示 */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="px-1 py-0.5 rounded border border-border/30 font-mono text-[9px]">
          Ctrl
        </span>
        <span className="px-1 py-0.5 rounded border border-border/30 font-mono text-[9px]">
          Shift
        </span>
        <span className="px-1 py-0.5 rounded border border-border/30 font-mono text-[9px]">
          S
        </span>
        <span className="ml-1">停止录制</span>
      </div>

      {error && (
        <div className="px-3 py-1.5 text-[10px] text-red-500 bg-red-500/10 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}

export const CuaRecordingIndicator = memo(CuaRecordingIndicatorInner);
