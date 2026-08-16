/**
 * @file 系统高对比度检测 Hook
 * @description 检测系统的高对比度和减少透明度偏好，
 *   自动应用高对比度主题（可手动覆盖）。
 * @module hooks/useHighContrastDetection
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  applyHighContrastToDom,
  useAppearanceStore,
  type HighContrastMode,
} from "../shared/appearanceStore";

/** Re-export 便于消费方统一导入 */
export {
  DEFAULT_HIGH_CONTRAST_MODE,
  normalizeHighContrastMode,
  type HighContrastMode,
} from "../shared/appearanceStore";

/** 系统偏好媒体查询 */
const PREFERS_CONTRAST_MORE = "(prefers-contrast: more)";
const PREFERS_REDUCED_TRANSPARENCY = "(prefers-reduced-transparency: reduce)";
const PREFERS_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// ─── 系统偏好订阅（useSyncExternalStore）────────────────────────────

type SystemPrefs = {
  prefersContrast: boolean;
  prefersReducedTransparency: boolean;
  prefersReducedMotion: boolean;
};

let systemPrefsListeners: Array<() => void> = [];
let systemPrefsCache: SystemPrefs | null = null;

function readSystemPrefs(): SystemPrefs {
  if (typeof window === "undefined") {
    return { prefersContrast: false, prefersReducedTransparency: false, prefersReducedMotion: false };
  }
  return {
    prefersContrast:
      window.matchMedia(PREFERS_CONTRAST_MORE).matches ||
      window.matchMedia(PREFERS_REDUCED_TRANSPARENCY).matches,
    prefersReducedTransparency: window.matchMedia(PREFERS_REDUCED_TRANSPARENCY).matches,
    prefersReducedMotion: window.matchMedia(PREFERS_REDUCED_MOTION).matches,
  };
}

function getSystemPrefsSnapshot(): SystemPrefs {
  const next = readSystemPrefs();
  if (
    systemPrefsCache &&
    systemPrefsCache.prefersContrast === next.prefersContrast &&
    systemPrefsCache.prefersReducedTransparency === next.prefersReducedTransparency &&
    systemPrefsCache.prefersReducedMotion === next.prefersReducedMotion
  ) {
    return systemPrefsCache;
  }
  systemPrefsCache = next;
  return next;
}

function subscribeSystemPrefs(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    systemPrefsCache = null;
    listener();
  };

  const mqls = [
    window.matchMedia(PREFERS_CONTRAST_MORE),
    window.matchMedia(PREFERS_REDUCED_TRANSPARENCY),
    window.matchMedia(PREFERS_REDUCED_MOTION),
  ];

  for (const mql of mqls) {
    mql.addEventListener("change", handler);
  }

  systemPrefsListeners.push(listener);

  return () => {
    systemPrefsListeners = systemPrefsListeners.filter((l) => l !== listener);
    for (const mql of mqls) {
      mql.removeEventListener("change", handler);
    }
  };
}

function useSystemPrefs(): SystemPrefs {
  return useSyncExternalStore(
    subscribeSystemPrefs,
    getSystemPrefsSnapshot,
    () => ({ prefersContrast: false, prefersReducedTransparency: false, prefersReducedMotion: false }),
  );
}

// ─── 公共 Hook ──────────────────────────────────────────────────────

/**
 * 系统高对比度检测 Hook
 *
 * @description
 * 检测系统偏好并决定是否启用高对比度模式：
 * - 检测 prefers-contrast: more 媒体查询
 * - 检测 prefers-reduced-transparency 媒体查询
 * - 支持 auto/on/off 三种模式
 * - auto 模式下跟随系统设置
 * - 设置持久化到 localStorage
 * - 通过全局 appearance store 与其他订阅者实时联动
 */
export function useHighContrastDetection() {
  // 全部状态来自共享 store,确保 Settings 页面与其他订阅者自动同步
  const highContrastMode = useAppearanceStore((state) => state.highContrastMode);
  const setHighContrastModeRaw = useAppearanceStore((state) => state.setHighContrastMode);
  const resetHighContrastModeRaw = useAppearanceStore((state) => state.resetHighContrastMode);

  const systemPrefs = useSystemPrefs();
  const isHighContrastEnabled =
    highContrastMode === "on" || (highContrastMode === "auto" && systemPrefs.prefersContrast);

  // 将高对比度状态应用到 DOM
  useEffect(() => {
    applyHighContrastToDom(isHighContrastEnabled);
  }, [isHighContrastEnabled]);

  const setHighContrastMode = useCallback(
    (nextMode: HighContrastMode) => {
      setHighContrastModeRaw(nextMode);
    },
    [setHighContrastModeRaw],
  );

  const resetHighContrastMode = useCallback(() => {
    resetHighContrastModeRaw();
  }, [resetHighContrastModeRaw]);

  return {
    highContrastMode,
    setHighContrastMode,
    resetHighContrastMode,
    isHighContrastEnabled,
    systemPrefersContrast: systemPrefs.prefersContrast,
    systemPrefersReducedMotion: systemPrefs.prefersReducedMotion,
  } as const;
}
