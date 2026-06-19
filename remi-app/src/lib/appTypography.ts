/**
 * @file 应用排版比例尺模块
 * @description 根据基础字号计算 UI 和聊天场景各层级字号，保证排版体系的一致性和可缩放性。
 */

import {
  DEFAULT_CHAT_FONT_SIZE_PX,
  MAX_CHAT_FONT_SIZE_PX,
  normalizeChatFontSizePx,
} from "../appSettings";

/**
 * 应用排版比例尺接口
 * 定义了 UI 和聊天界面中各层级元素的字号（单位：像素）
 */
export interface AppTypographyScale {
  /** 基础字号 */
  basePx: number;
  /** UI 组件默认字号 */
  uiPx: number;
  /** UI 大字号（用于标题等） */
  uiLgPx: number;
  /** UI 小字号 */
  uiSmPx: number;
  /** UI 超小字号 */
  uiXsPx: number;
  /** UI 二号超小字号（最小级别） */
  ui2XsPx: number;
  /** UI 元信息字号（如标签、描述） */
  uiMetaPx: number;
  /** 时间戳字号 */
  uiTimestampPx: number;
  /** 聊天正文默认字号 */
  chatPx: number;
  /** 聊天代码块字号 */
  chatCodePx: number;
  /** 聊天元信息字号（如消息时间、状态） */
  chatMetaPx: number;
  /** 聊天最小字号（用于辅助信息） */
  chatTinyPx: number;
}

/**
 * 将字号值限制在合法范围内
 * @param value - 原始字号值
 * @param min - 最小允许值
 * @param max - 最大允许值，默认为最大聊天字号 + 2
 * @returns 限制后的整数字号值
 */
function clampTypographyPx(value: number, min: number, max = MAX_CHAT_FONT_SIZE_PX + 2): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * 根据基础字号生成完整的排版比例尺
 * @param baseFontSizePx - 基础字号（像素），默认使用系统默认聊天字号
 * @returns 包含各层级字号的排版比例尺对象
 */
export function getAppTypographyScale(
  baseFontSizePx = DEFAULT_CHAT_FONT_SIZE_PX,
): AppTypographyScale {
  // 先将基础字号规范化到合法范围
  const basePx = normalizeChatFontSizePx(baseFontSizePx);

  return {
    basePx,
    uiPx: basePx,
    uiLgPx: clampTypographyPx(basePx * 1.08, basePx),
    uiSmPx: clampTypographyPx(basePx * 0.92, 10),
    uiXsPx: clampTypographyPx(basePx * 0.84, 10),
    ui2XsPx: clampTypographyPx(basePx * 0.76, 9),
    uiMetaPx: clampTypographyPx(basePx * 0.84, 10),
    uiTimestampPx: clampTypographyPx(basePx * 0.72, 8),
    chatPx: basePx,
    chatCodePx: clampTypographyPx(basePx * 0.95, 10),
    chatMetaPx: clampTypographyPx(basePx * 0.72, 8),
    chatTinyPx: clampTypographyPx(basePx * 0.66, 8),
  };
}
