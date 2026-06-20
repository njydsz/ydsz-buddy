/**
 * @file 工具调用标签归一化
 * @description 将通用工具调用标题归一化为可读标签，并将命令执行人性化展示，
 *              供时间轴行等 UI 组件消费。支持 MCP 工具标识符解析、命令动词提取、
 *              Git 子命令识别及搜索/文件操作等常见命令的人性化展示。
 */

import type { ToolLifecycleItemType } from "~/contracts";

/**
 * 归一化紧凑工具标签
 *
 * 去除工具标题尾部的完成/运行状态后缀（如 "complete"、"running" 等），返回精简标签。
 *
 * @param value - 原始工具标签
 * @returns 去除状态后缀后的标签
 */
export function normalizeCompactToolLabel(value: string): string {
  return value
    .replace(/\s+(?:complete|completed|done|finished|success|succeeded|started|running)\s*$/i, "")
    .trim();
}

/**
 * 将内部 MCP 标识符转换为可读的内联标签
 *
 * 解析 `mcp__server__tool` 格式的标识符，提取服务器名和工具名并人性化展示。
 *
 * @param value - MCP 工具标识符
 * @returns 人性化后的标签（如 "Server: Tool"），非 MCP 标识符返回 null
 */
function humanizeMcpToolIdentifier(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("mcp__")) {
    return null;
  }

  const [, server, tool, ...rest] = trimmed.split("__");
  const normalizedServer = humanizeMcpToken(server);
  const normalizedTool = [tool, ...rest]
    .map((part) => humanizeMcpToken(part))
    .filter((part) => part.length > 0)
    .join(" ");

  if (!normalizedServer || !normalizedTool) {
    return null;
  }
  return `${normalizedServer}: ${normalizedTool}`;
}

/** 可读工具标题输入参数 */
export interface ReadableToolTitleInput {
  /** 工具标题 */
  readonly title?: string | null;
  /** 备选标签 */
  readonly fallbackLabel: string;
  /** 工具生命周期项类型 */
  readonly itemType?: ToolLifecycleItemType | undefined;
  /** 请求类型 */
  readonly requestKind?: "command" | "file-read" | "file-change" | undefined;
  /** 执行的命令 */
  readonly command?: string | null;
  /** 工具载荷 */
  readonly payload?: Record<string, unknown> | null;
  /** 是否正在运行 */
  readonly isRunning?: boolean;
}

/**
 * 派生可读的工具标题
 *
 * 按优先级依次尝试：归一化标题 → 请求类型标签 → 命令动词 → 载荷描述符 → 备选标签，
 * 跳过通用标题（如 "tool call"、"command execution" 等）。
 *
 * @param input - 包含标题、备选标签、项类型、请求类型等信息的输入对象
 * @returns 可读的工具标题，若所有来源均为空则返回 null
 */
export function deriveReadableToolTitle(input: ReadableToolTitleInput): string | null {
  const normalizedTitle = normalizeCompactToolLabel(input.title ?? "");
  const normalizedFallback = normalizeCompactToolLabel(input.fallbackLabel);
  const commandLabel = input.command
    ? deriveReadableCommandDisplay(input.command, input.isRunning).verb
    : null;
  const commandLike = input.itemType === "command_execution" || input.requestKind === "command";

  // Derive a verbal label from requestKind when the title is generic
  const requestKindLabel = humanizeRequestKind(input.requestKind, input.itemType);

  if (normalizedTitle.length > 0 && !isGenericToolTitle(normalizedTitle)) {
    return normalizedTitle;
  }

  // Use verbal requestKind label before falling back to raw descriptors
  if (requestKindLabel) {
    return requestKindLabel;
  }

  if (commandLike && commandLabel) {
    return commandLabel;
  }

  const descriptor = normalizeToolDescriptor(extractToolDescriptorFromPayload(input.payload));
  if (descriptor && !isGenericToolTitle(descriptor)) {
    return descriptor;
  }

  if (normalizedFallback.length > 0 && !isGenericToolTitle(normalizedFallback)) {
    return normalizedFallback;
  }
  if (normalizedTitle.length > 0) {
    return normalizedTitle;
  }
  if (normalizedFallback.length > 0) {
    return normalizedFallback;
  }
  return null;
}

