/**
 * @file Review 模式行级引用解析
 *
 * 在代码审查模式下，AI 输出经常包含 `path/to/file.ts:42` 之类的行级引用。
 * 本模块负责把这类"裸引用"识别出来，渲染为可点击链接（跳转到对应文件/行）。
 *
 * ## 支持的引用格式
 *
 * - 相对路径：`src/foo.ts:42`
 * - 多级相对路径：`packages/server/src/main.ts:42`
 * - 相对路径带行范围：`src/foo.ts:42-58`
 * - 相对路径带列号：`src/foo.ts:42:5`
 * - `./` 前缀：`./src/foo.ts:42`
 * - `../` 前缀：`../shared/types.ts:10`
 * - Windows 盘符：`C:\code\foo.ts:42` 或 `C:/code/foo.ts:42`
 * - 反引号包裹的 `path:line`（在 markdown inline code 中）：`` `src/foo.ts:42` ``
 *
 * ## 排除规则
 *
 * - 行号 > 100000：忽略（明显是误识别）
 * - 行号 = 0：忽略
 * - 命中后跟 `.` 或其他非空白字符：拒绝（避免误识别时间戳等）
 */

import { resolvePathLinkTarget } from "../terminal-links";

/** 单个解析出的引用 */
export interface ParsedReviewReference {
  /** 在原始字符串中的起始字节位置 */
  start: number;
  /** 在原始字符串中的结束字节位置（不含） */
  end: number;
  /** 文件路径（已解析为绝对或 cwd-相对） */
  path: string;
  /** 行号（1-based） */
  line: number;
  /** 结束行号（仅当原始字符串带行范围时存在） */
  endLine?: number;
  /** 列号（仅当原始字符串带列号时存在） */
  column?: number;
  /** 是否以反引号包裹（用于决定渲染样式） */
  backticked: boolean;
}

/**
 * 引用片段：在原始字符串中切割出的"普通文本"或"引用"
 */
export type ReviewTextSegment = { kind: "text"; text: string } | {
  kind: "reference";
  reference: ParsedReviewReference;
};

/**
 * 行级引用正则：
 *
 * 关键点：
 * 1. `(?:^|[\s\`\(\[])lookbehind` — 起始必须是字符串开头、空白、反引号或开括号/方括号
 * 2. 文件路径部分：相对路径 / 绝对路径 / Windows 盘符
 * 3. 行号：1-6 位数字
 * 4. 可选行范围 `:N-M` 或列号 `:C`
 * 5. 终止：字符串结尾、空白、反引号、闭括号、`.`、`,`、`;`
 */
const REVIEW_REFERENCE_PATTERN =
  /(?:(?<=^|[\s`(\[])(?:`)?)((?:\.{1,2}[\/\\]|\/|[A-Za-z]:[\\\/])?(?:[A-Za-z0-9_.-]+[\/\\])*[A-Za-z][A-Za-z0-9_.-]*\.[A-Za-z0-9]+)(?:`)?:(\d{1,6})(?:\s*-\s*(\d{1,6}))?(?::(\d{1,6}))?(?=[\s`.,;)\]}]|$)/g;

/**
 * 简单校验一个字符串是否可能是合法行号（避免误把年份/版本号当行号）。
 */
function isPlausibleLineNumber(value: string): boolean {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return false;
  return true;
}

/**
 * 解析纯文本中的所有行级引用。
 *
 * @param text - 原始字符串
 * @param cwd - 当前工作目录，用于解析相对路径
 * @returns 按位置排序的引用列表（不重叠）
 */
