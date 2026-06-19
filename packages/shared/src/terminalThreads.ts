/**
 * @file terminalThreads.ts
 * @description 终端线程身份识别与状态管理工具模块
 * @purpose 提供终端命令解析、CLI 工具识别、终端标题生成和视觉状态管理的共享工具函数
 * @exports 命令解析、终端身份识别、视觉状态解析等工具函数，供 Web 端和服务端使用
 */

/**
 * @constant GENERIC_TERMINAL_THREAD_TITLE
 * @description 通用终端线程标题，用于未识别出特定 CLI 工具的终端
 */
export const GENERIC_TERMINAL_THREAD_TITLE = "New terminal";

/**
 * @type TerminalCliKind
 * @description 终端 CLI 工具类型
 * @property {"codex"} codex - OpenAI Codex CLI 工具
 * @property {"claude"} claude - Anthropic Claude Code CLI 工具
 */
export type TerminalCliKind = "codex" | "claude";

/**
 * @type TerminalIconKey
 * @description 终端图标键名，用于映射到具体的图标资源
 * @property {"terminal"} terminal - 通用终端图标
 * @property {"openai"} openai - OpenAI 品牌图标
 * @property {"claude"} claude - Claude 品牌图标
 */
export type TerminalIconKey = "terminal" | "openai" | "claude";

/**
 * @type TerminalActivityState
 * @description 终端活动状态类型
 * @property {"running"} running - 正在运行中
 * @property {"attention"} attention - 需要用户关注（如等待输入）
 * @property {"review"} review - 需要用户审查（如等待审批）
 */
export type TerminalActivityState = "running" | "attention" | "review";

/**
 * @type TerminalVisualState
 * @description 终端视觉状态类型，包含空闲状态和活动状态
 * @property {"idle"} idle - 空闲状态
 * @property {TerminalActivityState} - 继承所有活动状态
 */
export type TerminalVisualState = "idle" | TerminalActivityState;

/**
 * @type TerminalAgentHookEventType
 * @description 终端代理钩子事件类型
 * @property {"Start"} Start - 代理启动事件
 * @property {"Stop"} Stop - 代理停止事件
 * @property {"PermissionRequest"} PermissionRequest - 权限请求事件
 */
export type TerminalAgentHookEventType = "Start" | "Stop" | "PermissionRequest";

/**
 * @constant REMICODE_TERMINAL_CLI_KIND_ENV_KEY
 * @description 环境变量键名，用于指定终端 CLI 工具类型
 */
export const REMICODE_TERMINAL_CLI_KIND_ENV_KEY = "REMICODE_TERMINAL_CLI_KIND";

/**
 * @constant REMICODE_TERMINAL_HOOK_OSC_PREFIX
 * @description 终端钩子 OSC 转义序列前缀，用于代理事件通信
 */
export const REMICODE_TERMINAL_HOOK_OSC_PREFIX = "633;REMICODE_AGENT_EVENT=";

/**
 * @constant MANAGED_TERMINAL_COMMAND_NAME_BY_CLI_KIND
 * @description 按 CLI 工具类型映射的托管终端命令名称
 */
export const MANAGED_TERMINAL_COMMAND_NAME_BY_CLI_KIND: Record<TerminalCliKind, string> = {
  codex: "codex",
  claude: "claude",
};

/**
 * @interface TerminalCommandIdentity
 * @description 终端命令身份信息接口
 * @property {TerminalCliKind | null} cliKind - CLI 工具类型，null 表示通用终端
 * @property {TerminalIconKey} iconKey - 图标键名
 * @property {string} title - 终端标题
 */
export interface TerminalCommandIdentity {
  cliKind: TerminalCliKind | null;
  iconKey: TerminalIconKey;
  title: string;
}

/**
 * @interface ResolvedTerminalVisualIdentity
 * @description 解析后的终端视觉身份信息接口，继承自 TerminalCommandIdentity
 * @property {TerminalVisualState} state - 终端视觉状态
 */
export interface ResolvedTerminalVisualIdentity extends TerminalCommandIdentity {
  state: TerminalVisualState;
}

/**
 * @interface ReconcileTerminalCommandIdentityInput
 * @description 协调终端命令身份的输入参数接口
 * @property {TerminalCliKind | null | undefined} currentCliKind - 当前 CLI 工具类型
 * @property {string | null | undefined} currentTitle - 当前终端标题
 * @property {TerminalCliKind | null | undefined} nextCliKind - 新的 CLI 工具类型
 * @property {string} nextTitle - 新的终端标题
 */
