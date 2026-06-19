// FILE: conversationEdit.ts
// Purpose: 共享策略模块，用于判断用户消息是否可被编辑并重放（replay）。
// Layer: 共享编排工具层
// Exports: collectTailTurnIds, resolveTailUserMessageEditTarget, resolveLatestTailUserMessageEditTarget

/**
 * 会话消息编辑策略模块
 *
 * 本模块定义了会话中用户消息编辑的安全策略，核心原则是：
 * **编辑操作仅允许在会话尾部（tail）执行**，以防止编辑历史消息导致上下文不一致。
 *
 * **核心概念：**
 * - **轮次（Turn）**：一次完整的请求-响应交互，包含用户消息和助手回复
 * - **尾部编辑**：只能编辑最新消息或正在进行的活跃提示
 * - **回退模式（rollback）**：编辑已完成的轮次，需要回退并重新生成
 * - **活跃尾部模式（active-tail）**：替换当前正在进行的活跃提示
 *
 * **使用场景：**
 * - 用户点击"编辑"按钮时，判断该消息是否可编辑
 * - 确定编辑操作应该采用回退还是活跃尾部替换模式
 * - 计算编辑后需要移除的轮次范围
 *
 * @packageDocumentation
 *
 * @example 判断指定消息是否可编辑
 * ```ts
 * import { resolveTailUserMessageEditTarget } from './conversationEdit';
 *
 * const messages = [
 *   { id: 'msg-1', role: 'user', turnId: 'turn-1', source: 'native' },
 *   { id: 'msg-2', role: 'assistant', turnId: 'turn-1' },
 *   { id: 'msg-3', role: 'user', turnId: 'turn-2', source: 'native' },
 * ];
 *
 * const result = resolveTailUserMessageEditTarget({
 *   messages,
 *   messageId: 'msg-3',
 *   activeTurnId: null,
 * });
 *
 * if (result.editable) {
 *   console.log(`可编辑，模式: ${result.mode}`);
 *   console.log(`需要回退 ${result.rollbackTurnCount} 个轮次`);
 * } else {
 *   console.log(`不可编辑，原因: ${result.reason}`);
 * }
 * ```
 *
 * @example 自动定位最新消息并编辑
 * ```ts
 * import { resolveLatestTailUserMessageEditTarget } from './conversationEdit';
 *
 * const result = resolveLatestTailUserMessageEditTarget({
 *   messages,
 *   activeTurnId: 'turn-3', // 当前有活跃的轮次
 * });
 *
 * if (result.editable && result.mode === 'active-tail') {
 *   // 直接替换活跃提示，无需回退
 *   replaceActivePrompt(result.messageId);
 * }
 * ```
 *
 * @see {@link collectTailTurnIds} - 收集尾部轮次 ID
 * @see {@link resolveTailUserMessageEditTarget} - 解析指定消息的编辑目标
 * @see {@link resolveLatestTailUserMessageEditTarget} - 解析最新消息的编辑目标
 */

/**
 * 轮次消息基础类型，包含消息 ID 和所属轮次 ID。
 *
 * 这是一个泛型类型，用于抽象消息的最小必要属性。
 * 其他类型（如 `EditableMessageLike`）可以基于此类型进行扩展。
 *
 * @template TTurnId - 轮次 ID 的类型，默认为 string
 *
 * @typedef {Object} TurnMessageLike
 * @property {string} id - 消息唯一标识
 * @property {TTurnId|null|undefined} turnId - 消息所属的轮次 ID，可能为空
 *
 * @example
 * ```ts
 * const message: TurnMessageLike = {
 *   id: 'msg-123',
 *   turnId: 'turn-456'
 * };
 * ```
 */
type TurnMessageLike<TTurnId extends string = string> = {
  /** 消息唯一标识 */
  readonly id: string;
  /** 消息所属的轮次 ID，可能为空 */
  readonly turnId?: TTurnId | null | undefined;
};

