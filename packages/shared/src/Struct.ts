/**
 * Struct 模块 - 结构化数据工具集
 *
 * 提供深度部分类型（DeepPartial）和深度合并（deepMerge）等通用工具，
 * 用于处理嵌套对象的部分更新场景。常用于配置合并、状态更新等场景。
 *
 * @module Struct
 */

/**
 * 深度部分类型 - 递归地将对象类型的所有属性变为可选
 *
 * 与 TypeScript 内置的 Partial<T> 不同，DeepPartial 会递归处理嵌套对象和数组：
 * - 数组类型：递归地对数组元素应用 DeepPartial
 * - 对象类型：递归地将所有属性变为可选
 * - 基本类型：保持不变
 *
 * @example
 * ```ts
 * interface Config {
 *   db: { host: string; port: number };
 *   tags: string[];
 * }
 * // DeepPartial<Config> 等价于：
 * // {
 * //   readonly db?: { readonly host?: string; readonly port?: number };
 * //   readonly tags?: readonly string[];
 * // }
 * ```
 *
 * @template T - 目标类型
 */
export type DeepPartial<T> = T extends readonly (infer Item)[]
  ? readonly DeepPartial<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]?: DeepPartial<T[Key]> }
    : T;

/**
 * 类型守卫函数：判断一个值是否为普通对象（非数组、非 null）
 *
 * 在深度合并过程中需要区分普通对象和数组/基本类型，
 * 只有两个值都是普通对象时才进行递归合并，否则直接覆盖。
 *
 * @param value - 待检查的值
 * @returns 如果 value 是非 null、非数组的对象则返回 true
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 深度合并 - 将 patch 中的变更递归地合并到 base 中
 *
 * 合并规则：
 * - 如果 base 和 patch 的对应值都是普通对象，则递归合并
 * - 否则直接用 patch 中的值覆盖 base 中的值
 * - patch 中值为 undefined 的属性会被跳过，不会覆盖 base 中的值
 * - 数组类型不会递归合并，而是直接替换
 *
 * @example
 * ```ts
 * const base = { a: 1, nested: { x: 10, y: 20 } };
 * const patch = { nested: { y: 30 } };
 * deepMerge(base, patch); // => { a: 1, nested: { x: 10, y: 30 } }
 * ```
 *
 * @template T - 基础对象类型
 * @param base - 基础对象，作为合并的起点
 * @param patch - 部分更新对象，其非 undefined 属性会合并到 base 中
 * @returns 合并后的新对象，类型与 base 保持一致
 */
export function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  // 如果 base 或 patch 不是普通对象，直接用 patch 覆盖
  if (!isPlainRecord(base) || !isPlainRecord(patch)) {
    return patch as T;
  }

  // 浅拷贝 base，避免修改原始对象
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    // 跳过 undefined 值，保留 base 中的原始值
    if (value === undefined) {
      continue;
    }
    const current = next[key];
    // 如果当前值和新值都是普通对象，递归合并；否则直接覆盖
    next[key] = isPlainRecord(current) && isPlainRecord(value) ? deepMerge(current, value) : value;
  }
  return next as T;
}
