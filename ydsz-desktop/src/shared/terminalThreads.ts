/**
 * @file 终端线程标识工具模块
 *
 * 本模块提供终端线程的身份识别、命名和运行状态相关的工具：
 *
 * - **终端身份识别**：从命令字符串推导终端是 Codex CLI 还是 Claude Code
 * - **图标键映射**：根据 CLI 类型映射到对应的图标键（terminal/openai/claude）
 * - **运行状态追踪**：区分 idle/running/attention/review 等状态
 * - **标题生成**：从 shell 命令生成简洁的终端标题
 * - **输入缓冲处理**：消费终端输入流并实时检测身份
 *
 * ## 核心导出
 *
 * - `GENERIC_TERMINAL_THREAD_TITLE`：通用终端标题常量
 * - `TerminalCliKind`：CLI 类型（codex/claude）
 * - `TerminalCommandIdentity`：终端命令身份（cliKind/iconKey/title）
 * - `deriveTerminalCommandIdentity`：从命令推导终端身份
 * - `deriveTerminalProcessIdentity`：从进程信息推导终端身份
 * - `resolveTerminalVisualIdentity`：解析终端视觉身份（含状态）
 *
 * ## 使用场景
 *
 * - 终端列表的标签和图标渲染
 * - 终端线程标题自动命名
 * - 区分用户执行的命令类型
 * - Provider 标签页持久化
 *
 * ## 注意事项
 *
 * - 命令解析会忽略 cd、ls、exit 等通用 shell 命令
 * - 检测支持 npx/bunx/pnpm dlx/npm exec 等封装命令
 * - 终端身份一旦识别为 Codex/Claude 会保持，不会降级
 */

/** 通用终端线程标题常量 */
export const GENERIC_TERMINAL_THREAD_TITLE = "New terminal";

/**
 * 终端 CLI 类型。
 * - `codex`：OpenAI Codex CLI
 * - `claude`：Anthropic Claude Code
 */
export type TerminalCliKind = "codex" | "claude";

/**
 * 终端图标键类型。
 * - `terminal`：通用终端图标
 * - `openai`：OpenAI Codex 图标
 * - `claude`：Claude 图标
 */
export type TerminalIconKey = "terminal" | "openai" | "claude";

/**
 * 终端活动状态。
 * - `running`：正在执行命令
 * - `attention`：需要用户关注
 * - `review`：等待审查
 */
export type TerminalActivityState = "running" | "attention" | "review";

/**
 * 终端视觉状态。
 * - `idle`：空闲状态
 * - `TerminalActivityState`：活动状态
 */
export type TerminalVisualState = "idle" | TerminalActivityState;

/**
 * 终端 Agent Hook 事件类型。
 * - `Start`：Agent 开始
 * - `Stop`：Agent 停止
 * - `PermissionRequest`：权限请求
 */
export type TerminalAgentHookEventType = "Start" | "Stop" | "PermissionRequest";

/** 环境变量名：终端 CLI 类型 */
export const YDSZ_CLAW_TERMINAL_CLI_KIND_ENV_KEY = "YDSZ_Buddy_TERMINAL_CLI_KIND";

/** OSC 前缀：终端 Agent 事件 */
export const YDSZ_CLAW_TERMINAL_HOOK_OSC_PREFIX = "633;YDSZ_Buddy_AGENT_EVENT=";

/** CLI 类型对应的托管命令名映射 */
export const MANAGED_TERMINAL_COMMAND_NAME_BY_CLI_KIND: Record<TerminalCliKind, string> = {
  codex: "codex",
  claude: "claude",
};

/**
 * 终端命令身份信息。
 *
 * 描述一个终端线程的身份特征，用于 UI 渲染标签和图标。
 */
export interface TerminalCommandIdentity {
  /** CLI 类型（codex/claude），若为通用 shell 则为 null */
  cliKind: TerminalCliKind | null;
  /** 对应的图标键 */
  iconKey: TerminalIconKey;
  /** 终端标题 */
  title: string;
}

/**
 * 终端视觉身份信息。
 *
 * 在 `TerminalCommandIdentity` 基础上增加了运行状态。
 */
export interface ResolvedTerminalVisualIdentity extends TerminalCommandIdentity {
  /** 视觉状态（idle/running/attention/review） */
  state: TerminalVisualState;
}

interface ReconcileTerminalCommandIdentityInput {
  currentCliKind?: TerminalCliKind | null | undefined;
  currentTitle?: string | null | undefined;
  nextCliKind?: TerminalCliKind | null | undefined;
  nextTitle: string;
}

