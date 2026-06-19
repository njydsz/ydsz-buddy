/**
 * @file ACP Agent 实现模块
 * @description 实现 ACP（Agent Client Protocol）协议的 Agent 端功能。
 *              Agent 作为服务端，接收来自 Client 的请求并处理会话管理、认证、提示等核心功能。
 *              同时 Agent 也可以向 Client 发送请求（如读取文件、创建终端等）。
 *
 * @module agent
 *
 * @remarks
 * **核心职责：**
 * - 建立与 Client 的通信通道（通过 stdio）
 * - 处理 Client 发起的会话管理请求（初始化、创建、加载、恢复、关闭等）
 * - 处理 Client 发起的认证和提示请求
 * - 向 Client 发起文件操作、终端操作等请求
 * - 支持协议扩展机制，允许自定义方法和通知
 *
 * **架构设计：**
 * - Agent 同时扮演 RPC 服务端和客户端两个角色
 * - 作为服务端：处理 Client 发起的会话管理、认证等请求
 * - 作为客户端：向 Client 发起文件读写、终端操作等请求
 * - 使用 Effect 的依赖注入系统管理服务生命周期
 *
 * @example
 * ```typescript
 * import { make, AcpAgent } from './agent';
 * import { Effect, Layer } from 'effect';
 *
 * // 创建 Agent 实例
 * const agentEffect = make(stdio, {
 *   logIncoming: true,
 *   logOutgoing: false
 * });
 *
 * // 使用 Layer 方式（推荐用于依赖注入）
 * const agentLayer = layer(stdio);
 *
 * // 或者从 Stdio 服务获取
 * const agentLayerFromService = layerStdio();
 * ```
 *
 * @see {@link https://agentclientprotocol.com/|ACP 协议规范}
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as Stdio from "effect/Stdio";
import { ServiceMap } from "effect";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import * as AcpSchema from "./_generated/schema.gen.ts";
import { AGENT_METHODS, CLIENT_METHODS } from "./_generated/meta.gen.ts";
import * as AcpError from "./errors.ts";
import * as AcpProtocol from "./protocol.ts";
import * as AcpRpcs from "./rpc.ts";
import {
  callRpc,
  decodeExtNotificationRegistration,
  decodeExtRequestRegistration,
  runHandler,
} from "./_internal/shared.ts";
import * as AcpTerminal from "./terminal.ts";

/**
 * ACP Agent 配置选项接口
 *
 * @description 用于配置 Agent 的行为，包括日志记录选项。
 *              这些选项在创建 Agent 实例时传入，影响整个 Agent 生命周期的行为。
 *
 * @remarks
 * **使用场景：**
 * - 开发调试时启用日志记录
 * - 生产环境可自定义日志记录器以集成监控系统
 *
 * @property logIncoming - 是否记录从 Client 接收到的消息，默认为 false
 * @property logOutgoing - 是否记录发送给 Client 的消息，默认为 false
 * @property logger - 自定义日志记录器函数，接收协议日志事件并返回 Effect
 *
 * @example
 * ```typescript
 * const options: AcpAgentOptions = {
 *   logIncoming: true,
 *   logOutgoing: true,
 *   logger: (event) => Effect.sync(() => console.log('ACP Log:', event))
 * };
 * ```
 */
