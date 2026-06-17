/**
 * @fileoverview ACP Agent 模块
 *
 * 实现 ACP 协议的代理端（Agent）角色。Agent 负责响应 Client 的初始化、认证、会话管理和提示请求，
 * 同时可以向 Client 发起文件系统操作、权限请求、引导输入和终端管理请求。
 *
 * 核心功能：
 * - 通过 stdio 建立与 Client 的 ACP 连接
 * - 提供 Client 端 RPC 的调用接口（如 requestPermission、readTextFile、createTerminal 等）
 * - 注册 Agent 端请求处理器（如 handleInitialize、handlePrompt 等）
 * - 管理扩展请求/通知的注册与分发
 *
 * 所属模块：effect-acp
 * 主要导出：AcpAgent、AcpAgentShape、AcpAgentOptions、make、layer、layerStdio
 *
 * @see https://agentclientprotocol.com
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
 * ACP Agent 配置选项。
 *
 * 控制日志输出和协议事件记录行为。
 */
export interface AcpAgentOptions {
  readonly logIncoming?: boolean;
  readonly logOutgoing?: boolean;
  readonly logger?: (event: AcpProtocol.AcpProtocolLogEvent) => Effect.Effect<void, never>;
}

/**
 * ACP Agent 对外接口形状。
 *
 * 定义 Agent 的所有操作能力，包括原始操作、Client 端 RPC 调用、请求处理器注册和扩展支持。
 */
