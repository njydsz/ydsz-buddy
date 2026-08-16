/**
 * @file 全局外观设置 Store
 * @description 集中管理字号、高对比度、减少动画等外观偏好，
 *   通过 zustand + localStorage 持久化实现"记忆联动"：
 *   - 任一组件修改 -> 立即同步到所有订阅者
 *   - 跨标签页通过 storage 事件同步
 *   - 同标签页通过 store 自动同步
 * @module shared/appearanceStore
 */

import { create } from "zustand";

/** 字号缩放级别 */
export type FontSizeScale = "small" | "medium" | "large" | "xlarge";

/** 字号对应的像素值 */
export const FONT_SIZE_PX: Record<FontSizeScale, number> = {
  small: 14,
  medium: 16,
  large: 18,
  xlarge: 20,
};

/** 全部字号缩放级别 */
export const FONT_SIZE_SCALES: readonly FontSizeScale[] = [
  "small",
  "medium",
  "large",
  "xlarge",
];

/** 字号显示标签（默认中文，i18n 字段由消费方覆盖） */
export const FONT_SIZE_LABELS: Record<FontSizeScale, string> = {
  small: "小",
  medium: "中",
  large: "大",
  xlarge: "特大",
};

/** 高对比度模式 */
export type HighContrastMode = "auto" | "on" | "off";

/** 减少动画模式 */
export type ReducedMotionMode = "auto" | "on" | "off";

/** 默认字号 */
export const DEFAULT_FONT_SIZE_SCALE: FontSizeScale = "medium";
/** 默认高对比度模式 */
export const DEFAULT_HIGH_CONTRAST_MODE: HighContrastMode = "auto";
/** 默认减少动画模式 */
export const DEFAULT_REDUCED_MOTION_MODE: ReducedMotionMode = "auto";

/** localStorage 键名 */
export const FONT_SIZE_STORAGE_KEY = "ydsz-buddy:font-size-scale";
export const HIGH_CONTRAST_STORAGE_KEY = "ydsz-buddy:high-contrast-mode";
export const REDUCED_MOTION_STORAGE_KEY = "ydsz-buddy:reduced-motion-mode";

/** 规范化字号缩放值 */
export function normalizeFontSizeScale(value: unknown): FontSizeScale {
  if (typeof value === "string" && FONT_SIZE_SCALES.includes(value as FontSizeScale)) {
    return value as FontSizeScale;
  }
  return DEFAULT_FONT_SIZE_SCALE;
}

/** 规范化高对比度模式 */
export function normalizeHighContrastMode(value: unknown): HighContrastMode {
  if (value === "auto" || value === "on" || value === "off") {
    return value;
  }
  return DEFAULT_HIGH_CONTRAST_MODE;
}

/** 规范化减少动画模式 */
export function normalizeReducedMotionMode(value: unknown): ReducedMotionMode {
  if (value === "auto" || value === "on" || value === "off") {
    return value;
  }
  return DEFAULT_REDUCED_MOTION_MODE;
}

interface AppearanceState {
  fontSizeScale: FontSizeScale;
  highContrastMode: HighContrastMode;
  reducedMotionMode: ReducedMotionMode;
}

interface AppearanceStore extends AppearanceState {
  setFontSizeScale: (next: FontSizeScale | ((prev: FontSizeScale) => FontSizeScale)) => void;
  setHighContrastMode: (next: HighContrastMode | ((prev: HighContrastMode) => HighContrastMode)) => void;
  setReducedMotionMode: (next: ReducedMotionMode | ((prev: ReducedMotionMode) => ReducedMotionMode)) => void;
  resetFontSizeScale: () => void;
  resetHighContrastMode: () => void;
  resetReducedMotionMode: () => void;
  /** 从 localStorage 重新同步（用于跨标签页 storage 事件） */
  hydrateFromStorage: () => void;
}

function readStoredFontSize(): FontSizeScale {
  if (typeof window === "undefined") return DEFAULT_FONT_SIZE_SCALE;
  try {
    const raw = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (!raw) return DEFAULT_FONT_SIZE_SCALE;
    return normalizeFontSizeScale(JSON.parse(raw));
  } catch {
    return DEFAULT_FONT_SIZE_SCALE;
  }
}

function readStoredHighContrast(): HighContrastMode {
  if (typeof window === "undefined") return DEFAULT_HIGH_CONTRAST_MODE;
  try {
    const raw = window.localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY);
    if (!raw) return DEFAULT_HIGH_CONTRAST_MODE;
    return normalizeHighContrastMode(JSON.parse(raw));
  } catch {
    return DEFAULT_HIGH_CONTRAST_MODE;
  }
}

function writeStoredFontSize(value: FontSizeScale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / disabled storage
  }
}

function writeStoredHighContrast(value: HighContrastMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / disabled storage
  }
}

function readStoredReducedMotion(): ReducedMotionMode {
  if (typeof window === "undefined") return DEFAULT_REDUCED_MOTION_MODE;
  try {
    const raw = window.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
    if (!raw) return DEFAULT_REDUCED_MOTION_MODE;
    return normalizeReducedMotionMode(JSON.parse(raw));
  } catch {
    return DEFAULT_REDUCED_MOTION_MODE;
  }
}

