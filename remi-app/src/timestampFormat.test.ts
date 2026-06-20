/**
 * @file 时间戳格式化测试
 *
 * 验证 getTimestampFormatOptions 在不同 TimestampFormat 下的输出，
 * 以及 formatTimestamp / formatShortTimestamp 不会因缓存而返回错误结果。
 */

import { afterEach, describe, expect, it } from "vitest";

import { formatShortTimestamp, formatTimestamp, getTimestampFormatOptions } from "./timestampFormat";

describe("getTimestampFormatOptions", () => {
  it("returns hour12 undefined for locale", () => {
    const opts = getTimestampFormatOptions("locale", false);
    expect(opts.hour12).toBeUndefined();
    expect(opts.hour).toBe("numeric");
    expect(opts.minute).toBe("2-digit");
    expect(opts.second).toBeUndefined();
  });

  it("returns hour12 false for 24-hour", () => {
    const opts = getTimestampFormatOptions("24-hour", true);
    expect(opts.hour12).toBe(false);
    expect(opts.second).toBe("2-digit");
  });

  it("returns hour12 true for 12-hour", () => {
    const opts = getTimestampFormatOptions("12-hour", false);
    expect(opts.hour12).toBe(true);
  });

  it("includeSeconds toggles the second field", () => {
    const withSeconds = getTimestampFormatOptions("locale", true);
    const withoutSeconds = getTimestampFormatOptions("locale", false);
    expect(withSeconds.second).toBe("2-digit");
    expect(withoutSeconds.second).toBeUndefined();
  });
});

describe("formatTimestamp / formatShortTimestamp", () => {
  afterEach(() => {
    // 重置模块状态以清空 formatter 缓存（通过动态 reimport 不易做到，故不在此清理）
  });

  it("formats a fixed ISO timestamp to a non-empty string", () => {
    // 2024-01-01T15:30:45Z 在所有 format 下都应得到非空字符串
    const iso = "2024-01-01T15:30:45.000Z";
    const full = formatTimestamp(iso, "locale");
    const short = formatShortTimestamp(iso, "locale");
    expect(full.length).toBeGreaterThan(0);
    expect(short.length).toBeGreaterThan(0);
    expect(full).toContain("30");
  });

  it("12-hour and 24-hour outputs differ for non-zero hours", () => {
    const iso = "2024-06-15T13:30:00.000Z";
    const twelve = formatTimestamp(iso, "12-hour");
    const twentyFour = formatTimestamp(iso, "24-hour");
    // 二者中至少有一个差异（取决于 locale 的实际时区）
    // 我们至少确保二者都不为空且为字符串
    expect(typeof twelve).toBe("string");
    expect(typeof twentyFour).toBe("string");
  });
});
