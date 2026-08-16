/**
 * @file appTypography.ts 单元测试
 *
 * 覆盖：
 * - getAppTypographyScale：默认 base 字号
 * - 自定义 base 字号按比例换算
 * - 边界：base 字号过小/过大时被规范化
 * - 各字段单调递减（uiLg > uiSm > uiXs > ui2Xs）
 */

import { describe, expect, it } from "vitest";
import { getAppTypographyScale } from "./appTypography";
import {
  DEFAULT_CHAT_FONT_SIZE_PX,
  MAX_CHAT_FONT_SIZE_PX,
} from "../appSettings";

describe("getAppTypographyScale", () => {
  it("默认 base 字号时返回完整 scale", () => {
    const scale = getAppTypographyScale();
    expect(scale.basePx).toBe(DEFAULT_CHAT_FONT_SIZE_PX);
    expect(scale.chatPx).toBe(DEFAULT_CHAT_FONT_SIZE_PX);
    expect(scale.uiPx).toBe(DEFAULT_CHAT_FONT_SIZE_PX);
  });

  it("scale 包含所有字段", () => {
    const scale = getAppTypographyScale();
    expect(scale).toHaveProperty("basePx");
    expect(scale).toHaveProperty("uiPx");
    expect(scale).toHaveProperty("uiLgPx");
    expect(scale).toHaveProperty("uiSmPx");
    expect(scale).toHaveProperty("uiXsPx");
    expect(scale).toHaveProperty("ui2XsPx");
    expect(scale).toHaveProperty("uiMetaPx");
    expect(scale).toHaveProperty("uiTimestampPx");
    expect(scale).toHaveProperty("chatPx");
    expect(scale).toHaveProperty("chatCodePx");
    expect(scale).toHaveProperty("chatMetaPx");
    expect(scale).toHaveProperty("chatTinyPx");
  });

  it("uiLg > base（最大字号）", () => {
    const scale = getAppTypographyScale(14);
    expect(scale.uiLgPx).toBeGreaterThan(scale.basePx);
  });

  it("uiSm/uiXs/ui2Xs 单调递减", () => {
    const scale = getAppTypographyScale(14);
    expect(scale.uiPx).toBeGreaterThanOrEqual(scale.uiSmPx);
    expect(scale.uiSmPx).toBeGreaterThanOrEqual(scale.uiXsPx);
    expect(scale.uiXsPx).toBeGreaterThanOrEqual(scale.ui2XsPx);
  });

  it("chatTinyPx 是最小层级", () => {
    const scale = getAppTypographyScale(14);
    expect(scale.chatTinyPx).toBeLessThanOrEqual(scale.ui2XsPx);
  });

  it("base 字号过大时被规范化为 MAX_CHAT_FONT_SIZE_PX", () => {
    const scale = getAppTypographyScale(100);
    expect(scale.basePx).toBe(MAX_CHAT_FONT_SIZE_PX);
  });

  it("base 字号为 0 时被夹到最小值（不为默认值）", () => {
    // normalizeChatFontSizePx 对 0 走 Math.max(MIN, 0) = MIN
    const scale = getAppTypographyScale(0);
    expect(scale.basePx).toBeGreaterThan(0);
    expect(scale.basePx).toBeLessThan(DEFAULT_CHAT_FONT_SIZE_PX);
  });

  it("base 字号为非数字（NaN）时走默认", () => {
    const scale = getAppTypographyScale(Number.NaN);
    expect(scale.basePx).toBe(DEFAULT_CHAT_FONT_SIZE_PX);
  });

  it("所有字段都是整数（px）", () => {
    const scale = getAppTypographyScale(13.5);
    Object.values(scale).forEach((value) => {
      expect(Number.isInteger(value)).toBe(true);
    });
  });
});
