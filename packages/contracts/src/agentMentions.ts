/**
 * Agent 提及（@alias）合约定义
 *
 * 用途：定义 Agent 别名元数据，供编辑器 UI 和 Provider 运行时使用。
 *       支持 @alias(task) 语法进行子 Agent 委托。
 * 所属模块：共享契约层（Shared Contracts）
 * 主要导出：
 *   - AgentAliasDefinition / CodexAgentAliasDefinition / ClaudeSubagentAliasDefinition —— 别名定义
 *   - ResolvedAgentAlias —— 已解析的别名
 *   - AGENT_MENTION_ALIASES —— 全局别名表（向后兼容）
 *   - AGENT_MENTION_ALIASES_BY_PROVIDER —— 按 Provider 分组的别名表
 *   - getAgentMentionAliases —— 获取别名列表
 *   - getAgentMentionAutocompleteAliases —— 获取自动补全别名
 *   - resolveAgentAlias —— 解析别名
 *   - isValidAgentAlias —— 验证别名有效性
 *   - getAgentAliasNames —— 获取别名名称列表
 */

import type { ProviderKind } from "./orchestration";
import type { ModelSlug } from "./model";

/** Agent 别名颜色 */
type AgentAliasColor = "violet" | "fuchsia" | "teal" | "cyan" | "amber" | "orange";

/** 基础 Agent 别名定义 */
interface BaseAgentAliasDefinition {
  readonly provider: ProviderKind;
  readonly displayName: string;
  readonly color: AgentAliasColor;
}

/** Codex Agent 别名定义 */
export interface CodexAgentAliasDefinition extends BaseAgentAliasDefinition {
  readonly provider: "codex";
  readonly kind: "model";
  readonly model: ModelSlug;
}

/** Claude 子代理别名定义 */
export interface ClaudeSubagentAliasDefinition extends BaseAgentAliasDefinition {
  readonly provider: "claudeAgent";
  readonly kind: "claude-subagent";
  readonly agentName: string;
  readonly description: string;
  readonly prompt: string;
  readonly tools?: readonly string[];
  readonly disallowedTools?: readonly string[];
  readonly model?: string;
}

/** Agent 别名定义联合类型 */
export type AgentAliasDefinition = CodexAgentAliasDefinition | ClaudeSubagentAliasDefinition;

/** 已解析的 Agent 别名（含 alias 字段） */
export type ResolvedAgentAlias = AgentAliasDefinition & {
  readonly alias: string;
};

/** OpenCode 相关 Provider 的 Agent 别名配置（默认空） */
const OPENCODE_AGENT_MENTION_ALIASES: Record<string, AgentAliasDefinition> = {};

/** Codex Agent 别名配置 */
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

/** Claude Agent 别名配置 */
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

/** 按 Provider 分组的 Agent 别名表 */
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

/** 全局 Agent 别名表（向后兼容旧版调用方） */
export const AGENT_MENTION_ALIASES: Record<string, AgentAliasDefinition> = Object.assign(
  {},
  ...Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER),
);

/** 自动补全别名列表（按 Provider 分组） */
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
 * 将别名定义映射为已解析的别名列表。
 * @param input - 别名定义映射表
 * @returns 按别名排序的已解析别名列表
 */
function mapAgentEntries(input: Record<string, AgentAliasDefinition>): ResolvedAgentAlias[] {
  return Object.entries(input)
    .map(([alias, definition]) => Object.assign({ alias }, definition))
    .toSorted((a, b) => a.alias.localeCompare(b.alias));
}

/**
 * 获取指定 Provider 的所有可用 Agent 别名。
 * 不传 Provider 时返回全局并集，供解析和验证辅助函数使用。
 * @param provider - 可选的 Provider 类型
 * @returns 已解析的别名列表
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
 * 获取指定 Provider 在自动补全中显示的优先别名列表。
 * @param provider - Provider 类型
 * @returns 已解析的别名列表
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
 * 解析 Agent 别名。传入 Provider 时仅查找该 Provider 的别名。
 * @param alias - 别名字符串
 * @param provider - 可选的 Provider 类型
 * @returns 对应的别名定义，未找到时返回 null
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
 * 验证 Agent 别名是否有效。
 * @param alias - 别名字符串
 * @param provider - 可选的 Provider 类型
 * @returns 是否有效
 */
export function isValidAgentAlias(alias: string, provider?: ProviderKind): boolean {
  return resolveAgentAlias(alias, provider) !== null;
}

/**
 * 获取所有 Agent 别名名称列表。
 * @param provider - 可选的 Provider 类型
 * @returns 别名名称数组
 */
export function getAgentAliasNames(provider?: ProviderKind): string[] {
  if (provider) {
    return Object.keys(AGENT_MENTION_ALIASES_BY_PROVIDER[provider]);
  }

  return Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER).flatMap((definitions) =>
    Object.keys(definitions),
  );
}