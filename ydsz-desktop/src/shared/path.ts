/**
 * @file 路径工具模块
 *
 * 本模块提供跨平台路径类型识别工具，用于判断给定路径属于哪种路径格式：
 *
 * - **Windows 盘符路径**：如 `C:\Users`、`D:/`
 * - **UNC 路径**：如 `\\server\share`
 * - **相对路径**：如 `./`、`../`、`..`
 * - **绝对路径**：包含 Windows 路径（盘符/UNC）和 Unix 绝对路径（/）
 *
 * ## 核心导出
 *
 * - `isWindowsDrivePath`：判断是否为 Windows 盘符路径
 * - `isUncPath`：判断是否为 UNC 路径
 * - `isWindowsAbsolutePath`：判断是否为 Windows 绝对路径
 * - `isExplicitRelativePath`：判断是否为显式相对路径
 *
 * ## 使用场景
 *
 * - 路径展示时区分不同路径格式
 * - 跨平台路径处理逻辑分支
 * - 命令行参数校验
 *
 * ## 注意事项
 *
 * - 本模块不进行路径规范化，仅做类型识别
 * - Unix 系统不存在盘符路径，始终返回 false
 */

/**
 * 判断给定路径是否为 Windows 盘符路径。
 *
 * 匹配以字母开头、跟冒号和斜杠/反斜杠的路径格式，如 `C:\`、`D:/`。
 * 不匹配不带斜杠的裸盘符如 `C:`。
 *
 * @param value - 待检测的路径字符串
 * @returns 若为 Windows 盘符路径则返回 true
 * @example
 * ```ts
 * isWindowsDrivePath("C:\\Users\\name") // true
 * isWindowsDrivePath("D:/documents")    // true
 * isWindowsDrivePath("/home/user")       // false
 * ```
 */
export function isWindowsDrivePath(value: string): boolean {
  // 必须有盘符 + 冒号 + 斜杠（或反斜杠）；裸盘符如 `C:` 不算盘符路径
  return /^[a-zA-Z]:[/\\]/.test(value);
}

/**
 * 判断给定路径是否为 UNC（Universal Naming Convention）路径。
 *
 * UNC 路径以双反斜杠开头，用于网络共享路径，如 `\\server\share`。
 *
 * @param value - 待检测的路径字符串
 * @returns 若为 UNC 路径则返回 true
 * @example
 * ```ts
 * isUncPath("\\\\server\\share")  // true
 * isUncPath("\\\\localhost\\c$") // true
 * isUncPath("C:\\Users")          // false
 * ```
 */
export function isUncPath(value: string): boolean {
  return value.startsWith("\\\\");
}

/**
 * 判断给定路径是否为 Windows 绝对路径。
 *
 * Windows 绝对路径包括盘符路径和 UNC 路径两种形式。
 *
 * @param value - 待检测的路径字符串
 * @returns 若为 Windows 绝对路径则返回 true
 * @example
 * ```ts
 * isWindowsAbsolutePath("C:\\Users\\name") // true
 * isWindowsAbsolutePath("\\\\server\\share") // true
 * isWindowsAbsolutePath("./relative")       // false
 * ```
 */
export function isWindowsAbsolutePath(value: string): boolean {
  return isUncPath(value) || isWindowsDrivePath(value);
}

/**
 * 判断给定路径是否为显式相对路径。
 *
 * 显式相对路径包括：
 * - 当前目录：`"."`
 * - 父目录：`".."`
 * - 以 `./`、`../`、`.\`、`..\` 开头的路径
 *
 * @param value - 待检测的路径字符串
 * @returns 若为显式相对路径则返回 true
 * @example
 * ```ts
 * isExplicitRelativePath(".")      // true
 * isExplicitRelativePath("..")     // true
 * isExplicitRelativePath("./foo")   // true
 * isExplicitRelativePath("../bar")  // true
 * isExplicitRelativePath("foo/bar") // false
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
