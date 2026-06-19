/**
 * @file ACP RPC 定义模块
 * @description 定义 ACP（Agent Client Protocol）协议中所有 RPC 方法的类型化定义。
 *              使用 Effect RPC 框架将每个协议方法封装为强类型的 Rpc 定义，
 *              并分为 Agent 端和 Client 端两个 RPC 组。
 * @module rpc
 */

import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import * as AcpSchema from "./_generated/schema.gen.ts";
import { AGENT_METHODS, CLIENT_METHODS } from "./_generated/meta.gen.ts";

// ============================================================
// Agent 端 RPC 定义（Client -> Agent 方向的调用）
// ============================================================

/** 初始化连接 RPC */
export const InitializeRpc = Rpc.make(AGENT_METHODS.initialize, {
  payload: AcpSchema.InitializeRequest,
  success: AcpSchema.InitializeResponse,
  error: AcpSchema.Error,
});

/** 认证 RPC */
export const AuthenticateRpc = Rpc.make(AGENT_METHODS.authenticate, {
  payload: AcpSchema.AuthenticateRequest,
  success: AcpSchema.AuthenticateResponse,
  error: AcpSchema.Error,
});

/** 登出 RPC */
export const LogoutRpc = Rpc.make(AGENT_METHODS.logout, {
  payload: AcpSchema.LogoutRequest,
  success: AcpSchema.LogoutResponse,
  error: AcpSchema.Error,
});

/** 创建新会话 RPC */
export const NewSessionRpc = Rpc.make(AGENT_METHODS.session_new, {
  payload: AcpSchema.NewSessionRequest,
  success: AcpSchema.NewSessionResponse,
  error: AcpSchema.Error,
});

/** 加载已有会话 RPC */
export const LoadSessionRpc = Rpc.make(AGENT_METHODS.session_load, {
  payload: AcpSchema.LoadSessionRequest,
  success: AcpSchema.LoadSessionResponse,
  error: AcpSchema.Error,
});

/** 列出所有会话 RPC */
export const ListSessionsRpc = Rpc.make(AGENT_METHODS.session_list, {
  payload: AcpSchema.ListSessionsRequest,
  success: AcpSchema.ListSessionsResponse,
  error: AcpSchema.Error,
});

/** 分叉会话 RPC */
export const ForkSessionRpc = Rpc.make(AGENT_METHODS.session_fork, {
  payload: AcpSchema.ForkSessionRequest,
  success: AcpSchema.ForkSessionResponse,
  error: AcpSchema.Error,
});

/** 恢复会话 RPC */
export const ResumeSessionRpc = Rpc.make(AGENT_METHODS.session_resume, {
  payload: AcpSchema.ResumeSessionRequest,
  success: AcpSchema.ResumeSessionResponse,
  error: AcpSchema.Error,
});

/** 关闭会话 RPC */
export const CloseSessionRpc = Rpc.make(AGENT_METHODS.session_close, {
  payload: AcpSchema.CloseSessionRequest,
  success: AcpSchema.CloseSessionResponse,
  error: AcpSchema.Error,
});

/** 发送提示 RPC */
export const PromptRpc = Rpc.make(AGENT_METHODS.session_prompt, {
  payload: AcpSchema.PromptRequest,
  success: AcpSchema.PromptResponse,
  error: AcpSchema.Error,
});

/** 设置会话模型 RPC */
export const SetSessionModelRpc = Rpc.make(AGENT_METHODS.session_set_model, {
  payload: AcpSchema.SetSessionModelRequest,
  success: AcpSchema.SetSessionModelResponse,
  error: AcpSchema.Error,
});

/** 设置会话配置选项 RPC */
export const SetSessionConfigOptionRpc = Rpc.make(AGENT_METHODS.session_set_config_option, {
  payload: AcpSchema.SetSessionConfigOptionRequest,
  success: AcpSchema.SetSessionConfigOptionResponse,
  error: AcpSchema.Error,
});

// ============================================================
// Client 端 RPC 定义（Agent -> Client 方向的调用）
// ============================================================

/** 读取文本文件 RPC */
export const ReadTextFileRpc = Rpc.make(CLIENT_METHODS.fs_read_text_file, {
  payload: AcpSchema.ReadTextFileRequest,
  success: AcpSchema.ReadTextFileResponse,
  error: AcpSchema.Error,
});

/** 写入文本文件 RPC */
export const WriteTextFileRpc = Rpc.make(CLIENT_METHODS.fs_write_text_file, {
  payload: AcpSchema.WriteTextFileRequest,
  success: AcpSchema.WriteTextFileResponse,
  error: AcpSchema.Error,
});

/** 请求权限 RPC */
export const RequestPermissionRpc = Rpc.make(CLIENT_METHODS.session_request_permission, {
  payload: AcpSchema.RequestPermissionRequest,
  success: AcpSchema.RequestPermissionResponse,
  error: AcpSchema.Error,
});

/** 会话引导（请求用户输入）RPC */
export const ElicitationRpc = Rpc.make(CLIENT_METHODS.session_elicitation, {
  payload: AcpSchema.ElicitationRequest,
  success: AcpSchema.ElicitationResponse,
  error: AcpSchema.Error,
});

/** 创建终端 RPC */
export const CreateTerminalRpc = Rpc.make(CLIENT_METHODS.terminal_create, {
  payload: AcpSchema.CreateTerminalRequest,
  success: AcpSchema.CreateTerminalResponse,
  error: AcpSchema.Error,
});

/** 获取终端输出 RPC */
export const TerminalOutputRpc = Rpc.make(CLIENT_METHODS.terminal_output, {
  payload: AcpSchema.TerminalOutputRequest,
  success: AcpSchema.TerminalOutputResponse,
  error: AcpSchema.Error,
});

/** 释放终端 RPC */
export const ReleaseTerminalRpc = Rpc.make(CLIENT_METHODS.terminal_release, {
  payload: AcpSchema.ReleaseTerminalRequest,
  success: AcpSchema.ReleaseTerminalResponse,
  error: AcpSchema.Error,
});

/** 等待终端退出 RPC */
export const WaitForTerminalExitRpc = Rpc.make(CLIENT_METHODS.terminal_wait_for_exit, {
  payload: AcpSchema.WaitForTerminalExitRequest,
  success: AcpSchema.WaitForTerminalExitResponse,
  error: AcpSchema.Error,
});

/** 终止终端 RPC */
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
 * @description 包含所有由 Client 调用 Agent 的 RPC 方法定义，
 *              用于构建 Agent 侧的 RPC 服务端和 Client 侧的 RPC 客户端
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
 * @description 包含所有由 Agent 调用 Client 的 RPC 方法定义，
 *              用于构建 Client 侧的 RPC 服务端和 Agent 侧的 RPC 客户端
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
