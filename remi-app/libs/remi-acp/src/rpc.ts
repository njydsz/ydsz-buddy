// @ts-nocheck
/**
 * @file ACP RPC 定义模块
 * @description 定义 ACP（Agent Client Protocol）协议中所有 RPC 方法的类型化定义。
 *              使用 Effect RPC 框架将每个协议方法封装为强类型的 Rpc 定义，
 *              并分为 Agent 端和 Client 端两个 RPC 组。
 *
 * @module rpc
 *
 * @remarks
 * **模块职责：**
 * - 定义所有 ACP 协议方法的类型化 RPC 描述
 * - 提供强类型的请求参数、响应结果和错误类型
 * - 将 RPC 方法按调用方向分组（Agent 端和 Client 端）
 * - 为 RPC 客户端和服务端的构建提供基础定义
 *
 * **架构设计：**
 * - 每个 RPC 方法都使用 `Rpc.make` 创建，包含方法名、参数 Schema、响应 Schema 和错误 Schema
 * - RPC 方法按调用方向分为两组：
 *   - AgentRpcs：Client 调用 Agent 的方法（如 initialize、prompt 等）
 *   - ClientRpcs：Agent 调用 Client 的方法（如 readTextFile、createTerminal 等）
 * - 使用 RpcGroup 将相关方法组合，便于批量构建服务端和客户端
 *
 * **使用场景：**
 * - 构建 RPC 服务端时，使用 RpcGroup 定义可处理的方法集合
 * - 构建 RPC 客户端时，使用 RpcGroup 定义可调用的方法集合
 * - 在 client.ts 和 agent.ts 中被引用，用于创建实际的 RPC 服务端和客户端
 *
 * @see {@link https://effect.website/docs/rpc|Effect RPC 文档}
 * @see {@link https://agentclientprotocol.com/|ACP 协议规范}
 */

import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import * as AcpSchema from "./_generated/schema.gen.ts";
import { AGENT_METHODS, CLIENT_METHODS } from "./_generated/meta.gen.ts";

// ============================================================
// Agent 端 RPC 定义（Client -> Agent 方向的调用）
// ============================================================

/**
 * 初始化连接 RPC
 *
 * @description 定义 Client 向 Agent 发起的初始化连接请求。
 *              这是建立 ACP 连接后的第一个调用，用于协商协议版本和支持的能力。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `initialize`
 *
 * @see https://agentclientprotocol.com/protocol/schema#initialize
 */
export const InitializeRpc = Rpc.make(AGENT_METHODS.initialize, {
  payload: AcpSchema.InitializeRequest,
  success: AcpSchema.InitializeResponse,
  error: AcpSchema.Error,
});

/**
 * 认证 RPC
 *
 * @description 定义 Client 向 Agent 发起的身份认证请求。
 *              当 Agent 要求认证时，Client 通过此 RPC 完成身份验证流程。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `authenticate`
 *
 * @see https://agentclientprotocol.com/protocol/schema#authenticate
 */
export const AuthenticateRpc = Rpc.make(AGENT_METHODS.authenticate, {
  payload: AcpSchema.AuthenticateRequest,
  success: AcpSchema.AuthenticateResponse,
  error: AcpSchema.Error,
});

/**
 * 登出 RPC
 *
 * @description 定义 Client 向 Agent 发起的登出请求。
 *              用于结束当前认证会话，清除认证状态。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `logout`
 *
 * @see https://agentclientprotocol.com/protocol/schema#logout
 */
export const LogoutRpc = Rpc.make(AGENT_METHODS.logout, {
  payload: AcpSchema.LogoutRequest,
  success: AcpSchema.LogoutResponse,
  error: AcpSchema.Error,
});

/**
 * 创建新会话 RPC
 *
 * @description 定义 Client 向 Agent 发起的创建新会话请求。
 *              用于启动一个新的 ACP 会话，开始与 Agent 的交互。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `session/new`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/new
 */
export const NewSessionRpc = Rpc.make(AGENT_METHODS.session_new, {
  payload: AcpSchema.NewSessionRequest,
  success: AcpSchema.NewSessionResponse,
  error: AcpSchema.Error,
});

/**
 * 加载已有会话 RPC
 *
 * @description 定义 Client 向 Agent 发起的加载已有会话请求。
 *              用于恢复之前保存的会话状态，继续之前的交互。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `session/load`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/load
 */
export const LoadSessionRpc = Rpc.make(AGENT_METHODS.session_load, {
  payload: AcpSchema.LoadSessionRequest,
  success: AcpSchema.LoadSessionResponse,
  error: AcpSchema.Error,
});

