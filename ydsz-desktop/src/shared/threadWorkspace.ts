/**
 * @file 线程工作区工具模块
 *
 * 本模块提供 worktree 和 workspace root 相关的辅助工具，被前端 UI 和后端服务共享使用：
 *
 * - **关联 Worktree 元数据**：管理线程关联的 worktree 路径、分支、引用
 * - **工作区路径比较**：规范化路径后比较是否相等（跨平台兼容）
 * - **元数据派生**：从线程状态派生 worktree 元数据
 *
 * ## 核心导出
 *
 * - `AssociatedWorktreeMetadata`：关联 worktree 的完整元数据
 * - `AssociatedWorktreeMetadataPatch`：关联 worktree 元数据的增量更新
 * - `normalizeWorkspaceRootForComparison`：规范化路径用于比较
 * - `workspaceRootsEqual`：比较两个工作区路径是否相等
 * - `deriveAssociatedWorktreeMetadata`：从线程状态派生元数据
 *
 * ## 使用场景
 *
 * - 工作区路径导入/导出时的比较
 * - macOS 上 `/var` 和 `/private/var` 路径别名处理
 * - Windows 和 Unix 路径格式统一比较
 * - Worktree 创建/删除时的元数据管理
 *
 * ## 注意事项
 *
 * - macOS 上 `/private/var` 和 `/var` 被视为相同路径
 * - Windows 路径比较不区分大小写
 * - 路径尾部的斜杠会被移除后再比较
 */

/**
 * 关联 worktree 的完整元数据。
 *
 * 描述一个线程关联的 git worktree 的完整信息。
 */
export interface AssociatedWorktreeMetadata {
  /** Worktree 的文件系统路径 */
  associatedWorktreePath: string | null;
  /** Worktree 所在的 git 分支名 */
  associatedWorktreeBranch: string | null;
  /** Worktree 的 git 引用（如分支名或 commit hash） */
  associatedWorktreeRef: string | null;
}

/**
 * 关联 worktree 元数据的增量更新。
 *
 * 用于部分更新 worktree 元数据的某些字段。
 */
export interface AssociatedWorktreeMetadataPatch {
  /** Worktree 路径的更新值 */
  associatedWorktreePath?: string | null;
  /** Worktree 分支的更新值 */
  associatedWorktreeBranch?: string | null;
  /** Worktree 引用的更新值 */
  associatedWorktreeRef?: string | null;
}

/**
 * 路径规范化选项。
 */
export interface NormalizeWorkspaceRootForComparisonOptions {
  /** 指定操作系统平台（如 `darwin`、`win32`），用于平台特定处理 */
  readonly platform?: string;
}

function isLikelyWindowsWorkspaceRoot(value: string, platform?: string): boolean {
  if (platform === "win32") {
    return true;
  }
  if (platform && platform !== "win32") {
    return false;
  }
  return /^[a-z]:([\\/]|$)/i.test(value) || value.startsWith("\\\\") || value.startsWith("//");
}

/**
 * 规范化工作区根路径用于比较。
 *
 * 执行以下规范化操作：
 * - 反斜杠替换为正斜杠
 * - 合并连续斜杠
 * - 移除尾部斜杠
 * - macOS 上：`/private/var` → `/var`，`/private/tmp` → `/tmp`
 * - Windows 上：转换为小写
 *
 * 注意：此函数不改变原始存储的显示路径，仅用于导入路径的身份比较。
 *
 * @param value - 待规范化的路径
 * @param options - 规范化选项
 * @returns 规范化后的路径
 */
