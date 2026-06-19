/**
 * @file useNativeFontSmoothing.ts
 * @description 原生字体平滑 Hook - 在 macOS 平台上应用原生字体平滑效果
 * @module hooks/useNativeFontSmoothing
 * @layer Web 外观覆盖 Hook
 */

import { useEffect } from "react";
import { useAppSettings } from "../appSettings";
import { isMacPlatform } from "../lib/utils";

/**
 * 原生字体平滑 Hook
 * 
 * @description
 * 根据用户设置和平台类型，在 macOS 平台上应用原生字体平滑效果。
 * 这会设置 -webkit-font-smoothing 和 -moz-osx-font-smoothing CSS 属性，
 * 使字体在 Retina 显示屏上更加清晰。
 * 
 * @example
 * ```tsx
 * function App() {
 *   useNativeFontSmoothing();
 *   return <div>应用内容</div>;
 * }
 * ```
 * 
 * @remarks
 * - 仅在 macOS 平台且用户启用该设置时生效
 * - 当设置变化或组件卸载时自动更新/清理
 */
export function useNativeFontSmoothing() {
  const { settings } = useAppSettings();
  
  // 判断是否应该应用字体平滑
  const shouldApply =
    settings.enableNativeFontSmoothing &&
    isMacPlatform(typeof navigator === "undefined" ? "" : navigator.platform);

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    
    if (shouldApply) {
      // 应用字体平滑效果
      rootStyle.setProperty("-webkit-font-smoothing", "antialiased");
      rootStyle.setProperty("-moz-osx-font-smoothing", "grayscale");
    } else {
      // 移除字体平滑效果
      rootStyle.removeProperty("-webkit-font-smoothing");
      rootStyle.removeProperty("-moz-osx-font-smoothing");
    }
  }, [shouldApply]);
}
