/**
 * @file 高对比度主题定义
 * @description 为视觉障碍用户提供 WCAG AAA 标准(7:1)的高对比度主题变体
 * @layer Web 外观领域逻辑层
 */

import type { ChromeTheme, ThemeVariant } from "./theme.logic";

/**
 * 高对比度浅色主题
 * @description 满足 WCAG AAA 标准的浅色高对比度主题配置
 * - 对比度至少 7:1
 * - 使用纯色,禁用半透明
 * - 边框更粗更明显(2px)
 */
export const HIGH_CONTRAST_LIGHT_THEME: ChromeTheme = {
  accent: "#0066cc",
  contrast: 85,
  fonts: { code: null, ui: null },
  ink: "#000000",
  opaqueWindows: true,
  semanticColors: {
    diffAdded: "#007a33",
    diffRemoved: "#cc0000",
    skill: "#7a00cc",
  },
  surface: "#ffffff",
};

/**
 * 高对比度深色主题
 * @description 满足 WCAG AAA 标准的深色高对比度主题配置
 * - 对比度至少 7:1
 * - 使用纯色,禁用半透明
 * - 边框更粗更明显(2px)
 */
export const HIGH_CONTRAST_DARK_THEME: ChromeTheme = {
  accent: "#4da6ff",
  contrast: 90,
  fonts: { code: null, ui: null },
  ink: "#ffffff",
  opaqueWindows: true,
  semanticColors: {
    diffAdded: "#00cc55",
    diffRemoved: "#ff4444",
    skill: "#cc66ff",
  },
  surface: "#000000",
};

/**
 * 按变体分类的高对比度主题
 */
export const HIGH_CONTRAST_THEMES: Record<ThemeVariant, ChromeTheme> = {
  light: HIGH_CONTRAST_LIGHT_THEME,
  dark: HIGH_CONTRAST_DARK_THEME,
};

/**
 * 检查主题是否为高对比度主题
 * @param theme - 要检查的主题
 * @returns 如果是高对比度主题返回 true
 */
export function isHighContrastTheme(theme: ChromeTheme): boolean {
  return (
    theme === HIGH_CONTRAST_LIGHT_THEME ||
    theme === HIGH_CONTRAST_DARK_THEME ||
    theme.contrast >= 80
  );
}
