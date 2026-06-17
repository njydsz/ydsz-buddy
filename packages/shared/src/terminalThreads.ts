/**
 * 文件: terminalThreads.ts
 * 用途: 终端身份标识共享工具，提供终端命名、提供商标识、运行状态等元数据辅助函数。
 * 层级: 共享终端元数据工具
 * 主要导出: 命令解析、终端视觉身份解析、终端身份调和等，供 Web 和服务端消费。
 */

/** 通用终端线程默认标题 */
export const GENERIC_TERMINAL_THREAD_TITLE = "New terminal";
/** 终端 CLI 工具类型 */
export type TerminalCliKind = "codex" | "claude";
/** 终端图标键 */
export type TerminalIconKey = "terminal" | "openai" | "claude";
/** 终端活动状态 */
export type TerminalActivityState = "running" | "attention" | "review";
/** 终端视觉状态（包含空闲和活动状态） */
export type TerminalVisualState = "idle" | TerminalActivityState;
/** 终端代理钩子事件类型 */
export type TerminalAgentHookEventType = "Start" | "Stop" | "PermissionRequest";
/** 环境变量键：指定终端 CLI 类型 */
export const REMI_CODE_TERMINAL_CLI_KIND_ENV_KEY = "REMI_CODE_TERMINAL_CLI_KIND";
/** OSC 转义序列前缀，用于终端代理事件通信 */
export const REMI_CODE_TERMINAL_HOOK_OSC_PREFIX = "633;REMI_CODE_AGENT_EVENT=";
/** CLI 类型到托管终端命令名的映射 */
export const MANAGED_TERMINAL_COMMAND_NAME_BY_CLI_KIND: Record<TerminalCliKind, string> = {
  codex: "codex",
  claude: "claude",
};

/** 终端命令身份标识 */
export interface TerminalCommandIdentity {
  cliKind: TerminalCliKind | null;
  iconKey: TerminalIconKey;
  title: string;
}

/** 包含视觉状态的终端身份标识 */
export interface ResolvedTerminalVisualIdentity extends TerminalCommandIdentity {
  state: TerminalVisualState;
}

/** 终端身份调和输入参数 */
interface ReconcileTerminalCommandIdentityInput {
  currentCliKind?: TerminalCliKind | null | undefined;
  currentTitle?: string | null | undefined;
  nextCliKind?: TerminalCliKind | null | undefined;
  nextTitle: string;
}

/**
 * 判断给定标题是否为通用终端线程标题。
 * @param title - 待检测的标题字符串。
 * @returns 相等或为空白时返回 true。
 */
export function isGenericTerminalThreadTitle(title: string | null | undefined): boolean {
  return (title ?? "").trim() === GENERIC_TERMINAL_THREAD_TITLE;
}

/** 终端输入缓冲区最大长度 */
const MAX_TERMINAL_INPUT_BUFFER_LENGTH = 512;
/** 终端标题最大长度 */
const MAX_TERMINAL_TITLE_LENGTH = 48;

/** Shell 包装命令集合（如 builtin、command、env 等） */
const WRAPPER_COMMANDS = new Set(["builtin", "command", "env", "noglob", "nocorrect", "sudo"]);
/** Codex CLI 命令名集合 */
const CODEX_COMMAND_NAMES = new Set(["codex", "codex-cli"]);
/** Claude CLI 命令名集合 */
const CLAUDE_COMMAND_NAMES = new Set(["claude", "claude-code", "claude_code"]);
/** 输出文本中匹配 Codex 的正则模式 */
const OUTPUT_CODEX_TEXT_PATTERNS = [/\bopenai codex\b(?:\s*\(|\s+v)/i, /\bcodex cli\b/i];
/** 输出文本中匹配 Claude 的正则模式 */
const OUTPUT_CLAUDE_TEXT_PATTERNS = [/\bclaude code\b(?:\s+v\d|\s*$)/i];
/** 标题文本中匹配 Codex 的正则模式 */
const TITLE_CODEX_TEXT_PATTERNS = [/\bopenai codex\b/i, /\bcodex cli\b/i];
/** 标题文本中匹配 Claude 的正则模式 */
const TITLE_CLAUDE_TEXT_PATTERNS = [/\bclaude code\b/i];
/** 进程名中匹配 Codex 的正则模式 */
const PROCESS_CODEX_TEXT_PATTERNS = [/@openai\/codex/i];
/** 进程名中匹配 Claude 的正则模式 */
const PROCESS_CLAUDE_TEXT_PATTERNS = [/@anthropic-ai\/claude-code/i, /anthropic\/claude-code/i];
/** 不应用于终端标题的 shell 内置命令 */
const IGNORED_TERMINAL_TITLE_COMMANDS = new Set([
  ".",
  "alias",
  "cd",
  "clear",
  "exit",
  "export",
  "history",
  "la",
  "ll",
  "logout",
  "ls",
  "pwd",
  "reset",
  "source",
  "unalias",
  "unset",
]);

/** 截断终端标题至最大长度 */
function truncateTerminalTitle(title: string): string {
  return title.length <= MAX_TERMINAL_TITLE_LENGTH
    ? title
    : title.slice(0, MAX_TERMINAL_TITLE_LENGTH).trimEnd();
}

/**
 * 规范化文本以用于身份检测：移除 ANSI 转义序列和控制字符，
 * 并将连续空白压缩为单个空格。
 */
function normalizeTextForIdentityDetection(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, " ")
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, " ")
    .replace(/\u001b[P^_].*?(?:\u001b\\|\u0007|\u009c)/g, " ")
    .replace(/\u001b[@-_]/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 规范化命令 token：提取路径中的文件名部分并转为小写 */
function normalizeCommandToken(token: string): string {
  const normalizedPath = token.replaceAll("\\", "/");
  const segments = normalizedPath.split("/");
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment) {
      return segment.toLowerCase();
    }
  }
  return normalizedPath.toLowerCase();
}

