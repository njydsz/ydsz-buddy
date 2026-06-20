/**
 * Git 分支名称工具模块
 *
 * 提供 Git 分支名称的清洗、构建、唯一性保证等功能，
 * 以及临时工作树分支的识别与线程分支回退保护机制。
 *
 * **核心功能：**
 * - **分支名称清洗**：将任意字符串转换为合法的 Git 分支名称
 * - **唯一性保证**：自动处理分支名称冲突，追加数字后缀
 * - **临时工作树分支**：生成和识别临时工作树占位分支
 * - **线程分支保护**：防止临时占位分支覆盖正式分支
 * - **状态合并**：合并本地和远程 Git 状态信息
 *
 * **分支命名规范：**
 * - Feature 分支：`feature/<name>` 格式
 * - 工作树分支：`remicode/<fragment>` 格式
 * - 临时工作树分支：`remicode/<8位十六进制>` 格式
 *
 * @packageDocumentation
 *
 * @example 生成分支名称
 * ```ts
 * import {
 *   sanitizeFeatureBranchName,
 *   resolveAutoFeatureBranchName,
 *   buildRemicodeBranchName
 * } from './git';
 *
 * // 清洗分支名称
 * sanitizeFeatureBranchName('My Feature Branch');
 * // 返回: 'feature/my-feature-branch'
 *
 * // 生成唯一的 feature 分支
 * const existing = ['feature/login', 'feature/login-2'];
 * resolveAutoFeatureBranchName(existing, 'login');
 * // 返回: 'feature/login-3'
 *
 * // 构建 remicode 工作树分支
 * buildRemicodeBranchName('user-auth');
 * // 返回: 'remicode/user-auth'
 * ```
 *
 * @example 临时工作树分支
 * ```ts
 * import {
 *   buildTemporaryWorktreeBranchName,
 *   isTemporaryWorktreeBranch
 * } from './git';
 *
 * const tempBranch = buildTemporaryWorktreeBranchName();
 * // 返回: 'remicode/a1b2c3d4'
 *
 * isTemporaryWorktreeBranch(tempBranch);
 * // 返回: true
 * ```
 *
 * @see {@link sanitizeBranchFragment} - 清洗分支片段
 * @see {@link sanitizeFeatureBranchName} - 清洗 feature 分支名称
 * @see {@link resolveAutoFeatureBranchName} - 生成唯一 feature 分支
 * @see {@link buildRemicodeBranchName} - 构建 remicode 分支
 * @see {@link isTemporaryWorktreeBranch} - 判断临时工作树分支
 *
 * @module git
 */

/**
 * 工作树分支前缀常量
 *
 * 所有由本模块生成的工作树分支均以该前缀开头，格式为 `remicode/<fragment>`。
 * 此前缀用于标识由本系统自动生成的分支，便于区分用户手动创建的分支。
 *
 * @constant {string}
 * @default "remicode"
 *
 * @example
 * ```ts
 * console.log(WORKTREE_BRANCH_PREFIX);
 * // 输出: "remicode"
 * ```
 */
export const WORKTREE_BRANCH_PREFIX = "remicode";

/**
 * 临时工作树分支的正则匹配模式
 *
 * 匹配格式：`remicode/<8位十六进制>`，例如 `remicode/a1b2c3d4`。
 *
 * **正则表达式说明：**
 * ```regex
 * ^remicode\/[0-9a-f]{8}$
 * ```
 * - `^remicode\/` - 匹配以 "remicode/" 开头
 * - `[0-9a-f]{8}` - 匹配恰好 8 位十六进制字符（小写）
 * - `$` - 匹配字符串结尾
 *
 * @constant {RegExp}
 * @private 此常量为内部实现细节，不应直接使用
 *
 * @example
 * ```ts
 * TEMP_WORKTREE_BRANCH_PATTERN.test('remicode/a1b2c3d4');
 * // 返回: true
 *
 * TEMP_WORKTREE_BRANCH_PATTERN.test('remicode/xyz123');
 * // 返回: false (包含非十六进制字符)
 *
 * TEMP_WORKTREE_BRANCH_PATTERN.test('remicode/a1b2c3d4e5');
 * // 返回: false (超过 8 位)
 * ```
 */
