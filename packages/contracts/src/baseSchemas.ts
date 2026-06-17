/**
 * 基础 Schema 定义
 *
 * 用途：提供项目中通用的基础类型约束和品牌化标识符（Branded Identifier）。
 * 所属模块：共享契约层（Shared Contracts）
 * 主要导出：
 *   - TrimmedString / TrimmedNonEmptyString —— 基础字符串约束
 *   - NonNegativeInt / PositiveInt —— 整数约束
 *   - IsoDateTime —— ISO 日期时间字符串类型
 *   - makeEntityId —— 品牌化标识符工厂函数
 *   - ThreadId / ProjectId / EnvironmentId 等品牌化实体 ID
 *   - ProviderItemId / RuntimeSessionId / ApprovalRequestId 等运行时 ID
 */

import { Schema } from "effect";

/** 去除首尾空格的字符串 */
export const TrimmedString = Schema.Trim;
/** 去除首尾空格且非空的字符串 */
export const TrimmedNonEmptyString = TrimmedString.check(Schema.isNonEmpty());

/** 非负整数（>= 0） */
export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
/** 正整数（>= 1） */
export const PositiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

/** ISO 日期时间字符串 */
export const IsoDateTime = Schema.String;
export type IsoDateTime = typeof IsoDateTime.Type;

/**
 * 构造一个品牌化标识符（Branded Identifier），
 * 强制要求字符串为非空且去除首尾空格。
 * @param brand - 品牌名称，用于类型区分
 */
const makeEntityId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

/** 线程 ID */
export const ThreadId = makeEntityId("ThreadId");
export type ThreadId = typeof ThreadId.Type;
/** 项目 ID */
export const ProjectId = makeEntityId("ProjectId");
export type ProjectId = typeof ProjectId.Type;
/** 环境 ID */
export const EnvironmentId = makeEntityId("EnvironmentId");
export type EnvironmentId = typeof EnvironmentId.Type;
/** 认证会话 ID */
export const AuthSessionId = makeEntityId("AuthSessionId");
export type AuthSessionId = typeof AuthSessionId.Type;
/** 命令 ID */
export const CommandId = makeEntityId("CommandId");
export type CommandId = typeof CommandId.Type;
/** 事件 ID */
export const EventId = makeEntityId("EventId");
export type EventId = typeof EventId.Type;
/** 消息 ID */
export const MessageId = makeEntityId("MessageId");
export type MessageId = typeof MessageId.Type;
/** 对话轮次 ID */
export const TurnId = makeEntityId("TurnId");
export type TurnId = typeof TurnId.Type;

/** Provider 条目 ID */
export const ProviderItemId = makeEntityId("ProviderItemId");
export type ProviderItemId = typeof ProviderItemId.Type;
/** 运行时会话 ID */
export const RuntimeSessionId = makeEntityId("RuntimeSessionId");
export type RuntimeSessionId = typeof RuntimeSessionId.Type;
/** 运行时条目 ID */
export const RuntimeItemId = makeEntityId("RuntimeItemId");
export type RuntimeItemId = typeof RuntimeItemId.Type;
/** 运行时请求 ID */
export const RuntimeRequestId = makeEntityId("RuntimeRequestId");
export type RuntimeRequestId = typeof RuntimeRequestId.Type;
/** 运行时任务 ID */
export const RuntimeTaskId = makeEntityId("RuntimeTaskId");
export type RuntimeTaskId = typeof RuntimeTaskId.Type;
/** 审批请求 ID */
export const ApprovalRequestId = makeEntityId("ApprovalRequestId");
export type ApprovalRequestId = typeof ApprovalRequestId.Type;
/** 检查点引用 */
export const CheckpointRef = makeEntityId("CheckpointRef");
export type CheckpointRef = typeof CheckpointRef.Type;