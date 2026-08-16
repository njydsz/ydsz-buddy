/**
 * @file 字号滑块组件
 * @description W5-D-10 任务：高对比度主题配套 - 字号 80%-150% 滑块
 *
 * 范围：80%（紧凑）至 150%（超大），无级调节
 *
 * 联动机制：
 * - 拖动滑块 → 实时设置 CSS 变量 --app-font-size-percent
 * - 字号变化不破坏布局（使用 rem 单位 + 容器 query 兜底）
 * - 持久化到 localStorage
 * - 与现有 FontSizeScale 4 档位独立（滑块精度更高）
 *
 * ## 核心导出
 *
 * - `FontSizeSlider`：滑块组件
 * - `useFontSizePercent`：字号百分比 Hook
 *
 * @module components/FontSizeSlider
 */

import { memo, useCallback, useEffect, useId, useMemo } from "react";
import { cn } from "~/lib/utils";

/** 字号百分比范围（80% ~ 150%） */
export const FONT_SIZE_PERCENT_MIN = 80;
export const FONT_SIZE_PERCENT_MAX = 150;
export const FONT_SIZE_PERCENT_STEP = 5;
export const FONT_SIZE_PERCENT_DEFAULT = 100;

/** 持久化存储键 */
export const FONT_SIZE_PERCENT_STORAGE_KEY = "ydsz-buddy:font-size-percent";

/** 规范化字号百分比到合法范围 */
export function normalizeFontSizePercent(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return FONT_SIZE_PERCENT_DEFAULT;
  // 吸附到最近的 5% 步长
  const clamped = Math.max(
    FONT_SIZE_PERCENT_MIN,
    Math.min(FONT_SIZE_PERCENT_MAX, num),
  );
  return Math.round(clamped / FONT_SIZE_PERCENT_STEP) * FONT_SIZE_PERCENT_STEP;
}

/** 同步字号百分比到 DOM */
export function applyFontSizePercentToDom(percent: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root?.style?.setProperty) return;
  const normalized = normalizeFontSizePercent(percent);
  root.style.setProperty("--app-font-size-percent", `${normalized}%`);
  root.setAttribute("data-font-size-percent", String(normalized));
}

/** 从 localStorage 读取持久化值 */
function readStoredFontSizePercent(): number {
  if (typeof localStorage === "undefined") return FONT_SIZE_PERCENT_DEFAULT;
  try {
    const raw = localStorage.getItem(FONT_SIZE_PERCENT_STORAGE_KEY);
    if (raw === null) return FONT_SIZE_PERCENT_DEFAULT;
    return normalizeFontSizePercent(JSON.parse(raw));
  } catch {
    return FONT_SIZE_PERCENT_DEFAULT;
  }
}

/** 写入 localStorage */
function writeStoredFontSizePercent(value: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      FONT_SIZE_PERCENT_STORAGE_KEY,
      JSON.stringify(normalizeFontSizePercent(value)),
    );
  } catch {
    // 忽略存储错误
  }
}

/**
 * 字号百分比 Hook
 *
 * @description
 * 提供无级字号调节（80%-150%），独立于 FontSizeScale 4 档。
 * 改变时会同步更新 CSS 变量 --app-font-size-percent，
 * 消费方可通过 `font-size: calc(1rem * var(--app-font-size-percent, 100%) / 100%)` 响应。
 */
export function useFontSizePercent() {
  const percent = useMemo(() => readStoredFontSizePercent(), []);

  useEffect(() => {
    applyFontSizePercentToDom(percent);
  }, [percent]);

  const setPercent = useCallback((next: number) => {
    const normalized = normalizeFontSizePercent(next);
    applyFontSizePercentToDom(normalized);
    writeStoredFontSizePercent(normalized);
  }, []);

  const resetPercent = useCallback(() => {
    applyFontSizePercentToDom(FONT_SIZE_PERCENT_DEFAULT);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(FONT_SIZE_PERCENT_STORAGE_KEY);
      } catch {
        // 忽略
      }
    }
  }, []);

  return {
    percent,
    setPercent,
    resetPercent,
  } as const;
}