/** 去除脚本文件扩展名（如 .js、.ts、.py 等） */
function stripScriptExtension(token: string): string {
  return token.replace(/\.(?:cjs|cts|js|jsx|mjs|mts|py|ts|tsx)$/i, "");
}

/** 从规范化 token 推导 CLI 类型 */
function deriveCliKindFromNormalizedToken(token: string): TerminalCliKind | null {
  const normalizedToken = stripScriptExtension(token.trim().toLowerCase());
  if (normalizedToken.length === 0) {
    return null;
  }
  if (CODEX_COMMAND_NAMES.has(normalizedToken) || normalizedToken === "@openai/codex") {
    return "codex";
  }
  if (
    CLAUDE_COMMAND_NAMES.has(normalizedToken) ||
    normalizedToken === "@anthropic-ai/claude-code"
  ) {
    return "claude";
  }
  return null;
}

/** 从 token 列表中推导 CLI 类型（取第一个匹配项） */
function deriveCliKindFromTokenList(tokens: string[]): TerminalCliKind | null {
  for (const token of tokens) {
    const cliKind = deriveCliKindFromNormalizedToken(normalizeCommandToken(token));
    if (cliKind) {
      return cliKind;
    }
  }
  return null;
}

/** 通用文本模式匹配：检查文本是否匹配指定 CLI 的正则模式 */
function textMatchesCliPatterns(
  text: string,
  patterns: ReadonlyArray<RegExp>,
  cliKind: TerminalCliKind,
): TerminalCliKind | null {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return cliKind;
    }
  }
  return null;
}

/** 从输出文本中推导 CLI 类型（匹配 CLI 横幅等特征文本） */
function deriveCliKindFromOutputText(text: string | null | undefined): TerminalCliKind | null {
  const normalizedText = text?.trim();
  if (!normalizedText) {
    return null;
  }
  return (
    textMatchesCliPatterns(normalizedText, OUTPUT_CODEX_TEXT_PATTERNS, "codex") ??
    textMatchesCliPatterns(normalizedText, OUTPUT_CLAUDE_TEXT_PATTERNS, "claude")
  );
}

/** 从进程名文本中推导 CLI 类型 */
function deriveCliKindFromProcessText(text: string | null | undefined): TerminalCliKind | null {
  const normalizedText = text?.trim();
  if (!normalizedText) {
    return null;
  }
  return (
    textMatchesCliPatterns(normalizedText, PROCESS_CODEX_TEXT_PATTERNS, "codex") ??
    textMatchesCliPatterns(normalizedText, PROCESS_CLAUDE_TEXT_PATTERNS, "claude")
  );
}

