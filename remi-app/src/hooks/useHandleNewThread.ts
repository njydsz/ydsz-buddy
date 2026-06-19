/**
 * @file useHandleNewThread.ts
 * @description 新建线程 Hook - 处理创建新线程的复杂逻辑
 * @module hooks/useHandleNewThread
 */

import { type ProjectId, ThreadId } from "@remi-code/contracts";
import { getDefaultModel } from "@remi-code/shared/model";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useAppSettings } from "../appSettings";
import {
  type ComposerThreadDraftState,
  type DraftThreadState,
  useComposerDraftStore,
} from "../composerDraftStore";
import {
  buildDraftThreadContextPatch,
  createActiveDraftThreadSnapshot,
  createActiveThreadSnapshot,
  createFreshDraftThreadSeed,
  resolveTerminalThreadCreationState,
  resolveThreadBootstrapPlan,
  type NewThreadOptions,
} from "../lib/threadBootstrap";
import { promoteThreadCreate } from "../lib/threadCreatePromotion";
import { newCommandId, newThreadId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useFocusedChatContext } from "../focusedChatContext";
import { useStore } from "../store";
import { useTemporaryThreadStore } from "../temporaryThreadStore";
import { useTerminalStateStore } from "../terminalStateStore";

/**
 * 新建线程 Hook
 *
 * @description
 * 处理创建新线程的复杂逻辑，包括：
 * - 复用已存储的草稿线程
 * - 复用当前活动的草稿线程
 * - 创建全新的线程
 * - 处理终端入口点 vs 聊天入口点
 * - 应用提供商和模型覆盖
 * - 导航到新线程
 *
 * @returns 包含线程创建方法和相关状态的对象
 *
 * @example
 * ```tsx
 * const { handleNewThread, activeThread, projects } = useHandleNewThread();
 *
 * const handleClick = async () => {
 *   await handleNewThread(projectId, { fresh: true });
 * };
 * ```
 */
