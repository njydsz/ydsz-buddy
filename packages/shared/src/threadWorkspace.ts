/**
 * 文件: threadWorkspace.ts
 * 用途: 工作树和工作区根目录相关的共享辅助函数，供 Web 和 Server 端使用。
 * 层级: 共享工具模块
 * 主要导出: 关联工作树元数据接口、工作区根目录规范化与比较函数、元数据推导函数
 */

/** 关联工作树元数据 */
export interface AssociatedWorktreeMetadata {
  associatedWorktreePath: string | null;
  associatedWorktreeBranch: string | null;
  associatedWorktreeRef: string | null;
}

/** 关联工作树元数据补丁 */
export interface AssociatedWorktreeMetadataPatch {
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}

/** 工作区根目录规范化选项 */
export interface NormalizeWorkspaceRootForComparisonOptions {
  readonly platform?: string;
}

/**
 * 判断路径是否可能为 Windows 工作区根目录。
 * 通过平台信息和路径特征（盘符、UNC 前缀）综合判断。
 */
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
 * 规范化工作区根目录路径以用于比较，不改变原始存储的显示路径。
 *
 * 处理逻辑：
 * - 统一路径分隔符为正斜杠；
 * - 规范化连续斜杠和尾部斜杠；
 * - 在 macOS（darwin）上，将 `/private/var/` 和 `/private/tmp/` 映射为 `/var/` 和 `/tmp/`，
 *   以处理 macOS 文件系统别名；
 * - 在 Windows 平台上，将路径转为小写以进行大小写不敏感比较。
 *
 * @param value - 待规范化的路径字符串。
 * @param options - 包含平台信息的选项。
 * @returns 规范化后的路径字符串。
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

  // macOS 上 `/var/...` 和 `/private/var/...` 是同一位置（`/tmp/...` 同理）。
  // 统一去掉 `/private` 前缀，确保导入工作树路径在恢复/导入流程中
  // 能与其项目工作区根目录匹配。
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
 * 判断两个工作区根目录路径是否指向同一位置。
 * @param left - 左侧路径。
 * @param right - 右侧路径。
 * @param options - 包含平台信息的选项。
 * @returns 规范化后相等返回 true。
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
 * 从输入数据中推导关联工作树元数据。
 *
 * 优先级：显式指定的关联值 > 从 worktreePath/branch 推导。
 *
 * @param input - 包含工作树路径、分支和关联元数据的输入。
 * @returns 推导后的关联工作树元数据。
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
 * 从输入数据中推导关联工作树元数据补丁（仅包含变更的字段）。
 *
 * 返回的补丁对象仅包含实际需要更新的字段，便于增量更新。
 *
 * @param input - 包含工作树路径、分支和关联元数据的输入。
 * @returns 包含需要变更字段的补丁对象。
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
