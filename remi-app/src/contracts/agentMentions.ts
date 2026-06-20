/**
 * Agent Mentions - @alias(task) syntax for subagent delegation.
 *
 * Agent 提及系统 - 支持 @alias(task) 语法进行子代理委派。
 *
 * 本文件定义了 Agent 别名系统，用于在对话中通过 @alias(task) 语法将任务委派给子代理执行。
 * 提供了 Provider 感知的别名元数据，供 Composer UI 和各 Provider 运行时使用。
 *
 * 使用场景：
 * - 在对话中使用 @explore(查找登录相关代码) 委派代码探索任务
 * - 使用 @review(检查这段代码的潜在问题) 委派代码审查任务
 * - 使用 @build(实现这个功能) 委派实现任务
 * - 使用 @plan(规划重构方案) 委派规划任务
 *
 * Provides provider-aware alias metadata used by the composer UI and provider runtimes.
 */

import type { ProviderKind } from "./orchestration";
import type { ModelSlug } from "./model";

/** Agent 别名在 UI 中显示的颜色 */
type AgentAliasColor = "violet" | "fuchsia" | "teal" | "cyan" | "amber" | "orange";

/** Agent 别名定义的基础接口，包含所有 Provider 共有的属性 */
interface BaseAgentAliasDefinition {
  /** 提供该别名的 Provider 类型 */
  readonly provider: ProviderKind;
  /** 在 UI 中显示的名称 */
  readonly displayName: string;
  /** 在 UI 中显示的颜色 */
  readonly color: AgentAliasColor;
}

/** Codex Provider 的 Agent 别名定义，用于委派给特定模型执行 */
export interface CodexAgentAliasDefinition extends BaseAgentAliasDefinition {
  /** Provider 类型，固定为 "codex" */
  readonly provider: "codex";
  /** 别名类型，固定为 "model" */
  readonly kind: "model";
  /** 要使用的模型标识 */
  readonly model: ModelSlug;
}

/** Claude Provider 的子代理别名定义，用于委派给特定功能的子代理执行 */
export interface ClaudeSubagentAliasDefinition extends BaseAgentAliasDefinition {
  /** Provider 类型，固定为 "claudeAgent" */
  readonly provider: "claudeAgent";
  /** 别名类型，固定为 "claude-subagent" */
  readonly kind: "claude-subagent";
  /** 子代理名称标识 */
  readonly agentName: string;
  /** 子代理功能描述，用于 UI 提示 */
  readonly description: string;
  /** 子代理的系统提示词 */
  readonly prompt: string;
  /** 允许子代理使用的工具列表 */
  readonly tools?: readonly string[];
  /** 禁止子代理使用的工具列表 */
  readonly disallowedTools?: readonly string[];
  /** 可选的模型覆盖，指定子代理使用的模型 */
  readonly model?: string;
}

/** Agent 别名定义联合类型，包含 Codex 和 Claude 两种别名定义 */
export type AgentAliasDefinition = CodexAgentAliasDefinition | ClaudeSubagentAliasDefinition;

/** 解析后的 Agent 别名，在别名定义基础上附加了别名标识符 */
export type ResolvedAgentAlias = AgentAliasDefinition & {
  /** 别名标识符（如 "explore"、"5.5" 等） */
  readonly alias: string;
};

/** OpenCode/Kilo Provider 的 Agent 别名映射表（当前为空） */
const OPENCODE_AGENT_MENTION_ALIASES: Record<string, AgentAliasDefinition> = {};

