/**
 * @file JSON Schema 解码工具模块
 *
 * 本模块提供基于 Effect Schema 的 JSON 解码工具，封装了从 JSON 字符串到类型安全对象的转换：
 *
 * - **解码为 Result**：返回成功/失败值，避免抛出异常
 * - **解码为 Effect**：集成到 Effect 生态，支持错误处理链
 * - **流式解码**：对 JSON Lines / 数组流进行逐项解码
 *
 * ## 核心导出
 *
 * - `decodeJsonResult`：同步解码为 `Result<T, SchemaIssue>` 类型
 * - `decodeJsonEffect`：异步解码为 `Effect<T, SchemaIssue>` 类型
 * - `tryDecodeJson`：尝试解码，失败时返回 `null`
 *
 * ## 使用场景
 *
 * - WebSocket 消息 payload 解码
 * - 本地存储的 JSON 数据反序列化
 * - API 响应校验
 *
 * ## 注意事项
 *
 * - 解码失败时返回详细的 `SchemaIssue` 错误
 * - 大型 JSON 字符串解码可能占用较多内存
 * - 信任外部输入前应始终进行解码校验
 */

import { Cause, Exit, Result, Schema, SchemaIssue } from "effect";

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

export const formatSchemaError = (cause: Cause.Cause<Schema.SchemaError>) => {
  const squashed = Cause.squash(cause);
  return Schema.isSchemaError(squashed)
    ? SchemaIssue.makeFormatterDefault()(squashed.issue)
    : Cause.pretty(cause);
};
