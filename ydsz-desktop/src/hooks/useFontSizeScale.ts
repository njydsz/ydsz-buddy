/**
 * @file 字号缩放 Hook
 * @description 提供 4 级字号缩放（small/medium/large/xlarge），
 *   通过 CSS 变量 --font-size-base 控制全局字号，持久化到 localStorage。
 * @module hooks/useFontSizeScale
 */

import { useCallback, useEffect } from "react";
import {
  applyFontSizeToDom,
  FONT_SIZE_PX,
  useAppearanceStore,
  type FontSizeScale,
} from "../shared/appearanceStore";

/** Re-export 便于消费方统一导入 */
export {
  DEFAULT_FONT_SIZE_SCALE,
  FONT_SIZE_LABELS,
  FONT_SIZE_PX,
  FONT_SIZE_SCALES,
  normalizeFontSizeScale,
  type FontSizeScale,
} from "../shared/appearanceStore";

/**
 * 字号缩放 Hook
 *
 * @description
 * 提供全局字号缩放功能，包括：
 * - 4 级字号：small (14px), medium (16px), large (18px), xlarge (20px)
 * - 使用 CSS 变量 --font-size-base 控制全局字号
 * - 所有字号使用 rem 单位，基于 root font-size
 * - 设置持久化到 localStorage
 * - 实时应用到 DOM
 * - 通过全局 appearance store 与其他订阅者实时联动
 *
 * @returns 字号缩放状态和操作方法
 */
export function useFontSizeScale() {
  const fontSizeScale = useAppearanceStore((state) => state.fontSizeScale);
  const setFontSizeScaleRaw = useAppearanceStore((state) => state.setFontSizeScale);
  const resetFontSizeScaleRaw = useAppearanceStore((state) => state.resetFontSizeScale);

  // 应用字号缩放到 DOM
  useEffect(() => {
    applyFontSizeToDom(fontSizeScale);
  }, [fontSizeScale]);

  const setFontSizeScale = useCallback(
    (nextScale: FontSizeScale) => {
      setFontSizeScaleRaw(nextScale);
    },
    [setFontSizeScaleRaw],
  );

  const resetFontSizeScale = useCallback(() => {
    resetFontSizeScaleRaw();
  }, [resetFontSizeScaleRaw]);

  return {
    fontSizeScale,
    setFontSizeScale,
    resetFontSizeScale,
    fontSizePx: FONT_SIZE_PX[fontSizeScale],
  } as const;
}
