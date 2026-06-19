/**
 * @file 路径类型检测工具模块
 *
 * @description
 * 提供跨平台的文件系统路径类型检测工具函数，用于判断路径的格式和类型。
 * 主要支持 Windows 风格路径（盘符路径、UNC 路径）和相对路径的识别。
 *
 * 核心功能：
 * - Windows 盘符路径检测（如 `C:\`、`D:/`）
 * - UNC 网络路径检测（如 `\\server\share`）
 * - Windows 绝对路径综合检测
 * - 显式相对路径检测（如 `./`、`../`、`.\`、`..\`）
 *
 * 使用场景：
 * - 服务端文件操作前的路径格式校验
 * - Web 端路径输入框的格式验证
 * - 跨平台路径处理逻辑中的分支判断
 *
 * @module path
 * @layer 共享工具层
 *
 * @example
 * ```ts
 * import { isWindowsDrivePath, isExplicitRelativePath } from './path';
 *
 * isWindowsDrivePath('C:\\Users');     // true
 * isWindowsDrivePath('/home/user');    // false
 * isExplicitRelativePath('./src');     // true
 * isExplicitRelativePath('src');       // false
 * ```
 */

/**
 * 判断给定路径是否为 Windows 盘符风格的绝对路径
 *
 * 匹配格式：`<盘符>:\` 或 `<盘符>:/`，其中盘符为单个英文字母（A-Z 或 a-z）。
 * 也匹配仅包含盘符和冒号的路径（如 `C:`）。
 *
 * 正则表达式说明：
 * ```regex
 * /^[a-zA-Z]:([/\\]|$)/
 * ```
 * - `^[a-zA-Z]` - 以英文字母开头
 * - `:` - 后跟冒号
 * - `([/\\]|$)` - 后跟正斜杠、反斜杠或字符串结尾
 *
 * @param value - 待检测的路径字符串
 * @returns 如果是 Windows 盘符路径返回 true，否则返回 false
 *
 * @example
 * ```ts
 * isWindowsDrivePath('C:\\Users\\admin');  // true
 * isWindowsDrivePath('D:/projects');       // true
 * isWindowsDrivePath('C:');                // true
 * isWindowsDrivePath('/home/user');        // false
 * isWindowsDrivePath('relative/path');     // false
 * ```
 */
export function isWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:([/\\]|$)/.test(value);
}

/**
 * 判断给定路径是否为 Windows UNC（统一命名约定）网络路径
 *
 * UNC 路径格式以双反斜杠 `\\` 开头，用于访问网络共享资源，
 * 格式为 `\\server\share\path`。
 *
 * @param value - 待检测的路径字符串
 * @returns 如果是 UNC 路径返回 true，否则返回 false
 *
 * @example
 * ```ts
 * isUncPath('\\\\server\\share');          // true
 * isUncPath('\\\\192.168.1.1\\files');     // true
 * isUncPath('C:\\Users');                  // false
 * isUncPath('/home/user');                 // false
 * ```
 */
export function isUncPath(value: string): boolean {
  return value.startsWith("\\\\");
}

/**
 * 判断给定路径是否为 Windows 风格的绝对路径
 *
 * 综合检测两种 Windows 绝对路径格式：
 * - UNC 网络路径（`\\server\share`）
 * - 盘符路径（`C:\` 或 `D:/`）
 *
 * @param value - 待检测的路径字符串
 * @returns 如果是 Windows 绝对路径返回 true，否则返回 false
 *
 * @example
 * ```ts
 * isWindowsAbsolutePath('C:\\Users');              // true
 * isWindowsAbsolutePath('\\\\server\\share');      // true
 * isWindowsAbsolutePath('/home/user');             // false
 * isWindowsAbsolutePath('relative/path');          // false
 * ```
 *
 * @see {@link isWindowsDrivePath} - 检测盘符路径
 * @see {@link isUncPath} - 检测 UNC 路径
 */
export function isWindowsAbsolutePath(value: string): boolean {
  return isUncPath(value) || isWindowsDrivePath(value);
}

/**
 * 判断给定路径是否为显式的相对路径
 *
 * 显式相对路径指以 `./`、`../`、`.\`、`..\` 开头的路径，
 * 或仅为 `.`（当前目录）和 `..`（上级目录）的路径。
 *
 * 注意：不以 `./` 或 `../` 开头的路径（如 `src/index.ts`）不被视为显式相对路径，
 * 尽管它们实际上是相对路径，但缺少显式的前缀标识。
 *
 * @param value - 待检测的路径字符串
 * @returns 如果是显式相对路径返回 true，否则返回 false
 *
 * @example
 * ```ts
 * isExplicitRelativePath('.');               // true
 * isExplicitRelativePath('..');              // true
 * isExplicitRelativePath('./src');           // true
 * isExplicitRelativePath('../lib');          // true
 * isExplicitRelativePath('.\\src');          // true（Windows 风格）
 * isExplicitRelativePath('..\\lib');         // true（Windows 风格）
 * isExplicitRelativePath('src/index.ts');    // false（隐式相对路径）
 * isExplicitRelativePath('/absolute/path');  // false
 * isExplicitRelativePath('C:\\path');        // false
 * ```
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
