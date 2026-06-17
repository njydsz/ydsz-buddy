/**
 * 文件: schemaJson.ts
 * 用途: 基于 Effect Schema 的 JSON 解码与错误格式化工具。
 * 层级: 共享工具模块
 * 主要导出: decodeJsonResult, decodeUnknownJsonResult, formatSchemaError
 */

import { Cause, Exit, Result, Schema, SchemaIssue } from "effect";

/**
 * 将 JSON 字符串解码为 Schema 定义的类型，返回 Result 而非直接抛出异常。
 *
 * 内部流程：JSON 字符串 → 解析为 unknown → Schema 校验 + 转换 → 目标类型。
 * 解码失败时返回 `Result.fail(cause)`，成功时返回 `Result.succeed(value)`。
 *
 * @param schema - 目标 Schema 定义。
 * @returns 一个接收 JSON 字符串、返回 Result 的解码函数。
 */
export const decodeJsonResult = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
) => {
  const decode = Schema.decodeExit(Schema.fromJsonString(schema));
  return (input: string) => {
    const result = decode(input);
    if (Exit.isFailure(result)) {
      return Result.fail(result.cause);
    }
    return Result.succeed(result.value);
  };
};

/**
 * 将 unknown 值解码为 Schema 定义的类型，返回 Result。
 *
 * 与 `decodeJsonResult` 的区别在于输入已是 unknown 而非 JSON 字符串，
 * 适用于需要先解析 JSON 再分段校验的场景。
 *
 * @param schema - 目标 Schema 定义。
 * @returns 一个接收 unknown 值、返回 Result 的解码函数。
 */
export const decodeUnknownJsonResult = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
) => {
  const decode = Schema.decodeUnknownExit(Schema.fromJsonString(schema));
  return (input: unknown) => {
    const result = decode(input);
    if (Exit.isFailure(result)) {
      return Result.fail(result.cause);
    }
    return Result.succeed(result.value);
  };
};

/**
 * 将 Schema 解码错误格式化为人类可读的字符串。
 *
 * 对于 SchemaError 类型的错误，使用默认格式化器生成结构化错误信息；
 * 对于其他类型的错误，使用 `Cause.pretty` 输出。
 *
 * @param cause - 解码失败产生的 Cause 对象。
 * @returns 格式化后的错误描述字符串。
 */
export const formatSchemaError = (cause: Cause.Cause<Schema.SchemaError>) => {
  const squashed = Cause.squash(cause);
  return Schema.isSchemaError(squashed)
    ? SchemaIssue.makeFormatterDefault()(squashed.issue)
    : Cause.pretty(cause);
};
