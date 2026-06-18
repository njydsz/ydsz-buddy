// FILE: language.ts
// Purpose: Define supported UI languages and detect the best initial pick from
//          navigator/browser settings. Kept as plain string literal union so the
//          type flows into the app settings schema without a runtime dependency.
// Layer: Shared runtime utility (web)
// Exports: Language type/const, supported language list, detectBrowserLanguage

export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "en";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function detectBrowserLanguage(): Language {
  if (typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE;
  }
  const candidates = [
    navigator.language,
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    if (lower.startsWith("zh")) {
      return "zh";
    }
    if (lower.startsWith("en")) {
      return "en";
    }
  }
  return DEFAULT_LANGUAGE;
}
