/**
 * @file useComposerSlashCommands.ts
 * @description 编辑器斜杠命令 Hook - 处理各种斜杠命令的执行逻辑
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
} from "@remi-code/contracts";
import { buildPromptThreadTitleFallback } from "@remi-code/shared/chatThreads";
import { deriveAssociatedWorktreeMetadata } from "@remi-code/shared/threadWorkspace";
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

/** 编辑器快照类型 */
type ComposerSnapshot = {
  value: string;
  cursor: number;
  expandedCursor: number;
};

/** 斜杠命令项类型 */
type SlashCommandItem = Extract<ComposerCommandItem, { type: "slash-command" }>;

/**
 * 判断提示替换是否成功应用
 */
function wasPromptReplacementApplied(result: number | false): boolean {
  return result !== false;
}

/**
 * 编辑器斜杠命令 Hook
 *
 * @description
 * 处理编辑器中各种斜杠命令的执行逻辑，包括：
 * - /clear: 清空对话
 * - /compact: 压缩线程上下文
 * - /plan /default: 切换交互模式
 * - /status: 显示状态对话框
 * - /subagents: 子代理管理
 * - /review: 代码审查
 * - /fast: 快速模式切换
 * - /fork: 线程分叉
 * - /side: 侧边聊天
 *
 * @param input - 输入参数对象
 * @param input.activeProject - 当前活动项目
 * @param input.activeThread - 当前活动线程
 * @param input.activeRootBranch - 当前根分支
 * @param input.isServerThread - 是否为服务器线程
 * @param input.supportsFastSlashCommand - 是否支持快速命令
 * @param input.canOfferCompactCommand - 是否可提供压缩命令
 * @param input.canOfferSideCommand - 是否可提供侧边命令
 * @param input.supportsTextNativeReviewCommand - 是否支持文本原生审查命令
 * @param input.fastModeEnabled - 快速模式是否已启用
 * @param input.providerNativeCommands - 提供商原生命令列表
 * @param input.providerCommandDiscoveryCwd - 命令发现工作目录
 * @param input.selectedProvider - 当前选中的提供商
 * @param input.currentProviderModelOptions - 当前提供商模型选项
 * @param input.selectedModelSelection - 当前选中的模型
 * @param input.runtimeMode - 运行时模式
 * @param input.interactionMode - 交互模式
 * @param input.threadId - 线程 ID
 * @param input.syncServerShellSnapshot - 同步服务器 Shell 快照
 * @param input.navigateToThread - 导航到线程
 * @param input.handleClearConversation - 清空对话处理
 * @param input.handleInteractionModeChange - 交互模式切换处理
 * @param input.openForkTargetPicker - 打开分叉目标选择器
 * @param input.openReviewTargetPicker - 打开审查目标选择器
 * @param input.setComposerDraftProviderModelOptions - 设置编辑器草稿提供商模型选项
 * @param input.editorActions - 编辑器操作集合
 *
 * @returns 斜杠命令处理相关的状态和方法
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
  // 获取当前可用的内置斜杠命令列表
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
   * 压缩当前提供商线程的上下文
   * 仅在服务器线程且会话未关闭时可用
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
   * 从斜杠命令设置快速模式
   * 更新提供商模型选项中的快速模式配置
   */
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
   * 执行 /fast 斜杠命令
   * 支持 /fast, /fast on, /fast off, /fast status 等语法
   */
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
   * 从斜杠命令创建分叉线程
   * 复制当前线程的消息并创建新线程
   */
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
   * 从斜杠命令创建侧边聊天线程
   * 在当前线程旁边打开一个新的聊天窗口
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
   * 启动 Codex 审查流程
   * @param target - 审查目标：changes（当前更改）或 base-branch（基础分支）
   */
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
