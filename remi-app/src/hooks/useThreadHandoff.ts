/**
 * @file useThreadHandoff.ts
 * @description 绾跨▼浜ゆ帴 Hook - 鍒涘缓浠庝竴涓彁渚涘晢鍒板彟涓€涓彁渚涘晢鐨勪氦鎺ョ嚎绋? * @module hooks/useThreadHandoff
 * @layer Web Hook
 */

import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { type ProviderKind } from "~/contracts";
import { getCustomBinaryPathForProvider, useAppSettings } from "../appSettings";
import { useComposerDraftStore } from "../composerDraftStore";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import {
  buildThreadHandoffImportedActivities,
  buildThreadHandoffImportedMessages,
  canCreateThreadHandoff,
  resolveAvailableHandoffTargetProviders,
  resolveThreadHandoffModelSelection,
  resolveThreadHandoffTitle,
} from "../lib/threadHandoff";
import {
  isProviderUsable,
  normalizeProviderStatusForLocalConfig,
} from "../lib/providerAvailability";
import { newCommandId, newThreadId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { type Thread } from "../types";

/**
 * 绾跨▼浜ゆ帴 Hook
 *
 * @description
 * 浠庡綋鍓嶆椿鍔ㄧ殑 Web 鐘舵€佸垱寤烘彁渚涘晢鍒版彁渚涘晢鐨勪氦鎺ョ嚎绋嬨€? * 浜ゆ帴鎿嶄綔浼氬皢褰撳墠绾跨▼鐨勬秷鎭€佹椿鍔ㄥ拰閰嶇疆澶嶅埗鍒版柊绾跨▼涓紝
 * 骞跺垏鎹㈠埌鐩爣鎻愪緵鍟嗐€? *
 * @returns 鍖呭惈浜ゆ帴鏂规硶鐨勫璞? * @returns.createThreadHandoff - 鍒涘缓浜ゆ帴绾跨▼鐨勬柟娉? *
 * @example
 * ```tsx
 * const { createThreadHandoff } = useThreadHandoff();
 *
 * // 灏嗗綋鍓嶇嚎绋嬩氦鎺ュ埌 claude 鎻愪緵鍟? * const newThreadId = await createThreadHandoff(currentThread, "claudeAgent");
 * ```
 */
export function useThreadHandoff() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const projects = useStore((store) => store.projects);
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const serverConfigQuery = useQuery(serverConfigQueryOptions());

  /**
   * 鍒涘缓绾跨▼浜ゆ帴
   *
   * @description
   * 鎵ц瀹屾暣鐨勭嚎绋嬩氦鎺ユ祦绋嬶細
   * 1. 楠岃瘉婧愮嚎绋嬪拰鐩爣鎻愪緵鍟嗙殑鍙敤鎬?   * 2. 鏋勫缓瀵煎叆鐨勬秷鎭拰娲诲姩
   * 3. 鍒涘缓浜ゆ帴绾跨▼骞跺鍒剁姸鎬?   * 4. 瀵艰埅鍒版柊绾跨▼
   *
   * @param thread - 婧愮嚎绋?   * @param targetProvider - 鐩爣鎻愪緵鍟?   * @returns 鏂板垱寤虹殑绾跨▼ ID
   * @throws 褰撴潯浠朵笉婊¤冻鏃舵姏鍑洪敊璇?   */
  const createThreadHandoff = useCallback(
    async (thread: Thread, targetProvider: ProviderKind): Promise<Thread["id"]> => {
      const api = readNativeApi();
      if (!api) {
        throw new Error("Native API not found");
      }

      // 鏌ユ壘婧愮嚎绋嬫墍灞炵殑椤圭洰
      const project = projects.find((entry) => entry.id === thread.projectId);
      if (!project) {
        throw new Error("Project not found for handoff thread.");
      }

      // 楠岃瘉婧愮嚎绋嬫槸鍚﹀彲浠ヨ繘琛屼氦鎺?      if (!canCreateThreadHandoff({ thread })) {
        throw new Error("This thread cannot be handed off yet.");
      }
      // 楠岃瘉鐩爣鎻愪緵鍟嗘槸鍚﹀彲鐢?      if (
        !resolveAvailableHandoffTargetProviders(thread.modelSelection.provider).includes(
          targetProvider,
        )
      ) {
        throw new Error("This handoff target is not available for the current thread.");
      }
      // 妫€鏌ョ洰鏍囨彁渚涘晢鐨勫彲鐢ㄦ€х姸鎬?      const targetStatus = normalizeProviderStatusForLocalConfig({
        provider: targetProvider,
        status:
          serverConfigQuery.data?.providers.find((entry) => entry.provider === targetProvider) ??
          null,
        customBinaryPath: getCustomBinaryPathForProvider(settings, targetProvider),
      });
      if (!isProviderUsable(targetStatus)) {
        throw new Error("This provider is not available yet.");
      }

      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      // 鏋勫缓瑕佸鍏ョ殑娑堟伅鍜屾椿鍔?      const importedMessages = buildThreadHandoffImportedMessages(thread);
      const importedActivities = buildThreadHandoffImportedActivities(thread);
      const { copyTransferableComposerState, stickyModelSelectionByProvider } =
        useComposerDraftStore.getState();

      // 鍒涘缓浜ゆ帴绾跨▼
      await api.orchestration.dispatchCommand({
        type: "thread.handoff.create",
        commandId: newCommandId(),
        threadId: nextThreadId,
        sourceThreadId: thread.id,
        projectId: thread.projectId,
        title: resolveThreadHandoffTitle(thread),
        modelSelection: resolveThreadHandoffModelSelection({
          sourceThread: thread,
          targetProvider,
          projectDefaultModelSelection: project.defaultModelSelection,
          stickyModelSelectionByProvider,
        }),
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        envMode: thread.envMode ?? (thread.worktreePath ? "worktree" : "local"),
        branch: thread.branch,
        worktreePath: thread.worktreePath,
        associatedWorktreePath: thread.associatedWorktreePath ?? thread.worktreePath ?? null,
        associatedWorktreeBranch: thread.associatedWorktreeBranch ?? thread.branch ?? null,
        associatedWorktreeRef:
          thread.associatedWorktreeRef ?? thread.associatedWorktreeBranch ?? thread.branch ?? null,
        createBranchFlowCompleted: thread.createBranchFlowCompleted ?? false,
        importedMessages: [...importedMessages],
        createdAt,
      });

      // 閫愪釜杩藉姞瀵煎叆鐨勬椿鍔?      for (const activity of importedActivities) {
        await api.orchestration.dispatchCommand({
          type: "thread.activity.append",
          commandId: newCommandId(),
          threadId: nextThreadId,
          activity,
          createdAt,
        });
      }

      // 澶嶅埗鍙浆绉荤殑缂栬緫鍣ㄧ姸鎬佸埌鏂扮嚎绋?      copyTransferableComposerState(thread.id, nextThreadId);

      // 鍚屾 Shell 蹇収骞跺鑸埌鏂扮嚎绋?      const snapshot = await api.orchestration.getShellSnapshot();
      syncServerShellSnapshot(snapshot);
      await navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
      });

      return nextThreadId;
    },
    [navigate, projects, serverConfigQuery.data?.providers, settings, syncServerShellSnapshot],
  );

  return {
    createThreadHandoff,
  };
}