/**
 * 列出所有会话 RPC
 *
 * @description 定义 Client 向 Agent 发起的列出所有会话请求。
 *              用于获取所有可用会话的列表，支持会话管理界面。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `session/list`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/list
 */
export const ListSessionsRpc = Rpc.make(AGENT_METHODS.session_list, {
  payload: AcpSchema.ListSessionsRequest,
  success: AcpSchema.ListSessionsResponse,
  error: AcpSchema.Error,
});

/**
 * 分叉会话 RPC
 *
 * @description 定义 Client 向 Agent 发起的分叉会话请求。
 *              用于基于现有会话创建一个新的分支，支持并行探索不同的交互路径。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `session/fork`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/fork
 */
export const ForkSessionRpc = Rpc.make(AGENT_METHODS.session_fork, {
  payload: AcpSchema.ForkSessionRequest,
  success: AcpSchema.ForkSessionResponse,
  error: AcpSchema.Error,
});

/**
 * 恢复会话 RPC
 *
 * @description 定义 Client 向 Agent 发起的恢复会话请求。
 *              用于恢复之前暂停的会话，继续交互。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `session/resume`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/resume
 */
export const ResumeSessionRpc = Rpc.make(AGENT_METHODS.session_resume, {
  payload: AcpSchema.ResumeSessionRequest,
  success: AcpSchema.ResumeSessionResponse,
  error: AcpSchema.Error,
});

/**
 * 关闭会话 RPC
 *
 * @description 定义 Client 向 Agent 发起的关闭会话请求。
 *              用于结束会话，释放相关资源。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `session/close`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/close
 */
export const CloseSessionRpc = Rpc.make(AGENT_METHODS.session_close, {
  payload: AcpSchema.CloseSessionRequest,
  success: AcpSchema.CloseSessionResponse,
  error: AcpSchema.Error,
});

/**
 * 发送提示 RPC
 *
 * @description 定义 Client 向 Agent 发起的提示请求。
 *              用于向 Agent 发送用户输入，触发 Agent 的响应。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `session/prompt`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/prompt
 */
export const PromptRpc = Rpc.make(AGENT_METHODS.session_prompt, {
  payload: AcpSchema.PromptRequest,
  success: AcpSchema.PromptResponse,
  error: AcpSchema.Error,
});

/**
 * 设置会话模型 RPC
 *
 * @description 定义 Client 向 Agent 发起的设置会话模型请求。
 *              用于切换会话使用的 AI 模型。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `session/set_model`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/set_model
 */
export const SetSessionModelRpc = Rpc.make(AGENT_METHODS.session_set_model, {
  payload: AcpSchema.SetSessionModelRequest,
  success: AcpSchema.SetSessionModelResponse,
  error: AcpSchema.Error,
});

/**
 * 设置会话配置选项 RPC
 *
 * @description 定义 Client 向 Agent 发起的设置会话配置选项请求。
 *              用于修改会话的配置参数，如温度、最大 token 数等。
 *
 * @remarks
 * **调用方向：** Client -> Agent
 * **协议方法：** `session/set_config_option`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/set_config_option
 */
export const SetSessionConfigOptionRpc = Rpc.make(AGENT_METHODS.session_set_config_option, {
  payload: AcpSchema.SetSessionConfigOptionRequest,
  success: AcpSchema.SetSessionConfigOptionResponse,
  error: AcpSchema.Error,
});

// ============================================================
// Client 端 RPC 定义（Agent -> Client 方向的调用）
// ============================================================

/**
 * 读取文本文件 RPC
 *
 * @description 定义 Agent 向 Client 发起的文件读取请求。
 *              Agent 通过此 RPC 请求 Client 读取指定文件的内容。
 *
 * @remarks
 * **调用方向：** Agent -> Client
 * **协议方法：** `fs/read_text_file`
 *
 * @see https://agentclientprotocol.com/protocol/schema#fs/read_text_file
 */
export const ReadTextFileRpc = Rpc.make(CLIENT_METHODS.fs_read_text_file, {
  payload: AcpSchema.ReadTextFileRequest,
  success: AcpSchema.ReadTextFileResponse,
  error: AcpSchema.Error,
});

/**
 * 写入文本文件 RPC
 *
 * @description 定义 Agent 向 Client 发起的文件写入请求。
 *              Agent 通过此 RPC 请求 Client 将内容写入指定文件。
 *
 * @remarks
 * **调用方向：** Agent -> Client
 * **协议方法：** `fs/write_text_file`
 *
 * @see https://agentclientprotocol.com/protocol/schema#fs/write_text_file
 */
