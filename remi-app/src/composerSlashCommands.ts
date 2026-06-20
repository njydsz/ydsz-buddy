/**
 * @file composerSlashCommands.ts
 * @description Composer 斜杠命令的定义、解析和过滤模块。
 * 管理内置斜杠命令列表（如 /clear、/compact、/model 等），
 * 提供命令解析、搜索过滤、Provider 原生命令兼容等功能。
 */

import type { GitBranch, ProviderKind } from "@remi-code/contracts";

/**
 * 内置 Composer 斜杠命令列表。
 * - `clear`：清除当前对话上下文
 * - `compact`：压缩当前线程上下文以释放空间
 * - `model`：切换当前线程的响应模型
 * - `plan`：切换到计划模式
 * - `default`：切换回普通聊天模式
 * - `review`：启动代码审查
 * - `fork`：将线程分叉到本地或新 worktree
 * - `side`：从当前线程打开受保护的侧边聊天
 * - `status`：显示上下文使用量和速率限制状态
 * - `subagents`：插入委托子代理工作的提示
 * - `fast`：开启或关闭快速模式
 */
export const BUILT_IN_COMPOSER_SLASH_COMMANDS = [
  "clear",
  "compact",
  "model",
  "plan",
  "default",
  "review",
  "fork",
  "side",
  "status",
  "subagents",
  "fast",
] as const;

/** 内置 Composer 斜杠命令类型，从 BUILT_IN_COMPOSER_SLASH_COMMANDS 推导 */
export type ComposerSlashCommand = (typeof BUILT_IN_COMPOSER_SLASH_COMMANDS)[number];

/**
 * 斜杠命令定义，包含命令名、标签、描述和来源
 */
export interface ComposerSlashCommandDefinition {
  /** 命令名 */
  command: ComposerSlashCommand;
  /** 显示标签（如 `/clear`） */
  label: `/${ComposerSlashCommand}`;
  /** 命令描述 */
  description: string;
  /** 命令来源：`"app"` 为应用级命令，`"shared"` 为共享命令 */
  source: "app" | "shared";
}

/**
 * 斜杠命令调用结果，包含命令名和参数
 */
export interface ComposerSlashInvocation {
  /** 命令名 */
  command: ComposerSlashCommand;
  /** 命令参数文本 */
  args: string;
}

/** `/fast` 命令的操作类型 */
export type FastSlashCommandAction = "toggle" | "on" | "off" | "status" | "invalid";
/** `/fork` 命令的目标类型 */
export type ForkSlashCommandTarget = "local" | "worktree";

