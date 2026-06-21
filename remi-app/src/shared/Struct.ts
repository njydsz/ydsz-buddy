/**
 * @file 结构化类型工具模块
 *
 * 本模块提供了对 TypeScript 对象结构进行深度操作的类型工具：
 *
 * - `DeepPartial<T>`：深度可选版本，递归地将所有字段变为可选
 * - `DeepRequired<T>`：深度必选版本，递归地将所有字段变为必选
 * - `DeepReadonly<T>`：深度只读版本，递归地将所有字段变为只读
 * - `Nullable<T>` / `NonNullableFields<T>`：空值处理工具
 *
 * ## 使用场景
 *
 * - 定义配置更新接口（部分字段可选）
 * - 包装不可变数据（如 store state）
 * - 转换 API 响应为可写对象
 *
 * ## 注意事项
 *
 * - 深度类型在大型对象上可能影响 TypeScript 编译性能
 * - 对函数、Symbol 等特殊类型的行为遵循 TS 内置类型工具
 */

export type DeepPartial<T> = T extends readonly (infer Item)[]
  ? readonly DeepPartial<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]?: DeepPartial<T[Key]> }
    : T;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainRecord(base) || !isPlainRecord(patch)) {
    return patch as T;
  }

  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    const current = next[key];
    next[key] = isPlainRecord(current) && isPlainRecord(value) ? deepMerge(current, value) : value;
  }
  return next as T;
}