interface ReconcileTerminalCommandIdentityInput {
  currentCliKind?: TerminalCliKind | null | undefined;
  currentTitle?: string | null | undefined;
  nextCliKind?: TerminalCliKind | null | undefined;
  nextTitle: string;
}

/**
 * @function isGenericTerminalThreadTitle
 * @description 判断给定的标题是否为通用终端线程标题
 * @param {string | null | undefined} title - 待检查的标题
 * @returns {boolean} 如果是通用标题返回 true，否则返回 false
 */
export function isGenericTerminalThreadTitle(title: string | null | undefined): boolean {
  return (title ?? "").trim() === GENERIC_TERMINAL_THREAD_TITLE;
}

/**
 * @constant MAX_TERMINAL_INPUT_BUFFER_LENGTH
 * @description 终端输入缓冲区最大长度，防止内存溢出
 */
const MAX_TERMINAL_INPUT_BUFFER_LENGTH = 512;

/**
 * @constant MAX_TERMINAL_TITLE_LENGTH
 * @description 终端标题最大长度，超过此长度会被截断
 */
const MAX_TERMINAL_TITLE_LENGTH = 48;

/**
 * @constant WRAPPER_COMMANDS
 * @description Shell 包装命令集合，这些命令会包裹实际执行的命令，解析时需要跳过
 */
const WRAPPER_COMMANDS = new Set(["builtin", "command", "env", "noglob", "nocorrect", "sudo"]);

/**
 * @constant CODEX_COMMAND_NAMES
 * @description Codex CLI 命令名称集合
 */
const CODEX_COMMAND_NAMES = new Set(["codex", "codex-cli"]);

/**
 * @constant CLAUDE_COMMAND_NAMES
 * @description Claude Code CLI 命令名称集合
 */
const CLAUDE_COMMAND_NAMES = new Set(["claude", "claude-code", "claude_code"]);

/**
 * @constant OUTPUT_CODEX_TEXT_PATTERNS
 * @description 从输出文本中识别 Codex CLI 的正则表达式模式
 */
const OUTPUT_CODEX_TEXT_PATTERNS = [/\bopenai codex\b(?:\s*\(|\s+v)/i, /\bcodex cli\b/i];

/**
 * @constant OUTPUT_CLAUDE_TEXT_PATTERNS
 * @description 从输出文本中识别 Claude Code CLI 的正则表达式模式
 */
const OUTPUT_CLAUDE_TEXT_PATTERNS = [/\bclaude code\b(?:\s+v\d|\s*$)/i];

/**
 * @constant TITLE_CODEX_TEXT_PATTERNS
 * @description 从终端标题中识别 Codex CLI 的正则表达式模式
 */
const TITLE_CODEX_TEXT_PATTERNS = [/\bopenai codex\b/i, /\bcodex cli\b/i];

/**
 * @constant TITLE_CLAUDE_TEXT_PATTERNS
 * @description 从终端标题中识别 Claude Code CLI 的正则表达式模式
 */
const TITLE_CLAUDE_TEXT_PATTERNS = [/\bclaude code\b/i];

/**
 * @constant PROCESS_CODEX_TEXT_PATTERNS
 * @description 从进程信息中识别 Codex CLI 的正则表达式模式
 */
const PROCESS_CODEX_TEXT_PATTERNS = [/@openai\/codex/i];

/**
 * @constant PROCESS_CLAUDE_TEXT_PATTERNS
 * @description 从进程信息中识别 Claude Code CLI 的正则表达式模式
 */
const PROCESS_CLAUDE_TEXT_PATTERNS = [/@anthropic-ai\/claude-code/i, /anthropic\/claude-code/i];

/**
 * @constant IGNORED_TERMINAL_TITLE_COMMANDS
 * @description 不应作为终端标题的命令集合，这些命令通常是简单的 Shell 内置命令或常用工具
 */
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

/**
 * @function truncateTerminalTitle
 * @description 截断终端标题，确保不超过最大长度限制
 * @param {string} title - 原始标题
 * @returns {string} 截断后的标题
 */
function truncateTerminalTitle(title: string): string {
  return title.length <= MAX_TERMINAL_TITLE_LENGTH
    ? title
    : title.slice(0, MAX_TERMINAL_TITLE_LENGTH).trimEnd();
}

/**
 * @function normalizeTextForIdentityDetection
 * @description 标准化文本以用于身份检测，移除 ANSI 转义序列和控制字符
 * @param {string} value - 待标准化的文本
 * @returns {string} 标准化后的纯文本
 * @note 用于清理终端输出中的格式控制字符，便于文本匹配
 */
function normalizeTextForIdentityDetection(value: string): string {
  return value
    // 移除 CSI 转义序列（如颜色代码）
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, " ")
    // 移除 OSC 转义序列（如标题设置）
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, " ")
    // 移除其他 OSC/DCS/APC 转义序列
    .replace(/\u001b[P^_].*?(?:\u001b\\|\u0007|\u009c)/g, " ")
    // 移除简单的 ESC 转义字符
    .replace(/\u001b[@-_]/g, " ")
    // 移除所有控制字符
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    // 合并多个空白字符为单个空格
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @function normalizeCommandToken
 * @description 标准化命令令牌，提取路径中的文件名并转换为小写
 * @param {string} token - 原始命令令牌
 * @returns {string} 标准化后的命令名称
 * @note 处理 Windows 和 Unix 风格的路径，提取最后的文件名部分
 */
