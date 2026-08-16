/**
 * @file appSettings.voicePolish.test.ts
 * @description P1-7-5 语音润色高级配置项单元测试
 *
 * 覆盖：
 * - 高级字段默认值（removeFillerWords/fixGrammar/addStructure/targetLanguage）
 * - 非法 targetLanguage 会被 schema 拒绝
 * - 允许的合法值（"auto" / "zh" / "en"）能通过 schema
 * - 升级迁移：旧 settings 缺这四个字段时，mergedDefaults 会补齐默认值
 */

import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { AppSettingsSchema, normalizeStoredAppSettings } from "./appSettings";

type AppSettings = ReturnType<typeof normalizeStoredAppSettings>;

const defaultSettings: AppSettings = normalizeStoredAppSettings(
  Schema.decodeSync(AppSettingsSchema)({}),
);

describe("AppSettings · P1-7-5 voice polish advanced options", () => {
  describe("default values", () => {
    it("voicePolishRemoveFillerWords defaults to true", () => {
      expect(defaultSettings.voicePolishRemoveFillerWords).toBe(true);
    });

    it("voicePolishFixGrammar defaults to true", () => {
      expect(defaultSettings.voicePolishFixGrammar).toBe(true);
    });

    it("voicePolishAddStructure defaults to false", () => {
      expect(defaultSettings.voicePolishAddStructure).toBe(false);
    });

    it("voicePolishTargetLanguage defaults to 'auto'", () => {
      expect(defaultSettings.voicePolishTargetLanguage).toBe("auto");
    });
  });

  describe("schema validation", () => {
    const makeSettings = (overrides: Record<string, unknown> = {}) => ({
      ...defaultSettings,
      ...overrides,
    });

    it("accepts all three targetLanguage values", () => {
      for (const value of ["auto", "zh", "en"] as const) {
        const parsed = Schema.decodeSync(AppSettingsSchema)(makeSettings({ voicePolishTargetLanguage: value }));
        expect(parsed.voicePolishTargetLanguage).toBe(value);
      }
    });

    it("rejects unknown targetLanguage values", () => {
      expect(() =>
        Schema.decodeSync(AppSettingsSchema)(makeSettings({ voicePolishTargetLanguage: "fr" })),
      ).toThrow();
    });

    it("rejects empty-string targetLanguage", () => {
      expect(() =>
        Schema.decodeSync(AppSettingsSchema)(makeSettings({ voicePolishTargetLanguage: "" })),
      ).toThrow();
    });

    it("round-trips boolean advanced toggles", () => {
      const parsed = Schema.decodeSync(AppSettingsSchema)(
        makeSettings({
          voicePolishRemoveFillerWords: false,
          voicePolishFixGrammar: false,
          voicePolishAddStructure: true,
        }),
      );
      expect(parsed.voicePolishRemoveFillerWords).toBe(false);
      expect(parsed.voicePolishFixGrammar).toBe(false);
      expect(parsed.voicePolishAddStructure).toBe(true);
    });
  });
});