/**
 * 判断给定标题是否为通用终端标题。
 *
 * @param title - 待检测的标题
 * @returns 若为通用终端标题则返回 true
 */
export function isGenericTerminalThreadTitle(title: string | null | undefined): boolean {
  return (title ?? "").trim() === GENERIC_TERMINAL_THREAD_TITLE;
}

const MAX_TERMINAL_INPUT_BUFFER_LENGTH = 512;
const MAX_TERMINAL_TITLE_LENGTH = 48;

const WRAPPER_COMMANDS = new Set(["builtin", "command", "env", "noglob", "nocorrect", "sudo"]);
const CODEX_COMMAND_NAMES = new Set(["codex", "codex-cli"]);
const CLAUDE_COMMAND_NAMES = new Set(["claude", "claude-code", "claude_code"]);
const OUTPUT_CODEX_TEXT_PATTERNS = [/\bopenai codex\b(?:\s*\(|\s+v)/i, /\bcodex cli\b/i];
const OUTPUT_CLAUDE_TEXT_PATTERNS = [/\bclaude code\b(?:\s+v\d|\s*$)/i];
const TITLE_CODEX_TEXT_PATTERNS = [/\bopenai codex\b/i, /\bcodex cli\b/i];
const TITLE_CLAUDE_TEXT_PATTERNS = [/\bclaude code\b/i];
const PROCESS_CODEX_TEXT_PATTERNS = [/@openai\/codex/i];
const PROCESS_CLAUDE_TEXT_PATTERNS = [/@anthropic-ai\/claude-code/i, /anthropic\/claude-code/i];
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

function truncateTerminalTitle(title: string): string {
  return title.length <= MAX_TERMINAL_TITLE_LENGTH
    ? title
    : title.slice(0, MAX_TERMINAL_TITLE_LENGTH).trimEnd();
}

function normalizeTextForIdentityDetection(value: string): string {
  const ESC = "\\u001B";
  return value
    .replace(new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g"), " ")
    .replace(new RegExp(`${ESC}\\][^\\u0007${ESC}]*(?:\\u0007|${ESC}\\\\)`, "g"), " ")
    .replace(new RegExp(`${ESC}[P^_].*?(?:${ESC}\\\\|\\u0007|\\u009C)`, "g"), " ")
    .replace(new RegExp(`${ESC}[@-_]`, "g"), " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

function stripScriptExtension(token: string): string {
  return token.replace(/\.(?:cjs|cts|js|jsx|mjs|mts|py|ts|tsx)$/i, "");
}

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

function deriveCliKindFromTokenList(tokens: string[]): TerminalCliKind | null {
  for (const token of tokens) {
    const cliKind = deriveCliKindFromNormalizedToken(normalizeCommandToken(token));
    if (cliKind) {
      return cliKind;
    }
  }
  return null;
}

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

function isEnvAssignmentToken(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

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
 *
 * @param cliKind - CLI 类型
 * @returns 对应的默认标题（"Codex CLI" 或 "Claude Code"）
 */
export function defaultTerminalTitleForCliKind(cliKind: TerminalCliKind): string {
  return cliKind === "codex" ? "Codex CLI" : "Claude Code";
}

/**
 * 根据 CLI 类型返回托管命令名称。
 *
 * @param cliKind - CLI 类型
 * @returns 托管命令名称
 */
export function managedTerminalCommandNameForCliKind(cliKind: TerminalCliKind): string {
  return MANAGED_TERMINAL_COMMAND_NAME_BY_CLI_KIND[cliKind];
}

/**
 * 将字符串值解析为 TerminalCliKind。
 *
 * @param value - 待解析的字符串
 * @returns 若为 "codex" 或 "claude" 则返回对应类型，否则返回 null
 */
export function terminalCliKindFromValue(value: string | null | undefined): TerminalCliKind | null {
  const normalizedValue = value?.trim().toLowerCase();
  return normalizedValue === "codex" || normalizedValue === "claude" ? normalizedValue : null;
}

/**
 * 从进程信息推导终端身份。
 *
 * 优先使用实际生成的进程名称，而非 shell 别名。
 * 检测 `@openai/codex` 和 `@anthropic-ai/claude-code` 等 npm 包名。
 *
 * @param command - 进程命令字符串
 * @returns 终端身份，若无法识别则返回 null
 */
export function deriveTerminalProcessIdentity(
  command: string | null | undefined,
): TerminalCommandIdentity | null {
  const strippedCommand = command?.trim() ?? "";
  if (strippedCommand.length === 0) {
    return null;
  }
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

// Convert a submitted shell command into a stable terminal identity for labels and icons.
/**
 * 从 shell 命令推导终端身份。
 *
 * 执行完整的命令解析流程：
 * 1. 移除环境变量赋值和包装命令（sudo/noglob 等）
 * 2. 解包 npx/bunx/pnpm exec 等封装命令
 * 3. 识别 git/npm/bun/pnpm 等常见命令
 * 4. 检测 Codex/Claude CLI
 *
 * @param command - 原始命令字符串
 * @returns 终端身份，若命令被忽略（如 cd、ls）则返回 null
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
 * 保持 Provider 标签页的粘性。
 *
 * 一旦终端被识别为 Codex/Claude 会话，即使后续输入自由格式的 CLI 提示，
 * 也不会将图标/标题降级回通用 shell 命令。
 *
 * @param input - 当前身份和下一个身份的输入
 * @returns 协调后的终端身份
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

// Keep the legacy string-only helper for thread-title renames and narrow call sites.
/**
 * 从命令推导终端标题（遗留函数）。
 *
 * @param command - 命令字符串
 * @returns 终端标题，若无法识别则返回 null
 * @deprecated 请使用 `deriveTerminalCommandIdentity`
 */
export function deriveTerminalTitleFromCommand(command: string): string | null {
  return deriveTerminalCommandIdentity(command)?.title ?? null;
}

/**
 * 消费终端输入流并实时检测终端身份。
 *
 * 增量消费输入数据，当用户按 Enter 提交命令时触发身份检测。
 * 支持退格（\b）、Tab 补全、Ctrl+C/Ctrl+D 清空等基本编辑操作。
 *
 * @param buffer - 当前输入缓冲
 * @param data - 新输入的数据
 * @returns 更新后的缓冲和检测到的身份（若 Enter 提交）
 */
export function consumeTerminalIdentityInput(
  buffer: string,
  data: string,
): { buffer: string; identity: TerminalCommandIdentity | null } {
  if (data.includes("\u001b")) {
    return { buffer, identity: null };
  }

  let nextBuffer = buffer;
  let nextIdentity: TerminalCommandIdentity | null = null;
  for (const char of data) {
    if (char === "\r" || char === "\n") {
      nextIdentity = deriveTerminalCommandIdentity(nextBuffer);
      nextBuffer = "";
      continue;
    }
    if (char === "\b" || char === "\u007f") {
      nextBuffer = nextBuffer.slice(0, -1);
      continue;
    }
    if (char === "\t") {
      nextBuffer += " ";
      continue;
    }
    if (char === "\u0003" || char === "\u0004" || char === "\u0015") {
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

// Preserve the older title-only input API for server thread-title tracking.
/**
 * 消费终端输入流并返回标题（遗留 API）。
 *
 * @param buffer - 当前输入缓冲
 * @param data - 新输入的数据
 * @returns 更新后的缓冲和标题（若 Enter 提交）
 * @deprecated 请使用 `consumeTerminalIdentityInput`
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

// Detect provider identity from CLI banners or other high-confidence visible output.
/**
 * 从终端输出检测 Provider 身份。
 *
 * 通过解析 CLI 横幅或高可信度输出文本识别终端类型。
 *
 * @param output - 终端输出文本
 * @returns 终端身份，若无法识别则返回 null
 */
export function deriveTerminalOutputIdentity(output: string): TerminalCommandIdentity | null {
  const cliKind = deriveCliKindFromOutputText(normalizeTextForIdentityDetection(output));
  return cliKind
    ? createTerminalCommandIdentity(defaultTerminalTitleForCliKind(cliKind), cliKind)
    : null;
}

// Detect provider identity from terminal title signals without trusting the title as a tab name.
/**
 * 从终端标题信号检测 Provider 身份。
 *
 * 不依赖标题作为标签名称，仅从标题信号推断终端类型。
 *
 * @param title - 终端标题
 * @returns 终端身份，若无法识别则返回 null
 */
export function deriveTerminalTitleSignalIdentity(title: string): TerminalCommandIdentity | null {
  const cliKind = inferCliKindFromTitle(title);
  return cliKind
    ? createTerminalCommandIdentity(defaultTerminalTitleForCliKind(cliKind), cliKind)
    : null;
}

// Resolve terminal label, icon, and activity state from persisted metadata plus runtime status.
/**
 * 解析终端视觉身份。
 *
 * 综合持久化元数据和运行时状态，解析完整的视觉身份信息。
 *
 * @param input - 输入参数
 * @param input.cliKind - CLI 类型
 * @param input.fallbackTitle - 备用标题
 * @param input.isRunning - 是否正在运行
 * @param input.state - 视觉状态
 * @param input.title - 终端标题
 * @returns 完整的视觉身份信息
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
