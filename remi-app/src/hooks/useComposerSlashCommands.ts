/**
 * @file useComposerSlashCommands.ts
 * @description 缂傛牞绶崳銊︽灘閺夌姴鎳℃禒?Hook - 婢跺嫮鎮婇崥鍕潚閺傛粍娼崨鎴掓姢閻ㄥ嫭澧界悰宀勨偓鏄忕帆
 * @module hooks/useComposerSlashCommands
 */

import {
  type ModelSelection,
  type OrchestrationShellSnapshot,
  type ProviderInteractionMode,
  type ProviderKind,
  type ProviderNativeCommandDescriptor,
  type ProviderModelOptions,
  type RuntimeMode,
  type ThreadId,
} from "~/contracts";
import { buildPromptThreadTitleFallback } from "~/shared/chatThreads";
import { deriveAssociatedWorktreeMetadata } from "~/shared/threadWorkspace";
import { useCallback, useState } from "react";
import { newCommandId, newMessageId, newThreadId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import type { Project, Thread } from "../types";
import type { ComposerTrigger } from "../composer-logic";
import { extendReplacementRangeForTrailingSpace } from "../composerTriggerInsertion";
import {
  buildSlashReviewComposerPrompt,
  buildSubagentsPrompt,
  getAvailableComposerSlashCommands,
  hasProviderNativeSlashCommand,
  parseComposerSlashInvocationForCommands,
  parseFastSlashCommandAction,
  parseForkSlashCommandArgs,
  type ForkSlashCommandTarget,
} from "../composerSlashCommands";
import { buildThreadHandoffImportedMessages } from "../lib/threadHandoff";
import { toastManager } from "../components/ui/toast";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import { buildNextProviderOptions } from "../providerModelOptions";
import { resolveForkThreadEnvironment } from "../lib/threadEnvironment";
import { type SplitViewId, useSplitViewStore } from "../splitViewStore";

/** 缂傛牞绶崳銊ユ彥閻撗呰閸?*/
type ComposerSnapshot = {
  value: string;
  cursor: number;
  expandedCursor: number;
};

/** 閺傛粍娼崨鎴掓姢妞ゅ湱琚崹?*/
type SlashCommandItem = Extract<ComposerCommandItem, { type: "slash-command" }>;

/**
 * 閸掋倖鏌囬幓鎰仛閺囨寧宕查弰顖氭儊閹存劕濮涙惔鏃傛暏
 */
function wasPromptReplacementApplied(result: number | false): boolean {
  return result !== false;
}

/**
 * 缂傛牞绶崳銊︽灘閺夌姴鎳℃禒?Hook
 *
 * @description
 * 婢跺嫮鎮婄紓鏍帆閸ｃ劋鑵戦崥鍕潚閺傛粍娼崨鎴掓姢閻ㄥ嫭澧界悰宀勨偓鏄忕帆閿涘苯瀵橀幏顒婄窗
 * - /clear: 濞撳懐鈹栫€电鐦? * - /compact: 閸樺缂夌痪璺ㄢ柤娑撳﹣绗呴弬? * - /plan /default: 閸掑洦宕叉禍銈勭鞍濡€崇础
 * - /status: 閺勫墽銇氶悩鑸碘偓浣割嚠鐠囨繃顢? * - /subagents: 鐎涙劒鍞悶鍡欘吀閻? * - /review: 娴狅絿鐖滅€光剝鐓? * - /fast: 韫囶偊鈧喐膩瀵繐鍨忛幑? * - /fork: 缁捐法鈻奸崚鍡楀级
 * - /side: 娓氀嗙珶閼卞﹤銇? *
 * @param input - 鏉堟挸鍙嗛崣鍌涙殶鐎电钖? * @param input.activeProject - 瑜版挸澧犲ú璇插З妞ゅ湱娲? * @param input.activeThread - 瑜版挸澧犲ú璇插З缁捐法鈻? * @param input.activeRootBranch - 瑜版挸澧犻弽鐟板瀻閺€? * @param input.isServerThread - 閺勵垰鎯佹稉鐑樻箛閸斺€虫珤缁捐法鈻? * @param input.supportsFastSlashCommand - 閺勵垰鎯侀弨顖涘瘮韫囶偊鈧喎鎳℃禒? * @param input.canOfferCompactCommand - 閺勵垰鎯侀崣顖涘絹娓氭稑甯囩紓鈺佹嚒娴? * @param input.canOfferSideCommand - 閺勵垰鎯侀崣顖涘絹娓氭稐鏅舵潏鐟版嚒娴? * @param input.supportsTextNativeReviewCommand - 閺勵垰鎯侀弨顖涘瘮閺傚洦婀伴崢鐔烘晸鐎光剝鐓￠崨鎴掓姢
 * @param input.fastModeEnabled - 韫囶偊鈧喐膩瀵繑妲搁崥锕€鍑￠崥顖滄暏
 * @param input.providerNativeCommands - 閹绘劒绶甸崯鍡楀斧閻㈢喎鎳℃禒銈呭灙鐞? * @param input.providerCommandDiscoveryCwd - 閸涙垝鎶ら崣鎴犲箛瀹搞儰缍旈惄顔肩秿
 * @param input.selectedProvider - 瑜版挸澧犻柅澶夎厬閻ㄥ嫭褰佹笟娑樻櫌
 * @param input.currentProviderModelOptions - 瑜版挸澧犻幓鎰返閸熷棙膩閸ㄥ鈧銆? * @param input.selectedModelSelection - 瑜版挸澧犻柅澶夎厬閻ㄥ嫭膩閸? * @param input.runtimeMode - 鏉╂劘顢戦弮鑸的佸? * @param input.interactionMode - 娴溿倓绨板Ο鈥崇础
 * @param input.threadId - 缁捐法鈻?ID
 * @param input.syncServerShellSnapshot - 閸氬本顒為張宥呭閸?Shell 韫囶偆鍙? * @param input.navigateToThread - 鐎佃壈鍩呴崚鎵殠缁? * @param input.handleClearConversation - 濞撳懐鈹栫€电鐦芥径鍕倞
 * @param input.handleInteractionModeChange - 娴溿倓绨板Ο鈥崇础閸掑洦宕叉径鍕倞
 * @param input.openForkTargetPicker - 閹垫挸绱戦崚鍡楀级閻╊喗鐖ｉ柅澶嬪閸? * @param input.openReviewTargetPicker - 閹垫挸绱戠€光剝鐓￠惄顔界垼闁瀚ㄩ崳? * @param input.setComposerDraftProviderModelOptions - 鐠佸墽鐤嗙紓鏍帆閸ｃ劏宕忕粙鎸庡絹娓氭稑鏅㈠Ο鈥崇€烽柅澶愩€? * @param input.editorActions - 缂傛牞绶崳銊︽惙娴ｆ粓娉﹂崥? *
 * @returns 閺傛粍娼崨鎴掓姢婢跺嫮鎮婇惄绋垮彠閻ㄥ嫮濮搁幀浣告嫲閺傝纭? *
 * @example
 * ```tsx
 * const {
 *   handleStandaloneSlashCommand,
 *   handleSlashCommandSelection,
 *   isSlashStatusDialogOpen,
 * } = useComposerSlashCommands({ ... });
 * ```
 */
export function useComposerSlashCommands(input: {
  activeProject: Project | undefined;
  activeThread: Thread | undefined;
  activeRootBranch: string | null;
  isServerThread: boolean;
  supportsFastSlashCommand: boolean;
  canOfferCompactCommand: boolean;
  canOfferSideCommand: boolean;
  supportsTextNativeReviewCommand: boolean;
  fastModeEnabled: boolean;
  providerNativeCommands: readonly ProviderNativeCommandDescriptor[];
  providerCommandDiscoveryCwd: string | null;
  selectedProvider: ProviderKind;
  currentProviderModelOptions: ProviderModelOptions[ProviderKind] | undefined;
  selectedModelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  threadId: ThreadId;
  syncServerShellSnapshot: (snapshot: OrchestrationShellSnapshot) => void;
  navigateToThread: (threadId: ThreadId, options?: { splitViewId?: SplitViewId }) => Promise<void>;
  handleClearConversation: () => Promise<void> | void;
  handleInteractionModeChange: (mode: "default" | "plan") => Promise<void> | void;
  openForkTargetPicker: () => void;
  openReviewTargetPicker: () => void;
  setComposerDraftProviderModelOptions: (
    threadId: ThreadId,
    provider: ProviderKind,
    nextProviderOptions: ProviderModelOptions[ProviderKind],
    options?: { persistSticky?: boolean },
  ) => void;
  editorActions: {
    resolveActiveComposerTrigger: () => {
      snapshot: ComposerSnapshot;
      trigger: ComposerTrigger | null;
    };
    applyPromptReplacement: (
      rangeStart: number,
      rangeEnd: number,
      replacement: string,
      options?: { expectedText?: string; cursorOffset?: number },
    ) => number | false;
    clearComposerSlashDraft: () => void;
    setComposerPromptValue: (nextPrompt: string) => void;
    scheduleComposerFocus: () => void;
    setComposerHighlightedItemId: (id: string | null) => void;
  };
}) {
  const [isSlashStatusDialogOpen, setIsSlashStatusDialogOpen] = useState(false);
  const {
    activeProject,
    activeThread,
    activeRootBranch,
    isServerThread,
    supportsFastSlashCommand,
    canOfferCompactCommand,
    canOfferSideCommand,
    supportsTextNativeReviewCommand,
    fastModeEnabled,
    providerNativeCommands,
    providerCommandDiscoveryCwd,
    selectedProvider,
    currentProviderModelOptions,
    selectedModelSelection,
    runtimeMode,
    interactionMode,
    threadId,
    syncServerShellSnapshot,
    navigateToThread,
    handleClearConversation,
    handleInteractionModeChange,
    openForkTargetPicker,
    openReviewTargetPicker,
    setComposerDraftProviderModelOptions,
    editorActions,
  } = input;
  const providerNativeCommandNames = providerNativeCommands.map((command) => command.name);
  const createSplitViewFromDrop = useSplitViewStore((store) => store.createFromDrop);
  // 鑾峰彇褰撳墠鍙敤鐨勫唴缃枩鏉犲懡浠ゅ垪琛?  const availableBuiltInSlashCommands = getAvailableComposerSlashCommands({
    provider: selectedProvider,
    supportsFastSlashCommand,
    canOfferCompactCommand,
    canOfferReviewCommand: true,
    canOfferForkCommand: true,
    canOfferSideCommand: true,
    providerNativeCommandNames,
  });

  /**
   * 閸樺缂夎ぐ鎾冲閹绘劒绶甸崯鍡欏殠缁嬪娈戞稉濠佺瑓閺?   * 娴犲懎婀張宥呭閸ｃ劎鍤庣粙瀣╃瑬娴兼俺鐦介張顏勫彠闂傤厽妞傞崣顖滄暏
   */
  const compactProviderThread = useCallback(async (): Promise<boolean> => {
    const api = readNativeApi();
    if (
      !api ||
      !canOfferCompactCommand ||
      !isServerThread ||
      !activeThread?.session ||
      activeThread.session.status === "closed"
    ) {
      toastManager.add({
        type: "warning",
        title: "Compact is unavailable",
        description: "Open an active supported server thread before compacting context.",
      });
      return false;
    }

    try {
      void api.provider
        .compactThread({
          threadId: activeThread.id,
        })
        .catch((error) => {
          toastManager.add({
            type: "error",
            title: "Could not compact thread",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while compacting context.",
          });
        });
      return true;
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not compact thread",
        description:
          error instanceof Error ? error.message : "An error occurred while compacting context.",
      });
      return false;
    }
  }, [activeThread, canOfferCompactCommand, isServerThread]);

  /**
   * 鑾峰彇鏂滄潬鍛戒护鐨勮繃婊ょ粨鏋滐紝鏍规嵁鏌ヨ瀛楃涓茶繘琛屽尮閰?   */
  const setFastModeFromSlashCommand = useCallback(
    (enabled: boolean) => {
      setComposerDraftProviderModelOptions(
        threadId,
        selectedProvider,
        buildNextProviderOptions(selectedProvider, currentProviderModelOptions, {
          fastMode: enabled,
        }),
        {
          persistSticky: true,
        },
      );
    },
    [currentProviderModelOptions, selectedProvider, setComposerDraftProviderModelOptions, threadId],
  );

  /**
   * 閹笛嗩攽 /fast 閺傛粍娼崨鎴掓姢
   * 鍖归厤 /fast, /fast on, /fast off, /fast status 绛夊懡浠?   */
  const runFastSlashCommand = useCallback(
    (text: string) => {
      const action = parseFastSlashCommandAction(text);
      if (action === null) {
        return false;
      }
      if (!supportsFastSlashCommand) {
        toastManager.add({
          type: "warning",
          title: "Fast mode is unavailable",
          description: "The selected model does not support Fast mode.",
        });
        return true;
      }
      if (action === "invalid") {
        toastManager.add({
          type: "warning",
          title: "Invalid /fast command",
          description: "Use /fast, /fast on, /fast off, or /fast status.",
        });
        return true;
      }
      if (action === "status") {
        toastManager.add({
          type: "info",
          title: `Fast mode is ${fastModeEnabled ? "on" : "off"}`,
        });
        return true;
      }
      const nextEnabled = action === "on" ? true : action === "off" ? false : !fastModeEnabled;
      setFastModeFromSlashCommand(nextEnabled);
      toastManager.add({
        type: "success",
        title: `Fast mode ${nextEnabled ? "enabled" : "disabled"}`,
      });
      return true;
    },
    [fastModeEnabled, supportsFastSlashCommand, setFastModeFromSlashCommand],
  );

  /**
   * 鑾峰彇鏂滄潬鍛戒护鐨勬弿杩版枃鏈紝鍖呭惈鍛戒护鍚嶇О鍜岀畝鐭鏄?   */
  const createForkThreadFromSlashCommand = useCallback(
    async (inputOptions?: { target?: ForkSlashCommandTarget }) => {
      const api = readNativeApi();
      if (!api || !activeProject || !activeThread || !isServerThread) {
        toastManager.add({
          type: "warning",
          title: "Fork is unavailable",
          description: "Only existing server-backed threads can be forked right now.",
        });
        return true;
      }

      const importedMessages = buildThreadHandoffImportedMessages(activeThread);

      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      // Fork first, then let the normal first-send worktree bootstrap create the cwd if needed.
      const resolvedTarget = resolveForkThreadEnvironment({
        target: inputOptions?.target ?? "local",
        activeRootBranch,
        sourceThread: activeThread,
      });

      await api.orchestration.dispatchCommand({
        type: "thread.fork.create",
        commandId: newCommandId(),
        threadId: nextThreadId,
        sourceThreadId: activeThread.id,
        projectId: activeProject.id,
        title: activeThread.title,
        modelSelection: selectedModelSelection,
        runtimeMode,
        interactionMode,
        envMode: resolvedTarget.envMode,
        branch: resolvedTarget.branch,
        worktreePath: resolvedTarget.worktreePath,
        associatedWorktreePath: resolvedTarget.associatedWorktreePath,
        associatedWorktreeBranch: resolvedTarget.associatedWorktreeBranch,
        associatedWorktreeRef: resolvedTarget.associatedWorktreeRef,
        importedMessages: [...importedMessages],
        createdAt,
      });
      const snapshot = await api.orchestration.getShellSnapshot();
      syncServerShellSnapshot(snapshot);
      await navigateToThread(nextThreadId);
      return true;
    },
    [
      activeProject,
      activeRootBranch,
      activeThread,
      interactionMode,
      isServerThread,
      navigateToThread,
      runtimeMode,
      selectedModelSelection,
      syncServerShellSnapshot,
    ],
  );

  /**
   * 鑾峰彇鏂滄潬鍛戒护鐨勬帓搴忎緷鎹紝鎸夊懡浠ゅ悕绉板拰鏉ユ簮鎺掑簭
   */
  const createSidechatFromSlashCommand = useCallback(
    async (inputOptions?: { initialPrompt?: string }) => {
      const api = readNativeApi();
      if (!api || !activeProject || !activeThread || !isServerThread || !canOfferSideCommand) {
        toastManager.add({
          type: "warning",
          title: "Sidechat is unavailable",
          description: "Open a server-backed main thread before starting a sidechat.",
        });
        return true;
      }

      const importedMessages = buildThreadHandoffImportedMessages(activeThread);
      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      const initialPrompt = inputOptions?.initialPrompt?.trim() ?? "";
      const titleSeed =
        initialPrompt.length > 0
          ? buildPromptThreadTitleFallback(initialPrompt)
          : activeThread.title;

      await api.orchestration.dispatchCommand({
        type: "thread.fork.create",
        commandId: newCommandId(),
        threadId: nextThreadId,
        sourceThreadId: activeThread.id,
        sidechatSourceThreadId: activeThread.id,
        projectId: activeProject.id,
        title: `Sidechat: ${titleSeed}`,
        modelSelection: selectedModelSelection,
        runtimeMode: "approval-required",
        interactionMode: "default",
        envMode: activeThread.envMode ?? (activeThread.worktreePath ? "worktree" : "local"),
        branch: activeThread.branch,
        worktreePath: activeThread.worktreePath,
        associatedWorktreePath: activeThread.associatedWorktreePath ?? null,
        associatedWorktreeBranch: activeThread.associatedWorktreeBranch ?? null,
        associatedWorktreeRef: activeThread.associatedWorktreeRef ?? null,
        importedMessages: [...importedMessages],
        createdAt,
      });

      if (initialPrompt.length > 0) {
        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: initialPrompt,
            attachments: [],
          },
          modelSelection: selectedModelSelection,
          runtimeMode: "approval-required",
          interactionMode: "default",
          createdAt: new Date().toISOString(),
        });
      }

      const snapshot = await api.orchestration.getShellSnapshot();
      syncServerShellSnapshot(snapshot);
      const splitViewId = createSplitViewFromDrop({
        sourceThreadId: activeThread.id,
        ownerProjectId: activeProject.id,
        droppedThreadId: nextThreadId,
        direction: "horizontal",
        side: "second",
      });
      await navigateToThread(nextThreadId, { splitViewId });
      return true;
    },
    [
      activeProject,
      activeThread,
      canOfferSideCommand,
      createSplitViewFromDrop,
      isServerThread,
      navigateToThread,
      selectedModelSelection,
      syncServerShellSnapshot,
    ],
  );

  /**
   * 閸氼垰濮?Codex 鐎光剝鐓″ù浣衡柤
   * @param target - 鐩爣瀵硅薄锛屽寘鍚?changes 鍜?base-branch 绛夊睘鎬?   */
  const runCodexReviewStart = useCallback(
    async (target: "changes" | "base-branch") => {
      const api = readNativeApi();
      if (!api || !activeThread || !activeProject) {
        toastManager.add({
          type: "warning",
          title: "Review is unavailable",
          description: "Open a project thread before starting a native review.",
        });
        return false;
      }

      if (target === "base-branch" && !activeRootBranch) {
        toastManager.add({
          type: "warning",
          title: "Base branch unavailable",
          description: "Select or detect a base branch before starting this review.",
        });
        return false;
      }

      const messageText =
        target === "base-branch" && activeRootBranch
          ? `Review against base branch ${activeRootBranch}`
          : "Review current changes";

      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      const nextThreadTitle =
        target === "base-branch" ? `${activeThread.title} Review` : `${activeThread.title} Review`;
      const associatedWorktree = deriveAssociatedWorktreeMetadata({
        branch: activeThread.branch,
        worktreePath: activeThread.worktreePath,
        associatedWorktreePath: activeThread.associatedWorktreePath ?? null,
        associatedWorktreeBranch: activeThread.associatedWorktreeBranch ?? null,
        associatedWorktreeRef: activeThread.associatedWorktreeRef ?? null,
      });

      try {
        await api.orchestration.dispatchCommand({
          type: "thread.create",
          commandId: newCommandId(),
          threadId: nextThreadId,
          projectId: activeProject.id,
          title: nextThreadTitle,
          modelSelection: selectedModelSelection,
          runtimeMode,
          interactionMode: "default",
          envMode: activeThread.envMode ?? (activeThread.worktreePath ? "worktree" : "local"),
          branch: activeThread.branch,
          worktreePath: activeThread.worktreePath,
          lastKnownPr: activeThread.lastKnownPr ?? null,
          ...associatedWorktree,
          createdAt,
        });
        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: messageText,
            attachments: [],
          },
          modelSelection: selectedModelSelection,
          reviewTarget:
            target === "base-branch"
              ? {
                  type: "baseBranch",
                  branch: activeRootBranch!,
                }
              : {
                  type: "uncommittedChanges",
                },
          dispatchMode: "queue",
          runtimeMode,
          interactionMode: "default",
          createdAt,
        });
        const snapshot = await api.orchestration.getShellSnapshot();
        syncServerShellSnapshot(snapshot);
        await navigateToThread(nextThreadId);
        return true;
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not start review",
          description:
            error instanceof Error ? error.message : "An error occurred while starting review.",
        });
        return false;
      }
    },
    [
      activeProject,
      activeRootBranch,
      activeThread,
      navigateToThread,
      runtimeMode,
      selectedModelSelection,
      syncServerShellSnapshot,
    ],
  );

  const handleReviewTargetSelection = useCallback(
    async (target: "changes" | "base-branch") => {
      if (selectedProvider === "codex") {
        await runCodexReviewStart(target);
      } else {
        const replacement = buildSlashReviewComposerPrompt(target === "base-branch" ? "base" : "");
        editorActions.setComposerPromptValue(replacement);
      }
      editorActions.scheduleComposerFocus();
    },
    [editorActions, selectedProvider, runCodexReviewStart],
  );

  const handleForkTargetSelection = useCallback(
    async (target: ForkSlashCommandTarget) => {
      try {
        await createForkThreadFromSlashCommand({ target });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not fork thread",
          description:
            error instanceof Error
              ? error.message
              : "An error occurred while creating the forked thread.",
        });
      }
    },
    [createForkThreadFromSlashCommand],
  );

  const checkClaudeFastSlashCommandAvailability = useCallback(async (): Promise<boolean> => {
    const api = readNativeApi();
    if (!api || !providerCommandDiscoveryCwd) {
      editorActions.clearComposerSlashDraft();
      toastManager.add({
        type: "warning",
        title: "Fast mode could not be checked",
        description: "Claude command discovery is unavailable right now.",
      });
      return false;
    }

    try {
      const result = await api.provider.listCommands({
        provider: "claudeAgent",
        cwd: providerCommandDiscoveryCwd,
        threadId,
        forceReload: true,
      });
      if (
        hasProviderNativeSlashCommand(
          "claudeAgent",
          result.commands.map((command) => command.name),
          "fast",
        )
      ) {
        return true;
      }
    } catch {
      editorActions.clearComposerSlashDraft();
      toastManager.add({
        type: "warning",
        title: "Fast mode could not be checked",
        description: "Claude command discovery failed. Please try again.",
      });
      return false;
    }

    editorActions.clearComposerSlashDraft();
    toastManager.add({
      type: "info",
      title: "Fast mode is unavailable",
      description: "Claude did not expose /fast for this account or environment.",
    });
    return false;
  }, [editorActions, providerCommandDiscoveryCwd, threadId]);

  const handleStandaloneSlashCommand = useCallback(
    async (trimmed: string): Promise<boolean> => {
      const fastSlashAction = parseFastSlashCommandAction(trimmed);
      if (selectedProvider === "claudeAgent" && fastSlashAction !== null) {
        if (await checkClaudeFastSlashCommandAvailability()) {
          return false;
        }
        return true;
      }

      const slashInvocation = parseComposerSlashInvocationForCommands(
        trimmed,
        availableBuiltInSlashCommands,
      );
      if (!slashInvocation || slashInvocation.command === "model") {
        return false;
      }
      if (slashInvocation.command === "clear") {
        editorActions.clearComposerSlashDraft();
        await handleClearConversation();
        return true;
      }
      if (slashInvocation.command === "compact") {
        editorActions.clearComposerSlashDraft();
        await compactProviderThread();
        return true;
      }
      if (slashInvocation.command === "plan" || slashInvocation.command === "default") {
        await handleInteractionModeChange(slashInvocation.command === "plan" ? "plan" : "default");
        editorActions.clearComposerSlashDraft();
        return true;
      }
      if (slashInvocation.command === "status") {
        editorActions.clearComposerSlashDraft();
        setIsSlashStatusDialogOpen(true);
        return true;
      }
      if (slashInvocation.command === "subagents") {
        editorActions.setComposerPromptValue(buildSubagentsPrompt(slashInvocation.args));
        return true;
      }
      if (slashInvocation.command === "review") {
        if (selectedProvider === "codex") {
          const normalizedArgs = slashInvocation.args.trim().toLowerCase();
          if (normalizedArgs.length === 0) {
            editorActions.clearComposerSlashDraft();
            openReviewTargetPicker();
            return true;
          }
          const target =
            normalizedArgs === "base" || normalizedArgs.startsWith("base ") ? "base-branch" : null;
          if (!target) {
            toastManager.add({
              type: "warning",
              title: "Invalid /review command",
              description: "Use /review and then choose a review target.",
            });
            return true;
          }
          editorActions.clearComposerSlashDraft();
          await runCodexReviewStart(target);
          return true;
        }
        if (supportsTextNativeReviewCommand && slashInvocation.args.length === 0) {
          return false;
        }
        if (slashInvocation.args.length === 0) {
          editorActions.clearComposerSlashDraft();
          openReviewTargetPicker();
          return true;
        }
        editorActions.setComposerPromptValue(buildSlashReviewComposerPrompt(slashInvocation.args));
        return true;
      }
      if (slashInvocation.command === "fast") {
        editorActions.clearComposerSlashDraft();
        runFastSlashCommand(trimmed);
        return true;
      }
      if (slashInvocation.command === "fork") {
        const { target, invalid } = parseForkSlashCommandArgs(slashInvocation.args);
        if (invalid) {
          toastManager.add({
            type: "warning",
            title: "Invalid /fork command",
            description: "Use /fork and then choose Local or New Worktree.",
          });
          return true;
        }
        try {
          if (!target) {
            editorActions.clearComposerSlashDraft();
            openForkTargetPicker();
            return true;
          }
          await createForkThreadFromSlashCommand({
            target,
          });
          editorActions.clearComposerSlashDraft();
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Could not fork thread",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while creating the forked thread.",
          });
        }
        return true;
      }
      if (slashInvocation.command === "side") {
        try {
          editorActions.clearComposerSlashDraft();
          await createSidechatFromSlashCommand({ initialPrompt: slashInvocation.args });
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Could not start sidechat",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while creating the sidechat.",
          });
        }
        return true;
      }
      return false;
    },
    [
      availableBuiltInSlashCommands,
      checkClaudeFastSlashCommandAvailability,
      compactProviderThread,
      createForkThreadFromSlashCommand,
      createSidechatFromSlashCommand,
      editorActions,
      handleClearConversation,
      handleInteractionModeChange,
      openForkTargetPicker,
      openReviewTargetPicker,
      selectedProvider,
      supportsTextNativeReviewCommand,
      runCodexReviewStart,
      runFastSlashCommand,
    ],
  );

  const handleSlashCommandSelection = useCallback(
    (item: SlashCommandItem) => {
      const { snapshot, trigger } = editorActions.resolveActiveComposerTrigger();
      if (!trigger) {
        return;
      }

      if (item.command === "model") {
        const replacement = "/model ";
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = editorActions.applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
        }
        return;
      }

      const clearSlashCommandFromComposer = () =>
        editorActions.applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
          expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
        });

      if (item.command === "clear") {
        const applied = clearSlashCommandFromComposer();
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
        }
        void handleClearConversation();
        return;
      }

      if (item.command === "compact") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        void compactProviderThread();
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "plan" || item.command === "default") {
        void handleInteractionModeChange(item.command === "plan" ? "plan" : "default");
        const applied = clearSlashCommandFromComposer();
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
        }
        return;
      }

      if (item.command === "subagents") {
        const replacement = buildSubagentsPrompt("");
        const applied = editorActions.applyPromptReplacement(
          trigger.rangeStart,
          trigger.rangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd) },
        );
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
        }
        return;
      }

      if (item.command === "status") {
        const applied = clearSlashCommandFromComposer();
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
          setIsSlashStatusDialogOpen(true);
          editorActions.scheduleComposerFocus();
        }
        return;
      }

      if (item.command === "fast") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        void runFastSlashCommand("/fast");
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "review") {
        if (selectedProvider === "codex") {
          const applied = clearSlashCommandFromComposer();
          if (!wasPromptReplacementApplied(applied)) {
            return;
          }
          editorActions.setComposerHighlightedItemId(null);
          openReviewTargetPicker();
          editorActions.scheduleComposerFocus();
          return;
        }
        if (supportsTextNativeReviewCommand) {
          const replacement = "/review";
          const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
            snapshot.value,
            trigger.rangeEnd,
            replacement,
          );
          const applied = editorActions.applyPromptReplacement(
            trigger.rangeStart,
            replacementRangeEnd,
            replacement,
            { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
          );
          if (wasPromptReplacementApplied(applied)) {
            editorActions.setComposerHighlightedItemId(null);
          }
          return;
        }
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        openReviewTargetPicker();
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "fork") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        openForkTargetPicker();
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "side") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        void createSidechatFromSlashCommand().catch((error) => {
          toastManager.add({
            type: "error",
            title: "Could not start sidechat",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while creating the sidechat.",
          });
        });
      }
    },
    [
      compactProviderThread,
      createSidechatFromSlashCommand,
      editorActions,
      handleClearConversation,
      handleInteractionModeChange,
      openForkTargetPicker,
      openReviewTargetPicker,
      selectedProvider,
      supportsTextNativeReviewCommand,
      runFastSlashCommand,
    ],
  );

  return {
    handleForkTargetSelection,
    handleReviewTargetSelection,
    isSlashStatusDialogOpen,
    setIsSlashStatusDialogOpen,
    handleStandaloneSlashCommand,
    handleSlashCommandSelection,
  };
}
