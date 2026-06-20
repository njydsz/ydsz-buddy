/**
 * @file JSON Schema 解码工具模块
 *
 * @description
 * 提供基于 Effect Schema 的 JSON 数据解码工具函数，将 JSON 字符串或未知类型的值
 * 安全地解码为指定的 Schema 类型。所有解码操作返回 `Result` 类型，支持优雅的错误处理。
 *
 * 核心功能：
 * - 从 JSON 字符串解码并验证数据（`decodeJsonResult`）
 * - 从未知类型的值解码并验证数据（`decodeUnknownJsonResult`）
 * - 格式化 Schema 验证错误信息（`formatSchemaError`）
 *
 * 使用场景：
 * - 服务端接收 JSON 请求体后的数据验证
 * - 配置文件加载后的类型安全检查
 * - 跨服务通信时的数据契约验证
 *
 * @module schemaJson
 * @layer 共享工具层
 *
 * @example
 * ```ts
 * import { Schema } from "effect";
 * import { decodeJsonResult, formatSchemaError } from './schemaJson';
 *
 * // 定义数据 Schema
 * const UserSchema = Schema.Struct({
 *   name: Schema.String,
 *   age: Schema.Number,
 * });
 *
 * // 解码 JSON 字符串
 * const decode = decodeJsonResult(UserSchema);
 * const result = decode('{"name":"Alice","age":30}');
 *
 * if (result._tag === 'Right') {
 *   console.log(result.right); // { name: 'Alice', age: 30 }
 * } else {
 *   console.error(formatSchemaError(result.left));
 * }
 * ```
 */
import { Cause, Exit, Result, Schema, SchemaIssue } from "effect";

/**
 * 创建 JSON 字符串解码器工厂函数
 *
 * 接收一个 Effect Schema，返回一个解码函数，该函数将 JSON 字符串解码并验证为
 * Schema 指定的类型。解码过程分为两步：
 * 1. 使用 `Schema.fromJsonString` 将 JSON 字符串解析为未知类型的值
 * 2. 使用 `Schema.decodeExit` 将解析后的值验证并转换为 Schema 指定的类型
 *
 * 解码结果以 `Result` 类型返回：
 * - 成功时返回 `Result.succeed(value)`，包含解码后的值
 * - 失败时返回 `Result.fail(cause)`，包含错误原因（`Cause<SchemaError>`）
 *
 * @template S - Schema 编解码器类型，必须满足 `Schema.Codec<unknown, unknown, never, never>` 约束
 * @param schema - Effect Schema 编解码器，用于定义目标数据类型和验证规则
 * @returns 解码函数，接收 JSON 字符串，返回 `Result<解码值, Cause<SchemaError>>`
 *
 * @throws 此函数不会抛出异常，解码错误通过 Result 类型返回
 *
 * @example
 * ```ts
 * import { Schema } from "effect";
 * import { decodeJsonResult } from './schemaJson';
 *
 * const ConfigSchema = Schema.Struct({
 *   host: Schema.String,
 *   port: Schema.Number,
 * });
 *
 * const decode = decodeJsonResult(ConfigSchema);
 *
 * // 成功解码
 * const success = decode('{"host":"localhost","port":8080}');
 * // success._tag === 'Right', success.right === { host: 'localhost', port: 8080 }
 *
 * // 解码失败（无效 JSON）
 * const failure1 = decode('invalid json');
 * // failure1._tag === 'Left'
 *
 * // 解码失败（类型不匹配）
 * const failure2 = decode('{"host":"localhost","port":"not-a-number"}');
 * // failure2._tag === 'Left'
 * ```
 *
 * @see {@link decodeUnknownJsonResult} - 从未知类型值解码
 * @see {@link formatSchemaError} - 格式化解码错误信息
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
 * 创建未知类型值解码器工厂函数
 *
 * 与 `decodeJsonResult` 类似，但接收未知类型的值而非 JSON 字符串。
 * 内部使用 `Schema.fromJsonString` 结合 `Schema.decodeUnknownExit` 进行解码，
 * 适用于已经解析过的 JavaScript 对象（如从数据库或消息队列获取的数据）。
 *
 * 解码过程：
 * 1. 使用 `Schema.fromJsonString(schema)` 构建 JSON 字符串 Schema
 * 2. 使用 `Schema.decodeUnknownExit` 将未知类型的值验证并转换为目标类型
 *
 * @template S - Schema 编解码器类型
 * @param schema - Effect Schema 编解码器
 * @returns 解码函数，接收未知类型的值，返回 `Result<解码值, Cause<SchemaError>>`
 *
 * @throws 此函数不会抛出异常，解码错误通过 Result 类型返回
 *
 * @example
 * ```ts
 * import { Schema } from "effect";
 * import { decodeUnknownJsonResult } from './schemaJson';
 *
 * const UserSchema = Schema.Struct({
 *   name: Schema.String,
 *   age: Schema.Number,
 * });
 *
 * const decode = decodeUnknownJsonResult(UserSchema);
 *
 * // 从未知类型的对象解码
 * const unknownData: unknown = { name: 'Bob', age: 25 };
 * const result = decode(unknownData);
 * // result._tag === 'Right', result.right === { name: 'Bob', age: 25 }
 *
 * // 解码失败
 * const failure = decode({ name: 'Bob', age: 'not-a-number' });
 * // failure._tag === 'Left'
 * ```
 *
 * @see {@link decodeJsonResult} - 从 JSON 字符串解码
 * @see {@link formatSchemaError} - 格式化解码错误信息
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
 * 格式化 Schema 验证错误为人类可读的字符串
 *
 * 将 Effect Schema 解码过程中产生的错误原因（`Cause<SchemaError>`）转换为
 * 简洁的错误描述字符串。如果错误是 `SchemaError` 类型，则使用 Schema 内置的
 * 格式化工具生成结构化的错误信息；否则使用 `Cause.pretty` 生成通用错误描述。
 *
 * 格式化策略：
 * 1. 使用 `Cause.squash` 将 Cause 压缩为单一错误值
 * 2. 检查压缩后的值是否为 `SchemaError`
 * 3. 如果是，使用 `SchemaIssue.makeFormatterDefault()` 格式化具体的验证问题
 * 4. 如果不是，使用 `Cause.pretty` 生成通用的错误堆栈描述
 *
 * @param cause - Schema 验证的错误原因对象
 * @returns 格式化后的错误描述字符串
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * import { Schema } from "effect";
 * import { decodeJsonResult, formatSchemaError } from './schemaJson';
 *
 * const UserSchema = Schema.Struct({
 *   name: Schema.String,
 *   age: Schema.Number,
 * });
 *
 * const decode = decodeJsonResult(UserSchema);
 * const result = decode('{"name":123,"age":"invalid"}');
 *
 * if (result._tag === 'Left') {
 *   const errorMessage = formatSchemaError(result.left);
 *   console.error(errorMessage);
 *   // 输出类似：
 *   // "Expected String, got 123 at path .name"
 *   // "Expected Number, got \"invalid\" at path .age"
 * }
 * ```
 *
 * @see {@link decodeJsonResult} - 创建 JSON 解码器
 * @see {@link decodeUnknownJsonResult} - 创建未知类型解码器
 */
export const formatSchemaError = (cause: Cause.Cause<Schema.SchemaError>) => {
  const squashed = Cause.squash(cause);
  return Schema.isSchemaError(squashed)
    ? SchemaIssue.makeFormatterDefault()(squashed.issue)
    : Cause.pretty(cause);
};
