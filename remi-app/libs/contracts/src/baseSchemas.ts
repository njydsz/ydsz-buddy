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
/** ThreadId 命名空间，提供不安全的类型构造方法 */
export namespace ThreadId {
  /**
   * 不安全地构造 ThreadId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 ThreadId 品牌类型
   *
   * @example
   * ```typescript
   * const id = ThreadId.makeUnsafe("thread-123");
   * ```
   */
  export function makeUnsafe(value: string): ThreadId {
    return value as ThreadId;
  }
}

/** 项目 ID */
export type ProjectId = string & { readonly __brand: "ProjectId" };
/** ProjectId 命名空间，提供不安全的类型构造方法 */
export namespace ProjectId {
  /**
   * 不安全地构造 ProjectId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 ProjectId 品牌类型
   */
  export function makeUnsafe(value: string): ProjectId {
    return value as ProjectId;
  }
}

/** 执行环境 ID */
export type EnvironmentId = string & { readonly __brand: "EnvironmentId" };
/** EnvironmentId 命名空间，提供不安全的类型构造方法 */
export namespace EnvironmentId {
  /**
   * 不安全地构造 EnvironmentId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 EnvironmentId 品牌类型
   */
  export function makeUnsafe(value: string): EnvironmentId {
    return value as EnvironmentId;
  }
}

/** 认证会话 ID */
export type AuthSessionId = string & { readonly __brand: "AuthSessionId" };
/** AuthSessionId 命名空间，提供不安全的类型构造方法 */
export namespace AuthSessionId {
  /**
   * 不安全地构造 AuthSessionId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 AuthSessionId 品牌类型
   */
  export function makeUnsafe(value: string): AuthSessionId {
    return value as AuthSessionId;
  }
}

/** 命令 ID */
export type CommandId = string & { readonly __brand: "CommandId" };
/** CommandId 命名空间，提供不安全的类型构造方法 */
export namespace CommandId {
  /**
   * 不安全地构造 CommandId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 CommandId 品牌类型
   */
  export function makeUnsafe(value: string): CommandId {
    return value as CommandId;
  }
}

/** 事件 ID */
export type EventId = string & { readonly __brand: "EventId" };
/** EventId 命名空间，提供不安全的类型构造方法 */
export namespace EventId {
  /**
   * 不安全地构造 EventId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 EventId 品牌类型
   */
  export function makeUnsafe(value: string): EventId {
    return value as EventId;
  }
}

/** 消息 ID */
export type MessageId = string & { readonly __brand: "MessageId" };
/** MessageId 命名空间，提供不安全的类型构造方法 */
export namespace MessageId {
  /**
   * 不安全地构造 MessageId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 MessageId 品牌类型
   */
  export function makeUnsafe(value: string): MessageId {
    return value as MessageId;
  }
}

/** 对话轮次 ID */
export type TurnId = string & { readonly __brand: "TurnId" };
/** TurnId 命名空间，提供不安全的类型构造方法 */
export namespace TurnId {
  /**
   * 不安全地构造 TurnId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 TurnId 品牌类型
   */
  export function makeUnsafe(value: string): TurnId {
    return value as TurnId;
  }
}

/** 提供者项 ID */
export type ProviderItemId = string & { readonly __brand: "ProviderItemId" };
/** ProviderItemId 命名空间，提供不安全的类型构造方法 */
export namespace ProviderItemId {
  /**
   * 不安全地构造 ProviderItemId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 ProviderItemId 品牌类型
   */
  export function makeUnsafe(value: string): ProviderItemId {
    return value as ProviderItemId;
  }
}

/** 运行时会话 ID */
export type RuntimeSessionId = string & { readonly __brand: "RuntimeSessionId" };
/** RuntimeSessionId 命名空间，提供不安全的类型构造方法 */
export namespace RuntimeSessionId {
  /**
   * 不安全地构造 RuntimeSessionId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 RuntimeSessionId 品牌类型
   */
  export function makeUnsafe(value: string): RuntimeSessionId {
    return value as RuntimeSessionId;
  }
}

/** 运行时项 ID */
export type RuntimeItemId = string & { readonly __brand: "RuntimeItemId" };
/** RuntimeItemId 命名空间，提供不安全的类型构造方法 */
export namespace RuntimeItemId {
  /**
   * 不安全地构造 RuntimeItemId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 RuntimeItemId 品牌类型
   */
  export function makeUnsafe(value: string): RuntimeItemId {
    return value as RuntimeItemId;
  }
}

/** 运行时请求 ID */
export type RuntimeRequestId = string & { readonly __brand: "RuntimeRequestId" };
/** RuntimeRequestId 命名空间，提供不安全的类型构造方法 */
export namespace RuntimeRequestId {
  /**
   * 不安全地构造 RuntimeRequestId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 RuntimeRequestId 品牌类型
   */
  export function makeUnsafe(value: string): RuntimeRequestId {
    return value as RuntimeRequestId;
  }
}

/** 运行时任务 ID */
export type RuntimeTaskId = string & { readonly __brand: "RuntimeTaskId" };
/** RuntimeTaskId 命名空间，提供不安全的类型构造方法 */
export namespace RuntimeTaskId {
  /**
   * 不安全地构造 RuntimeTaskId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 RuntimeTaskId 品牌类型
   */
  export function makeUnsafe(value: string): RuntimeTaskId {
    return value as RuntimeTaskId;
  }
}

/** 审批请求 ID */
export type ApprovalRequestId = string & { readonly __brand: "ApprovalRequestId" };
/** ApprovalRequestId 命名空间，提供不安全的类型构造方法 */
export namespace ApprovalRequestId {
  /**
   * 不安全地构造 ApprovalRequestId，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 ApprovalRequestId 品牌类型
   */
  export function makeUnsafe(value: string): ApprovalRequestId {
    return value as ApprovalRequestId;
  }
}

/** 检查点引用标识 */
export type CheckpointRef = string & { readonly __brand: "CheckpointRef" };
/** CheckpointRef 命名空间，提供不安全的类型构造方法 */
export namespace CheckpointRef {
  /**
   * 不安全地构造 CheckpointRef，不执行任何运行时校验
   *
   * @param value - 原始字符串值
   * @returns 构造出的 CheckpointRef 品牌类型
   */
  export function makeUnsafe(value: string): CheckpointRef {
    return value as CheckpointRef;
  }
}
