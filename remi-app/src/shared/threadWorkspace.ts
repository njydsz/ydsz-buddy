/**
 * @file threadWorkspace.ts
 * @description 线程工作区和 worktree 管理工具模块
 * @purpose 提供跨 Web 端和服务端共享的 worktree 和工作区根目录处理工具函数
 * @exports 关联的 worktree 元数据处理函数和工作区根目录比较工具
 */

/**
 * @interface AssociatedWorktreeMetadata
 * @description 关联的 worktree 元数据接口
 * @property {string | null} associatedWorktreePath - 关联的 worktree 路径
 * @property {string | null} associatedWorktreeBranch - 关联的 worktree 分支名称
 * @property {string | null} associatedWorktreeRef - 关联的 worktree 引用标识
 */
export interface AssociatedWorktreeMetadata {
  associatedWorktreePath: string | null;
  associatedWorktreeBranch: string | null;
  associatedWorktreeRef: string | null;
}

/**
 * @interface AssociatedWorktreeMetadataPatch
 * @description 关联的 worktree 元数据补丁接口（所有字段可选）
 * @property {string | null} [associatedWorktreePath] - 关联的 worktree 路径
 * @property {string | null} [associatedWorktreeBranch] - 关联的 worktree 分支名称
 * @property {string | null} [associatedWorktreeRef] - 关联的 worktree 引用标识
 */
export interface AssociatedWorktreeMetadataPatch {
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}

/**
 * @interface NormalizeWorkspaceRootForComparisonOptions
 * @description 工作区根目录标准化选项接口
 * @property {string} [platform] - 目标平台标识（如 'win32', 'darwin', 'linux'）
 */
export interface NormalizeWorkspaceRootForComparisonOptions {
  readonly platform?: string;
}

/**
 * @function isLikelyWindowsWorkspaceRoot
 * @description 判断给定的路径是否可能是 Windows 风格的工作区根目录
 * @param {string} value - 待判断的路径字符串
 * @param {string} [platform] - 平台标识
 * @returns {boolean} 如果是 Windows 风格路径返回 true，否则返回 false
 * @note 支持检测盘符路径（如 C:\）、UNC 路径（如 \\server\share 或 //server/share）
 */
function isLikelyWindowsWorkspaceRoot(value: string, platform?: string): boolean {
  // 如果明确指定了平台，直接判断
  if (platform === "win32") {
    return true;
  }
  if (platform && platform !== "win32") {
    return false;
  }
  // 否则通过路径格式推断：盘符路径、UNC 路径
  return /^[a-z]:([\\/]|$)/i.test(value) || value.startsWith("\\\\") || value.startsWith("//");
}

/**
 * @function normalizeWorkspaceRootForComparison
 * @description 标准化工作区根目录路径以用于比较
 * @param {string} value - 待标准化的路径字符串
 * @param {NormalizeWorkspaceRootForComparisonOptions} [options] - 标准化选项
 * @returns {string} 标准化后的路径字符串
 * @note 该函数仅标准化路径用于比较，不改变原始存储的显示路径。
 *       处理包括：统一斜杠方向、移除重复斜杠、处理 macOS 的 /private 前缀别名、
 *       Windows 路径转小写等。
 */
export function normalizeWorkspaceRootForComparison(
  value: string,
  options?: NormalizeWorkspaceRootForComparisonOptions,
): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  // 统一使用正斜杠
  const withForwardSlashes = trimmed.replace(/\\/g, "/");
  
  // 保留 UNC 路径前缀（//）或根目录前缀（/）
  const hasUncPrefix = withForwardSlashes.startsWith("//");
  const prefix = hasUncPrefix ? "//" : withForwardSlashes.startsWith("/") ? "/" : "";
  
  // 移除路径体中的重复斜杠
  const body = withForwardSlashes.slice(prefix.length).replace(/\/+/g, "/");
  
  // 移除末尾斜杠
  const normalized =
    prefix.length > 0 ? `${prefix}${body.replace(/\/+$/g, "")}` : body.replace(/\/+$/g, "");
  let finalValue = normalized.length > 0 ? normalized : prefix;

  // macOS 特殊处理：/var 和 /private/var 是同一位置的别名
  // /tmp 和 /private/tmp 也是同一位置的别名
  // 移除 /private 前缀以确保路径比较的一致性
  if (
    options?.platform === "darwin" &&
    (finalValue.startsWith("/private/var/") || finalValue.startsWith("/private/tmp/"))
  ) {
    finalValue = finalValue.slice("/private".length);
  }

  // Windows 路径转小写以进行不区分大小写的比较
  if (isLikelyWindowsWorkspaceRoot(trimmed, options?.platform)) {
    return finalValue.toLowerCase();
  }
  return finalValue;
}

/**
 * @function workspaceRootsEqual
 * @description 比较两个工作区根目录路径是否相等
 * @param {string} left - 左侧路径
 * @param {string} right - 右侧路径
 * @param {NormalizeWorkspaceRootForComparisonOptions} [options] - 标准化选项
 * @returns {boolean} 如果两个路径表示相同的工作区根目录返回 true，否则返回 false
 * @note 通过标准化后的路径进行严格相等比较
 */
