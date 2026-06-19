/**
 * @file 基础类型定义
 * @description 定义全局通用的基础类型别名，包括字符串裁剪、非空校验、
 * 整数约束、日期时间格式，以及各类业务实体的品牌化 ID 类型。
 * 所有 ID 均通过品牌类型（Brand）实现类型安全，防止不同类型 ID 之间的误用。
 */

/** 裁剪首尾空白后的字符串 */
export type TrimmedString = string;
/** 裁剪后非空字符串，用于必填字段校验 */
export type TrimmedNonEmptyString = string;

/** 非负整数（>= 0） */
export type NonNegativeInt = number;
/** 正整数（>= 1） */
export type PositiveInt = number;

/** ISO 8601 日期时间字符串 */
export type IsoDateTime = string;

/**
 * 构造品牌化实体 ID，确保非空裁剪字符串并附加品牌标签
 */
type EntityId<Brand extends string> = string & { readonly __brand: Brand };

/** 会话/对话线程 ID */
export type ThreadId = EntityId<"ThreadId">;
/** 项目 ID */
export type ProjectId = EntityId<"ProjectId">;
/** 执行环境 ID */
export type EnvironmentId = EntityId<"EnvironmentId">;
/** 认证会话 ID */
export type AuthSessionId = EntityId<"AuthSessionId">;
/** 命令 ID */
export type CommandId = EntityId<"CommandId">;
/** 事件 ID */
export type EventId = EntityId<"EventId">;
/** 消息 ID */
export type MessageId = EntityId<"MessageId">;
/** 对话轮次 ID */
export type TurnId = EntityId<"TurnId">;

/** 提供者项 ID */
export type ProviderItemId = EntityId<"ProviderItemId">;
/** 运行时会话 ID */
export type RuntimeSessionId = EntityId<"RuntimeSessionId">;
/** 运行时项 ID */
export type RuntimeItemId = EntityId<"RuntimeItemId">;
/** 运行时请求 ID */
export type RuntimeRequestId = EntityId<"RuntimeRequestId">;
/** 运行时任务 ID */
export type RuntimeTaskId = EntityId<"RuntimeTaskId">;
/** 审批请求 ID */
export type ApprovalRequestId = EntityId<"ApprovalRequestId">;
/** 检查点引用标识 */
export type CheckpointRef = EntityId<"CheckpointRef">;