function normalizeCommandToken(token: string): string {
  // 统一路径分隔符为正斜杠
  const normalizedPath = token.replaceAll("\\", "/");
  const segments = normalizedPath.split("/");
  // 从后向前查找第一个非空段（即文件名）
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment) {
      return segment.toLowerCase();
    }
  }
  return normalizedPath.toLowerCase();
}

/**
 * @function stripScriptExtension
 * @description 移除脚本文件的扩展名
 * @param {string} token - 命令令牌
 * @returns {string} 移除扩展名后的令牌
 * @note 用于识别不带扩展名的脚本命令（如 .js, .ts, .py 等）
 */
function stripScriptExtension(token: string): string {
  return token.replace(/\.(?:cjs|cts|js|jsx|mjs|mts|py|ts|tsx)$/i, "");
}

/**
 * @function deriveCliKindFromNormalizedToken
 * @description 从标准化的命令令牌中推导 CLI 工具类型
 * @param {string} token - 已标准化的命令令牌
 * @returns {TerminalCliKind | null} 识别出的 CLI 类型，未识别返回 null
 */
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

/**
 * @function deriveCliKindFromTokenList
 * @description 从命令令牌列表中推导 CLI 工具类型
 * @param {string[]} tokens - 命令令牌数组
 * @returns {TerminalCliKind | null} 识别出的 CLI 类型，未识别返回 null
 * @note 遍历所有令牌，返回第一个识别出的 CLI 类型
 */
function deriveCliKindFromTokenList(tokens: string[]): TerminalCliKind | null {
  for (const token of tokens) {
    const cliKind = deriveCliKindFromNormalizedToken(normalizeCommandToken(token));
    if (cliKind) {
      return cliKind;
    }
  }
  return null;
}

/**
 * @function textMatchesCliPatterns
 * @description 检查文本是否匹配指定的 CLI 模式
 * @param {string} text - 待检查的文本
 * @param {ReadonlyArray<RegExp>} patterns - 正则表达式模式数组
 * @param {TerminalCliKind} cliKind - 匹配成功时返回的 CLI 类型
 * @returns {TerminalCliKind | null} 匹配成功返回 CLI 类型，否则返回 null
 */
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

/**
 * @function deriveCliKindFromOutputText
 * @description 从终端输出文本中推导 CLI 工具类型
 * @param {string | null | undefined} text - 输出文本
 * @returns {TerminalCliKind | null} 识别出的 CLI 类型，未识别返回 null
 */
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

/**
 * @function deriveCliKindFromProcessText
 * @description 从进程信息文本中推导 CLI 工具类型
 * @param {string | null | undefined} text - 进程信息文本
 * @returns {TerminalCliKind | null} 识别出的 CLI 类型，未识别返回 null
 */
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

/**
 * @function isEnvAssignmentToken
 * @description 检查令牌是否为环境变量赋值形式（如 VAR=value）
 * @param {string} token - 待检查的令牌
 * @returns {boolean} 如果是环境变量赋值返回 true，否则返回 false
 */
