/**
 * @file useComposerSlashCommands.ts
 * @description ç¼–è¾‘å™¨æ–œæ å‘½ï¿½?Hook - å¤„ç†å„ç§æ–œæ å‘½ä»¤çš„æ‰§è¡Œé€»è¾‘
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

/** ç¼–è¾‘å™¨å¿«ç…§ç±»ï¿½?*/
type ComposerSnapshot = {
  value: string;
  cursor: number;
  expandedCursor: number;
};

/** æ–œæ å‘½ä»¤é¡¹ç±»ï¿½?*/
type SlashCommandItem = Extract<ComposerCommandItem, { type: "slash-command" }>;

/**
 * åˆ¤æ–­æç¤ºæ›¿æ¢æ˜¯å¦æˆåŠŸåº”ç”¨
 */
function wasPromptReplacementApplied(result: number | false): boolean {
  return result !== false;
}

/**
 * ç¼–è¾‘å™¨æ–œæ å‘½ï¿½?Hook
 *
 * @description
 * å¤„ç†ç¼–è¾‘å™¨ä¸­å„ç§æ–œæ å‘½ä»¤çš„æ‰§è¡Œé€»è¾‘ï¼ŒåŒ…æ‹¬ï¼š
 * - /clear: æ¸…ç©ºå¯¹è¯
 * - /compact: åŽ‹ç¼©çº¿ç¨‹ä¸Šä¸‹æ–‡ * - /plan /default: åˆ‡æ¢äº¤äº’æ¨¡å¼
 * - /status: æ˜¾ç¤ºçŠ¶æ€å¯¹è¯æ¡†
 * - /subagents: å­ä»£ç†ç®¡ç†
 * - /review: ä»£ç å®¡æŸ¥
 * - /fast: å¿«é€Ÿæ¨¡å¼åˆ‡æ¢ * - /fork: çº¿ç¨‹åˆ†å‰
 * - /side: ä¾§è¾¹èŠå¤©
 *
 * @param input - è¾“å…¥å‚æ•°å¯¹è±¡
 * @param input.activeProject - å½“å‰æ´»åŠ¨é¡¹ç›®
 * @param input.activeThread - å½“å‰æ´»åŠ¨çº¿ç¨‹
 * @param input.activeRootBranch - å½“å‰æ ¹åˆ†æ”¯ * @param input.isServerThread - æ˜¯å¦ä¸ºæœåŠ¡å™¨çº¿ç¨‹
 * @param input.supportsFastSlashCommand - æ˜¯å¦æ”¯æŒå¿«é€Ÿå‘½ä»¤
 * @param input.canOfferCompactCommand - æ˜¯å¦å¯æä¾›åŽ‹ç¼©å‘½ä»¤
 * @param input.canOfferSideCommand - æ˜¯å¦å¯æä¾›ä¾§è¾¹å‘½ä»¤ * @param input.supportsTextNativeReviewCommand - æ˜¯å¦æ”¯æŒæ–‡æœ¬åŽŸç”Ÿå®¡æŸ¥å‘½ä»¤
 * @param input.fastModeEnabled - å¿«é€Ÿæ¨¡å¼æ˜¯å¦å·²å¯ç”¨
 * @param input.providerNativeCommands - æä¾›å•†åŽŸç”Ÿå‘½ä»¤åˆ—è¡¨ * @param input.providerCommandDiscoveryCwd - å‘½ä»¤å‘çŽ°å·¥ä½œç›®å½•
 * @param input.selectedProvider - å½“å‰é€‰ä¸­çš„æä¾›å•†
 * @param input.currentProviderModelOptions - å½“å‰æä¾›å•†æ¨¡åž‹é€‰é¡¹
 * @param input.selectedModelSelection - å½“å‰é€‰ä¸­çš„æ¨¡åž‹
 * @param input.runtimeMode - è¿è¡Œæ—¶æ¨¡å¼ * @param input.interactionMode - äº¤äº’æ¨¡å¼
 * @param input.threadId - çº¿ç¨‹ ID
 * @param input.syncServerShellSnapshot - åŒæ­¥æœåŠ¡å™¨ Shell å¿«ç…§
 * @param input.navigateToThread - å¯¼èˆªåˆ°çº¿ç¨‹ * @param input.handleClearConversation - æ¸…ç©ºå¯¹è¯å¤„ç†
 * @param input.handleInteractionModeChange - äº¤äº’æ¨¡å¼åˆ‡æ¢å¤„ç†
 * @param input.openForkTargetPicker - æ‰“å¼€åˆ†å‰ç›®æ ‡é€‰æ‹©å™¨
 * @param input.openReviewTargetPicker - æ‰“å¼€å®¡æŸ¥ç›®æ ‡é€‰æ‹©å™¨ * @param input.setComposerDraftProviderModelOptions - è®¾ç½®ç¼–è¾‘å™¨è‰ç¨¿æä¾›å•†æ¨¡åž‹é€‰é¡¹
 * @param input.editorActions - ç¼–è¾‘å™¨æ“ä½œé›†åˆ *
 * @returns æ–œæ å‘½ä»¤å¤„ç†ç›¸å…³çš„çŠ¶æ€å’Œæ–¹æ³•
 *
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
  // èŽ·å–å½“å‰å¯ç”¨çš„å†…ç½®æ–œæ å‘½ä»¤åˆ—è¡¨
  const availableBuiltInSlashCommands = getAvailableComposerSlashCommands({
    provider: selectedProvider,
    supportsFastSlashCommand,
    canOfferCompactCommand,
    canOfferReviewCommand: true,
    canOfferForkCommand: true,
    canOfferSideCommand: true,
    providerNativeCommandNames,
  });

  /**
   * åŽ‹ç¼©å½“å‰æä¾›å•†çº¿ç¨‹çš„ä¸Šä¸‹æ–‡ã€‚   * ä»…åœ¨æœåŠ¡å™¨çº¿ç¨‹ä¸”ä¼šè¯æœªå…³é—­æ—¶å¯ç”¨
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
   * ä»Žæ–œæ å‘½ä»¤è®¾ç½®å¿«é€Ÿæ¨¡å¼ã€‚
   * æ›´æ–°æä¾›å•†æ¨¡åž‹é€‰é¡¹ä¸­çš„å¿«é€Ÿæ¨¡å¼é…ç½®ã€‚   */
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
   * æ‰§è¡Œ /fast æ–œæ å‘½ä»¤
   * æ”¯æŒ /fast, /fast on, /fast off, /fast status ç­‰è¯­æ³•ã€‚   */
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
   * ä»Žæ–œæ å‘½ä»¤åˆ›å»ºåˆ†å‰çº¿ç¨‹ã€‚
   * å¤åˆ¶å½“å‰çº¿ç¨‹çš„æ¶ˆæ¯å¹¶åˆ›å»ºæ–°çº¿ç¨‹ã€‚   */
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
   * ä»Žæ–œæ å‘½ä»¤åˆ›å»ºä¾§è¾¹èŠå¤©çº¿ç¨‹ã€‚
   * åœ¨å½“å‰çº¿ç¨‹æ—è¾¹æ‰“å¼€ä¸€ä¸ªæ–°çš„èŠå¤©çª—å£ã€‚   */
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
   * å¯åŠ¨ Codex å®¡æŸ¥æµç¨‹
   * @param target - å®¡æŸ¥ç›®æ ‡ï¼šchangesï¼ˆå½“å‰æ›´æ”¹ï¼‰ã€base-branchï¼ˆåŸºç¡€åˆ†æ”¯ï¼‰   */
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

  /**
   * å¤„ç†å®¡æŸ¥ç›®æ ‡é€‰æ‹©
   *
   * @description
   * æ ¹æ®é€‰ä¸­çš„å®¡æŸ¥ç›®æ ‡å’Œå½“å‰æä¾›å•†ç±»åž‹ï¼Œæ‰§è¡Œä¸åŒçš„å®¡æŸ¥æµç¨‹ï¼š
   * - Codex æä¾›å•†ï¼šç›´æŽ¥å¯åŠ¨åŽŸç”Ÿå®¡æŸ¥
   * - å…¶ä»–æä¾›å•†ï¼šå°†å®¡æŸ¥æç¤ºè¯æ’å…¥ç¼–è¾‘å™¨
   *
   * @param target - å®¡æŸ¥ç›®æ ‡ç±»åž‹ï¼š"changes"ï¼ˆå½“å‰æ›´æ”¹ï¼‰æˆ– "base-branch"ï¼ˆåŸºç¡€åˆ†æ”¯ï¼‰
   */
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

  /**
   * å¤„ç†åˆ†å‰ç›®æ ‡é€‰æ‹©
   *
   * @description
   * æ ¹æ®ç”¨æˆ·é€‰æ‹©çš„åˆ†å‰ç›®æ ‡ï¼ˆæœ¬åœ°æˆ–å·¥ä½œæ ‘ï¼‰ï¼Œåˆ›å»ºåˆ†å‰çº¿ç¨‹ã€‚
   * å¤±è´¥æ—¶æ˜¾ç¤ºé”™è¯¯é€šçŸ¥ã€‚
   *
   * @param target - åˆ†å‰ç›®æ ‡ç±»åž‹ï¼š"local"ï¼ˆæœ¬åœ°ï¼‰æˆ– "worktree"ï¼ˆå·¥ä½œæ ‘ï¼‰
   */
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

  /**
   * æ£€æŸ¥ Claude æä¾›å•†çš„ /fast æ–œæ å‘½ä»¤å¯ç”¨æ€§
   *
   * @description
   * é€šè¿‡ Claude å‘½ä»¤å‘çŽ°æŽ¥å£æŸ¥è¯¢å½“å‰è´¦æˆ·/çŽ¯å¢ƒæ˜¯å¦æ”¯æŒ /fast å‘½ä»¤ã€‚
   * å¦‚æžœä¸å¯ç”¨ï¼Œæ¸…é™¤ç¼–è¾‘å™¨è‰ç¨¿å¹¶æ˜¾ç¤ºæç¤ºé€šçŸ¥ã€‚
   *
   * @returns æ˜¯å¦æ”¯æŒ /fast å‘½ä»¤
   */
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

  /**
   * å¤„ç†ç‹¬ç«‹æ–œæ å‘½ä»¤è¾“å…¥
   *
   * @description
   * å½“ç”¨æˆ·åœ¨ç¼–è¾‘å™¨ä¸­ç›´æŽ¥è¾“å…¥å®Œæ•´çš„æ–œæ å‘½ä»¤ï¼ˆå¦‚ "/clear"ã€"/compact"ï¼‰æ—¶è§¦å‘ã€‚
   * è§£æžå‘½ä»¤æ–‡æœ¬å¹¶æ‰§è¡Œå¯¹åº”çš„æ“ä½œï¼ŒåŒ…æ‹¬ï¼š
   * - /clear: æ¸…ç©ºå¯¹è¯
   * - /compact: åŽ‹ç¼©ä¸Šä¸‹æ–‡
   * - /plan /default: åˆ‡æ¢äº¤äº’æ¨¡å¼
   * - /status: æ‰“å¼€çŠ¶æ€å¯¹è¯æ¡†
   * - /subagents: æ’å…¥å­ä»£ç†æç¤ºè¯
   * - /review: å¯åŠ¨ä»£ç å®¡æŸ¥
   * - /fast: åˆ‡æ¢å¿«é€Ÿæ¨¡å¼
   * - /fork: åˆ›å»ºåˆ†å‰çº¿ç¨‹
   * - /side: åˆ›å»ºä¾§è¾¹èŠå¤©
   *
   * @param trimmed - åŽ»é™¤é¦–å°¾ç©ºæ ¼åŽçš„å‘½ä»¤æ–‡æœ¬
   * @returns æ˜¯å¦æˆåŠŸå¤„ç†äº†è¯¥å‘½ä»¤ï¼ˆtrue è¡¨ç¤ºå·²æ¶ˆè´¹ï¼Œfalse è¡¨ç¤ºæœªè¯†åˆ«ï¼‰
   */
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

  /**
   * å¤„ç†æ–œæ å‘½ä»¤èœå•é€‰æ‹©
   *
   * @description
   * å½“ç”¨æˆ·ä»Žå‘½ä»¤èœå•ä¸­é€‰æ‹©ä¸€ä¸ªæ–œæ å‘½ä»¤é¡¹æ—¶è§¦å‘ã€‚
   * æ ¹æ®å‘½ä»¤ç±»åž‹æ‰§è¡Œä¸åŒçš„ç¼–è¾‘å™¨æ“ä½œï¼š
   * - /model: åœ¨ç¼–è¾‘å™¨ä¸­æ’å…¥ "/model " å¹¶ä¿ç•™èœå•
   * - /clear, /compact, /plan, /default, /status, /fast: æ¸…é™¤å‘½ä»¤æ–‡æœ¬å¹¶æ‰§è¡Œå¯¹åº”æ“ä½œ
   * - /subagents, /review: åœ¨ç¼–è¾‘å™¨ä¸­æ’å…¥å¯¹åº”çš„æç¤ºè¯
   * - /fork, /side: æ¸…é™¤å‘½ä»¤æ–‡æœ¬å¹¶æ‰“å¼€ç›®æ ‡é€‰æ‹©å™¨æˆ–æ‰§è¡Œæ“ä½œ
   *
   * @param item - ç”¨æˆ·é€‰ä¸­çš„æ–œæ å‘½ä»¤èœå•é¡¹
   */
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