/** Codex Provider 的 Agent 别名映射表，将简短别名映射到对应的模型定义 */
const CODEX_AGENT_MENTION_ALIASES: Record<string, CodexAgentAliasDefinition> = {
  "5.5": {
    provider: "codex",
    kind: "model",
    model: "gpt-5.5",
    displayName: "GPT-5.5",
    color: "violet",
  },
  "5.4": {
    provider: "codex",
    kind: "model",
    model: "gpt-5.4",
    displayName: "GPT-5.4",
    color: "violet",
  },
  mini: {
    provider: "codex",
    kind: "model",
    model: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    color: "fuchsia",
  },
  "5.4-mini": {
    provider: "codex",
    kind: "model",
    model: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    color: "fuchsia",
  },
  codex: {
    provider: "codex",
    kind: "model",
    model: "gpt-5.3-codex",
    displayName: "GPT-5.3 Codex",
    color: "teal",
  },
  "5.3-codex": {
    provider: "codex",
    kind: "model",
    model: "gpt-5.3-codex",
    displayName: "GPT-5.3 Codex",
    color: "teal",
  },
  spark: {
    provider: "codex",
    kind: "model",
    model: "gpt-5.3-codex-spark",
    displayName: "GPT-5.3 Codex Spark",
    color: "cyan",
  },
  "5.3-spark": {
    provider: "codex",
    kind: "model",
    model: "gpt-5.3-codex-spark",
    displayName: "GPT-5.3 Codex Spark",
    color: "cyan",
  },
  "5.2": {
    provider: "codex",
    kind: "model",
    model: "gpt-5.2",
    displayName: "GPT-5.2",
    color: "amber",
  },
  "5.2-codex": {
    provider: "codex",
    kind: "model",
    model: "gpt-5.2-codex",
    displayName: "GPT-5.2 Codex",
    color: "orange",
  },
};

/** Claude Provider 的子代理别名映射表，将简短别名映射到对应的子代理定义 */
const CLAUDE_AGENT_MENTION_ALIASES: Record<string, ClaudeSubagentAliasDefinition> = {
  explore: {
    provider: "claudeAgent",
    kind: "claude-subagent",
    agentName: "explore",
    displayName: "Explore",
    color: "cyan",
    description:
      "Read-only codebase explorer. Use for file discovery, code search, and gathering context before implementation.",
    prompt:
      "You are a focused codebase exploration specialist. Search broadly, gather the most relevant findings, and return a concise summary with the key files, evidence, and risks. Do not make code changes.",
    tools: ["Read", "Grep", "Glob"],
    model: "haiku",
  },
  review: {
    provider: "claudeAgent",
    kind: "claude-subagent",
    agentName: "review",
    displayName: "Code Review",
    color: "amber",
    description:
      "Bug and risk reviewer. Use for code review, regression hunting, and edge-case analysis.",
    prompt:
      "You are a senior code reviewer. Focus on behavioral regressions, correctness bugs, edge cases, and missing tests. Return findings first, then open questions, then a brief summary.",
    tools: ["Read", "Grep", "Glob"],
    model: "sonnet",
  },
  reviewer: {
    provider: "claudeAgent",
    kind: "claude-subagent",
    agentName: "review",
    displayName: "Code Review",
    color: "amber",
    description:
      "Bug and risk reviewer. Use for code review, regression hunting, and edge-case analysis.",
    prompt:
      "You are a senior code reviewer. Focus on behavioral regressions, correctness bugs, edge cases, and missing tests. Return findings first, then open questions, then a brief summary.",
    tools: ["Read", "Grep", "Glob"],
    model: "sonnet",
  },
  build: {
    provider: "claudeAgent",
    kind: "claude-subagent",
    agentName: "build",
    displayName: "Implementer",
    color: "violet",
    description:
      "Implementation teammate. Use for scoped code changes, debugging, and hands-on execution tasks.",
    prompt:
      "You are an implementation-focused coding teammate. Make targeted changes, validate assumptions with the available tools, and return a short implementation summary plus any remaining risks.",
    tools: ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "MultiEdit"],
    model: "sonnet",
  },
  implement: {
    provider: "claudeAgent",
    kind: "claude-subagent",
    agentName: "build",
    displayName: "Implementer",
    color: "violet",
    description:
      "Implementation teammate. Use for scoped code changes, debugging, and hands-on execution tasks.",
    prompt:
      "You are an implementation-focused coding teammate. Make targeted changes, validate assumptions with the available tools, and return a short implementation summary plus any remaining risks.",
    tools: ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "MultiEdit"],
    model: "sonnet",
  },
  plan: {
    provider: "claudeAgent",
    kind: "claude-subagent",
    agentName: "plan",
    displayName: "Planner",
    color: "fuchsia",
    description:
      "Planning specialist. Use for breaking work into steps, evaluating approaches, and preparing execution plans.",
    prompt:
      "You are a planning specialist. Clarify goals, evaluate tradeoffs, identify edge cases, and return a concrete ordered plan with the main risks called out explicitly.",
    tools: ["Read", "Grep", "Glob", "TodoWrite"],
    model: "sonnet",
  },
  planner: {
    provider: "claudeAgent",
    kind: "claude-subagent",
    agentName: "plan",
    displayName: "Planner",
    color: "fuchsia",
    description:
      "Planning specialist. Use for breaking work into steps, evaluating approaches, and preparing execution plans.",
    prompt:
      "You are a planning specialist. Clarify goals, evaluate tradeoffs, identify edge cases, and return a concrete ordered plan with the main risks called out explicitly.",
    tools: ["Read", "Grep", "Glob", "TodoWrite"],
    model: "sonnet",
  },
};