/** 可读命令展示信息，包含动词、目标和完整命令 */
export interface ReadableCommandDisplay {
  /** 动作动词（如 "Read"、"Running"） */
  readonly verb: string;
  /** 动作目标（如文件路径、搜索摘要） */
  readonly target: string;
  /** 完整的原始命令 */
  readonly fullCommand: string;
}

/**
 * 将请求类型和项类型映射为人性化动词标签
 *
 * @param requestKind - 请求类型
 * @param itemType - 工具生命周期项类型
 * @returns 人性化标签（如 "Read"、"Edited"），无法识别时返回 null
 */
function humanizeRequestKind(
  requestKind: ReadableToolTitleInput["requestKind"],
  itemType: ReadableToolTitleInput["itemType"],
): string | null {
  if (requestKind === "file-read") return "Read";
  if (requestKind === "file-change" || itemType === "file_change") return "Edited";
  // Don't handle command types here —let humanizeCommandToolLabel produce more specific labels
  if (itemType === "web_search") return "Searched the web";
  if (itemType === "image_generation") return "Generated image";
  if (itemType === "image_view") return "Viewed image";
  if (itemType === "collab_agent_tool_call") return "Agent task";
  return null;
}

/**
 * 判断工具标题是否为通用标题
 *
 * 通用标题（如 "tool call"、"command execution"）不携带语义信息，应跳过。
 *
 * @param value - 工具标题
 * @returns 是否为通用标题
 */
function isGenericToolTitle(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    normalized === "tool" ||
    normalized === "tool call" ||
    normalized === "dynamic tool call" ||
    normalized === "mcp tool call" ||
    normalized === "subagent task" ||
    normalized === "command run" ||
    normalized === "ran command" ||
    normalized === "running command" ||
    normalized === "command execution" ||
    normalized === "find" ||
    normalized === "read file"
  );
}

/**
 * 归一化工具描述符
 *
 * 将工具描述符中的下划线/连字符替换为空格，去重连续重复词，
 * 并尝试将 MCP 标识符解析为可读标签。
 *
 * @param value - 原始工具描述符
 * @returns 归一化后的描述符，超过 64 字符时截断并添加省略号
 */
function normalizeToolDescriptor(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const mcpIdentifier = humanizeMcpToolIdentifier(value);
  if (mcpIdentifier) {
    return mcpIdentifier;
  }
  const normalized = value.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  const dedupedTokens: string[] = [];
  for (const token of normalized.split(" ")) {
    if (dedupedTokens.at(-1)?.toLowerCase() === token.toLowerCase()) {
      continue;
    }
    dedupedTokens.push(token);
  }
  const collapsed = dedupedTokens.join(" ").trim();
  if (!collapsed) {
    return null;
  }
  const lowerCollapsed = collapsed.toLowerCase();
  if (lowerCollapsed === "read") {
    return "Read";
  }
  if (lowerCollapsed === "search" || lowerCollapsed === "find" || lowerCollapsed === "searched") {
    return "Search";
  }
  return collapsed.length > 64 ? `${collapsed.slice(0, 61).trimEnd()}...` : collapsed;
}

/**
 * 人性化 MCP 令牌
 *
 * 将驼峰命名和下划线/连字符分隔的令牌转换为空格分隔的首字母大写形式，
 * 特殊处理 "mcp" 令牌保持全大写。
 *
 * @param value - 原始令牌
 * @returns 人性化后的令牌
 */