export interface AcpAgentShape {
  readonly raw: {
    /**
     * Stream of inbound ACP notifications observed on the connection.
     */
    readonly notifications: Stream.Stream<AcpProtocol.AcpIncomingNotification>;
    /**
     * Sends a generic ACP extension request.
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly request: (
      method: string,
      payload: unknown,
    ) => Effect.Effect<unknown, AcpError.AcpError>;
    /**
     * Sends a generic ACP extension notification.
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly notify: (method: string, payload: unknown) => Effect.Effect<void, AcpError.AcpError>;
  };
  readonly client: {
    /**
     * Requests client permission for an operation.
     * @see https://agentclientprotocol.com/protocol/schema#session/request_permission
     */
    readonly requestPermission: (
      payload: AcpSchema.RequestPermissionRequest,
    ) => Effect.Effect<AcpSchema.RequestPermissionResponse, AcpError.AcpError>;
    /**
     * Requests structured user input from the client.
     * @see https://agentclientprotocol.com/protocol/schema#session/elicitation
     */
    readonly elicit: (
      payload: AcpSchema.ElicitationRequest,
    ) => Effect.Effect<AcpSchema.ElicitationResponse, AcpError.AcpError>;
    /**
     * Requests file contents from the client.
     * @see https://agentclientprotocol.com/protocol/schema#fs/read_text_file
     */
    readonly readTextFile: (
      payload: AcpSchema.ReadTextFileRequest,
    ) => Effect.Effect<AcpSchema.ReadTextFileResponse, AcpError.AcpError>;
    /**
     * Writes a text file through the client.
     * @see https://agentclientprotocol.com/protocol/schema#fs/write_text_file
     */
    readonly writeTextFile: (
      payload: AcpSchema.WriteTextFileRequest,
    ) => Effect.Effect<AcpSchema.WriteTextFileResponse, AcpError.AcpError>;
    /**
     * Creates a terminal on the client side.
     * @see https://agentclientprotocol.com/protocol/schema#terminal/create
     */
    readonly createTerminal: (
      payload: AcpSchema.CreateTerminalRequest,
    ) => Effect.Effect<AcpTerminal.AcpTerminal, AcpError.AcpError>;
    /**
     * Sends a `session/update` notification to the client.
     * @see https://agentclientprotocol.com/protocol/schema#session/update
     */
    readonly sessionUpdate: (
      payload: AcpSchema.SessionNotification,
    ) => Effect.Effect<void, AcpError.AcpError>;
    /**
     * Sends a `session/elicitation/complete` notification to the client.
     * @see https://agentclientprotocol.com/protocol/schema#session/elicitation/complete
     */
    readonly elicitationComplete: (
      payload: AcpSchema.ElicitationCompleteNotification,
    ) => Effect.Effect<void, AcpError.AcpError>;
    /**
     * Sends an ACP extension request to the client.
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly extRequest: (
      method: string,
      payload: unknown,
    ) => Effect.Effect<unknown, AcpError.AcpError>;
    /**
     * Sends an ACP extension notification to the client.
     * @see https://agentclientprotocol.com/protocol/extensibility
     */
    readonly extNotification: (
      method: string,
      payload: unknown,
    ) => Effect.Effect<void, AcpError.AcpError>;
  };
  /**
   * Registers a handler for `initialize`.
   * @see https://agentclientprotocol.com/protocol/schema#initialize
   */
  readonly handleInitialize: (
    handler: (
      request: AcpSchema.InitializeRequest,
    ) => Effect.Effect<AcpSchema.InitializeResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * Registers a handler for `authenticate`.
   * @see https://agentclientprotocol.com/protocol/schema#authenticate
   */
  readonly handleAuthenticate: (
    handler: (
      request: AcpSchema.AuthenticateRequest,
    ) => Effect.Effect<AcpSchema.AuthenticateResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleLogout: (
    handler: (
      request: AcpSchema.LogoutRequest,
    ) => Effect.Effect<AcpSchema.LogoutResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleCreateSession: (
    handler: (
      request: AcpSchema.NewSessionRequest,
    ) => Effect.Effect<AcpSchema.NewSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleLoadSession: (
    handler: (
      request: AcpSchema.LoadSessionRequest,
    ) => Effect.Effect<AcpSchema.LoadSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleListSessions: (
    handler: (
      request: AcpSchema.ListSessionsRequest,
    ) => Effect.Effect<AcpSchema.ListSessionsResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleForkSession: (
    handler: (
      request: AcpSchema.ForkSessionRequest,
    ) => Effect.Effect<AcpSchema.ForkSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleResumeSession: (
    handler: (
      request: AcpSchema.ResumeSessionRequest,
    ) => Effect.Effect<AcpSchema.ResumeSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleCloseSession: (
    handler: (
      request: AcpSchema.CloseSessionRequest,
    ) => Effect.Effect<AcpSchema.CloseSessionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleSetSessionModel: (
    handler: (
      request: AcpSchema.SetSessionModelRequest,
    ) => Effect.Effect<AcpSchema.SetSessionModelResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleSetSessionConfigOption: (
    handler: (
      request: AcpSchema.SetSessionConfigOptionRequest,
    ) => Effect.Effect<AcpSchema.SetSessionConfigOptionResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handlePrompt: (
    handler: (
      request: AcpSchema.PromptRequest,
    ) => Effect.Effect<AcpSchema.PromptResponse, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  /**
   * Registers a handler for `session/cancel`.
   * @see https://agentclientprotocol.com/protocol/schema#session/cancel
   */
  readonly handleCancel: (
    handler: (notification: AcpSchema.CancelNotification) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleUnknownExtRequest: (
    handler: (method: string, params: unknown) => Effect.Effect<unknown, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleUnknownExtNotification: (
    handler: (method: string, params: unknown) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleExtRequest: <A, I>(
    method: string,
    payload: Schema.Codec<A, I>,
    handler: (payload: A) => Effect.Effect<unknown, AcpError.AcpError>,
  ) => Effect.Effect<void>;
  readonly handleExtNotification: <A, I>(
    method: string,
    payload: Schema.Codec<A, I>,
    handler: (payload: A) => Effect.Effect<void, AcpError.AcpError>,
  ) => Effect.Effect<void>;
}

/**
 * ACP Agent 服务类。
 *
 * 基于 Effect ServiceMap 实现，作为依赖注入容器中的服务标识。
 * 通过 `make` 工厂函数创建实例，通过 `layer` 或 `layerStdio` 创建 Layer。
 */
export class AcpAgent extends ServiceMap.Service<AcpAgent, AcpAgentShape>()(
  "effect-acp/agent/AcpAgent",
) {}

/**
 * Agent 端核心请求处理器映射。
 *
 * 存储 Agent 端各核心请求方法的处理器函数，在注册前为 undefined。
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

/** Cancel 通知的解码器，用于安全地解码传入的 session/cancel 通知载荷 */
const decodeCancelNotification = Schema.decodeUnknownEffect(AcpSchema.CancelNotification);

/**
 * 创建 AcpAgent 实例的工厂函数。
 *
 * 建立 ACP 协议传输层，初始化 RPC 客户端和服务器，注册核心请求处理器和通知处理器。
 * 返回 AcpAgentShape 接口的完整实现。
 *
 * @param stdio - 标准 I/O 实例（通常来自子进程）
 * @param options - Agent 配置选项
 * @returns 作用域内的 AcpAgentShape 实现
 */
export const make = Effect.fn("effect-acp/AcpAgent.make")(function* (
  stdio: Stdio.Stdio,
  options: AcpAgentOptions = {},
): Effect.fn.Return<AcpAgentShape, never, Scope.Scope> {
  const coreHandlers: AcpCoreAgentRequestHandlers = {};
  const cancelHandlers: Array<
    (notification: AcpSchema.CancelNotification) => Effect.Effect<void, AcpError.AcpError>
  > = [];
  const extRequestHandlers = new Map<
    string,
    (params: unknown) => Effect.Effect<unknown, AcpError.AcpError>
  >();
  const extNotificationHandlers = new Map<
    string,
    (params: unknown) => Effect.Effect<void, AcpError.AcpError>
  >();
  let unknownExtRequestHandler:
    | ((method: string, params: unknown) => Effect.Effect<unknown, AcpError.AcpError>)
    | undefined;
  let unknownExtNotificationHandler:
    | ((method: string, params: unknown) => Effect.Effect<void, AcpError.AcpError>)
    | undefined;

  const transport = yield* AcpProtocol.makeAcpPatchedProtocol({
    stdio,
    serverRequestMethods: new Set(AcpRpcs.AgentRpcs.requests.keys()),
    ...(options.logIncoming !== undefined ? { logIncoming: options.logIncoming } : {}),
    ...(options.logOutgoing !== undefined ? { logOutgoing: options.logOutgoing } : {}),
    ...(options.logger ? { logger: options.logger } : {}),
    onNotification: (notification) => {
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

      if (notification._tag !== "ExtNotification") {
        return Effect.void;
      }

      const handler = extNotificationHandlers.get(notification.method);
      if (handler) {
        return handler(notification.params);
      }
      return unknownExtNotificationHandler
        ? unknownExtNotificationHandler(notification.method, notification.params)
        : Effect.void;
    },
    onExtRequest: (method, params) => {
      const handler = extRequestHandlers.get(method);
      if (handler) {
        return handler(params);
      }
      return unknownExtRequestHandler
        ? unknownExtRequestHandler(method, params)
        : Effect.fail(AcpError.AcpRequestError.methodNotFound(method));
    },
  });

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

  yield* RpcServer.make(AcpRpcs.AgentRpcs).pipe(
    Effect.provideService(RpcServer.Protocol, transport.serverProtocol),
    Effect.provide(agentHandlerLayer),
    Effect.forkScoped,
  );

  let nextRpcRequestId = 1n << 32n;
  const rpc = yield* RpcClient.make(AcpRpcs.ClientRpcs, {
    generateRequestId: () => nextRpcRequestId++ as never,
  }).pipe(Effect.provideService(RpcClient.Protocol, transport.clientProtocol));

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
 * 创建 AcpAgent 的 Effect Layer。
 *
 * 提供一个 Stdio 实例来构建 AcpAgent 服务。
 *
 * @param stdio - 标准 I/O 实例
 * @param options - Agent 配置选项
 * @returns AcpAgent 的 Layer
 */
export const layer = (stdio: Stdio.Stdio, options: AcpAgentOptions = {}): Layer.Layer<AcpAgent> =>
  Layer.effect(AcpAgent, make(stdio, options));

/**
 * 从 Stdio 服务创建 AcpAgent 的 Effect Layer。
 *
 * 从依赖注入容器中获取 Stdio 实例，适用于已存在 Stdio 服务的上下文。
 *
 * @param options - Agent 配置选项
 * @returns 需要 Stdio 服务的 AcpAgent Layer
 */
export const layerStdio = (
  options: AcpAgentOptions = {},
): Layer.Layer<AcpAgent, never, Stdio.Stdio> =>
  Layer.effect(
    AcpAgent,
    Effect.flatMap(Effect.service(Stdio.Stdio), (stdio) => make(stdio, options)),
  );