export function parseReviewReferences(text: string, cwd?: string): ParsedReviewReference[] {
  if (!text) return [];
  const refs: ParsedReviewReference[] = [];
  // 复制正则以避免全局 lastIndex 污染
  const pattern = new RegExp(REVIEW_REFERENCE_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const [full, filePath, lineStr, endLineStr, columnStr] = match;
    if (!filePath || !lineStr) continue;
    if (!isPlausibleLineNumber(lineStr)) continue;
    if (endLineStr && !isPlausibleLineNumber(endLineStr)) continue;
    if (columnStr && !isPlausibleLineNumber(columnStr)) continue;

    // 计算实际 start/end：考虑反引号包裹
    // 正则只消耗了起始反引号（通过前缀的 `(?:\`)?`），但不会消耗结尾反引号
    // （因为结尾反引号在行号之后，lookahead 不允许消耗它）。
    // 所以这里手动检查 matched 之后是否紧跟一个反引号。
    const matched = full;
    let start = match.index;
    let end = start + matched.length;
    const hasLeadingBacktick = matched.startsWith("`");
    const hasTrailingBacktick = end < text.length && text[end] === "`";
    const backticked = hasLeadingBacktick && hasTrailingBacktick;
    if (backticked) {
      // 扩展覆盖范围把结尾反引号也包进来（让后续 text 切割不包括反引号）
      end += 1;
    }

    // 解析为可点击路径
    const resolvedPath = resolveReferencePath(filePath, cwd);
    if (!resolvedPath) continue;

    const reference: ParsedReviewReference = {
      start,
      end,
      path: resolvedPath,
      line: Number.parseInt(lineStr, 10),
      backticked,
    };
    if (endLineStr) reference.endLine = Number.parseInt(endLineStr, 10);
    if (columnStr) reference.column = Number.parseInt(columnStr, 10);
    refs.push(reference);
  }
  return refs;
}

/**
 * 把引用文件路径解析为 `openInPreferredEditor` 接受的格式（含行号/列号后缀）。
 */
function resolveReferencePath(filePath: string, cwd?: string): string | null {
  // 跳过不像文件路径的（避免 `http://foo:8080` 之类）
  if (filePath.startsWith("http:") || filePath.startsWith("https:")) return null;
  if (filePath.startsWith("mailto:")) return null;
  if (!cwd) return normalizePath(filePath, null);
  // 使用现有的 resolvePathLinkTarget（处理 ./ ../ 相对路径）
  const resolved = resolvePathLinkTarget(filePath, cwd);
  return normalizePath(resolved, cwd);
}

/**
 * 简单路径归一化：
 * - 把反斜杠替换成正斜杠（仅作显示用，调用方仍按原样传递）
 * - 解析 `./` 和 `../`
 * - 若结果是绝对路径，按 POSIX 风格返回
 */
function normalizePath(path: string, cwd: string | null): string {
  if (!path) return path;
  // 不解析绝对路径（避免把 `/repo/../shared` 错误归一化）
  const isWindowsAbsolute = /^[A-Za-z]:[\\\/]/.test(path);
  const isPosixAbsolute = path.startsWith("/");
  if (isWindowsAbsolute) return path;
  if (isPosixAbsolute) {
    // 对绝对 POSIX 路径做 ./../ 归一化
    return normalizePosix(path);
  }
  // 相对路径：先以 cwd 为基准拼接，再归一化
  if (cwd) {
    const joined = cwd.endsWith("/") ? cwd + path : `${cwd}/${path}`;
    return normalizePosix(joined);
  }
  return path;
}

function normalizePosix(path: string): string {
  const parts = path.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return `/${out.join("/")}`;
}

/**
 * 把纯文本切分为"普通文本"与"引用"交替的片段数组。
 */
export function splitTextWithReviewReferences(
  text: string,
  cwd?: string,
): ReviewTextSegment[] {
  const refs = parseReviewReferences(text, cwd);
  if (refs.length === 0) {
    return [{ kind: "text", text }];
  }
  const segments: ReviewTextSegment[] = [];
  let cursor = 0;
  for (const ref of refs) {
    if (ref.start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, ref.start) });
    }
    segments.push({ kind: "reference", reference: ref });
    cursor = ref.end;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}

/**
 * 构造传给 `openInPreferredEditor` 的目标路径（含行号/列号后缀）。
 */
export function buildEditorTargetPath(reference: ParsedReviewReference): string {
  let target = reference.path;
  target += `:${reference.line}`;
  if (reference.column !== undefined) {
    target += `:${reference.column}`;
  }
  return target;
}
