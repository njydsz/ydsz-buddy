import { describe, expect, it } from "vitest";
import { detectBrowserLanguage, isLanguage, normalizeLanguage } from "./language";
import { MESSAGES } from "./messages";

describe("language", () => {
  it("normalizes unknown values to the default language", () => {
    expect(normalizeLanguage("fr")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
    expect(normalizeLanguage(42)).toBe("en");
  });

  it("accepts supported language values", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("zh")).toBe("zh");
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("zh")).toBe(true);
    expect(isLanguage("ja")).toBe(false);
  });

  it("falls back to English when no browser locale is available", () => {
    const original = (globalThis as { navigator?: Navigator }).navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      configurable: true,
    });
    try {
      expect(detectBrowserLanguage()).toBe("en");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: original,
        configurable: true,
      });
    }
  });
});

describe("messages", () => {
  it("ships translations for every supported language", () => {
    expect(Object.keys(MESSAGES).toSorted()).toEqual(["en", "zh"]);
  });

  it("keeps the same translation shape across languages", () => {
    const enKeys = JSON.stringify(Object.keys(MESSAGES.en.settings));
    const zhKeys = JSON.stringify(Object.keys(MESSAGES.zh.settings));
    expect(enKeys).toBe(zhKeys);
  });
});