function humanizeMcpToken(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .map((token) => {
      const lower = token.toLowerCase();
      if (lower === "mcp") return "MCP";
      if (token.toUpperCase() === token && token.length <= 5) return token;
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

/**
 * 从工具载荷中提取描述符
 *
 * 按优先级搜索载荷中的 "kind"、"name"、"tool" 等键，
 * 递归遍历嵌套对象以找到第一个非通用的描述符值。
 *
 * @param payload - 工具载荷对象
 * @returns 提取到的描述符，未找到则返回 null
 */
function extractToolDescriptorFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) {
    return null;
  }
  const descriptorKeys = ["kind", "name", "tool", "tool_name", "toolName", "title"];
  const candidates: string[] = [];
  collectDescriptorCandidates(payload, descriptorKeys, candidates, 0);
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized) {
      continue;
    }
    if (isGenericToolTitle(normalizeCompactToolLabel(normalized))) {
      continue;
    }
    return normalized;
  }
  return null;
}

/**
 * 递归收集载荷中的描述符候选值
 *
 * 按优先键名和嵌套路径搜索载荷中的字符串值，深度限制为 4 层，最多收集 24 个候选。
 *
 * @param value - 当前搜索值
 * @param keys - 优先搜索的键名列表
 * @param target - 候选值收集数组
 * @param depth - 当前递归深度
 */
function collectDescriptorCandidates(
  value: unknown,
  keys: ReadonlyArray<string>,
  target: string[],
  depth: number,
) {
  if (depth > 4 || target.length >= 24) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      target.push(trimmed);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectDescriptorCandidates(entry, keys, target, depth + 1);
      if (target.length >= 24) {
        return;
      }
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "string") {
      const trimmed = (record[key] as string).trim();
      if (trimmed) {
        target.push(trimmed);
      }
    }
  }
  for (const nestedKey of ["item", "data", "event", "payload", "result", "input", "tool", "call"]) {
    if (nestedKey in record) {
      collectDescriptorCandidates(record[nestedKey], keys, target, depth + 1);
      if (target.length >= 24) {
        return;
      }
    }
  }
}

/**
 * 派生可读的命令展示信息
 *
 * 将原始命令字符串解析为紧凑的动词+目标格式，同时保留完整命令供悬停/详情 UI 使用。
 * 支持 cat/grep/ls/find/mkdir/rm/cp/mv/git 等常见命令的人性化展示。
 *
 * @param rawCommand - 原始命令字符串
 * @param isRunning - 是否正在运行，影响动词时态
 * @returns 可读命令展示信息对象
 */
export function deriveReadableCommandDisplay(
  rawCommand: string,
  isRunning = false,
): ReadableCommandDisplay {
  const command = unwrapShellCommandIfPresent(rawCommand);
  const [tool, args] = splitToolAndArgs(command);

  switch (tool) {
    case "cat":
    case "nl":
    case "head":
    case "tail":
    case "sed":
    case "less":
    case "more":
      return {
        verb: isRunning ? "Reading" : "Read",
        target: lastPathComponents(args, "file"),
        fullCommand: rawCommand,
      };
    case "rg":
    case "grep":
    case "ag":
    case "ack":
      return {
        verb: isRunning ? "Searching" : "Searched",
        target: searchSummary(args),
        fullCommand: rawCommand,
      };
    case "ls":
      return {
        verb: isRunning ? "Listing" : "Listed",
        target: lastPathComponents(args, "directory"),
        fullCommand: rawCommand,
      };
    case "find":
    case "fd":
      return {
        verb: isRunning ? "Finding" : "Found",
        target: lastPathComponents(args, "files"),
        fullCommand: rawCommand,
      };
    case "mkdir":
      return {
        verb: isRunning ? "Creating" : "Created",
        target: lastPathComponents(args, "directory"),
        fullCommand: rawCommand,
      };
    case "rm":
      return {
        verb: isRunning ? "Removing" : "Removed",
        target: lastPathComponents(args, "file"),
        fullCommand: rawCommand,
      };
    case "cp":
    case "mv":
      return {
        verb: isRunning
          ? tool === "cp"
            ? "Copying"
            : "Moving"
          : tool === "cp"
            ? "Copied"
            : "Moved",
        target: lastPathComponents(args, "file"),
        fullCommand: rawCommand,
      };
    case "git":
      return humanizeGitCommand(args, rawCommand, isRunning);
    default:
      return {
        verb: isRunning ? "Running" : "Ran",
        target: command,
        fullCommand: rawCommand,
      };
  }
}

