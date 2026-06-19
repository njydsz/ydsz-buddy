/**
 * @file subagents.ts
 * @description 子代理运行时数据解析工具模块
 * @purpose 提供子代理（subagent）运行时数据的共享解析函数，供服务端数据摄入和 Web UI 使用
 * @exports 接收者 ID、接收者代理、代理状态和身份提示的数据解码器
 */

/**
 * @interface ParsedSubagentReceiverAgent
 * @description 解析后的子代理接收者代理信息接口
 * @property {string} providerThreadId - 提供者线程 ID，用于唯一标识一个子代理会话
 * @property {string} [agentId] - 代理 ID，可选
 * @property {string} [nickname] - 代理昵称，可选
 * @property {string} [role] - 代理角色，可选
 * @property {string} [model] - 使用的模型名称，可选
 * @property {string} [prompt] - 提示词内容，可选
 * @property {boolean} [modelIsRequestedHint] - 标记模型是否为请求提示（而非直接指定），可选
 */
export interface ParsedSubagentReceiverAgent {
  providerThreadId: string;
  agentId?: string | undefined;
  nickname?: string | undefined;
  role?: string | undefined;
  model?: string | undefined;
  prompt?: string | undefined;
  modelIsRequestedHint?: boolean | undefined;
}

/**
 * @interface ParsedSubagentAgentState
 * @description 解析后的子代理状态信息接口
 * @property {string} threadId - 线程 ID
 * @property {string} [agentId] - 代理 ID，可选
 * @property {string} [nickname] - 代理昵称，可选
 * @property {string} [role] - 代理角色，可选
 * @property {string} [model] - 使用的模型名称，可选
 * @property {string} [prompt] - 提示词内容，可选
 * @property {string} [status] - 代理当前状态，可选
 * @property {string} [message] - 状态消息或摘要，可选
 */
export interface ParsedSubagentAgentState {
  threadId: string;
  agentId?: string | undefined;
  nickname?: string | undefined;
  role?: string | undefined;
  model?: string | undefined;
  prompt?: string | undefined;
  status?: string | undefined;
  message?: string | undefined;
}

/**
 * @interface ParsedSubagentIdentityHint
 * @description 解析后的子代理身份提示信息接口
 * @note 包含子代理的所有可能身份信息，用于身份识别和合并
 * @property {string} [providerThreadId] - 提供者线程 ID，可选
 * @property {string} [agentId] - 代理 ID，可选
 * @property {string} [nickname] - 代理昵称，可选
 * @property {string} [role] - 代理角色，可选
 * @property {string} [model] - 使用的模型名称，可选
 * @property {string} [prompt] - 提示词内容，可选
 * @property {string} [status] - 代理状态，可选
 * @property {string} [message] - 状态消息，可选
 * @property {boolean} [modelIsRequestedHint] - 标记模型是否为请求提示，可选
 */
export interface ParsedSubagentIdentityHint {
  providerThreadId?: string | undefined;
  agentId?: string | undefined;
  nickname?: string | undefined;
  role?: string | undefined;
  model?: string | undefined;
  prompt?: string | undefined;
  status?: string | undefined;
  message?: string | undefined;
  modelIsRequestedHint?: boolean | undefined;
}

/**
 * @interface ParsedSubagentIdentityDirectory
 * @description 子代理身份目录接口，提供按不同维度的索引查找
 * @property {ReadonlyMap<string, ParsedSubagentIdentityHint>} byProviderThreadId - 按提供者线程 ID 索引的身份映射
 * @property {ReadonlyMap<string, ParsedSubagentIdentityHint>} byAgentId - 按代理 ID 索引的身份映射
 */
export interface ParsedSubagentIdentityDirectory {
  readonly byProviderThreadId: ReadonlyMap<string, ParsedSubagentIdentityHint>;
  readonly byAgentId: ReadonlyMap<string, ParsedSubagentIdentityHint>;
}

