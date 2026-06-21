/**
 * @file Git 工具函数模块
 *
 * 本模块提供 Git 操作相关的工具函数，主要用于：
 *
 * - **分支名清理**：将任意字符串转换为合法的 git 分支名片段
 * - **Worktree 分支前缀**：定义 Remi 管理的 worktree 分支命名规则
 * - **路径分隔符处理**：跨平台路径与 Git 路径的转换
 *
 * ## 核心导出
 *
 * - `WORKTREE_BRANCH_PREFIX`：Remi 管理的 worktree 分支前缀（"remi-claw"）
 * - `sanitizeGitBranchFragment`：清理字符串为合法分支名片段
 *
 * ## 使用场景
 *
 * - 创建 worktree 时生成唯一分支名
 * - 用户输入的标题转为分支名
 * - 与 git 子系统交互时的路径处理
 *
 * ## 注意事项
 *
 * - 分支片段最大 64 字符
 * - 自动转小写、去除引号、合并分隔符
 * - 非法字符替换为 `-`
 *
 * Sanitize an arbitrary string into a valid, lowercase git branch fragment.
 * Strips quotes, collapses separators, limits to 64 chars.
 */
export const WORKTREE_BRANCH_PREFIX = "remi-claw";
const TEMP_WORKTREE_BRANCH_PATTERN = new RegExp(`^${WORKTREE_BRANCH_PREFIX}\\/[0-9a-f]{8}$`);

export function sanitizeBranchFragment(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/^[./\s_-]+|[./\s_-]+$/g, "");

  const branchFragment = normalized
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^[./_-]+|[./_-]+$/g, "")
    .slice(0, 64)
    .replace(/[./_-]+$/g, "");

  return branchFragment.length > 0 ? branchFragment : "update";
}

/**
 * Sanitize a string into a `feature/…` branch name.
 * Preserves an existing `feature/` prefix or slash-separated namespace.
 */
export function sanitizeFeatureBranchName(raw: string): string {
  const sanitized = sanitizeBranchFragment(raw);
  if (sanitized.includes("/")) {
    return sanitized.startsWith("feature/") ? sanitized : `feature/${sanitized}`;
  }
  return `feature/${sanitized}`;
}

const AUTO_FEATURE_BRANCH_FALLBACK = "feature/update";
const REMI_CLAW_BRANCH_FALLBACK = "update";

/**
 * Resolve a unique `feature/…` branch name that doesn't collide with
 * any existing branch. Appends a numeric suffix when needed.
 */
export function resolveAutoFeatureBranchName(
  existingBranchNames: readonly string[],
  preferredBranch?: string,
): string {
  const preferred = preferredBranch?.trim();
  const resolvedBase = sanitizeFeatureBranchName(
    preferred && preferred.length > 0 ? preferred : AUTO_FEATURE_BRANCH_FALLBACK,
  );
  const existingNames = new Set(existingBranchNames.map((branch) => branch.toLowerCase()));

  if (!existingNames.has(resolvedBase)) {
    return resolvedBase;
  }

  let suffix = 2;
  while (existingNames.has(`${resolvedBase}-${suffix}`)) {
    suffix += 1;
  }

  return `${resolvedBase}-${suffix}`;
}

export function buildRemiClawBranchName(preferredBranch?: string | null): string {
  const normalizedExisting = preferredBranch?.trim().replace(/^(codex|remi-claw)\//i, "") ?? "";
  return `${WORKTREE_BRANCH_PREFIX}/${sanitizeBranchFragment(
    normalizedExisting || REMI_CLAW_BRANCH_FALLBACK,
  )}`;
}

export function resolveUniqueRemiClawBranchName(
  existingBranchNames: readonly string[],
  preferredBranch?: string | null,
): string {
  const resolvedBase = buildRemiClawBranchName(preferredBranch);
  const existingNames = new Set(existingBranchNames.map((branch) => branch.toLowerCase()));

  if (!existingNames.has(resolvedBase)) {
    return resolvedBase;
  }

  let suffix = 2;
  while (existingNames.has(`${resolvedBase}-${suffix}`)) {
    suffix += 1;
  }

  return `${resolvedBase}-${suffix}`;
}

export function isTemporaryWorktreeBranch(branch: string): boolean {
  return TEMP_WORKTREE_BRANCH_PATTERN.test(branch.trim().toLowerCase());
}

export function buildTemporaryWorktreeBranchName(): string {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toLowerCase();
  return `${WORKTREE_BRANCH_PREFIX}/${token}`;
}

// Preserve semantic thread branches when transient worktree placeholders briefly
// appear in git status during rename/bootstrap transitions.
export function resolveThreadBranchRegressionGuard(input: {
  currentBranch: string | null;
  nextBranch: string | null;
}): string | null {
  if (
    input.currentBranch !== null &&
    input.nextBranch !== null &&
    !isTemporaryWorktreeBranch(input.currentBranch) &&
    isTemporaryWorktreeBranch(input.nextBranch)
  ) {
    return input.currentBranch;
  }

  return input.nextBranch;
}

export function mergeGitStatusParts<Local extends object, Remote extends object>(
  local: Local,
  remote: Remote | null,
): Local & Remote {
  return {
    ...local,
    ...(remote ?? {
      hasUpstream: false,
      upstreamBranch: null,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    }),
  } as Local & Remote;
}
