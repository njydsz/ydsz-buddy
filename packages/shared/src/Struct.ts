/**
 * 文件: Struct.ts
 * 用途: 深度部分类型定义与深度合并工具函数。
 * 层级: 共享工具模块
 * 主要导出: DeepPartial 类型、deepMerge 函数
 */

/**
 * 递归地将类型 T 的所有属性变为可选。
 *
 * 对于数组类型，递归处理元素类型；对于对象类型，递归处理每个属性；
 * 对于基本类型，保持不变。
 */
export type DeepPartial<T> = T extends readonly (infer Item)[]
  ? readonly DeepPartial<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]?: DeepPartial<T[Key]> }
    : T;

/** 类型守卫：判断值是否为普通对象（非 null、非数组） */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 深度合并两个对象，将 patch 中的值递归覆盖到 base 上。
 *
 * 合并规则：
 * - 若 base 或 patch 不是普通对象，直接返回 patch；
 * - 若 patch 中某属性值为 undefined，则跳过该属性；
 * - 若 base 和 patch 中对应属性均为普通对象，则递归合并；
 * - 否则用 patch 的值直接覆盖 base 的值。
 *
 * @param base - 基础对象，作为合并的默认值来源。
 * @param patch - 补丁对象，其值会覆盖 base 中的对应属性。
 * @returns 合并后的新对象。
 */
export function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainRecord(base) || !isPlainRecord(patch)) {
    return patch as T;
  }

  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    // undefined 表示"不修改"，跳过
    if (value === undefined) {
      continue;
    }
    const current = next[key];
    // 双方均为普通对象时递归合并，否则直接覆盖
    next[key] = isPlainRecord(current) && isPlainRecord(value) ? deepMerge(current, value) : value;
  }
  return next as T;
}
