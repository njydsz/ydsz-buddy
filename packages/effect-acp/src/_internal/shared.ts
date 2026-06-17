/**
 * @fileoverview 共享工具模块
 *
 * 提供 effect-acp 包中 Client 和 Agent 共用的内部工具函数。
 * 包括 RPC 调用错误处理、请求处理器包装、扩展注册解码和 JSON-RPC 编解码工具。
 *
 * 所属模块：effect-acp（内部工具）
 * 主要导出：callRpc、runHandler、decodeExtRequestRegistration、decodeExtNotificationRegistration、jsonRpcRequest 等
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import { RpcClientError } from "effect/unstable/rpc";

import * as AcpSchema from "../_generated/schema.gen.ts";
import * as AcpError from "../errors.ts";

/** Schema 校验错误格式化器 */
const formatSchemaIssue = SchemaIssue.makeFormatterDefault();

/**
 * 调用 RPC 并统一处理错误。
 *
 * 将 RpcClientError 转换为 AcpTransportError，将协议层 Error 转换为 AcpRequestError。
 *
 * @param effect - RPC 调用 Effect
 * @returns 统一错误类型的 Effect
 */
export const callRpc = <A>(
  effect: Effect.Effect<A, RpcClientError.RpcClientError | AcpSchema.Error>,
): Effect.Effect<A, AcpError.AcpError> =>
  effect.pipe(
    // 将 RPC 客户端错误转换为传输错误
    Effect.catchTag("RpcClientError", (error) =>
      Effect.fail(
        new AcpError.AcpTransportError({
          detail: error.message,
          cause: error,
        }),
      ),
    ),
    // 将协议层错误转换为请求错误
    Effect.catchIf(Schema.is(AcpSchema.Error), (error) =>
      Effect.fail(AcpError.AcpRequestError.fromProtocolError(error)),
    ),
  );

/**
 * 运行请求处理器。
 *
 * 如果处理器未注册，返回方法未找到错误；否则执行处理器并统一错误格式。
 *
 * @param handler - 请求处理器（可能未注册）
 * @param payload - 请求载荷
 * @param method - 方法名
 * @returns 处理结果或协议错误
 */
export const runHandler = Effect.fnUntraced(function* <A, B>(
  handler: ((payload: A) => Effect.Effect<B, AcpError.AcpError>) | undefined,
  payload: A,
  method: string,
) {
  if (!handler) {
    // 未注册处理器 -> 返回方法未找到错误
    return yield* Effect.fail(AcpError.AcpRequestError.methodNotFound(method).toProtocolError());
  }
  return yield* handler(payload).pipe(
    Effect.mapError((error) =>
      Schema.is(AcpError.AcpRequestError)(error)
        ? error.toProtocolError()
        : AcpError.AcpRequestError.internalError(error.message).toProtocolError(),
    ),
  );
});

/**
 * 解码扩展请求注册。
 *
 * 返回一个包装函数，该函数先解码未知参数为指定 Schema 类型，再调用处理器。
 * 解码失败时返回 InvalidParams 错误。
 *
 * @param method - 方法名
 * @param payload - 载荷 Schema 编解码器
 * @param handler - 请求处理器
 * @returns 包装后的请求处理函数
 */
export function decodeExtRequestRegistration<A, I>(
  method: string,
  payload: Schema.Codec<A, I>,
  handler: (payload: A) => Effect.Effect<unknown, AcpError.AcpError>,
) {
  return (params: unknown): Effect.Effect<unknown, AcpError.AcpError> =>
    Schema.decodeUnknownEffect(payload)(params).pipe(
      Effect.mapError((error) =>
        AcpError.AcpRequestError.invalidParams(
          `Invalid ${method} payload: ${formatSchemaIssue(error.issue)}`,
          { issue: error.issue },
        ),
      ),
      Effect.flatMap((decoded) => handler(decoded)),
    );
}

/**
 * 解码扩展通知注册。
 *
 * 返回一个包装函数，该函数先解码未知参数为指定 Schema 类型，再调用处理器。
 * 解码失败时返回 AcpProtocolParseError 错误。
 *
 * @param method - 方法名
 * @param payload - 载荷 Schema 编解码器
 * @param handler - 通知处理器
 * @returns 包装后的通知处理函数
 */
export function decodeExtNotificationRegistration<A, I>(
  method: string,
  payload: Schema.Codec<A, I>,
  handler: (payload: A) => Effect.Effect<void, AcpError.AcpError>,
) {
  return (params: unknown): Effect.Effect<void, AcpError.AcpError> =>
    Schema.decodeUnknownEffect(payload)(params).pipe(
      Effect.mapError(
        (error) =>
          new AcpError.AcpProtocolParseError({
            detail: `Invalid ${method} notification payload: ${formatSchemaIssue(error.issue)}`,
            cause: error,
          }),
      ),
      Effect.flatMap((decoded) => handler(decoded)),
    );
}

/** 文本编码器，用于 JSONL 编码 */
const encoder = new TextEncoder();

/** JSON-RPC ID 类型：数字或字符串 */
const JsonRpcId = Schema.Union([Schema.Number, Schema.String]);
/** JSON-RPC Headers 类型 */
const JsonRpcHeaders = Schema.Array(Schema.Unknown);

/**
 * 创建 JSON-RPC 请求 Schema。
 *
 * @param method - JSON-RPC 方法名
 * @param params - 参数 Schema
 * @returns 完整的 JSON-RPC 请求结构 Schema
 */
export const jsonRpcRequest = <A, I>(method: string, params: Schema.Codec<A, I>) =>
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: JsonRpcId,
    method: Schema.Literal(method),
    params,
    headers: JsonRpcHeaders,
  });

/**
 * 创建 JSON-RPC 通知 Schema。
 *
 * 通知与请求的区别在于没有 id 字段，不需要响应。
 *
 * @param method - JSON-RPC 方法名
 * @param params - 参数 Schema
 * @returns 完整的 JSON-RPC 通知结构 Schema
 */
export const jsonRpcNotification = <A, I>(method: string, params: Schema.Codec<A, I>) =>
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    method: Schema.Literal(method),
    params,
  });

/**
 * 创建 JSON-RPC 响应 Schema。
 *
 * @param result - 结果 Schema
 * @returns 完整的 JSON-RPC 响应结构 Schema
 */
export const jsonRpcResponse = <A, I>(result: Schema.Codec<A, I>) =>
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: JsonRpcId,
    result,
  });

/**
 * 将值编码为 JSONL（JSON Lines）格式。
 *
 * 先将值通过 Schema 编码为 JSON 字符串，再追加换行符并转为 Uint8Array。
 *
 * @param schema - 值对应的 Schema
 * @param value - 要编码的值
 * @returns 编码后的 Uint8Array
 */
export const encodeJsonl = <A, I>(schema: Schema.Codec<A, I>, value: A) =>
  Effect.map(Schema.encodeEffect(Schema.fromJsonString(schema))(value), (encoded) =>
    encoder.encode(`${encoded}\n`),
  );