/**
 * @function asRecord
 * @description 将未知类型值安全转换为记录对象
 * @param {unknown} value - 待转换的值
 * @returns {Record<string, unknown> | null} 如果是对象则返回记录，否则返回 null
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * @function asArray
 * @description 将未知类型值安全转换为数组
 * @param {unknown} value - 待转换的值
 * @returns {unknown[] | null} 如果是数组则返回，否则返回 null
 */
function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

/**
 * @function asTrimmedString
 * @description 将未知类型值转换为修剪后的字符串
 * @param {unknown} value - 待转换的值
 * @returns {string | undefined} 如果是非空字符串则返回修剪后的字符串，否则返回 undefined
 */
function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * @function firstStringValue
 * @description 从对象中按优先级获取第一个有效的字符串值
 * @param {Record<string, unknown> | null | undefined} object - 源对象
 * @param {readonly string[]} keys - 候选键名列表，按优先级排序
 * @returns {string | undefined} 第一个有效的修剪后字符串，或 undefined
 */
function firstStringValue(
  object: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string | undefined {
  if (!object) {
    return undefined;
  }
  // 按优先级遍历键名列表，返回第一个有效值
  for (const key of keys) {
    const value = asTrimmedString(object[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

/**
 * @function extractSubagentIdentityFromSource
 * @description 从源数据中提取子代理身份信息
 * @param {Record<string, unknown>} item - 源数据对象
 * @returns {ParsedSubagentIdentityHint | null} 提取的身份提示，如果无有效信息则返回 null
 * @note 支持多种字段命名格式（驼峰、下划线），兼容不同的数据源格式
 */
function extractSubagentIdentityFromSource(
  item: Record<string, unknown>,
): ParsedSubagentIdentityHint | null {
  // 尝试从嵌套的 source.subAgent 或 source.sub_agent 中提取
  const source = asRecord(item.source);
  const subagent =
    asRecord(source?.subAgent) ?? asRecord(source?.sub_agent) ?? asRecord(item.subAgent);
  const threadSpawn = asRecord(subagent?.thread_spawn) ?? asRecord(subagent?.threadSpawn);
  
  // 按优先级尝试多个可能的线程 ID 字段名
  const providerThreadId =
    asTrimmedString(
      item.threadId ??
        item.thread_id ??
        item.conversationId ??
        item.conversation_id ??
        item.receiverThreadId ??
        item.receiver_thread_id,
    ) ?? firstStringValue(threadSpawn, ["threadId", "thread_id"]);
  
  // 按优先级尝试多个可能的代理 ID 字段名
  const agentId =
    asTrimmedString(item.agentId ?? item.agent_id ?? item.id) ??
    firstStringValue(threadSpawn, ["agentId", "agent_id", "id"]) ??
    firstStringValue(subagent, ["agentId", "agent_id", "id"]);
  
  // 按优先级尝试多个可能的昵称字段名
  const nickname =
    firstStringValue(item, ["agentNickname", "agent_nickname", "nickname"]) ??
    firstStringValue(threadSpawn, ["agentNickname", "agent_nickname", "nickname", "name"]) ??
    firstStringValue(subagent, ["agentNickname", "agent_nickname", "nickname", "name"]);
  
  // 按优先级尝试多个可能的角色字段名
  const role =
    firstStringValue(item, ["agentRole", "agent_role", "agentType", "agent_type"]) ??
    firstStringValue(threadSpawn, ["agentRole", "agent_role", "agentType", "agent_type"]) ??
    firstStringValue(subagent, ["agentRole", "agent_role", "agentType", "agent_type"]);

  // 如果所有关键字段都为空，返回 null
  if (!providerThreadId && !agentId && !nickname && !role) {
    return null;
  }

  // 构建并返回身份提示对象，仅包含有值的字段
  return {
    ...(providerThreadId ? { providerThreadId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(nickname ? { nickname } : {}),
    ...(role ? { role } : {}),
  };
}

/**
 * @function pushUniqueThreadId
 * @description 向数组中添加唯一的线程 ID（去重）
 * @param {string[]} target - 目标数组
 * @param {Set<string>} seen - 已见过的线程 ID 集合，用于去重
 * @param {string | undefined} threadId - 待添加的线程 ID
 */
function pushUniqueThreadId(
  target: string[],
  seen: Set<string>,
  threadId: string | undefined,
): void {
  // 如果线程 ID 为空或已存在，则跳过
  if (!threadId || seen.has(threadId)) {
    return;
  }
  seen.add(threadId);
  target.push(threadId);
}

/**
 * @function normalizeSubagentIdentifier
 * @description 标准化子代理标识符
 * @param {unknown} value - 待标准化的值
 * @returns {string | undefined} 标准化后的字符串，或 undefined
 */
export function normalizeSubagentIdentifier(value: unknown): string | undefined {
  return asTrimmedString(value);
}

/**
 * @function decodeSubagentReceiverThreadIds
 * @description 从数据对象中解码接收者线程 ID 列表
 * @param {Record<string, unknown> | null | undefined} item - 源数据对象
 * @returns {ReadonlyArray<string>} 解码后的线程 ID 数组
 * @note 支持多种字段命名格式，优先尝试复数形式（数组），然后尝试单数形式
 */
export function decodeSubagentReceiverThreadIds(
  item: Record<string, unknown> | null | undefined,
): ReadonlyArray<string> {
  if (!item) {
    return [];
  }
  
  // 优先尝试复数形式的数组字段
  const plural = ["receiverThreadIds", "receiver_thread_ids", "threadIds", "thread_ids"] as const;
  for (const key of plural) {
    const values = asArray(item[key]);
    if (!values) {
      continue;
    }
    // 标准化并过滤有效的线程 ID
    const threadIds = values
      .map((value) => normalizeSubagentIdentifier(value))
      .filter((value): value is string => value !== undefined);
    if (threadIds.length > 0) {
      return threadIds;
    }
  }

  // 如果没有找到数组，尝试单数形式的单个值
  const singular = firstStringValue(item, [
    "receiverThreadId",
    "receiver_thread_id",
    "threadId",
    "thread_id",
    "newThreadId",
    "new_thread_id",
  ]);
  return singular ? [singular] : [];
}

/**
 * @function decodeSubagentReceiverAgents
 * @description 从数据对象中解码接收者代理列表
 * @param {Record<string, unknown>} item - 源数据对象
 * @param {ReadonlyArray<string>} fallbackThreadIds - 回退线程 ID 列表，用于补全缺失的线程 ID
 * @returns {ReadonlyArray<ParsedSubagentReceiverAgent>} 解码后的代理信息数组
 * @note 支持多种字段命名格式，优先解析数组形式的代理列表，若无则尝试从顶层字段构造单个代理
 */
export function decodeSubagentReceiverAgents(
  item: Record<string, unknown>,
  fallbackThreadIds: ReadonlyArray<string>,
): ReadonlyArray<ParsedSubagentReceiverAgent> {
  // 提取顶层共享的模型与提示词，作为每个代理的默认值
  const topLevelModel = firstStringValue(item, [
    "model",
    "modelName",
    "model_name",
    "requestedModel",
    "requested_model",
  ]);
  const topLevelPrompt = firstStringValue(item, ["prompt", "task", "message"]);
  // 尝试多种命名格式获取代理数组
  const agentsValue =
    asArray(item.receiverAgents) ?? asArray(item.receiver_agents) ?? asArray(item.agents);
  const decodedAgents =
    agentsValue?.flatMap((entry, index) => {
      const object = asRecord(entry);
      if (!object) {
        return [];
      }

      // 优先使用代理自身的线程 ID，否则使用回退列表中同位置的值
      const providerThreadId =
        firstStringValue(object, [
          "threadId",
          "thread_id",
          "receiverThreadId",
          "receiver_thread_id",
          "newThreadId",
          "new_thread_id",
        ]) ??
        fallbackThreadIds[index] ??
        undefined;
      if (!providerThreadId) {
        return [];
      }

      const agentId = firstStringValue(object, [
        "agentId",
        "agent_id",
        "receiverAgentId",
        "receiver_agent_id",
        "newAgentId",
        "new_agent_id",
        "id",
      ]);
      const nickname = firstStringValue(object, [
        "agentNickname",
        "agent_nickname",
        "receiverAgentNickname",
        "receiver_agent_nickname",
        "newAgentNickname",
        "new_agent_nickname",
        "nickname",
        "name",
      ]);
      const role = firstStringValue(object, [
        "agentRole",
        "agent_role",
        "receiverAgentRole",
        "receiver_agent_role",
        "newAgentRole",
        "new_agent_role",
        "agentType",
        "agent_type",
      ]);
      // 直接指定的模型优先于请求式模型，最后才使用顶层模型
      const directModel = firstStringValue(object, ["model", "modelName", "model_name"]);
      const requestedModel = firstStringValue(object, ["requestedModel", "requested_model"]);
      const model = directModel ?? requestedModel ?? topLevelModel;
      const prompt = firstStringValue(object, ["prompt", "task", "message"]) ?? topLevelPrompt;

      return [
        {
          providerThreadId,
          ...(agentId ? { agentId } : {}),
          ...(nickname ? { nickname } : {}),
          ...(role ? { role } : {}),
          ...(model ? { model } : {}),
          ...(prompt ? { prompt } : {}),
          // 如果最终模型来自请求式（requested）或顶层，则标记为请求提示
          ...(model && !directModel ? { modelIsRequestedHint: true } : {}),
        },
      ];
    }) ?? [];

  // 若解析到了代理数组，直接返回
  if (decodedAgents.length > 0) {
    return decodedAgents;
  }

  // 兜底：使用第一个回退线程 ID 与顶层字段构造单个代理
  const providerThreadId = fallbackThreadIds[0];
  if (!providerThreadId) {
    return [];
  }

  const agentId = firstStringValue(item, ["newAgentId", "new_agent_id", "agentId", "agent_id"]);
  const nickname = firstStringValue(item, [
    "newAgentNickname",
    "new_agent_nickname",
    "agentNickname",
    "agent_nickname",
    "receiverAgentNickname",
    "receiver_agent_nickname",
  ]);
  const role = firstStringValue(item, [
    "receiverAgentRole",
    "receiver_agent_role",
    "newAgentRole",
    "new_agent_role",
    "agentRole",
    "agent_role",
    "agentType",
    "agent_type",
  ]);

  return [
    {
      providerThreadId,
      ...(agentId ? { agentId } : {}),
      ...(nickname ? { nickname } : {}),
      ...(role ? { role } : {}),
      ...(topLevelModel ? { model: topLevelModel, modelIsRequestedHint: true } : {}),
      ...(topLevelPrompt ? { prompt: topLevelPrompt } : {}),
    },
  ];
}

/**
 * @function buildSubagentAgentState
 * @description 根据原始对象构建单个代理状态对象
 * @param {string} threadId - 线程 ID
 * @param {Record<string, unknown> | null} object - 原始状态数据对象
 * @returns {ParsedSubagentAgentState} 构建完成的代理状态对象
 */
function buildSubagentAgentState(
  threadId: string,
  object: Record<string, unknown> | null,
): ParsedSubagentAgentState {
  return {
    threadId,
    ...(firstStringValue(object, ["agentId", "agent_id"])
      ? {
          agentId: firstStringValue(object, ["agentId", "agent_id"]),
        }
      : {}),
    ...(firstStringValue(object, [
      "agentNickname",
      "agent_nickname",
      "receiverAgentNickname",
      "receiver_agent_nickname",
    ])
      ? {
          nickname: firstStringValue(object, [
            "agentNickname",
            "agent_nickname",
            "receiverAgentNickname",
            "receiver_agent_nickname",
          ]),
        }
      : {}),
    ...(firstStringValue(object, [
      "agentRole",
      "agent_role",
      "receiverAgentRole",
      "receiver_agent_role",
      "agentType",
      "agent_type",
    ])
      ? {
          role: firstStringValue(object, [
            "agentRole",
            "agent_role",
            "receiverAgentRole",
            "receiver_agent_role",
            "agentType",
            "agent_type",
          ]),
        }
      : {}),
    ...(firstStringValue(object, [
      "model",
      "modelName",
      "model_name",
      "requestedModel",
      "requested_model",
    ])
      ? {
          model: firstStringValue(object, [
            "model",
            "modelName",
            "model_name",
            "requestedModel",
            "requested_model",
          ]),
        }
      : {}),
    ...(firstStringValue(object, ["prompt", "task", "message"])
      ? { prompt: firstStringValue(object, ["prompt", "task", "message"]) }
      : {}),
    ...(firstStringValue(object, ["status", "state"])
      ? { status: firstStringValue(object, ["status", "state"]) }
      : {}),
    ...(firstStringValue(object, ["summary", "message", "latestUpdate", "latest_update"])
      ? {
          message: firstStringValue(object, [
            "summary",
            "message",
            "latestUpdate",
            "latest_update",
          ]),
        }
      : {}),
  };
}

/**
 * @function decodeSubagentAgentStates
 * @description 从数据对象中解码所有代理的状态信息
 * @param {Record<string, unknown> | null | undefined} item - 源数据对象
 * @returns {Record<string, ParsedSubagentAgentState>} 以线程 ID 为键的代理状态映射
 * @note 支持对象形式（以线程 ID 为键）和数组形式两种数据结构
 */
export function decodeSubagentAgentStates(
  item: Record<string, unknown> | null | undefined,
): Record<string, ParsedSubagentAgentState> {
  // 优先尝试对象形式（以线程 ID 为键）
  const candidate =
    asRecord(item?.statuses) ??
    asRecord(item?.agentsStates) ??
    asRecord(item?.agents_states) ??
    asRecord(item?.agentStates) ??
    asRecord(item?.agent_states);
  if (candidate) {
    const decoded: Record<string, ParsedSubagentAgentState> = {};
    for (const [rawThreadId, rawValue] of Object.entries(candidate)) {
      const object = asRecord(rawValue);
      // 线程 ID 优先使用键名，其次使用对象内的字段
      const threadId =
        asTrimmedString(rawThreadId) ?? firstStringValue(object, ["threadId", "thread_id"]);
      if (!threadId) {
        continue;
      }
      decoded[threadId] = buildSubagentAgentState(threadId, object);
    }
    return decoded;
  }

  // 兜底：尝试数组形式
  const values =
    asArray(item?.agentStatuses) ?? asArray(item?.agent_statuses) ?? asArray(item?.statuses);
  if (!values) {
    return {};
  }

  const decoded: Record<string, ParsedSubagentAgentState> = {};
  for (const rawValue of values) {
    const object = asRecord(rawValue);
    const threadId = firstStringValue(object, ["threadId", "thread_id"]);
    if (!threadId) {
      continue;
    }
    decoded[threadId] = buildSubagentAgentState(threadId, object);
  }
  return decoded;
}

/**
 * @function collectSubagentProviderThreadIds
 * @description 从数据对象中收集所有相关的提供者线程 ID（去重且保持顺序）
 * @param {Record<string, unknown>} item - 源数据对象
 * @returns {ReadonlyArray<string>} 收集到的线程 ID 数组
 * @note 按优先级从多个数据源（接收者线程、接收者代理、代理状态、源身份、顶层字段）中收集
 */
export function collectSubagentProviderThreadIds(
  item: Record<string, unknown>,
): ReadonlyArray<string> {
  const orderedThreadIds: string[] = [];
  const seen = new Set<string>();

  // 1. 从接收者线程 ID 字段收集
  for (const threadId of decodeSubagentReceiverThreadIds(item)) {
    pushUniqueThreadId(orderedThreadIds, seen, threadId);
  }
  // 2. 从接收者代理列表中收集
  for (const agent of decodeSubagentReceiverAgents(item, orderedThreadIds)) {
    pushUniqueThreadId(orderedThreadIds, seen, agent.providerThreadId);
  }
  // 3. 从代理状态映射的键中收集
  for (const threadId of Object.keys(decodeSubagentAgentStates(item))) {
    pushUniqueThreadId(orderedThreadIds, seen, threadId);
  }

  // 4. 从源数据中提取身份信息并收集
  const sourceIdentity = extractSubagentIdentityFromSource(item);
  pushUniqueThreadId(orderedThreadIds, seen, sourceIdentity?.providerThreadId);

  // 5. 兜底：从顶层字段中收集
  pushUniqueThreadId(
    orderedThreadIds,
    seen,
    firstStringValue(item, [
      "newThreadId",
      "new_thread_id",
      "receiverThreadId",
      "receiver_thread_id",
    ]),
  );

  return orderedThreadIds;
}

/**
 * @function extractSubagentIdentityHints
 * @description 从数据对象中提取所有子代理身份提示信息（去重）
 * @param {Record<string, unknown>} item - 源数据对象
 * @returns {ReadonlyArray<ParsedSubagentIdentityHint>} 提取到的身份提示数组
 * @note 通过拼接所有关键字段生成去重键，过滤掉完全无标识信息的提示
 */
export function extractSubagentIdentityHints(
  item: Record<string, unknown>,
): ReadonlyArray<ParsedSubagentIdentityHint> {
  const hints: ParsedSubagentIdentityHint[] = [];
  const seen = new Set<string>();

  // 内部辅助：将提示按内容去重后加入结果集
  const pushHint = (hint: ParsedSubagentIdentityHint | null | undefined) => {
    if (!hint) {
      return;
    }
    // 使用控制字符 \u0001 拼接所有字段作为去重键
    const key = [
      hint.providerThreadId ?? "",
      hint.agentId ?? "",
      hint.nickname ?? "",
      hint.role ?? "",
      hint.model ?? "",
      hint.prompt ?? "",
      hint.status ?? "",
      hint.message ?? "",
      hint.modelIsRequestedHint ? "1" : "0",
    ].join("\u0001");
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    hints.push(hint);
  };

  // 1. 从源数据嵌套结构中提取
  pushHint(extractSubagentIdentityFromSource(item));
  // 2. 从顶层字段中提取
  pushHint({
    providerThreadId: firstStringValue(item, [
      "newThreadId",
      "new_thread_id",
      "receiverThreadId",
      "receiver_thread_id",
      "threadId",
      "thread_id",
    ]),
    agentId: firstStringValue(item, [
      "newAgentId",
      "new_agent_id",
      "receiverAgentId",
      "receiver_agent_id",
      "agentId",
      "agent_id",
    ]),
    nickname: firstStringValue(item, [
      "newAgentNickname",
      "new_agent_nickname",
      "receiverAgentNickname",
      "receiver_agent_nickname",
      "agentNickname",
      "agent_nickname",
      "nickname",
    ]),
    role: firstStringValue(item, [
      "newAgentRole",
      "new_agent_role",
      "receiverAgentRole",
      "receiver_agent_role",
      "agentRole",
      "agent_role",
      "agentType",
      "agent_type",
    ]),
  });

  // 3. 从接收者代理列表中提取
  const receiverThreadIds = decodeSubagentReceiverThreadIds(item);
  for (const receiverAgent of decodeSubagentReceiverAgents(item, receiverThreadIds)) {
    pushHint(receiverAgent);
  }

  // 4. 从代理状态映射中提取
  for (const state of Object.values(decodeSubagentAgentStates(item))) {
    pushHint({
      providerThreadId: state.threadId,
      agentId: state.agentId,
      nickname: state.nickname,
      role: state.role,
      model: state.model,
      prompt: state.prompt,
      status: state.status,
      message: state.message,
    });
  }

  // 过滤：至少包含一个标识字段（线程 ID、代理 ID、昵称或角色）
  return hints.filter(
    (hint) =>
      hint.providerThreadId !== undefined ||
      hint.agentId !== undefined ||
      hint.nickname !== undefined ||
      hint.role !== undefined,
  );
}

/**
 * @function selectMergedModel
 * @description 在合并两个身份提示时，选择最终应使用的模型信息
 * @param {Object} input - 输入参数
 * @param {ParsedSubagentIdentityHint | undefined} input.existing - 已存在的身份提示
 * @param {ParsedSubagentIdentityHint} input.incoming - 新进入的身份提示
 * @returns {Object} 合并后的模型与 modelIsRequestedHint 标记
 * @note 优先级规则：
 *   - 若新提示无模型，保留旧值
 *   - 若新提示的模型是"请求提示"，而旧提示的模型是直接指定的，则保留旧值（直接指定优先）
 *   - 否则使用新提示的模型
 */
function selectMergedModel(input: {
  existing: ParsedSubagentIdentityHint | undefined;
  incoming: ParsedSubagentIdentityHint;
}): {
  model: string | undefined;
  modelIsRequestedHint: boolean | undefined;
} {
  const existingModel = input.existing?.model;
  const incomingModel = input.incoming.model;
  if (!incomingModel) {
    return {
      model: existingModel,
      modelIsRequestedHint: input.existing?.modelIsRequestedHint,
    };
  }
  // 直接指定的模型优先于请求式（requested）模型
  if (
    input.incoming.modelIsRequestedHint === true &&
    existingModel !== undefined &&
    input.existing?.modelIsRequestedHint !== true
  ) {
    return {
      model: existingModel,
      modelIsRequestedHint: input.existing?.modelIsRequestedHint,
    };
  }
  return {
    model: incomingModel,
    modelIsRequestedHint: input.incoming.modelIsRequestedHint,
  };
}

/**
 * @function mergeSubagentIdentityHints
 * @description 合并两个子代理身份提示信息，新提示的字段优先
 * @param {ParsedSubagentIdentityHint | undefined} existing - 已存在的身份提示
 * @param {ParsedSubagentIdentityHint} incoming - 新进入的身份提示
 * @returns {ParsedSubagentIdentityHint} 合并后的身份提示
 * @note 对于模型字段，使用 selectMergedModel 的特殊合并逻辑；其他字段新值优先
 */
export function mergeSubagentIdentityHints(
  existing: ParsedSubagentIdentityHint | undefined,
  incoming: ParsedSubagentIdentityHint,
): ParsedSubagentIdentityHint {
  const mergedModel = selectMergedModel({ existing, incoming });
  return {
    providerThreadId: incoming.providerThreadId ?? existing?.providerThreadId,
    agentId: incoming.agentId ?? existing?.agentId,
    nickname: incoming.nickname ?? existing?.nickname,
    role: incoming.role ?? existing?.role,
    model: mergedModel.model,
    prompt: incoming.prompt ?? existing?.prompt,
    status: incoming.status ?? existing?.status,
    message: incoming.message ?? existing?.message,
    modelIsRequestedHint: mergedModel.modelIsRequestedHint,
  };
}

/**
 * @function buildSubagentIdentityDirectory
 * @description 根据身份提示列表构建子代理身份目录
 * @param {ReadonlyArray<ParsedSubagentIdentityHint>} hints - 身份提示列表
 * @returns {ParsedSubagentIdentityDirectory} 按线程 ID 和代理 ID 索引的身份目录
 * @note 相同线程 ID 或代理 ID 的提示会被合并；合并后会反向同步两个索引
 */
export function buildSubagentIdentityDirectory(
  hints: ReadonlyArray<ParsedSubagentIdentityHint>,
): ParsedSubagentIdentityDirectory {
  const byProviderThreadId = new Map<string, ParsedSubagentIdentityHint>();
  const byAgentId = new Map<string, ParsedSubagentIdentityHint>();

  // 单条提示的插入/合并逻辑
  const upsert = (hint: ParsedSubagentIdentityHint) => {
    const providerThreadId = asTrimmedString(hint.providerThreadId);
    const agentId = asTrimmedString(hint.agentId);
    // 完全没有任何标识信息的提示直接忽略
    if (
      providerThreadId === undefined &&
      agentId === undefined &&
      hint.nickname === undefined &&
      hint.role === undefined
    ) {
      return;
    }

    const existingByThread = providerThreadId
      ? byProviderThreadId.get(providerThreadId)
      : undefined;
    const existingByAgent = agentId ? byAgentId.get(agentId) : undefined;
    // 若同一代理通过线程 ID 和代理 ID 两条路径都能查到，先合并这两条记录
    const existing =
      existingByAgent !== undefined
        ? mergeSubagentIdentityHints(existingByThread, existingByAgent)
        : existingByThread;
    const merged = mergeSubagentIdentityHints(existing, {
      ...hint,
      ...(providerThreadId ? { providerThreadId } : {}),
      ...(agentId ? { agentId } : {}),
    });

    if (providerThreadId) {
      byProviderThreadId.set(providerThreadId, merged);
    }
    if (agentId) {
      byAgentId.set(agentId, merged);
    }
    // 合并后可能产生新的线程 ID/代理 ID 组合，反向同步到另一个索引
    if (merged.providerThreadId && merged.agentId) {
      byProviderThreadId.set(merged.providerThreadId, merged);
      byAgentId.set(merged.agentId, merged);
    }
  };

  for (const hint of hints) {
    upsert(hint);
  }

  return {
    byProviderThreadId,
    byAgentId,
  };
}

/**
 * @function resolveSubagentIdentityFromDirectory
 * @description 从身份目录中解析指定线程/代理的完整身份信息
 * @param {ParsedSubagentIdentityDirectory} directory - 身份目录
 * @param {Object} input - 输入参数
 * @param {string | null | undefined} input.providerThreadId - 提供者线程 ID
 * @param {string | null | undefined} input.agentId - 代理 ID
 * @returns {ParsedSubagentIdentityHint | undefined} 合并后的身份提示，未找到则返回 undefined
 */
export function resolveSubagentIdentityFromDirectory(
  directory: ParsedSubagentIdentityDirectory,
  input: {
    providerThreadId?: string | null | undefined;
    agentId?: string | null | undefined;
  },
): ParsedSubagentIdentityHint | undefined {
  const normalizedProviderThreadId = asTrimmedString(input.providerThreadId);
  const normalizedAgentId = asTrimmedString(input.agentId);
  const threadEntry = normalizedProviderThreadId
    ? directory.byProviderThreadId.get(normalizedProviderThreadId)
    : undefined;
  const agentEntry = normalizedAgentId ? directory.byAgentId.get(normalizedAgentId) : undefined;
  if (!threadEntry && !agentEntry) {
    return undefined;
  }

  // 合并来自两个索引的记录，并确保返回结果包含查询的 ID
  return mergeSubagentIdentityHints(agentEntry, {
    ...(threadEntry ?? {}),
    providerThreadId:
      threadEntry?.providerThreadId ?? agentEntry?.providerThreadId ?? normalizedProviderThreadId,
    agentId: threadEntry?.agentId ?? agentEntry?.agentId ?? normalizedAgentId,
  });
}

/**
 * @function resolveSubagentIdentityHint
 * @description 根据身份提示列表与查询条件解析出匹配的身份信息
 * @param {Object} input - 输入参数
 * @param {ReadonlyArray<ParsedSubagentIdentityHint>} input.hints - 身份提示列表
 * @param {string | null | undefined} input.providerThreadId - 提供者线程 ID
 * @param {string | null | undefined} input.agentId - 代理 ID
 * @returns {ParsedSubagentIdentityHint | undefined} 解析出的身份提示，未找到则返回 undefined
 * @note 便捷封装：先构建目录，再从目录中解析
 */
export function resolveSubagentIdentityHint(input: {
  hints: ReadonlyArray<ParsedSubagentIdentityHint>;
  providerThreadId?: string | null | undefined;
  agentId?: string | null | undefined;
}): ParsedSubagentIdentityHint | undefined {
  return resolveSubagentIdentityFromDirectory(buildSubagentIdentityDirectory(input.hints), input);
}
