/**
 * @file useUIFont.ts
 * @description UI 字体 Hook - 应用可选的 UI 字体覆盖而不影响活动主题的基础字体
 * @module hooks/useUIFont
 * @layer Web 外观覆盖 Hook
 */

import { useEffect } from "react";
import { useAppSettings } from "../appSettings";
import { normalizeFontFamilyCssValue } from "../lib/fontFamily";

/** UI 字体覆盖的 CSS 变量名 */
const UI_FONT_OVERRIDE_VARIABLE = "--app-font-ui-override";

/**
 * UI 字体 Hook
 * 
 * @description
 * 从应用设置中读取用户配置的 UI 字体，并将其作为 CSS 变量应用到根元素。
 * 该字体仅用于 UI 组件（如按钮、输入框等），不会影响聊天内容或代码块的字体。
 * 
 * 如果用户未配置 UI 字体，则移除该 CSS 变量，让默认样式生效。
 * 
 * @example
 * ```tsx
 * function App() {
 *   useUIFont();
 *   return (
 *     <div>
 *       <button>按钮（使用 UI 字体）</button>
 *       <p>文本（使用主题基础字体）</p>
 *     </div>
 *   );
 * }
 * ```
 * 
 * @remarks
 * - 仅在 uiFontFamily 变化时重新应用
 * - 组件卸载时自动清理 CSS 变量
 * - 与 useChatCodeFont 分离，确保 UI 字体和代码字体独立配置
 */
export function useUIFont() {
  const { settings } = useAppSettings();
  const uiFontFamily = settings.uiFontFamily;

  useEffect(() => {
    // 将字体名称标准化为合法的 CSS font-family 值
    const cssFontFamily = normalizeFontFamilyCssValue(uiFontFamily);
    
    if (cssFontFamily) {
      // 有自定义字体时，设置 CSS 变量
      document.documentElement.style.setProperty(UI_FONT_OVERRIDE_VARIABLE, cssFontFamily);
    } else {
      // 无自定义字体时，移除 CSS 变量以使用默认值
      document.documentElement.style.removeProperty(UI_FONT_OVERRIDE_VARIABLE);
    }
  }, [uiFontFamily]);
}
