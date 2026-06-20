/**
 * @file Provider 排序管理
 *
 * 维护 Provider 选择器中的排序稳定性，确保设置页面、搜索和菜单中的顺序一致�? * 提供默认排序、排序标准化、排序比较等工具函数�? */

import type { ProviderKind } from "~/contracts";

/**
 * Provider 的默认显示顺序�? * 此顺序决定了侧边栏、选择器等 UI �?Provider 的排列位置�? */
export const DEFAULT_PROVIDER_ORDER: readonly ProviderKind[] = [
  "codex",
  "claudeAgent",
  "cursor",
  "gemini",
  "grok",
  "kilo",
  "opencode",
  "pi",
];

/** 基于 DEFAULT_PROVIDER_ORDER 构建�?Provider 类型集合，用于快速查�?*/
const PROVIDER_KIND_SET: ReadonlySet<ProviderKind> = new Set(DEFAULT_PROVIDER_ORDER);

/**
 * 判断给定字符串是否为有效�?ProviderKind 类型�? *
 * @param value - 待判断的字符�? * @returns 是否为有效的 ProviderKind
 */
export function isProviderKind(value: string): value is ProviderKind {
  return PROVIDER_KIND_SET.has(value as ProviderKind);
}

/**
 * 标准化隐藏的 Provider 列表�? * 过滤无效值和重复项，仅保留有效的 ProviderKind�? *
 * @param hiddenProviders - 原始隐藏 Provider 列表
 * @returns 去重后的有效 ProviderKind 数组
 */
export function normalizeHiddenProviders(hiddenProviders: ReadonlyArray<string>): ProviderKind[] {
  const seen = new Set<ProviderKind>();
  const result: ProviderKind[] = [];
  for (const candidate of hiddenProviders) {
    if (isProviderKind(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      result.push(candidate);
    }
  }
  return result;
}

/**
 * 标准�?Provider 排序列表�? * 过滤无效值和重复项，并将用户未指定的 Provider 按默认顺序追加到末尾�? *
 * @param providerOrder - 原始 Provider 排序列表
 * @returns 标准化后的完�?ProviderKind 排序数组
 */
export function normalizeProviderOrder(providerOrder: ReadonlyArray<string>): ProviderKind[] {
  const seen = new Set<ProviderKind>();
  const result: ProviderKind[] = [];
  for (const candidate of providerOrder) {
    if (isProviderKind(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      result.push(candidate);
    }
  }
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    if (!seen.has(provider)) {
      result.push(provider);
    }
  }
  return result;
}

/**
 * 判断两个 Provider 排序列表是否完全相同（顺序和元素一致）�? *
 * @param left - 第一个排序列�? * @param right - 第二个排序列�? * @returns 是否相同
 */
export function sameProviderOrder(
  left: ReadonlyArray<ProviderKind>,
  right: ReadonlyArray<ProviderKind>,
): boolean {
  return left.length === right.length && left.every((provider, index) => provider === right[index]);
}

/**
 * 按照指定排序比较两个 Provider 的先后顺序�? * 不在排序列表中的 Provider 排在末尾，按默认顺序排列�? *
 * @param providerOrder - 排序规则列表
 * @param left - 第一�?Provider
 * @param right - 第二�?Provider
 * @returns 负数表示 left 在前，正数表�?right 在前�? 表示相同
 */
export function compareProvidersByOrder(
  providerOrder: ReadonlyArray<ProviderKind>,
  left: ProviderKind,
  right: ProviderKind,
): number {
  const leftIndex = providerOrder.indexOf(left);
  const rightIndex = providerOrder.indexOf(right);
  const normalizedLeftIndex =
    leftIndex >= 0 ? leftIndex : DEFAULT_PROVIDER_ORDER.indexOf(left) + providerOrder.length;
  const normalizedRightIndex =
    rightIndex >= 0 ? rightIndex : DEFAULT_PROVIDER_ORDER.indexOf(right) + providerOrder.length;
  return normalizedLeftIndex - normalizedRightIndex;
}
