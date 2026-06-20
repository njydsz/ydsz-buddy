/**
 * @file useThreadWorkspaceHandoff.ts
 * @description 绾跨▼宸ヤ綔鍖轰氦鎺?Hook - 澶勭悊绾跨▼鍦ㄦ湰鍦板拰宸ヤ綔鏍戜箣闂寸殑鍒囨崲
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
 * 绾跨▼宸ヤ綔鍖轰氦鎺?Hook
 *
 * @description
 * 澶勭悊绾跨▼鍦ㄦ湰鍦扮幆澧冿紙local锛夊拰宸ヤ綔鏍戠幆澧冿紙worktree锛変箣闂寸殑鍒囨崲銆? * 鏀寔锛? * - 鍒囨崲鍒版湰鍦版ā寮忥紙鐩存帴鍦ㄩ」鐩洰褰曞伐浣滐級
 * - 鍒囨崲鍒板伐浣滄爲妯″紡锛堝湪鐙珛鐨?git worktree 涓伐浣滐級
 * - 鑷姩妫€娴嬪彲澶嶇敤鐨勫叧鑱斿伐浣滄爲
 * - 宸ヤ綔鏍戝懡鍚嶅璇濇
 * - 浜ゆ帴鍚庤嚜鍔ㄦ墽琛岄」鐩缃剼鏈? *
 * @param input - 杈撳叆鍙傛暟瀵硅薄
 * @param input.activeProject - 褰撳墠娲诲姩椤圭洰
 * @param input.activeThread - 褰撳墠娲诲姩绾跨▼
 * @param input.activeRootBranch - 褰撳墠鏍瑰垎鏀? * @param input.activeThreadAssociatedWorktree - 绾跨▼鍏宠仈鐨勫伐浣滄爲淇℃伅
 * @param input.isServerThread - 鏄惁涓烘湇鍔″櫒绾跨▼
 * @param input.stopActiveThreadSession - 鍋滄褰撳墠绾跨▼浼氳瘽鐨勬柟娉? * @param input.runProjectScript - 杩愯椤圭洰鑴氭湰鐨勬柟娉? * @param input.setStoreThreadWorkspace - 璁剧疆绾跨▼宸ヤ綔鍖虹殑鏂规硶
 * @param input.syncServerShellSnapshot - 鍚屾 Shell 蹇収鐨勬柟娉? *
 * @returns 宸ヤ綔鍖轰氦鎺ョ浉鍏崇殑鐘舵€佸拰鏂规硶
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
   * 鎵ц宸ヤ綔鍖轰氦鎺?   *
   * @description
   * 鏍稿績浜ゆ帴閫昏緫锛?   * 1. 鍋滄褰撳墠绾跨▼浼氳瘽
   * 2. 鎵ц git 浜ゆ帴鎿嶄綔锛堝垏鎹㈠垎鏀?worktree锛?   * 3. 鏇存柊绾跨▼鍏冩暟鎹?   * 4. 鍚屾 Shell 蹇収
   * 5. 鍦ㄥ伐浣滄爲妯″紡涓嬫墽琛岄」鐩缃剼鏈?   *
   * @param targetMode - 鐩爣妯″紡锛?local" 鎴?"worktree"
   * @param options - 鍙€夊弬鏁帮紙棣栭€夊伐浣滄爲鍚嶇О锛?   * @returns 鏄惁浜ゆ帴鎴愬姛
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
        // 鍋滄褰撳墠绾跨▼浼氳瘽
        await input.stopActiveThreadSession();
        
        // 鎵ц git 浜ゆ帴鎿嶄綔
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

        // 鏋勫缓宸ヤ綔鍖鸿ˉ涓?        const workspacePatch = {
          envMode: result.targetMode,
          branch: result.branch,
          worktreePath: result.worktreePath,
          associatedWorktreePath: result.associatedWorktreePath,
          associatedWorktreeBranch: result.associatedWorktreeBranch,
          associatedWorktreeRef: result.associatedWorktreeRef,
          ...(targetMode === "worktree" ? { createBranchFlowCompleted: false } : {}),
        } as const;

        // 鏇存柊鏈嶅姟鍣ㄧ鐨勭嚎绋嬪厓鏁版嵁
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: input.activeThread.id,
          ...workspacePatch,
        });
        // 鏇存柊鏈湴瀛樺偍鐨勭嚎绋嬪伐浣滃尯淇℃伅
        input.setStoreThreadWorkspace(input.activeThread.id, workspacePatch);

        // 鍚屾 Shell 蹇収
        const snapshot = await api.orchestration.getShellSnapshot();
        input.syncServerShellSnapshot(snapshot);

        // 鍦ㄥ伐浣滄爲妯″紡涓嬫墽琛岄」鐩缃剼鏈?        if (targetMode === "worktree" && result.worktreePath) {
          const setupScript = setupProjectScript(input.activeProject.scripts);
          if (setupScript) {
            await input.runProjectScript(setupScript, {
              cwd: result.worktreePath,
              worktreePath: result.worktreePath,
              rememberAsLastInvoked: false,
            });
          }
        }

        // 鏄剧ず浜ゆ帴缁撴灉閫氱煡
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
   * 澶勭悊浜ゆ帴鍒板伐浣滄爲
   *
   * @description
   * 妫€鏌ユ槸鍚﹀彲浠ュ鐢ㄥ凡鏈夌殑鍏宠仈宸ヤ綔鏍戯細
   * - 濡傛灉鍙互澶嶇敤锛岀洿鎺ユ墽琛屼氦鎺?   * - 鍚﹀垯鎵撳紑鍛藉悕瀵硅瘽妗嗚鐢ㄦ埛杈撳叆宸ヤ綔鏍戝悕绉?   */
  const onHandoffToWorktree = useCallback(() => {
    if (!input.activeThread) {
      return;
    }

    // 瑙ｆ瀽宸ヤ綔鏍戜氦鎺ユ剰鍥?    const worktreeIntent = resolveWorktreeHandoffIntent({
      associatedWorktreePath: input.activeThreadAssociatedWorktree.associatedWorktreePath,
      associatedWorktreeBranch: input.activeThreadAssociatedWorktree.associatedWorktreeBranch,
      associatedWorktreeRef: input.activeThreadAssociatedWorktree.associatedWorktreeRef,
      preferredWorktreeBaseBranch: input.activeRootBranch,
      currentBranch: input.activeThread.branch ?? null,
    });
    
    // 濡傛灉鍙互澶嶇敤鍏宠仈宸ヤ綔鏍戯紝鐩存帴鎵ц浜ゆ帴
    if (worktreeIntent?.kind === "reuse-associated") {
      void handoffThread("worktree");
      return;
    }

    // 鍚﹀垯鎵撳紑鍛藉悕瀵硅瘽妗?    setWorktreeHandoffName(
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
   * 纭宸ヤ綔鏍戜氦鎺?   *
   * @description
   * 浣跨敤鐢ㄦ埛杈撳叆鐨勫伐浣滄爲鍚嶇О鎵ц浜ゆ帴
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
   * 澶勭悊浜ゆ帴鍒版湰鍦扮幆澧?   */
  const onHandoffToLocal = useCallback(async () => {
    await handoffThread("local");
  }, [handoffThread]);

  return {
    /** 浜ゆ帴鎿嶄綔鏄惁姝ｅ湪杩涜涓?*/
    handoffBusy: handoffThreadMutation.isPending,
    /** 宸ヤ綔鏍戜氦鎺ュ璇濇鏄惁鎵撳紑 */
    worktreeHandoffDialogOpen,
    /** 璁剧疆宸ヤ綔鏍戜氦鎺ュ璇濇鐨勬墦寮€鐘舵€?*/
    setWorktreeHandoffDialogOpen,
    /** 宸ヤ綔鏍戝悕绉?*/
    worktreeHandoffName,
    /** 璁剧疆宸ヤ綔鏍戝悕绉?*/
    setWorktreeHandoffName,
    /** 浜ゆ帴宸ヤ綔鏍戝鐞嗗嚱鏁?*/
    onHandoffToWorktree,
    /** 浜ゆ帴鏈湴澶勭悊鍑芥暟 */
    onHandoffToLocal,
    /** 纭宸ヤ綔鏍戜氦鎺?*/
    confirmWorktreeHandoff,
  };
}