/**
 * 派生内联命令调用标签
 *
 * 去除命令中的 Shell 包装前缀，返回裸命令字符串。
 *
 * @param rawCommand - 原始命令字符串
 * @returns 去除 Shell 包装后的命令
 */
export function deriveInlineCommandCall(rawCommand: string): string {
  return unwrapShellCommandIfPresent(rawCommand);
}

/**
 * 人性化 Git 子命令展示
 *
 * 将 Git 子命令映射为可读的动词+目标格式（如 "Checking git status"、"Staged changes"）。
 *
 * @param args - Git 子命令及参数
 * @param rawCommand - 完整的原始命令
 * @param isRunning - 是否正在运行
 * @returns 可读命令展示信息对象
 */
function humanizeGitCommand(
  args: string,
  rawCommand: string,
  isRunning: boolean,
): ReadableCommandDisplay {
  const subcommand = args.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  switch (subcommand) {
    case "status":
      return {
        verb: isRunning ? "Checking" : "Checked",
        target: "git status",
        fullCommand: rawCommand,
      };
    case "diff":
      return {
        verb: isRunning ? "Comparing" : "Compared",
        target: "changes",
        fullCommand: rawCommand,
      };
    case "show":
      return {
        verb: isRunning ? "Inspecting" : "Inspected",
        target: "commit",
        fullCommand: rawCommand,
      };
    case "log":
      return {
        verb: isRunning ? "Reviewing" : "Reviewed",
        target: "git history",
        fullCommand: rawCommand,
      };
    case "add":
      return {
        verb: isRunning ? "Staging" : "Staged",
        target: "changes",
        fullCommand: rawCommand,
      };
    case "commit":
      return {
        verb: isRunning ? "Committing" : "Committed",
        target: "changes",
        fullCommand: rawCommand,
      };
    case "push":
      return {
        verb: isRunning ? "Pushing" : "Pushed",
        target: "to remote",
        fullCommand: rawCommand,
      };
    case "pull":
      return {
        verb: isRunning ? "Pulling" : "Pulled",
        target: "from remote",
        fullCommand: rawCommand,
      };
    case "checkout":
    case "switch":
      return {
        verb: isRunning ? "Switching to" : "Switched to",
        target: checkoutTarget(args),
        fullCommand: rawCommand,
      };
    default:
      return {
        verb: isRunning ? "Running" : "Ran",
        target: `git ${args}`.trim(),
        fullCommand: rawCommand,
      };
  }
}

/**
 * 提取 checkout/switch 命令的目标分支名
 *
 * @param args - 命令参数字符串
 * @returns 目标分支名，无法提取时返回 "branch"
 */
function checkoutTarget(args: string): string {
  const branch = tokenizeCommandArgs(args).at(-1)?.trim();
  return branch ? branch : "branch";
}

/**
 * 提取命令参数中最后一个路径组件作为目标
 *
 * 从后向前遍历令牌，跳过选项标志，返回第一个路径令牌的紧凑形式。
 *
 * @param args - 命令参数字符串
 * @param fallback - 未找到路径时的备选文本
 * @returns 路径目标描述
 */
function lastPathComponents(args: string, fallback: string): string {
  const tokens = tokenizeCommandArgs(args);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]!.replace(/^['"]|['"]$/g, "");
    if (!token || token.startsWith("-")) {
      continue;
    }
    return compactPath(token);
  }
  return fallback;
}

