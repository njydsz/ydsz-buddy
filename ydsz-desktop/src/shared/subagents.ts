/**
 * @file 子代理运行时负载解析工具模块
 *
 * 本模块提供子代理（Subagent）运行时负载的解析工具，被服务端摄取和 Web UI 共享使用：
 *
 * - **接收者解析**：从各种格式的负载中提取子代理接收者信息
 * - **状态解析**：解析子代理的状态信息
 * - **身份目录**：构建子代理身份目录，支持按线程 ID 或 Agent ID 查询
 * - **身份合并**：合并多个来源的身份提示
 *
 * ## 核心导出
 *
 * - `ParsedSubagentReceiverAgent`：解析后的子代理接收者
 * - `ParsedSubagentAgentState`：解析后的子代理状态
 * - `ParsedSubagentIdentityHint`：子代理身份提示
 * - `ParsedSubagentIdentityDirectory`：子代理身份目录
 * - `decodeSubagentReceiverAgents`：解码子代理接收者列表
 * - `decodeSubagentAgentStates`：解码子代理状态映射
 * - `buildSubagentIdentityDirectory`：构建身份目录
 * - `resolveSubagentIdentityHint`：解析身份提示
 *
 * ## 使用场景
 *
 * - WebSocket 消息中的子代理负载解析
 * - 服务器端子代理状态同步
 * - 线程导入/导出时的身份解析
 * - 子代理到子代理的通信路由
 *
 * ## 注意事项
 *
 * - 支持多种字段命名风格：camelCase、snake_case、下划线
 * - 解析失败时返回空数组或空对象，不会抛出异常
 * - 身份目录支持按 providerThreadId 和 agentId 双向查询
 */

/**
 * 解析后的子代理接收者。
 *
 * 描述一个子代理接收者的完整信息，包括线程 ID、Agent ID、昵称等。
 */
export interface ParsedSubagentReceiverAgent {
  /** 所属 Provider 的线程 ID */
  providerThreadId: string;
  /** 子代理的 Agent ID（可选） */
  agentId?: string | undefined;
  /** 子代理的昵称（可选） */
  nickname?: string | undefined;
  /** 子代理的角色（可选） */
  role?: string | undefined;
  /** 子代理的模型（可选） */
  model?: string | undefined;
  /** 子代理的提示词（可选） */
  prompt?: string | undefined;
  /** 模型是否为请求提示（可选） */
  modelIsRequestedHint?: boolean | undefined;
}

/**
 * 解析后的子代理状态。
 *
 * 描述一个子代理的运行时状态信息。
 */
export interface ParsedSubagentAgentState {
  /** 线程 ID */
  threadId: string;
  /** Agent ID（可选） */
  agentId?: string | undefined;
  /** 昵称（可选） */
  nickname?: string | undefined;
  /** 角色（可选） */
  role?: string | undefined;
  /** 模型（可选） */
  model?: string | undefined;
  /** 提示词（可选） */
  prompt?: string | undefined;
  /** 状态字符串（可选） */
  status?: string | undefined;
  /** 消息（可选） */
  message?: string | undefined;
}

/**
 * 解析后的子代理身份提示。
 *
 * 从负载中提取的身份信息片段，可能包含部分字段。
 */
export interface ParsedSubagentIdentityHint {
  /** Provider 线程 ID（可选） */
  providerThreadId?: string | undefined;
  /** Agent ID（可选） */
  agentId?: string | undefined;
  /** 昵称（可选） */
  nickname?: string | undefined;
  /** 角色（可选） */
  role?: string | undefined;
  /** 模型（可选） */
  model?: string | undefined;
  /** 提示词（可选） */
  prompt?: string | undefined;
  /** 状态（可选） */
  status?: string | undefined;
  /** 消息（可选） */
  message?: string | undefined;
  /** 模型是否为请求提示（可选） */
  modelIsRequestedHint?: boolean | undefined;
}

/**
 * 子代理身份目录。
 *
 * 提供按 `providerThreadId` 和 `agentId` 双向查询的能力。
 */
