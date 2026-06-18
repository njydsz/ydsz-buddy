// FILE: I18nContext.tsx
// Purpose: Provide a language-aware translation hook for the React tree. The
//          language comes from app settings and changes drive a re-render so
//          all translated labels stay in sync without explicit subscriptions.
// Layer: Shared runtime utility (web)
// Exports: I18nProvider, useTranslation

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { MESSAGES, type Messages } from "./messages";
import { DEFAULT_LANGUAGE, normalizeLanguage, type Language } from "./language";

const I18nContext = createContext<Language>(DEFAULT_LANGUAGE);

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const normalized = normalizeLanguage(language);
  return <I18nContext.Provider value={normalized}>{children}</I18nContext.Provider>;
}

export function useLanguage(): Language {
  return useContext(I18nContext);
}

export function useMessages(): Messages {
  const language = useLanguage();
  return useMemo(() => MESSAGES[language], [language]);
}

export function useTranslation(): {
  language: Language;
  messages: Messages;
} {
  const language = useLanguage();
  const messages = useMessages();
  return { language, messages };
}
