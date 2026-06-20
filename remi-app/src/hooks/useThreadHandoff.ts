/**
 * @file useThreadHandoff.ts
 * @description 线程交接 Hook - 创建从一个提供商到另一个提供商的交接线�? * @module hooks/useThreadHandoff
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
 * 线程交接 Hook
 *
 * @description
 * 从当前活动的 Web 状态创建提供商到提供商的交接线程�? * 交接操作会将当前线程的消息、活动和配置复制到新线程中，
 * 并切换到目标提供商�? *
 * @returns 包含交接方法的对�? * @returns.createThreadHandoff - 创建交接线程的方�? *
 * @example
 * ```tsx
 * const { createThreadHandoff } = useThreadHandoff();
 *
 * // 将当前线程交接到 claude 提供�? * const newThreadId = await createThreadHandoff(currentThread, "claudeAgent");
 * ```
 */
export function useThreadHandoff() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const projects = useStore((store) => store.projects);
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const serverConfigQuery = useQuery(serverConfigQueryOptions());

  /**
   * 创建线程交接
   *
   * @description
   * 执行完整的线程交接流程：
   * 1. 验证源线程和目标提供商的可用�?   * 2. 构建导入的消息和活动
   * 3. 创建交接线程并复制状�?   * 4. 导航到新线程
   *
   * @param thread - 源线�?   * @param targetProvider - 目标提供�?   * @returns 新创建的线程 ID
   * @throws 当条件不满足时抛出错�?   */
  const createThreadHandoff = useCallback(
    async (thread: Thread, targetProvider: ProviderKind): Promise<Thread["id"]> => {
      const api = readNativeApi();
      if (!api) {
        throw new Error("Native API not found");
      }

      // 查找源线程所属的项目
      const project = projects.find((entry) => entry.id === thread.projectId);
      if (!project) {
        throw new Error("Project not found for handoff thread.");
      }

      // 验证源线程是否可以进行交�?      if (!canCreateThreadHandoff({ thread })) {
        throw new Error("This thread cannot be handed off yet.");
      }
      // 验证目标提供商是否可�?      if (
        !resolveAvailableHandoffTargetProviders(thread.modelSelection.provider).includes(
          targetProvider,
        )
      ) {
        throw new Error("This handoff target is not available for the current thread.");
      }
      // 检查目标提供商的可用性状�?      const targetStatus = normalizeProviderStatusForLocalConfig({
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
      // 构建要导入的消息和活�?      const importedMessages = buildThreadHandoffImportedMessages(thread);
      const importedActivities = buildThreadHandoffImportedActivities(thread);
      const { copyTransferableComposerState, stickyModelSelectionByProvider } =
        useComposerDraftStore.getState();

      // 创建交接线程
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

      // 逐个追加导入的活�?      for (const activity of importedActivities) {
        await api.orchestration.dispatchCommand({
          type: "thread.activity.append",
          commandId: newCommandId(),
          threadId: nextThreadId,
          activity,
          createdAt,
        });
      }

      // 复制可转移的编辑器状态到新线�?      copyTransferableComposerState(thread.id, nextThreadId);

      // 同步 Shell 快照并导航到新线�?      const snapshot = await api.orchestration.getShellSnapshot();
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
