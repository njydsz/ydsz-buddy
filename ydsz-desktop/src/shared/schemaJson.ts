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
 * - `decodeJsonResult`：同步解码为 `Either<ParseError, T>` 类型
 * - `decodeJsonEffect`：异步解码为 `Effect<T, ParseError>` 类型
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
 * - 解码失败时返回详细的 `ParseError` 错误
 * - 大型 JSON 字符串解码可能占用较多内存
 * - 信任外部输入前应始终进行解码校验
 */

import { Cause, ParseResult, Schema } from "effect";

/**
 * 创建 JSON 解码为 Result 的函数。
 *
 * @param schema - Effect Schema 定义
 * @returns 解码函数，接收 JSON 字符串返回 Either 结果
 */
export const decodeJsonResult = <A, I>(schema: Schema.Schema<A, I, never>) => {
  const decode = Schema.decodeEither(Schema.parseJson(schema) as Schema.Schema<A, string, never>);
  return (input: string) => decode(input);
};

/**
 * 创建未知 JSON 解码为 Result 的函数。
 *
 * @param schema - Effect Schema 定义
 * @returns 解码函数，接收 unknown 返回 Either 结果
 */
export const decodeUnknownJsonResult = <A, I>(schema: Schema.Schema<A, I, never>) => {
  const decode = Schema.decodeUnknownEither(
    Schema.parseJson(schema) as Schema.Schema<A, string, never>,
  );
  return (input: unknown) => decode(input);
};

/**
 * 格式化 Schema 错误为可读字符串。
 *
 * @param cause - ParseError 的 Cause
 * @returns 格式化的错误字符串
 */
export const formatSchemaError = (cause: Cause.Cause<ParseResult.ParseError>) => {
  const squashed = Cause.squash(cause);
  return ParseResult.isParseError(squashed)
    ? ParseResult.ArrayFormatter.formatIssueSync(squashed.issue)
    : Cause.pretty(cause);
};
