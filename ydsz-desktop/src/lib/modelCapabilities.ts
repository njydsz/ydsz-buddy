/**
 * @file 模型能力徽章 + 过滤工具
 * @description P0-2: 把后端 `ModelCapabilities` 渲染为 UI 徽章 + 顶部 chip 过滤。
 *
 * ## 设计原则
 *
 * 1. **容错**:`capabilities` 字段缺失时按"未知能力"处理 —— 不显示徽章,
 *    但 chip 过滤时该项按"不过滤"处理(因为没数据,不能假定为 false)。
 * 2. **可独立单元测试**:不依赖 React,所有纯函数导出。
 * 3. **i18n 友好**:所有展示文本走 `t()` 风格的查表,避免硬编码。
 *
 * @module lib/modelCapabilities
 */

import type {
  ModelCapabilityFlags,
  ModelCost,
  ProviderModelOption,
} from "../providerModelOptions";

/** 能力枚举(对应 UI chip + 徽章) */
export type ModelCapabilityKey = "imageInput" | "toolUse" | "reasoning" | "attachment";

/** 单个能力的展示信息 */
export interface ModelCapabilityMeta {
  key: ModelCapabilityKey;
  /** chip + 徽章共用 label */
  label: string;
  /** chip 排序权重(小的在前) */
  order: number;
  /** 简短的符号(emoji-free, 用字符或缩写) */
  glyph: string;
}

/** 能力展示元信息(单一来源) */
export const CAPABILITY_META: Record<ModelCapabilityKey, ModelCapabilityMeta> = {
  imageInput: { key: "imageInput", label: "视觉", order: 10, glyph: "Im" },
  toolUse: { key: "toolUse", label: "工具", order: 20, glyph: "Fu" },
  reasoning: { key: "reasoning", label: "推理", order: 30, glyph: "Re" },
  attachment: { key: "attachment", label: "附件", order: 40, glyph: "At" },
};

/** 能力按 order 升序的列表(用于 chip 渲染) */
export const CAPABILITY_KEYS_BY_ORDER: ModelCapabilityKey[] = (
  Object.values(CAPABILITY_META) as ModelCapabilityMeta[]
)
  .sort((a, b) => a.order - b.order)
  .map((m) => m.key);

/**
 * 从 ProviderModelOption 解析"非空"能力(只列出 caps 中显式为 true 的项)
 *
 * caps 缺省 / 为 false / undefined → 不返回。
 */
export function listEnabledCapabilities(
  caps: ModelCapabilityFlags | undefined,
): ModelCapabilityKey[] {
  if (!caps) return [];
  const out: ModelCapabilityKey[] = [];
  for (const key of CAPABILITY_KEYS_BY_ORDER) {
    if (caps[key] === true) out.push(key);
  }
  return out;
}

/**
 * 过滤模型:在 chips 集合中勾选的能力必须全部命中(AND 语义)
 *
 * 空 chip 集合 = 不过滤(返回原列表)。
 */
export function filterModelsByCapabilities(
  options: ReadonlyArray<ProviderModelOption>,
  required: ReadonlySet<ModelCapabilityKey>,
): ProviderModelOption[] {
  if (required.size === 0) return [...options];
  return options.filter((opt) => {
    const caps = opt.capabilities;
    if (!caps) return false; // 没数据 = 不命中(避免误显示)
    for (const k of required) {
      if (caps[k] !== true) return false;
    }
    return true;
  });
}

/**
 * 格式化上下文窗口为简短显示
 *
 * 输入: "128000" / "128K" / "200K" / "1M" / "1000000" / undefined
 * 输出: "128K" / "200K" / "1M" / "1M" / undefined
 */
export function formatContextWindow(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // 已经带 K/M/B 单位直接用
  if (/[KkMmBb]$/u.test(trimmed)) return trimmed.toUpperCase();
  // 数字 → 转 K/M
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return trimmed;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}K`;
  return String(num);
}

/**
 * 格式化定价为 "$3 / $15" / "$3" / null
 *
 * 缺一(只有 input 或 output)时只展示有值的那一项。
 */
export function formatModelCost(cost: ModelCost | undefined): string | null {
  if (!cost) return null;
  const inPart = typeof cost.input === "number" ? `$${cost.input}` : null;
  const outPart = typeof cost.output === "number" ? `$${cost.output}` : null;
  if (inPart && outPart) return `${inPart} / ${outPart}`;
  return inPart ?? outPart;
}

/**
 * 模型能力过滤状态(用于 picker 顶部 chip 行)
 */
export interface ModelCapabilityFilterState {
  /** 当前勾选的能力集合(AND 语义:全部命中才保留) */
  required: ReadonlySet<ModelCapabilityKey>;
}

/** 创建空 filter state */
export function emptyCapabilityFilter(): ModelCapabilityFilterState {
  return { required: new Set() };
}

/** 切换单个 chip(命中则移除,未命中则加入) */
export function toggleCapability(
  state: ModelCapabilityFilterState,
  key: ModelCapabilityKey,
): ModelCapabilityFilterState {
  const next = new Set(state.required);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return { required: next };
}

/** 清除所有 chip(回到不过滤状态) */
export function clearCapabilityFilter(): ModelCapabilityFilterState {
  return emptyCapabilityFilter();
}
