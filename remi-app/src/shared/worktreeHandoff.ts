/**
 * @file Worktree 切换意图模块
 *
 * 本模块定义了 Remi 系统中 Worktree 切换（Handoff）相关的类型与解析工具：
 *
 * - **切换意图类型**：用户希望如何切换 worktree
 * - **意图解析**：将用户输入解析为标准化的切换意图
 * - **跨流程复用**：UI、编排器、Git 子系统均消费本模块的类型
 *
 * ## 核心导出
 *
 * - `WorktreeHandoffIntent`：worktree 切换意图联合类型
 *   - `create-new`：创建新 worktree（指定名称和基础分支）
 *   - `use-existing`：使用已有 worktree（指定分支）
 *   - `return-to-root`：返回项目根目录
 * - `WorktreeHandoffInput`：切换输入参数
 * - `WorktreeHandoffPlan`：切换计划（已解析的完整参数）
 *
 * ## 使用场景
 *
 * - Composer 中通过命令切换 worktree
 * - "Thread Handoff" 对话框中用户选择目标 worktree
 * - 自动化任务中跨分支转移执行上下文
 *
 * ## 注意事项
 *
 * - 切换过程中线程会暂停执行
 * - 切换完成后线程在新 worktree 中继续运行
 * - worktree 名称必须符合 Git 分支命名规范
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

export function hasAssociatedWorktree(input: {
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
}): boolean {
  return Boolean(
    input.associatedWorktreePath ?? input.associatedWorktreeBranch ?? input.associatedWorktreeRef,
  );
}

export function resolveWorktreeHandoffIntent(input: {
  preferredNewWorktreeName?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
  preferredWorktreeBaseBranch?: string | null;
  currentBranch?: string | null;
}): WorktreeHandoffIntent | null {
  const normalizedWorktreeName = input.preferredNewWorktreeName?.trim() ?? "";
  const baseBranch = input.preferredWorktreeBaseBranch ?? input.currentBranch ?? null;

  if (normalizedWorktreeName.length > 0) {
    return {
      kind: "create-new",
      worktreeName: normalizedWorktreeName,
      baseBranch,
    };
  }

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
