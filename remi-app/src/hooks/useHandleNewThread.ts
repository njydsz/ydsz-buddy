/**
 * @file useHandleNewThread.ts
 * @description 鏂板缓绾跨▼ Hook - 澶勭悊鍒涘缓鏂扮嚎绋嬬殑澶嶆潅閫昏緫
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
 * 鏂板缓绾跨▼ Hook
 *
 * @description
 * 澶勭悊鍒涘缓鏂扮嚎绋嬬殑澶嶆潅閫昏緫锛屽寘鎷細
 * - 澶嶇敤宸插瓨鍌ㄧ殑鑽夌ǹ绾跨▼
 * - 澶嶇敤褰撳墠娲诲姩鐨勮崏绋跨嚎绋? * - 鍒涘缓鍏ㄦ柊鐨勭嚎绋? * - 澶勭悊缁堢鍏ュ彛鐐?vs 鑱婂ぉ鍏ュ彛鐐? * - 搴旂敤鎻愪緵鍟嗗拰妯″瀷瑕嗙洊
 * - 瀵艰埅鍒版柊绾跨▼
 *
 * @returns 鍖呭惈绾跨▼鍒涘缓鏂规硶鍜岀浉鍏崇姸鎬佺殑瀵硅薄
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
       * 搴旂敤鎻愪緵鍟嗚鐩?       * 濡傛灉鎸囧畾浜嗘彁渚涘晢锛岃缃搴旂殑榛樿妯″瀷
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
       * 鎭㈠缂栬緫鍣ㄨ崏绋跨姸鎬?       */
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
       * 婵€娲荤嚎绋嬪叆鍙ｇ偣
       * 鏍规嵁鍏ュ彛鐐圭被鍨嬫墦寮€瀵瑰簲鐨勯〉闈?       */
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

      // 寮哄埗鍒涘缓鏂扮嚎绋嬫椂锛屾竻闄ら」鐩殑鑽夌ǹ绾跨▼ ID
      if (shouldForceFreshThread) {
        clearProjectDraftThreadId(projectId, entryPoint);
      }

      // 鑾峰彇宸插瓨鍌ㄧ殑鑽夌ǹ绾跨▼鍊欓€?      const storedDraftThreadCandidate = getDraftThreadByProjectId(projectId, entryPoint);
      // 鑾峰彇褰撳墠娲诲姩鐨勮崏绋跨嚎绋嬪€欓€?      const latestActiveDraftThreadCandidate: DraftThreadState | null = focusedThreadId
        ? getDraftThread(focusedThreadId)
        : null;
      
      // 纭畾浣跨敤鍝釜鑽夌ǹ绾跨▼
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
      
      // 瑙ｆ瀽绾跨▼寮曞璁″垝
      const bootstrapPlan = resolveThreadBootstrapPlan({
        storedDraftThread,
        latestActiveDraftThread,
        entryPoint,
        projectId,
        routeThreadId: focusedThreadId,
      });
      
      // 璇诲彇椤圭洰鐨勯粯璁ゆā鍨嬮€夋嫨
      const projectDefaultModelSelection =
        useStore.getState().projects.find((project) => project.id === projectId)
          ?.defaultModelSelection ?? null;
      const activeThreadSnapshot = createActiveThreadSnapshot(activeThread, projectId);
      const activeDraftThreadSnapshot = createActiveDraftThreadSnapshot(
        activeDraftThread,
        projectId,
      );
      
      /**
       * 瑙ｆ瀽缁堢绾跨▼鍒涘缓鐘舵€?       */
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
       * 鍒涘缓缁堢绾跨▼
       * 缁堢鍏ュ彛闇€瑕佺珛鍗冲垱寤虹湡瀹炵殑缂栨帓绾跨▼
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
      
      // 鎯呭喌 1锛氫娇鐢ㄥ凡瀛樺偍鐨勮崏绋跨嚎绋?      if (bootstrapPlan.kind === "stored") {
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

      // 鎯呭喌 2锛氫娇鐢ㄨ矾鐢变腑鐨勭嚎绋?      if (bootstrapPlan.kind === "route") {
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

      // 鎯呭喌 3锛氬垱寤哄叏鏂扮嚎绋?      const threadId = newThreadId();
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