/**
 * 紧凑化路径展示
 *
 * 将路径缩减为最后两个路径组件，特殊处理 "." 和 ".."。
 *
 * @param path - 原始路径
 * @returns 紧凑化后的路径字符串
 */
function compactPath(path: string): string {
  if (path === ".") {
    return "current directory";
  }
  if (path === "..") {
    return "parent directory";
  }
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) {
    return path;
  }
  return parts.slice(-2).join("/");
}

/**
 * 构建搜索命令的摘要文本
 *
 * 提取搜索模式和路径，格式化为 "for pattern in path" 形式。
 *
 * @param args - 搜索命令参数
 * @returns 搜索摘要字符串
 */
function searchSummary(args: string): string {
  const { pattern, path } = extractSearchPatternAndPath(args);
  if (pattern && path) {
    return `for ${pattern} in ${path}`;
  }
  if (pattern) {
    return `for ${pattern}`;
  }
  if (path) {
    return `in ${path}`;
  }
  return "files";
}

/**
 * 从搜索命令参数中提取搜索模式和路径
 *
 * 解析搜索命令令牌，跳过选项标志，提取第一个非选项令牌作为搜索模式，
 * 后续令牌作为搜索路径。
 *
 * @param args - 搜索命令参数字符串
 * @returns 包含 pattern 和 path 的对象
 */
function extractSearchPatternAndPath(args: string): {
  pattern: string | null;
  path: string | null;
} {
  const tokens = tokenizeCommandArgs(args);
  let pattern: string | null = null;
  let path: string | null = null;
  let skipNext = false;

  for (const token of tokens) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token.startsWith("-")) {
      if (
        token === "-t" ||
        token === "-g" ||
        token === "--type" ||
        token === "--glob" ||
        token === "--max-count"
      ) {
        skipNext = true;
      }
      continue;
    }
    if (!pattern) {
      const normalizedPattern = normalizeSearchPatternToken(token);
      if (!normalizedPattern) {
        const normalizedPath = normalizeSearchPathToken(token);
        if (normalizedPath && (!path || path === "current directory")) {
          path = normalizedPath;
        }
        continue;
      }
      pattern = normalizedPattern;
      continue;
    }
    if (!path || path === "current directory") {
      path = normalizeSearchPathToken(token) ?? path;
      continue;
    }
  }

  if (pattern && path === "current directory" && looksLikeSearchPath(pattern)) {
    path = normalizeSearchPathToken(pattern);
    pattern = null;
  }

  return { pattern, path };
}

/**
 * 归一化搜索模式令牌
 *
 * 过滤空白、纯标点和路径指示符，超长时截断。
 *
 * @param token - 原始令牌
 * @returns 归一化后的搜索模式，无效时返回 null
 */
function normalizeSearchPatternToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    return null;
  }
  if (!/[a-z0-9]/i.test(trimmed)) {
    return null;
  }
  return trimmed.length > 30 ? `${trimmed.slice(0, 27)}...` : trimmed;
}

/**
 * 归一化搜索路径令牌
 *
 * 去除空白并紧凑化路径展示。
 *
 * @param token - 原始令牌
 * @returns 归一化后的路径，无效时返回 null
 */
function normalizeSearchPathToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  return compactPath(trimmed);
}

/**
 * 判断令牌是否看起来像搜索路径
 *
 * 包含路径分隔符或以点开头的令牌被视为路径。
 *
 * @param token - 令牌字符串
 * @returns 是否像搜索路径
 */
function looksLikeSearchPath(token: string): boolean {
  return token.includes("/") || token.startsWith(".") || token.includes("\\");
}

/**
 * 将命令参数字符串拆分为令牌数组
 *
 * 支持单引号和双引号包裹的参数，以及反斜杠转义。
 *
 * @param args - 命令参数字符串
 * @returns 令牌数组
 */
