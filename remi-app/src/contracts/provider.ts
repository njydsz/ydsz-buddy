/**
 * @file Provider 配置契约模块
 *
 * 本模块定义了 Remi 系统中 AI Provider（Claude / OpenAI / Codex / Cursor 等）
 * 的配置、密钥、模型、可用性等契约。
 *
 * ## 核心契约
 *
 * - `ProviderConfig`：单个 Provider 的完整配置
 * - `ProviderConfigMap`：Provider 配置集合（按 ProviderKind 索引）
 * - `ProviderKeyConfig`：Provider 密钥配置（API Key / OAuth）
 * - `ProviderModelOption`：Provider 可用模型选项
 * - `ProviderAvailability`：Provider 可用性状态
 * - `ProviderProbeInput/Result`：Provider 探测（健康检查）
 * - `ProviderListResult`：Provider 列表查询结果
 * - `ProviderUpdateInput`：Provider 配置更新
 *
 * ## 协议设计
 *
 * - **密钥隔离**：API Key 存储在后端 `remi-auth::SecretStore`，前端不直接持有
 * - **元数据同步**：Provider 配置变更通过 WebSocket 广播
 * - **多 Provider 聚合**：支持同时启用多个 Provider，按项目维度选择
 *
 * ## 使用场景
 *
 * - 设置面板中配置 Provider
 * - 启动 Provider 前的健康检查
 * - 模型选择器数据源
 *
 * ## 安全注意
 *
 * - `apiKey` 字段不参与前端序列化（仅后端持久化）
 * - OAuth 流程在前端发起，最终 token 由后端保存
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";
import {
  ApprovalRequestId,
  EventId,
  IsoDateTime,
  ProviderItemId,
  ThreadId,
  TurnId,
} from "./baseSchemas";
import {
  ChatAttachment,
  ModelSelection,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  ProviderApprovalDecision,
  ProviderApprovalPolicy,
  ProviderInteractionMode,
  ProviderKind,
  ProviderRequestKind,
  ProviderReviewTarget,
  ProviderSandboxMode,
  ProviderStartOptions,
  ProviderUserInputAnswers,
  RuntimeMode,
} from "./orchestration";
import { ProviderMentionReference, ProviderSkillReference } from "./providerDiscovery";

const ProviderSessionStatus = Schema.Literals([
  "connecting",
  "ready",
  "running",
  "error",
  "closed",
]);

export const ProviderSession = Schema.Struct({
  provider: ProviderKind,
  status: ProviderSessionStatus,
  runtimeMode: RuntimeMode,
  cwd: Schema.optional(TrimmedNonEmptyString),
  model: Schema.optional(TrimmedNonEmptyString),
  threadId: ThreadId,
  resumeCursor: Schema.optional(Schema.Unknown),
  activeTurnId: Schema.optional(TurnId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  lastError: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderSession = typeof ProviderSession.Type;

export const ProviderSessionStartInput = Schema.Struct({
  threadId: ThreadId,
  provider: Schema.optional(ProviderKind),
  cwd: Schema.optional(TrimmedNonEmptyString),
  modelSelection: Schema.optional(ModelSelection),
  resumeCursor: Schema.optional(Schema.Unknown),
  approvalPolicy: Schema.optional(ProviderApprovalPolicy),
  sandboxMode: Schema.optional(ProviderSandboxMode),
  providerOptions: Schema.optional(ProviderStartOptions),
  runtimeMode: RuntimeMode,
});
export type ProviderSessionStartInput = typeof ProviderSessionStartInput.Type;

export const ProviderSendTurnInput = Schema.Struct({
  threadId: ThreadId,
  input: Schema.optional(
    TrimmedNonEmptyString.check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_INPUT_CHARS)),
  ),
  attachments: Schema.optional(
    Schema.Array(ChatAttachment).check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS)),
  ),
  skills: Schema.optional(Schema.Array(ProviderSkillReference)),
  mentions: Schema.optional(Schema.Array(ProviderMentionReference)),
  modelSelection: Schema.optional(ModelSelection),
  interactionMode: Schema.optional(ProviderInteractionMode),
});
export type ProviderSendTurnInput = typeof ProviderSendTurnInput.Type;
export const ProviderSteerTurnInput = ProviderSendTurnInput;
export type ProviderSteerTurnInput = typeof ProviderSteerTurnInput.Type;

export const ProviderForkThreadInput = Schema.Struct({
  sourceThreadId: ThreadId,
  threadId: ThreadId,
  sourceResumeCursor: Schema.optional(Schema.Unknown),
  cwd: Schema.optional(TrimmedNonEmptyString),
  modelSelection: Schema.optional(ModelSelection),
  providerOptions: Schema.optional(ProviderStartOptions),
  runtimeMode: RuntimeMode,
});
export type ProviderForkThreadInput = typeof ProviderForkThreadInput.Type;

export const ProviderForkThreadResult = Schema.Struct({
  threadId: ThreadId,
  resumeCursor: Schema.optional(Schema.Unknown),
});
export type ProviderForkThreadResult = typeof ProviderForkThreadResult.Type;

export const ProviderTurnStartResult = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
  resumeCursor: Schema.optional(Schema.Unknown),
});
export type ProviderTurnStartResult = typeof ProviderTurnStartResult.Type;

export const ProviderStartReviewInput = Schema.Struct({
  threadId: ThreadId,
  target: ProviderReviewTarget,
});
export type ProviderStartReviewInput = typeof ProviderStartReviewInput.Type;

export const ProviderInterruptTurnInput = Schema.Struct({
  threadId: ThreadId,
  turnId: Schema.optional(TurnId),
  providerThreadId: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderInterruptTurnInput = typeof ProviderInterruptTurnInput.Type;

export const ProviderStopSessionInput = Schema.Struct({
  threadId: ThreadId,
});
export type ProviderStopSessionInput = typeof ProviderStopSessionInput.Type;

export const ProviderCompactThreadInput = Schema.Struct({
  threadId: ThreadId,
});
export type ProviderCompactThreadInput = typeof ProviderCompactThreadInput.Type;

export const ProviderRespondToRequestInput = Schema.Struct({
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  decision: ProviderApprovalDecision,
});
export type ProviderRespondToRequestInput = typeof ProviderRespondToRequestInput.Type;

export const ProviderRespondToUserInputInput = Schema.Struct({
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
});
export type ProviderRespondToUserInputInput = typeof ProviderRespondToUserInputInput.Type;

const ProviderEventKind = Schema.Literals(["session", "notification", "request", "error"]);

export const ProviderEvent = Schema.Struct({
  id: EventId,
  kind: ProviderEventKind,
  provider: ProviderKind,
  threadId: ThreadId,
  createdAt: IsoDateTime,
  method: TrimmedNonEmptyString,
  message: Schema.optional(TrimmedNonEmptyString),
  turnId: Schema.optional(TurnId),
  parentTurnId: Schema.optional(TurnId),
  itemId: Schema.optional(ProviderItemId),
  requestId: Schema.optional(ApprovalRequestId),
  requestKind: Schema.optional(ProviderRequestKind),
  providerThreadId: Schema.optional(TrimmedNonEmptyString),
  providerParentThreadId: Schema.optional(TrimmedNonEmptyString),
  textDelta: Schema.optional(Schema.String),
  payload: Schema.optional(Schema.Unknown),
});
export type ProviderEvent = typeof ProviderEvent.Type;
