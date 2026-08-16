/**
 * @file 时间戳格式化
 *
 * 提供时间戳的格式化功能，支持 locale（本地化）、12 小时制和 24 小时制三种格式。
 * 使用 Intl.DateTimeFormat 实现国际化时间显示，并通过缓存机制优化性能。
 */

import { type TimestampFormat } from "./appSettings";

/**
 * 根据时间戳格式和是否包含秒数，构建 Intl.DateTimeFormat 的配置选项。
 *
 * @param timestampFormat - 时间戳格式类型
 * @param includeSeconds - 是否包含秒数
 * @returns DateTimeFormat 配置选项
 */
export function getTimestampFormatOptions(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormatOptions {
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  };

  if (timestampFormat === "locale") {
    return baseOptions;
  }

  return {
    ...baseOptions,
    hour12: timestampFormat === "12-hour",
  };
}

/** DateTimeFormat 实例缓存，避免重复创建格式化器 */
const timestampFormatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * 获取或创建时间戳格式化器。使用缓存机制避免重复创建 Intl.DateTimeFormat 实例。
 *
 * @param timestampFormat - 时间戳格式类型
 * @param includeSeconds - 是否包含秒数
 * @returns DateTimeFormat 实例
 */
function getTimestampFormatter(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormat {
  const cacheKey = `${timestampFormat}:${includeSeconds ? "seconds" : "minutes"}`;
  const cachedFormatter = timestampFormatterCache.get(cacheKey);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat(
    undefined,
    getTimestampFormatOptions(timestampFormat, includeSeconds),
  );
  timestampFormatterCache.set(cacheKey, formatter);
  return formatter;
}

/**
 * 格式化 ISO 日期字符串为完整时间戳（含秒数）。
 *
 * @param isoDate - ISO 8601 格式的日期字符串
 * @param timestampFormat - 时间戳格式类型
 * @returns 格式化后的时间戳字符串
 */
export function formatTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  return getTimestampFormatter(timestampFormat, true).format(new Date(isoDate));
}

/**
 * 格式化 ISO 日期字符串为简短时间戳（不含秒数）。
 *
 * @param isoDate - ISO 8601 格式的日期字符串
 * @param timestampFormat - 时间戳格式类型
 * @returns 格式化后的简短时间戳字符串
 */
export function formatShortTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  return getTimestampFormatter(timestampFormat, false).format(new Date(isoDate));
}