function tokenizeCommandArgs(args: string): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < args.length) {
    while (args[index] === " ") {
      index += 1;
    }
    if (index >= args.length) {
      break;
    }

    const quote = args[index];
    if (quote === '"' || quote === "'") {
      index += 1;
      let token = "";
      while (index < args.length && args[index] !== quote) {
        if (args[index] === "\\" && index + 1 < args.length) {
          token += args[index + 1];
          index += 2;
          continue;
        }
        token += args[index];
        index += 1;
      }
      if (args[index] === quote) {
        index += 1;
      }
      tokens.push(token);
      continue;
    }

    let token = "";
    while (index < args.length && args[index] !== " ") {
      token += args[index];
      index += 1;
    }
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * 将命令拆分为工具名和参数
 *
 * 提取命令的第一个令牌作为工具名（取 basename 并转小写），剩余部分作为参数。
 *
 * @param command - 命令字符串
 * @returns [工具名, 参数] 元组
 */
function splitToolAndArgs(command: string): [tool: string, args: string] {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return ["", ""];
  }
  const separator = normalized.indexOf(" ");
  if (separator === -1) {
    return [basename(normalized).toLowerCase(), ""];
  }
  const tool = basename(normalized.slice(0, separator)).toLowerCase();
  const args = normalized.slice(separator + 1).trim();
  return [tool, args];
}

/**
 * 提取路径的最后一个组件名
 *
 * @param value - 路径字符串
 * @returns 最后一个路径组件
 */
function basename(value: string): string {
  const slash = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return slash >= 0 ? value.slice(slash + 1) : value;
}

/**
 * 去除 Shell 包装前缀
 *
 * 剥离 bash/zsh/sh 的 -c/-lc 前缀和引号包裹，
 * 截取管道符前的第一个命令，并处理链式命令（&&/;）。
 *
 * @param rawCommand - 原始命令字符串
 * @returns 去除包装后的裸命令
 */
function unwrapShellCommandIfPresent(rawCommand: string): string {
  let value = rawCommand.trim();
  if (!value) {
    return value;
  }

  const shellPrefixes = [
    "/usr/bin/bash -lc ",
    "/usr/bin/bash -c ",
    "/bin/bash -lc ",
    "/bin/bash -c ",
    "/usr/bin/zsh -lc ",
    "/usr/bin/zsh -c ",
    "/bin/zsh -lc ",
    "/bin/zsh -c ",
    "/bin/sh -lc ",
    "/bin/sh -c ",
    "bash -lc ",
    "bash -c ",
    "zsh -lc ",
    "zsh -c ",
    "sh -lc ",
    "sh -c ",
  ];

  const lowered = value.toLowerCase();
  for (const prefix of shellPrefixes) {
    if (!lowered.startsWith(prefix)) {
      continue;
    }
    value = value.slice(prefix.length).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1).trim();
    }
    const chainedCommandIndex = findShellChainIndex(value);
    if (chainedCommandIndex >= 0) {
      value = value.slice(chainedCommandIndex).trim();
    }
    break;
  }

  const pipeIndex = value.search(/\s*\|\s*/);
  if (pipeIndex > 0) {
    value = value.slice(0, pipeIndex).trim();
  }

  return value;
}

/**
 * 查找 Shell 链式命令的起始位置
 *
 * 在引号外查找 && 或 ; 分隔符，返回链式命令中第二个命令的起始索引。
 *
 * @param value - 命令字符串
 * @returns 第二个命令的起始索引，未找到链式分隔符时返回 -1
 */
function findShellChainIndex(value: string): number {
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < value.length - 1; index += 1) {
    const char = value[index];
    if (char === "\\" && index + 1 < value.length) {
      index += 1;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    const next = value[index + 1];
    if (char === "&" && next === "&") {
      return index + 2;
    }
    if (char === ";") {
      return index + 1;
    }
  }

  return -1;
}
