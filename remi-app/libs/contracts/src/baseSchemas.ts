/**
 * @file 基础类型定义
 * @description 定义全局通用的基础类型别名，包括字符串裁剪、非空校验、
 * 整数约束、日期时间格式，以及各类业务实体的品牌化 ID 类型。
 * 所有 ID 均通过品牌类型（Brand）实现类型安全，防止不同类型 ID 之间的误用。
 */

import { Schema } from "effect";

/** 裁剪首尾空白后的字符串 */
export type TrimmedString = string;
/** 裁剪后非空字符串，用于必填字段校验 */
export type TrimmedNonEmptyString = string;

/** 裁剪后非空字符串 Schema */
export const TrimmedNonEmptyString = Schema.String.pipe(
  Schema.filter((s) => s.trim().length > 0, { message: () => "String must not be empty after trimming" })
);

/** 非负整数（>= 0） */
export type NonNegativeInt = number;
/** 非负整数 Schema */
export const NonNegativeInt = Schema.Number.pipe(
  Schema.filter((n) => n >= 0 && Number.isInteger(n), { message: () => "Must be a non-negative integer" })
);

/** 正整数（>= 1） */
export type PositiveInt = number;
/** 正整数 Schema */
export const PositiveInt = Schema.Number.pipe(
  Schema.filter((n) => n >= 1 && Number.isInteger(n), { message: () => "Must be a positive integer" })
);

/** ISO 8601 日期时间字符串 */
export type IsoDateTime = string;
/** ISO 8601 日期时间字符串 Schema */
export const IsoDateTime = Schema.String.pipe(
  Schema.filter((s) => !isNaN(Date.parse(s)), { message: () => "Must be a valid ISO 8601 date string" })
);

/** 会话/对话线程 ID */
export type ThreadId = string & { readonly __brand: "ThreadId" };
/** 线程 ID Schema */
export const ThreadId = Schema.String.pipe(Schema.brand("ThreadId"));

/** 项目 ID */
export type ProjectId = string & { readonly __brand: "ProjectId" };
/** 项目 ID Schema */
export const ProjectId = Schema.String.pipe(Schema.brand("ProjectId"));

/** 执行环境 ID */
export type EnvironmentId = string & { readonly __brand: "EnvironmentId" };
/** 执行环境 ID Schema */
export const EnvironmentId = Schema.String.pipe(Schema.brand("EnvironmentId"));

/** 认证会话 ID */
export type AuthSessionId = string & { readonly __brand: "AuthSessionId" };
/** 认证会话 ID Schema */
export const AuthSessionId = Schema.String.pipe(Schema.brand("AuthSessionId"));

/** 命令 ID */
export type CommandId = string & { readonly __brand: "CommandId" };
/** 命令 ID Schema */
export const CommandId = Schema.String.pipe(Schema.brand("CommandId"));

/** 事件 ID */
export type EventId = string & { readonly __brand: "EventId" };
/** 事件 ID Schema */
export const EventId = Schema.String.pipe(Schema.brand("EventId"));

/** 消息 ID */
export type MessageId = string & { readonly __brand: "MessageId" };
/** 消息 ID Schema */
export const MessageId = Schema.String.pipe(Schema.brand("MessageId"));

/** 对话轮次 ID */
export type TurnId = string & { readonly __brand: "TurnId" };
/** 对话轮次 ID Schema */
export const TurnId = Schema.String.pipe(Schema.brand("TurnId"));

/** 提供者项 ID */
export type ProviderItemId = string & { readonly __brand: "ProviderItemId" };
/** 提供者项 ID Schema */
export const ProviderItemId = Schema.String.pipe(Schema.brand("ProviderItemId"));

/** 运行时会话 ID */
export type RuntimeSessionId = string & { readonly __brand: "RuntimeSessionId" };
/** 运行时会话 ID Schema */
export const RuntimeSessionId = Schema.String.pipe(Schema.brand("RuntimeSessionId"));

/** 运行时项 ID */
export type RuntimeItemId = string & { readonly __brand: "RuntimeItemId" };
/** 运行时项 ID Schema */
export const RuntimeItemId = Schema.String.pipe(Schema.brand("RuntimeItemId"));

/** 运行时请求 ID */
export type RuntimeRequestId = string & { readonly __brand: "RuntimeRequestId" };
/** 运行时请求 ID Schema */
export const RuntimeRequestId = Schema.String.pipe(Schema.brand("RuntimeRequestId"));

/** 运行时任务 ID */
export type RuntimeTaskId = string & { readonly __brand: "RuntimeTaskId" };
/** 运行时任务 ID Schema */
export const RuntimeTaskId = Schema.String.pipe(Schema.brand("RuntimeTaskId"));

/** 审批请求 ID */
export type ApprovalRequestId = string & { readonly __brand: "ApprovalRequestId" };
/** 审批请求 ID Schema */
export const ApprovalRequestId = Schema.String.pipe(Schema.brand("ApprovalRequestId"));

/** 检查点引用标识 */
export type CheckpointRef = string & { readonly __brand: "CheckpointRef" };
/** 检查点引用标识 Schema */
export const CheckpointRef = Schema.String.pipe(Schema.brand("CheckpointRef"));