/** 判断 token 是否为环境变量赋值（如 `KEY=value`） */
function isEnvAssignmentToken(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

/**
 * 对 Shell 命令进行词法分析（tokenize），处理引号和转义。
 * 返回拆分后的 token 列表。
 */
function tokenizeShellCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escapeNext = false;

  for (const char of command.trim()) {
    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = quote !== "'";
      if (!escapeNext) {
        current += char;
      }
      continue;
    }
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

/** 剥离 shell 前缀：环境变量赋值和包装命令（如 builtin、sudo 等） */
function stripShellPrefixes(tokens: string[]): string[] {
  let startIndex = 0;
  while (startIndex < tokens.length && isEnvAssignmentToken(tokens[startIndex] ?? "")) {
    startIndex += 1;
  }
  while (
    startIndex < tokens.length &&
    WRAPPER_COMMANDS.has(normalizeCommandToken(tokens[startIndex]!))
  ) {
    startIndex += 1;
    while (startIndex < tokens.length && isEnvAssignmentToken(tokens[startIndex] ?? "")) {
      startIndex += 1;
    }
  }
  return tokens.slice(startIndex);
}

/** 展开执行器命令：识别 npx、bunx、pnpm dlx、npm exec 等并提取实际命令 */
function unwrapExecutorCommand(tokens: string[]): string[] {
  const [first, second, third] = tokens;
  const normalizedFirst = normalizeCommandToken(first ?? "");
  const normalizedSecond = normalizeCommandToken(second ?? "");

  if ((normalizedFirst === "npx" || normalizedFirst === "bunx") && second) {
    return [second, ...tokens.slice(2)];
  }
  if (normalizedFirst === "pnpm" && normalizedSecond === "dlx" && third) {
    return [third, ...tokens.slice(3)];
  }
  if (normalizedFirst === "npm" && normalizedSecond === "exec" && third) {
    return [third, ...tokens.slice(3)];
  }
  return tokens;
}

/** 从包管理器命令中提取标题（如 `npm run build` → "npm run build"） */
function derivePackageManagerTitle(tokens: string[]): string | null {
  const [first, second, third] = tokens.map(normalizeCommandToken);
  if (!first || !["bun", "npm", "pnpm", "yarn"].includes(first)) {
    return null;
  }
  if (second && ["create", "dlx", "exec", "run"].includes(second) && third) {
    return `${first} ${second} ${third}`;
  }
  if (second) {
    return `${first} ${second}`;
  }
  return first;
}

/** 创建终端命令身份标识 */
function createTerminalCommandIdentity(
  title: string,
  cliKind: TerminalCliKind | null,
): TerminalCommandIdentity {
  return {
    cliKind,
    iconKey: cliKind === "codex" ? "openai" : cliKind === "claude" ? "claude" : "terminal",
    title,
  };
}

/**
 * 根据 CLI 类型返回默认终端标题。
 * @param cliKind - CLI 类型。
 * @returns 对应的默认标题字符串。
 */
export function defaultTerminalTitleForCliKind(cliKind: TerminalCliKind): string {
  return cliKind === "codex" ? "Codex CLI" : "Claude Code";
}

/**
 * 根据 CLI 类型返回托管终端命令名。
 * @param cliKind - CLI 类型。
 * @returns 对应的命令名字符串。
 */
export function managedTerminalCommandNameForCliKind(cliKind: TerminalCliKind): string {
  return MANAGED_TERMINAL_COMMAND_NAME_BY_CLI_KIND[cliKind];
}

/**
 * 从原始值中解析 CLI 类型。
 * @param value - 待解析的字符串值。
 * @returns 有效 CLI 类型或 null。
 */
export function terminalCliKindFromValue(value: string | null | undefined): TerminalCliKind | null {
  const normalizedValue = value?.trim().toLowerCase();
  return normalizedValue === "codex" || normalizedValue === "claude" ? normalizedValue : null;
}

/**
 * 从进程命令中推导终端身份标识。
 *
 * 优先使用实际执行的进程名而非 shell 别名来进行终端提供商标识。
 *
 * @param command - 进程命令行字符串。
 * @returns 终端命令身份标识或 null。
 */
export function deriveTerminalProcessIdentity(
  command: string | null | undefined,
): TerminalCommandIdentity | null {
  const strippedCommand = command?.trim() ?? "";
  if (strippedCommand.length === 0) {
    return null;
  }
  // 优先通过 token 匹配，再通过进程文本匹配
  const tokenCliKind =
    deriveCliKindFromTokenList(tokenizeShellCommand(strippedCommand)) ??
    deriveCliKindFromProcessText(strippedCommand);
  if (tokenCliKind === "codex") {
    return createTerminalCommandIdentity(defaultTerminalTitleForCliKind("codex"), "codex");
  }
  if (tokenCliKind === "claude") {
    return createTerminalCommandIdentity(defaultTerminalTitleForCliKind("claude"), "claude");
  }
  return null;
}

/** 从标题文本中推断 CLI 类型 */
function inferCliKindFromTitle(title: string | null | undefined): TerminalCliKind | null {
  const normalizedTitle = title?.trim().toLowerCase();
  if (!normalizedTitle) {
    return null;
  }
  if (/^codex(?: cli)?(?: \d+)?$/.test(normalizedTitle)) {
    return "codex";
  }
  if (/^claude(?: code)?(?: \d+)?$/.test(normalizedTitle) || normalizedTitle === "claude-code") {
    return "claude";
  }
  return (
    textMatchesCliPatterns(normalizedTitle, TITLE_CODEX_TEXT_PATTERNS, "codex") ??
    textMatchesCliPatterns(normalizedTitle, TITLE_CLAUDE_TEXT_PATTERNS, "claude")
  );
}

/** 规范化持久化的终端标题：非空则使用原值，否则回退到 CLI 默认标题 */
function normalizePersistedTerminalTitle(
  title: string | null | undefined,
  cliKind: TerminalCliKind | null,
): string {
  const normalizedTitle = title?.trim();
  if (normalizedTitle && normalizedTitle.length > 0) {
    return normalizedTitle;
  }
  return cliKind ? defaultTerminalTitleForCliKind(cliKind) : GENERIC_TERMINAL_THREAD_TITLE;
}

/**
 * 将提交的 shell 命令转换为稳定的终端身份标识（用于标签和图标）。
 *
 * 解析流程：tokenize → 剥离 shell 前缀 → 展开执行器 → 识别 CLI/包管理器/通用命令。
 *
 * @param command - 待解析的 shell 命令字符串。
 * @returns 终端命令身份标识或 null（无法识别时）。
 */
export function deriveTerminalCommandIdentity(command: string): TerminalCommandIdentity | null {
  const strippedCommand = command.trim();
  if (strippedCommand.length === 0) {
    return null;
  }

  const baseTokens = stripShellPrefixes(tokenizeShellCommand(strippedCommand));
  if (baseTokens.length === 0) {
    return null;
  }

  const tokens = unwrapExecutorCommand(baseTokens);
  const normalizedTokens = tokens.map(normalizeCommandToken);
  const first = normalizedTokens[0];
  const second = normalizedTokens[1];

  if (!first || IGNORED_TERMINAL_TITLE_COMMANDS.has(first)) {
    return null;
  }
  const detectedCliKind = deriveCliKindFromTokenList(tokens);
  if (detectedCliKind === "codex") {
    return createTerminalCommandIdentity("Codex CLI", "codex");
  }
  if (detectedCliKind === "claude" || (first === "claude" && second === "code")) {
    return createTerminalCommandIdentity("Claude Code", "claude");
  }
  if (first === "git") {
    return createTerminalCommandIdentity(
      truncateTerminalTitle(second ? `git ${second}` : "git"),
      null,
    );
  }

  const packageManagerTitle = derivePackageManagerTitle(tokens);
  if (packageManagerTitle) {
    return createTerminalCommandIdentity(truncateTerminalTitle(packageManagerTitle), null);
  }

  const genericTitle = normalizedTokens.slice(0, 2).join(" ").trim();
  return genericTitle.length > 0
    ? createTerminalCommandIdentity(truncateTerminalTitle(genericTitle), null)
    : null;
}

/**
 * 调和终端身份标识：保持提供商标签的粘性。
 *
 * 一旦终端被识别为 Codex/Claude 会话，CLI 内部的自由格式输入不应
 * 将图标/标题降级回通用 shell 命令。
 *
 * @param input - 当前和新的身份信息。
 * @returns 调和后的终端命令身份标识。
 */
export function reconcileTerminalCommandIdentity(
  input: ReconcileTerminalCommandIdentityInput,
): TerminalCommandIdentity {
  const nextIdentity = createTerminalCommandIdentity(
    input.nextTitle.trim(),
    input.nextCliKind ?? null,
  );
  const currentCliKind =
    input.currentCliKind === undefined
      ? inferCliKindFromTitle(input.currentTitle)
      : input.currentCliKind;
  if (!currentCliKind) {
    return nextIdentity;
  }
  if (nextIdentity.cliKind) {
    return nextIdentity;
  }
  return createTerminalCommandIdentity(
    normalizePersistedTerminalTitle(input.currentTitle, currentCliKind),
    currentCliKind,
  );
}

/**
 * 从命令中推导终端标题（仅返回字符串，兼容旧版调用方）。
 * @param command - 待解析的 shell 命令。
 * @returns 标题字符串或 null。
 */
export function deriveTerminalTitleFromCommand(command: string): string | null {
  return deriveTerminalCommandIdentity(command)?.title ?? null;
}

/**
 * 增量消费终端输入，仅在 Enter 提交命令时返回终端身份标识。
 *
 * 处理回退、Tab、Ctrl+C/D/U 等控制字符，维护输入缓冲区。
 *
 * @param buffer - 当前输入缓冲区。
 * @param data - 新接收的输入数据。
 * @returns 更新后的缓冲区和可能的身份标识。
 */
export function consumeTerminalIdentityInput(
  buffer: string,
  data: string,
): { buffer: string; identity: TerminalCommandIdentity | null } {
  // 包含 ANSI 转义序列的数据不做身份解析
  if (data.includes("\u001b")) {
    return { buffer, identity: null };
  }

  let nextBuffer = buffer;
  let nextIdentity: TerminalCommandIdentity | null = null;
  for (const char of data) {
    if (char === "\r" || char === "\n") {
      // Enter 提交：解析当前缓冲区
      nextIdentity = deriveTerminalCommandIdentity(nextBuffer);
      nextBuffer = "";
      continue;
    }
    if (char === "\b" || char === "\u007f") {
      // 回退
      nextBuffer = nextBuffer.slice(0, -1);
      continue;
    }
    if (char === "\t") {
      // Tab 转空格
      nextBuffer += " ";
      continue;
    }
    if (char === "\u0003" || char === "\u0004" || char === "\u0015") {
      // Ctrl+C / Ctrl+D / Ctrl+U：清空缓冲区
      nextBuffer = "";
      continue;
    }
    if (char >= " ") {
      nextBuffer += char;
    }
  }

  return {
    buffer: nextBuffer.slice(-MAX_TERMINAL_INPUT_BUFFER_LENGTH),
    identity: nextIdentity,
  };
}

/**
 * 仅返回标题的终端输入消费（兼容旧版 API）。
 * @param buffer - 当前输入缓冲区。
 * @param data - 新接收的输入数据。
 * @returns 更新后的缓冲区和可能的标题。
 */
export function consumeTerminalTitleInput(
  buffer: string,
  data: string,
): { buffer: string; title: string | null } {
  const nextIdentityState = consumeTerminalIdentityInput(buffer, data);
  return {
    buffer: nextIdentityState.buffer,
    title: nextIdentityState.identity?.title ?? null,
  };
}

/**
 * 从 CLI 输出文本（如启动横幅）中检测提供商标识。
 * @param output - 终端输出文本。
 * @returns 终端命令身份标识或 null。
 */
export function deriveTerminalOutputIdentity(output: string): TerminalCommandIdentity | null {
  const cliKind = deriveCliKindFromOutputText(normalizeTextForIdentityDetection(output));
  return cliKind
    ? createTerminalCommandIdentity(defaultTerminalTitleForCliKind(cliKind), cliKind)
    : null;
}

/**
 * 从终端标题信号中检测提供商标识（不将标题直接作为标签名）。
 * @param title - 终端标题文本。
 * @returns 终端命令身份标识或 null。
 */
export function deriveTerminalTitleSignalIdentity(title: string): TerminalCommandIdentity | null {
  const cliKind = inferCliKindFromTitle(title);
  return cliKind
    ? createTerminalCommandIdentity(defaultTerminalTitleForCliKind(cliKind), cliKind)
    : null;
}

/**
 * 从持久化元数据和运行时状态中解析终端标签、图标和活动状态。
 *
 * @param input - 包含 CLI 类型、标题、运行状态等信息的输入对象。
 * @returns 完整的终端视觉身份标识。
 */
export function resolveTerminalVisualIdentity(input: {
  cliKind?: TerminalCliKind | null | undefined;
  fallbackTitle: string;
  isRunning?: boolean | undefined;
  state?: TerminalVisualState | null | undefined;
  title?: string | null | undefined;
}): ResolvedTerminalVisualIdentity {
  const resolvedCliKind = input.cliKind ?? inferCliKindFromTitle(input.title);
  const title =
    input.title?.trim() ||
    (resolvedCliKind ? defaultTerminalTitleForCliKind(resolvedCliKind) : input.fallbackTitle);
  const cliKind = resolvedCliKind ?? null;
  const state = input.state ?? (input.isRunning ? "running" : "idle");
  return {
    cliKind,
    iconKey: cliKind === "codex" ? "openai" : cliKind === "claude" ? "claude" : "terminal",
    state,
    title,
  };
}