export interface FontSizeSliderProps {
  /** 自定义类名 */
  className?: string;
  /** 当前百分比 */
  percent: number;
  /** 变化回调 */
  onChange: (value: number) => void;
  /** 标签 */
  label?: string;
  /** 重置回调（可选） */
  onReset?: () => void;
  /** 是否显示重置按钮 */
  showReset?: boolean;
}

/**
 * 字号滑块组件
 *
 * @description
 * 无级滑块（80% - 150%，步长 5%），实时显示当前百分比。
 * 支持键盘导航（左右箭头调节 1 步，Page Up/Down 调节 5 步，Home/End 跳到边界）。
 */
export const FontSizeSlider = memo(function FontSizeSlider({
  className,
  percent,
  onChange,
  label = "字号",
  onReset,
  showReset = true,
}: FontSizeSliderProps) {
  const id = useId();
  const normalizedPercent = normalizeFontSizePercent(percent);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (!Number.isNaN(next)) {
        onChange(next);
      }
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      let next = normalizedPercent;
      let handled = true;
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowDown":
          next = Math.max(FONT_SIZE_PERCENT_MIN, next - FONT_SIZE_PERCENT_STEP);
          break;
        case "ArrowRight":
        case "ArrowUp":
          next = Math.min(FONT_SIZE_PERCENT_MAX, next + FONT_SIZE_PERCENT_STEP);
          break;
        case "PageDown":
          next = Math.max(FONT_SIZE_PERCENT_MIN, next - 10);
          break;
        case "PageUp":
          next = Math.min(FONT_SIZE_PERCENT_MAX, next + 10);
          break;
        case "Home":
          next = FONT_SIZE_PERCENT_MIN;
          break;
        case "End":
          next = FONT_SIZE_PERCENT_MAX;
          break;
        default:
          handled = false;
      }
      if (handled) {
        event.preventDefault();
        onChange(next);
      }
    },
    [normalizedPercent, onChange],
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <span
            className="text-sm tabular-nums text-muted-foreground"
            aria-live="polite"
            data-testid="font-size-percent-value"
          >
            {normalizedPercent}%
          </span>
          {showReset && onReset && normalizedPercent !== FONT_SIZE_PERCENT_DEFAULT && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
              aria-label={`重置字号到 ${FONT_SIZE_PERCENT_DEFAULT}%`}
            >
              重置
            </button>
          )}
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={FONT_SIZE_PERCENT_MIN}
        max={FONT_SIZE_PERCENT_MAX}
        step={FONT_SIZE_PERCENT_STEP}
        value={normalizedPercent}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label={`${label}：${normalizedPercent}%。范围 ${FONT_SIZE_PERCENT_MIN}%-${FONT_SIZE_PERCENT_MAX}%。`}
        aria-valuemin={FONT_SIZE_PERCENT_MIN}
        aria-valuemax={FONT_SIZE_PERCENT_MAX}
        aria-valuenow={normalizedPercent}
        data-testid="font-size-slider"
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={{
          // 进度条视觉反馈
          background: `linear-gradient(to right, var(--color-primary, hsl(var(--primary))) 0%, var(--color-primary, hsl(var(--primary))) ${
            ((normalizedPercent - FONT_SIZE_PERCENT_MIN) /
              (FONT_SIZE_PERCENT_MAX - FONT_SIZE_PERCENT_MIN)) *
            100
          }%, var(--color-muted, hsl(var(--muted))) ${
            ((normalizedPercent - FONT_SIZE_PERCENT_MIN) /
              (FONT_SIZE_PERCENT_MAX - FONT_SIZE_PERCENT_MIN)) *
            100
          }%, var(--color-muted, hsl(var(--muted))) 100%)`,
        }}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{FONT_SIZE_PERCENT_MIN}%</span>
        <span>{FONT_SIZE_PERCENT_DEFAULT}%</span>
        <span>{FONT_SIZE_PERCENT_MAX}%</span>
      </div>
    </div>
  );
});