export interface ParsedSubagentIdentityDirectory {
  /** 按 Provider 线程 ID 索引的身份映射 */
  readonly byProviderThreadId: ReadonlyMap<string, ParsedSubagentIdentityHint>;
  /** 按 Agent ID 索引的身份映射 */
  readonly byAgentId: ReadonlyMap<string, ParsedSubagentIdentityHint>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function firstStringValue(
  object: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string | undefined {
  if (!object) {
    return undefined;
  }
  for (const key of keys) {
    const value = asTrimmedString(object[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function extractSubagentIdentityFromSource(
  item: Record<string, unknown>,
): ParsedSubagentIdentityHint | null {
  const source = asRecord(item.source);
  const subagent =
    asRecord(source?.subAgent) ?? asRecord(source?.sub_agent) ?? asRecord(item.subAgent);
  const threadSpawn = asRecord(subagent?.thread_spawn) ?? asRecord(subagent?.threadSpawn);
  const providerThreadId =
    asTrimmedString(
      item.threadId ??
        item.thread_id ??
        item.conversationId ??
        item.conversation_id ??
        item.receiverThreadId ??
        item.receiver_thread_id,
    ) ?? firstStringValue(threadSpawn, ["threadId", "thread_id"]);
  const agentId =
    asTrimmedString(item.agentId ?? item.agent_id ?? item.id) ??
    firstStringValue(threadSpawn, ["agentId", "agent_id", "id"]) ??
    firstStringValue(subagent, ["agentId", "agent_id", "id"]);
  const nickname =
    firstStringValue(item, ["agentNickname", "agent_nickname", "nickname"]) ??
    firstStringValue(threadSpawn, ["agentNickname", "agent_nickname", "nickname", "name"]) ??
    firstStringValue(subagent, ["agentNickname", "agent_nickname", "nickname", "name"]);
  const role =
    firstStringValue(item, ["agentRole", "agent_role", "agentType", "agent_type"]) ??
    firstStringValue(threadSpawn, ["agentRole", "agent_role", "agentType", "agent_type"]) ??
    firstStringValue(subagent, ["agentRole", "agent_role", "agentType", "agent_type"]);

  if (!providerThreadId && !agentId && !nickname && !role) {
    return null;
  }

  return {
    ...(providerThreadId ? { providerThreadId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(nickname ? { nickname } : {}),
    ...(role ? { role } : {}),
  };
}

function pushUniqueThreadId(
  target: string[],
  seen: Set<string>,
  threadId: string | undefined,
): void {
  if (!threadId || seen.has(threadId)) {
    return;
  }
  seen.add(threadId);
  target.push(threadId);
}

/**
 * 规范化子代理标识符。
 *
 * 将任意值转换为非空字符串，若无法转换则返回 undefined。
 *
 * @param value - 待规范化的值
 * @returns 规范化后的字符串，或 undefined
 */
export function normalizeSubagentIdentifier(value: unknown): string | undefined {
  return asTrimmedString(value);
}

/**
 * 解码子代理接收者的线程 ID 列表。
 *
 * 支持多种字段命名格式：`receiverThreadIds`、`receiver_thread_ids`、`threadIds`、`thread_ids`。
 *
 * @param item - 负载对象
 * @returns 线程 ID 数组
 */
export function decodeSubagentReceiverThreadIds(
  item: Record<string, unknown> | null | undefined,
): ReadonlyArray<string> {
  if (!item) {
    return [];
  }
  const plural = ["receiverThreadIds", "receiver_thread_ids", "threadIds", "thread_ids"] as const;
  for (const key of plural) {
    const values = asArray(item[key]);
    if (!values) {
      continue;
    }
    const threadIds = values
      .map((value) => normalizeSubagentIdentifier(value))
      .filter((value): value is string => value !== undefined);
    if (threadIds.length > 0) {
      return threadIds;
    }
  }

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
 * 解码子代理接收者列表。
 *
 * 支持多种字段命名格式和嵌套结构：
 * - `receiverAgents`、`receiver_agents`、`agents`
 * - `subAgent.thread_spawn.threadId`
 * - `threadId` / `thread_id`
 *
 * @param item - 负载对象
 * @param fallbackThreadIds - 备用线程 ID 数组（当无法从 item 中提取时使用）
 * @returns 解析后的子代理接收者数组
 */
export function decodeSubagentReceiverAgents(
  item: Record<string, unknown>,
  fallbackThreadIds: ReadonlyArray<string>,
): ReadonlyArray<ParsedSubagentReceiverAgent> {
  const topLevelModel = firstStringValue(item, [
    "model",
    "modelName",
    "model_name",
    "requestedModel",
    "requested_model",
  ]);
  const topLevelPrompt = firstStringValue(item, ["prompt", "task", "message"]);
  const agentsValue =
    asArray(item.receiverAgents) ?? asArray(item.receiver_agents) ?? asArray(item.agents);
  const decodedAgents =
    agentsValue?.flatMap((entry, index) => {
      const object = asRecord(entry);
      if (!object) {
        return [];
      }

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
          ...(model && !directModel ? { modelIsRequestedHint: true } : {}),
        },
      ];
    }) ?? [];

  if (decodedAgents.length > 0) {
    return decodedAgents;
  }

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
 * 解码子代理状态映射。
 *
 * 支持多种字段命名格式：
 * - `statuses`、`agentsStates`、`agents_states`、`agentStates`、`agent_states`
 * - `agentStatuses`、`agent_statuses`
 *
 * @param item - 负载对象
 * @returns 以线程 ID 为键的状态映射
 */
export function decodeSubagentAgentStates(
  item: Record<string, unknown> | null | undefined,
): Record<string, ParsedSubagentAgentState> {
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
      const threadId =
        asTrimmedString(rawThreadId) ?? firstStringValue(object, ["threadId", "thread_id"]);
      if (!threadId) {
        continue;
      }
      decoded[threadId] = buildSubagentAgentState(threadId, object);
    }
    return decoded;
  }

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
 * 收集子代理相关的所有 Provider 线程 ID。
 *
 * 从多个来源收集线程 ID 并去重：
 * - `decodeSubagentReceiverThreadIds`
 * - `decodeSubagentReceiverAgents`
 * - `decodeSubagentAgentStates`
 * - `extractSubagentIdentityFromSource`
 * - `newThreadId` / `new_thread_id`
 *
 * @param item - 负载对象
 * @returns 去重后的线程 ID 数组
 */
export function collectSubagentProviderThreadIds(
  item: Record<string, unknown>,
): ReadonlyArray<string> {
  const orderedThreadIds: string[] = [];
  const seen = new Set<string>();

  for (const threadId of decodeSubagentReceiverThreadIds(item)) {
    pushUniqueThreadId(orderedThreadIds, seen, threadId);
  }
  for (const agent of decodeSubagentReceiverAgents(item, orderedThreadIds)) {
    pushUniqueThreadId(orderedThreadIds, seen, agent.providerThreadId);
  }
  for (const threadId of Object.keys(decodeSubagentAgentStates(item))) {
    pushUniqueThreadId(orderedThreadIds, seen, threadId);
  }

  const sourceIdentity = extractSubagentIdentityFromSource(item);
  pushUniqueThreadId(orderedThreadIds, seen, sourceIdentity?.providerThreadId);

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
 * 从负载中提取子代理身份提示。
 *
 * 遍历多个可能的字段位置，收集所有找到的身份提示。
 * 去重后返回有效提示（必须包含 providerThreadId、agentId、nickname 或 role 之一）。
 *
 * @param item - 负载对象
 * @returns 提取的身份提示数组
 */
export function extractSubagentIdentityHints(
  item: Record<string, unknown>,
): ReadonlyArray<ParsedSubagentIdentityHint> {
  const hints: ParsedSubagentIdentityHint[] = [];
  const seen = new Set<string>();

  const pushHint = (hint: ParsedSubagentIdentityHint | null | undefined) => {
    if (!hint) {
      return;
    }
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

  pushHint(extractSubagentIdentityFromSource(item));
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

  const receiverThreadIds = decodeSubagentReceiverThreadIds(item);
  for (const receiverAgent of decodeSubagentReceiverAgents(item, receiverThreadIds)) {
    pushHint(receiverAgent);
  }

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

  return hints.filter(
    (hint) =>
      hint.providerThreadId !== undefined ||
      hint.agentId !== undefined ||
      hint.nickname !== undefined ||
      hint.role !== undefined,
  );
}

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
 * 合并两个子代理身份提示。
 *
 * incoming 提示的非空字段会覆盖 existing 提示的对应字段。
 * 模型字段有特殊合并逻辑：若 incoming 的模型是请求提示且 existing 的模型是确定值，
 * 则保留 existing 的模型。
 *
 * @param existing - 已存在的身份提示
 * @param incoming - 新的身份提示
 * @returns 合并后的身份提示
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
 * 从身份提示数组构建身份目录。
 *
 * 目录支持按 `providerThreadId` 和 `agentId` 双向查询。
 * 相同身份的多个提示会被合并。
 *
 * @param hints - 身份提示数组
 * @returns 身份目录
 */
export function buildSubagentIdentityDirectory(
  hints: ReadonlyArray<ParsedSubagentIdentityHint>,
): ParsedSubagentIdentityDirectory {
  const byProviderThreadId = new Map<string, ParsedSubagentIdentityHint>();
  const byAgentId = new Map<string, ParsedSubagentIdentityHint>();

  const upsert = (hint: ParsedSubagentIdentityHint) => {
    const providerThreadId = asTrimmedString(hint.providerThreadId);
    const agentId = asTrimmedString(hint.agentId);
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
 * 从身份目录中解析身份提示。
 *
 * 按 `providerThreadId` 和 `agentId` 在目录中查找，并合并找到的条目。
 *
 * @param directory - 身份目录
 * @param input - 查询输入
 * @param input.providerThreadId - Provider 线程 ID
 * @param input.agentId - Agent ID
 * @returns 找到的身份提示，若不存在则返回 undefined
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

  return mergeSubagentIdentityHints(agentEntry, {
    ...(threadEntry ?? {}),
    providerThreadId:
      threadEntry?.providerThreadId ?? agentEntry?.providerThreadId ?? normalizedProviderThreadId,
    agentId: threadEntry?.agentId ?? agentEntry?.agentId ?? normalizedAgentId,
  });
}

/**
 * 从身份提示数组解析身份。
 *
 * 便捷函数，先构建身份目录，再从中查询。
 *
 * @param input - 输入参数
 * @param input.hints - 身份提示数组
 * @param input.providerThreadId - Provider 线程 ID
 * @param input.agentId - Agent ID
 * @returns 找到的身份提示，若不存在则返回 undefined
 */
export function resolveSubagentIdentityHint(input: {
  hints: ReadonlyArray<ParsedSubagentIdentityHint>;
  providerThreadId?: string | null | undefined;
  agentId?: string | null | undefined;
}): ParsedSubagentIdentityHint | undefined {
  return resolveSubagentIdentityFromDirectory(buildSubagentIdentityDirectory(input.hints), input);
}
