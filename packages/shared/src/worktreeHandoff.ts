/**
 * 文件: worktreeHandoff.ts
 * 用途: 工作树交接意图解析工具，在创建新工作树和复用已有工作树之间做出决策。
 * 层级: 共享工具模块
 * 主要导出: WorktreeHandoffIntent 类型、hasAssociatedWorktree、resolveWorktreeHandoffIntent
 */

/**
 * 工作树交接意图。
 * - `create-new`: 创建全新的工作树；
 * - `reuse-associated`: 复用已有的关联工作树。
 */
export type WorktreeHandoffIntent =
  | {
      kind: "create-new";
      worktreeName: string;
      baseBranch: string | null;
    }
  | {
      kind: "reuse-associated";
      associatedWorktreePath: string | null;
      associatedWorktreeBranch: string | null;
      associatedWorktreeRef: string | null;
      baseBranch: string | null;
    };

/**
 * 判断是否存在关联工作树（路径、分支或引用任一非空即视为存在）。
 * @param input - 包含关联工作树元数据的输入。
 * @returns 存在关联工作树返回 true。
 */
export function hasAssociatedWorktree(input: {
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}): boolean {
  return Boolean(
    input.associatedWorktreePath ?? input.associatedWorktreeBranch ?? input.associatedWorktreeRef,
  );
}

/**
 * 根据输入解析工作树交接意图。
 *
 * 决策逻辑：
 * 1. 若指定了首选工作树名称 → `create-new`（创建新工作树）；
 * 2. 若存在关联工作树 → `reuse-associated`（复用已有工作树）；
 * 3. 否则 → null（无需交接）。
 *
 * @param input - 包含工作树名称、关联元数据、基准分支和当前分支的输入。
 * @returns 工作树交接意图或 null。
 */
export function resolveWorktreeHandoffIntent(input: {
  preferredNewWorktreeName?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
  preferredWorktreeBaseBranch?: string | null;
  currentBranch?: string | null;
}): WorktreeHandoffIntent | null {
  const normalizedWorktreeName = input.preferredNewWorktreeName?.trim() ?? "";
  // 基准分支优先级：指定基准分支 > 当前分支
  const baseBranch = input.preferredWorktreeBaseBranch ?? input.currentBranch ?? null;

  // 有指定名称 → 创建新工作树
  if (normalizedWorktreeName.length > 0) {
    return {
      kind: "create-new",
      worktreeName: normalizedWorktreeName,
      baseBranch,
    };
  }

  // 有关联工作树 → 复用
  if (!hasAssociatedWorktree(input)) {
    return null;
  }

  return {
    kind: "reuse-associated",
    associatedWorktreePath: input.associatedWorktreePath ?? null,
    associatedWorktreeBranch: input.associatedWorktreeBranch ?? null,
    associatedWorktreeRef: input.associatedWorktreeRef ?? null,
    baseBranch,
  };
}
