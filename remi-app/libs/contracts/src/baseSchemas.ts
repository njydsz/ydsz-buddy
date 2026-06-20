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

/** 会话/对话线程 ID */
export type ThreadId = string & { readonly __brand: "ThreadId" };
export namespace ThreadId {
  export function makeUnsafe(value: string): ThreadId {
    return value as ThreadId;
  }
}

/** 项目 ID */
export type ProjectId = string & { readonly __brand: "ProjectId" };
export namespace ProjectId {
  export function makeUnsafe(value: string): ProjectId {
    return value as ProjectId;
  }
}

/** 执行环境 ID */
export type EnvironmentId = string & { readonly __brand: "EnvironmentId" };
export namespace EnvironmentId {
  export function makeUnsafe(value: string): EnvironmentId {
    return value as EnvironmentId;
  }
}

/** 认证会话 ID */
export type AuthSessionId = string & { readonly __brand: "AuthSessionId" };
export namespace AuthSessionId {
  export function makeUnsafe(value: string): AuthSessionId {
    return value as AuthSessionId;
  }
}

/** 命令 ID */
export type CommandId = string & { readonly __brand: "CommandId" };
export namespace CommandId {
  export function makeUnsafe(value: string): CommandId {
    return value as CommandId;
  }
}

/** 事件 ID */
export type EventId = string & { readonly __brand: "EventId" };
export namespace EventId {
  export function makeUnsafe(value: string): EventId {
    return value as EventId;
  }
}

/** 消息 ID */
export type MessageId = string & { readonly __brand: "MessageId" };
export namespace MessageId {
  export function makeUnsafe(value: string): MessageId {
    return value as MessageId;
  }
}

/** 对话轮次 ID */
export type TurnId = string & { readonly __brand: "TurnId" };
export namespace TurnId {
  export function makeUnsafe(value: string): TurnId {
    return value as TurnId;
  }
}

/** 提供者项 ID */
export type ProviderItemId = string & { readonly __brand: "ProviderItemId" };
export namespace ProviderItemId {
  export function makeUnsafe(value: string): ProviderItemId {
    return value as ProviderItemId;
  }
}

/** 运行时会话 ID */
export type RuntimeSessionId = string & { readonly __brand: "RuntimeSessionId" };
export namespace RuntimeSessionId {
  export function makeUnsafe(value: string): RuntimeSessionId {
    return value as RuntimeSessionId;
  }
}

/** 运行时项 ID */
export type RuntimeItemId = string & { readonly __brand: "RuntimeItemId" };
export namespace RuntimeItemId {
  export function makeUnsafe(value: string): RuntimeItemId {
    return value as RuntimeItemId;
  }
}

/** 运行时请求 ID */
export type RuntimeRequestId = string & { readonly __brand: "RuntimeRequestId" };
export namespace RuntimeRequestId {
  export function makeUnsafe(value: string): RuntimeRequestId {
    return value as RuntimeRequestId;
  }
}

/** 运行时任务 ID */
export type RuntimeTaskId = string & { readonly __brand: "RuntimeTaskId" };
export namespace RuntimeTaskId {
  export function makeUnsafe(value: string): RuntimeTaskId {
    return value as RuntimeTaskId;
  }
}

/** 审批请求 ID */
export type ApprovalRequestId = string & { readonly __brand: "ApprovalRequestId" };
export namespace ApprovalRequestId {
  export function makeUnsafe(value: string): ApprovalRequestId {
    return value as ApprovalRequestId;
  }
}

/** 检查点引用标识 */
export type CheckpointRef = string & { readonly __brand: "CheckpointRef" };
export namespace CheckpointRef {
  export function makeUnsafe(value: string): CheckpointRef {
    return value as CheckpointRef;
  }
}