export function workspaceRootsEqual(
  left: string,
  right: string,
  options?: NormalizeWorkspaceRootForComparisonOptions,
): boolean {
  return (
    normalizeWorkspaceRootForComparison(left, options) ===
    normalizeWorkspaceRootForComparison(right, options)
  );
}

/**
 * @function deriveAssociatedWorktreeMetadata
 * @description 从输入参数派生关联的 worktree 元数据
 * @param {Object} input - 输入参数对象
 * @param {string | null} [input.branch] - 分支名称
 * @param {string | null} [input.worktreePath] - worktree 路径
 * @param {string | null} [input.associatedWorktreePath] - 关联的 worktree 路径
 * @param {string | null} [input.associatedWorktreeBranch] - 关联的 worktree 分支
 * @param {string | null} [input.associatedWorktreeRef] - 关联的 worktree 引用
 * @returns {AssociatedWorktreeMetadata} 派生出的 worktree 元数据
 * @note 优先级规则：
 *       - associatedWorktreePath 优先于 worktreePath
 *       - associatedWorktreeBranch 优先于 branch（仅当 worktreePath 存在时）
 *       - associatedWorktreeRef 优先于 associatedWorktreeBranch，其次为 branch
 */
export function deriveAssociatedWorktreeMetadata(input: {
  branch?: string | null;
  worktreePath?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}): AssociatedWorktreeMetadata {
  return {
    // 路径：优先使用明确指定的关联路径，否则使用 worktree 路径
    associatedWorktreePath:
      input.associatedWorktreePath !== undefined
        ? input.associatedWorktreePath
        : (input.worktreePath ?? null),
    
    // 分支：优先使用明确指定的关联分支，否则当 worktree 存在时使用 branch
    associatedWorktreeBranch:
      input.associatedWorktreeBranch !== undefined
        ? input.associatedWorktreeBranch
        : input.worktreePath
          ? (input.branch ?? null)
          : null,
    
    // 引用：优先使用明确指定的关联引用，其次使用关联分支，最后使用 branch
    associatedWorktreeRef:
      input.associatedWorktreeRef !== undefined
        ? input.associatedWorktreeRef
        : input.associatedWorktreeBranch !== undefined
          ? input.associatedWorktreeBranch
          : input.worktreePath
            ? (input.branch ?? null)
            : null,
  };
}

/**
 * @function deriveAssociatedWorktreeMetadataPatch
 * @description 从输入参数派生关联的 worktree 元数据补丁（仅包含需要更新的字段）
 * @param {Object} input - 输入参数对象
 * @param {string | null} [input.branch] - 分支名称
 * @param {string | null} [input.worktreePath] - worktree 路径
 * @param {string | null} [input.associatedWorktreePath] - 关联的 worktree 路径
 * @param {string | null} [input.associatedWorktreeBranch] - 关联的 worktree 分支
 * @param {string | null} [input.associatedWorktreeRef] - 关联的 worktree 引用
 * @returns {AssociatedWorktreeMetadataPatch} 派生出的 worktree 元数据补丁
 * @note 与 deriveAssociatedWorktreeMetadata 不同，此函数返回的是补丁对象，
 *       仅包含明确指定的字段或从 worktree 存在性推断的字段，未定义的字段不会被包含。
 */
export function deriveAssociatedWorktreeMetadataPatch(input: {
  branch?: string | null;
  worktreePath?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}): AssociatedWorktreeMetadataPatch {
  const patch: AssociatedWorktreeMetadataPatch = {};

  // 路径补丁：优先使用明确指定的关联路径，否则当 worktree 路径有效时使用它
  if (input.associatedWorktreePath !== undefined) {
    patch.associatedWorktreePath = input.associatedWorktreePath;
  } else if (input.worktreePath !== undefined && input.worktreePath !== null) {
    patch.associatedWorktreePath = input.worktreePath;
  }

  // 分支补丁：优先使用明确指定的关联分支，否则当 worktree 路径有效时使用 branch
  if (input.associatedWorktreeBranch !== undefined) {
    patch.associatedWorktreeBranch = input.associatedWorktreeBranch;
  } else if (input.worktreePath !== undefined && input.worktreePath !== null) {
    patch.associatedWorktreeBranch = input.branch ?? null;
  }

  // 引用补丁：优先使用明确指定的关联引用，其次使用关联分支，最后当 worktree 存在时使用 branch
  if (input.associatedWorktreeRef !== undefined) {
    patch.associatedWorktreeRef = input.associatedWorktreeRef;
  } else if (input.associatedWorktreeBranch !== undefined) {
    patch.associatedWorktreeRef = input.associatedWorktreeBranch;
  } else if (input.worktreePath !== undefined && input.worktreePath !== null) {
    patch.associatedWorktreeRef = input.branch ?? null;
  }

  return patch;
}