export const WriteTextFileRpc = Rpc.make(CLIENT_METHODS.fs_write_text_file, {
  payload: AcpSchema.WriteTextFileRequest,
  success: AcpSchema.WriteTextFileResponse,
  error: AcpSchema.Error,
});

/**
 * 请求权限 RPC
 *
 * @description 定义 Agent 向 Client 发起的权限请求。
 *              Agent 在执行某些操作前，通过此 RPC 请求 Client 的授权。
 *
 * @remarks
 * **调用方向：** Agent -> Client
 * **协议方法：** `session/request_permission`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/request_permission
 */
export const RequestPermissionRpc = Rpc.make(CLIENT_METHODS.session_request_permission, {
  payload: AcpSchema.RequestPermissionRequest,
  success: AcpSchema.RequestPermissionResponse,
  error: AcpSchema.Error,
});

/**
 * 会话引导（请求用户输入）RPC
 *
 * @description 定义 Agent 向 Client 发起的用户输入引导请求。
 *              Agent 通过此 RPC 请求用户提供结构化的输入信息。
 *
 * @remarks
 * **调用方向：** Agent -> Client
 * **协议方法：** `session/elicitation`
 *
 * @see https://agentclientprotocol.com/protocol/schema#session/elicitation
 */
export const ElicitationRpc = Rpc.make(CLIENT_METHODS.session_elicitation, {
  payload: AcpSchema.ElicitationRequest,
  success: AcpSchema.ElicitationResponse,
  error: AcpSchema.Error,
});

/**
 * 创建终端 RPC
 *
 * @description 定义 Agent 向 Client 发起的终端创建请求。
 *              Agent 通过此 RPC 请求 Client 创建一个新的终端实例。
 *
 * @remarks
 * **调用方向：** Agent -> Client
 * **协议方法：** `terminal/create`
 *
 * @see https://agentclientprotocol.com/protocol/schema#terminal/create
 */
export const CreateTerminalRpc = Rpc.make(CLIENT_METHODS.terminal_create, {
  payload: AcpSchema.CreateTerminalRequest,
  success: AcpSchema.CreateTerminalResponse,
  error: AcpSchema.Error,
});

/**
 * 获取终端输出 RPC
 *
 * @description 定义 Agent 向 Client 发起的终端输出获取请求。
 *              Agent 通过此 RPC 获取终端的输出内容。
 *
 * @remarks
 * **调用方向：** Agent -> Client
 * **协议方法：** `terminal/output`
 *
 * @see https://agentclientprotocol.com/protocol/schema#terminal/output
 */
export const TerminalOutputRpc = Rpc.make(CLIENT_METHODS.terminal_output, {
  payload: AcpSchema.TerminalOutputRequest,
  success: AcpSchema.TerminalOutputResponse,
  error: AcpSchema.Error,
});

/**
 * 释放终端 RPC
 *
 * @description 定义 Agent 向 Client 发起的终端释放请求。
 *              Agent 通过此 RPC 请求 Client 释放终端资源。
 *
 * @remarks
 * **调用方向：** Agent -> Client
 * **协议方法：** `terminal/release`
 *
 * @see https://agentclientprotocol.com/protocol/schema#terminal/release
 */
export const ReleaseTerminalRpc = Rpc.make(CLIENT_METHODS.terminal_release, {
  payload: AcpSchema.ReleaseTerminalRequest,
  success: AcpSchema.ReleaseTerminalResponse,
  error: AcpSchema.Error,
});

/**
 * 等待终端退出 RPC
 *
 * @description 定义 Agent 向 Client 发起的等待终端退出请求。
 *              Agent 通过此 RPC 等待终端进程结束。
 *
 * @remarks
 * **调用方向：** Agent -> Client
 * **协议方法：** `terminal/wait_for_exit`
 *
 * @see https://agentclientprotocol.com/protocol/schema#terminal/wait_for_exit
 */
export const WaitForTerminalExitRpc = Rpc.make(CLIENT_METHODS.terminal_wait_for_exit, {
  payload: AcpSchema.WaitForTerminalExitRequest,
  success: AcpSchema.WaitForTerminalExitResponse,
  error: AcpSchema.Error,
});

/**
 * 终止终端 RPC
 *
 * @description 定义 Agent 向 Client 发起的终端终止请求。
 *              Agent 通过此 RPC 请求 Client 强制终止终端进程。
 *
 * @remarks
 * **调用方向：** Agent -> Client
 * **协议方法：** `terminal/kill`
 *
 * @see https://agentclientprotocol.com/protocol/schema#terminal/kill
 */
