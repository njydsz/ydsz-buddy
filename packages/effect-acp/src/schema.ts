/**
 * @fileoverview Schema 模块
 *
 * 统一导出 ACP 协议定义的所有 Schema 类型和元数据常量。
 * 作为外部使用者的唯一入口点，重新导出自动生成的 schema 和 meta 模块。
 *
 * 所属模块：effect-acp
 * 主要导出：所有 ACP Schema 类型（从 _generated/schema.gen.ts）和方法名常量（从 _generated/meta.gen.ts）
 */

export * from "./_generated/schema.gen.ts";
export * from "./_generated/meta.gen.ts";
