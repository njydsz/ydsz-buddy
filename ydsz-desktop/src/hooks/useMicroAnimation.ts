/**
 * @file 微交互动画 Hook
 * @description 提供 fade / scale / slide / expand 四种常见微交互动画样式，
 *   自动响应"减少动画"偏好（prefers-reduced-motion + 用户设置），
 *   整合全局 appearance store 实现跨标签页联动。
 *
 * 性能与可访问性：
 * - 仅使用 opacity / transform 触发合成层，避免重排
 * - reduced motion 时将时长压到 ≤ 50ms 并去除位移
 * - 暴露 `enabled: boolean`，调用方可按需禁用
 * @module hooks/useMicroAnimation
 */

import { useMemo } from "react";
import { useReducedMotion } from "./useReducedMotion";

/** 动画时长的最大上限（reduced motion 模式） */
export const REDUCED_MOTION_MAX_DURATION_MS = 50;

/** 标准动画时长档位 */
export const ANIMATION_DURATIONS = {
  fast: 150,
  normal: 200,
  slow: 300,
} as const;

/** 缓动函数 */
export const ANIMATION_EASINGS = {
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

export type AnimationDurationKey = keyof typeof ANIMATION_DURATIONS;
export type AnimationEasingKey = keyof typeof ANIMATION_EASINGS;

export type SlideDirection = "up" | "down" | "left" | "right";

export interface UseMicroAnimationOptions {
  /** 自定义时长（毫秒）；不传则使用 normal */
  duration?: number;
  /** 缓动函数；不传则使用 easeOut */
  easing?: AnimationEasingKey;
  /** 是否整体禁用动画（即使在 enabled 状态下也不产生过渡） */
  forceDisabled?: boolean;
}

/**
 * 微交互动画 Hook
 *
 * @description
 * 返回一个 `styles` 对象，包含 fadeIn / scale / slideIn / expand 四种动画样式；
 * 当用户偏好减少动画时，时长会被压缩到 ≤ 50ms 并跳过位移。
 */
export function useMicroAnimation(options: UseMicroAnimationOptions = {}) {
  const { isReducedMotionEnabled } = useReducedMotion();
  const { duration = ANIMATION_DURATIONS.normal, easing = "easeOut", forceDisabled = false } = options;

  const enabled = !forceDisabled;

  return useMemo(() => {
    const effectiveDuration = !enabled
      ? 0
      : isReducedMotionEnabled
        ? Math.min(duration, REDUCED_MOTION_MAX_DURATION_MS)
        : duration;
    const easingValue = ANIMATION_EASINGS[easing];
    const transitionNone = "transition: none";

    /** 基础过渡串 */
    const buildTransition = (...properties: string[]): string => {
      if (effectiveDuration === 0) {
        return "transition: none";
      }
      return properties
        .map((prop) => `${prop} ${effectiveDuration}ms ${easingValue}`)
        .join(", ");
    };

    return {
      enabled,
      isReducedMotionEnabled,
      durationMs: effectiveDuration,

      /** 淡入/淡出 */
      fadeIn(isVisible: boolean): React.CSSProperties {
        return {
          opacity: isVisible ? 1 : 0,
          transition: buildTransition("opacity"),
        };
      },

      /** 缩放淡入 */
      scale(isVisible: boolean, from = 0.95): React.CSSProperties {
        if (effectiveDuration === 0) {
          return {
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "scale(1)" : `scale(${from})`,
            transition: transitionNone,
          };
        }
        return {
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "scale(1)" : `scale(${from})`,
          transition: buildTransition("opacity", "transform"),
        };
      },

      /** 滑入 */
      slideIn(isVisible: boolean, direction: SlideDirection = "up", distance = 20): React.CSSProperties {
        const offset = isVisible ? "translate(0, 0)" : (() => {
          switch (direction) {
            case "up":
              return `translateY(${distance}px)`;
            case "down":
              return `translateY(-${distance}px)`;
            case "left":
              return `translateX(${distance}px)`;
            case "right":
              return `translateX(-${distance}px)`;
          }
        })();
        if (effectiveDuration === 0 || isReducedMotionEnabled) {
          // reduced motion 模式下去掉位移
          return {
            opacity: isVisible ? 1 : 0,
            transform: "translate(0, 0)",
            transition: transitionNone,
          };
        }
        return {
          opacity: isVisible ? 1 : 0,
          transform: offset,
          transition: buildTransition("opacity", "transform"),
        };
      },

      /** 展开/收起 */
      expand(isExpanded: boolean, maxHeight = 1000): React.CSSProperties {
        if (effectiveDuration === 0) {
          return {
            maxHeight: isExpanded ? `${maxHeight}px` : "0",
            opacity: isExpanded ? 1 : 0,
            overflow: "hidden",
            transition: transitionNone,
          };
        }
        return {
          maxHeight: isExpanded ? `${maxHeight}px` : "0",
          opacity: isExpanded ? 1 : 0,
          overflow: "hidden",
          transition: buildTransition("max-height", "opacity"),
        };
      },
    };
  }, [enabled, isReducedMotionEnabled, duration, easing]);
}
