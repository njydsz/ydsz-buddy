// Lightweight runtime i18n. Avoids pulling in `react-intl` or
// `i18next` for a 200-key bundle. The dictionary is plain TypeScript
// so the language attribute flows through TypeScript, and we get
// compile-time safety on missing keys per language.
//
// Usage:
//   const t = useT();
//   t("sidebar.search")  // -> "Search threads…"
//
// The active language is read from the store; mutating it via
// `setLanguage(...)` re-renders all consumers.

import { useAppStore } from "@/store";
import en from "./locales/en";
import zhCN from "./locales/zh-CN";

export type Language = "en" | "zh-CN";
export type Dict = Record<string, string>;

const DICTS: Record<Language, Dict> = {
  en,
  "zh-CN": zhCN,
};

function resolveDict(lang: Language | string | undefined): Dict {
  if (lang === "zh-CN" || lang === "en") {
    return DICTS[lang];
  }
  return DICTS.en;
}

export function translate(
  key: string,
  lang: Language,
  params?: Record<string, string | number>,
): string {
  const dict = resolveDict(lang);
  const raw = dict[key] ?? DICTS.en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] != null ? String(params[k]) : `{${k}}`,
  );
}

export function useT() {
  const language = useAppStore((s) => s.language);
  return (key: string, params?: Record<string, string | number>) =>
    translate(key, language, params);
}

export function useLanguage(): [Language, (next: Language) => void] {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  return [language, setLanguage];
}
