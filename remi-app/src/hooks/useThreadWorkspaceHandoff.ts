/**
 * @file useThreadWorkspaceHandoff.ts
 * @description 线程工作区交�?Hook - 处理线程在本地和工作树之间的切换
 * @module hooks/useThreadWorkspaceHandoff
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OrchestrationShellSnapshot, ThreadId } from "~/contracts";
import { resolveWorktreeHandoffIntent } from "~/shared/worktreeHandoff";
import { useCallback, useState } from "react";
import { gitHandoffThreadMutationOptions } from "~/lib/gitReactQuery";
import { buildSuggestedWorktreeName } from "../components/ChatView.logic";
import { toastManager } from "../components/ui/toast";
import { newCommandId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { setupProjectScript } from "../projectScripts";
import type { Project, ProjectScript, Thread, ThreadWorkspacePatch } from "../types";

/**
 * 线程工作区交�?Hook
 *
 * @description
 * 处理线程在本地环境（local）和工作树环境（worktree）之间的切换�? * 支持�? * - 切换到本地模式（直接在项目目录工作）
 * - 切换到工作树模式（在独立�?git worktree 中工作）
 * - 自动检测可复用的关联工作树
 * - 工作树命名对话框
 * - 交接后自动执行项目设置脚�? *
 * @param input - 输入参数对象
 * @param input.activeProject - 当前活动项目
 * @param input.activeThread - 当前活动线程
 * @param input.activeRootBranch - 当前根分�? * @param input.activeThreadAssociatedWorktree - 线程关联的工作树信息
 * @param input.isServerThread - 是否为服务器线程
 * @param input.stopActiveThreadSession - 停止当前线程会话的方�? * @param input.runProjectScript - 运行项目脚本的方�? * @param input.setStoreThreadWorkspace - 设置线程工作区的方法
 * @param input.syncServerShellSnapshot - 同步 Shell 快照的方�? *
 * @returns 工作区交接相关的状态和方法
 *
 * @example
 * ```tsx
 * const {
 *   onHandoffToWorktree,
 *   onHandoffToLocal,
 *   handoffBusy,
 *   worktreeHandoffDialogOpen,
 * } = useThreadWorkspaceHandoff({ ... });
 * ```
 */
