// @ts-nocheck
/**
 * @file ACP Client 实现模块
 * @description 实现 ACP（Agent Client Protocol）协议的 Client 端功能。
 *              Client 作为调用方，向 Agent 发送请求并处理 Agent 的回调。
 *              支持会话管理、文件操作、终端管理、权限请求等功能。
 *
 * @module client
 *
 * @remarks
 * **核心职责：**
 * - 建立与 Agent 的通信通道（通过 stdio）
 * - 管理 ACP 会话的完整生命周期（初始化、创建、加载、恢复、关闭等）
 * - 处理 Agent 向 Client 发起的请求（文件读写、终端操作、权限请求等）
 * - 支持协议扩展机制，允许自定义方法和通知
 *
 * @example
 * ```typescript
 * import { make, AcpClient } from './client';
 * import { Effect, Layer } from 'effect';
 *
 * // 创建 Client 实例
 * const clientEffect = make(stdio, {
 *   logIncoming: true,
 *   logOutgoing: false
 * });
 *
 * // 使用 Layer 方式（推荐用于依赖注入）
 * const clientLayer = layerChildProcess(childProcessHandle);
 * ```
 *
 * @see {@link https://agentclientprotocol.com/|ACP 协议规范}
 */

import * as Effect from "effect/Effect";
import * as Stdio from "effect/Stdio";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { ServiceMap } from "effect";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcServer from "effect/unstable/rpc/RpcServer";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as AcpError from "./errors.ts";
import * as AcpProtocol from "./protocol.ts";
import * as AcpRpcs from "./rpc.ts";
import * as AcpSchema from "./_generated/schema.gen.ts";
import { AGENT_METHODS, CLIENT_METHODS } from "./_generated/meta.gen.ts";
import {
  callRpc,
  decodeExtNotificationRegistration,
  decodeExtRequestRegistration,
  runHandler,
} from "./_internal/shared.ts";
import { makeChildStdio, makeTerminationError } from "./_internal/stdio.ts";

/**
 * ACP Client 配置选项接口
 *
 * @description 用于配置 Client 的行为，包括日志记录选项。
 *              这些选项在创建 Client 实例时传入，影响整个 Client 生命周期的行为。
 *
 * @remarks
 * **使用场景：**
 * - 开发调试时启用日志记录
 * - 生产环境可自定义日志记录器以集成监控系统
 *
 * @property logIncoming - 是否记录从 Agent 接收到的消息，默认为 false
 * @property logOutgoing - 是否记录发送给 Agent 的消息，默认为 false
 * @property logger - 自定义日志记录器函数，接收协议日志事件并返回 Effect
 *
 * @example
 * ```typescript
 * const options: AcpClientOptions = {
 *   logIncoming: true,
 *   logOutgoing: true,
 *   logger: (event) => Effect.sync(() => console.log('ACP Log:', event))
 * };
 * ```
 */
export interface AcpClientOptions {
  /**
   * 是否记录传入的消息
   * @description 启用后将记录所有从 Agent 接收到的请求、响应和通知
   */
  readonly logIncoming?: boolean;
  /**
   * 是否记录发出的消息
   * @description 启用后将记录所有发送给 Agent 的请求、响应和通知
   */
  readonly logOutgoing?: boolean;
  /**
   * 自定义日志记录器
   * @description 提供自定义的日志处理逻辑，可用于集成第三方日志库或监控系统
   * @param event - 协议日志事件，包含消息方向、方法名、参数等详细信息
   * @returns Effect 副作用，执行日志记录操作
   */
  readonly logger?: (event: AcpProtocol.AcpProtocolLogEvent) => Effect.Effect<void, never>;
}

/**
 * 原始客户端接口类型
 *
 * @description 提供底层的协议访问能力，允许直接操作 ACP 协议的原始功能。
 *              该接口主要用于需要绕过高层封装、直接处理协议消息的场景。
 *
 * @remarks
 * **使用场景：**
 * - 需要直接访问通知流进行自定义处理
 * - 需要发送未封装的扩展请求或通知
 * - 实现自定义的协议扩展功能
 *
 * @property notifications - 传入通知流，包含所有从 Agent 接收到的通知
 * @property request - 发送扩展请求的函数，返回 Agent 的响应或错误
 * @property notify - 发送扩展通知的函数，不期望返回值
 *
 * @example
 * ```typescript
 * const rawClient: AcpClientRaw = {
 *   notifications: notificationStream,
 *   request: (method, payload) => sendRequest(method, payload),
 *   notify: (method, payload) => sendNotification(method, payload)
 * };
 * ```
 */
type AcpClientRaw = {
  /**
   * 传入通知流
   * @description 包含所有从 Agent 接收到的 ACP 通知，可用于监听协议事件
   */
  readonly notifications: Stream.Stream<AcpProtocol.AcpIncomingNotification>;
  /**
   * 发送扩展请求
   * @description 向 Agent 发送自定义扩展请求，支持任意方法和参数
   * @param method - 请求方法名称
   * @param payload - 请求参数
   * @returns Effect，成功时返回响应结果，失败时返回 AcpError
   */
  readonly request: (method: string, payload: unknown) => Effect.Effect<unknown, AcpError.AcpError>;
  /**
   * 发送扩展通知
   * @description 向 Agent 发送自定义扩展通知，不期望返回值
   * @param method - 通知方法名称
   * @param payload - 通知参数
   * @returns Effect，失败时返回 AcpError
   */
  readonly notify: (method: string, payload: unknown) => Effect.Effect<void, AcpError.AcpError>;
};

