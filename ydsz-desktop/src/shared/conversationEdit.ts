/**
 * @file 对话编辑工具模块
 *
 * 本模块提供用户消息编辑和重放策略的共享策略，决定用户消息是否可以编辑和重放：
 *
 * - **编辑目标解析**：判断给定消息是否为可编辑的目标
 * - **尾部消息识别**：识别消息列表中可编辑的最新用户消息
 * - **回滚计数**：计算编辑涉及的需要回滚的 turn 数量
 *
 * ## 核心导出
 *
 * - `TailUserMessageEditTarget`：尾部用户消息编辑目标
 * - `collectTailTurnIds`：收集消息所在 turn 的所有 turn ID
 * - `resolveTailUserMessageEditTarget`：解析给定消息的编辑目标
 * - `resolveLatestTailUserMessageEditTarget`：解析最新尾部用户消息的编辑目标
 *
 * ## 使用场景
 *
 * - 消息编辑功能：用户编辑已发送的消息并重放
 * - 尾部消息处理：仅允许编辑最新用户消息
 * - Turn 回滚：编辑消息时需要回滚相关的 turn
 *
 * ## 编辑规则
 *
 * - 仅 `source` 为 `undefined` 或 `"native"` 的用户消息可编辑
 * - 必须是最新一条原生用户消息
 * - 涉及多个 turn 时不允许编辑（`spans-multiple-turns`）
 * - 活跃 turn 期间的消息仅支持替换模式（`active-tail`）
 */

type TurnMessageLike<TTurnId extends string = string> = {
  /** 消息 ID */
  readonly id: string;
  /** 所属的 Turn ID */
  readonly turnId?: TTurnId | null | undefined;
};

type EditableMessageLike = TurnMessageLike & {
  /** 消息角色 */
  readonly role: string;
  /** 消息来源（可选，undefined 或 "native" 表示原生消息） */
  readonly source?: string | undefined;
};

/**
 * 尾部用户消息编辑目标。
 *
 * 表示一个消息是否可编辑，以及不可编辑时的具体原因。
 */
export type TailUserMessageEditTarget =
  | {
      /** 可编辑 */
      readonly editable: true;
      /** 消息 ID */
      readonly messageId: string;
      /** 消息在数组中的索引 */
      readonly messageIndex: number;
      /** 编辑模式：回滚或激活尾部 */
      readonly mode: "rollback" | "active-tail";
      /** 需要回滚的 turn 数量 */
      readonly rollbackTurnCount: number;
      /** 被移除的 turn ID 数组 */
      readonly removedTurnIds: ReadonlyArray<string>;
    }
  | {
      /** 不可编辑 */
      readonly editable: false;
      /** 不可编辑的原因 */
      readonly reason:
        | "missing-message"
        | "not-user-message"
        | "non-native-message"
        | "not-latest-native-user-message"
        | "missing-turn-metadata"
        | "spans-multiple-turns";
    };

function isNativeEditableSource(source: string | undefined): boolean {
  return source === undefined || source === "native";
}

function collectUniqueTurnIds<TTurnId extends string>(
  messages: ReadonlyArray<TurnMessageLike<TTurnId>>,
): TTurnId[] {
  return [...new Set(messages.flatMap((message) => (message.turnId ? [message.turnId] : [])))];
}

/**
 * 收集消息所在 turn 的所有 turn ID。
 *
 * 从给定消息位置开始到消息数组末尾，收集所有消息的 turn ID（去重）。
 *
 * @param input - 输入参数
 * @param input.messages - 消息数组
 * @param input.messageId - 目标消息 ID
 * @returns 去重后的 turn ID 数组
 */
export function collectTailTurnIds<TTurnId extends string>(input: {
  readonly messages: ReadonlyArray<TurnMessageLike<TTurnId>>;
  readonly messageId: string;
}): TTurnId[] {
  const messageIndex = input.messages.findIndex((message) => message.id === input.messageId);
  if (messageIndex < 0) {
    return [];
  }
  return collectUniqueTurnIds(input.messages.slice(messageIndex));
}

function findLatestNativeUserMessageIndex(messages: ReadonlyArray<EditableMessageLike>): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && isNativeEditableSource(message.source)) {
      return index;
    }
  }
  return -1;
}

// Edits are only safe at the tail: either replay the last concrete turn, or replace the active prompt.
/**
 * 解析给定消息的编辑目标。
 *
 * 仅在尾部编辑安全：要么重放最后一个具体 turn，要么替换活跃提示。
 *
 * @param input - 输入参数
 * @param input.messages - 消息数组
 * @param input.messageId - 目标消息 ID
 * @param input.activeTurnId - 活跃 turn ID（可选）
 * @returns 编辑目标（包含可编辑状态或不可编辑原因）
 */
export function resolveTailUserMessageEditTarget(input: {
  readonly messages: ReadonlyArray<EditableMessageLike>;
  readonly messageId: string;
  readonly activeTurnId?: string | null | undefined;
}): TailUserMessageEditTarget {
  const messageIndex = input.messages.findIndex((message) => message.id === input.messageId);
  if (messageIndex < 0) {
    return { editable: false, reason: "missing-message" };
  }

  const message = input.messages[messageIndex];
  if (!message || message.role !== "user") {
    return { editable: false, reason: "not-user-message" };
  }
  if (!isNativeEditableSource(message.source)) {
    return { editable: false, reason: "non-native-message" };
  }

  const latestNativeUserIndex = findLatestNativeUserMessageIndex(input.messages);
  if (messageIndex !== latestNativeUserIndex) {
    return { editable: false, reason: "not-latest-native-user-message" };
  }

  const removedTurnIds = collectTailTurnIds({
    messages: input.messages,
    messageId: input.messageId,
  });
  if (removedTurnIds.length > 1) {
    return { editable: false, reason: "spans-multiple-turns" };
  }

  if (removedTurnIds.length === 1) {
    return {
      editable: true,
      messageId: message.id,
      messageIndex,
      mode: "rollback",
      rollbackTurnCount: 1,
      removedTurnIds,
    };
  }

  if (input.activeTurnId) {
    return {
      editable: true,
      messageId: message.id,
      messageIndex,
      mode: "active-tail",
      rollbackTurnCount: 0,
      removedTurnIds: [],
    };
  }

  return { editable: false, reason: "missing-turn-metadata" };
}

/**
 * 解析最新尾部用户消息的编辑目标。
 *
 * 自动查找最新一条原生用户消息，然后调用 `resolveTailUserMessageEditTarget`。
 *
 * @param input - 输入参数
 * @param input.messages - 消息数组
 * @param input.activeTurnId - 活跃 turn ID（可选）
 * @returns 编辑目标（包含可编辑状态或不可编辑原因）
 */
export function resolveLatestTailUserMessageEditTarget(input: {
  readonly messages: ReadonlyArray<EditableMessageLike>;
  readonly activeTurnId?: string | null | undefined;
}): TailUserMessageEditTarget {
  const latestNativeUserIndex = findLatestNativeUserMessageIndex(input.messages);
  const latestNativeUserMessage = input.messages[latestNativeUserIndex];
  if (!latestNativeUserMessage) {
    return { editable: false, reason: "missing-message" };
  }
  return resolveTailUserMessageEditTarget({
    messages: input.messages,
    messageId: latestNativeUserMessage.id,
    activeTurnId: input.activeTurnId,
  });
}