export function useThreadWorkspaceHandoff(input: {
  activeProject: Project | undefined;
  activeThread: Thread | undefined;
  activeRootBranch: string | null;
  activeThreadAssociatedWorktree: {
    associatedWorktreePath: string | null;
    associatedWorktreeBranch: string | null;
    associatedWorktreeRef: string | null;
  };
  isServerThread: boolean;
  stopActiveThreadSession: () => Promise<void>;
  runProjectScript: (
    script: ProjectScript,
    options?: {
      cwd?: string;
      worktreePath?: string | null;
      rememberAsLastInvoked?: boolean;
      env?: Record<string, string>;
    },
  ) => Promise<void>;
  setStoreThreadWorkspace: (threadId: ThreadId, patch: ThreadWorkspacePatch) => void;
  syncServerShellSnapshot: (snapshot: OrchestrationShellSnapshot) => void;
}) {
  const queryClient = useQueryClient();
  const handoffThreadMutation = useMutation(
    gitHandoffThreadMutationOptions({ cwd: input.activeProject?.cwd ?? null, queryClient }),
  );
  const [worktreeHandoffDialogOpen, setWorktreeHandoffDialogOpen] = useState(false);
  const [worktreeHandoffName, setWorktreeHandoffName] = useState("");

  /**
   * 执行工作区交�?   *
   * @description
   * 核心交接逻辑�?   * 1. 停止当前线程会话
   * 2. 执行 git 交接操作（切换分�?worktree�?   * 3. 更新线程元数�?   * 4. 同步 Shell 快照
   * 5. 在工作树模式下执行项目设置脚�?   *
   * @param targetMode - 目标模式�?local" �?"worktree"
   * @param options - 可选参数（首选工作树名称�?   * @returns 是否交接成功
   */
  const handoffThread = useCallback(
    async (targetMode: "local" | "worktree", options?: { preferredWorktreeName?: string }) => {
      const api = readNativeApi();
      if (
        !api ||
        !input.activeProject ||
        !input.activeThread ||
        !input.isServerThread ||
        handoffThreadMutation.isPending
      ) {
        return false;
      }

      try {
        // 停止当前线程会话
        await input.stopActiveThreadSession();
        
        // 执行 git 交接操作
        const result = await handoffThreadMutation.mutateAsync({
          targetMode,
          currentBranch: input.activeThread.branch ?? null,
          worktreePath: input.activeThread.worktreePath ?? null,
          associatedWorktreePath: input.activeThreadAssociatedWorktree.associatedWorktreePath,
          associatedWorktreeBranch: input.activeThreadAssociatedWorktree.associatedWorktreeBranch,
          associatedWorktreeRef: input.activeThreadAssociatedWorktree.associatedWorktreeRef,
          preferredLocalBranch: input.activeRootBranch ?? input.activeThread.branch ?? null,
          preferredWorktreeBaseBranch:
            input.activeRootBranch ??
            input.activeThreadAssociatedWorktree.associatedWorktreeBranch ??
            input.activeThread.branch ??
            null,
          preferredNewWorktreeName: options?.preferredWorktreeName ?? null,
        });

        // 构建工作区补�?        const workspacePatch = {
          envMode: result.targetMode,
          branch: result.branch,
          worktreePath: result.worktreePath,
          associatedWorktreePath: result.associatedWorktreePath,
          associatedWorktreeBranch: result.associatedWorktreeBranch,
          associatedWorktreeRef: result.associatedWorktreeRef,
          ...(targetMode === "worktree" ? { createBranchFlowCompleted: false } : {}),
        } as const;

        // 更新服务器端的线程元数据
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: input.activeThread.id,
          ...workspacePatch,
        });
        // 更新本地存储的线程工作区信息
        input.setStoreThreadWorkspace(input.activeThread.id, workspacePatch);

        // 同步 Shell 快照
        const snapshot = await api.orchestration.getShellSnapshot();
        input.syncServerShellSnapshot(snapshot);

        // 在工作树模式下执行项目设置脚�?        if (targetMode === "worktree" && result.worktreePath) {
          const setupScript = setupProjectScript(input.activeProject.scripts);
          if (setupScript) {
            await input.runProjectScript(setupScript, {
              cwd: result.worktreePath,
              worktreePath: result.worktreePath,
              rememberAsLastInvoked: false,
            });
          }
        }

        // 显示交接结果通知
        toastManager.add({
          type: result.conflictsDetected ? "warning" : "success",
          title:
            targetMode === "worktree"
              ? "Thread handed off to worktree"
              : "Thread handed off to local",
          ...(result.message ? { description: result.message } : {}),
        });
        return true;
      } catch (error) {
        toastManager.add({
          type: "error",
          title:
            targetMode === "worktree"
              ? "Could not hand off to worktree"
              : "Could not hand off to local",
          description:
            error instanceof Error ? error.message : "An error occurred during the handoff.",
        });
        return false;
      }
    },
    [handoffThreadMutation, input],
  );

  /**
   * 处理交接到工作树
   *
   * @description
   * 检查是否可以复用已有的关联工作树：
   * - 如果可以复用，直接执行交�?   * - 否则打开命名对话框让用户输入工作树名�?   */
  const onHandoffToWorktree = useCallback(() => {
    if (!input.activeThread) {
      return;
    }

    // 解析工作树交接意�?    const worktreeIntent = resolveWorktreeHandoffIntent({
      associatedWorktreePath: input.activeThreadAssociatedWorktree.associatedWorktreePath,
      associatedWorktreeBranch: input.activeThreadAssociatedWorktree.associatedWorktreeBranch,
      associatedWorktreeRef: input.activeThreadAssociatedWorktree.associatedWorktreeRef,
      preferredWorktreeBaseBranch: input.activeRootBranch,
      currentBranch: input.activeThread.branch ?? null,
    });
    
    // 如果可以复用关联工作树，直接执行交接
    if (worktreeIntent?.kind === "reuse-associated") {
      void handoffThread("worktree");
      return;
    }

    // 否则打开命名对话�?    setWorktreeHandoffName(
      buildSuggestedWorktreeName({
        associatedWorktreeBranch:
          input.activeThreadAssociatedWorktree.associatedWorktreeBranch ??
          input.activeThread.branch ??
          null,
        title: input.activeThread.title,
      }),
    );
    setWorktreeHandoffDialogOpen(true);
  }, [handoffThread, input]);

  /**
   * 确认工作树交�?   *
   * @description
   * 使用用户输入的工作树名称执行交接
   */
  const confirmWorktreeHandoff = useCallback(async () => {
    const normalizedWorktreeName = buildSuggestedWorktreeName({
      associatedWorktreeBranch: worktreeHandoffName,
    });
    setWorktreeHandoffName(normalizedWorktreeName);
    const succeeded = await handoffThread("worktree", {
      preferredWorktreeName: normalizedWorktreeName,
    });
    if (succeeded) {
      setWorktreeHandoffDialogOpen(false);
    }
  }, [handoffThread, worktreeHandoffName]);

  /**
   * 处理交接到本地环�?   */
  const onHandoffToLocal = useCallback(async () => {
    await handoffThread("local");
  }, [handoffThread]);

  return {
    /** 交接操作是否正在进行�?*/
    handoffBusy: handoffThreadMutation.isPending,
    /** 工作树交接对话框是否打开 */
    worktreeHandoffDialogOpen,
    /** 设置工作树交接对话框的打开状�?*/
    setWorktreeHandoffDialogOpen,
    /** 工作树名�?*/
    worktreeHandoffName,
    /** 设置工作树名�?*/
    setWorktreeHandoffName,
    /** 交接工作树处理函�?*/
    onHandoffToWorktree,
    /** 交接本地处理函数 */
    onHandoffToLocal,
    /** 确认工作树交�?*/
    confirmWorktreeHandoff,
  };
}