export const KillTerminalRpc = Rpc.make(CLIENT_METHODS.terminal_kill, {
  payload: AcpSchema.KillTerminalRequest,
  success: AcpSchema.KillTerminalResponse,
  error: AcpSchema.Error,
});

// ============================================================
// RPC 分组
// ============================================================

/**
 * Agent 端 RPC 组
 *
 * @description 包含所有由 Client 调用 Agent 的 RPC 方法定义。
 *              用于构建 Agent 侧的 RPC 服务端和 Client 侧的 RPC 客户端。
 *
 * @remarks
 * **包含的方法：**
 * - `initialize`: 初始化连接
 * - `authenticate`: 身份认证
 * - `logout`: 登出
 * - `session/new`: 创建新会话
 * - `session/load`: 加载已有会话
 * - `session/list`: 列出所有会话
 * - `session/fork`: 分叉会话
 * - `session/resume`: 恢复会话
 * - `session/close`: 关闭会话
 * - `session/prompt`: 发送提示
 * - `session/set_model`: 设置会话模型
 * - `session/set_config_option`: 设置会话配置选项
 *
 * **使用场景：**
 * - 在 Agent 端构建 RPC 服务端，处理 Client 的请求
 * - 在 Client 端构建 RPC 客户端，调用 Agent 的方法
 *
 * @example
 * ```typescript
 * // 在 Agent 端构建 RPC 服务端
 * const agentHandlerLayer = AgentRpcs.toLayer(
 *   AgentRpcs.of({
 *     [AGENT_METHODS.initialize]: (payload) => handleInitialize(payload),
 *     [AGENT_METHODS.session_prompt]: (payload) => handlePrompt(payload),
 *     // ... 其他处理器
 *   })
 * );
 *
 * // 在 Client 端构建 RPC 客户端
 * const rpc = yield* RpcClient.make(AgentRpcs, { generateRequestId });
 * const response = yield* rpc[AGENT_METHODS.initialize](request);
 * ```
 */
export const AgentRpcs = RpcGroup.make(
  InitializeRpc,
  AuthenticateRpc,
  LogoutRpc,
  NewSessionRpc,
  LoadSessionRpc,
  ListSessionsRpc,
  ForkSessionRpc,
  ResumeSessionRpc,
  CloseSessionRpc,
  PromptRpc,
  SetSessionModelRpc,
  SetSessionConfigOptionRpc,
);

/**
 * Client 端 RPC 组
 *
 * @description 包含所有由 Agent 调用 Client 的 RPC 方法定义。
 *              用于构建 Client 侧的 RPC 服务端和 Agent 侧的 RPC 客户端。
 *
 * @remarks
 * **包含的方法：**
 * - `fs/read_text_file`: 读取文本文件
 * - `fs/write_text_file`: 写入文本文件
 * - `session/request_permission`: 请求权限
 * - `session/elicitation`: 会话引导（请求用户输入）
 * - `terminal/create`: 创建终端
 * - `terminal/output`: 获取终端输出
 * - `terminal/release`: 释放终端
 * - `terminal/wait_for_exit`: 等待终端退出
 * - `terminal/kill`: 终止终端
 *
 * **使用场景：**
 * - 在 Client 端构建 RPC 服务端，处理 Agent 的请求
 * - 在 Agent 端构建 RPC 客户端，调用 Client 的方法
 *
 * @example
 * ```typescript
 * // 在 Client 端构建 RPC 服务端
 * const clientHandlerLayer = ClientRpcs.toLayer(
 *   ClientRpcs.of({
 *     [CLIENT_METHODS.fs_read_text_file]: (payload) => handleReadTextFile(payload),
 *     [CLIENT_METHODS.terminal_create]: (payload) => handleCreateTerminal(payload),
 *     // ... 其他处理器
 *   })
 * );
 *
 * // 在 Agent 端构建 RPC 客户端
 * const rpc = yield* RpcClient.make(ClientRpcs, { generateRequestId });
 * const fileContent = yield* rpc[CLIENT_METHODS.fs_read_text_file](request);
 * ```
 */
export const ClientRpcs = RpcGroup.make(
  ReadTextFileRpc,
  WriteTextFileRpc,
  RequestPermissionRpc,
  ElicitationRpc,
  CreateTerminalRpc,
  TerminalOutputRpc,
  ReleaseTerminalRpc,
  WaitForTerminalExitRpc,
  KillTerminalRpc,
);