/**
 * ACP Client 接口形状定义
 *
 * @description 定义了 Client 提供的所有功能，包括原始协议访问、Agent 操作和处理器注册。
 *              这是 Client 的完整 API 表面，包含了与 Agent 交互的所有方法。
 *
 * @remarks
 * **接口结构：**
 * - `raw`: 原始协议访问层，提供底层通信能力
 * - `agent`: Agent 操作层，封装了所有调用 Agent 的方法
 * - `handle*`: 处理器注册方法，用于处理 Agent 向 Client 发起的请求和通知
 *
 * **使用场景：**
 * - 作为依赖注入服务的具体实现类型
 * - 指导 Client 使用者了解可用的功能
 *
 * @example
 * ```typescript
 * const client: AcpClientShape = {
 *   raw: { notifications, request, notify },
 *   agent: { initialize, createSession, prompt, ... },
 *   handleRequestPermission: (handler) => registerHandler(handler),
 *   // ... 其他处理器注册方法
 * };
 * ```
 */
export interface AcpClientShape {
  /**
   * 原始协议访问层
   * @description 提供底层的协议访问能力，用于直接操作 ACP 协议
   */
  readonly raw: AcpClientRaw;

  /**
   * Agent 操作层
   * @description 封装了 Client 调用 Agent 的所有方法，包括会话管理、认证、提示等核心功能
   */
  readonly agent: {
    /**
     * 初始化 ACP 会话并协商能力
     * @description 建立连接后的第一个调用，用于协商协议版本和支持的功能
     * @param payload - 初始化请求参数，包含客户端信息和支持的能力
     * @returns Effect，成功时返回初始化响应，包含 Agent 信息和支持的能力
     * @see https://agentclientprotocol.com/protocol/schema#initialize
     */
    readonly initialize: (
      payload: AcpSchema.InitializeRequest,
    ) => Effect.Effect<AcpSchema.InitializeResponse, AcpError.AcpError>;

    /**
     * 执行 ACP 认证
     * @description 当 Agent 要求认证时调用，完成身份验证流程
     * @param payload - 认证请求参数，包含认证所需的信息
     * @returns Effect，成功时返回认证响应
     * @see https://agentclientprotocol.com/protocol/schema#authenticate
     */
    readonly authenticate: (
      payload: AcpSchema.AuthenticateRequest,
    ) => Effect.Effect<AcpSchema.AuthenticateResponse, AcpError.AcpError>;

    /**
     * 登出当前 ACP 身份
     * @description 结束当前认证会话，清除认证状态
     * @param payload - 登出请求参数
     * @returns Effect，成功时返回登出响应
     * @see https://agentclientprotocol.com/protocol/schema#logout
     */
    readonly logout: (
      payload: AcpSchema.LogoutRequest,
    ) => Effect.Effect<AcpSchema.LogoutResponse, AcpError.AcpError>;

    /**
     * 启动新的 ACP 会话
     * @description 创建一个新的会话，开始与 Agent 的交互
     * @param payload - 新会话请求参数，包含会话配置
     * @returns Effect，成功时返回新会话的 ID 和初始状态
     * @see https://agentclientprotocol.com/protocol/schema#session/new
     */
    readonly createSession: (
      payload: AcpSchema.NewSessionRequest,
    ) => Effect.Effect<AcpSchema.NewSessionResponse, AcpError.AcpError>;

    /**
     * 加载之前保存的 ACP 会话
     * @description 恢复之前保存的会话状态，继续之前的交互
     * @param payload - 加载会话请求参数，包含会话 ID
     * @returns Effect，成功时返回加载的会话状态
     * @see https://agentclientprotocol.com/protocol/schema#session/load
     */
    readonly loadSession: (
      payload: AcpSchema.LoadSessionRequest,
    ) => Effect.Effect<AcpSchema.LoadSessionResponse, AcpError.AcpError>;

    /**
     * 列出可用的 ACP 会话
     * @description 获取所有可用会话的列表，用于会话管理界面
     * @param payload - 列出会话请求参数，可包含过滤条件
     * @returns Effect，成功时返回会话列表
     * @see https://agentclientprotocol.com/protocol/schema#session/list
     */
    readonly listSessions: (
      payload: AcpSchema.ListSessionsRequest,
    ) => Effect.Effect<AcpSchema.ListSessionsResponse, AcpError.AcpError>;

    /**
     * 分叉 ACP 会话
     * @description 基于现有会话创建一个新的分支，用于并行探索不同的交互路径
     * @param payload - 分叉会话请求参数，包含源会话 ID
     * @returns Effect，成功时返回新分叉会话的信息
     * @see https://agentclientprotocol.com/protocol/schema#session/fork
     */
    readonly forkSession: (
      payload: AcpSchema.ForkSessionRequest,
    ) => Effect.Effect<AcpSchema.ForkSessionResponse, AcpError.AcpError>;

    /**
     * 恢复 ACP 会话
     * @description 恢复之前暂停的会话，继续交互
     * @param payload - 恢复会话请求参数，包含会话 ID
     * @returns Effect，成功时返回恢复的会话状态
     * @see https://agentclientprotocol.com/protocol/schema#session/resume
     */
    readonly resumeSession: (
      payload: AcpSchema.ResumeSessionRequest,
    ) => Effect.Effect<AcpSchema.ResumeSessionResponse, AcpError.AcpError>;

    /**
     * 关闭 ACP 会话
     * @description 结束会话，释放相关资源
     * @param payload - 关闭会话请求参数，包含会话 ID
     * @returns Effect，成功时返回关闭确认
     * @see https://agentclientprotocol.com/protocol/schema#session/close
     */
    readonly closeSession: (
      payload: AcpSchema.CloseSessionRequest,
    ) => Effect.Effect<AcpSchema.CloseSessionResponse, AcpError.AcpError>;

    /**
     * 选择会话的活动模型
     * @description 切换会话使用的 AI 模型
     * @param payload - 设置会话模型请求参数，包含模型标识
     * @returns Effect，成功时返回设置确认
     * @see https://agentclientprotocol.com/protocol/schema#session/set_model
     */
    readonly setSessionModel: (
      payload: AcpSchema.SetSessionModelRequest,
    ) => Effect.Effect<AcpSchema.SetSessionModelResponse, AcpError.AcpError>;

    /**
     * 更新会话配置选项
     * @description 修改会话的配置参数，如温度、最大 token 数等
     * @param payload - 设置会话配置选项请求参数
     * @returns Effect，成功时返回设置确认
     * @see https://agentclientprotocol.com/protocol/schema#session/set_config_option
     */
    readonly setSessionConfigOption: (
      payload: AcpSchema.SetSessionConfigOptionRequest,
    ) => Effect.Effect<AcpSchema.SetSessionConfigOptionResponse, AcpError.AcpError>;

    /**
     * 向 Agent 发送提示轮次
     * @description 向 Agent 发送用户输入，触发 Agent 的响应
     * @param payload - 提示请求参数，包含用户消息和上下文
     * @returns Effect，成功时返回 Agent 的响应
     * @see https://agentclientprotocol.com/protocol/schema#session/prompt
     */
    readonly prompt: (
      payload: AcpSchema.PromptRequest,
    ) => Effect.Effect<AcpSchema.PromptResponse, AcpError.AcpError>;

    /**
     * 发送真实的 ACP `session/cancel` 通知
     * @description 取消正在进行的会话操作
     * @param payload - 取消通知参数，包含会话 ID
     * @returns Effect，不返回值，仅发送通知
     * @see https://agentclientprotocol.com/protocol/schema#session/cancel
     */
    readonly cancel: (
      payload: AcpSchema.CancelNotification,
    ) => Effect.Effect<void, AcpError.AcpError>;
  };

