// FILE: WorkspaceView.tsx
// Purpose: Render a dedicated terminal-only workspace page backed by a synthetic terminal scope.
// Layer: Workspace route surface

import { type TerminalCliKind } from "~/shared/terminalThreads";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoBug,
  GoCode,
  GoGitBranch,
  GoSearch,
  GoTerminal,
  GoPencil,
  GoChevronLeft,
} from "react-icons/go";

import { AppTopChrome } from "./AppTopChrome";
import { YdszBuddyWordmark } from "./Sidebar";
import { readNativeApi } from "~/nativeApi";
import { tauriBridge } from "~/lib/tauri-bridge";
import { useAppSettings } from "~/appSettings";
import { SidebarInset } from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";
import { useMessages } from "~/i18n/I18nContext";
import {
  confirmTerminalTabClose,
  resolveTerminalCloseTitle,
} from "~/lib/terminalCloseConfirmation";
import { resolveTerminalNewAction } from "~/lib/terminalNewAction";
import { selectThreadTerminalState, useTerminalStateStore } from "~/terminalStateStore";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import { LandingComposer } from "./LandingComposer";
import { WorkspaceModePicker } from "./WorkspaceModePicker";
import { CodeEditorPanel } from "./code-editor/CodeEditorPanel";
import { useWorkspaceStore, workspaceThreadId } from "~/workspaceStore";
import {
  DEFAULT_WORKSPACE_LAYOUT_PRESET_ID,
  ensureTerminalIdsForPreset,
  type WorkspaceLayoutPresetId,
} from "~/workspaceTerminalLayoutPresets";
import { terminalRuntimeRegistry } from "./terminal/terminalRuntimeRegistry";
import { useHandleNewChat } from "~/hooks/useHandleNewChat";
import { useWorkspaceFolderPicker } from "~/hooks/useWorkspaceFolderPicker";
import { setPendingInitialPrompt } from "~/lib/pendingInitialPrompt";

function randomTerminalId(): string {
  if (typeof crypto.randomUUID === "function") {
    return `terminal-${crypto.randomUUID()}`;
  }
  return `terminal-${Math.random().toString(36).slice(2, 10)}`;
}

