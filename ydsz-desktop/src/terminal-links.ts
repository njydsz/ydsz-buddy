/**
 * @file terminal-links.ts
 * @description 终端输出中的链接识别与解析工具。
 * 负责从终端文本行中提取 URL 和文件路径链接，处理跨行换行文本，
 * 将字符位置映射到终端缓冲区坐标，以及解析相对/绝对路径。
 *
 * 主要功能：
 * - URL 和文件路径的正则匹配与冲突消解
 * - 跨行换行（wrapped line）的合并与坐标映射
 * - 路径链接的解析（支持 ~、相对路径、Windows/POSIX 绝对路径）
 * - 链接激活的修饰键判断（Mac: Cmd, 其他: Ctrl）
 */

import { isMacPlatform } from "./lib/utils";

/**
 * 终端链接的类型。
 * - "url"：HTTP/HTTPS 链接
 * - "path"：文件路径
 */
export type TerminalLinkKind = "url" | "path";

/**
 * 终端文本行中匹配到的链接信息。
 */
export interface TerminalLinkMatch {
  /** 链接类型 */
  kind: TerminalLinkKind;
  /** 链接的原始文本 */
  text: string;
  /** 链接在行中的起始字符位置（含） */
  start: number;
  /** 链接在行中的结束字符位置（不含） */
  end: number;
}

/**
 * 终端缓冲区中的字符坐标位置。
 */
export interface TerminalLinkBufferPosition {
  /** 列号（从 1 开始） */
  x: number;
  /** 行号（缓冲区行号，从 1 开始） */
  y: number;
}

/**
 * 终端缓冲区中的范围，由起止位置定义。
 */
export interface TerminalLinkBufferRange {
  /** 范围起始位置 */
  start: TerminalLinkBufferPosition;
  /** 范围结束位置 */
  end: TerminalLinkBufferPosition;
}

/**
 * 终端缓冲区行的接口，模拟 xterm.js 的 IBufferLine。
 */
export interface TerminalBufferLineLike {
  /** 当前行是否是上一行的换行延续 */
  readonly isWrapped?: boolean;
  /** 将缓冲区行内容转换为字符串 */
  translateToString(trimRight?: boolean): string;
}

/**
 * 换行合并后的终端链接行中的文本段信息。
 */
export interface WrappedTerminalLinkLineSegment {
  /** 该段所在的缓冲区行号 */
  bufferLineNumber: number;
  /** 该段的文本内容 */
  text: string;
  /** 该段在合并后整行中的起始字符索引 */
  startIndex: number;
  /** 该段在合并后整行中的结束字符索引 */
  endIndex: number;
}

/**
 * 换行合并后的终端链接行，包含完整文本和各段信息。
 */
export interface WrappedTerminalLinkLine {
  /** 合并后的完整行文本 */
  text: string;
  /** 各段的详细信息 */
  segments: ReadonlyArray<WrappedTerminalLinkLineSegment>;
}