function isEnvAssignmentToken(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

/**
 * @function tokenizeShellCommand
 * @description 将 Shell 命令字符串分词为令牌数组
 * @param {string} command - 原始命令字符串
 * @returns {string[]} 分词后的令牌数组
 * @note 支持引号包裹和转义字符处理
 */
function tokenizeShellCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escapeNext = false;

  for (const char of command.trim()) {
    // 处理转义字符
    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      // 在单引号内不处理转义
      escapeNext = quote !== "'";
      if (!escapeNext) {
        current += char;
      }
      continue;
    }
    // 处理引号内的字符
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    // 开始新的引号
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    // 处理空白字符分隔符
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

/**
 * @function stripShellPrefixes
 * @description 移除命令令牌列表中的 Shell 前缀（环境变量赋值和包装命令）
 * @param {string[]} tokens - 原始令牌数组
 * @returns {string[]} 移除前缀后的令牌数组
 * @note 用于提取实际执行的核心命令
 */
function stripShellPrefixes(tokens: string[]): string[] {
  let startIndex = 0;
  // 跳过开头的环境变量赋值
  while (startIndex < tokens.length && isEnvAssignmentToken(tokens[startIndex] ?? "")) {
    startIndex += 1;
  }
  // 跳过包装命令及其后的环境变量赋值
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

/**
 * @function unwrapExecutorCommand
 * @description 解包执行器命令（如 npx, pnpm dlx, npm exec），提取实际执行的命令
 * @param {string[]} tokens - 命令令牌数组
 * @returns {string[]} 解包后的命令令牌数组
 * @note 将 "npx codex" 转换为 ["codex"]，便于识别实际命令
 */
function unwrapExecutorCommand(tokens: string[]): string[] {
  const [first, second, third] = tokens;
  const normalizedFirst = normalizeCommandToken(first ?? "");
  const normalizedSecond = normalizeCommandToken(second ?? "");

  // 处理 npx 和 bunx
  if ((normalizedFirst === "npx" || normalizedFirst === "bunx") && second) {
    return [second, ...tokens.slice(2)];
  }
  // 处理 pnpm dlx
  if (normalizedFirst === "pnpm" && normalizedSecond === "dlx" && third) {
    return [third, ...tokens.slice(3)];
  }
  // 处理 npm exec
  if (normalizedFirst === "npm" && normalizedSecond === "exec" && third) {
    return [third, ...tokens.slice(3)];
  }
  return tokens;
}

/**
 * @function derivePackageManagerTitle
 * @description 从包管理器命令中推导终端标题
 * @param {string[]} tokens - 命令令牌数组
 * @returns {string | null} 推导出的标题，非包管理器命令返回 null
 * @note 支持 bun, npm, pnpm, yarn 等包管理器
 */
function derivePackageManagerTitle(tokens: string[]): string | null {
  const [first, second, third] = tokens.map(normalizeCommandToken);
  if (!first || !["bun", "npm", "pnpm", "yarn"].includes(first)) {
    return null;
  }
  // 处理带子命令的情况（如 npm run dev, pnpm dlx codex）
  if (second && ["create", "dlx", "exec", "run"].includes(second) && third) {
    return `${first} ${second} ${third}`;
  }
  // 处理简单子命令（如 npm install）
  if (second) {
    return `${first} ${second}`;
  }
  return first;
}

/**
 * @function createTerminalCommandIdentity
 * @description 创建终端命令身份信息对象
 * @param {string} title - 终端标题
 * @param {TerminalCliKind | null} cliKind - CLI 工具类型
 * @returns {TerminalCommandIdentity} 终端命令身份信息
 */
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
 * @function defaultTerminalTitleForCliKind
 * @description 获取指定 CLI 工具类型的默认终端标题
 * @param {TerminalCliKind} cliKind - CLI 工具类型
 * @returns {string} 默认终端标题
 */
export function defaultTerminalTitleForCliKind(cliKind: TerminalCliKind): string {
  return cliKind === "codex" ? "Codex CLI" : "Claude Code";
}

/**
 * @function managedTerminalCommandNameForCliKind
 * @description 获取指定 CLI 工具类型的托管终端命令名称
 * @param {TerminalCliKind} cliKind - CLI 工具类型
 * @returns {string} 命令名称
 */
export function managedTerminalCommandNameForCliKind(cliKind: TerminalCliKind): string {
  return MANAGED_TERMINAL_COMMAND_NAME_BY_CLI_KIND[cliKind];
}

/**
 * @function terminalCliKindFromValue
 * @description 从字符串值解析 CLI 工具类型
 * @param {string | null | undefined} value - 待解析的字符串
 * @returns {TerminalCliKind | null} 解析出的 CLI 类型，无效值返回 null
 */
export function terminalCliKindFromValue(value: string | null | undefined): TerminalCliKind | null {
  const normalizedValue = value?.trim().toLowerCase();
  return normalizedValue === "codex" || normalizedValue === "claude" ? normalizedValue : null;
}

/**
 * @function deriveTerminalProcessIdentity
 * @description 从进程命令中推导终端身份信息
 * @param {string | null | undefined} command - 进程命令字符串
 * @returns {TerminalCommandIdentity | null} 推导出的终端身份，未识别返回 null
 * @note 优先使用实际启动的进程名称而非 Shell 别名来识别终端提供者
 */
export function deriveTerminalProcessIdentity(
  command: string | null | undefined,
): TerminalCommandIdentity | null {
  const strippedCommand = command?.trim() ?? "";
  if (strippedCommand.length === 0) {
    return null;
  }
  // 先尝试从命令令牌中识别，再尝试从进程文本中识别
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

/**
 * @function inferCliKindFromTitle
 * @description 从终端标题推断 CLI 工具类型
 * @param {string | null | undefined} title - 终端标题
 * @returns {TerminalCliKind | null} 推断出的 CLI 类型，未识别返回 null
 */
function inferCliKindFromTitle(title: string | null | undefined): TerminalCliKind | null {
  const normalizedTitle = title?.trim().toLowerCase();
  if (!normalizedTitle) {
    return null;
  }
  // 匹配 Codex 标题模式（如 "codex", "codex cli", "codex 1"）
  if (/^codex(?: cli)?(?: \d+)?$/.test(normalizedTitle)) {
    return "codex";
  }
  // 匹配 Claude 标题模式（如 "claude", "claude code", "claude-code", "claude 1"）
  if (/^claude(?: code)?(?: \d+)?$/.test(normalizedTitle) || normalizedTitle === "claude-code") {
    return "claude";
  }
  return (
    textMatchesCliPatterns(normalizedTitle, TITLE_CODEX_TEXT_PATTERNS, "codex") ??
    textMatchesCliPatterns(normalizedTitle, TITLE_CLAUDE_TEXT_PATTERNS, "claude")
  );
}

/**
 * @function normalizePersistedTerminalTitle
 * @description 标准化持久化的终端标题，确保返回有效的标题字符串
 * @param {string | null | undefined} title - 原始标题
 * @param {TerminalCliKind | null} cliKind - CLI 工具类型
 * @returns {string} 标准化后的标题
 */
function normalizePersistedTerminalTitle(
  title: string | null | undefined,
  cliKind: TerminalCliKind | null,
): string {
  const normalizedTitle = title?.trim();
  if (normalizedTitle && normalizedTitle.length > 0) {
    return normalizedTitle;
  }
  // 如果标题为空，根据 CLI 类型返回默认标题或通用标题
  return cliKind ? defaultTerminalTitleForCliKind(cliKind) : GENERIC_TERMINAL_THREAD_TITLE;
}

/**
 * @function deriveTerminalCommandIdentity
 * @description 从提交的 Shell 命令中推导终端身份信息，用于标签和图标显示
 * @param {string} command - Shell 命令字符串
 * @returns {TerminalCommandIdentity | null} 推导出的终端身份，无法识别返回 null
 * @note 将命令转换为稳定的终端身份，支持多种命令格式和 CLI 工具识别
 */
export function deriveTerminalCommandIdentity(command: string): TerminalCommandIdentity | null {
  const strippedCommand = command.trim();
  if (strippedCommand.length === 0) {
    return null;
  }

  // 移除 Shell 前缀（环境变量赋值和包装命令）
  const baseTokens = stripShellPrefixes(tokenizeShellCommand(strippedCommand));
  if (baseTokens.length === 0) {
    return null;
  }

  // 解包执行器命令（如 npx, pnpm dlx）
  const tokens = unwrapExecutorCommand(baseTokens);
  const normalizedTokens = tokens.map(normalizeCommandToken);
  const first = normalizedTokens[0];
  const second = normalizedTokens[1];

  // 忽略简单的 Shell 内置命令
  if (!first || IGNORED_TERMINAL_TITLE_COMMANDS.has(first)) {
    return null;
  }
  
  // 识别特定的 CLI 工具
  const detectedCliKind = deriveCliKindFromTokenList(tokens);
  if (detectedCliKind === "codex") {
    return createTerminalCommandIdentity("Codex CLI", "codex");
  }
  if (detectedCliKind === "claude" || (first === "claude" && second === "code")) {
    return createTerminalCommandIdentity("Claude Code", "claude");
  }
  
  // 处理 git 命令，显示 "git <subcommand>"
  if (first === "git") {
    return createTerminalCommandIdentity(
      truncateTerminalTitle(second ? `git ${second}` : "git"),
      null,
    );
  }

  // 处理包管理器命令
  const packageManagerTitle = derivePackageManagerTitle(tokens);
  if (packageManagerTitle) {
    return createTerminalCommandIdentity(truncateTerminalTitle(packageManagerTitle), null);
  }

  // 兜底：使用前两个令牌作为通用标题
  const genericTitle = normalizedTokens.slice(0, 2).join(" ").trim();
  return genericTitle.length > 0
    ? createTerminalCommandIdentity(truncateTerminalTitle(genericTitle), null)
    : null;
}

/**
 * @function reconcileTerminalCommandIdentity
 * @description 协调终端命令身份，保持已识别的 CLI 会话身份稳定
 * @param {ReconcileTerminalCommandIdentityInput} input - 输入参数
 * @returns {TerminalCommandIdentity} 协调后的终端身份
 * @note 一旦终端被识别为 Codex/Claude 会话，即使内部输入自由形式的提示，
 *       也不应将图标/标题降级回通用 Shell 命令
 */
export function reconcileTerminalCommandIdentity(
  input: ReconcileTerminalCommandIdentityInput,
): TerminalCommandIdentity {
  const nextIdentity = createTerminalCommandIdentity(
    input.nextTitle.trim(),
    input.nextCliKind ?? null,
  );
  // 如果未提供当前 CLI 类型，尝试从当前标题推断
  const currentCliKind =
    input.currentCliKind === undefined
      ? inferCliKindFromTitle(input.currentTitle)
      : input.currentCliKind;
  
  // 如果当前没有识别出 CLI 类型，直接使用新的身份
  if (!currentCliKind) {
    return nextIdentity;
  }
  
  // 如果新身份也识别出了 CLI 类型，使用新身份
  if (nextIdentity.cliKind) {
    return nextIdentity;
  }
  
  // 否则保持当前的 CLI 身份不变，使用标准化的标题
  return createTerminalCommandIdentity(
    normalizePersistedTerminalTitle(input.currentTitle, currentCliKind),
    currentCliKind,
  );
}

/**
 * @function deriveTerminalTitleFromCommand
 * @description 从命令中推导终端标题（仅返回标题字符串）
 * @param {string} command - Shell 命令字符串
 * @returns {string | null} 推导出的终端标题，无法识别返回 null
 * @note 保留的旧版 API，用于线程标题重命名和简单的调用场景
 */
export function deriveTerminalTitleFromCommand(command: string): string | null {
  return deriveTerminalCommandIdentity(command)?.title ?? null;
}

/**
 * @function consumeTerminalIdentityInput
 * @description 增量消费终端输入，仅在按下 Enter 提交命令时发出终端身份
 * @param {string} buffer - 当前输入缓冲区
 * @param {string} data - 新输入的字符数据
 * @returns {Object} 包含更新后的缓冲区和推导出的终端身份
 * @property {string} buffer - 更新后的输入缓冲区
 * @property {TerminalCommandIdentity | null} identity - 推导出的终端身份（仅在按下 Enter 时）
 * @note 处理特殊字符（退格、制表符、控制字符）并支持增量输入
 */
export function consumeTerminalIdentityInput(
  buffer: string,
  data: string,
): { buffer: string; identity: TerminalCommandIdentity | null } {
  // 如果包含 ESC 转义字符，忽略本次输入
  if (data.includes("\u001b")) {
    return { buffer, identity: null };
  }

  let nextBuffer = buffer;
  let nextIdentity: TerminalCommandIdentity | null = null;
  for (const char of data) {
    // 回车或换行表示命令提交
    if (char === "\r" || char === "\n") {
      nextIdentity = deriveTerminalCommandIdentity(nextBuffer);
      nextBuffer = "";
      continue;
    }
    // 退格键删除最后一个字符
    if (char === "\b" || char === "\u007f") {
      nextBuffer = nextBuffer.slice(0, -1);
      continue;
    }
    // 制表符转换为空格
    if (char === "\t") {
      nextBuffer += " ";
      continue;
    }
    // 控制字符（Ctrl+C, Ctrl+D, Ctrl+U）清空缓冲区
    if (char === "\u0003" || char === "\u0004" || char === "\u0015") {
      nextBuffer = "";
      continue;
    }
    // 可打印字符追加到缓冲区
    if (char >= " ") {
      nextBuffer += char;
    }
  }

  return {
    // 限制缓冲区大小，防止内存溢出
    buffer: nextBuffer.slice(-MAX_TERMINAL_INPUT_BUFFER_LENGTH),
    identity: nextIdentity,
  };
}

/**
 * @function consumeTerminalTitleInput
 * @description 增量消费终端输入并返回标题（旧版 API）
 * @param {string} buffer - 当前输入缓冲区
 * @param {string} data - 新输入的字符数据
 * @returns {Object} 包含更新后的缓冲区和推导出的终端标题
 * @property {string} buffer - 更新后的输入缓冲区
 * @property {string | null} title - 推导出的终端标题
 * @note 保留的旧版 API，用于服务端线程标题跟踪
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
 * @function deriveTerminalOutputIdentity
 * @description 从 CLI 横幅或其他高置信度的可见输出中检测终端提供者身份
 * @param {string} output - 终端输出文本
 * @returns {TerminalCommandIdentity | null} 检测到的终端身份，未识别返回 null
 */
export function deriveTerminalOutputIdentity(output: string): TerminalCommandIdentity | null {
  const cliKind = deriveCliKindFromOutputText(normalizeTextForIdentityDetection(output));
  return cliKind
    ? createTerminalCommandIdentity(defaultTerminalTitleForCliKind(cliKind), cliKind)
    : null;
}

/**
 * @function deriveTerminalTitleSignalIdentity
 * @description 从终端标题信号中检测终端提供者身份，但不将标题作为标签名信任
 * @param {string} title - 终端标题
 * @returns {TerminalCommandIdentity | null} 检测到的终端身份，未识别返回 null
 */
export function deriveTerminalTitleSignalIdentity(title: string): TerminalCommandIdentity | null {
  const cliKind = inferCliKindFromTitle(title);
  return cliKind
    ? createTerminalCommandIdentity(defaultTerminalTitleForCliKind(cliKind), cliKind)
    : null;
}

/**
 * @function resolveTerminalVisualIdentity
 * @description 从持久化元数据和运行时状态解析终端的标签、图标和活动状态
 * @param {Object} input - 输入参数
 * @param {TerminalCliKind | null | undefined} input.cliKind - CLI 工具类型
 * @param {string} input.fallbackTitle - 回退标题
 * @param {boolean | undefined} input.isRunning - 是否正在运行
 * @param {TerminalVisualState | null | undefined} input.state - 视觉状态
 * @param {string | null | undefined} input.title - 终端标题
 * @returns {ResolvedTerminalVisualIdentity} 解析后的终端视觉身份
 */
export function resolveTerminalVisualIdentity(input: {
  cliKind?: TerminalCliKind | null | undefined;
  fallbackTitle: string;
  isRunning?: boolean | undefined;
  state?: TerminalVisualState | null | undefined;
  title?: string | null | undefined;
}): ResolvedTerminalVisualIdentity {
  // 优先使用提供的 CLI 类型，否则从标题推断
  const resolvedCliKind = input.cliKind ?? inferCliKindFromTitle(input.title);
  // 确定最终标题：优先使用提供的标题，其次使用 CLI 默认标题，最后使用回退标题
  const title =
    input.title?.trim() ||
    (resolvedCliKind ? defaultTerminalTitleForCliKind(resolvedCliKind) : input.fallbackTitle);
  const cliKind = resolvedCliKind ?? null;
  // 确定视觉状态：优先使用提供的状态，其次根据运行状态推断
  const state = input.state ?? (input.isRunning ? "running" : "idle");
  return {
    cliKind,
    iconKey: cliKind === "codex" ? "openai" : cliKind === "claude" ? "claude" : "terminal",
    state,
    title,
  };
}
