/**
 * @file 基础 Schema 定义
 * @description 定义全局通用的基础 Schema 和类型别名，包括字符串裁剪、非空校验、
 * 整数约束、日期时间格式，以及各类业务实体的品牌化 ID 类型。
 * 所有 ID 均通过品牌类型（Brand）实现类型安全，防止不同类型 ID 之间的误用。
 */
import { Schema } from "effect";

/** 裁剪首尾空白后的字符串 */
export const TrimmedString = Schema.Trim;
/** 裁剪后非空字符串，用于必填字段校验 */
export const TrimmedNonEmptyString = TrimmedString.check(Schema.isNonEmpty());

/** 非负整数（>= 0） */
export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
/** 正整数（>= 1） */
export const PositiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

/** ISO 8601 日期时间字符串 */
export const IsoDateTime = Schema.String;
export type IsoDateTime = typeof IsoDateTime.Type;

/**
 * 构造品牌化实体 ID，确保非空裁剪字符串并附加品牌标签
 */
const makeEntityId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

/** 会话/对话线程 ID */
export const ThreadId = makeEntityId("ThreadId");
export type ThreadId = typeof ThreadId.Type;
/** 项目 ID */
export const ProjectId = makeEntityId("ProjectId");
export type ProjectId = typeof ProjectId.Type;
/** 执行环境 ID */
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

/** 提供者项 ID */
export const ProviderItemId = makeEntityId("ProviderItemId");
export type ProviderItemId = typeof ProviderItemId.Type;
/** 运行时会话 ID */
export const RuntimeSessionId = makeEntityId("RuntimeSessionId");
export type RuntimeSessionId = typeof RuntimeSessionId.Type;
/** 运行时项 ID */
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
/** 检查点引用标识 */
export const CheckpointRef = makeEntityId("CheckpointRef");
export type CheckpointRef = typeof CheckpointRef.Type;
