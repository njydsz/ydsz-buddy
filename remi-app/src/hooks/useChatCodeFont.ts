/**
 * @file useChatCodeFont.ts
 * @description 聊天代码字体 Hook - 应用用户自定义的聊天代码字体
 * @module hooks/useChatCodeFont
 * @layer Web 聊天展示层 Hook
 */

import { useEffect } from "react";
import { useAppSettings } from "../appSettings";
import { normalizeFontFamilyCssValue } from "../lib/fontFamily";

/** 聊天代码字体覆盖的 CSS 变量名 */
const CHAT_CODE_FONT_OVERRIDE_VARIABLE = "--app-font-chat-code-override";

/**
 * 聊天代码字体 Hook
 *
 * @description
 * 从应用设置中读取用户配置的聊天代码字体，并将其作为 CSS 变量应用到根元素。
 * 如果用户未配置字体，则移除该 CSS 变量，让默认样式生效。
 *
 * @example
 * ```tsx
 * function ChatView() {
 *   useChatCodeFont();
 *   return <div className="chat-code-block">...</div>;
 * }
 * ```
 *
 * @remarks
 * - 仅在 chatCodeFontFamily 变化时重新应用
 * - 组件卸载时自动清理 CSS 变量
 */
export function useChatCodeFont() {
  const { settings } = useAppSettings();
  const chatCodeFontFamily = settings.chatCodeFontFamily;

  useEffect(() => {
    // 将字体名称标准化为合法的 CSS font-family 值
    const cssFontFamily = normalizeFontFamilyCssValue(chatCodeFontFamily);
    if (cssFontFamily) {
      // 有自定义字体时，设置 CSS 变量
      document.documentElement.style.setProperty(CHAT_CODE_FONT_OVERRIDE_VARIABLE, cssFontFamily);
    } else {
      // 无自定义字体时，移除 CSS 变量以使用默认值
      document.documentElement.style.removeProperty(CHAT_CODE_FONT_OVERRIDE_VARIABLE);
    }
  }, [chatCodeFontFamily]);
}