/**
 * 可编辑消息类型，在轮次消息基础上增加角色和来源信息。
 *
 * 此类型用于表示可以被编辑的消息，需要满足：
 * - 具有基础的消息属性（id、turnId）
 * - 具有角色信息（role），用于判断是否为用户消息
 * - 具有来源信息（source），用于判断是否为原生可编辑消息
 *
 * @typedef {Object} EditableMessageLike
 * @property {string} role - 消息角色（如 "user"、"assistant"、"system"）
 * @property {string|undefined} source - 消息来源标识
 *
 * @example
 * ```ts
 * const userMessage: EditableMessageLike = {
 *   id: 'msg-123',
 *   turnId: 'turn-456',
 *   role: 'user',
 *   source: 'native' // 原生消息，可编辑
 * };
 *
 * const systemMessage: EditableMessageLike = {
 *   id: 'msg-789',
 *   turnId: 'turn-456',
 *   role: 'system',
 *   source: 'system' // 系统消息，不可编辑
 * };
 * ```
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
 *
 * **可编辑状态（editable: true）的字段说明：**
 * - `messageId`: 目标消息的唯一 ID，用于定位消息
 * - `messageIndex`: 目标消息在消息列表中的索引，用于快速访问
 * - `mode`: 编辑模式
 *   - `"rollback"`: 消息属于已完成的轮次，需要回退该轮次并重新生成
 *   - `"active-tail"`: 消息尚无已完成轮次（活跃提示），直接替换即可
 * - `rollbackTurnCount`: 需要回退的轮次数量（rollback 模式为 1，active-tail 模式为 0）
 * - `removedTurnIds`: 将被移除的轮次 ID 列表，用于清理相关数据
 *
 * **不可编辑状态（editable: false）的原因说明：**
 * - `"missing-message"`: 未找到目标消息（消息 ID 不存在）
 * - `"not-user-message"`: 目标消息不是用户消息（角色不是 "user"）
 * - `"non-native-message"`: 消息来源非原生（如系统生成的消息），不可编辑
 * - `"not-latest-native-user-message"`: 不是最新的原生用户消息（编辑历史消息会导致上下文不一致）
 * - `"missing-turn-metadata"`: 缺少轮次元数据（无法确定编辑模式）
 * - `"spans-multiple-turns"`: 消息跨越多个轮次，编辑操作过于复杂，拒绝执行
 *
 * @typedef {Object} TailUserMessageEditTarget
 *
 * @example 可编辑状态示例
 * ```ts
 * const editableTarget: TailUserMessageEditTarget = {
 *   editable: true,
 *   messageId: 'msg-123',
 *   messageIndex: 5,
 *   mode: 'rollback',
 *   rollbackTurnCount: 1,
 *   removedTurnIds: ['turn-456']
 * };
 * ```
 *
 * @example 不可编辑状态示例
 * ```ts
 * const nonEditableTarget: TailUserMessageEditTarget = {
 *   editable: false,
 *   reason: 'not-latest-native-user-message'
 * };
 * ```
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
 *
 * 原生来源定义为 source 为 undefined 或 "native"。
 * 只有原生来源的消息才允许被编辑，这是为了防止编辑系统自动生成的消息。
 *
 * **判断规则：**
 * - `source === undefined`: 允许（默认视为原生）
 * - `source === "native"`: 允许（明确标记为原生）
 * - 其他任何值: 不允许
 *
 * @param source - 消息来源标识
 * @returns 是否为原生可编辑来源
 *
 * @private 此函数为内部实现细节，不应直接调用
 *
 * @example
 * ```ts
 * isNativeEditableSource(undefined); // true
 * isNativeEditableSource("native"); // true
 * isNativeEditableSource("system"); // false
 * isNativeEditableSource("imported"); // false
 * ```
 */
function isNativeEditableSource(source: string | undefined): boolean {
  return source === undefined || source === "native";
}

