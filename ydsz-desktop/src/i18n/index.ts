/**
 * @file index.ts
 * @description 国际化模块的统一导出入口文件（Barrel File）。
 *              将 language、I18nContext、messages 三个子模块的公开 API 集中导出，
 *              方便外部通过单一入口引用国际化相关功能。
 * @module i18n
 */

// 从 language 模块导出语言相关的类型、常量和方法
export {
  /** 默认语言（英文） */
  DEFAULT_LANGUAGE,
  /** 支持的语言列表 */
  SUPPORTED_LANGUAGES,
  /** 检测浏览器语言偏好 */
  detectBrowserLanguage,
  /** 类型守卫：判断给定值是否为受支持的语言 */
  isLanguage,
  /** 将未知值标准化为受支持的语言，无效值回退到默认语言 */
  normalizeLanguage,
  /** 语言类型定义 */
  type Language,
} from "./language";

// 从 I18nContext 模块导出 React Context 相关的 Provider 和 Hooks
export {
  /** 国际化 Provider 组件 */
  I18nProvider,
  /** 获取当前语言的 Hook */
  useLanguage,
  /** 获取当前语言翻译消息的 Hook */
  useMessages,
  /** 获取语言和翻译消息的聚合 Hook */
  useTranslation,
} from "./I18nContext";

// 从 messages 模块导出翻译消息相关的类型、常量和数据
export {
  /** 所有语言的翻译消息字典 */
  MESSAGES,
  /** 各语言的原生名称标签（如 "English"、"中文"） */
  NATIVE_LANGUAGE_LABELS,
  /** 翻译消息类型定义 */
  type Messages,
} from "./messages";
