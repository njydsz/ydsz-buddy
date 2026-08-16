/**
 * @file 减少动画偏好 Hook
 * @description 全局响应"减少动画"偏好，融合三层信号：
 *   1. 系统媒体查询 `prefers-reduced-motion: reduce`
 *   2. 用户在外观设置中选择的三态：auto / on / off
 *   3. 与 appearanceStore 共享，跨标签页同步
 *
 * 任何一层变化都会立即推送给所有订阅者（useSyncExternalStore）。
 * @module hooks/useReducedMotion
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  applyReducedMotionToDom,
  useAppearanceStore,
  type ReducedMotionMode,
} from "../shared/appearanceStore";

/** Re-export 便于消费方统一导入 */
export {
  DEFAULT_REDUCED_MOTION_MODE,
  normalizeReducedMotionMode,
  type ReducedMotionMode,
} from "../shared/appearanceStore";

/** 系统偏好媒体查询 */
const PREFERS_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// ─── 系统偏好订阅（useSyncExternalStore）────────────────────────────

let reducedMotionListeners: Array<() => void> = [];
let reducedMotionCache: boolean | null = null;

function readSystemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(PREFERS_REDUCED_MOTION).matches;
}

function getReducedMotionSnapshot(): boolean {
  const next = readSystemPrefersReducedMotion();
  if (reducedMotionCache === next) return reducedMotionCache;
  reducedMotionCache = next;
  return next;
}

function subscribeReducedMotion(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    reducedMotionCache = null;
    listener();
  };

  const mql = window.matchMedia(PREFERS_REDUCED_MOTION);
  mql.addEventListener("change", handler);
  reducedMotionListeners.push(listener);

  return () => {
    reducedMotionListeners = reducedMotionListeners.filter((l) => l !== listener);
    mql.removeEventListener("change", handler);
  };
}

function useSystemPrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );
}

/**
 * 测试专用：重置系统偏好缓存，便于在不同测试间隔离状态。
 *
 * @internal
 */
export function __resetReducedMotionCacheForTest(): void {
  reducedMotionCache = null;
  reducedMotionListeners = [];
}

// ─── 公共 Hook ──────────────────────────────────────────────────────

/**
 * 减少动画偏好 Hook
 *
 * @description
 * 融合用户偏好（appearanceStore）与系统偏好：
 *
 * | reducedMotionMode | systemPrefers | 实际生效 |
 * | ----------------- | ------------- | -------- |
 * | on                | *             | 启用     |
 * | off               | *             | 禁用     |
 * | auto              | true          | 启用     |
 * | auto              | false         | 禁用     |
 *
 * 并将最终结果同步到 DOM（`data-reduced-motion` 属性 + `reduce-motion` class）。
 */
export function useReducedMotion() {
  const reducedMotionMode = useAppearanceStore((state) => state.reducedMotionMode);
  const setReducedMotionModeRaw = useAppearanceStore((state) => state.setReducedMotionMode);
  const resetReducedMotionModeRaw = useAppearanceStore((state) => state.resetReducedMotionMode);

  const systemPrefersReducedMotion = useSystemPrefersReducedMotion();

  const isReducedMotionEnabled =
    reducedMotionMode === "on" ||
    (reducedMotionMode === "auto" && systemPrefersReducedMotion);

  // 同步 DOM 属性,便于 CSS 选择器（如 @media (prefers-reduced-motion)）
  useEffect(() => {
    applyReducedMotionToDom(isReducedMotionEnabled);
  }, [isReducedMotionEnabled]);

  const setReducedMotionMode = useCallback(
    (nextMode: ReducedMotionMode) => {
      setReducedMotionModeRaw(nextMode);
    },
    [setReducedMotionModeRaw],
  );

  const resetReducedMotionMode = useCallback(() => {
    resetReducedMotionModeRaw();
  }, [resetReducedMotionModeRaw]);

  return {
    reducedMotionMode,
    setReducedMotionMode,
    resetReducedMotionMode,
    isReducedMotionEnabled,
    systemPrefersReducedMotion,
  } as const;
}