/**
 * 按 Provider 分组的 Agent 别名映射表
 *
 * @description 每个 Provider 对应一组别名定义，用于根据当前 Provider 查找可用的 Agent 别名。
 */
export const AGENT_MENTION_ALIASES_BY_PROVIDER: Record<
  ProviderKind,
  Record<string, AgentAliasDefinition>
> = {
  codex: CODEX_AGENT_MENTION_ALIASES,
  claudeAgent: CLAUDE_AGENT_MENTION_ALIASES,
  cursor: {},
  gemini: {},
  grok: {},
  kilo: OPENCODE_AGENT_MENTION_ALIASES,
  opencode: OPENCODE_AGENT_MENTION_ALIASES,
  pi: {},
} as const satisfies Record<ProviderKind, Record<string, AgentAliasDefinition>>;

/**
 * 所有 Provider 的 Agent 别名合集（扁平映射表）
 *
 * @description 向后兼容的扁平别名表，将所有 Provider 的别名合并为一个映射表。
 * 适用于不需要区分 Provider 的场景。
 *
 * @deprecated 优先使用 AGENT_MENTION_ALIASES_BY_PROVIDER 按 Provider 查找
 */
export const AGENT_MENTION_ALIASES: Record<string, AgentAliasDefinition> = Object.assign(
  {},
  ...Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER),
);

/**
 * 按 Provider 分组的自动补全别名列表
 *
 * @description 每个 Provider 对应一组推荐用于自动补全的别名名称，
 * 用于在用户输入 @ 时提供智能提示。仅包含最常用的别名子集。
 */
const AGENT_MENTION_AUTOCOMPLETE_ALIASES_BY_PROVIDER: Record<ProviderKind, readonly string[]> = {
  codex: ["5.5", "5.4", "mini", "5.3-codex", "spark", "5.2", "5.2-codex"],
  claudeAgent: ["explore", "review", "build", "plan"],
  cursor: [],
  gemini: [],
  grok: [],
  kilo: [],
  opencode: [],
  pi: [],
};

/**
 * 将别名映射表转换为解析后的别名数组
 *
 * @param input - 别名定义映射表
 * @returns 解析后的别名数组，按别名字母顺序排序
 */
function mapAgentEntries(input: Record<string, AgentAliasDefinition>): ResolvedAgentAlias[] {
  return Object.entries(input)
    .map(([alias, definition]) => Object.assign({ alias }, definition))
    .toSorted((a, b) => a.alias.localeCompare(b.alias));
}

/**
 * 获取指定 Provider 的所有可用 Agent 别名
 *
 * @description 返回指定 Provider 支持的所有 Agent 别名列表。如果不指定 Provider，
 * 则返回所有 Provider 的别名合集（用于解析和验证辅助函数）。
 *
 * @param provider - 可选的 Provider 类型。如果提供，仅返回该 Provider 的别名；
 * 如果省略，返回所有 Provider 的别名合集。
 * @returns 解析后的 Agent 别名数组，按字母顺序排序
 *
 * @example
 * ```typescript
 * // 获取 Claude 的所有别名
 * const claudeAliases = getAgentMentionAliases("claudeAgent");
 * // 返回: [{ alias: "build", ... }, { alias: "explore", ... }, ...]
 *
 * // 获取所有 Provider 的别名合集
 * const allAliases = getAgentMentionAliases();
 * ```
 */
export function getAgentMentionAliases(provider?: ProviderKind): ResolvedAgentAlias[] {
  if (provider) {
    return mapAgentEntries(AGENT_MENTION_ALIASES_BY_PROVIDER[provider]);
  }

  return Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER).flatMap((definitions) =>
    mapAgentEntries(definitions),
  );
}