function writeStoredReducedMotion(value: ReducedMotionMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / disabled storage
  }
}

// 单一全局外观 store:被所有需要响应字号/对比度/减少动画变化的组件共享
export const useAppearanceStore = create<AppearanceStore>((set) => ({
  fontSizeScale: readStoredFontSize(),
  highContrastMode: readStoredHighContrast(),
  reducedMotionMode: readStoredReducedMotion(),
  setFontSizeScale: (next) => {
    set((state) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: FontSizeScale) => FontSizeScale)(state.fontSizeScale)
          : next;
      const normalised = normalizeFontSizeScale(resolved);
      if (normalised === state.fontSizeScale) return state;
      writeStoredFontSize(normalised);
      return { fontSizeScale: normalised };
    });
  },
  setHighContrastMode: (next) => {
    set((state) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: HighContrastMode) => HighContrastMode)(state.highContrastMode)
          : next;
      const normalised = normalizeHighContrastMode(resolved);
      if (normalised === state.highContrastMode) return state;
      writeStoredHighContrast(normalised);
      return { highContrastMode: normalised };
    });
  },
  setReducedMotionMode: (next) => {
    set((state) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: ReducedMotionMode) => ReducedMotionMode)(state.reducedMotionMode)
          : next;
      const normalised = normalizeReducedMotionMode(resolved);
      if (normalised === state.reducedMotionMode) return state;
      writeStoredReducedMotion(normalised);
      return { reducedMotionMode: normalised };
    });
  },
  resetFontSizeScale: () => {
    set((state) => {
      if (state.fontSizeScale === DEFAULT_FONT_SIZE_SCALE) return state;
      writeStoredFontSize(DEFAULT_FONT_SIZE_SCALE);
      return { fontSizeScale: DEFAULT_FONT_SIZE_SCALE };
    });
  },
  resetHighContrastMode: () => {
    set((state) => {
      if (state.highContrastMode === DEFAULT_HIGH_CONTRAST_MODE) return state;
      writeStoredHighContrast(DEFAULT_HIGH_CONTRAST_MODE);
      return { highContrastMode: DEFAULT_HIGH_CONTRAST_MODE };
    });
  },
  resetReducedMotionMode: () => {
    set((state) => {
      if (state.reducedMotionMode === DEFAULT_REDUCED_MOTION_MODE) return state;
      writeStoredReducedMotion(DEFAULT_REDUCED_MOTION_MODE);
      return { reducedMotionMode: DEFAULT_REDUCED_MOTION_MODE };
    });
  },
  hydrateFromStorage: () => {
    set({
      fontSizeScale: readStoredFontSize(),
      highContrastMode: readStoredHighContrast(),
      reducedMotionMode: readStoredReducedMotion(),
    });
  },
}));

// 跨标签页 storage 事件桥接
let storageBridgeInstalled = false;
export function installAppearanceStorageBridge(): void {
  if (typeof window === "undefined" || storageBridgeInstalled) return;
  storageBridgeInstalled = true;
  window.addEventListener("storage", (event) => {
    if (!event.key) return;
    if (
      event.key === FONT_SIZE_STORAGE_KEY ||
      event.key === HIGH_CONTRAST_STORAGE_KEY ||
      event.key === REDUCED_MOTION_STORAGE_KEY
    ) {
      useAppearanceStore.getState().hydrateFromStorage();
    }
  });
}

/**
 * 测试专用：重置 storage bridge 单例状态。
 *
 * @internal
 */
export function __resetAppearanceStorageBridgeForTest(): void {
  storageBridgeInstalled = false;
}

/** 同步字号到 DOM (CSS 变量 + data-attr) */
export function applyFontSizeToDom(scale: FontSizeScale): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root?.style?.setProperty) return;
  const px = FONT_SIZE_PX[scale];
  root.style.setProperty("--font-size-base", `${px}px`);
  root.style.setProperty("font-size", `${px}px`);
  root.setAttribute("data-font-size-scale", scale);
}

/** 同步高对比度到 DOM (data-attr + class) */
export function applyHighContrastToDom(enabled: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root?.classList?.toggle) return;
  root.setAttribute("data-high-contrast", enabled ? "true" : "false");
  root.classList.toggle("high-contrast", enabled);
}

/** 同步减少动画到 DOM (data-attr + class) */
export function applyReducedMotionToDom(enabled: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root?.classList?.toggle) return;
  root.setAttribute("data-reduced-motion", enabled ? "true" : "false");
  root.classList.toggle("reduce-motion", enabled);
}

/**
 * 同步主题切换动画 class 到 DOM。
 *
 * @description
 * 添加 `theme-transition` class 以启用全局 200ms 颜色/背景过渡。
 * 初始 setup 阶段由 `no-transitions` !important 规则压制，避免首屏闪烁；
 * 主题运行时切换时平滑过渡。
 *
 * @param enabled - 是否启用主题切换动画（默认 true）
 */
export function applyThemeTransitionToDom(enabled: boolean = true): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root?.classList?.toggle) return;
  root.classList.toggle("theme-transition", enabled);
  root.setAttribute("data-theme-transition", enabled ? "true" : "false");
}
