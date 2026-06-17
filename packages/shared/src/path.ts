/**
 * 文件: path.ts
 * 用途: 路径格式判断工具函数，提供 Windows 盘符路径、UNC 路径、绝对路径和显式相对路径的检测。
 * 层级: 共享工具模块
 * 主要导出: isWindowsDrivePath, isUncPath, isWindowsAbsolutePath, isExplicitRelativePath
 */

/**
 * 判断字符串是否为 Windows 盘符路径（如 `C:`、`D:\foo`）。
 * @param value - 待检测的路径字符串。
 * @returns 匹配盘符格式返回 true。
 */
export function isWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:([/\\]|$)/.test(value);
}

/**
 * 判断字符串是否为 UNC 路径（以 `\\` 开头）。
 * @param value - 待检测的路径字符串。
 * @returns 以 `\\` 开头返回 true。
 */
export function isUncPath(value: string): boolean {
  return value.startsWith("\\\\");
}

/**
 * 判断字符串是否为 Windows 绝对路径（UNC 路径或盘符路径）。
 * @param value - 待检测的路径字符串。
 * @returns 是 UNC 路径或盘符路径则返回 true。
 */
export function isWindowsAbsolutePath(value: string): boolean {
  return isUncPath(value) || isWindowsDrivePath(value);
}

/**
 * 判断字符串是否为显式相对路径（以 `.` 或 `..` 开头）。
 * @param value - 待检测的路径字符串。
 * @returns 以 `./`、`../`、`.\`、`..\` 开头或等于 `.`/`..` 时返回 true。
 */
export function isExplicitRelativePath(value: string): boolean {
  return (
    value === "." ||
    value === ".." ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith(".\\") ||
    value.startsWith("..\\")
  );
}
