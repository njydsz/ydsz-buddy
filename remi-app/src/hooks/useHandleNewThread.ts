/**
 * @file useHandleNewThread.ts
 * @description æ–°å»ºçº¿ç¨‹ Hook - å¤„ç†åˆ›å»ºæ–°çº¿ç¨‹çš„å¤æ‚é€»è¾‘
 * @module hooks/useHandleNewThread
 */

import { type ProjectId, ThreadId } from "~/contracts";
import { getDefaultModel } from "~/shared/model";
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
 * æ–°å»ºçº¿ç¨‹ Hook
 *
 * @description
 * å¤„ç†åˆ›å»ºæ–°çº¿ç¨‹çš„å¤æ‚é€»è¾‘ï¼ŒåŒ…æ‹¬ï¼š
 * - å¤ç”¨å·²å­˜å‚¨çš„è‰ç¨¿çº¿ç¨‹
 * - å¤ç”¨å½“å‰æ´»åŠ¨çš„è‰ç¨¿çº¿ç¨‹
 * - åˆ›å»ºå…¨æ–°çš„çº¿ç¨‹
 * - å¤„ç†ç»ˆç«¯å…¥å£ç‚¹ vs èŠå¤©å…¥å£ç‚¹ * - åº”ç”¨æä¾›å•†å’Œæ¨¡åž‹è¦†ç›–
 * - å¯¼èˆªåˆ°æ–°çº¿ç¨‹
 *
 * @returns åŒ…å«çº¿ç¨‹åˆ›å»ºæ–¹æ³•å’Œç›¸å…³çŠ¶æ€çš„å¯¹è±¡
 * @returns.activeDraftThread - å½“å‰æ´»åŠ¨çš„è‰ç¨¿çº¿ç¨‹çŠ¶æ€
 * @returns.activeProjectId - å½“å‰æ´»åŠ¨é¡¹ç›® ID
 * @returns.activeThread - å½“å‰æ´»åŠ¨çº¿ç¨‹å¯¹è±¡
 * @returns.activeContextThreadId - å½“å‰èšç„¦ä¸Šä¸‹æ–‡çš„çº¿ç¨‹ ID
 * @returns.handleNewThread - åˆ›å»ºæ–°çº¿ç¨‹çš„æ ¸å¿ƒæ–¹æ³•ï¼ŒæŽ¥å—é¡¹ç›® ID å’Œå¯é€‰é…ç½®
 * @returns.projects - æ‰€æœ‰é¡¹ç›®åˆ—è¡¨
 * @returns.routeThreadId - å½“å‰è·¯ç”±ä¸­çš„çº¿ç¨‹ ID
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
       * åº”ç”¨æä¾›å•†è¦†ï¿½?       * å¦‚æžœæŒ‡å®šäº†æä¾›å•†ï¼Œè®¾ç½®å¯¹åº”çš„é»˜è®¤æ¨¡åž‹
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
       * æ¢å¤ç¼–è¾‘å™¨è‰ç¨¿çŠ¶ï¿½?       */
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
       * æ¿€æ´»çº¿ç¨‹å…¥å£ç‚¹
       * æ ¹æ®å…¥å£ç‚¹ç±»åž‹æ‰“å¼€å¯¹åº”çš„é¡µï¿½?       */
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

      // å¼ºåˆ¶åˆ›å»ºæ–°çº¿ç¨‹æ—¶ï¼Œæ¸…é™¤é¡¹ç›®çš„è‰ç¨¿çº¿ç¨‹ ID
      if (shouldForceFreshThread) {
        clearProjectDraftThreadId(projectId, entryPoint);
      }

      // èŽ·å–å·²å­˜å‚¨çš„è‰ç¨¿çº¿ç¨‹å€™ï¿½?      const storedDraftThreadCandidate = getDraftThreadByProjectId(projectId, entryPoint);
      // èŽ·å–å½“å‰æ´»åŠ¨çš„è‰ç¨¿çº¿ç¨‹å€™ï¿½?      const latestActiveDraftThreadCandidate: DraftThreadState | null = focusedThreadId
        ? getDraftThread(focusedThreadId)
        : null;
      
      // ç¡®å®šä½¿ç”¨å“ªä¸ªè‰ç¨¿çº¿ç¨‹
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
      
      // è§£æžçº¿ç¨‹å¼•å¯¼è®¡åˆ’
      const bootstrapPlan = resolveThreadBootstrapPlan({
        storedDraftThread,
        latestActiveDraftThread,
        entryPoint,
        projectId,
        routeThreadId: focusedThreadId,
      });
      
      // è¯»å–é¡¹ç›®çš„é»˜è®¤æ¨¡åž‹é€‰æ‹©
      const projectDefaultModelSelection =
        useStore.getState().projects.find((project) => project.id === projectId)
          ?.defaultModelSelection ?? null;
      const activeThreadSnapshot = createActiveThreadSnapshot(activeThread, projectId);
      const activeDraftThreadSnapshot = createActiveDraftThreadSnapshot(
        activeDraftThread,
        projectId,
      );
      
      /**
       * è§£æžç»ˆç«¯çº¿ç¨‹åˆ›å»ºçŠ¶ï¿½?       */
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
       * åˆ›å»ºç»ˆç«¯çº¿ç¨‹
       * ç»ˆç«¯å…¥å£éœ€è¦ç«‹å³åˆ›å»ºçœŸå®žçš„ç¼–æŽ’çº¿ç¨‹
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
      
      // æƒ…å†µ 1ï¼šä½¿ç”¨å·²å­˜å‚¨çš„è‰ç¨¿çº¿ï¿½?      if (bootstrapPlan.kind === "stored") {
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

      // æƒ…å†µ 2ï¼šä½¿ç”¨è·¯ç”±ä¸­çš„çº¿ï¿½?      if (bootstrapPlan.kind === "route") {
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

      // æƒ…å†µ 3ï¼šåˆ›å»ºå…¨æ–°çº¿ç¨‹      const threadId = newThreadId();
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