  /**
   * 注册权限请求处理器
   * @description 处理 Agent 向 Client 请求权限的操作，如执行危险操作前的确认
   * @param handler - 权限请求处理函数，接收权限请求并返回用户的选择
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#session/request_permission
   */
  readonly handleRequestPermission: (
    handler: (
      request: AcpSchema.RequestPermissionRequest,
    ) => Effect.Effect<AcpSchema.RequestPermissionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册引导请求处理器
   * @description 处理 Agent 向 Client 请求结构化用户输入的操作
   * @param handler - 引导请求处理函数，接收引导请求并返回用户输入
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#session/elicitation
   */
  readonly handleElicitation: (
    handler: (
      request: AcpSchema.ElicitationRequest,
    ) => Effect.Effect<AcpSchema.ElicitationResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册读取文本文件处理器
   * @description 处理 Agent 请求读取文件内容的操作
   * @param handler - 文件读取处理函数，接收文件路径并返回文件内容
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#fs/read_text_file
   */
  readonly handleReadTextFile: (
    handler: (
      request: AcpSchema.ReadTextFileRequest,
    ) => Effect.Effect<AcpSchema.ReadTextFileResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册写入文本文件处理器
   * @description 处理 Agent 请求写入文件内容的操作
   * @param handler - 文件写入处理函数，接收文件路径和内容并执行写入
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#fs/write_text_file
   */
  readonly handleWriteTextFile: (
    handler: (
      request: AcpSchema.WriteTextFileRequest,
    ) => Effect.Effect<AcpSchema.WriteTextFileResponse | void, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册创建终端处理器
   * @description 处理 Agent 请求创建终端的操作
   * @param handler - 终端创建处理函数，接收终端配置并返回终端 ID
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#terminal/create
   */
  readonly handleCreateTerminal: (
    handler: (
      request: AcpSchema.CreateTerminalRequest,
    ) => Effect.Effect<AcpSchema.CreateTerminalResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册终端输出处理器
   * @description 处理 Agent 请求获取终端输出的操作
   * @param handler - 终端输出处理函数，接收终端 ID 并返回输出内容
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#terminal/output
   */
  readonly handleTerminalOutput: (
    handler: (
      request: AcpSchema.TerminalOutputRequest,
    ) => Effect.Effect<AcpSchema.TerminalOutputResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册等待终端退出处理器
   * @description 处理 Agent 请求等待终端退出的操作
   * @param handler - 等待终端退出处理函数，接收终端 ID 并返回退出状态
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#terminal/wait_for_exit
   */
  readonly handleTerminalWaitForExit: (
    handler: (
      request: AcpSchema.WaitForTerminalExitRequest,
    ) => Effect.Effect<AcpSchema.WaitForTerminalExitResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册终止终端处理器
   * @description 处理 Agent 请求终止终端的操作
   * @param handler - 终止终端处理函数，接收终端 ID 并执行终止
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#terminal/kill
   */
  readonly handleTerminalKill: (
    handler: (
      request: AcpSchema.KillTerminalRequest,
    ) => Effect.Effect<AcpSchema.KillTerminalResponse | void, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册释放终端处理器
   * @description 处理 Agent 请求释放终端资源的操作
   * @param handler - 释放终端处理函数，接收终端 ID 并释放资源
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#terminal/release
   */
  readonly handleTerminalRelease: (
    handler: (
      request: AcpSchema.ReleaseTerminalRequest,
    ) => Effect.Effect<AcpSchema.ReleaseTerminalResponse | void, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册会话更新通知处理器
   * @description 处理 Agent 发送的会话状态更新通知
   * @param handler - 会话更新处理函数，接收会话通知并处理
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#session/update
   */
  readonly handleSessionUpdate: (
    handler: (
      notification: AcpSchema.SessionNotification,
    ) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册引导完成通知处理器
   * @description 处理 Agent 发送的引导完成通知
   * @param handler - 引导完成处理函数，接收通知并处理
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#session/elicitation/complete
   */
  readonly handleElicitationComplete: (
    handler: (
      notification: AcpSchema.ElicitationCompleteNotification,
    ) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册回退扩展请求处理器
   * @description 处理未注册的扩展请求，作为默认处理器
   * @param handler - 扩展请求处理函数，接收方法名和参数并返回响应
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/extensibility
   */
  readonly handleUnknownExtRequest: (
    handler: (method: string, params: unknown) => Effect.Effect<unknown, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册回退扩展通知处理器
   * @description 处理未注册的扩展通知，作为默认处理器
   * @param handler - 扩展通知处理函数，接收方法名和参数并处理
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/extensibility
   */
  readonly handleUnknownExtNotification: (
    handler: (method: string, params: unknown) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册类型化扩展请求处理器
   * @description 注册带有类型定义的扩展请求处理器，提供类型安全
   * @typeParam A - 解码后的参数类型
   * @typeParam I - 编码后的参数类型
   * @param method - 扩展方法名称
   * @param payload - 参数的 Schema 编解码器
   * @param handler - 扩展请求处理函数，接收解码后的参数并返回响应
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/extensibility
   */
  readonly handleExtRequest: <A, I>(
    method: string,
    payload: Schema.Codec<A, I>,
    handler: (payload: A) => Effect.Effect<unknown, AcpError.AcpError>,
  ) => Effect.Effect<void>;

  /**
   * 注册类型化扩展通知处理器
   * @description 注册带有类型定义的扩展通知处理器，提供类型安全
   * @typeParam A - 解码后的参数类型
   * @typeParam I - 编码后的参数类型
   * @param method - 扩展方法名称
   * @param payload - 参数的 Schema 编解码器
   * @param handler - 扩展通知处理函数，接收解码后的参数并处理
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/extensibility
   */
  readonly handleExtNotification: <A, I>(
    method: string,
    payload: Schema.Codec<A, I>,
    handler: (payload: A) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;
}

/**
 * ACP Client 服务类
 *
 * @description Effect ServiceMap 服务定义，用于依赖注入系统。
 *              该类定义了 AcpClient 服务的标识符和接口形状，
 *              允许在 Effect 应用中通过依赖注入的方式使用 Client 功能。
 *
 * @remarks
 * **使用场景：**
 * - 在 Effect 应用中注册 Client 服务
 * - 通过 `Effect.service(AcpClient)` 获取 Client 实例
 * - 在 Layer 组合中提供 Client 依赖
 *
 * @example
 * ```typescript
 * import { AcpClient } from './client';
 * import { Effect } from 'effect';
 *
 * // 在 Effect 中获取 Client 服务
 * const program = Effect.flatMap(Effect.service(AcpClient), (client) => {
 *   return client.agent.initialize({ ... });
 * });
 * ```
 *
 * @public
 */
export class AcpClient extends ServiceMap.Service<AcpClient, AcpClientShape>()(
  "effect-acp/client/AcpClient",
) {}

/**
 * Client 核心请求处理器集合接口
 *
 * @description 内部使用，存储所有核心方法的处理器函数。
 *              每个字段对应一个 ACP 协议方法，处理器在注册前为 undefined。
 *
 * @remarks
 * **设计说明：**
 * - 所有字段都是可选的，允许按需注册处理器
 * - 处理器注册后，当收到对应请求时会被调用
 * - 未注册处理器的请求会返回错误
 *
 * @internal
 */
interface AcpCoreRequestHandlers {
  /** 权限请求处理器，处理 Agent 的权限请求 */
  requestPermission?: (
    request: AcpSchema.RequestPermissionRequest,
  ) => Effect.Effect<AcpSchema.RequestPermissionResponse, AcpError.AcpError>;
  /** 引导请求处理器，处理 Agent 的用户输入引导请求 */
  elicitation?: (
    request: AcpSchema.ElicitationRequest,
  ) => Effect.Effect<AcpSchema.ElicitationResponse, AcpError.AcpError>;
  /** 文本文件读取处理器 */
  readTextFile?: (
    request: AcpSchema.ReadTextFileRequest,
  ) => Effect.Effect<AcpSchema.ReadTextFileResponse, AcpError.AcpError>;
  /** 文本文件写入处理器 */
  writeTextFile?: (
    request: AcpSchema.WriteTextFileRequest,
  ) => Effect.Effect<AcpSchema.WriteTextFileResponse | void, AcpError.AcpError>;
  /** 终端创建处理器 */
  createTerminal?: (
    request: AcpSchema.CreateTerminalRequest,
  ) => Effect.Effect<AcpSchema.CreateTerminalResponse, AcpError.AcpError>;
  /** 终端输出获取处理器 */
  terminalOutput?: (
    request: AcpSchema.TerminalOutputRequest,
  ) => Effect.Effect<AcpSchema.TerminalOutputResponse, AcpError.AcpError>;
  /** 终端退出等待处理器 */
  terminalWaitForExit?: (
    request: AcpSchema.WaitForTerminalExitRequest,
  ) => Effect.Effect<AcpSchema.WaitForTerminalExitResponse, AcpError.AcpError>;
  /** 终端终止处理器 */
  terminalKill?: (
    request: AcpSchema.KillTerminalRequest,
  ) => Effect.Effect<AcpSchema.KillTerminalResponse | void, AcpError.AcpError>;
  /** 终端资源释放处理器 */
  terminalRelease?: (
    request: AcpSchema.ReleaseTerminalRequest,
  ) => Effect.Effect<AcpSchema.ReleaseTerminalResponse | void, AcpError.AcpError>;
}

/**
 * 通知处理器集合接口
 *
 * @description 存储会话更新和引导完成通知的处理器。
 *              每种通知类型都使用带缓冲的处理器，支持在处理器注册前缓冲通知。
 *
 * @internal
 */
interface AcpNotificationHandlers {
  /** 会话更新通知处理器，处理会话状态变更通知 */
  readonly sessionUpdate: BufferedNotificationHandler<AcpSchema.SessionNotification>;
  /** 引导完成通知处理器，处理用户输入引导完成通知 */
  readonly elicitationComplete: BufferedNotificationHandler<AcpSchema.ElicitationCompleteNotification>;
}

/**
 * 带缓冲的通知处理器接口
 *
 * @description 支持在处理器注册前缓冲通知，确保不丢失早期通知。
 *              当第一个处理器注册后，缓冲的通知会被立即处理。
 *
 * @typeParam A - 通知参数的类型
 *
 * @remarks
 * **设计动机：**
 * - 在 Client 初始化阶段，通知可能在处理器注册前到达
 * - 缓冲机制确保这些通知不会丢失
 * - 处理器注册后立即处理所有缓冲的通知
 *
 * @internal
 */
interface BufferedNotificationHandler<A> {
  /** 已注册的处理器列表，支持多个处理器同时监听同一通知 */
  readonly handlers: Array<(notification: A) => Effect.Effect<void, AcpError.AcpError>>;
  /** 待处理的通知队列，在处理器注册前缓冲到达的通知 */
  readonly pending: Array<A>;
}

/**
 * 创建 ACP Client 实例
 *
 * @description 工厂函数，创建并初始化一个完整的 ACP Client，包括协议传输层、RPC 客户端/服务端、
 *              处理器注册等所有功能。
 *
 * @remarks
 * **初始化流程：**
 * 1. 创建协议传输层，建立与 Agent 的通信通道
 * 2. 创建 RPC 服务端，处理 Agent 向 Client 发起的请求
 * 3. 创建 RPC 客户端，用于调用 Agent 端的方法
 * 4. 返回完整的 Client 接口实现
 *
 * **生命周期管理：**
 * - 使用 Scope 管理资源，确保连接正确关闭
 * - 支持子进程终止错误的处理
 *
 * @param stdio - 标准输入输出接口，用于与 Agent 进程通信
 * @param options - Client 配置选项，控制日志记录等行为
 * @param terminationError - 终止错误 Effect（可选），当子进程异常终止时产生的错误
 * @returns 包含所有 Client 功能的 Effect，需要 Scope 来管理生命周期
 *
 * @example
 * ```typescript
 * const clientEffect = make(stdio, {
 *   logIncoming: true,
 *   logOutgoing: false
 * });
 *
 * // 在 Scope 中运行
 * Effect.runPromise(
 *   Effect.scoped(
 *     Effect.flatMap(clientEffect, (client) => {
 *       return client.agent.initialize({ ... });
 *     })
 *   )
 * );
 * ```
 *
 * @public
 */
export const make = Effect.fn("effect-acp/AcpClient.make")(function* (
  stdio: Stdio.Stdio,
  options: AcpClientOptions = {},
  terminationError?: Effect.Effect<AcpError.AcpError>,
): Effect.fn.Return<AcpClientShape, never, Scope.Scope> {
  // 核心处理器存储，用于保存所有已注册的请求处理器
  const coreHandlers: AcpCoreRequestHandlers = {};

  // 通知处理器存储，使用带缓冲的处理器确保不丢失早期通知
  const notificationHandlers: AcpNotificationHandlers = {
    sessionUpdate: { handlers: [], pending: [] },
    elicitationComplete: { handlers: [], pending: [] },
  };

  // 扩展请求处理器映射，key 为方法名，value 为对应的处理函数
  const extRequestHandlers = new Map<
    string,
    (params: unknown) => Effect.Effect<unknown, AcpError.AcpError>
  >();

  // 扩展通知处理器映射，key 为方法名，value 为对应的处理函数
  const extNotificationHandlers = new Map<
    string,
    (params: unknown) => Effect.Effect<void, AcpError.AcpError>
  >();

  // 未知扩展请求处理器，作为后备处理器处理未注册的扩展请求
  let unknownExtRequestHandler:
    | ((method: string, params: unknown) => Effect.Effect<unknown, AcpError.AcpError>)
    | undefined;

  // 未知扩展通知处理器，作为后备处理器处理未注册的扩展通知
  let unknownExtNotificationHandler:
    | ((method: string, params: unknown) => Effect.Effect<void, AcpError.AcpError>)
    | undefined;

  /**
   * 运行通知处理器
   *
   * @description 执行所有注册的通知处理器，忽略单个处理器的错误以确保其他处理器继续执行。
   *
   * @typeParam A - 通知参数的类型
   * @param registration - 带缓冲的通知处理器实例
   * @param notification - 要处理的通知数据
   * @returns Effect，执行所有处理器后返回 void
   *
   * @internal
   */
  const runNotificationHandlers = <A>(
    registration: BufferedNotificationHandler<A>,
    notification: A,
  ) =>
    Effect.forEach(
      registration.handlers,
      (handler) => handler(notification).pipe(Effect.catch(() => Effect.void)),
      { discard: true },
    );

  /**
   * 刷新缓冲的通知
   *
   * @description 当处理器注册后，处理之前缓冲的通知。
   *              确保在处理器注册前到达的通知不会丢失。
   *
   * @typeParam A - 通知参数的类型
   * @param registration - 带缓冲的通知处理器实例
   * @returns Effect，处理所有缓冲通知后返回 void
   *
   * @internal
   */
  const flushBufferedNotifications = <A>(registration: BufferedNotificationHandler<A>) =>
    Effect.suspend(() => {
      // 如果没有处理器或没有缓冲的通知，直接返回
      if (registration.handlers.length === 0 || registration.pending.length === 0) {
        return Effect.void;
      }
      // 取出所有缓冲的通知并清空队列
      const pending = registration.pending.splice(0, registration.pending.length);
      // 依次处理所有缓冲的通知
      return Effect.forEach(
        pending,
        (notification) => runNotificationHandlers(registration, notification),
        {
          discard: true,
        },
      );
    });

  /**
   * 分发通知
   *
   * @description 根据通知类型分发到相应的处理器。
   *              支持三种通知类型：会话更新、引导完成、扩展通知。
   *
   * @param notification - 传入的 ACP 通知
   * @returns Effect，处理通知后返回 void
   *
   * @internal
   */
  const dispatchNotification = (notification: AcpProtocol.AcpIncomingNotification) => {
    switch (notification._tag) {
      case "SessionUpdate": {
        // 如果没有处理器，缓冲通知等待后续处理
        if (notificationHandlers.sessionUpdate.handlers.length === 0) {
          notificationHandlers.sessionUpdate.pending.push(notification.params);
          return Effect.void;
        }
        // 有处理器时立即执行
        return runNotificationHandlers(notificationHandlers.sessionUpdate, notification.params);
      }
      case "ElicitationComplete": {
        // 如果没有处理器，缓冲通知等待后续处理
        if (notificationHandlers.elicitationComplete.handlers.length === 0) {
          notificationHandlers.elicitationComplete.pending.push(notification.params);
          return Effect.void;
        }
        // 有处理器时立即执行
        return runNotificationHandlers(
          notificationHandlers.elicitationComplete,
          notification.params,
        );
      }
      case "ExtNotification": {
        // 查找并执行特定方法的扩展通知处理器
        const handler = extNotificationHandlers.get(notification.method);
        if (handler) {
          return handler(notification.params);
        }
        // 使用未知扩展通知处理器作为后备
        return unknownExtNotificationHandler
          ? unknownExtNotificationHandler(notification.method, notification.params)
          : Effect.void;
      }
    }
  };

  /**
   * 分发扩展请求
   *
   * @description 查找并执行扩展请求处理器。
   *              如果找不到特定方法的处理器，使用未知扩展请求处理器作为后备。
   *
   * @param method - 请求方法名称
   * @param params - 请求参数
   * @returns Effect，成功时返回响应结果，失败时返回 AcpError
   *
   * @internal
   */
  const dispatchExtRequest = (method: string, params: unknown) => {
    // 查找特定方法的处理器
    const handler = extRequestHandlers.get(method);
    if (handler) {
      return handler(params);
    }
    // 使用未知扩展请求处理器作为后备
    return unknownExtRequestHandler
      ? unknownExtRequestHandler(method, params)
      : Effect.fail(AcpError.AcpRequestError.methodNotFound(method));
  };

  // 创建协议传输层，建立与 Agent 的通信通道
  const transport = yield* AcpProtocol.makeAcpPatchedProtocol({
    stdio: stdio,
    ...(terminationError ? { terminationError } : {}),
    serverRequestMethods: new Set(AcpRpcs.ClientRpcs.requests.keys()),
    ...(options.logIncoming !== undefined ? { logIncoming: options.logIncoming } : {}),
    ...(options.logOutgoing !== undefined ? { logOutgoing: options.logOutgoing } : {}),
    ...(options.logger ? { logger: options.logger } : {}),
    onNotification: dispatchNotification,
    onExtRequest: dispatchExtRequest,
  });

  // 创建 Client RPC 处理器层，处理 Agent 向 Client 发起的 RPC 请求
  const clientHandlerLayer = AcpRpcs.ClientRpcs.toLayer(
    AcpRpcs.ClientRpcs.of({
      [CLIENT_METHODS.session_request_permission]: (payload) =>
        runHandler(
          coreHandlers.requestPermission,
          payload,
          CLIENT_METHODS.session_request_permission,
        ),
      [CLIENT_METHODS.session_elicitation]: (payload) =>
        runHandler(coreHandlers.elicitation, payload, CLIENT_METHODS.session_elicitation),
      [CLIENT_METHODS.fs_read_text_file]: (payload) =>
        runHandler(coreHandlers.readTextFile, payload, CLIENT_METHODS.fs_read_text_file),
      [CLIENT_METHODS.fs_write_text_file]: (payload) =>
        runHandler(coreHandlers.writeTextFile, payload, CLIENT_METHODS.fs_write_text_file).pipe(
          // 处理器可能返回 void（无响应体），但 RPC 框架要求响应必须为对象，
          // 因此将 void 统一转换为空对象以满足协议要求
          Effect.map((result) => result ?? {}),
        ),
      [CLIENT_METHODS.terminal_create]: (payload) =>
        runHandler(coreHandlers.createTerminal, payload, CLIENT_METHODS.terminal_create),
      [CLIENT_METHODS.terminal_output]: (payload) =>
        runHandler(coreHandlers.terminalOutput, payload, CLIENT_METHODS.terminal_output),
      [CLIENT_METHODS.terminal_wait_for_exit]: (payload) =>
        runHandler(
          coreHandlers.terminalWaitForExit,
          payload,
          CLIENT_METHODS.terminal_wait_for_exit,
        ),
      [CLIENT_METHODS.terminal_kill]: (payload) =>
        runHandler(coreHandlers.terminalKill, payload, CLIENT_METHODS.terminal_kill).pipe(
          // 处理器可能返回 void（无响应体），但 RPC 框架要求响应必须为对象，
          // 因此将 void 统一转换为空对象以满足协议要求
          Effect.map((result) => result ?? {}),
        ),
      [CLIENT_METHODS.terminal_release]: (payload) =>
        runHandler(coreHandlers.terminalRelease, payload, CLIENT_METHODS.terminal_release).pipe(
          // 处理器可能返回 void（无响应体），但 RPC 框架要求响应必须为对象，
          // 因此将 void 统一转换为空对象以满足协议要求
          Effect.map((result) => result ?? {}),
        ),
    }),
  );

  // 启动 RPC 服务端，处理来自 Agent 的请求
  yield* RpcServer.make(AcpRpcs.ClientRpcs).pipe(
    Effect.provideService(RpcServer.Protocol, transport.serverProtocol),
    Effect.provide(clientHandlerLayer),
    Effect.forkScoped,
  );

  // 创建 RPC 客户端（用于调用 Agent 端方法）
  // 使用大整数作为请求 ID 起始值，避免与 Agent 端的请求 ID 冲突
  let nextRpcRequestId = 1n << 32n;
  const rpc = yield* RpcClient.make(AcpRpcs.AgentRpcs, {
    generateRequestId: () => nextRpcRequestId++ as never,
  }).pipe(Effect.provideService(RpcClient.Protocol, transport.clientProtocol));

  // 返回 Client 接口实现，包含原始协议访问、Agent 操作和处理器注册方法
  return {
    // 原始协议访问层
    raw: {
      notifications: transport.incoming,
      request: transport.request,
      notify: transport.notify,
    },
    // Agent 操作层，封装所有调用 Agent 的方法
    agent: {
      initialize: (payload) => callRpc(rpc[AGENT_METHODS.initialize](payload)),
      authenticate: (payload) => callRpc(rpc[AGENT_METHODS.authenticate](payload)),
      logout: (payload) => callRpc(rpc[AGENT_METHODS.logout](payload)),
      createSession: (payload) => callRpc(rpc[AGENT_METHODS.session_new](payload)),
      loadSession: (payload) => callRpc(rpc[AGENT_METHODS.session_load](payload)),
      listSessions: (payload) => callRpc(rpc[AGENT_METHODS.session_list](payload)),
      forkSession: (payload) => callRpc(rpc[AGENT_METHODS.session_fork](payload)),
      resumeSession: (payload) => callRpc(rpc[AGENT_METHODS.session_resume](payload)),
      closeSession: (payload) => callRpc(rpc[AGENT_METHODS.session_close](payload)),
      setSessionModel: (payload) => callRpc(rpc[AGENT_METHODS.session_set_model](payload)),
      setSessionConfigOption: (payload) =>
        callRpc(rpc[AGENT_METHODS.session_set_config_option](payload)),
      prompt: (payload) => callRpc(rpc[AGENT_METHODS.session_prompt](payload)),
      cancel: (payload) => transport.notify(AGENT_METHODS.session_cancel, payload),
    },
    // 处理器注册方法
    // 使用 Effect.suspend 延迟执行赋值操作，确保处理器注册在 Effect 运行时才执行，
    // 而非在构建时立即执行，从而与 Effect 的惰性求值语义保持一致
    handleRequestPermission: (handler) =>
      Effect.suspend(() => {
        coreHandlers.requestPermission = handler;
        return Effect.void;
      }),
    handleElicitation: (handler) =>
      Effect.suspend(() => {
        coreHandlers.elicitation = handler;
        return Effect.void;
      }),
    handleReadTextFile: (handler) =>
      Effect.suspend(() => {
        coreHandlers.readTextFile = handler;
        return Effect.void;
      }),
    handleWriteTextFile: (handler) =>
      Effect.suspend(() => {
        coreHandlers.writeTextFile = handler;
        return Effect.void;
      }),
    handleCreateTerminal: (handler) =>
      Effect.suspend(() => {
        coreHandlers.createTerminal = handler;
        return Effect.void;
      }),
    handleTerminalOutput: (handler) =>
      Effect.suspend(() => {
        coreHandlers.terminalOutput = handler;
        return Effect.void;
      }),
    handleTerminalWaitForExit: (handler) =>
      Effect.suspend(() => {
        coreHandlers.terminalWaitForExit = handler;
        return Effect.void;
      }),
    handleTerminalKill: (handler) =>
      Effect.suspend(() => {
        coreHandlers.terminalKill = handler;
        return Effect.void;
      }),
    handleTerminalRelease: (handler) =>
      Effect.suspend(() => {
        coreHandlers.terminalRelease = handler;
        return Effect.void;
      }),
    // 通知处理器支持多个监听者，注册后立即刷新缓冲的早期通知
    handleSessionUpdate: (handler) =>
      Effect.suspend(() => {
        notificationHandlers.sessionUpdate.handlers.push(handler);
        return flushBufferedNotifications(notificationHandlers.sessionUpdate);
      }),
    handleElicitationComplete: (handler) =>
      Effect.suspend(() => {
        notificationHandlers.elicitationComplete.handlers.push(handler);
        return flushBufferedNotifications(notificationHandlers.elicitationComplete);
      }),
    handleUnknownExtRequest: (handler) =>
      Effect.suspend(() => {
        unknownExtRequestHandler = handler;
        return Effect.void;
      }),
    handleUnknownExtNotification: (handler) =>
      Effect.suspend(() => {
        unknownExtNotificationHandler = handler;
        return Effect.void;
      }),
    handleExtRequest: (method, payload, handler) =>
      Effect.suspend(() => {
        extRequestHandlers.set(method, decodeExtRequestRegistration(method, payload, handler));
        return Effect.void;
      }),
    handleExtNotification: (method, payload, handler) =>
      Effect.suspend(() => {
        extNotificationHandlers.set(
          method,
          decodeExtNotificationRegistration(method, payload, handler),
        );
        return Effect.void;
      }),
  // 使用 satisfies 确保返回值严格符合 AcpClientShape 接口定义，
  // 在编译期捕获接口不匹配的错误，同时保留字面量类型信息
  } satisfies AcpClientShape;
});

/**
 * 创建子进程 Client Layer
 *
 * @description 创建用于依赖注入的 Layer，从子进程句柄创建 stdio 并初始化 Client。
 *              该函数封装了子进程模式的 Client 创建流程，自动处理子进程的 stdio 连接
 *              和异常终止错误，是最常用的 Client Layer 创建方式。
 *
 * @remarks
 * **使用场景：**
 * - 当 Client 需要通过子进程与 Agent 通信时
 * - 自动处理子进程异常终止的情况，将终止信号转换为 AcpError
 *
 * **与 `make` 的区别：**
 * - `make` 需要手动传入 stdio 和 terminationError
 * - `layerChildProcess` 自动从子进程句柄获取 stdio 并构建终止错误
 *
 * @param handle - 子进程句柄，提供与子进程通信的输入输出流
 * @param options - Client 配置选项，控制日志记录等行为
 * @returns Client Layer，提供 AcpClient 服务
 *
 * @example
 * ```typescript
 * import { layerChildProcess } from './client';
 * import { Effect, Layer } from 'effect';
 *
 * // 创建基于子进程的 Client Layer
 * const clientLayer = layerChildProcess(childProcessHandle, {
 *   logIncoming: true
 * });
 *
 * // 在应用中使用
 * const app = Effect.provide(myProgram, clientLayer);
 * ```
 *
 * @public
 */
export const layerChildProcess = (
  handle: ChildProcessSpawner.ChildProcessHandle,
  options: AcpClientOptions = {},
): Layer.Layer<AcpClient> => {
  const stdio = makeChildStdio(handle);
  const terminationError = makeTerminationError(handle);
  return Layer.effect(AcpClient, make(stdio, options, terminationError));
};
