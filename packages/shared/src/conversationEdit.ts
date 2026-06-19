// FILE: conversationEdit.ts
// Purpose: 共享策略模块，用于判断用户消息是否可被编辑并重放（replay）。
// Layer: 共享编排工具层
// Exports: collectTailTurnIds, resolveTailUserMessageEditTarget, resolveLatestTailUserMessageEditTarget

/**
 * 轮次消息基础类型，包含消息 ID 和所属轮次 ID。
 * @template TTurnId - 轮次 ID 的类型，默认为 string
 */
type TurnMessageLike<TTurnId extends string = string> = {
  /** 消息唯一标识 */
  readonly id: string;
  /** 消息所属的轮次 ID，可能为空 */
  readonly turnId?: TTurnId | null | undefined;
};

/**
 * 可编辑消息类型，在轮次消息基础上增加角色和来源信息。
 */
type EditableMessageLike = TurnMessageLike & {
  /** 消息角色（如 "user"、"assistant"） */
  readonly role: string;
  /** 消息来源标识，"native" 或 undefined 表示原生可编辑消息 */
  readonly source?: string | undefined;
};

/**
 * 尾部用户消息编辑目标结果类型。
 *
 * 编辑操作仅在会话尾部（tail）安全执行：
 * - 回退（rollback）最后一个已完成的轮次
 * - 替换当前进行中的活跃提示（active prompt）
 *
 * 当 editable 为 true 时，包含编辑所需的全部信息；
 * 当 editable 为 false 时，包含不可编辑的原因。
 */
export type TailUserMessageEditTarget =
  | {
      /** 标记为可编辑 */
      readonly editable: true;
      /** 目标消息的唯一 ID */
      readonly messageId: string;
      /** 目标消息在消息列表中的索引 */
      readonly messageIndex: number;
      /** 编辑模式："rollback" 表示回退已完成轮次，"active-tail" 表示替换活跃提示 */
      readonly mode: "rollback" | "active-tail";
      /** 需要回退的轮次数量 */
      readonly rollbackTurnCount: number;
      /** 将被移除的轮次 ID 列表 */
      readonly removedTurnIds: ReadonlyArray<string>;
    }
  | {
      /** 标记为不可编辑 */
      readonly editable: false;
      /**
       * 不可编辑的原因：
       * - "missing-message": 未找到目标消息
       * - "not-user-message": 目标消息不是用户消息
       * - "non-native-message": 消息来源非原生，不可编辑
       * - "not-latest-native-user-message": 不是最新的原生用户消息
       * - "missing-turn-metadata": 缺少轮次元数据
       * - "spans-multiple-turns": 消息跨越多个轮次，无法安全编辑
       */
      readonly reason:
        | "missing-message"
        | "not-user-message"
        | "non-native-message"
        | "not-latest-native-user-message"
        | "missing-turn-metadata"
        | "spans-multiple-turns";
    };

/**
 * 判断消息来源是否为原生可编辑来源。
 * 原生来源定义为 source 为 undefined 或 "native"。
 *
 * @param source - 消息来源标识
 * @returns 是否为原生可编辑来源
 */
function isNativeEditableSource(source: string | undefined): boolean {
  return source === undefined || source === "native";
}

/**
 * 从消息列表中收集所有不重复的轮次 ID。
 *
 * @param messages - 消息列表
 * @returns 去重后的轮次 ID 数组
 */
function collectUniqueTurnIds<TTurnId extends string>(
  messages: ReadonlyArray<TurnMessageLike<TTurnId>>,
): TTurnId[] {
  return [...new Set(messages.flatMap((message) => (message.turnId ? [message.turnId] : [])))];
}

/**
 * 收集从指定消息位置到消息列表末尾的所有轮次 ID。
 *
 * 用于确定编辑某条消息时需要移除/回退的轮次范围。
 *
 * @param input.messages - 完整的消息列表
 * @param input.messageId - 目标消息的唯一 ID
 * @returns 从目标消息到末尾的所有不重复轮次 ID 数组；若未找到目标消息则返回空数组
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

/**
 * 从消息列表末尾向前查找最新的原生可编辑用户消息索引。
 *
 * @param messages - 消息列表
 * @returns 最新原生用户消息的索引；未找到则返回 -1
 */
function findLatestNativeUserMessageIndex(messages: ReadonlyArray<EditableMessageLike>): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && isNativeEditableSource(message.source)) {
      return index;
    }
  }
  return -1;
}

/**
 * 解析指定用户消息是否可作为尾部编辑目标。
 *
 * 编辑操作仅在会话尾部安全执行，需满足以下全部条件：
 * 1. 目标消息存在且为用户消息
 * 2. 消息来源为原生可编辑来源
 * 3. 消息是最新的原生用户消息
 * 4. 消息涉及的轮次数量不超过 1 个
 *
 * 根据轮次状态返回两种编辑模式：
 * - "rollback"：消息属于已完成的轮次，需回退 1 个轮次
 * - "active-tail"：消息尚无已完成轮次（活跃提示），直接替换
 *
 * @param input.messages - 完整的消息列表
 * @param input.messageId - 待编辑的目标消息 ID
 * @param input.activeTurnId - 当前活跃的轮次 ID（可能为空）
 * @returns 编辑目标解析结果，包含可编辑状态及详细信息或不可编辑原因
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

  // 确保目标消息是最新的原生用户消息，防止编辑历史消息导致上下文不一致
  const latestNativeUserIndex = findLatestNativeUserMessageIndex(input.messages);
  if (messageIndex !== latestNativeUserIndex) {
    return { editable: false, reason: "not-latest-native-user-message" };
  }

  const removedTurnIds = collectTailTurnIds({
    messages: input.messages,
    messageId: input.messageId,
  });
  // 消息跨越多个轮次时，编辑操作过于复杂，拒绝执行
  if (removedTurnIds.length > 1) {
    return { editable: false, reason: "spans-multiple-turns" };
  }

  // 消息属于一个已完成的轮次，执行回退模式
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

  // 消息尚无已完成轮次，若存在活跃轮次则执行活跃尾部替换模式
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
 * 自动定位最新的原生用户消息并解析其是否可作为尾部编辑目标。
 *
 * 是 `resolveTailUserMessageEditTarget` 的便捷封装，
 * 自动查找最新的原生用户消息并以其作为编辑目标进行校验。
 *
 * @param input.messages - 完整的消息列表
 * @param input.activeTurnId - 当前活跃的轮次 ID（可能为空）
 * @returns 编辑目标解析结果
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
