/**
 * @file ACP Agent 实现模块
 * @description 实现 ACP（Agent Client Protocol）协议的 Agent 端功能。
 *              Agent 作为服务端，接收来自 Client 的请求并处理会话管理、认证、提示等核心功能。
 *              同时 Agent 也可以向 Client 发送请求（如读取文件、创建终端等）。
 * @module agent
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
 * ACP Agent 配置选项
 * @description 用于配置 Agent 的行为，包括日志记录选项
 */
export interface AcpAgentOptions {
  /** 是否记录传入的消息 */
  readonly logIncoming?: boolean;
  /** 是否记录发出的消息 */
  readonly logOutgoing?: boolean;
  /** 自定义日志记录器 */
  readonly logger?: (event: AcpProtocol.AcpProtocolLogEvent) => Effect.Effect<void, never>;
}

/**
 * ACP Agent 接口形状
 * @description 定义了 Agent 提供的所有功能，包括原始协议访问、客户端操作和处理器注册
 */
export interface AcpAgentShape {
  /** 原始协议访问层 */
  readonly raw: {
    /**
     * 传入通知流
     * @description 观察连接上接收到的所有 ACP 通知
     */
    readonly notifications: Stream.Stream<AcpProtocol.AcpIncomingNotification>;
    /**
     * 发送通用 ACP 扩展请求
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly request: (
      method: string,
      payload: unknown,
    ) => Effect.Effect<unknown, AcpError.AcpError>;
    /**
     * 发送通用 ACP 扩展通知
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly notify: (method: string, payload: unknown) => Effect.Effect<void, AcpError.AcpError>;
  };
  /** 客户端操作层（Agent 调用 Client 的功能） */
  readonly client: {
    /**
     * 请求客户端权限
     * @see https://agentclientprotocol.com/protocol/schema#session/request_permission
     */
    readonly requestPermission: (
      payload: AcpSchema.RequestPermissionRequest,
    ) => Effect.Effect<AcpSchema.RequestPermissionResponse, AcpError.AcpError>;
    /**
     * 请求客户端提供结构化用户输入
     * @see https://agentclientprotocol.com/protocol/schema#session/elicitation
     */
    readonly elicit: (
      payload: AcpSchema.ElicitationRequest,
    ) => Effect.Effect<AcpSchema.ElicitationResponse, AcpError.AcpError>;
    /**
     * 从客户端请求文件内容
     * @see https://agentclientprotocol.com/protocol/schema#fs/read_text_file
     */
    readonly readTextFile: (
      payload: AcpSchema.ReadTextFileRequest,
    ) => Effect.Effect<AcpSchema.ReadTextFileResponse, AcpError.AcpError>;
    /**
     * 通过客户端写入文本文件
     * @see https://agentclientprotocol.com/protocol/schema#fs/write_text_file
     */
    readonly writeTextFile: (
      payload: AcpSchema.WriteTextFileRequest,
    ) => Effect.Effect<AcpSchema.WriteTextFileResponse, AcpError.AcpError>;
    /**
     * 在客户端创建终端
     * @see https://agentclientprotocol.com/protocol/schema#terminal/create
     */
    readonly createTerminal: (
      payload: AcpSchema.CreateTerminalRequest,
    ) => Effect.Effect<AcpTerminal.AcpTerminal, AcpError.AcpError>;
    /**
     * 向客户端发送会话更新通知
     * @see https://agentclientprotocol.com/protocol/schema#session/update
     */
    readonly sessionUpdate: (
      payload: AcpSchema.SessionNotification,
    ) => Effect.Effect<void, AcpError.AcpError>;
    /**
     * 向客户端发送会话引导完成通知
     * @see https://agentclientprotocol.com/protocol/schema#session/elicitation/complete
     */
    readonly elicitationComplete: (
      payload: AcpSchema.ElicitationCompleteNotification,
    ) => Effect.Effect<void, AcpError.AcpError>;
    /**
     * 向客户端发送 ACP 扩展请求
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly extRequest: (
      method: string,
      payload: unknown,
    ) => Effect.Effect<unknown, AcpError.AcpError>;
    /**
     * 向客户端发送 ACP 扩展通知
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly extNotification: (
      method: string,
      payload: unknown,
    ) => Effect.Effect<void, AcpError.AcpError>;
  };
  /**
   * 注册初始化处理器
   * @see https://agentclientprotocol.com/protocol/schema#initialize
   */
  readonly handleInitialize: (
    handler: (
      request: AcpSchema.InitializeRequest,
    ) => Effect.Effect<AcpSchema.InitializeResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册认证处理器
   * @see https://agentclientprotocol.com/protocol/schema#authenticate
   */
  readonly handleAuthenticate: (
    handler: (
      request: AcpSchema.AuthenticateRequest,
    ) => Effect.Effect<AcpSchema.AuthenticateResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册登出处理器 */
  readonly handleLogout: (
    handler: (
      request: AcpSchema.LogoutRequest,
    ) => Effect.Effect<AcpSchema.LogoutResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册创建会话处理器 */
  readonly handleCreateSession: (
    handler: (
      request: AcpSchema.NewSessionRequest,
    ) => Effect.Effect<AcpSchema.NewSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册加载会话处理器 */
  readonly handleLoadSession: (
    handler: (
      request: AcpSchema.LoadSessionRequest,
    ) => Effect.Effect<AcpSchema.LoadSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册列出会话处理器 */
  readonly handleListSessions: (
    handler: (
      request: AcpSchema.ListSessionsRequest,
    ) => Effect.Effect<AcpSchema.ListSessionsResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册分叉会话处理器 */
  readonly handleForkSession: (
    handler: (
      request: AcpSchema.ForkSessionRequest,
    ) => Effect.Effect<AcpSchema.ForkSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册恢复会话处理器 */
  readonly handleResumeSession: (
    handler: (
      request: AcpSchema.ResumeSessionRequest,
    ) => Effect.Effect<AcpSchema.ResumeSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册关闭会话处理器 */
  readonly handleCloseSession: (
    handler: (
      request: AcpSchema.CloseSessionRequest,
    ) => Effect.Effect<AcpSchema.CloseSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册设置会话模型处理器 */
  readonly handleSetSessionModel: (
    handler: (
      request: AcpSchema.SetSessionModelRequest,
    ) => Effect.Effect<AcpSchema.SetSessionModelResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册设置会话配置选项处理器 */
  readonly handleSetSessionConfigOption: (
    handler: (
      request: AcpSchema.SetSessionConfigOptionRequest,
    ) => Effect.Effect<AcpSchema.SetSessionConfigOptionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册提示处理器 */
  readonly handlePrompt: (
    handler: (
      request: AcpSchema.PromptRequest,
    ) => Effect.Effect<AcpSchema.PromptResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * 注册取消会话处理器
   * @see https://agentclientprotocol.com/protocol/schema#session/cancel
   */
  readonly handleCancel: (
    handler: (notification: AcpSchema.CancelNotification) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册未知扩展请求处理器 */
  readonly handleUnknownExtRequest: (
    handler: (method: string, params: unknown) => Effect.Effect<unknown, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册未知扩展通知处理器 */
  readonly handleUnknownExtNotification: (
    handler: (method: string, params: unknown) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册类型化扩展请求处理器 */
  readonly handleExtRequest: <A, I>(
    method: string,
    payload: Schema.Codec<A, I>,
    handler: (payload: A) => Effect.Effect<unknown, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /** 注册类型化扩展通知处理器 */
  readonly handleExtNotification: <A, I>(
    method: string,
    payload: Schema.Codec<A, I>,
    handler: (payload: A) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;
}

/**
 * ACP Agent 服务
 * @description Effect ServiceMap 服务定义，用于依赖注入
 */
export class AcpAgent extends ServiceMap.Service<AcpAgent, AcpAgentShape>()(
  "effect-acp/agent/AcpAgent",
) {}

/**
 * Agent 核心请求处理器集合
 * @description 内部使用，存储所有核心方法的处理器
 */
interface AcpCoreAgentRequestHandlers {
  initialize?: (
    request: AcpSchema.InitializeRequest,
  ) => Effect.Effect<AcpSchema.InitializeResponse, AcpError.AcpError>;
  authenticate?: (
    request: AcpSchema.AuthenticateRequest,
  ) => Effect.Effect<AcpSchema.AuthenticateResponse, AcpError.AcpError>;
  logout?: (
    request: AcpSchema.LogoutRequest,
  ) => Effect.Effect<AcpSchema.LogoutResponse, AcpError.AcpError>;
  createSession?: (
    request: AcpSchema.NewSessionRequest,
  ) => Effect.Effect<AcpSchema.NewSessionResponse, AcpError.AcpError>;
  loadSession?: (
    request: AcpSchema.LoadSessionRequest,
  ) => Effect.Effect<AcpSchema.LoadSessionResponse, AcpError.AcpError>;
  listSessions?: (
    request: AcpSchema.ListSessionsRequest,
  ) => Effect.Effect<AcpSchema.ListSessionsResponse, AcpError.AcpError>;
  forkSession?: (
    request: AcpSchema.ForkSessionRequest,
  ) => Effect.Effect<AcpSchema.ForkSessionResponse, AcpError.AcpError>;
  resumeSession?: (
    request: AcpSchema.ResumeSessionRequest,
  ) => Effect.Effect<AcpSchema.ResumeSessionResponse, AcpError.AcpError>;
  closeSession?: (
    request: AcpSchema.CloseSessionRequest,
  ) => Effect.Effect<AcpSchema.CloseSessionResponse, AcpError.AcpError>;
  setSessionModel?: (
    request: AcpSchema.SetSessionModelRequest,
  ) => Effect.Effect<AcpSchema.SetSessionModelResponse, AcpError.AcpError>;
  setSessionConfigOption?: (
    request: AcpSchema.SetSessionConfigOptionRequest,
  ) => Effect.Effect<AcpSchema.SetSessionConfigOptionResponse, AcpError.AcpError>;
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