/**
 * 从消息列表中收集所有不重复的轮次 ID。
 *
 * 遍历消息列表，提取所有消息的 turnId，并使用 Set 进行去重。
 * 保留 turnId 的首次出现顺序。
 *
 * **算法复杂度：**
 * - 时间复杂度: O(n)，其中 n 为消息数量
 * - 空间复杂度: O(k)，其中 k 为不重复的轮次数量
 *
 * @template TTurnId - 轮次 ID 的类型
 * @param messages - 消息列表
 * @returns 去重后的轮次 ID 数组，保留首次出现的顺序
 *
 * @private 此函数为内部实现细节，不应直接调用
 *
 * @example
 * ```ts
 * const messages = [
 *   { id: 'msg-1', turnId: 'turn-1' },
 *   { id: 'msg-2', turnId: 'turn-1' }, // 重复
 *   { id: 'msg-3', turnId: 'turn-2' },
 *   { id: 'msg-4' }, // 无 turnId
 * ];
 *
 * collectUniqueTurnIds(messages);
 * // 返回: ['turn-1', 'turn-2']
 * ```
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
 * 从目标消息开始，收集到消息列表末尾的所有不重复轮次 ID。
 *
 * **使用场景：**
 * - 编辑消息时，需要知道从该消息开始的所有轮次
 * - 确定回退操作需要清理的轮次范围
 * - 判断消息是否跨越多个轮次
 *
 * **算法复杂度：**
 * - 时间复杂度: O(n)，其中 n 为消息数量
 * - 空间复杂度: O(k)，其中 k 为目标消息后的不重复轮次数量
 *
 * @template TTurnId - 轮次 ID 的类型
 * @param input.messages - 完整的消息列表
 * @param input.messageId - 目标消息的唯一 ID
 * @returns 从目标消息到末尾的所有不重复轮次 ID 数组；若未找到目标消息则返回空数组
 *
 * @throws 此函数不会抛出异常
 *
 * @example 目标消息在中间位置
 * ```ts
 * const messages = [
 *   { id: 'msg-1', turnId: 'turn-1' },
 *   { id: 'msg-2', turnId: 'turn-1' },
 *   { id: 'msg-3', turnId: 'turn-2' }, // 目标消息
 *   { id: 'msg-4', turnId: 'turn-2' },
 *   { id: 'msg-5', turnId: 'turn-3' },
 * ];
 *
 * collectTailTurnIds({ messages, messageId: 'msg-3' });
 * // 返回: ['turn-2', 'turn-3']
 * ```
 *
 * @example 目标消息不存在
 * ```ts
 * collectTailTurnIds({ messages, messageId: 'nonexistent' });
 * // 返回: []
 * ```
 *
 * @see {@link resolveTailUserMessageEditTarget} - 使用此函数判断编辑目标
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
 * 从后向前遍历消息列表，找到第一个满足以下条件的消息：
 * 1. 角色为 "user"
 * 2. 来源为原生可编辑来源（source 为 undefined 或 "native"）
 *
 * **使用场景：**
 * - 自动定位最新的可编辑用户消息
 * - 实现"编辑最新消息"功能
 *
 * **算法复杂度：**
 * - 时间复杂度: O(n)，其中 n 为消息数量
 * - 空间复杂度: O(1)
 *
 * @param messages - 消息列表
 * @returns 最新原生用户消息的索引；未找到则返回 -1
 *
 * @private 此函数为内部实现细节，不应直接调用
 *
 * @example 找到最新消息
 * ```ts
 * const messages = [
 *   { id: 'msg-1', role: 'user', source: 'native' },
 *   { id: 'msg-2', role: 'assistant' },
 *   { id: 'msg-3', role: 'user', source: 'native' }, // 最新
 * ];
 *
 * findLatestNativeUserMessageIndex(messages);
 * // 返回: 2
 * ```
 *
 * @example 没有可编辑的用户消息
 * ```ts
 * const messages = [
 *   { id: 'msg-1', role: 'user', source: 'imported' }, // 非原生
 *   { id: 'msg-2', role: 'assistant' },
 * ];
 *
 * findLatestNativeUserMessageIndex(messages);
 * // 返回: -1
 * ```
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
 * **决策树：**
 * ```
 * 消息是否存在？
 * ├─ 否 → 返回 { editable: false, reason: "missing-message" }
 * └─ 是 → 是否为用户消息？
 *     ├─ 否 → 返回 { editable: false, reason: "not-user-message" }
 *     └─ 是 → 是否为原生来源？
 *         ├─ 否 → 返回 { editable: false, reason: "non-native-message" }
 *         └─ 是 → 是否为最新原生用户消息？
 *             ├─ 否 → 返回 { editable: false, reason: "not-latest-native-user-message" }
 *             └─ 是 → 涉及轮次数量？
 *                 ├─ > 1 → 返回 { editable: false, reason: "spans-multiple-turns" }
 *                 ├─ = 1 → 返回 { editable: true, mode: "rollback" }
 *                 └─ = 0 → 存在活跃轮次？
 *                     ├─ 是 → 返回 { editable: true, mode: "active-tail" }
 *                     └─ 否 → 返回 { editable: false, reason: "missing-turn-metadata" }
 * ```
 *
 * **算法复杂度：**
 * - 时间复杂度: O(n)，其中 n 为消息数量
 * - 空间复杂度: O(k)，其中 k 为尾部轮次数量
 *
 * @param input.messages - 完整的消息列表
 * @param input.messageId - 待编辑的目标消息 ID
 * @param input.activeTurnId - 当前活跃的轮次 ID（可能为空）
 * @returns 编辑目标解析结果，包含可编辑状态及详细信息或不可编辑原因
 *
 * @throws 此函数不会抛出异常
 *
 * @example 回退模式（编辑已完成的轮次）
 * ```ts
 * const messages = [
 *   { id: 'msg-1', role: 'user', turnId: 'turn-1', source: 'native' },
 *   { id: 'msg-2', role: 'assistant', turnId: 'turn-1' },
 *   { id: 'msg-3', role: 'user', turnId: 'turn-2', source: 'native' }, // 目标
 *   { id: 'msg-4', role: 'assistant', turnId: 'turn-2' },
 * ];
 *
 * const result = resolveTailUserMessageEditTarget({
 *   messages,
 *   messageId: 'msg-3',
 *   activeTurnId: null,
 * });
 *
 * // result: {
 * //   editable: true,
 * //   messageId: 'msg-3',
 * //   messageIndex: 2,
 * //   mode: 'rollback',
 * //   rollbackTurnCount: 1,
 * //   removedTurnIds: ['turn-2']
 * // }
 * ```
 *
 * @example 活跃尾部模式（替换活跃提示）
 * ```ts
 * const messages = [
 *   { id: 'msg-1', role: 'user', turnId: 'turn-1', source: 'native' },
 *   { id: 'msg-2', role: 'assistant', turnId: 'turn-1' },
 *   { id: 'msg-3', role: 'user', source: 'native' }, // 目标（无 turnId）
 * ];
 *
 * const result = resolveTailUserMessageEditTarget({
 *   messages,
 *   messageId: 'msg-3',
 *   activeTurnId: 'turn-2', // 存在活跃轮次
 * });
 *
 * // result: {
 * //   editable: true,
 * //   messageId: 'msg-3',
 * //   messageIndex: 2,
 * //   mode: 'active-tail',
 * //   rollbackTurnCount: 0,
 * //   removedTurnIds: []
 * // }
 * ```
 *
 * @example 不可编辑：不是最新消息
 * ```ts
 * const messages = [
 *   { id: 'msg-1', role: 'user', turnId: 'turn-1', source: 'native' },
 *   { id: 'msg-2', role: 'assistant', turnId: 'turn-1' },
 *   { id: 'msg-3', role: 'user', turnId: 'turn-2', source: 'native' },
 * ];
 *
 * const result = resolveTailUserMessageEditTarget({
 *   messages,
 *   messageId: 'msg-1', // 尝试编辑历史消息
 *   activeTurnId: null,
 * });
 *
 * // result: { editable: false, reason: 'not-latest-native-user-message' }
 * ```
 *
 * @see {@link collectTailTurnIds} - 收集尾部轮次 ID
 * @see {@link resolveLatestTailUserMessageEditTarget} - 自动定位最新消息并解析
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
 * **使用场景：**
 * - 实现"编辑最新消息"功能
 * - 用户点击输入框的"编辑"按钮时，自动定位最新消息
 *
 * **调用流程：**
 * 1. 调用 `findLatestNativeUserMessageIndex` 查找最新的原生用户消息
 * 2. 如果未找到，返回不可编辑状态
 * 3. 如果找到，调用 `resolveTailUserMessageEditTarget` 进行详细校验
 *
 * **算法复杂度：**
 * - 时间复杂度: O(n)，其中 n 为消息数量
 * - 空间复杂度: O(k)，其中 k 为尾部轮次数量
 *
 * @param input.messages - 完整的消息列表
 * @param input.activeTurnId - 当前活跃的轮次 ID（可能为空）
 * @returns 编辑目标解析结果
 *
 * @throws 此函数不会抛出异常
 *
 * @example 成功定位并编辑最新消息
 * ```ts
 * const messages = [
 *   { id: 'msg-1', role: 'user', turnId: 'turn-1', source: 'native' },
 *   { id: 'msg-2', role: 'assistant', turnId: 'turn-1' },
 *   { id: 'msg-3', role: 'user', turnId: 'turn-2', source: 'native' },
 * ];
 *
 * const result = resolveLatestTailUserMessageEditTarget({
 *   messages,
 *   activeTurnId: null,
 * });
 *
 * // result: {
 * //   editable: true,
 * //   messageId: 'msg-3',
 * //   messageIndex: 2,
 * //   mode: 'rollback',
 * //   rollbackTurnCount: 1,
 * //   removedTurnIds: ['turn-2']
 * // }
 * ```
 *
 * @example 没有可编辑的用户消息
 * ```ts
 * const messages = [
 *   { id: 'msg-1', role: 'assistant', turnId: 'turn-1' },
 * ];
 *
 * const result = resolveLatestTailUserMessageEditTarget({
 *   messages,
 *   activeTurnId: null,
 * });
 *
 * // result: { editable: false, reason: 'missing-message' }
 * ```
 *
 * @see {@link resolveTailUserMessageEditTarget} - 解析指定消息的编辑目标
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