const TEMP_WORKTREE_BRANCH_PATTERN = new RegExp(`^${WORKTREE_BRANCH_PREFIX}\\/[0-9a-f]{8}$`);

/**
 * 将任意字符串清洗为合法的 Git 分支片段
 *
 * 处理规则：
 * 1. 去除首尾空白并转为小写
 * 2. 移除引号字符（单引号、双引号、反引号）
 * 3. 去除首尾的分隔符（`.`、`/`、空格、`_`、`-`）
 * 4. 将非法字符替换为 `-`
 * 5. 合并连续的 `/` 和 `-`
 * 6. 截断至 64 个字符
 * 7. 若结果为空则回退为 `"update"`
 *
 * @param raw - 原始输入字符串
 * @returns 清洗后的合法分支片段字符串
 */
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
 * 将任意字符串清洗为合法的 `feature/…` 分支名称
 *
 * 处理规则：
 * - 先调用 `sanitizeBranchFragment` 进行基础清洗
 * - 若清洗后的结果已包含 `/`（如带有命名空间前缀），则确保以 `feature/` 开头
 * - 否则自动添加 `feature/` 前缀
 *
 * @param raw - 原始输入字符串
 * @returns 清洗后的 `feature/…` 格式分支名称
 */
export function sanitizeFeatureBranchName(raw: string): string {
  const sanitized = sanitizeBranchFragment(raw);
  if (sanitized.includes("/")) {
    return sanitized.startsWith("feature/") ? sanitized : `feature/${sanitized}`;
  }
  return `feature/${sanitized}`;
}

/** 自动生成分支名时的默认回退值 */
const AUTO_FEATURE_BRANCH_FALLBACK = "feature/update";

/** 构建 remicode 分支名时的默认回退值 */
const REMICODE_BRANCH_FALLBACK = "update";

/**
 * 解析一个唯一的 `feature/…` 分支名称，确保不与已有分支冲突
 *
 * 处理规则：
 * 1. 若提供了 `preferredBranch`，则以其为基础清洗；否则使用默认值 `"feature/update"`
 * 2. 若基础名称未与已有分支冲突，直接返回
 * 3. 否则依次尝试追加数字后缀 `-2`、`-3`… 直到找到不冲突的名称
 *
 * @param existingBranchNames - 当前已存在的分支名称列表
 * @param preferredBranch - 可选的期望分支名称
 * @returns 唯一的 `feature/…` 分支名称
 */
export function resolveAutoFeatureBranchName(
  existingBranchNames: readonly string[],
  preferredBranch?: string,
): string {
  const preferred = preferredBranch?.trim();
  const resolvedBase = sanitizeFeatureBranchName(
    preferred && preferred.length > 0 ? preferred : AUTO_FEATURE_BRANCH_FALLBACK,
  );
  // 将已有分支名称统一转为小写，便于不区分大小写地判重
  const existingNames = new Set(existingBranchNames.map((branch) => branch.toLowerCase()));

  if (!existingNames.has(resolvedBase)) {
    return resolvedBase;
  }

  // 依次追加数字后缀，直到找到不冲突的分支名
  let suffix = 2;
  while (existingNames.has(`${resolvedBase}-${suffix}`)) {
    suffix += 1;
  }

  return `${resolvedBase}-${suffix}`;
}

