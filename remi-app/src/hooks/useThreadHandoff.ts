/**
 * @file useThreadHandoff.ts
 * @description 缁捐法鈻兼禍銈嗗复 Hook - 閸掓稑缂撴禒搴濈娑擃亝褰佹笟娑樻櫌閸掓澘褰熸稉鈧稉顏呭絹娓氭稑鏅㈤惃鍕唉閹恒儳鍤庣粙? * @module hooks/useThreadHandoff
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
 * 缁捐法鈻兼禍銈嗗复 Hook
 *
 * @description
 * 娴犲骸缍嬮崜宥嗘た閸斻劎娈?Web 閻樿埖鈧礁鍨卞鐑樺絹娓氭稑鏅㈤崚鐗堝絹娓氭稑鏅㈤惃鍕唉閹恒儳鍤庣粙瀣ㄢ偓? * 娴溿倖甯撮幙宥勭稊娴兼艾鐨㈣ぐ鎾冲缁捐法鈻奸惃鍕Х閹垬鈧焦妞块崝銊ユ嫲闁板秶鐤嗘径宥呭煑閸掔増鏌婄痪璺ㄢ柤娑擃叏绱? * 楠炶泛鍨忛幑銏犲煂閻╊喗鐖ｉ幓鎰返閸熷棎鈧? *
 * @returns 閸栧懎鎯堟禍銈嗗复閺傝纭堕惃鍕嚠鐠? * @returns.createThreadHandoff - 閸掓稑缂撴禍銈嗗复缁捐法鈻奸惃鍕煙濞? *
 * @example
 * ```tsx
 * const { createThreadHandoff } = useThreadHandoff();
 *
 * // 鐏忓棗缍嬮崜宥囧殠缁嬪姘﹂幒銉ュ煂 claude 閹绘劒绶甸崯? * const newThreadId = await createThreadHandoff(currentThread, "claudeAgent");
 * ```
 */
export function useThreadHandoff() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const projects = useStore((store) => store.projects);
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const serverConfigQuery = useQuery(serverConfigQueryOptions());

  /**
   * 閸掓稑缂撶痪璺ㄢ柤娴溿倖甯?   *
   * @description
   * 閹笛嗩攽鐎瑰本鏆ｉ惃鍕殠缁嬪姘﹂幒銉︾ウ缁嬪绱?   * 1. 妤犲矁鐦夊┃鎰殠缁嬪鎷伴惄顔界垼閹绘劒绶甸崯鍡欐畱閸欘垳鏁ら幀?   * 2. 閺嬪嫬缂撶€电厧鍙嗛惃鍕Х閹垰鎷板ú璇插З
   * 3. 閸掓稑缂撴禍銈嗗复缁捐法鈻奸獮璺侯槻閸掑墎濮搁幀?   * 4. 鐎佃壈鍩呴崚鐗堟煀缁捐法鈻?   *
   * @param thread - 濠ф劗鍤庣粙?   * @param targetProvider - 閻╊喗鐖ｉ幓鎰返閸?   * @returns 閺傛澘鍨卞铏规畱缁捐法鈻?ID
   * @throws 瑜版挻娼禒鏈电瑝濠娐ゅ喕閺冭埖濮忛崙娲晩鐠?   */
  const createThreadHandoff = useCallback(
    async (thread: Thread, targetProvider: ProviderKind): Promise<Thread["id"]> => {
      const api = readNativeApi();
      if (!api) {
        throw new Error("Native API not found");
      }

      // 閺屻儲澹樺┃鎰殠缁嬪澧嶇仦鐐垫畱妞ゅ湱娲?      const project = projects.find((entry) => entry.id === thread.projectId);
      if (!project) {
        throw new Error("Project not found for handoff thread.");
      }

      // 妤犲矁鐦夊┃鎰殠缁嬪妲搁崥锕€褰叉禒銉ㄧ箻鐞涘奔姘﹂幒?      if (!canCreateThreadHandoff({ thread })) {
        throw new Error("This thread cannot be handed off yet.");
      }
      // 妤犲矁鐦夐惄顔界垼閹绘劒绶甸崯鍡樻Ц閸氾箑褰查悽?      if (
        !resolveAvailableHandoffTargetProviders(thread.modelSelection.provider).includes(
          targetProvider,
        )
      ) {
        throw new Error("This handoff target is not available for the current thread.");
      }
      // 濡偓閺屻儳娲伴弽鍥ㄥ絹娓氭稑鏅㈤惃鍕讲閻劍鈧呭Ц閹?      const targetStatus = normalizeProviderStatusForLocalConfig({
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
      // 閺嬪嫬缂撶憰浣割嚤閸忋儳娈戝☉鍫熶紖閸滃本妞块崝?      const importedMessages = buildThreadHandoffImportedMessages(thread);
      const importedActivities = buildThreadHandoffImportedActivities(thread);
      const { copyTransferableComposerState, stickyModelSelectionByProvider } =
        useComposerDraftStore.getState();

      // 閸掓稑缂撴禍銈嗗复缁捐法鈻?      await api.orchestration.dispatchCommand({
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

      // 闁劒閲滄潻钘夊鐎电厧鍙嗛惃鍕た閸?      for (const activity of importedActivities) {
        await api.orchestration.dispatchCommand({
          type: "thread.activity.append",
          commandId: newCommandId(),
          threadId: nextThreadId,
          activity,
          createdAt,
        });
      }

      // 婢跺秴鍩楅崣顖濇祮缁夎崵娈戠紓鏍帆閸ｃ劎濮搁幀浣稿煂閺傛壆鍤庣粙?      copyTransferableComposerState(thread.id, nextThreadId);

      // 閸氬本顒?Shell 韫囶偆鍙庨獮璺侯嚤閼割亜鍩岄弬鎵殠缁?      const snapshot = await api.orchestration.getShellSnapshot();
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
