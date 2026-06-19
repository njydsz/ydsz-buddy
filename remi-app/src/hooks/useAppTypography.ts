/**
 * @file useAppTypography.ts
 * @description 应用排版管理 Hook - 根据用户设置动态调整应用全局字体大小
 * @module hooks/useAppTypography
 */

import { useEffect } from "react";
import { useAppSettings } from "../appSettings";
import { getAppTypographyScale } from "../lib/appTypography";

/**
 * 排版相关的 CSS 变量列表
 * 这些变量会被设置到 document.documentElement 上，供全局使用
 */
const TYPOGRAPHY_CSS_VARIABLES = [
  "--app-font-size-base", // 基础字体大小
  "--app-font-size-ui", // UI 组件字体大小
  "--app-font-size-ui-lg", // UI 大字体
  "--app-font-size-ui-sm", // UI 小字体
  "--app-font-size-ui-xs", // UI 超小字体
  "--app-font-size-ui-2xs", // UI 最小字体
  "--app-font-size-ui-meta", // UI 元数据字体
  "--app-font-size-ui-timestamp", // 时间戳字体
  "--app-font-size-chat", // 聊天内容字体
  "--app-font-size-chat-code", // 聊天代码字体
  "--app-font-size-chat-meta", // 聊天元数据字体
  "--app-font-size-chat-tiny", // 聊天最小字体
] as const;

/**
 * 应用排版 Hook
 *
 * @description
 * 根据用户的聊天字体大小设置，计算并应用全局排版缩放。
 * 该 Hook 会将计算后的字体大小作为 CSS 变量注入到 document.documentElement，
 * 使得整个应用可以响应式地调整字体大小。
 *
 * @example
 * ```tsx
 * function App() {
 *   useAppTypography();
 *   return <div>应用内容</div>;
 * }
 * ```
 *
 * @remarks
 * - 当组件卸载时，会自动清理设置的 CSS 变量
 * - 仅在 settings.chatFontSizePx 变化时重新计算
 */
export function useAppTypography() {
  const { settings } = useAppSettings();

  useEffect(() => {
    // 根据用户的聊天字体大小设置，计算完整的排版缩放
    const scale = getAppTypographyScale(settings.chatFontSizePx);
    const rootStyle = document.documentElement.style;
    
    // 构建所有 CSS 变量及其对应的值
    const variableValues: Record<(typeof TYPOGRAPHY_CSS_VARIABLES)[number], string> = {
      "--app-font-size-base": `${scale.basePx}px`,
      "--app-font-size-ui": `${scale.uiPx}px`,
      "--app-font-size-ui-lg": `${scale.uiLgPx}px`,
      "--app-font-size-ui-sm": `${scale.uiSmPx}px`,
      "--app-font-size-ui-xs": `${scale.uiXsPx}px`,
      "--app-font-size-ui-2xs": `${scale.ui2XsPx}px`,
      "--app-font-size-ui-meta": `${scale.uiMetaPx}px`,
      "--app-font-size-ui-timestamp": `${scale.uiTimestampPx}px`,
      "--app-font-size-chat": `${scale.chatPx}px`,
      "--app-font-size-chat-code": `${scale.chatCodePx}px`,
      "--app-font-size-chat-meta": `${scale.chatMetaPx}px`,
      "--app-font-size-chat-tiny": `${scale.chatTinyPx}px`,
    };

    // 将所有排版变量应用到根元素
    for (const cssVariable of TYPOGRAPHY_CSS_VARIABLES) {
      rootStyle.setProperty(cssVariable, variableValues[cssVariable]);
    }

    // 清理函数：组件卸载时移除所有 CSS 变量
    return () => {
      for (const cssVariable of TYPOGRAPHY_CSS_VARIABLES) {
        rootStyle.removeProperty(cssVariable);
      }
    };
  }, [settings.chatFontSizePx]);
}
