/**
 * @file useThreadHandoff.ts
 * @description 线程交接 Hook - 从当前 web 状态创建 Provider 到 Provider 的线程交接
 * @module hooks/useThreadHandoff
 * @layer Web Hook
 */

import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { type ProviderKind } from "@ydsz-buddy/contracts";
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
 * 提供线程交接功能，允许用户将当前线程移交给其他 Provider。
 * 处理交接前的验证、消息迁移、Composer 状态复制等完整流程。
 *
 * @returns 包含 createThreadHandoff 方法的对象
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
   * 将指定线程移交给目标 Provider，包括：
   * - 验证交接条件（线程状态、Provider 可用性）
   * - 迁移消息和活动记录
   * - 复制 Composer 状态
   * - 更新服务器 Shell 快照
   * - 导航到新线程
   *
   * @param thread - 源线程
   * @param targetProvider - 目标 Provider 类型
   * @returns 新线程的 ID
   * @throws 如果 Native API 不可用、项目未找到、线程不可交接或目标 Provider 不可用
   */
  const createThreadHandoff = useCallback(
    async (thread: Thread, targetProvider: ProviderKind): Promise<Thread["id"]> => {
      const api = readNativeApi();
      if (!api) {
        throw new Error("Native API not found");
      }

      const project = projects.find((entry) => entry.id === thread.projectId);
      if (!project) {
        throw new Error("Project not found for handoff thread.");
      }

      // 验证线程是否可以交接
      if (!canCreateThreadHandoff({ thread })) {
        throw new Error("This thread cannot be handed off yet.");
      }

      // 验证目标 Provider 是否可用
      if (
        !resolveAvailableHandoffTargetProviders(thread.modelSelection.provider).includes(
          targetProvider,
        )
      ) {
        throw new Error("This handoff target is not available for the current thread.");
      }

      // 检查目标 Provider 状态
      const targetStatus = normalizeProviderStatusForLocalConfig({
        provider: targetProvider,
        status:
          serverConfigQuery.data?.providers.find((entry) => entry.provider === targetProvider) ??
          null,
        customBinaryPath: getCustomBinaryPathForProvider(settings, targetProvider),
      });
      if (!isProviderUsable(targetStatus)) {
        throw new Error("This provider is not available yet.");
      }

      // 生成新线程 ID 和时间戳
      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();

      // 构建迁移的消息和活动
      const importedMessages = buildThreadHandoffImportedMessages(thread);
      const importedActivities = buildThreadHandoffImportedActivities(thread);

      // 获取 Composer 状态
      const { copyTransferableComposerState, stickyModelSelectionByProvider } =
        useComposerDraftStore.getState();

      // 创建交接后的新线程
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

      // 迁移活动记录
      for (const activity of importedActivities) {
        await api.orchestration.dispatchCommand({
          type: "thread.activity.append",
          commandId: newCommandId(),
          threadId: nextThreadId,
          activity,
          createdAt,
        });
      }

      // 复制 Composer 状态到新线程
      copyTransferableComposerState(thread.id, nextThreadId);

      // 更新服务器 Shell 快照
      const snapshot = await api.orchestration.getShellSnapshot();
      syncServerShellSnapshot(snapshot);

      // 导航到新线程
      await navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
      });

      return nextThreadId;
    },
    [navigate, projects, serverConfigQuery.data?.providers, settings, syncServerShellSnapshot],
  );

  return {
    /** 创建线程交接 */
    createThreadHandoff,
  };
}
