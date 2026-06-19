/**
 * @file I18nContext.tsx
 * @description 国际化 React Context 模块，为 React 组件树提供语言感知的翻译能力。
 *              语言配置来源于应用设置，当语言发生变化时会触发组件重新渲染，
 *              确保所有翻译后的标签保持同步，无需手动订阅。
 * @module I18nContext
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { MESSAGES, type Messages } from "./messages";
import { DEFAULT_LANGUAGE, normalizeLanguage, type Language } from "./language";

/**
 * 国际化上下文对象，用于在组件树中传递当前语言配置。
 * 默认值为 DEFAULT_LANGUAGE（英文）。
 */
const I18nContext = createContext<Language>(DEFAULT_LANGUAGE);

/**
 * I18nProvider 组件属性
 */
interface I18nProviderProps {
  /** 当前语言配置 */
  language: Language;
  /** 子组件 */
  children: ReactNode;
}

/**
 * 国际化 Provider 组件，用于在 React 组件树中注入当前语言配置。
 * 所有被 I18nProvider 包裹的子组件都可以通过 useLanguage、useMessages、useTranslation 获取语言信息。
 *
 * @param {I18nProviderProps} props - 组件属性
 * @param {Language} props.language - 当前语言，会被 normalizeLanguage 标准化
 * @param {ReactNode} props.children - 子组件
 * @returns {JSX.Element} 包裹了 I18nContext.Provider 的 JSX 元素
 */
export function I18nProvider({ language, children }: I18nProviderProps) {
  // 将传入的语言值标准化，确保是受支持的语言之一
  const normalized = normalizeLanguage(language);
  return <I18nContext.Provider value={normalized}>{children}</I18nContext.Provider>;
}

/**
 * 获取当前语言的 Hook。
 * 必须在 I18nProvider 内部使用。
 *
 * @returns {Language} 当前标准化的语言代码（如 "en" 或 "zh"）
 */
export function useLanguage(): Language {
  return useContext(I18nContext);
}

/**
 * 获取当前语言对应的所有翻译消息的 Hook。
 * 内部使用 useMemo 进行缓存，仅当语言变化时才会重新计算，避免不必要的重渲染。
 *
 * @returns {Messages} 当前语言对应的完整翻译消息对象
 */
export function useMessages(): Messages {
  const language = useLanguage();
  // 使用 useMemo 缓存消息对象，仅在 language 变化时重新获取
  return useMemo(() => MESSAGES[language], [language]);
}

/**
 * 获取当前语言和翻译消息的聚合 Hook。
 * 同时返回语言和消息对象，方便组件一次性获取所有国际化相关信息。
 *
 * @returns {{ language: Language; messages: Messages }} 包含当前语言和翻译消息的对象
 * @example
 * ```tsx
 * const { language, messages } = useTranslation();
 * console.log(language); // "zh"
 * console.log(messages.common.save); // "保存"
 * ```
 */
export function useTranslation(): {
  language: Language;
  messages: Messages;
} {
  const language = useLanguage();
  const messages = useMessages();
  return { language, messages };
}
