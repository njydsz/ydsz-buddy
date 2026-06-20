/**
 * @file shellQuote.ts
 * @description POSIX 兼容的 Shell 参数引用处理，用于 PTY 中输入的命令。
 * 导出 `quotePosixShellArgument` 函数，将值包裹在单引号中并转义内嵌单引号，
 * 确保其始终作为单个不透明的 Shell 令牌传递。
 */

/** 安全令牌正则，仅包含无需引号包裹的字符 */
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * 对值进行引用，使其可作为单个参数传递给 POSIX Shell
 *
 * @param value - 需要引用的字符串值
 * @returns 引用后的字符串，安全字符原样返回，其他值用单引号包裹
 *
 * @remarks 仅包含"安全"字符的字符串原样返回以保持终端输出可读性；
 * 其他值用单引号包裹，内嵌单引号通过标准的 `'\''` 序列转义
 */
export function quotePosixShellArgument(value: string): string {
  if (value.length === 0) {
    return "''";
  }
  if (SAFE_TOKEN_PATTERN.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", `'\\''`)}'`;
}