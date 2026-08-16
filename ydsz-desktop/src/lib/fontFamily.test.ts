/**
 * @file fontFamily.ts 单元测试
 *
 * 覆盖：
 * - normalizeFontFamilyCssValue
 *   - 空值 → null
 *   - 单族名（无空格） → 原样
 *   - 单族名（含空格） → 加引号
 *   - 通用族名（serif/monospace 等） → 原样
 *   - 已有引号 → 原样
 *   - 包含括号 → 原样
 *   - CSS 宽关键字 → 原样
 *   - 多族以逗号分隔
 *   - 引号内的逗号不被分割
 *   - 括号内的逗号不被分割
 *   - 反斜杠与双引号转义
 */

import { describe, expect, it } from "vitest";
import { normalizeFontFamilyCssValue } from "./fontFamily";

describe("normalizeFontFamilyCssValue", () => {
  it("空值 → null", () => {
    expect(normalizeFontFamilyCssValue(null)).toBeNull();
    expect(normalizeFontFamilyCssValue(undefined)).toBeNull();
    expect(normalizeFontFamilyCssValue("")).toBeNull();
    expect(normalizeFontFamilyCssValue("   ")).toBeNull();
  });

  it("单族名无空格 → 原样", () => {
    expect(normalizeFontFamilyCssValue("Helvetica")).toBe("Helvetica");
    expect(normalizeFontFamilyCssValue("Arial")).toBe("Arial");
  });

  it("单族名含空格 → 加双引号", () => {
    expect(normalizeFontFamilyCssValue("JetBrains Mono")).toBe('"JetBrains Mono"');
    expect(normalizeFontFamilyCssValue("Times New Roman")).toBe('"Times New Roman"');
  });

  it("通用字体族名 → 原样", () => {
    expect(normalizeFontFamilyCssValue("serif")).toBe("serif");
    expect(normalizeFontFamilyCssValue("monospace")).toBe("monospace");
    expect(normalizeFontFamilyCssValue("system-ui")).toBe("system-ui");
    expect(normalizeFontFamilyCssValue("ui-monospace")).toBe("ui-monospace");
  });

  it("已有双引号 → 原样", () => {
    expect(normalizeFontFamilyCssValue('"JetBrains Mono"')).toBe('"JetBrains Mono"');
  });

  it("已有单引号 → 原样", () => {
    expect(normalizeFontFamilyCssValue("'JetBrains Mono'")).toBe("'JetBrains Mono'");
  });

  it("包含括号 → 原样（按实现：包含括号直接返回）", () => {
    // normalizeSingleFontFamily 对包含 ( 的项直接返回 trimmedFamily
    expect(normalizeFontFamilyCssValue("SomeFont (1)")).toBe("SomeFont (1)");
  });

  it("CSS 宽关键字 → 原样", () => {
    expect(normalizeFontFamilyCssValue("inherit")).toBe("inherit");
    expect(normalizeFontFamilyCssValue("initial")).toBe("initial");
    expect(normalizeFontFamilyCssValue("unset")).toBe("unset");
  });

  it("多族以逗号分隔", () => {
    expect(normalizeFontFamilyCssValue("Arial, Helvetica, sans-serif")).toBe(
      "Arial, Helvetica, sans-serif",
    );
  });

  it("多族包含空格族名时混合格式", () => {
    expect(normalizeFontFamilyCssValue("Arial, JetBrains Mono, serif")).toBe(
      'Arial, "JetBrains Mono", serif',
    );
  });

  it("引号内的逗号不被分割", () => {
    expect(normalizeFontFamilyCssValue('"JetBrains, Mono", Arial')).toBe(
      '"JetBrains, Mono", Arial',
    );
  });

  it("括号内的逗号不被分割", () => {
    expect(normalizeFontFamilyCssValue("Font(Localized, Name), Arial")).toBe(
      "Font(Localized, Name), Arial",
    );
  });

  it("引号内含双引号需要转义", () => {
    expect(normalizeFontFamilyCssValue('Font "Bold"')).toBe('"Font \\"Bold\\""');
  });
});