function normalizeSlashCommandName(value: string): string {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

const CLAUDE_NATIVE_COMMAND_ALIASES: Record<string, readonly string[]> = {
  clear: ["reset", "new"],
  config: ["settings"],
  desktop: ["app"],
  exit: ["quit"],
  feedback: ["bug"],
  branch: ["fork"],
  mobile: ["ios", "android"],
  permissions: ["allowed-tools"],
  "remote-control": ["rc"],
  resume: ["continue"],
};

function getProviderNativeSlashCommandAliases(
  provider: ProviderKind,
  command: string,
): readonly string[] {
  const normalizedCommand = normalizeSlashCommandName(command);
  if (provider !== "claudeAgent") {
    return [];
  }
  return CLAUDE_NATIVE_COMMAND_ALIASES[normalizedCommand] ?? [];
}

function expandProviderNativeSlashCommandNames(
  provider: ProviderKind,
  commandNames: ReadonlyArray<string>,
): string[] {
  const expandedNames = new Set<string>();
  for (const commandName of commandNames) {
    const normalizedCommandName = normalizeSlashCommandName(commandName);
    if (!normalizedCommandName) {
      continue;
    }
    expandedNames.add(normalizedCommandName);
    for (const alias of getProviderNativeSlashCommandAliases(provider, normalizedCommandName)) {
      expandedNames.add(alias);
    }
  }
  return [...expandedNames];
}

function shouldKeepBuiltInSlashCommandDespiteNativeCollision(
  provider: ProviderKind,
  command: ComposerSlashCommand,
): boolean {
  return provider === "codex" && command === "review";
}

/**
 * 判断是否应在 Composer 菜单中隐藏 Provider 原生命令。
 * 例如 Codex 的 `/review` 命令由应用内置命令替代，不应重复显示。
 *
 * @param provider - Provider 类型
 * @param command - 命令名
 * @returns 是否应隐藏
 */
export function shouldHideProviderNativeCommandFromComposerMenu(
  provider: ProviderKind,
  command: string,
): boolean {
  const normalizedCommand = normalizeSlashCommandName(command);
  return provider === "codex" && normalizedCommand === "review";
}

/**
 * 获取 Provider 原生命令的搜索词（包含命令名及其别名）。
 * 用于在 Composer 命令面板中支持按别名搜索。
 *
 * @param provider - Provider 类型
 * @param command - 命令名
 * @returns 搜索词数组（命令名 + 别名）
 */
export function getProviderNativeSlashCommandSearchTerms(
  provider: ProviderKind,
  command: string,
): readonly string[] {
  const normalizedCommand = normalizeSlashCommandName(command);
  return [normalizedCommand, ...getProviderNativeSlashCommandAliases(provider, normalizedCommand)];
}

const COMPOSER_SLASH_COMMAND_DEFINITIONS: Record<
  ComposerSlashCommand,
  ComposerSlashCommandDefinition
> = {
  clear: {
    command: "clear",
    label: "/clear",
    description: "Start a fresh thread and clear the current conversation context",
    source: "shared",
  },
  compact: {
    command: "compact",
    label: "/compact",
    description: "Compact the current thread context to free space",
    source: "app",
  },
  model: {
    command: "model",
    label: "/model",
    description: "Switch response model for this thread",
    source: "shared",
  },
  plan: {
    command: "plan",
    label: "/plan",
    description: "Switch this thread into plan mode",
    source: "app",
  },
  default: {
    command: "default",
    label: "/default",
    description: "Switch this thread back to normal chat mode",
    source: "app",
  },
  review: {
    command: "review",
    label: "/review",
    description: "Start a code review for current changes",
    source: "app",
  },
  fork: {
    command: "fork",
    label: "/fork",
    description: "Fork this thread into local or a new worktree",
    source: "app",
  },
  side: {
    command: "side",
    label: "/side",
    description: "Open a guarded sidechat from this thread",
    source: "app",
  },
  status: {
    command: "status",
    label: "/status",
    description: "Show context usage and rate-limit status",
    source: "app",
  },
  subagents: {
    command: "subagents",
    label: "/subagents",
    description: "Insert a prompt that asks the assistant to delegate work",
    source: "app",
  },
  fast: {
    command: "fast",
    label: "/fast",
    description: "Turn fast mode on or off for this thread",
    source: "app",
  },
};

/**
 * 判断给定值是否为内置 Composer 斜杠命令
 *
 * @param value - 待判断的字符串
 * @returns 是否为内置命令（类型守卫）
 */
export function isBuiltInComposerSlashCommand(value: string): value is ComposerSlashCommand {
  const normalizedValue = normalizeSlashCommandName(value);
  return BUILT_IN_COMPOSER_SLASH_COMMANDS.some((command) => command === normalizedValue);
}

/**
 * 解析文本为斜杠命令调用（使用全部内置命令）
 *
 * @param text - 待解析的文本
 * @returns 命令调用结果，不匹配时返回 null
 */
export function parseComposerSlashInvocation(text: string): ComposerSlashInvocation | null {
  return parseComposerSlashInvocationForCommands(text, BUILT_IN_COMPOSER_SLASH_COMMANDS);
}

/**
 * 解析文本为指定命令列表中的斜杠命令调用
 *
 * @param text - 待解析的文本
 * @param commands - 允许的命令列表
 * @returns 命令调用结果，不匹配时返回 null
 */
export function parseComposerSlashInvocationForCommands(
  text: string,
  commands: ReadonlyArray<ComposerSlashCommand>,
): ComposerSlashInvocation | null {
  const match = /^\/([a-z-]+)(?:\s+(.*))?$/i.exec(text.trim());
  if (!match) {
    return null;
  }
  const command = normalizeSlashCommandName(match[1] ?? "");
  if (!command || !commands.includes(command as ComposerSlashCommand)) {
    return null;
  }
  return {
    command: command as ComposerSlashCommand,
    args: (match[2] ?? "").trim(),
  };
}

/**
 * 获取指定斜杠命令的定义
 *
 * @param command - 命令名
 * @returns 命令定义
 */
export function getComposerSlashCommandDefinition(
  command: ComposerSlashCommand,
): ComposerSlashCommandDefinition {
  return COMPOSER_SLASH_COMMAND_DEFINITIONS[command];
}

/**
 * 根据查询文本过滤匹配的斜杠命令。
 * 支持按命令名、标签或描述进行模糊搜索。
 *
 * @param query - 搜索查询文本
 * @param commands - 待过滤的命令列表，默认为全部内置命令
 * @returns 匹配的命令定义列表
 */
export function filterComposerSlashCommands(
  query: string,
  commands: ReadonlyArray<ComposerSlashCommand> = BUILT_IN_COMPOSER_SLASH_COMMANDS,
): ComposerSlashCommandDefinition[] {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = commands.filter((command) => {
    if (!normalizedQuery) {
      return true;
    }
    const definition = COMPOSER_SLASH_COMMAND_DEFINITIONS[command];
    return (
      command.includes(normalizedQuery) ||
      definition.label.slice(1).includes(normalizedQuery) ||
      definition.description.toLowerCase().includes(normalizedQuery)
    );
  });

  return matches.map((command) => COMPOSER_SLASH_COMMAND_DEFINITIONS[command]);
}

function hasMeaningfulComposerText(prompt: string): boolean {
  return prompt.trim().length > 0;
}

/**
 * 判断是否可以提供 `/fork` 命令。
 * 仅在 Composer 为空（无文本、无附件、无上下文）且处于默认交互模式时可用。
 *
 * @param input - Composer 状态信息
 * @returns 是否可以提供 `/fork` 命令
 */
export function canOfferForkSlashCommand(input: {
  prompt: string;
  imageCount: number;
  terminalContextCount: number;
  selectedSkillCount: number;
  selectedMentionCount: number;
  interactionMode: "default" | "plan";
}): boolean {
  return (
    !hasMeaningfulComposerText(input.prompt) &&
    input.imageCount === 0 &&
    input.terminalContextCount === 0 &&
    input.selectedSkillCount === 0 &&
    input.selectedMentionCount === 0 &&
    input.interactionMode === "default"
  );
}

/**
 * 判断是否可以提供 `/side` 命令。
 * 仅在 Composer 为空、处于默认交互模式且当前不是侧边聊天时可用。
 *
 * @param input - Composer 状态信息
 * @returns 是否可以提供 `/side` 命令
 */
export function canOfferSideSlashCommand(input: {
  prompt: string;
  imageCount: number;
  terminalContextCount: number;
  selectedSkillCount: number;
  selectedMentionCount: number;
  interactionMode: "default" | "plan";
  isSidechat: boolean;
}): boolean {
  return (
    !hasMeaningfulComposerText(input.prompt) &&
    input.imageCount === 0 &&
    input.terminalContextCount === 0 &&
    input.selectedSkillCount === 0 &&
    input.selectedMentionCount === 0 &&
    input.interactionMode === "default" &&
    !input.isSidechat
  );
}

/**
 * 判断是否可以提供 `/review` 命令。
 * 仅在 Composer 为空（无文本、无附件、无上下文）时可用。
 *
 * @param input - Composer 状态信息
 * @returns 是否可以提供 `/review` 命令
 */
export function canOfferReviewSlashCommand(input: {
  prompt: string;
  imageCount: number;
  terminalContextCount: number;
  selectedSkillCount: number;
  selectedMentionCount: number;
}): boolean {
  return (
    !hasMeaningfulComposerText(input.prompt) &&
    input.imageCount === 0 &&
    input.terminalContextCount === 0 &&
    input.selectedSkillCount === 0 &&
    input.selectedMentionCount === 0
  );
}

/**
 * 构建 `/subagents` 命令的提示文本。
 * 如果已有用户输入，则在末尾追加子代理委托指令。
 *
 * @param existingPrompt - 用户已有的提示文本
 * @returns 包含子代理委托指令的完整提示
 */
export function buildSubagentsPrompt(existingPrompt: string): string {
  const cannedPrompt =
    "Run subagents for different tasks. Delegate distinct work in parallel when helpful and then synthesize the results.";
  const trimmedPrompt = existingPrompt.trim();
  return trimmedPrompt.length > 0 ? `${trimmedPrompt}\n\n${cannedPrompt}` : cannedPrompt;
}

/**
 * 构建 `/review` 命令的提示文本。
 * 根据审查目标（未提交更改或分支差异）生成不同的审查指令。
 *
 * @param input.target - 审查目标：`"changes"` 审查未提交更改，`"base-branch"` 审查分支差异
 * @returns 审查提示文本
 */
export function buildReviewPrompt(input: { target: "changes" | "base-branch" }): string {
  const baseInstruction =
    "Review the local code changes for bugs, risks, behavioural regressions, and missing tests. Findings first, ordered by severity.";
  if (input.target === "base-branch") {
    return `${baseInstruction}\nFocus on the current branch diff against its base branch.`;
  }
  return `${baseInstruction}\nFocus on the current uncommitted changes.`;
}

/**
 * 解析 `/fast` 命令的操作类型
 *
 * @param text - 命令文本
 * @returns 操作类型，非 `/fast` 命令时返回 null
 */
export function parseFastSlashCommandAction(text: string): FastSlashCommandAction | null {
  const invocation = parseComposerSlashInvocation(text);
  if (!invocation || invocation.command !== "fast") {
    return null;
  }
  const arg = invocation.args.toLowerCase();
  if (!arg) {
    return "toggle";
  }
  if (arg === "on") {
    return "on";
  }
  if (arg === "off") {
    return "off";
  }
  if (arg === "status") {
    return "status";
  }
  return "invalid";
}

/**
 * 解析 `/fork` 斜杠命令的根分支。
 * 按优先级查找：当前 worktree 匹配的分支 → 当前分支 → 活跃线程分支。
 *
 * @param input.branches - Git 分支列表
 * @param input.activeProjectCwd - 活跃项目的工作目录
 * @param input.activeThreadBranch - 活跃线程的分支名
 * @returns 根分支名，无法确定时返回 null
 */
export function resolveComposerSlashRootBranch(input: {
  branches: ReadonlyArray<GitBranch> | null | undefined;
  activeProjectCwd: string | null | undefined;
  activeThreadBranch: string | null | undefined;
}): string | null {
  return (
    input.branches?.find(
      (branch) =>
        branch.current === true &&
        (branch.worktreePath === null ||
          branch.worktreePath === undefined ||
          branch.worktreePath === input.activeProjectCwd),
    )?.name ??
    input.branches?.find((branch) => branch.current === true)?.name ??
    input.activeThreadBranch ??
    null
  );
}

/**
 * 获取当前可用的 Composer 斜杠命令列表。
 * 根据 Provider 类型和功能支持情况过滤可用命令，
 * 同时排除与 Provider 原生命令冲突的内置命令。
 *
 * @param input.provider - 当前 Provider 类型
 * @param input.supportsFastSlashCommand - 是否支持 `/fast` 命令
 * @param input.canOfferCompactCommand - 是否可以提供 `/compact` 命令
 * @param input.canOfferReviewCommand - 是否可以提供 `/review` 命令
 * @param input.canOfferForkCommand - 是否可以提供 `/fork` 命令
 * @param input.canOfferSideCommand - 是否可以提供 `/side` 命令
 * @param input.providerNativeCommandNames - Provider 原生命令名列表
 * @returns 可用的命令列表
 */
export function getAvailableComposerSlashCommands(input: {
  provider: ProviderKind;
  supportsFastSlashCommand: boolean;
  canOfferCompactCommand: boolean;
  canOfferReviewCommand: boolean;
  canOfferForkCommand: boolean;
  canOfferSideCommand: boolean;
  providerNativeCommandNames?: ReadonlyArray<string>;
}): ComposerSlashCommand[] {
  const collidingNativeCommandNames = new Set<ComposerSlashCommand>(
    expandProviderNativeSlashCommandNames(
      input.provider,
      input.providerNativeCommandNames ?? [],
    ).filter(
      (name): name is ComposerSlashCommand =>
        isBuiltInComposerSlashCommand(name) &&
        !shouldKeepBuiltInSlashCommandDespiteNativeCollision(input.provider, name),
    ),
  );

  const availableCommands: ComposerSlashCommand[] =
    input.provider !== "claudeAgent"
      ? [
          "clear",
          ...(input.canOfferCompactCommand ? (["compact"] as const) : []),
          "model",
          ...(input.supportsFastSlashCommand ? (["fast"] as const) : []),
          "plan",
          "default",
          ...(input.canOfferReviewCommand ? (["review"] as const) : []),
          ...(input.canOfferForkCommand ? (["fork"] as const) : []),
          ...(input.canOfferSideCommand ? (["side"] as const) : []),
          "status",
          "subagents",
        ]
      : [
          // Claude owns most slash-command UX natively; sidechat remains app-level because it
          // creates a Remi Code split/context clone before the provider sees the first turn.
          ...(input.canOfferSideCommand ? (["side"] as const) : []),
        ];
  return availableCommands.filter((command) => !collidingNativeCommandNames.has(command));
}

/**
 * 判断指定命令是否为 Provider 原生命令（包含别名匹配）
 *
 * @param provider - Provider 类型
 * @param commandNames - Provider 原生命令名列表
 * @param command - 待判断的命令名
 * @returns 是否为 Provider 原生命令
 */
export function hasProviderNativeSlashCommand(
  provider: ProviderKind,
  commandNames: ReadonlyArray<string>,
  command: string,
): boolean {
  const normalizedCommand = normalizeSlashCommandName(command);
  return expandProviderNativeSlashCommandNames(provider, commandNames).includes(normalizedCommand);
}

/**
 * 构建 `/review` 斜杠命令的完整提示文本。
 * 支持指定审查目标（未提交更改或基准分支）和额外关注点。
 *
 * @param args - 命令参数，可包含 `base` 关键字指定审查基准分支
 * @returns 完整的审查提示文本
 */
export function buildSlashReviewComposerPrompt(args: string): string {
  const trimmedArgs = args.trim();
  const normalizedArgs = trimmedArgs.toLowerCase();
  const reviewTarget =
    normalizedArgs === "base" || normalizedArgs.startsWith("base ") ? "base-branch" : "changes";
  const basePrompt = buildReviewPrompt({ target: reviewTarget });
  if (!trimmedArgs) {
    return basePrompt;
  }
  if (reviewTarget === "base-branch") {
    const baseBranchHint = trimmedArgs.replace(/^base\b/i, "").trim();
    return baseBranchHint.length > 0
      ? `${basePrompt}\nUse ${baseBranchHint} as the base branch if needed.`
      : basePrompt;
  }
  return `${basePrompt}\nFocus especially on: ${trimmedArgs}`;
}

/**
 * 解析 `/fork` 命令的目标参数。
 * 仅接受 `local` 或 `worktree` 作为有效参数。
 *
 * @param args - 命令参数文本
 * @returns 解析结果，包含目标类型和是否无效
 */
export function parseForkSlashCommandArgs(args: string): {
  target: ForkSlashCommandTarget | null;
  invalid: boolean;
} {
  const trimmedArgs = args.trim();
  if (!trimmedArgs) {
    return { target: null, invalid: false };
  }

  const match = /^(local|worktree)$/i.exec(trimmedArgs);
  if (!match) {
    return { target: null, invalid: true };
  }

  return {
    target: match[1]!.toLowerCase() as ForkSlashCommandTarget,
    invalid: false,
  };
}
