/**
 * @file Git 工具函数模块
 *
 * 本模块提供 Git 操作相关的工具函数，主要用于：
 *
 * - **分支名清理**：将任意字符串转换为合法的 git 分支名片段
 * - **Worktree 分支前缀**：定义 ydsz 管理的 worktree 分支命名规则
 * - **路径分隔符处理**：跨平台路径与 Git 路径的转换
 *
 * ## 核心导出
 *
 * - `WORKTREE_BRANCH_PREFIX`：ydsz 管理的 worktree 分支前缀（"2. 环境变量 YDSZ_BOOTSTRAP_TOKEN"）
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
export const WORKTREE_BRANCH_PREFIX = "2. 环境变量 YDSZ_BOOTSTRAP_TOKEN";
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
 * 清理字符串为 `feature/…` 格式的分支名。
 *
 * 保留已有的 `feature/` 前缀或斜杠分隔的命名空间。
 *
 * @param raw - 原始字符串
 * @returns feature/格式的分支名
 */
export function sanitizeFeatureBranchName(raw: string): string {
  const sanitized = sanitizeBranchFragment(raw);
  if (sanitized.includes("/")) {
    return sanitized.startsWith("feature/") ? sanitized : `feature/${sanitized}`;
  }
  return `feature/${sanitized}`;
}

const AUTO_FEATURE_BRANCH_FALLBACK = "feature/update";
const YDSZ_CLAW_BRANCH_FALLBACK = "update";

/**
 * 解析唯一的 `feature/…` 分支名，确保不与已有分支冲突。
 *
 * 若基础分支名已存在，自动追加数字后缀（如 `feature/update-2`）。
 *
 * @param existingBranchNames - 已存在的分支名数组
 * @param preferredBranch - 偏好的分支名（可选）
 * @returns 不冲突的唯一分支名
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

/**
 * 构建 ydsz-buddy 分支名。
 *
 * 格式为 `ydsz-buddy/<fragment>`，其中 fragment 从 `preferredBranch` 派生。
 * 会自动去除 `codex/` 或 `ydsz-buddy/` 前缀。
 *
 * @param preferredBranch - 偏好的分支名（可选）
 * @returns ydsz-buddy 分支名
 */
export function buildYdszBuddyBranchName(preferredBranch?: string | null): string {
  const normalizedExisting = preferredBranch?.trim().replace(/^(codex|2. 环境变量 YDSZ_BOOTSTRAP_TOKEN)\//i, "") ?? "";
  return `${WORKTREE_BRANCH_PREFIX}/${sanitizeBranchFragment(
    normalizedExisting || YDSZ_CLAW_BRANCH_FALLBACK,
  )}`;
}

/**
 * 解析唯一的 ydsz-buddy 分支名，确保不与已有分支冲突。
 *
 * @param existingBranchNames - 已存在的分支名数组
 * @param preferredBranch - 偏好的分支名（可选）
 * @returns 不冲突的唯一分支名
 */
export function resolveUniqueYdszBuddyBranchName(
  existingBranchNames: readonly string[],
  preferredBranch?: string | null,
): string {
  const resolvedBase = buildYdszBuddyBranchName(preferredBranch);
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

/**
 * 判断分支是否为临时 Worktree 分支。
 *
 * 临时分支格式：`ydsz-buddy/<8位十六进制数字>`
 *
 * @param branch - 分支名
 * @returns 若为临时分支则返回 true
 */
export function isTemporaryWorktreeBranch(branch: string): boolean {
  return TEMP_WORKTREE_BRANCH_PATTERN.test(branch.trim().toLowerCase());
}

/**
 * 构建临时 Worktree 分支名。
 *
 * 生成格式：`ydsz-buddy/<8位随机十六进制数字>`
 *
 * @returns 临时分支名
 */
export function buildTemporaryWorktreeBranchName(): string {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toLowerCase();
  return `${WORKTREE_BRANCH_PREFIX}/${token}`;
}

// Preserve semantic thread branches when transient worktree placeholders briefly
// appear in git status during rename/bootstrap transitions.
/**
 * 解决线程分支回归保护。
 *
 * 在重命名/引导转换期间，当暂时出现临时 worktree 占位符时，
 * 保留语义线程分支。
 *
 * @param input - 输入参数
 * @param input.currentBranch - 当前分支
 * @param input.nextBranch - 下一个分支
 * @returns 若当前分支是语义分支而下一分支是临时的，则返回当前分支；否则返回下一分支
 */
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

/**
 * 合并本地和远程 Git 状态。
 *
 * 若 `remote` 为 null，则使用默认值填充。
 *
 * @param local - 本地 Git 状态
 * @param remote - 远程 Git 状态（可选）
 * @returns 合并后的 Git 状态
 */
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