/**
 * 构建 `remicode/<fragment>` 格式的分支名称
 *
 * 处理规则：
 * 1. 若 `preferredBranch` 以 `codex/` 或 `remicode/` 开头（不区分大小写），则移除该前缀
 * 2. 对剩余部分调用 `sanitizeBranchFragment` 进行清洗
 * 3. 若清洗后为空，则使用默认回退值 `"update"`
 * 4. 最终拼接为 `remicode/<清洗后的片段>`
 *
 * @param preferredBranch - 可选的期望分支名称
 * @returns `remicode/<fragment>` 格式的分支名称
 */
export function buildRemicodeBranchName(preferredBranch?: string | null): string {
  const normalizedExisting = preferredBranch?.trim().replace(/^(codex|remicode)\//i, "") ?? "";
  return `${WORKTREE_BRANCH_PREFIX}/${sanitizeBranchFragment(
    normalizedExisting || REMICODE_BRANCH_FALLBACK,
  )}`;
}

/**
 * 解析一个唯一的 `remicode/<fragment>` 分支名称，确保不与已有分支冲突
 *
 * 处理规则：
 * 1. 调用 `buildRemicodeBranchName` 构建基础分支名
 * 2. 若基础名称未冲突，直接返回
 * 3. 否则依次追加数字后缀 `-2`、`-3`… 直到找到不冲突的名称
 *
 * @param existingBranchNames - 当前已存在的分支名称列表
 * @param preferredBranch - 可选的期望分支名称
 * @returns 唯一的 `remicode/<fragment>` 分支名称
 */
export function resolveUniqueRemicodeBranchName(
  existingBranchNames: readonly string[],
  preferredBranch?: string | null,
): string {
  const resolvedBase = buildRemicodeBranchName(preferredBranch);
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
 * 判断给定分支名是否为临时工作树分支
 *
 * 临时工作树分支的格式为 `remicode/<8位十六进制>`，
 * 例如 `remicode/a1b2c3d4`。
 *
 * @param branch - 待检测的分支名称
 * @returns 是否为临时工作树分支
 */
export function isTemporaryWorktreeBranch(branch: string): boolean {
  return TEMP_WORKTREE_BRANCH_PATTERN.test(branch.trim().toLowerCase());
}

/**
 * 生成一个随机的临时工作树分支名称
 *
 * 使用 `crypto.randomUUID()` 生成 UUID，取前 8 位十六进制字符作为随机令牌，
 * 拼接为 `remicode/<8位令牌>` 格式。
 *
 * @returns 随机生成的临时工作树分支名称
 */
export function buildTemporaryWorktreeBranchName(): string {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toLowerCase();
  return `${WORKTREE_BRANCH_PREFIX}/${token}`;
}

/**
 * 线程分支回退保护守卫
 *
 * 在 Git 状态轮询过程中，临时工作树占位分支可能在重命名/引导过渡期间
 * 短暂出现在 git status 中。此函数确保语义化的线程分支不会被临时占位分支覆盖：
 * - 若当前分支为正式分支，而下一分支为临时占位分支，则保留当前分支
 * - 其他情况正常返回下一分支
 *
 * @param input.currentBranch - 当前分支名称（null 表示无分支）
 * @param input.nextBranch - 下一次轮询到的分支名称（null 表示无分支）
 * @returns 经保护逻辑处理后的分支名称
 */
export function resolveThreadBranchRegressionGuard(input: {
  currentBranch: string | null;
  nextBranch: string | null;
}): string | null {
  // 当前为正式分支、下一为临时占位分支时，保持当前分支不变
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
 * 合并本地与远程 Git 状态信息
 *
 * 将本地 Git 状态对象与远程 Git 状态对象合并为一个完整对象。
 * 若远程状态为 null，则使用默认的远程状态值（无上游、无领先/落后、无 PR）。
 *
 * @typeParam Local - 本地 Git 状态类型
 * @typeParam Remote - 远程 Git 状态类型
 * @param local - 本地 Git 状态对象
 * @param remote - 远程 Git 状态对象，为 null 时使用默认值
 * @returns 合并后的完整 Git 状态对象
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