export default function WorkspaceView({ workspaceId }: { workspaceId: string }) {
  const { settings } = useAppSettings();
  const messages = useMessages();
  const { handleNewChat } = useHandleNewChat();
  const { pickWorkspaceFolder } = useWorkspaceFolderPicker();
  const workspace = useWorkspaceStore((state) =>
    state.workspacePages.find((entry) => entry.id === workspaceId),
  );
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  const ensureWorkspacePage = useWorkspaceStore((state) => state.ensureWorkspacePage);
  const threadId = useMemo(() => workspaceThreadId(workspaceId), [workspaceId]);
  const terminalState = useTerminalStateStore((state) =>
    selectThreadTerminalState(state.terminalStateByThreadId, threadId),
  );
  const openTerminalThreadPage = useTerminalStateStore((state) => state.openTerminalThreadPage);
  const setTerminalHeight = useTerminalStateStore((state) => state.setTerminalHeight);
  const setTerminalMetadata = useTerminalStateStore((state) => state.setTerminalMetadata);
  const splitTerminalRight = useTerminalStateStore((state) => state.splitTerminalRight);
  const splitTerminalDown = useTerminalStateStore((state) => state.splitTerminalDown);
  const newTerminal = useTerminalStateStore((state) => state.newTerminal);
  const newTerminalTab = useTerminalStateStore((state) => state.newTerminalTab);
  const setActiveTerminal = useTerminalStateStore((state) => state.setActiveTerminal);
  const closeTerminalState = useTerminalStateStore((state) => state.closeTerminal);
  const closeTerminalGroup = useTerminalStateStore((state) => state.closeTerminalGroup);
  const resizeTerminalSplit = useTerminalStateStore((state) => state.resizeTerminalSplit);
  const setTerminalActivity = useTerminalStateStore((state) => state.setTerminalActivity);
  const applyWorkspaceLayoutPreset = useTerminalStateStore(
    (state) => state.applyWorkspaceLayoutPreset,
  );
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [workspaceComposerPrefill, setWorkspaceComposerPrefill] = useState("");
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const workspaceLayoutPresetId = workspace?.layoutPresetId ?? DEFAULT_WORKSPACE_LAYOUT_PRESET_ID;
  // 优先使用用户在 picker 中为该 workspace 选定的目录;
  // 其次回退到全局 homeDir(由 setWorkspaceCwd 同步刷新),保证 terminal 默认 cwd 一致。
  const workspaceCwd = workspace?.cwd ?? homeDir;

  // Code 模式快捷操作配置
  const codeQuickActions = useMemo(
    () => [
      { id: "appDev", icon: GoCode, label: messages.landing.quickActionAppDev },
      { id: "projectInsight", icon: GoSearch, label: messages.landing.quickActionProjectInsight },
      { id: "debugFix", icon: GoBug, label: messages.landing.quickActionDebugFix },
      { id: "codeReview", icon: GoGitBranch, label: messages.landing.quickActionCodeReview },
    ],
    [messages.landing],
  );

  /**
   * Workspace 快捷操作回调：预填 Code 模式 composer
   */
  const handleWorkspaceQuickAction = useCallback(
    (actionId: string) => {
      const promptMap: Record<string, string> = {
        appDev: messages.landing.quickActionAppDev + "，需求是：",
        projectInsight: messages.landing.quickActionProjectInsight + "：",
        debugFix: messages.landing.quickActionDebugFix + "：",
        codeReview: messages.landing.quickActionCodeReview + "：",
      };
      const promptText = promptMap[actionId] ?? "";
      if (promptText) {
        setWorkspaceComposerPrefill(promptText);
      }
    },
    [messages.landing],
  );

  /**
   * Code 模式 composer 提交：创建新线程并导航到聊天页。
   * - 若用户尚未选定目录,主动调起 picker;若用户取消,则只清空 prompt,等用户再次操作。
   * - 若工作区模式为 worktree,先基于 cwd 创建 git worktree 再交给后端。
   */
  const handleWorkspaceComposerSubmit = useCallback(
    async (promptText: string) => {
      if (!promptText.trim() || isCreatingThread) return;
      let effectiveCwd = workspaceCwd;
      if (!effectiveCwd) {
        try {
          const picked = await pickWorkspaceFolder({
            workspaceId,
            mode: workspace?.mode ?? "local",
          });
          if (!picked) {
            return;
          }
          effectiveCwd = picked;
        } catch (error) {
          console.error("[WorkspaceView] pickWorkspaceFolder failed", error);
          return;
        }
      }
      setIsCreatingThread(true);
      setPendingInitialPrompt(promptText.trim());
      await handleNewChat({ fresh: true, cwd: effectiveCwd });
      setIsCreatingThread(false);
    },
    [
      isCreatingThread,
      handleNewChat,
      workspaceCwd,
      workspace?.mode,
      workspaceId,
      pickWorkspaceFolder,
    ],
  );

  useEffect(() => {
    ensureWorkspacePage(workspaceId);
  }, [ensureWorkspacePage, workspaceId]);

  const restoreTerminalWorkspace = useCallback(
    (presetId: WorkspaceLayoutPresetId = workspaceLayoutPresetId) => {
      const nextTerminalIds = ensureTerminalIdsForPreset(
        terminalState.terminalIds,
        presetId,
        randomTerminalId,
      );
      applyWorkspaceLayoutPreset(threadId, presetId, nextTerminalIds);
      openTerminalThreadPage(threadId, { terminalOnly: true });
      setFocusRequestId((value) => value + 1);
    },
    [
      applyWorkspaceLayoutPreset,
      openTerminalThreadPage,
      terminalState.terminalIds,
      threadId,
      workspaceLayoutPresetId,
    ],
  );

  const createWorkspaceTerminal = useCallback(() => {
    if (!homeDir) {
      return;
    }
    if (!terminalState.terminalOpen) {
      restoreTerminalWorkspace();
      return;
    }
    const terminalId = randomTerminalId();
    newTerminal(threadId, terminalId);
    setFocusRequestId((value) => value + 1);
  }, [homeDir, newTerminal, restoreTerminalWorkspace, terminalState.terminalOpen, threadId]);

  const splitWorkspaceTerminalRight = useCallback(() => {
    const terminalId = randomTerminalId();
    splitTerminalRight(threadId, terminalId);
    setFocusRequestId((value) => value + 1);
  }, [splitTerminalRight, threadId]);

  const splitWorkspaceTerminalDown = useCallback(() => {
    const terminalId = randomTerminalId();
    splitTerminalDown(threadId, terminalId);
    setFocusRequestId((value) => value + 1);
  }, [splitTerminalDown, threadId]);

  const createWorkspaceTerminalTab = useCallback(
    (targetTerminalId: string) => {
      const terminalId = randomTerminalId();
      newTerminalTab(threadId, targetTerminalId, terminalId);
      setFocusRequestId((value) => value + 1);
    },
    [newTerminalTab, threadId],
  );
  const createWorkspaceTerminalFromShortcut = useCallback(() => {
    const action = resolveTerminalNewAction({
      terminalOpen: terminalState.terminalOpen,
      activeTerminalId: terminalState.activeTerminalId,
      activeTerminalGroupId: terminalState.activeTerminalGroupId,
      terminalGroups: terminalState.terminalGroups,
    });

    if (action.kind === "new-group") {
      createWorkspaceTerminal();
      return;
    }

    createWorkspaceTerminalTab(action.targetTerminalId);
  }, [
    createWorkspaceTerminal,
    createWorkspaceTerminalTab,
    terminalState.activeTerminalGroupId,
    terminalState.activeTerminalId,
    terminalState.terminalGroups,
    terminalState.terminalOpen,
  ]);

  const moveTerminalToNewGroup = useCallback(
    (terminalId: string) => {
      newTerminal(threadId, terminalId);
      setFocusRequestId((value) => value + 1);
    },
    [newTerminal, threadId],
  );

  const activateTerminal = useCallback(
    (terminalId: string) => {
      setActiveTerminal(threadId, terminalId);
      setFocusRequestId((value) => value + 1);
    },
    [setActiveTerminal, threadId],
  );

  useEffect(() => {
    const onMenuAction = tauriBridge.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "new-terminal-tab") return;
      createWorkspaceTerminalFromShortcut();
    });

    return () => {
      unsubscribe?.();
    };
  }, [createWorkspaceTerminalFromShortcut]);

  const closeTerminal = useCallback(
    async (terminalId: string) => {
      const api = readNativeApi();
      const confirmed = await confirmTerminalTabClose({
        api,
        enabled: settings.confirmTerminalTabClose,
        terminalTitle: resolveTerminalCloseTitle({
          terminalId,
          terminalLabelsById: terminalState.terminalLabelsById,
          terminalTitleOverridesById: terminalState.terminalTitleOverridesById,
        }),
      });
      if (!confirmed) {
        return;
      }
      terminalRuntimeRegistry.disposeTerminal(threadId, terminalId);
      const fallbackExitWrite = () =>
        api?.terminal.write({ threadId, terminalId, data: "exit\n" }).catch(() => undefined);

      if (api && "close" in api.terminal && typeof api.terminal.close === "function") {
        void api.terminal
          .close({
            threadId,
            terminalId,
            deleteHistory: true,
          })
          .catch(() => fallbackExitWrite());
      } else {
        void fallbackExitWrite();
      }

      closeTerminalState(threadId, terminalId);
      setFocusRequestId((value) => value + 1);
    },
    [
      closeTerminalState,
      settings.confirmTerminalTabClose,
      terminalState.terminalLabelsById,
      terminalState.terminalTitleOverridesById,
      threadId,
    ],
  );

  const terminalDrawerProps = useMemo(
    () => ({
      threadId,
      cwd: homeDir ?? "",
      height: terminalState.terminalHeight,
      terminalIds: terminalState.terminalIds,
      terminalLabelsById: terminalState.terminalLabelsById,
      terminalTitleOverridesById: terminalState.terminalTitleOverridesById,
      terminalCliKindsById: terminalState.terminalCliKindsById,
      terminalAttentionStatesById: terminalState.terminalAttentionStatesById ?? {},
      runningTerminalIds: terminalState.runningTerminalIds,
      activeTerminalId: terminalState.activeTerminalId,
      terminalGroups: terminalState.terminalGroups,
      activeTerminalGroupId: terminalState.activeTerminalGroupId,
      focusRequestId,
      onSplitTerminal: splitWorkspaceTerminalRight,
      onSplitTerminalDown: splitWorkspaceTerminalDown,
      onNewTerminal: createWorkspaceTerminal,
      onNewTerminalTab: createWorkspaceTerminalTab,
      onMoveTerminalToGroup: moveTerminalToNewGroup,
      onActiveTerminalChange: activateTerminal,
      onCloseTerminal: closeTerminal,
      onCloseTerminalGroup: (groupId: string) => {
        closeTerminalGroup(threadId, groupId);
      },
      onHeightChange: (height: number) => {
        setTerminalHeight(threadId, height);
      },
      onResizeTerminalSplit: (groupId: string, splitId: string, weights: number[]) => {
        resizeTerminalSplit(threadId, groupId, splitId, weights);
      },
      onTerminalMetadataChange: (
        terminalId: string,
        metadata: { cliKind: TerminalCliKind | null; label: string },
      ) => {
        setTerminalMetadata(threadId, terminalId, metadata);
      },
      onTerminalActivityChange: (
        terminalId: string,
        activity: {
          hasRunningSubprocess: boolean;
          agentState: "running" | "attention" | "review" | null;
        },
      ) => {
        setTerminalActivity(threadId, terminalId, activity);
      },
      onAddTerminalContext: () => {},
    }),
    [
      activateTerminal,
      closeTerminal,
      closeTerminalGroup,
      createWorkspaceTerminal,
      createWorkspaceTerminalTab,
      focusRequestId,
      homeDir,
      moveTerminalToNewGroup,
      resizeTerminalSplit,
      setTerminalActivity,
      setTerminalHeight,
      setTerminalMetadata,
      splitWorkspaceTerminalDown,
      splitWorkspaceTerminalRight,
      terminalState.activeTerminalGroupId,
      terminalState.activeTerminalId,
      terminalState.terminalAttentionStatesById,
      terminalState.runningTerminalIds,
      terminalState.terminalCliKindsById,
      terminalState.terminalGroups,
      terminalState.terminalHeight,
      terminalState.terminalIds,
      terminalState.terminalLabelsById,
      terminalState.terminalTitleOverridesById,
      threadId,
    ],
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <AppTopChrome
          logo={
            <span className="inline-flex size-5 shrink-0 items-center justify-center">
              <YdszBuddyWordmark />
            </span>
          }
          title={
            <h2 className="max-w-[clamp(16rem,50vw,40rem)] cursor-default truncate text-sm font-medium text-foreground">
              ydsz-shared::
            </h2>
          }
          actions={
            <div className="flex items-center gap-1" data-no-drag>
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                disabled={!workspaceCwd}
                title={workspaceCwd ? undefined : messages.workspaceModePicker.chooseFolder}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2.5 text-[11px] font-medium text-foreground/80 transition-colors",
                  "hover:bg-muted/50 hover:text-foreground",
                  !workspaceCwd && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="text-muted-foreground/60">在</span>
                <span className="text-amber-500/80">📁</span>
                <span className="max-w-[80px] truncate">{workspaceCwd ? workspaceCwd.split(/[\\/]/).pop() : "…"}</span>
                <span className="text-muted-foreground/60">中打开</span>
              </button>
              <span className="mx-0.5 h-4 w-px bg-border/50" />
              <button
                type="button"
                onClick={() => restoreTerminalWorkspace()}
                disabled={!workspaceCwd}
                title={workspaceCwd ? messages.landing.openTerminal : messages.workspaceModePicker.chooseFolder}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors",
                  "hover:bg-muted/50 hover:text-foreground",
                  !workspaceCwd && "cursor-not-allowed opacity-50",
                )}
              >
                <GoTerminal className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                disabled={!workspaceCwd}
                title={workspaceCwd ? messages.codeEditor.openEditor : messages.workspaceModePicker.chooseFolder}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors",
                  "hover:bg-muted/50 hover:text-foreground",
                  !workspaceCwd && "cursor-not-allowed opacity-50",
                )}
              >
                <GoPencil className="size-3.5" />
              </button>
            </div>
          }
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {terminalState.terminalOpen ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* 编辑器 + 终端可共存：编辑器在顶部，终端在底部 */}
              {editorOpen && workspaceCwd ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-3 py-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                      {messages.codeEditor.files}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditorOpen(false)}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <GoChevronLeft className="size-3" />
                      {messages.codeEditor.closeEditor}
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <CodeEditorPanel cwd={workspaceCwd} />
                  </div>
                </div>
              ) : null}
              <ThreadTerminalDrawer
                key={`${workspaceId}-workspace`}
                {...terminalDrawerProps}
                presentationMode="workspace"
                isVisible
              />
            </div>
          ) : editorOpen && workspaceCwd ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-3 py-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {messages.codeEditor.files}
                </span>
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <GoChevronLeft className="size-3" />
                  {messages.codeEditor.closeEditor}
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <CodeEditorPanel cwd={workspaceCwd} />
              </div>
            </div>
          ) : (
            <div className="relative flex h-full items-center justify-center px-3 sm:px-5">
              <div className="flex w-full max-w-3xl flex-col items-center select-none">
                {/* Mode badge */}
                <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[12px] font-medium tracking-wide text-sky-700 dark:text-sky-300">
                  <GoTerminal className="size-3.5" />
                  {messages.landing.codeBadge}
                </span>

                {/* Title */}
                <h1 className="text-center text-[28px] font-semibold tracking-[-0.02em] text-foreground/95 sm:text-[34px]">
                  {messages.landing.codeTitle}
                </h1>
                <p className="mt-3 max-w-xl text-center text-[13px] leading-relaxed text-muted-foreground/75">
                  {messages.landing.codeSubtitle}
                </p>

                {/* Composer */}
                <div className="mt-8 w-full">
                  <LandingComposer
                    onSubmit={(prompt) => void handleWorkspaceComposerSubmit(prompt)}
                    disabled={!workspaceCwd || isCreatingThread}
                    prefilledPrompt={workspaceComposerPrefill}
                    onPrefillConsumed={() => setWorkspaceComposerPrefill("")}
                    placeholder={messages.landing.codeComposerPlaceholder}
                  />
                </div>

                {/* Trae 风格：模式选择 + 选择文件夹 */}
                <div className="mt-4 flex w-full justify-center">
                  <WorkspaceModePicker
                    workspaceId={workspaceId}
                    cwd={workspace?.cwd ?? null}
                    mode={workspace?.mode ?? "local"}
                  />
                </div>

                {/* Quick actions */}
                <div className="mt-6 flex w-full flex-col items-center gap-3">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
                    {messages.landing.quickActionsHeading}
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {codeQuickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.id}
                          type="button"
                          disabled={!workspaceCwd}
                          onClick={() => handleWorkspaceQuickAction(action.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-normal transition-all duration-150",
                            "border-border/60 bg-background/80 text-foreground/80",
                            "hover:scale-[1.02] hover:border-border hover:bg-muted/50 hover:text-foreground",
                            "active:scale-[0.98]",
                            !workspaceCwd && "cursor-not-allowed opacity-50",
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" />
                          <span>{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}