export function useHandleNewThread() {
  const projects = useStore((store) => store.projects);
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const { activeDraftThread, activeProjectId, activeThread, focusedThreadId, routeThreadId } =
    useFocusedChatContext();
  const openChatThreadPage = useTerminalStateStore((store) => store.openChatThreadPage);
  const openTerminalThreadPage = useTerminalStateStore((store) => store.openTerminalThreadPage);
  const markTemporaryThread = useTemporaryThreadStore((store) => store.markTemporaryThread);

  const handleNewThread = useCallback(
    (projectId: ProjectId, options?: NewThreadOptions): Promise<void> => {
      const entryPoint = options?.entryPoint ?? "chat";
      const wantsTemporaryThread = options?.temporary === true;
      
      /**
       * 应用提供商覆盖
       * 如果指定了提供商，设置对应的默认模型
       */
      const applyProviderOverride = (threadId: ThreadId) => {
        if (!options?.provider) {
          return;
        }
        const defaultModel = getDefaultModel(options.provider);
        if (!defaultModel) {
          return;
        }
        setModelSelection(threadId, {
          provider: options.provider,
          model: defaultModel,
        });
      };
      
      /**
       * 恢复编辑器草稿状态
       */
      const restoreComposerDraft = (
        threadId: ThreadId,
        draftState: ComposerThreadDraftState | null,
      ) => {
        if (!draftState) {
          return;
        }
        useComposerDraftStore.setState((state) => {
          if (state.draftsByThreadId[threadId] === draftState) {
            return state;
          }
          return {
            draftsByThreadId: {
              ...state.draftsByThreadId,
              [threadId]: draftState,
            },
          };
        });
      };
      
      /**
       * 激活线程入口点
       * 根据入口点类型打开对应的页面
       */
      const activateThreadEntryPoint = (threadId: ThreadId) => {
        if (entryPoint === "terminal") {
          openTerminalThreadPage(threadId, { terminalOnly: true });
          return;
        }
        openChatThreadPage(threadId);
      };
      
      const {
        clearProjectDraftThreadId,
        getDraftThread,
        getDraftThreadByProjectId,
        applyStickyState,
        setDraftThreadContext,
        setProjectDraftThreadId,
        setModelSelection,
      } = useComposerDraftStore.getState();
      const shouldForceFreshThread = options?.fresh === true;

      // 强制创建新线程时，清除项目的草稿线程 ID
      if (shouldForceFreshThread) {
        clearProjectDraftThreadId(projectId, entryPoint);
      }

      // 获取已存储的草稿线程候选
      const storedDraftThreadCandidate = getDraftThreadByProjectId(projectId, entryPoint);
      // 获取当前活动的草稿线程候选
      const latestActiveDraftThreadCandidate: DraftThreadState | null = focusedThreadId
        ? getDraftThread(focusedThreadId)
        : null;
      
      // 确定使用哪个草稿线程
      const storedDraftThread =
        !shouldForceFreshThread &&
        !wantsTemporaryThread &&
        storedDraftThreadCandidate?.isTemporary !== true
          ? storedDraftThreadCandidate
          : null;
      const latestActiveDraftThread: DraftThreadState | null =
        !shouldForceFreshThread &&
        !wantsTemporaryThread &&
        latestActiveDraftThreadCandidate?.isTemporary !== true
          ? latestActiveDraftThreadCandidate
          : null;
      
      // 解析线程引导计划
      const bootstrapPlan = resolveThreadBootstrapPlan({
        storedDraftThread,
        latestActiveDraftThread,
        entryPoint,
        projectId,
        routeThreadId: focusedThreadId,
      });
      
      // 读取项目的默认模型选择
      const projectDefaultModelSelection =
        useStore.getState().projects.find((project) => project.id === projectId)
          ?.defaultModelSelection ?? null;
      const activeThreadSnapshot = createActiveThreadSnapshot(activeThread, projectId);
      const activeDraftThreadSnapshot = createActiveDraftThreadSnapshot(
        activeDraftThread,
        projectId,
      );
      
      /**
       * 解析终端线程创建状态
       */
      const resolveCreationState = (
        targetThreadId: ThreadId,
        draftThread: DraftThreadState | null,
        creationOptions: NewThreadOptions | undefined,
      ) =>
        resolveTerminalThreadCreationState({
          activeDraftThread: activeDraftThreadSnapshot,
          activeThread: activeThreadSnapshot,
          defaultProvider: options?.provider ?? settings.defaultProvider,
          draftComposerState:
            useComposerDraftStore.getState().draftsByThreadId[targetThreadId] ?? null,
          draftThread,
          options: creationOptions,
          projectDefaultModelSelection,
          projectId,
        });
      
      /**
       * 创建终端线程
       * 终端入口需要立即创建真实的编排线程
       */
      const createTerminalThread = async (
        threadId: ThreadId,
        creationState: ReturnType<typeof resolveCreationState>,
      ): Promise<void> => {
        const api = readNativeApi();
        if (!api) {
          return;
        }
        await promoteThreadCreate(
          {
            type: "thread.create",
            commandId: newCommandId(),
            threadId,
            projectId,
            title: "New terminal",
            modelSelection: creationState.modelSelection,
            runtimeMode: creationState.runtimeMode,
            interactionMode: creationState.interactionMode,
            envMode: creationState.envMode,
            branch: creationState.branch,
            worktreePath: creationState.worktreePath,
            lastKnownPr: creationState.lastKnownPr,
            createdAt: new Date().toISOString(),
          },
          api,
        );
      };
      
      // 情况 1：使用已存储的草稿线程
      if (bootstrapPlan.kind === "stored") {
        return (async () => {
          if (wantsTemporaryThread) {
            markTemporaryThread(bootstrapPlan.threadId);
          }
          const preservedComposerDraft =
            useComposerDraftStore.getState().draftsByThreadId[bootstrapPlan.threadId] ?? null;
          let resolvedStoredDraftThread: DraftThreadState | null = bootstrapPlan.draftThread;
          const shouldPreserveStoredTerminalContext =
            entryPoint === "terminal" && bootstrapPlan.draftThread.entryPoint === "terminal";
          const draftContextPatch = shouldPreserveStoredTerminalContext
            ? null
            : buildDraftThreadContextPatch(entryPoint, options);
          const creationOptions = shouldPreserveStoredTerminalContext ? undefined : options;
          if (draftContextPatch) {
            setDraftThreadContext(bootstrapPlan.threadId, draftContextPatch);
            resolvedStoredDraftThread = getDraftThread(bootstrapPlan.threadId);
          }
          applyProviderOverride(bootstrapPlan.threadId);
          setProjectDraftThreadId(projectId, bootstrapPlan.threadId, { entryPoint });
          restoreComposerDraft(bootstrapPlan.threadId, preservedComposerDraft);
          activateThreadEntryPoint(bootstrapPlan.threadId);
          if (focusedThreadId === bootstrapPlan.threadId) {
            if (entryPoint === "terminal") {
              await createTerminalThread(
                bootstrapPlan.threadId,
                resolveCreationState(
                  bootstrapPlan.threadId,
                  resolvedStoredDraftThread,
                  creationOptions,
                ),
              );
            }
            return;
          }
          await navigate({
            to: "/$threadId",
            params: { threadId: bootstrapPlan.threadId },
          });
          restoreComposerDraft(bootstrapPlan.threadId, preservedComposerDraft);
          if (entryPoint === "terminal") {
            await createTerminalThread(
              bootstrapPlan.threadId,
              resolveCreationState(
                bootstrapPlan.threadId,
                resolvedStoredDraftThread,
                creationOptions,
              ),
            );
          }
        })();
      }

      clearProjectDraftThreadId(projectId, entryPoint);

      // 情况 2：使用路由中的线程
      if (bootstrapPlan.kind === "route") {
        if (wantsTemporaryThread) {
          markTemporaryThread(bootstrapPlan.threadId);
        }
        const preservedComposerDraft =
          useComposerDraftStore.getState().draftsByThreadId[bootstrapPlan.threadId] ?? null;
        let resolvedActiveDraftThread: DraftThreadState | null = bootstrapPlan.draftThread;
        const draftContextPatch = buildDraftThreadContextPatch(entryPoint, options);
        if (draftContextPatch) {
          setDraftThreadContext(bootstrapPlan.threadId, draftContextPatch);
          resolvedActiveDraftThread = getDraftThread(bootstrapPlan.threadId);
        }
        applyProviderOverride(bootstrapPlan.threadId);
        setProjectDraftThreadId(projectId, bootstrapPlan.threadId, { entryPoint });
        restoreComposerDraft(bootstrapPlan.threadId, preservedComposerDraft);
        activateThreadEntryPoint(bootstrapPlan.threadId);
        if (entryPoint === "terminal") {
          return createTerminalThread(
            bootstrapPlan.threadId,
            resolveCreationState(bootstrapPlan.threadId, resolvedActiveDraftThread, options),
          );
        }
        return Promise.resolve();
      }

      // 情况 3：创建全新线程
      const threadId = newThreadId();
      if (wantsTemporaryThread) {
        markTemporaryThread(threadId);
      }
      const createdAt = new Date().toISOString();
      return (async () => {
        setProjectDraftThreadId(projectId, threadId, {
          ...createFreshDraftThreadSeed({
            createdAt,
            entryPoint,
            options,
          }),
        });
        activateThreadEntryPoint(threadId);
        applyStickyState(threadId);
        applyProviderOverride(threadId);

        await navigate({
          to: "/$threadId",
          params: { threadId },
        });
        if (entryPoint === "terminal") {
          await createTerminalThread(
            threadId,
            resolveCreationState(threadId, getDraftThread(threadId), options),
          );
        }
      })();
    },
    [
      activeDraftThread,
      activeThread,
      navigate,
      openChatThreadPage,
      openTerminalThreadPage,
      focusedThreadId,
      markTemporaryThread,
      settings.defaultProvider,
    ],
  );

  return {
    activeDraftThread,
    activeProjectId,
    activeThread,
    activeContextThreadId: focusedThreadId,
    handleNewThread,
    projects,
    routeThreadId,
  };
}
