import { describe, expect, it } from "vitest";
import {
  buildSettingsNavGroups,
  buildSettingsNavItems,
  normalizeSettingsSection,
} from "./settingsNavigation";
import { MESSAGES } from "./i18n";

describe("settingsNavigation", () => {
  it("normalizes unknown section ids back to general", () => {
    expect(normalizeSettingsSection(undefined)).toBe("general");
    expect(normalizeSettingsSection("providers")).toBe("providers");
    expect(normalizeSettingsSection("not-a-section")).toBe("general");
  });

  it("exposes the same nav ids for every language", () => {
    const enIds = buildSettingsNavItems(MESSAGES.en).map((item) => item.id);
    const zhIds = buildSettingsNavItems(MESSAGES.zh).map((item) => item.id);
    expect(enIds).toEqual(zhIds);
  });

  it("localizes nav labels per language", () => {
    expect(buildSettingsNavItems(MESSAGES.en).find((item) => item.id === "general")?.label).toBe(
      "General",
    );
    expect(buildSettingsNavItems(MESSAGES.zh).find((item) => item.id === "general")?.label).toBe(
      "通用",
    );
  });

  it("localizes nav descriptions per language", () => {
    const en = buildSettingsNavItems(MESSAGES.en).find((item) => item.id === "providers");
    const zh = buildSettingsNavItems(MESSAGES.zh).find((item) => item.id === "providers");
    expect(en?.description).toBe(
      "Choose visible providers, review CLI installs, and update provider tools.",
    );
    expect(zh?.description).toBe("选择可见的提供方、查看 CLI 安装状态并更新提供方工具。");
  });

  it("exposes localized group labels", () => {
    expect(buildSettingsNavGroups(MESSAGES.en).map((g) => g.label)).toEqual(["App", "Peak Code"]);
    expect(buildSettingsNavGroups(MESSAGES.zh).map((g) => g.label)).toEqual(["应用", "Peak Code"]);
  });
});