/** URL 匹配正则：匹配 http:// 或 https:// 开头的链接 */
const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g;
/** 文件路径匹配正则：匹配 Unix/Windows 绝对路径、相对路径、带行号的路径等 */
const FILE_PATH_PATTERN =
  /(?:~\/|\.{1,2}\/|\/|[A-Za-z]:\\|\\\\)[^\s"'`<>]+|[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?::\d+){0,2}/g;
/** 尾部标点符号正则：用于去除路径末尾被误匹配的标点 */
const TRAILING_PUNCTUATION_PATTERN = /[.,;!?]+$/;

/**
 * 去除匹配文本末尾的闭合分隔符（括号、方括号、花括号）和标点符号。
 * 终端输出中路径/URL 后面可能紧跟的括号不应被视为链接的一部分。
 *
 * @param value - 待清理的原始匹配文本
 * @returns 去除闭合分隔符后的文本
 */
function trimClosingDelimiters(value: string): string {
  let output = value.replace(TRAILING_PUNCTUATION_PATTERN, "");
  if (output.length === 0) return output;

  const trimUnbalanced = (open: string, close: string) => {
    while (output.endsWith(close)) {
      const opens = output.split(open).length - 1;
      const closes = output.split(close).length - 1;
      if (opens >= closes) return;
      output = output.slice(0, -1);
    }
  };

  trimUnbalanced("(", ")");
  trimUnbalanced("[", "]");
  trimUnbalanced("{", "}");
  return output;
}

/** 判断两个范围是否有重叠 */
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * 使用指定正则从行文本中收集匹配项，过滤掉与已有匹配重叠的结果。
 * URL 优先级高于路径，路径匹配中排除以 http:// 或 https:// 开头的文本。
 *
 * @param line - 待匹配的行文本
 * @param kind - 链接类型（url 或 path）
 * @param pattern - 匹配正则
 * @param existing - 已有的匹配列表，用于冲突检测
 * @returns 新匹配到的链接列表
 */
function collectMatches(
  line: string,
  kind: TerminalLinkKind,
  pattern: RegExp,
  existing: TerminalLinkMatch[],
): TerminalLinkMatch[] {
  const matches: TerminalLinkMatch[] = [];
  pattern.lastIndex = 0;

  for (const rawMatch of line.matchAll(pattern)) {
    const raw = rawMatch[0];
    const start = rawMatch.index ?? -1;
    if (start < 0 || raw.length === 0) continue;

    const trimmed = trimClosingDelimiters(raw);
    if (trimmed.length === 0) continue;
    if (kind === "path" && /^https?:\/\//i.test(trimmed)) continue;

    const candidate: TerminalLinkMatch = {
      kind,
      text: trimmed,
      start,
      end: start + trimmed.length,
    };

    const collides = [...existing, ...matches].some((other) => overlaps(candidate, other));
    if (collides) continue;

    matches.push(candidate);
  }

  return matches;
}

/** 判断是否为 Windows 绝对路径（如 C:\ 或 UNC 路径 \\server\share） */
function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

/** 判断是否为绝对路径（Unix 或 Windows） */
function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || isWindowsAbsolutePath(value);
}

/** 判断路径是否为 Windows 风格（用于决定路径分隔符） */
function isWindowsPathStyle(value: string): boolean {
  return isWindowsAbsolutePath(value) || /[A-Za-z]:\\/.test(value);
}

/**
 * 使用指定分隔符拼接路径，处理尾部斜杠和正斜杠转换。
 *
 * @param base - 基础路径
 * @param next - 追加的路径段
 * @param separator - 路径分隔符（"/" 或 "\\"）
 * @returns 拼接后的路径
 */
function joinPath(base: string, next: string, separator: "/" | "\\"): string {
  const cleanBase = base.replace(/[\\/]+$/, "");
  if (separator === "\\") {
    return `${cleanBase}\\${next.replaceAll("/", "\\")}`;
  }
  return `${cleanBase}/${next.replace(/^\/+/, "")}`;
}

/**
 * 从当前工作目录推断用户主目录路径。
 * 支持 macOS (/Users/xxx)、Linux (/home/xxx) 和 Windows (C:\Users\xxx)。
 *
 * @param cwd - 当前工作目录
 * @returns 推断出的主目录路径，无法推断时返回 undefined
 */
function inferHomeFromCwd(cwd: string): string | undefined {
  const posixUser = cwd.match(/^\/Users\/([^/]+)/);
  if (posixUser?.[1]) {
    return `/Users/${posixUser[1]}`;
  }

  const posixHome = cwd.match(/^\/home\/([^/]+)/);
  if (posixHome?.[1]) {
    return `/home/${posixHome[1]}`;
  }

  const windowsUser = cwd.match(/^([A-Za-z]:\\Users\\[^\\]+)/);
  if (windowsUser?.[1]) {
    return windowsUser[1];
  }

  return undefined;
}

/**
 * 将带行号/列号的路径拆分为纯路径和行列信息。
 * 例如 "src/index.ts:10:5" 拆分为 { path: "src/index.ts", line: "10", column: "5" }。
 *
 * @param value - 可能包含行号/列号的路径字符串
 * @returns 拆分后的路径、行号和列号
 */
function splitPathAndPosition(value: string): {
  path: string;
  line: string | undefined;
  column: string | undefined;
} {
  let path = value;
  let column: string | undefined;
  let line: string | undefined;

  const columnMatch = path.match(/:(\d+)$/);
  if (!columnMatch?.[1]) {
    return { path, line: undefined, column: undefined };
  }

  column = columnMatch[1];
  path = path.slice(0, -columnMatch[0].length);

  const lineMatch = path.match(/:(\d+)$/);
  if (lineMatch?.[1]) {
    line = lineMatch[1];
    path = path.slice(0, -lineMatch[0].length);
  } else {
    line = column;
    column = undefined;
  }

  return { path, line, column };
}

/**
 * 从终端文本行中提取所有链接（URL 和文件路径）。
 * URL 优先匹配，路径匹配时排除与 URL 重叠的部分。
 *
 * @param line - 终端输出的单行文本
 * @returns 按起始位置排序的链接匹配列表
 *
 * @example
 * ```ts
 * const links = extractTerminalLinks('See https://example.com and src/main.ts:42');
 * // => [{ kind: "url", text: "https://example.com", ... }, { kind: "path", text: "src/main.ts:42", ... }]
 * ```
 */
export function extractTerminalLinks(line: string): TerminalLinkMatch[] {
  const urlMatches = collectMatches(line, "url", URL_PATTERN, []);
  const pathMatches = collectMatches(line, "path", FILE_PATH_PATTERN, urlMatches);
  return [...urlMatches, ...pathMatches].toSorted((a, b) => a.start - b.start);
}

/**
 * 收集指定缓冲区行及其换行延续行，合并为一个完整的逻辑行。
 * 终端中过长的行会被自动换行（wrapped），此函数将连续的换行行合并为单一逻辑行，
 * 并记录每个段在原始缓冲区中的位置信息。
 *
 * @param bufferLineNumber - 起始缓冲区行号（从 1 开始）
 * @param getLine - 获取指定行号缓冲区行的回调函数
 * @returns 合并后的逻辑行信息，若起始行不存在则返回 null
 */
export function collectWrappedTerminalLinkLine(
  bufferLineNumber: number,
  getLine: (bufferLineIndex: number) => TerminalBufferLineLike | null | undefined,
): WrappedTerminalLinkLine | null {
  const anchorLine = getLine(bufferLineNumber - 1);
  if (!anchorLine) return null;

  let startBufferLineNumber = bufferLineNumber;
  let startLine = anchorLine;

  while (startBufferLineNumber > 1 && startLine.isWrapped) {
    const previousLine = getLine(startBufferLineNumber - 2);
    if (!previousLine) return null;
    startBufferLineNumber -= 1;
    startLine = previousLine;
  }

  const segments: WrappedTerminalLinkLineSegment[] = [];
  let nextStartIndex = 0;
  let currentBufferLineNumber = startBufferLineNumber;

  while (true) {
    const currentLine = getLine(currentBufferLineNumber - 1);
    if (!currentLine) break;

    const nextLine = getLine(currentBufferLineNumber);
    const hasWrappedContinuation = nextLine?.isWrapped === true;
    const text = currentLine.translateToString(!hasWrappedContinuation);

    segments.push({
      bufferLineNumber: currentBufferLineNumber,
      text,
      startIndex: nextStartIndex,
      endIndex: nextStartIndex + text.length,
    });
    nextStartIndex += text.length;

    if (!hasWrappedContinuation) break;
    currentBufferLineNumber += 1;
  }

  return {
    text: segments.map((segment) => segment.text).join(""),
    segments,
  };
}

/**
 * 将合并行中的字符索引映射到终端缓冲区坐标（行号和列号）。
 *
 * @param segments - 合并行的各段信息
 * @param characterIndex - 字符在合并行中的索引
 * @returns 缓冲区坐标位置
 */
function resolveCharacterPosition(
  segments: ReadonlyArray<WrappedTerminalLinkLineSegment>,
  characterIndex: number,
): TerminalLinkBufferPosition {
  for (const segment of segments) {
    if (characterIndex < segment.endIndex) {
      return {
        x: characterIndex - segment.startIndex + 1,
        y: segment.bufferLineNumber,
      };
    }
  }

  const lastSegment = segments[segments.length - 1];
  return {
    x: Math.max(lastSegment?.text.length ?? 0, 1),
    y: lastSegment?.bufferLineNumber ?? 1,
  };
}

/**
 * 将链接匹配的起止字符位置解析为终端缓冲区坐标范围。
 * 用于在终端 UI 中高亮显示链接所在的精确区域。
 *
 * @param wrappedLine - 合并后的逻辑行信息
 * @param match - 链接匹配的起止位置
 * @returns 缓冲区坐标范围
 */
export function resolveWrappedTerminalLinkRange(
  wrappedLine: WrappedTerminalLinkLine,
  match: Pick<TerminalLinkMatch, "start" | "end">,
): TerminalLinkBufferRange {
  return {
    start: resolveCharacterPosition(wrappedLine.segments, match.start),
    end: resolveCharacterPosition(wrappedLine.segments, match.end - 1),
  };
}

/**
 * 判断链接的缓冲区范围是否与指定行号相交。
 * 用于确定某一行是否包含链接的一部分。
 *
 * @param range - 链接的缓冲区范围
 * @param bufferLineNumber - 待检查的缓冲区行号
 * @returns 若范围与该行相交则返回 true
 */
export function wrappedTerminalLinkRangeIntersectsBufferLine(
  range: TerminalLinkBufferRange,
  bufferLineNumber: number,
): boolean {
  return range.start.y <= bufferLineNumber && bufferLineNumber <= range.end.y;
}

/**
 * 判断鼠标事件是否为终端链接激活操作。
 * Mac 平台使用 Cmd 键，其他平台使用 Ctrl 键。
 *
 * @param event - 鼠标事件（仅需要 metaKey 和 ctrlKey）
 * @param platform - 平台标识，默认从 navigator.platform 获取
 * @returns 若为链接激活操作则返回 true
 *
 * @example
 * ```ts
 * // 在终端的 onMouseMove 中判断是否应高亮链接
 * if (isTerminalLinkActivation(event)) {
 *   highlightLink(terminalLink);
 * }
 * ```
 */
export function isTerminalLinkActivation(
  event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
): boolean {
  if (platform.length === 0) return false;
  return isMacPlatform(platform)
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

/**
 * 解析路径链接的目标路径，将相对路径和 ~ 路径转换为绝对路径。
 * 支持带行号/列号的路径格式（如 src/main.ts:10:5）。
 *
 * @param rawPath - 原始路径字符串（可能包含行号/列号）
 * @param cwd - 当前工作目录，用于解析相对路径
 * @returns 解析后的完整路径（保留行号/列号后缀）
 *
 * @example
 * ```ts
 * resolvePathLinkTarget("~/project/src/main.ts:42", "/Users/alice");
 * // => "/Users/alice/project/src/main.ts:42"
 *
 * resolvePathLinkTarget("./lib/index.ts", "/home/user/project");
 * // => "/home/user/project/lib/index.ts"
 * ```
 */
export function resolvePathLinkTarget(rawPath: string, cwd: string): string {
  const { path, line, column } = splitPathAndPosition(rawPath);

  let resolvedPath = path;
  if (path.startsWith("~/")) {
    const home = inferHomeFromCwd(cwd);
    if (home) {
      const separator: "/" | "\\" = isWindowsPathStyle(home) ? "\\" : "/";
      resolvedPath = joinPath(home, path.slice(2), separator);
    }
  } else if (!isAbsolutePath(path)) {
    const separator: "/" | "\\" = isWindowsPathStyle(cwd) ? "\\" : "/";
    resolvedPath = joinPath(cwd, path, separator);
  }

  if (!line) return resolvedPath;
  return `${resolvedPath}:${line}${column ? `:${column}` : ""}`;
}
