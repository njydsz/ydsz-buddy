/**
 * @file useHandleNewThread.ts
 * @description 闁哄倹婢樼紓鎾剁棯鐠恒劉鏌?Hook - 濠㈣泛瀚幃濠囧礆濞戞绱﹂柡鍌涘閸ゅ海绮欑€ｎ剚鐣卞璺虹У濞煎懘鏌呴弰蹇曞竼
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
 * 闁哄倹婢樼紓鎾剁棯鐠恒劉鏌?Hook
 *
 * @description
 * 濠㈣泛瀚幃濠囧礆濞戞绱﹂柡鍌涘閸ゅ海绮欑€ｎ剚鐣卞璺虹У濞煎懘鏌呴弰蹇曞竼闁挎稑鑻€垫﹢骞忛濠勭獥
 * - 濠㈣泛绉堕弫銈咁啅閹绘帞鎽犻柛灞诲妿濞堟垿鎳℃径灞掑湱鐥捄銊㈡煠
 * - 濠㈣泛绉堕弫銈堛亹閹惧啿顤呮繛鑼额嚙婵晠鎯冮崟顔肩８缂佸娉曢崵搴ｇ矙? * - 闁告帗绋戠紓鎾诲礂閵婏附鐓€闁汇劌瀚崵搴ｇ矙? * - 濠㈣泛瀚幃濠勭磼閸埄浼傞柛蹇嬪劚瑜版盯鎮?vs 闁煎崬锕ら妵澶愬礂閵夈儱缍撻柣? * - 閹煎瓨姊婚弫銈夊箵閹邦亞杩旈柛鐔锋閹锋澘螣閳ュ磭鈧鎲伴崱娆愮０
 * - 閻庝絻澹堥崺鍛村礆閻楀牊鐓€缂佹崘娉曢埢? *
 * @returns 闁告牕鎳庨幆鍫㈢棯鐠恒劉鏌ら柛鎺撶☉缂傛捇寮憴鍕€婇柛婊冪灱濞村宕楀畷鍥﹂柟顑胯兌濞堟垹鈧數顢婇挅? *
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
       * 閹煎瓨姊婚弫銈夊箵閹邦亞杩旈柛鐔锋椤╊偊鎯?       * 濠碘€冲€归悘澶愬箰閸パ呮毎濞存粌妫欒ぐ浣圭瑹濞戞ɑ娅岄柨娑樼焷椤旀洜绱旈纰卞殸閹煎瓨姊诲▓鎴烆渶濡鍚囨俊顖椻偓宕団偓?       */
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
       * 閸掔娀娅庨懡澶岊焾缁捐法鈻奸惃鍕拱閸︽壆濮搁幀?       */
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
       * 婵犵鍋撴繛鑼跺吹閸ゅ海绮欑€ｎ亜寮抽柛娆欑悼閸?       * 閼惧嘲褰囩痪璺ㄢ柤閻ㄥ嫰绮拋銈喣侀崹瀣偓澶嬪
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

      // 鐎殿喖鎼崺妤呭礆濞戞绱﹂柡鍌涘閸ゅ海绮欑€ｎ偅顦ч柨娑樻湰缁斿姊介妶澶堚偓宥夋儎椤旂偓鐣遍柤钘夘槺鏋紒鎹愭硶閳?ID
      if (shouldForceFreshThread) {
        clearProjectDraftThreadId(projectId, entryPoint);
      }

      // 閼惧嘲褰囧鎻掔摠閸屻劎娈戦懡澶岊焾缁捐法鈻奸崐娆撯偓?      const storedDraftThreadCandidate = getDraftThreadByProjectId(projectId, entryPoint);
      // 閼惧嘲褰囪ぐ鎾冲濞茶濮╅惃鍕磸缁嬭法鍤庣粙瀣偓娆撯偓?      const latestActiveDraftThreadCandidate: DraftThreadState | null = focusedThreadId
        ? getDraftThread(focusedThreadId)
        : null;
      
      // 缁绢収鍠栭悾鐐媴鐠恒劍鏆忛柛婵愪簷闁叉粓鎳℃径灞掑湱鐥捄銊㈡煠
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
      
      // 閻熸瑱绲鹃悗鐣岀棯鐠恒劉鏌ょ€殿喗娲栭杈╂媼閳ュ啿鐏?      const bootstrapPlan = resolveThreadBootstrapPlan({
        storedDraftThread,
        latestActiveDraftThread,
        entryPoint,
        projectId,
        routeThreadId: focusedThreadId,
      });
      
      // 閻犲洩顕цぐ鍥ㄣ亜閸︻厽绐楅柣銊ュ缁垳鎷嬮妶鍠ｄ線宕圭€ｎ喒鍋撴径瀣仴
      const projectDefaultModelSelection =
        useStore.getState().projects.find((project) => project.id === projectId)
          ?.defaultModelSelection ?? null;
      const activeThreadSnapshot = createActiveThreadSnapshot(activeThread, projectId);
      const activeDraftThreadSnapshot = createActiveDraftThreadSnapshot(
        activeDraftThread,
        projectId,
      );
      
      /**
       * 鐟欙絾鐎界紒鍫㈩伂缁捐法鈻奸崚娑樼紦閻樿埖鈧?       */
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
       * 闁告帗绋戠紓鎾剁磼閸埄浼傜紒鎹愭硶閳?       * 缂備礁鐗忛顒勫礂閵夈儱缍撻梻鍥ｅ亾閻熸洑鑳堕悵娑㈠础閸愭彃鐏＄€点倛娅ｅ﹢锛勨偓鍦仧濞堟垹绱撻弽銊ョ瑩缂佹崘娉曢埢?       */
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
      
      // 閹懎鍠?1閿涙矮濞囬悽銊ュ嚒鐎涙ê鍋嶉惃鍕磸缁嬭法鍤庣粙?      if (bootstrapPlan.kind === "stored") {
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

      // 閹懎鍠?2閿涙矮濞囬悽銊ㄧ熅閻㈠彉鑵戦惃鍕殠缁?      if (bootstrapPlan.kind === "route") {
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

      // 閹懎鍠?3閿涙艾鍨卞鍝勫弿閺傛壆鍤庣粙?      const threadId = newThreadId();
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
