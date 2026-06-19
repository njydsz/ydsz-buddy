/**
 * @file 本地文件夹提及处理模块
 * @description 集中管理编辑器中本地文件夹提及浏览的规则。
 *              提供本地提及常量和查询/根路径辅助函数，用于 ChatView 和命令菜单。
 */

/** 本地文件夹提及名称 */
export const LOCAL_FOLDER_MENTION_NAME = "local";

/**
 * 匹配本地文件夹提及快捷方式
 * @param query - 查询字符串
 * @returns 是否匹配本地文件夹提及快捷方式
 */
export function matchesLocalFolderMentionShortcut(query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }
  return LOCAL_FOLDER_MENTION_NAME.startsWith(normalizedQuery);
}

/**
 * 判断是否为本地文件夹提及查询
 * @param query - 查询字符串
 * @returns 是否为本地文件夹提及查询（以 /、盘符路径或 ~ 开头）
 */
export function isLocalFolderMentionQuery(query: string): boolean {
  const normalizedQuery = query.trim();
  if (normalizedQuery.startsWith("/")) return true;
  if (/^[A-Za-z]:[\\/]/.test(normalizedQuery)) return true;
  if (normalizedQuery.startsWith("~/") || normalizedQuery.startsWith("~\\")) return true;
  return false;
}

/**
 * 获取本地文件夹浏览根路径
 * @param homeDir - 主目录路径
 * @param preferFilesystemRoot - 是否优先使用文件系统根目录
 * @returns 浏览根路径，如果主目录为空则返回 null
 */
export function getLocalFolderBrowseRootPath(
  homeDir: string | null | undefined,
  preferFilesystemRoot: boolean,
): string | null {
  const normalizedHomeDir = homeDir?.trim() ?? "";
  if (normalizedHomeDir.length === 0) {
    return null;
  }

  // 如果不优先使用文件系统根目录，直接返回主目录
  if (!preferFilesystemRoot) {
    return normalizedHomeDir;
  }

  // 处理 Windows 路径（返回盘符根目录）
  const windowsRootMatch = /^[A-Za-z]:[\\/]/.exec(normalizedHomeDir);
  if (windowsRootMatch) {
    return windowsRootMatch[0].replace(/\//g, "\\");
  }

  // 处理 Unix 路径（返回根目录）
  if (normalizedHomeDir.startsWith("/")) {
    return "/";
  }

  return normalizedHomeDir;
}

/**
 * 展开本地文件夹路径中的 ~ 符号
 * 将前导的 ~ / ~/ / ~\ 展开为配置的主目录。
 * 当路径不以 ~ 开头或主目录缺失时，返回原始输入（以便调用方显示"不可用"状态）。
 * @param value - 路径值
 * @param homeDir - 主目录路径
 * @returns 展开后的路径
 */
export function expandLocalFolderPath(value: string, homeDir: string | null | undefined): string {
  if (!value) return value;
  const normalizedHomeDir = homeDir?.trim() ?? "";
  if (!normalizedHomeDir) return value;
  
  // 处理单独的 ~
  if (value === "~") return normalizedHomeDir;
  
  // 处理 ~/ 或 ~\ 开头的路径
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    const separator = value[1] as "/" | "\\";
    const suffix = value.slice(2);
    if (!suffix) return normalizedHomeDir;
    const homeEndsWithSeparator =
      normalizedHomeDir.endsWith("/") || normalizedHomeDir.endsWith("\\");
    return homeEndsWithSeparator
      ? `${normalizedHomeDir}${suffix}`
      : `${normalizedHomeDir}${separator}${suffix}`;
  }
  return value;
}
