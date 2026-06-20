/**
 * @file Git Worktree 交接意图处理
 * @description 处理 Git worktree 的创建或复用意图解析
 * @module shared/worktreeHandoff
 */

/**
 * Worktree 交接意图类型
 * @description 表示两种不同的 worktree 处理策略
 */
export type WorktreeHandoffIntent =
  /**
   * 创建新的 worktree
   * @property kind - 标识为 "create-new"
   * @property worktreeName - 新 worktree 的名称
   * @property baseBranch - 基于的分支，null 表示使用默认分支
   */
  | {
      kind: "create-new";
      worktreeName: string;
      baseBranch: string | null;
    }
  /**
   * 复用已关联的 worktree
   * @property kind - 标识为 "reuse-associated"
   * @property associatedWorktreePath - 关联 worktree 的路径
   * @property associatedWorktreeBranch - 关联 worktree 的分支
   * @property associatedWorktreeRef - 关联 worktree 的引用
   * @property baseBranch - 基于的分支
   */
  | {
      kind: "reuse-associated";
      associatedWorktreePath: string | null;
      associatedWorktreeBranch: string | null;
      associatedWorktreeRef: string | null;
      baseBranch: string | null;
    };

/**
 * 判断是否存在关联的 worktree
 * @param input - 输入参数对象
 * @param input.associatedWorktreePath - 关联 worktree 的路径
 * @param input.associatedWorktreeBranch - 关联 worktree 的分支
 * @param input.associatedWorktreeRef - 关联 worktree 的引用
 * @returns 如果任一关联字段存在则返回 true
 * @description 通过检查 path、branch、ref 三个字段是否至少有一个存在来判断
 */
export function hasAssociatedWorktree(input: {
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}): boolean {
  // 使用空值合并运算符检查三个字段是否至少有一个存在
  return Boolean(
    input.associatedWorktreePath ?? input.associatedWorktreeBranch ?? input.associatedWorktreeRef,
  );
}

/**
 * 解析 worktree 交接意图
 * @param input - 输入参数对象
 * @param input.preferredNewWorktreeName - 首选的新 worktree 名称，如果提供则创建新 worktree
 * @param input.associatedWorktreePath - 关联 worktree 的路径
 * @param input.associatedWorktreeBranch - 关联 worktree 的分支
 * @param input.associatedWorktreeRef - 关联 worktree 的引用
 * @param input.preferredWorktreeBaseBranch - 首选的基础分支
 * @param input.currentBranch - 当前分支，作为基础分支的备选
 * @returns 解析后的交接意图，如果无法确定则返回 null
 * @description
 * 解析优先级：
 * 1. 如果提供了 preferredNewWorktreeName，则返回 "create-new" 意图
 * 2. 如果存在关联的 worktree，则返回 "reuse-associated" 意图
 * 3. 否则返回 null，表示无法确定交接意图
 */
export function resolveWorktreeHandoffIntent(input: {
  preferredNewWorktreeName?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
  preferredWorktreeBaseBranch?: string | null;
  currentBranch?: string | null;
}): WorktreeHandoffIntent | null {
  // 规范化 worktree 名称，移除首尾空白字符
  const normalizedWorktreeName = input.preferredNewWorktreeName?.trim() ?? "";
  // 确定基础分支：优先使用首选基础分支，其次使用当前分支
  const baseBranch = input.preferredWorktreeBaseBranch ?? input.currentBranch ?? null;

  // 优先级1：如果提供了有效的 worktree 名称，则创建新的 worktree
  if (normalizedWorktreeName.length > 0) {
    return {
      kind: "create-new",
      worktreeName: normalizedWorktreeName,
      baseBranch,
    };
  }

  // 优先级2：如果没有关联的 worktree，返回 null
  if (!hasAssociatedWorktree(input)) {
    return null;
  }

  // 优先级3：复用已关联的 worktree
  return {
    kind: "reuse-associated",
    associatedWorktreePath: input.associatedWorktreePath ?? null,
    associatedWorktreeBranch: input.associatedWorktreeBranch ?? null,
    associatedWorktreeRef: input.associatedWorktreeRef ?? null,
    baseBranch,
  };
}