/**
 * 获取指定 Provider 的自动补全别名列表
 *
 * @description 返回在 UI 自动补全中显示的推荐别名。这些别名是经过筛选的、
 * 最常用的 Agent 别名，用于在用户输入 @ 时提供智能提示。
 *
 * @param provider - Provider 类型，用于获取该 Provider 推荐的自动补全别名
 * @returns 解析后的 Agent 别名数组，仅包含推荐的自动补全别名
 *
 * @example
 * ```typescript
 * // 获取 Claude 的自动补全别名
 * const autocompleteAliases = getAgentMentionAutocompleteAliases("claudeAgent");
 * // 返回: [{ alias: "explore", ... }, { alias: "review", ... }, ...]
 * ```
 */
export function getAgentMentionAutocompleteAliases(provider: ProviderKind): ResolvedAgentAlias[] {
  return AGENT_MENTION_AUTOCOMPLETE_ALIASES_BY_PROVIDER[provider].map((alias) => {
    const definition = AGENT_MENTION_ALIASES_BY_PROVIDER[provider][alias];
    if (!definition) {
      throw new Error(`Unknown autocomplete alias for ${provider}: ${alias}`);
    }

    return Object.assign({ alias }, definition);
  });
}

/**
 * 解析 Agent 别名
 *
 * @description 根据别名名称和可选的 Provider 类型，解析出对应的 Agent 别名定义。
 * 如果指定了 Provider，则仅在该 Provider 的别名中查找；否则在所有 Provider 的别名中查找。
 *
 * @param alias - 要解析的别名名称（不区分大小写）
 * @param provider - 可选的 Provider 类型。如果提供，仅在该 Provider 的别名中查找；
 * 如果省略，在所有 Provider 的别名中查找。
 * @returns 解析成功返回 Agent 别名定义对象，解析失败返回 null
 *
 * @example
 * ```typescript
 * // 在 Claude 中解析 "explore" 别名
 * const definition = resolveAgentAlias("explore", "claudeAgent");
 * // 返回: { alias: "explore", provider: "claudeAgent", kind: "claude-subagent", ... }
 *
 * // 在所有 Provider 中解析 "build" 别名
 * const definition = resolveAgentAlias("build");
 * ```
 */
export function resolveAgentAlias(
  alias: string,
  provider?: ProviderKind,
): AgentAliasDefinition | null {
  const normalized = alias.toLowerCase();
  if (provider) {
    return AGENT_MENTION_ALIASES_BY_PROVIDER[provider][normalized] ?? null;
  }

  for (const definitions of Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER)) {
    const resolved = definitions[normalized];
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

/**
 * 验证 Agent 别名是否有效
 *
 * @description 检查给定的别名名称是否在指定 Provider 或所有 Provider 的别名列表中有效。
 *
 * @param alias - 要验证的别名名称（不区分大小写）
 * @param provider - 可选的 Provider 类型。如果提供，仅在该 Provider 的别名中验证；
 * 如果省略，在所有 Provider 的别名中验证。
 * @returns 如果别名有效返回 true，否则返回 false
 *
 * @example
 * ```typescript
 * // 验证 "explore" 在 Claude 中是否有效
 * const isValid = isValidAgentAlias("explore", "claudeAgent");
 * // 返回: true
 *
 * // 验证 "unknown" 是否有效
 * const isValid = isValidAgentAlias("unknown");
 * // 返回: false
 * ```
 */
export function isValidAgentAlias(alias: string, provider?: ProviderKind): boolean {
  return resolveAgentAlias(alias, provider) !== null;
}

/**
 * 获取所有 Agent 别名名称列表
 *
 * @description 返回指定 Provider 或所有 Provider 的 Agent 别名名称数组。
 * 与 getAgentMentionAliases 不同，此函数仅返回别名名称字符串，不包含完整的定义对象。
 *
 * @param provider - 可选的 Provider 类型。如果提供，仅返回该 Provider 的别名名称；
 * 如果省略，返回所有 Provider 的别名名称合集。
 * @returns Agent 别名名称数组
 *
 * @example
 * ```typescript
 * // 获取 Claude 的所有别名名称
 * const names = getAgentAliasNames("claudeAgent");
 * // 返回: ["explore", "review", "build", "plan"]
 *
 * // 获取所有 Provider 的别名名称
 * const allNames = getAgentAliasNames();
 * // 返回: ["5.5", "5.4", "mini", "explore", "review", ...]
 * ```
 */
export function getAgentAliasNames(provider?: ProviderKind): string[] {
  if (provider) {
    return Object.keys(AGENT_MENTION_ALIASES_BY_PROVIDER[provider]);
  }

  return Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER).flatMap((definitions) =>
    Object.keys(definitions),
  );
}
