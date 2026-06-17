/**
 * @fileoverview 错误定义模块
 *
 * 定义 effect-acp 包中所有的错误类型，基于 Effect Schema 的 TaggedErrorClass 实现。
 * 包含进程生命周期错误、协议解析错误、传输错误和请求错误。
 *
 * 所属模块：effect-acp
 * 主要导出：AcpError 联合类型及各个具体的错误类
 *
 * @see https://agentclientprotocol.com
 */

import * as Schema from "effect/Schema";

import * as AcpSchema from "./_generated/schema.gen.ts";

/**
 * ACP 进程启动失败错误。
 *
 * 当客户端无法启动 ACP 子进程时抛出。
 */
export class AcpSpawnError extends Schema.TaggedErrorClass<AcpSpawnError>()("AcpSpawnError", {
  /** 启动命令（可选） */
  command: Schema.optional(Schema.String),
  /** 底层错误原因 */
  cause: Schema.Defect,
}) {
  override get message() {
    return this.command
      ? `Failed to spawn ACP process for command: ${this.command}`
      : "Failed to spawn ACP process";
  }
}

/**
 * ACP 进程异常退出错误。
 *
 * 当 ACP 子进程非预期退出时抛出。
 */
export class AcpProcessExitedError extends Schema.TaggedErrorClass<AcpProcessExitedError>()(
  "AcpProcessExitedError",
  {
    /** 进程退出码（可选） */
    code: Schema.optional(Schema.Number),
    /** 底层错误原因（可选） */
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message() {
    return this.code === undefined
      ? "ACP process exited"
      : `ACP process exited with code ${this.code}`;
  }
}

/**
 * ACP 协议解析错误。
 *
 * 当无法解析 ACP 协议消息时抛出。
 */
export class AcpProtocolParseError extends Schema.TaggedErrorClass<AcpProtocolParseError>()(
  "AcpProtocolParseError",
  {
    /** 错误详情 */
    detail: Schema.String,
    /** 底层错误原因（可选） */
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message() {
    return `Failed to parse ACP protocol message: ${this.detail}`;
  }
}

/**
 * ACP 传输层错误。
 *
 * 当底层 I/O 或通信出现问题时抛出。
 */
export class AcpTransportError extends Schema.TaggedErrorClass<AcpTransportError>()(
  "AcpTransportError",
  {
    /** 错误详情 */
    detail: Schema.String,
    /** 底层错误原因 */
    cause: Schema.Defect,
  },
) {}

/**
 * ACP 请求错误。
 *
 * 对应 JSON-RPC 错误响应，包含标准 JSON-RPC 错误码和自定义 ACP 错误码。
 * 提供一系列工厂方法用于创建常见的 JSON-RPC 标准错误。
 */
export class AcpRequestError extends Schema.TaggedErrorClass<AcpRequestError>()("AcpRequestError", {
  /** JSON-RPC 错误码 */
  code: AcpSchema.ErrorCode,
  /** 错误消息 */
  errorMessage: Schema.String,
  /** 附加数据（可选） */
  data: Schema.optional(Schema.Unknown),
}) {
  override get message() {
    return this.errorMessage;
  }

  /**
   * 从协议层 Error 对象创建 AcpRequestError 实例。
   *
   * @param error - ACP 协议定义的 Error 对象
   * @returns 对应的 AcpRequestError 实例
   */
  static fromProtocolError(error: AcpSchema.Error) {
    return new AcpRequestError({
      code: error.code,
      errorMessage: error.message,
      ...(error.data !== undefined ? { data: error.data } : {}),
    });
  }

  /**
   * 创建 JSON-RPC 解析错误（-32700）。
   *
   * @param message - 错误消息
   * @param data - 附加数据
   */
  static parseError(message = "Parse error", data?: unknown) {
    return new AcpRequestError({
      code: -32700,
      errorMessage: message,
      ...(data !== undefined ? { data } : {}),
    });
  }

  /**
   * 创建 JSON-RPC 无效请求错误（-32600）。
   *
   * @param message - 错误消息
   * @param data - 附加数据
   */
  static invalidRequest(message = "Invalid request", data?: unknown) {
    return new AcpRequestError({
      code: -32600,
      errorMessage: message,
      ...(data !== undefined ? { data } : {}),
    });
  }

  /**
   * 创建 JSON-RPC 方法未找到错误（-32601）。
   *
   * @param method - 未找到的方法名
   */
  static methodNotFound(method: string) {
    return new AcpRequestError({
      code: -32601,
      errorMessage: `Method not found: ${method}`,
    });
  }

  /**
   * 创建 JSON-RPC 无效参数错误（-32602）。
   *
   * @param message - 错误消息
   * @param data - 附加数据
   */
  static invalidParams(message = "Invalid params", data?: unknown) {
    return new AcpRequestError({
      code: -32602,
      errorMessage: message,
      ...(data !== undefined ? { data } : {}),
    });
  }

  /**
   * 创建 JSON-RPC 内部错误（-32603）。
   *
   * @param message - 错误消息
   * @param data - 附加数据
   */
  static internalError(message = "Internal error", data?: unknown) {
    return new AcpRequestError({
      code: -32603,
      errorMessage: message,
      ...(data !== undefined ? { data } : {}),
    });
  }

  /**
   * 创建 ACP 认证必需错误（-32000）。
   *
   * @param message - 错误消息
   * @param data - 附加数据
   */
  static authRequired(message = "Authentication required", data?: unknown) {
    return new AcpRequestError({
      code: -32000,
      errorMessage: message,
      ...(data !== undefined ? { data } : {}),
    });
  }

  /**
   * 创建 ACP 资源未找到错误（-32002）。
   *
   * @param message - 错误消息
   * @param data - 附加数据
   */
  static resourceNotFound(message = "Resource not found", data?: unknown) {
    return new AcpRequestError({
      code: -32002,
      errorMessage: message,
      ...(data !== undefined ? { data } : {}),
    });
  }

  /**
   * 将当前错误转换为 ACP 协议层 Error 格式。
   *
   * @returns 符合协议定义的 Error 对象
   */
  toProtocolError() {
    return {
      code: this.code,
      message: this.errorMessage,
      ...(this.data !== undefined ? { data: this.data } : {}),
    } satisfies AcpSchema.Error;
  }
}

/**
 * ACP 所有错误的联合类型。
 *
 * 包含：请求错误、进程启动错误、进程退出错误、协议解析错误、传输错误。
 */
export const AcpError = Schema.Union([
  AcpRequestError,
  AcpSpawnError,
  AcpProcessExitedError,
  AcpProtocolParseError,
  AcpTransportError,
]);

/** ACP 错误联合类型的 TypeScript 类型 */
export type AcpError = typeof AcpError.Type;