export function normalizeWorkspaceRootForComparison(
  value: string,
  options?: NormalizeWorkspaceRootForComparisonOptions,
): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const withForwardSlashes = trimmed.replace(/\\/g, "/");
  const hasUncPrefix = withForwardSlashes.startsWith("//");
  const prefix = hasUncPrefix ? "//" : withForwardSlashes.startsWith("/") ? "/" : "";
  const body = withForwardSlashes.slice(prefix.length).replace(/\/+/g, "/");
  const normalized =
    prefix.length > 0 ? `${prefix}${body.replace(/\/+$/g, "")}` : body.replace(/\/+$/g, "");
  let finalValue = normalized.length > 0 ? normalized : prefix;

  // macOS commonly surfaces the same temp/workspace location through both
  // `/var/...` and `/private/var/...` (likewise `/tmp/...` vs `/private/tmp/...`).
  // Treat those aliases as identical so imported worktree paths still match
  // their project workspace roots during resume/import flows.
  if (
    options?.platform === "darwin" &&
    (finalValue.startsWith("/private/var/") || finalValue.startsWith("/private/tmp/"))
  ) {
    finalValue = finalValue.slice("/private".length);
  }

  if (isLikelyWindowsWorkspaceRoot(trimmed, options?.platform)) {
    return finalValue.toLowerCase();
  }
  return finalValue;
}

/**
 * 比较两个工作区根路径是否相等。
 *
 * 在比较前会对两个路径进行规范化处理，确保跨平台路径比较正确。
 *
 * @param left - 第一个路径
 * @param right - 第二个路径
 * @param options - 规范化选项
 * @returns 若两个路径相等则返回 true
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
 * 从线程状态派生关联 worktree 的完整元数据。
 *
 * 根据输入的分支、worktree 路径等信息，填充完整的元数据结构。
 * 元数据字段优先级：显式传入值 > 从 worktreePath 派生 > null
 *
 * @param input - 输入参数
 * @param input.branch - 当前线程所在分支
 * @param input.worktreePath - Worktree 文件系统路径
 * @param input.associatedWorktreePath - 显式指定的 worktree 路径
 * @param input.associatedWorktreeBranch - 显式指定的 worktree 分支
 * @param input.associatedWorktreeRef - 显式指定的 worktree 引用
 * @returns 完整的 worktree 元数据
 */
export function deriveAssociatedWorktreeMetadata(input: {
  branch?: string | null;
  worktreePath?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}): AssociatedWorktreeMetadata {
  return {
    associatedWorktreePath:
      input.associatedWorktreePath !== undefined
        ? input.associatedWorktreePath
        : (input.worktreePath ?? null),
    associatedWorktreeBranch:
      input.associatedWorktreeBranch !== undefined
        ? input.associatedWorktreeBranch
        : input.worktreePath
          ? (input.branch ?? null)
          : null,
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
 * 从线程状态派生关联 worktree 元数据的增量更新。
 *
 * 与 `deriveAssociatedWorktreeMetadata` 不同，此函数仅包含有变化的字段，
 * 用于部分更新存储中的 worktree 元数据。
 *
 * @param input - 输入参数（同 `deriveAssociatedWorktreeMetadata`）
 * @returns 增量更新的元数据 patch
 */
export function deriveAssociatedWorktreeMetadataPatch(input: {
  branch?: string | null;
  worktreePath?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}): AssociatedWorktreeMetadataPatch {
  const patch: AssociatedWorktreeMetadataPatch = {};

  if (input.associatedWorktreePath !== undefined) {
    patch.associatedWorktreePath = input.associatedWorktreePath;
  } else if (input.worktreePath !== undefined && input.worktreePath !== null) {
    patch.associatedWorktreePath = input.worktreePath;
  }

  if (input.associatedWorktreeBranch !== undefined) {
    patch.associatedWorktreeBranch = input.associatedWorktreeBranch;
  } else if (input.worktreePath !== undefined && input.worktreePath !== null) {
    patch.associatedWorktreeBranch = input.branch ?? null;
  }

  if (input.associatedWorktreeRef !== undefined) {
    patch.associatedWorktreeRef = input.associatedWorktreeRef;
  } else if (input.associatedWorktreeBranch !== undefined) {
    patch.associatedWorktreeRef = input.associatedWorktreeBranch;
  } else if (input.worktreePath !== undefined && input.worktreePath !== null) {
    patch.associatedWorktreeRef = input.branch ?? null;
  }

  return patch;
}