export interface AcpAgentOptions {
  /**
   * 是否记录传入的消息
   * @description 启用后将记录所有从 Client 接收到的请求、响应和通知
   */
  readonly logIncoming?: boolean;
  /**
   * 是否记录发出的消息
   * @description 启用后将记录所有发送给 Client 的请求、响应和通知
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
 * ACP Agent 接口形状定义
 *
 * @description 定义了 Agent 提供的所有功能，包括原始协议访问、客户端操作和处理器注册。
 *              这是 Agent 的完整 API 表面，包含了与 Client 交互的所有方法。
 *
 * @remarks
 * **接口结构：**
 * - `raw`: 原始协议访问层，提供底层通信能力
 * - `client`: 客户端操作层，封装了所有调用 Client 的方法
 * - `handle*`: 处理器注册方法，用于处理 Client 发起的请求和通知
 *
 * **使用场景：**
 * - 作为依赖注入服务的具体实现类型
 * - 指导 Agent 使用者了解可用的功能
 *
 * @example
 * ```typescript
 * const agent: AcpAgentShape = {
 *   raw: { notifications, request, notify },
 *   client: { requestPermission, elicit, readTextFile, ... },
 *   handleInitialize: (handler) => registerHandler(handler),
 *   // ... 其他处理器注册方法
 * };
 * ```
 */
export interface AcpAgentShape {
  /**
   * 原始协议访问层
   * @description 提供底层的协议访问能力，用于直接操作 ACP 协议
   */
  readonly raw: {
    /**
     * 传入通知流
     * @description 包含所有从 Client 接收到的 ACP 通知，可用于监听协议事件
     */
    readonly notifications: Stream.Stream<AcpProtocol.AcpIncomingNotification>;
    /**
     * 发送通用 ACP 扩展请求
     * @description 向 Client 发送自定义扩展请求，支持任意方法和参数
     * @param method - 请求方法名称
     * @param payload - 请求参数
     * @returns Effect，成功时返回响应结果，失败时返回 AcpError
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly request: (
      method: string,
      payload: unknown,
    ) => Effect.Effect<unknown, AcpError.AcpError>;
    /**
     * 发送通用 ACP 扩展通知
     * @description 向 Client 发送自定义扩展通知，不期望返回值
     * @param method - 通知方法名称
     * @param payload - 通知参数
     * @returns Effect，失败时返回 AcpError
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly notify: (method: string, payload: unknown) => Effect.Effect<void, AcpError.AcpError>;
  };
  /**
   * 客户端操作层
   * @description 封装了 Agent 调用 Client 的所有方法，包括文件操作、终端操作、权限请求等
   */
  readonly client: {
    /**
     * 请求客户端权限
     * @description 向 Client 请求执行特定操作的权限
     * @param payload - 权限请求参数，包含请求的操作和原因
     * @returns Effect，成功时返回权限授予状态
     * @see https://agentclientprotocol.com/protocol/schema#session/request_permission
     */
    readonly requestPermission: (
      payload: AcpSchema.RequestPermissionRequest,
    ) => Effect.Effect<AcpSchema.RequestPermissionResponse, AcpError.AcpError>;
    /**
     * 请求客户端提供结构化用户输入
     * @description 向 Client 请求用户提供结构化的输入信息
     * @param payload - 引导请求参数，包含请求的输入类型和提示
     * @returns Effect，成功时返回用户提供的输入
     * @see https://agentclientprotocol.com/protocol/schema#session/elicitation
     */
    readonly elicit: (
      payload: AcpSchema.ElicitationRequest,
    ) => Effect.Effect<AcpSchema.ElicitationResponse, AcpError.AcpError>;
    /**
     * 从客户端请求文件内容
     * @description 请求 Client 读取指定文件的内容
     * @param payload - 文件读取请求参数，包含文件路径
     * @returns Effect，成功时返回文件内容
     * @see https://agentclientprotocol.com/protocol/schema#fs/read_text_file
     */
    readonly readTextFile: (
      payload: AcpSchema.ReadTextFileRequest,
    ) => Effect.Effect<AcpSchema.ReadTextFileResponse, AcpError.AcpError>;
    /**
     * 通过客户端写入文本文件
     * @description 请求 Client 将内容写入指定文件
     * @param payload - 文件写入请求参数，包含文件路径和内容
     * @returns Effect，成功时返回写入结果
     * @see https://agentclientprotocol.com/protocol/schema#fs/write_text_file
     */
    readonly writeTextFile: (
      payload: AcpSchema.WriteTextFileRequest,
    ) => Effect.Effect<AcpSchema.WriteTextFileResponse, AcpError.AcpError>;
    /**
     * 在客户端创建终端
     * @description 请求 Client 创建一个新的终端实例
     * @param payload - 终端创建请求参数，包含终端配置
     * @returns Effect，成功时返回终端对象，可用于后续操作
     * @see https://agentclientprotocol.com/protocol/schema#terminal/create
     */
    readonly createTerminal: (
      payload: AcpSchema.CreateTerminalRequest,
    ) => Effect.Effect<AcpTerminal.AcpTerminal, AcpError.AcpError>;
    /**
     * 向客户端发送会话更新通知
     * @description 通知 Client 会话状态已更新
     * @param payload - 会话通知参数，包含更新的状态信息
     * @returns Effect，不返回值，仅发送通知
     * @see https://agentclientprotocol.com/protocol/schema#session/update
     */
    readonly sessionUpdate: (
      payload: AcpSchema.SessionNotification,
    ) => Effect.Effect<void, AcpError.AcpError>;
    /**
     * 向客户端发送会话引导完成通知
     * @description 通知 Client 用户输入引导已完成
     * @param payload - 引导完成通知参数
     * @returns Effect，不返回值，仅发送通知
     * @see https://agentclientprotocol.com/protocol/schema#session/elicitation/complete
     */
    readonly elicitationComplete: (
      payload: AcpSchema.ElicitationCompleteNotification,
    ) => Effect.Effect<void, AcpError.AcpError>;
    /**
     * 向客户端发送 ACP 扩展请求
     * @description 发送自定义扩展请求到 Client
     * @param method - 扩展方法名称
     * @param payload - 请求参数
     * @returns Effect，成功时返回响应结果
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly extRequest: (
      method: string,
      payload: unknown,
    ) => Effect.Effect<unknown, AcpError.AcpError>;
    /**
     * 向客户端发送 ACP 扩展通知
     * @description 发送自定义扩展通知到 Client
     * @param method - 扩展方法名称
     * @param payload - 通知参数
     * @returns Effect，不返回值，仅发送通知
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly extNotification: (
      method: string,
      payload: unknown,
    ) => Effect.Effect<void, AcpError.AcpError>;
  };
  /**
   * 注册初始化处理器
   * @description 处理 Client 发起的初始化请求，协商协议版本和能力
   * @param handler - 初始化处理函数，接收初始化请求并返回响应
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#initialize
   */
  readonly handleInitialize: (
    handler: (
      request: AcpSchema.InitializeRequest,
    ) => Effect.Effect<AcpSchema.InitializeResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册认证处理器
   * @description 处理 Client 发起的认证请求
   * @param handler - 认证处理函数，接收认证请求并返回响应
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#authenticate
   */
  readonly handleAuthenticate: (
    handler: (
      request: AcpSchema.AuthenticateRequest,
    ) => Effect.Effect<AcpSchema.AuthenticateResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册登出处理器
   * @description 处理 Client 发起的登出请求
   * @param handler - 登出处理函数，接收登出请求并返回响应
   * @returns Effect，注册成功后返回 void
   */
  readonly handleLogout: (
    handler: (
      request: AcpSchema.LogoutRequest,
    ) => Effect.Effect<AcpSchema.LogoutResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册创建会话处理器
   * @description 处理 Client 发起的创建新会话请求
   * @param handler - 创建会话处理函数，接收请求并返回新会话信息
   * @returns Effect，注册成功后返回 void
   */
  readonly handleCreateSession: (
    handler: (
      request: AcpSchema.NewSessionRequest,
    ) => Effect.Effect<AcpSchema.NewSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册加载会话处理器
   * @description 处理 Client 发起的加载已有会话请求
   * @param handler - 加载会话处理函数，接收请求并返回会话状态
   * @returns Effect，注册成功后返回 void
   */
  readonly handleLoadSession: (
    handler: (
      request: AcpSchema.LoadSessionRequest,
    ) => Effect.Effect<AcpSchema.LoadSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册列出会话处理器
   * @description 处理 Client 发起的列出所有会话请求
   * @param handler - 列出会话处理函数，接收请求并返回会话列表
   * @returns Effect，注册成功后返回 void
   */
  readonly handleListSessions: (
    handler: (
      request: AcpSchema.ListSessionsRequest,
    ) => Effect.Effect<AcpSchema.ListSessionsResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册分叉会话处理器
   * @description 处理 Client 发起的分叉会话请求
   * @param handler - 分叉会话处理函数，接收请求并返回新分叉会话信息
   * @returns Effect，注册成功后返回 void
   */
  readonly handleForkSession: (
    handler: (
      request: AcpSchema.ForkSessionRequest,
    ) => Effect.Effect<AcpSchema.ForkSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册恢复会话处理器
   * @description 处理 Client 发起的恢复会话请求
   * @param handler - 恢复会话处理函数，接收请求并返回会话状态
   * @returns Effect，注册成功后返回 void
   */
  readonly handleResumeSession: (
    handler: (
      request: AcpSchema.ResumeSessionRequest,
    ) => Effect.Effect<AcpSchema.ResumeSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册关闭会话处理器
   * @description 处理 Client 发起的关闭会话请求
   * @param handler - 关闭会话处理函数，接收请求并返回确认
   * @returns Effect，注册成功后返回 void
   */
  readonly handleCloseSession: (
    handler: (
      request: AcpSchema.CloseSessionRequest,
    ) => Effect.Effect<AcpSchema.CloseSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册设置会话模型处理器
   * @description 处理 Client 发起的设置会话模型请求
   * @param handler - 设置模型处理函数，接收请求并返回确认
   * @returns Effect，注册成功后返回 void
   */
  readonly handleSetSessionModel: (
    handler: (
      request: AcpSchema.SetSessionModelRequest,
    ) => Effect.Effect<AcpSchema.SetSessionModelResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册设置会话配置选项处理器
   * @description 处理 Client 发起的设置会话配置选项请求
   * @param handler - 设置配置选项处理函数，接收请求并返回确认
   * @returns Effect，注册成功后返回 void
   */
  readonly handleSetSessionConfigOption: (
    handler: (
      request: AcpSchema.SetSessionConfigOptionRequest,
    ) => Effect.Effect<AcpSchema.SetSessionConfigOptionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册提示处理器
   * @description 处理 Client 发起的提示请求，执行 AI 推理并返回响应
   * @param handler - 提示处理函数，接收提示请求并返回 AI 响应
   * @returns Effect，注册成功后返回 void
   */
  readonly handlePrompt: (
    handler: (
      request: AcpSchema.PromptRequest,
    ) => Effect.Effect<AcpSchema.PromptResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册取消会话处理器
   * @description 处理 Client 发起的取消会话请求
   * @param handler - 取消处理函数，接收取消通知并执行清理
   * @returns Effect，注册成功后返回 void
   * @see https://agentclientprotocol.com/protocol/schema#session/cancel
   */
  readonly handleCancel: (
    handler: (notification: AcpSchema.CancelNotification) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册未知扩展请求处理器
   * @description 处理未注册的扩展请求，作为默认处理器
   * @param handler - 扩展请求处理函数，接收方法名和参数并返回响应
   * @returns Effect，注册成功后返回 void
   */
  readonly handleUnknownExtRequest: (
    handler: (method: string, params: unknown) => Effect.Effect<unknown, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册未知扩展通知处理器
   * @description 处理未注册的扩展通知，作为默认处理器
   * @param handler - 扩展通知处理函数，接收方法名和参数并处理
   * @returns Effect，注册成功后返回 void
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
   */
  readonly handleExtNotification: <A, I>(
    method: string,
    payload: Schema.Codec<A, I>,
    handler: (payload: A) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;
}

/**
 * ACP Agent 服务类
 *
 * @description Effect ServiceMap 服务定义，用于依赖注入系统。
 *              该类定义了 AcpAgent 服务的标识符和接口形状，
 *              允许在 Effect 应用中通过依赖注入的方式使用 Agent 功能。
 *
 * @remarks
 * **使用场景：**
 * - 在 Effect 应用中注册 Agent 服务
 * - 通过 `Effect.service(AcpAgent)` 获取 Agent 实例
 * - 在 Layer 组合中提供 Agent 依赖
 *
 * @example
 * ```typescript
 * import { AcpAgent } from './agent';
 * import { Effect } from 'effect';
 *
 * // 在 Effect 中获取 Agent 服务
 * const program = Effect.flatMap(Effect.service(AcpAgent), (agent) => {
 *   return agent.handleInitialize((request) => {
 *     // 处理初始化请求
 *     return Effect.succeed({ ... });
 *   });
 * });
 * ```
 *
 * @public
 */
export class AcpAgent extends ServiceMap.Service<AcpAgent, AcpAgentShape>()(
  "effect-acp/agent/AcpAgent",
) {}

/**
 * Agent 核心请求处理器集合接口
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
interface AcpCoreAgentRequestHandlers {
  /** 初始化处理器，处理协议握手和能力协商 */
  initialize?: (
    request: AcpSchema.InitializeRequest,
  ) => Effect.Effect<AcpSchema.InitializeResponse, AcpError.AcpError>;
  /** 认证处理器，处理身份验证请求 */
  authenticate?: (
    request: AcpSchema.AuthenticateRequest,
  ) => Effect.Effect<AcpSchema.AuthenticateResponse, AcpError.AcpError>;
  /** 登出处理器，处理身份登出请求 */
  logout?: (
    request: AcpSchema.LogoutRequest,
  ) => Effect.Effect<AcpSchema.LogoutResponse, AcpError.AcpError>;
  /** 创建会话处理器，处理新会话创建请求 */
  createSession?: (
    request: AcpSchema.NewSessionRequest,
  ) => Effect.Effect<AcpSchema.NewSessionResponse, AcpError.AcpError>;
  /** 加载会话处理器，处理已有会话加载请求 */
  loadSession?: (
    request: AcpSchema.LoadSessionRequest,
  ) => Effect.Effect<AcpSchema.LoadSessionResponse, AcpError.AcpError>;
  /** 列出会话处理器，处理会话列表查询请求 */
  listSessions?: (
    request: AcpSchema.ListSessionsRequest,
  ) => Effect.Effect<AcpSchema.ListSessionsResponse, AcpError.AcpError>;
  /** 分叉会话处理器，处理会话分叉请求 */
  forkSession?: (
    request: AcpSchema.ForkSessionRequest,
  ) => Effect.Effect<AcpSchema.ForkSessionResponse, AcpError.AcpError>;
  /** 恢复会话处理器，处理会话恢复请求 */
  resumeSession?: (
    request: AcpSchema.ResumeSessionRequest,
  ) => Effect.Effect<AcpSchema.ResumeSessionResponse, AcpError.AcpError>;
  /** 关闭会话处理器，处理会话关闭请求 */
  closeSession?: (
    request: AcpSchema.CloseSessionRequest,
  ) => Effect.Effect<AcpSchema.CloseSessionResponse, AcpError.AcpError>;
  /** 设置会话模型处理器，处理模型切换请求 */
  setSessionModel?: (
    request: AcpSchema.SetSessionModelRequest,
  ) => Effect.Effect<AcpSchema.SetSessionModelResponse, AcpError.AcpError>;
  /** 设置会话配置选项处理器，处理配置更新请求 */
  setSessionConfigOption?: (
    request: AcpSchema.SetSessionConfigOptionRequest,
  ) => Effect.Effect<AcpSchema.SetSessionConfigOptionResponse, AcpError.AcpError>;
  /** 提示处理器，处理用户提示请求并执行 AI 推理 */
  prompt?: (
    request: AcpSchema.PromptRequest,
  ) => Effect.Effect<AcpSchema.PromptResponse, AcpError.AcpError>;
}

/** 取消通知解码器 */
const decodeCancelNotification = Schema.decodeUnknownEffect(AcpSchema.CancelNotification);

/**
 * 创建 ACP Agent 实例
 * @description 工厂函数，创建并初始化一个完整的 ACP Agent，包括协议传输层、RPC 客户端/服务端、
 *              处理器注册等所有功能
 * @param stdio - 标准输入输出接口
 * @param options - Agent 配置选项
 * @returns 包含所有 Agent 功能的 Effect
 */
export const make = Effect.fn("effect-acp/AcpAgent.make")(function* (
  stdio: Stdio.Stdio,
  options: AcpAgentOptions = {},
): Effect.fn.Return<AcpAgentShape, never, Scope.Scope> {
  // 核心处理器存储
  const coreHandlers: AcpCoreAgentRequestHandlers = {};
  // 取消通知处理器列表
  const cancelHandlers: Array<
    (notification: AcpSchema.CancelNotification) => Effect.Effect<void, AcpError.AcpError>
  > = [];
  // 扩展请求处理器映射
  const extRequestHandlers = new Map<
    string,
    (params: unknown) => Effect.Effect<unknown, AcpError.AcpError>
  >();
  // 扩展通知处理器映射
  const extNotificationHandlers = new Map<
    string,
    (params: unknown) => Effect.Effect<void, AcpError.AcpError>
  >();
  // 未知扩展请求处理器
  let unknownExtRequestHandler:
    | ((method: string, params: unknown) => Effect.Effect<unknown, AcpError.AcpError>)
    | undefined;
  // 未知扩展通知处理器
  let unknownExtNotificationHandler:
    | ((method: string, params: unknown) => Effect.Effect<void, AcpError.AcpError>)
    | undefined;

  // 创建协议传输层
  const transport = yield* AcpProtocol.makeAcpPatchedProtocol({
    stdio,
    serverRequestMethods: new Set(AcpRpcs.AgentRpcs.requests.keys()),
    ...(options.logIncoming !== undefined ? { logIncoming: options.logIncoming } : {}),
    ...(options.logOutgoing !== undefined ? { logOutgoing: options.logOutgoing } : {}),
    ...(options.logger ? { logger: options.logger } : {}),
    // 通知处理回调
    onNotification: (notification) => {
      // 特殊处理取消通知
      if (
        notification._tag === "ExtNotification" &&
        notification.method === AGENT_METHODS.session_cancel
      ) {
        return decodeCancelNotification(notification.params).pipe(
          Effect.mapError(
            (error) =>
              new AcpError.AcpProtocolParseError({
                detail: `Invalid ${AGENT_METHODS.session_cancel} notification payload`,
                cause: error,
              }),
          ),
          Effect.flatMap((decoded) =>
            Effect.forEach(cancelHandlers, (handler) => handler(decoded), { discard: true }),
          ),
        );
      }

      // 忽略非扩展通知
      if (notification._tag !== "ExtNotification") {
        return Effect.void;
      }

      // 查找并执行扩展通知处理器
      const handler = extNotificationHandlers.get(notification.method);
      if (handler) {
        return handler(notification.params);
      }
      // 使用未知扩展通知处理器作为后备
      return unknownExtNotificationHandler
        ? unknownExtNotificationHandler(notification.method, notification.params)
        : Effect.void;
    },
    // 扩展请求处理回调
    onExtRequest: (method, params) => {
      const handler = extRequestHandlers.get(method);
      if (handler) {
        return handler(params);
      }
      // 使用未知扩展请求处理器作为后备
      return unknownExtRequestHandler
        ? unknownExtRequestHandler(method, params)
        : Effect.fail(AcpError.AcpRequestError.methodNotFound(method));
    },
  });

  // 创建 Agent RPC 处理器层
  const agentHandlerLayer = AcpRpcs.AgentRpcs.toLayer(
    AcpRpcs.AgentRpcs.of({
      [AGENT_METHODS.initialize]: (payload) =>
        runHandler(coreHandlers.initialize, payload, AGENT_METHODS.initialize),
      [AGENT_METHODS.authenticate]: (payload) =>
        runHandler(coreHandlers.authenticate, payload, AGENT_METHODS.authenticate),
      [AGENT_METHODS.logout]: (payload) =>
        runHandler(coreHandlers.logout, payload, AGENT_METHODS.logout),
      [AGENT_METHODS.session_new]: (payload) =>
        runHandler(coreHandlers.createSession, payload, AGENT_METHODS.session_new),
      [AGENT_METHODS.session_load]: (payload) =>
        runHandler(coreHandlers.loadSession, payload, AGENT_METHODS.session_load),
      [AGENT_METHODS.session_list]: (payload) =>
        runHandler(coreHandlers.listSessions, payload, AGENT_METHODS.session_list),
      [AGENT_METHODS.session_fork]: (payload) =>
        runHandler(coreHandlers.forkSession, payload, AGENT_METHODS.session_fork),
      [AGENT_METHODS.session_resume]: (payload) =>
        runHandler(coreHandlers.resumeSession, payload, AGENT_METHODS.session_resume),
      [AGENT_METHODS.session_close]: (payload) =>
        runHandler(coreHandlers.closeSession, payload, AGENT_METHODS.session_close),
      [AGENT_METHODS.session_set_model]: (payload) =>
        runHandler(coreHandlers.setSessionModel, payload, AGENT_METHODS.session_set_model),
      [AGENT_METHODS.session_set_config_option]: (payload) =>
        runHandler(
          coreHandlers.setSessionConfigOption,
          payload,
          AGENT_METHODS.session_set_config_option,
        ),
      [AGENT_METHODS.session_prompt]: (payload) =>
        runHandler(coreHandlers.prompt, payload, AGENT_METHODS.session_prompt),
    }),
  );

  // 启动 RPC 服务端
  yield* RpcServer.make(AcpRpcs.AgentRpcs).pipe(
    Effect.provideService(RpcServer.Protocol, transport.serverProtocol),
    Effect.provide(agentHandlerLayer),
    Effect.forkScoped,
  );

  // 创建 RPC 客户端（用于调用 Client 端方法）
  let nextRpcRequestId = 1n << 32n;
  const rpc = yield* RpcClient.make(AcpRpcs.ClientRpcs, {
    generateRequestId: () => nextRpcRequestId++ as never,
  }).pipe(Effect.provideService(RpcClient.Protocol, transport.clientProtocol));

  // 返回 Agent 接口实现
  return {
    raw: {
      notifications: transport.incoming,
      request: transport.request,
      notify: transport.notify,
    },
    client: {
      requestPermission: (payload) =>
        callRpc(rpc[CLIENT_METHODS.session_request_permission](payload)),
      elicit: (payload) => callRpc(rpc[CLIENT_METHODS.session_elicitation](payload)),
      readTextFile: (payload) => callRpc(rpc[CLIENT_METHODS.fs_read_text_file](payload)),
      writeTextFile: (payload) => callRpc(rpc[CLIENT_METHODS.fs_write_text_file](payload)),
      createTerminal: (payload) =>
        callRpc(rpc[CLIENT_METHODS.terminal_create](payload)).pipe(
          Effect.map((response) =>
            AcpTerminal.makeTerminal({
              sessionId: payload.sessionId,
              terminalId: response.terminalId,
              output: callRpc(
                rpc[CLIENT_METHODS.terminal_output]({
                  sessionId: payload.sessionId,
                  terminalId: response.terminalId,
                }),
              ),
              waitForExit: callRpc(
                rpc[CLIENT_METHODS.terminal_wait_for_exit]({
                  sessionId: payload.sessionId,
                  terminalId: response.terminalId,
                }),
              ),
              kill: callRpc(
                rpc[CLIENT_METHODS.terminal_kill]({
                  sessionId: payload.sessionId,
                  terminalId: response.terminalId,
                }),
              ),
              release: callRpc(
                rpc[CLIENT_METHODS.terminal_release]({
                  sessionId: payload.sessionId,
                  terminalId: response.terminalId,
                }),
              ),
            }),
          ),
        ),
      sessionUpdate: (payload) => transport.notify(CLIENT_METHODS.session_update, payload),
      elicitationComplete: (payload) =>
        transport.notify(CLIENT_METHODS.session_elicitation_complete, payload),
      extRequest: transport.request,
      extNotification: transport.notify,
    },
    // 处理器注册方法
    handleInitialize: (handler) =>
      Effect.suspend(() => {
        coreHandlers.initialize = handler;
        return Effect.void;
      }),
    handleAuthenticate: (handler) =>
      Effect.suspend(() => {
        coreHandlers.authenticate = handler;
        return Effect.void;
      }),
    handleLogout: (handler) =>
      Effect.suspend(() => {
        coreHandlers.logout = handler;
        return Effect.void;
      }),
    handleCreateSession: (handler) =>
      Effect.suspend(() => {
        coreHandlers.createSession = handler;
        return Effect.void;
      }),
    handleLoadSession: (handler) =>
      Effect.suspend(() => {
        coreHandlers.loadSession = handler;
        return Effect.void;
      }),
    handleListSessions: (handler) =>
      Effect.suspend(() => {
        coreHandlers.listSessions = handler;
        return Effect.void;
      }),
    handleForkSession: (handler) =>
      Effect.suspend(() => {
        coreHandlers.forkSession = handler;
        return Effect.void;
      }),
    handleResumeSession: (handler) =>
      Effect.suspend(() => {
        coreHandlers.resumeSession = handler;
        return Effect.void;
      }),
    handleCloseSession: (handler) =>
      Effect.suspend(() => {
        coreHandlers.closeSession = handler;
        return Effect.void;
      }),
    handleSetSessionModel: (handler) =>
      Effect.suspend(() => {
        coreHandlers.setSessionModel = handler;
        return Effect.void;
      }),
    handleSetSessionConfigOption: (handler) =>
      Effect.suspend(() => {
        coreHandlers.setSessionConfigOption = handler;
        return Effect.void;
      }),
    handlePrompt: (handler) =>
      Effect.suspend(() => {
        coreHandlers.prompt = handler;
        return Effect.void;
      }),
    handleCancel: (handler) =>
      Effect.suspend(() => {
        cancelHandlers.push(handler);
        return Effect.void;
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
  } satisfies AcpAgentShape;
});

/**
 * 创建 Agent Layer
 * @description 创建用于依赖注入的 Layer，需要提供 stdio
 * @param stdio - 标准输入输出接口
 * @param options - Agent 配置选项
 * @returns Agent Layer
 */
export const layer = (stdio: Stdio.Stdio, options: AcpAgentOptions = {}): Layer.Layer<AcpAgent> =>
  Layer.effect(AcpAgent, make(stdio, options));

/**
 * 创建从 stdio 服务获取的 Agent Layer
 * @description 创建用于依赖注入的 Layer，从环境中获取 stdio 服务
 * @param options - Agent 配置选项
 * @returns Agent Layer，依赖 Stdio 服务
 */
export const layerStdio = (
  options: AcpAgentOptions = {},
): Layer.Layer<AcpAgent, never, Stdio.Stdio> =>
  Layer.effect(
    AcpAgent,
    Effect.flatMap(Effect.service(Stdio.Stdio), (stdio) => make(stdio, options)),
  );
