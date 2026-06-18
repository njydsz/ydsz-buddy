// FILE: index.ts
// Purpose: Barrel re-exports for the web i18n module.
// Layer: Shared runtime utility (web)

export {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  detectBrowserLanguage,
  isLanguage,
  normalizeLanguage,
  type Language,
} from "./language";

export { I18nProvider, useLanguage, useMessages, useTranslation } from "./I18nContext";

export { MESSAGES, NATIVE_LANGUAGE_LABELS, type Messages } from "./messages";
