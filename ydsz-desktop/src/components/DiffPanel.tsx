/**
 * @file Diff 面板主组件
 *
 * ChatView 右侧（或底部）展示的 diff 面板：
 *
 * - **多模式**：`inline` / `sheet` / `sidebar`
 * - **多数据源**：单 turn diff、工作区未提交 diff、PR diff
 * - **虚拟列表**：长 diff 使用 `@pierre/diffs` 虚拟化渲染
 * - **行内/分栏切换**：unified ↔ split
 * - **主题联动**：跟随应用主题切换 diff 主题
 *
 * ## 核心导出
 *
 * - `DiffPanel`（默认导出）：主组件
 *
 * ## 使用场景
 *
 * - ChatView 内嵌 diff 面板
 * - 独立 diff 浮层（SheetView）
 *
 * ## 注意事项
 *
 * - 路由 `?turnId=` 决定加载的 diff 源
 * - 工作区 diff 周期性 refetch（`GIT_WORKING_TREE_DIFF_LIVE_REFETCH_INTERVAL_MS`）
 * - 文档级 diff 渲染使用 `DiffWorkerPoolProvider` 注入的 worker pool
 */
import { FileDiff, type FileDiffMetadata, Virtualizer } from "@pierre/diffs/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ThreadId, type TurnId, type AstGrepLanguage } from "~/contracts";
import { FaPlusMinus } from "react-icons/fa6";
import { LuWrapText } from "react-icons/lu";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns2Icon,
  CopyIcon,
  DiffIcon,
  AdjustmentsIcon,
  MessageCircleIcon,
  RotateCcwIcon,
  Rows3Icon,
  SquarePenIcon,
  TextWrapIcon,
  XIcon,
} from "~/lib/icons";
import {
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  GIT_WORKING_TREE_DIFF_LIVE_REFETCH_INTERVAL_MS,
  gitBranchesQueryOptions,
  gitQueryKeys,
  gitStatusQueryOptions,
  gitSummarizeDiffQueryOptions,
  gitWorkingTreeDiffQueryOptions,
} from "~/lib/gitReactQuery";
import { checkpointDiffQueryOptions } from "~/lib/providerReactQuery";
import { cn } from "~/lib/utils";
import { newCommandId, newMessageId } from "~/lib/utils";
import { readNativeApi } from "../nativeApi";
import { parseDiffRouteSearch, stripDiffSearchParams } from "../diffRouteSearch";
import { useTheme } from "../hooks/useTheme";
import {
  buildAcceptedPatch,
  buildPatchCacheKey,
  getRenderablePatch,
  resolveDiffCopyText,
  resolveDiffThemeName,
  summarizePatchStats,
} from "../lib/diffRendering";
import { resolveDiffEnvironmentState } from "../lib/threadEnvironment";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import {
  isRepoDiffScope,
  REPO_DIFF_SCOPE_LABELS,
  useRepoDiffScopeStore,
} from "../repoDiffScopeStore";
import { useStore } from "../store";
import { createProjectSelector, createThreadSelector } from "../storeSelectors";
import { getProviderStartOptions, useAppSettings } from "../appSettings";
import { useComposerDraftStore } from "../composerDraftStore";
import { formatShortTimestamp } from "../timestampFormat";
import ChatMarkdown from "./ChatMarkdown";
import { resolveDiffPanelThread } from "./DiffPanel.logic";
import { DiffPanelLoadingState, DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";
import { DiffInlineEditBar } from "./DiffInlineEditBar";
import { LineReviewCommentsPanel, type LineReviewCommentDraft } from "./LineReviewCommentsPanel";
import {
  selectOpenCommentCount,
  useReviewCommentsStore,
} from "../reviewCommentsStore";
import { Button } from "./ui/button";
import { ReviewDiffToolbar, type HunkDecisions } from "./chat/ReviewDiffToolbar";
import {
  Menu,
  MenuCheckboxItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "./ui/menu";
import { ToggleGroup, Toggle } from "./ui/toggle-group";
import { toastManager } from "./ui/toast";
import { FileEntryIcon } from "./chat/FileEntryIcon";
import { DiffStatLabel, hasNonZeroStat } from "./chat/DiffStatLabel";
import { type SplitViewPanePanelState } from "../splitViewStore";
import { hasLiveTurnTailWork, isLatestTurnSettled } from "../session-logic";

type DiffRenderMode = "stacked" | "split";
type DiffSurfaceMode = "review" | "summary" | "total" | "comments";
type DiffThemeType = "light" | "dark";

function buildDiffPanelUnsafeCSS(theme: "light" | "dark"): string {
  const titleColor = theme === "dark" ? "#6073CC" : "#526FFF";
  return `
:host {
  /* Route the entire diff viewer through the chat code font so custom code fonts reach line numbers too. */
  --diffs-font-family: var(--font-chat-code-family);
  --diffs-header-font-family: var(--font-chat-code-family);
  /* Honor the user-chosen chat code font size from settings instead of the library default (13px). */
  --diffs-font-size: var(--app-font-size-chat-code, 11px);
  font-family: var(--font-chat-code-family) !important;
  font-size: var(--app-font-size-chat-code, 11px) !important;
}

[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  /* Re-assert the code font inside the library chrome because these nodes live in shadow-rooted markup. */
  --diffs-font-family: var(--font-chat-code-family) !important;
  --diffs-header-font-family: var(--font-chat-code-family) !important;
  --diffs-font-size: var(--app-font-size-chat-code, 11px) !important;
  font-family: var(--font-chat-code-family) !important;
  font-size: var(--app-font-size-chat-code, 11px) !important;
  --diffs-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--background) 80%,
    var(--destructive)
  );

  background-color: var(--diffs-bg) !important;
}

[data-file-info] {
  font-family: var(--font-chat-code-family) !important;
  font-size: var(--app-font-size-chat-code, 11px) !important;
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-block-color: var(--border) !important;
  color: var(--foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-bottom: 1px solid var(--border) !important;
  cursor: pointer;
}

/* Hide the default change-type icon (blue circle) …replaced by chevron + file-type icon. */
[data-change-icon] {
  display: none;
}

[data-title] {
  font-family: var(--font-chat-code-family) !important;
  font-size: var(--app-font-size-chat-code, 11px) !important;
  cursor: pointer;
  color: ${titleColor} !important;
}
`;
}

function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? "";
  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }
  return raw;
}

function buildFileDiffRenderKey(fileDiff: FileDiffMetadata): string {
  return fileDiff.cacheKey ?? `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;
}

/**
 * 根据文件后缀推断 ast-grep 目标语言。
 *
 * - .ts/.tsx → typescript
 * - .js/.jsx/.mjs/.cjs → javascript
 * - .rs → rust
 * - .py → python
 * - 其他 → 默认 typescript(ast-grep 会尝试解析,失败时由后端报错)
 */
function detectAstGrepLanguage(filePath: string): AstGrepLanguage {
  const ext = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "javascript";
  if (ext === "rs") return "rust";
  if (ext === "py") return "python";
  return "typescript";
}

/**
 * 将相对文件路径与工作区 cwd 拼接为后端可识别的路径。
 *
 * 后端 `register_ast_grep_rewrite` 使用 `PathBuf::from(input.file_path)` + `is_file()`,
 * 因此需要绝对路径或相对服务器 cwd 的路径。Rust 的 PathBuf 在 Windows 上
 * 能正确处理混合分隔符(`/` 与 `\`),所以这里简单用 `/` 拼接即可。
 */
function resolveAstGrepFilePath(relativePath: string, cwd: string | null): string {
  if (!cwd) return relativePath;
  if (cwd.endsWith("/") || cwd.endsWith("\\")) return cwd + relativePath;
  return `${cwd}/${relativePath}`;
}

interface DiffPanelProps {
  mode?: DiffPanelMode;
  threadId?: ThreadId | null;
  panelState?: Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">;
  onUpdatePanelState?: (
    patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
  ) => void;
  onClosePanel?: () => void;
  /**
   * 撤销该 turn 触发的所有修改（将该 thread 回滚到该 turn 之前的 checkpoint）。
   * - 由 ChatView 提供，封装 thread.turn.interrupt + thread.checkpoint.revert 调用
   * - 仅在该 turn 是最后一个可回滚目标时启用
   */
  onRevertTurn?: (params: { turnId: TurnId; targetTurnCount: number }) => void;
  liveRefreshEnabled?: boolean;
}

export { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";

export default function DiffPanel({
  mode = "inline",
  threadId: controlledThreadId,
  panelState,
  onUpdatePanelState,
  onClosePanel,
  onRevertTurn,
  liveRefreshEnabled = true,
}: DiffPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const { settings } = useAppSettings();
  const providerOptions = useMemo(() => getProviderStartOptions(settings), [settings]);
  const [diffRenderMode, setDiffRenderMode] = useState<DiffRenderMode>("stacked");
  const [diffWordWrap, setDiffWordWrap] = useState(settings.diffWordWrap);
  const [diffIgnoreWhitespace, setDiffIgnoreWhitespace] = useState(true);
  const [surfaceMode, setSurfaceMode] = useState<DiffSurfaceMode>("review");
  const repoDiffScope = useRepoDiffScopeStore((store) => store.scope);
  const setRepoDiffScope = useRepoDiffScopeStore((store) => store.setScope);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(() => new Set());
  // Per-file hunk accept/reject state: Map<cacheKey, Map<hunkIndex, 'accept' | 'reject'>>
  const [acceptedHunks, setAcceptedHunks] = useState<HunkDecisions>(new Map());
  // Cmd+K inline edit 浮层状态:仅当用户触发时非 null
  const [inlineEditState, setInlineEditState] = useState<{
    filePath: string;
    language: AstGrepLanguage;
  } | null>(null);
  // 行级 Review 评论的"草稿"状态:由 diff 行号旁的 💬 按钮触发,
  // 传给 LineReviewCommentsPanel 弹起评论编辑器;提交/取消后清空。
  const [pendingCommentDraft, setPendingCommentDraft] =
    useState<LineReviewCommentDraft | null>(null);
  const patchViewportRef = useRef<HTMLDivElement>(null);
  const turnStripRef = useRef<HTMLDivElement>(null);
  const previousDiffOpenRef = useRef(false);
  const [canScrollTurnStripLeft, setCanScrollTurnStripLeft] = useState(false);
  const [canScrollTurnStripRight, setCanScrollTurnStripRight] = useState(false);
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const diffSearch = useSearch({ strict: false, select: (search) => parseDiffRouteSearch(search) });
  const diffOpen = panelState ? panelState.panel === "diff" : diffSearch.diff === "1";
  const activeThreadId = controlledThreadId ?? routeThreadId;
  const serverThread = useStore(
    useMemo(() => createThreadSelector(activeThreadId), [activeThreadId]),
  );
  const draftThread = useComposerDraftStore((store) =>
    activeThreadId ? (store.draftThreadsByThreadId[activeThreadId] ?? null) : null,
  );
  const fallbackDraftProjectId = draftThread?.projectId ?? null;
  const fallbackDraftProject = useStore(
    useMemo(() => createProjectSelector(fallbackDraftProjectId), [fallbackDraftProjectId]),
  );
  // Keep diff summary access available for draft chats before the first turn promotes them into the server store.
  const activeThread = useMemo(
    () =>
      resolveDiffPanelThread({
        threadId: activeThreadId,
        serverThread,
        draftThread,
        fallbackModelSelection: fallbackDraftProject?.defaultModelSelection ?? null,
      }),
    [activeThreadId, draftThread, fallbackDraftProject?.defaultModelSelection, serverThread],
  );
  const activeProjectId = activeThread?.projectId ?? draftThread?.projectId ?? null;
  const activeProject = useStore(
    useMemo(() => createProjectSelector(activeProjectId), [activeProjectId]),
  );
  const resolvedThreadEnvMode =
    serverThread?.envMode ?? draftThread?.envMode ?? activeThread?.envMode;
  const resolvedThreadWorktreePath =
    serverThread?.worktreePath ?? draftThread?.worktreePath ?? activeThread?.worktreePath ?? null;
  // W3-1: Review 模式检测 — interactionMode 来自 serverThread / draftThread / activeThread 三层回退
  const resolvedInteractionMode =
    serverThread?.interactionMode ?? draftThread?.interactionMode ?? activeThread?.interactionMode;
  const isReviewMode = resolvedInteractionMode === "review";
  const diffEnvironmentState = resolveDiffEnvironmentState({
    projectCwd: activeProject?.cwd ?? null,
    envMode: resolvedThreadEnvMode,
    worktreePath: resolvedThreadWorktreePath,
  });
  const diffEnvironmentPending = diffEnvironmentState.pending;
  const activeCwd = diffEnvironmentState.cwd;
  const gitBranchesQuery = useQuery(gitBranchesQueryOptions(activeCwd ?? null));
  const gitStatusQuery = useQuery(gitStatusQueryOptions(activeCwd ?? null));
  const isGitRepo = gitBranchesQuery.data?.isRepo ?? true;
  const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } =
    useTurnDiffSummaries(activeThread);
  const repoDiffLiveRefreshIntervalMs = useMemo(() => {
    if (!liveRefreshEnabled) return false;
    if (!activeThread) return false;
    const hasLiveTail = hasLiveTurnTailWork({
      latestTurn: activeThread.latestTurn,
      messages: activeThread.messages,
      activities: activeThread.activities,
      session: activeThread.session,
    });
    return !isLatestTurnSettled(activeThread.latestTurn, activeThread.session) || hasLiveTail
      ? GIT_WORKING_TREE_DIFF_LIVE_REFETCH_INTERVAL_MS
      : false;
  }, [activeThread, liveRefreshEnabled]);
  const orderedTurnDiffSummaries = useMemo(
    () =>
      [...turnDiffSummaries].toSorted((left, right) => {
        const leftTurnCount =
          left.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[left.turnId] ?? 0;
        const rightTurnCount =
          right.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[right.turnId] ?? 0;
        if (leftTurnCount !== rightTurnCount) {
          return rightTurnCount - leftTurnCount;
        }
        return right.completedAt.localeCompare(left.completedAt);
      }),
    [inferredCheckpointTurnCountByTurnId, turnDiffSummaries],
  );

  const selectedTurnId = panelState
    ? (panelState.diffTurnId ?? null)
    : (diffSearch.diffTurnId ?? null);
  const selectedFilePath =
    selectedTurnId !== null
      ? panelState
        ? (panelState.diffFilePath ?? null)
        : (diffSearch.diffFilePath ?? null)
      : null;
  const selectedTurn =
    selectedTurnId === null
      ? undefined
      : (orderedTurnDiffSummaries.find((summary) => summary.turnId === selectedTurnId) ??
        orderedTurnDiffSummaries[0]);
  // 当前 thread/turn 维度下的未解决评论数,用于 Comments Tab 的 Badge。
  // turnId 跟随选中的 turn(未选中时挂到 null 维度,即工作区级评论)。
  const activeCommentTurnId: TurnId | null = selectedTurn?.turnId ?? null;
  const allReviewComments = useReviewCommentsStore((s) => s.comments);
  const openCommentCount = useMemo(
    () =>
      activeThreadId
        ? selectOpenCommentCount(allReviewComments, activeThreadId, activeCommentTurnId)
        : 0,
    [allReviewComments, activeThreadId, activeCommentTurnId],
  );
  const selectedCheckpointTurnCount =
    selectedTurn &&
    (selectedTurn.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[selectedTurn.turnId]);
  // B-4 消息撤回：DiffPanel 头部的"撤销此次修改"按钮，仅在选中最新可回滚 turn 时启用。
  // 早期 turn 不可独立回滚（会孤立后续 turn 的 diff），所以按钮仅暴露给 latest 目标。
  const latestRevertibleTurn = useMemo(() => {
    if (orderedTurnDiffSummaries.length === 0) return null;
    const first = orderedTurnDiffSummaries[0];
    if (!first) return null;
    const checkpointTurnCount =
      first.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[first.turnId];
    if (typeof checkpointTurnCount !== "number" || checkpointTurnCount <= 0) return null;
    return { turnId: first.turnId, checkpointTurnCount };
  }, [inferredCheckpointTurnCountByTurnId, orderedTurnDiffSummaries]);
  const revertTurnButton = useMemo(() => {
    if (!onRevertTurn || !selectedTurn || !latestRevertibleTurn) return null;
    if (selectedTurn.turnId !== latestRevertibleTurn.turnId) return null;
    const targetTurnCount = Math.max(0, latestRevertibleTurn.checkpointTurnCount - 1);
    return {
      title: `撤销 Turn ${latestRevertibleTurn.checkpointTurnCount} 的修改`,
      disabled: false,
      disabledTitle: undefined as string | undefined,
      onClick: () => {
        onRevertTurn({
          turnId: selectedTurn.turnId,
          targetTurnCount,
        });
      },
    };
  }, [latestRevertibleTurn, onRevertTurn, selectedTurn]);
  const selectedCheckpointRange = useMemo(
    () =>
      typeof selectedCheckpointTurnCount === "number"
        ? {
            fromTurnCount: Math.max(0, selectedCheckpointTurnCount - 1),
            toTurnCount: selectedCheckpointTurnCount,
          }
        : null,
    [selectedCheckpointTurnCount],
  );
  const conversationCheckpointTurnCount = useMemo(() => {
    const turnCounts = orderedTurnDiffSummaries
      .map(
        (summary) =>
          summary.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[summary.turnId],
      )
      .filter((value): value is number => typeof value === "number");
    if (turnCounts.length === 0) {
      return undefined;
    }
    const latest = Math.max(...turnCounts);
    return latest > 0 ? latest : undefined;
  }, [inferredCheckpointTurnCountByTurnId, orderedTurnDiffSummaries]);
  const conversationCheckpointRange = useMemo(
    () =>
      !selectedTurn && typeof conversationCheckpointTurnCount === "number"
        ? {
            fromTurnCount: 0,
            toTurnCount: conversationCheckpointTurnCount,
          }
        : null,
    [conversationCheckpointTurnCount, selectedTurn],
  );
  const activeCheckpointRange = selectedTurn
    ? selectedCheckpointRange
    : conversationCheckpointRange;
  const conversationCacheScope = useMemo(() => {
    if (selectedTurn || orderedTurnDiffSummaries.length === 0) {
      return null;
    }
    return `conversation:${orderedTurnDiffSummaries.map((summary) => summary.turnId).join(",")}`;
  }, [orderedTurnDiffSummaries, selectedTurn]);
  const activeCheckpointDiffQuery = useQuery(
    checkpointDiffQueryOptions({
      threadId: activeThreadId,
      fromTurnCount: activeCheckpointRange?.fromTurnCount ?? null,
      toTurnCount: activeCheckpointRange?.toTurnCount ?? null,
      ignoreWhitespace: diffIgnoreWhitespace,
      cacheScope: selectedTurn ? `turn:${selectedTurn.turnId}` : conversationCacheScope,
      enabled: isGitRepo && !diffEnvironmentPending,
    }),
  );
  const selectedTurnCheckpointDiff = selectedTurn
    ? activeCheckpointDiffQuery.data?.diff
    : undefined;
  const conversationCheckpointDiff = selectedTurn
    ? undefined
    : activeCheckpointDiffQuery.data?.diff;
  const isLoadingCheckpointDiff = activeCheckpointDiffQuery.isLoading;
  const checkpointDiffError =
    activeCheckpointDiffQuery.error instanceof Error
      ? activeCheckpointDiffQuery.error.message
      : activeCheckpointDiffQuery.error
        ? "Failed to load checkpoint diff."
        : null;

  const selectedPatch = selectedTurn ? selectedTurnCheckpointDiff : conversationCheckpointDiff;
  const hasResolvedPatch = typeof selectedPatch === "string";
  const hasNoNetChanges = hasResolvedPatch && selectedPatch.trim().length === 0;
  const normalizedSelectedPatch = hasResolvedPatch ? selectedPatch.trim() : null;
  const repoDiffQuery = useQuery(
    gitWorkingTreeDiffQueryOptions({
      cwd: activeCwd ?? null,
      scope: repoDiffScope,
      enabled: diffOpen && !diffEnvironmentPending,
      refetchInterval: repoDiffLiveRefreshIntervalMs,
    }),
  );
  const repoPatch = repoDiffQuery.data?.patch;
  const hasResolvedRepoPatch = typeof repoPatch === "string";
  const hasNoRepoChanges = hasResolvedRepoPatch && repoPatch.trim().length === 0;
  const normalizedRepoPatch = hasResolvedRepoPatch ? repoPatch.trim() : null;
  const repoDiffError =
    repoDiffQuery.error instanceof Error
      ? repoDiffQuery.error.message
      : repoDiffQuery.error
        ? "Failed to load repo diff."
        : null;
  const branchHasCommittedChanges = (gitStatusQuery.data?.aheadCount ?? 0) > 0;

  useEffect(() => {
    if (!hasResolvedRepoPatch || !activeCwd) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: gitQueryKeys.status(activeCwd) });
    void queryClient.invalidateQueries({ queryKey: gitQueryKeys.branches(activeCwd) });
  }, [activeCwd, hasResolvedRepoPatch, queryClient, repoPatch]);

  useEffect(() => {
    if (
      diffOpen &&
      repoDiffScope === "workingTree" &&
      hasResolvedRepoPatch &&
      hasNoRepoChanges &&
      branchHasCommittedChanges
    ) {
      setRepoDiffScope("branch");
      setSurfaceMode("total");
    }
  }, [
    branchHasCommittedChanges,
    diffOpen,
    hasNoRepoChanges,
    hasResolvedRepoPatch,
    repoDiffScope,
    setRepoDiffScope,
  ]);

  const activeReviewPatch = surfaceMode === "total" ? repoPatch : selectedPatch;
  const activeReviewError = surfaceMode === "total" ? repoDiffError : checkpointDiffError;
  const activeReviewIsLoading =
    surfaceMode === "total" ? repoDiffQuery.isLoading : isLoadingCheckpointDiff;
  const activeReviewHasNoChanges = surfaceMode === "total" ? hasNoRepoChanges : hasNoNetChanges;
  const isSidebarMode = mode === "sidebar";
  const { copyToClipboard, isCopied: isSummaryCopied } = useCopyToClipboard();
  const { copyToClipboard: copyDiffToClipboard, isCopied: isDiffCopied } = useCopyToClipboard();
  const diffCopyText = useMemo(() => resolveDiffCopyText(activeReviewPatch), [activeReviewPatch]);
  const renderablePatch = useMemo(
    () => getRenderablePatch(activeReviewPatch, `diff-panel:${resolvedTheme}`),
    [activeReviewPatch, resolvedTheme],
  );
  const renderableFiles = useMemo(() => {
    if (!renderablePatch || renderablePatch.kind !== "files") {
      return [];
    }
    return renderablePatch.files.toSorted((left, right) =>
      resolveFileDiffPath(left).localeCompare(resolveFileDiffPath(right), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [renderablePatch]);
  const fileDiffByKey = useMemo(() => {
    const map = new Map<string, FileDiffMetadata>();
    for (const fileDiff of renderableFiles) {
      map.set(buildFileDiffRenderKey(fileDiff), fileDiff);
    }
    return map;
  }, [renderableFiles]);
  const totalPatchStat = useMemo(() => summarizePatchStats(repoPatch), [repoPatch]);

  useEffect(() => {
    if (diffOpen && !previousDiffOpenRef.current) {
      setDiffWordWrap(settings.diffWordWrap);
      setSurfaceMode("review");
    }
    previousDiffOpenRef.current = diffOpen;
  }, [diffOpen, settings.diffWordWrap]);

  const selectedPatchIdentity = useMemo(
    () =>
      normalizedSelectedPatch && normalizedSelectedPatch.length > 0
        ? buildPatchCacheKey(normalizedSelectedPatch, "diff-panel:surface")
        : null,
    [normalizedSelectedPatch],
  );
  const diffSummaryCacheScope = useMemo(() => {
    if (!activeProjectId) {
      return activeCwd ?? null;
    }

    // Share summaries across chats in the same project, while isolating worktrees.
    return activeThread?.worktreePath
      ? `project:${activeProjectId}:worktree:${activeThread.worktreePath}`
      : `project:${activeProjectId}:local`;
  }, [activeCwd, activeProjectId, activeThread?.worktreePath]);

  useEffect(() => {
    if (surfaceMode === "summary" && hasResolvedRepoPatch && hasNoRepoChanges) {
      setSurfaceMode("review");
    }
  }, [hasNoRepoChanges, hasResolvedRepoPatch, surfaceMode]);

  useEffect(() => {
    setSurfaceMode("review");
  }, [activeThreadId, diffOpen, selectedPatchIdentity, selectedTurnId]);

  const diffSummaryPrefetchOptions = useMemo(
    () =>
      gitSummarizeDiffQueryOptions({
        cwd: activeCwd ?? null,
        cacheScope: diffSummaryCacheScope,
        patch: normalizedRepoPatch,
        codexHomePath: settings.codexHomePath || null,
        model: settings.textGenerationModel ?? null,
        ...(providerOptions ? { providerOptions } : {}),
        enabled: true,
      }),
    [
      activeCwd,
      diffSummaryCacheScope,
      normalizedRepoPatch,
      settings.codexHomePath,
      settings.textGenerationModel,
      providerOptions,
    ],
  );
  const diffSummaryQueryOptions = useMemo(
    () =>
      gitSummarizeDiffQueryOptions({
        cwd: activeCwd ?? null,
        cacheScope: diffSummaryCacheScope,
        patch: normalizedRepoPatch,
        codexHomePath: settings.codexHomePath || null,
        model: settings.textGenerationModel ?? null,
        ...(providerOptions ? { providerOptions } : {}),
        enabled: surfaceMode === "summary",
      }),
    [
      activeCwd,
      diffSummaryCacheScope,
      normalizedRepoPatch,
      settings.codexHomePath,
      settings.textGenerationModel,
      providerOptions,
      surfaceMode,
    ],
  );
  const diffSummaryQuery = useQuery(diffSummaryQueryOptions);
  const diffSummaryText = diffSummaryQuery.data?.summary ?? null;
  const diffSummaryError =
    diffSummaryQuery.error instanceof Error
      ? diffSummaryQuery.error.message
      : diffSummaryQuery.error
        ? "Failed to generate diff summary."
        : null;
  const canShowSummary = Boolean(
    !diffEnvironmentPending && activeCwd && (!hasResolvedRepoPatch || !hasNoRepoChanges),
  );
  const canPrefetchSummary = Boolean(
    diffOpen && !diffEnvironmentPending && activeCwd && normalizedRepoPatch && !hasNoRepoChanges,
  );
  const canShowTotal = Boolean(!diffEnvironmentPending && activeCwd);

  useEffect(() => {
    if (!canPrefetchSummary) {
      return;
    }

    const cachedSummaryState = queryClient.getQueryState(diffSummaryPrefetchOptions.queryKey);
    if (
      cachedSummaryState?.status === "success" ||
      cachedSummaryState?.fetchStatus === "fetching"
    ) {
      return;
    }

    const timerId = window.setTimeout(() => {
      const nextSummaryState = queryClient.getQueryState(diffSummaryPrefetchOptions.queryKey);
      if (nextSummaryState?.status === "success" || nextSummaryState?.fetchStatus === "fetching") {
        return;
      }
      void queryClient.prefetchQuery(diffSummaryPrefetchOptions);
    }, 900);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [canPrefetchSummary, diffSummaryPrefetchOptions, queryClient]);

  useEffect(() => {
    if (!selectedFilePath || !patchViewportRef.current) {
      return;
    }
    const target = Array.from(
      patchViewportRef.current.querySelectorAll<HTMLElement>("[data-diff-file-path]"),
    ).find((element) => element.dataset.diffFilePath === selectedFilePath);
    target?.scrollIntoView({ block: "nearest" });
  }, [selectedFilePath, renderableFiles]);

  /**
   * 跳转到指定 file/hunk:
   * 1. 找到文件容器 (data-diff-file-path 匹配)
   * 2. 找到对应的 hunk (data-diff-hunk-index 匹配,若无则回退到文件)
   * 3. scrollIntoView + 临时高亮 (data-hunk-flash) 用于视觉提示
   */
  const handleJumpToReviewHunk = useCallback(
    (target: { fileKey: string; fileIndex: number; hunkIndex: number }) => {
      if (!patchViewportRef.current) return;
      const fileElement = Array.from(
        patchViewportRef.current.querySelectorAll<HTMLElement>("[data-diff-file-path]"),
      ).find((element) => {
        const renderedKey = element.dataset.diffFileKey ?? element.dataset.diffFilePath;
        return renderedKey === target.fileKey;
      });
      if (!fileElement) return;
      const hunkElement = fileElement.querySelector<HTMLElement>(
        `[data-diff-hunk-index="${target.hunkIndex}"]`,
      );
      const scrollTarget = hunkElement ?? fileElement;
      scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      // 临时高亮 1.2s,作为视觉提示
      scrollTarget.setAttribute("data-hunk-flash", "true");
      window.setTimeout(() => {
        scrollTarget.removeAttribute("data-hunk-flash");
      }, 1200);
    },
    [],
  );

  const toggleFileCollapsed = useCallback((fileKey: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileKey)) next.delete(fileKey);
      else next.add(fileKey);
      return next;
    });
  }, []);

  const handleHunkAcceptReject = useCallback((
    fileDiff: FileDiffMetadata,
    hunkIndex: number,
    action: 'accept' | 'reject'
  ) => {
    const fileKey = buildFileDiffRenderKey(fileDiff);
    
    // Track the action for this hunk
    setAcceptedHunks((prev) => {
      const next = new Map(prev);
      const fileHunks = next.get(fileKey) ?? new Map();
      fileHunks.set(hunkIndex, action);
      next.set(fileKey, fileHunks);
      return next;
    });
  }, []);

  // 打开 inline edit 浮层:绑定到指定文件
  const openInlineEdit = useCallback(
    (fileDiff: FileDiffMetadata) => {
      const relativePath = resolveFileDiffPath(fileDiff);
      const filePath = resolveAstGrepFilePath(relativePath, activeCwd);
      const language = detectAstGrepLanguage(relativePath);
      setInlineEditState({ filePath, language });
    },
    [activeCwd],
  );

  // Cmd+K / Ctrl+K 拦截:在捕获阶段阻止冒泡,避免触发全局 command palette,
  // 并打开 inline edit 浮层(绑定到第一个可见文件,或当前展开的文件)。
  // 若已有浮层打开,则不再重复触发。
  const handleDiffPanelKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const isCmdK =
        (event.metaKey || event.ctrlKey) &&
        (event.key === "k" || event.key === "K");
      if (!isCmdK) return;
      // 仅在 review 视图且有可编辑文件时拦截
      if (inlineEditState !== null) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (surfaceMode !== "review") return;
      if (renderableFiles.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      // 优先绑定到第一个文件(用户可在浮层中切换 pattern/rewrite)
      const firstFile = renderableFiles[0];
      if (!firstFile) return;
      openInlineEdit(firstFile);
    },
    [inlineEditState, openInlineEdit, renderableFiles, surfaceMode],
  );

  // inline edit 落盘成功后:关闭浮层 + 刷新 diff 查询
  const handleInlineEditApplied = useCallback(() => {
    setInlineEditState(null);
    // 刷新工作区 diff 与 checkpoint diff,让 DiffPanel 显示最新改动
    if (activeCwd) {
      void queryClient.invalidateQueries({
        queryKey: ["git", "working-tree-diff", activeCwd] as const,
      });
    }
    if (activeThreadId) {
      void queryClient.invalidateQueries({
        queryKey: ["checkpoint-diff", activeThreadId] as const,
      });
    }
  }, [activeCwd, activeThreadId, queryClient]);

  const selectTurn = (turnId: TurnId) => {
    if (!activeThread) return;
    if (onUpdatePanelState) {
      onUpdatePanelState({
        panel: "diff",
        diffTurnId: turnId,
        diffFilePath: null,
      });
      return;
    }
    void navigate({
      to: "/$threadId",
      params: { threadId: activeThread.id },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, panel: "diff", diff: "1", diffTurnId: turnId };
      },
    });
  };
  const selectWholeConversation = () => {
    if (!activeThread) return;
    if (onUpdatePanelState) {
      onUpdatePanelState({
        panel: "diff",
        diffTurnId: null,
        diffFilePath: null,
      });
      return;
    }
    void navigate({
      to: "/$threadId",
      params: { threadId: activeThread.id },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, panel: "diff", diff: "1" };
      },
    });
  };
  const updateTurnStripScrollState = useCallback(() => {
    const element = turnStripRef.current;
    if (!element) {
      setCanScrollTurnStripLeft(false);
      setCanScrollTurnStripRight(false);
      return;
    }

    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    setCanScrollTurnStripLeft(element.scrollLeft > 4);
    setCanScrollTurnStripRight(element.scrollLeft < maxScrollLeft - 4);
  }, []);
  const scrollTurnStripBy = useCallback((offset: number) => {
    const element = turnStripRef.current;
    if (!element) return;
    element.scrollBy({ left: offset, behavior: "smooth" });
  }, []);
  const onTurnStripWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const element = turnStripRef.current;
    if (!element) return;
    if (element.scrollWidth <= element.clientWidth + 1) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    event.preventDefault();
    element.scrollBy({ left: event.deltaY, behavior: "auto" });
  }, []);

  useEffect(() => {
    const element = turnStripRef.current;
    if (!element) return;

    const frameId = window.requestAnimationFrame(() => updateTurnStripScrollState());
    const onScroll = () => updateTurnStripScrollState();

    element.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateTurnStripScrollState());
    resizeObserver.observe(element);

    return () => {
      window.cancelAnimationFrame(frameId);
      element.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
    };
  }, [updateTurnStripScrollState]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => updateTurnStripScrollState());
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [orderedTurnDiffSummaries, selectedTurnId, updateTurnStripScrollState]);

  useEffect(() => {
    const element = turnStripRef.current;
    if (!element) return;

    const selectedChip = element.querySelector<HTMLElement>("[data-turn-chip-selected='true']");
    selectedChip?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selectedTurn?.turnId, selectedTurnId]);

  const headerRow = (
    <>
      <div className="relative min-w-0 flex-1" data-no-drag>
        {canScrollTurnStripLeft && (
          <div className="pointer-events-none absolute inset-y-0 left-8 z-10 w-7 bg-linear-to-r from-card to-transparent" />
        )}
        {canScrollTurnStripRight && (
          <div className="pointer-events-none absolute inset-y-0 right-8 z-10 w-7 bg-linear-to-l from-card to-transparent" />
        )}
        <button
          type="button"
          className={cn(
            "absolute left-0 top-1/2 z-20 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md border bg-background/90 text-muted-foreground transition-colors",
            canScrollTurnStripLeft
              ? "border-border/70 hover:border-border hover:text-foreground"
              : "cursor-not-allowed border-border/40 text-muted-foreground/40",
          )}
          onClick={() => scrollTurnStripBy(-180)}
          disabled={!canScrollTurnStripLeft}
          aria-label="Scroll turn list left"
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "absolute right-0 top-1/2 z-20 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md border bg-background/90 text-muted-foreground transition-colors",
            canScrollTurnStripRight
              ? "border-border/70 hover:border-border hover:text-foreground"
              : "cursor-not-allowed border-border/40 text-muted-foreground/40",
          )}
          onClick={() => scrollTurnStripBy(180)}
          disabled={!canScrollTurnStripRight}
          aria-label="Scroll turn list right"
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
        <div
          ref={turnStripRef}
          className="turn-chip-strip flex gap-1 overflow-x-auto px-8 py-0.5"
          onWheel={onTurnStripWheel}
        >
          <button
            type="button"
            className="shrink-0 rounded-md"
            onClick={selectWholeConversation}
            data-turn-chip-selected={selectedTurnId === null}
          >
            <div
              className={cn(
                "rounded-md border px-2 py-1 text-left transition-colors",
                selectedTurnId === null
                  ? "border-(--color-border) bg-(--color-text-foreground) text-(--color-background-surface)"
                  : "border-(--color-border-light) bg-transparent text-(--color-text-foreground-secondary) hover:border-(--color-border) hover:bg-(--sidebar-accent) hover:text-(--color-text-foreground)",
              )}
            >
              <div className="text-[10px] leading-tight font-medium">All turns</div>
            </div>
          </button>
          {orderedTurnDiffSummaries.map((summary) => (
            <button
              key={summary.turnId}
              type="button"
              className="shrink-0 rounded-md"
              onClick={() => selectTurn(summary.turnId)}
              title={summary.turnId}
              data-turn-chip-selected={summary.turnId === selectedTurn?.turnId}
            >
              <div
                className={cn(
                  "rounded-md border px-2 py-1 text-left transition-colors",
                  summary.turnId === selectedTurn?.turnId
                    ? "border-(--color-border) bg-(--color-text-foreground) text-(--color-background-surface)"
                    : "border-(--color-border-light) bg-transparent text-(--color-text-foreground-secondary) hover:border-(--color-border) hover:bg-(--sidebar-accent) hover:text-(--color-text-foreground)",
                )}
              >
                <div className="flex items-center gap-1">
                  <span className="text-[10px] leading-tight font-medium">
                    Turn{" "}
                    {summary.checkpointTurnCount ??
                      inferredCheckpointTurnCountByTurnId[summary.turnId] ??
                      "?"}
                  </span>
                  <span className="text-[9px] leading-tight opacity-70">
                    {formatShortTimestamp(summary.completedAt, settings.timestampFormat)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1" data-no-drag>
        {!isSidebarMode ? (
          <>
            <ToggleGroup
              className="shrink-0"
              variant="outline"
              size="xs"
              value={[diffRenderMode]}
              onValueChange={(value) => {
                const next = value[0];
                if (next === "stacked" || next === "split") {
                  setDiffRenderMode(next);
                }
              }}
            >
              <Toggle aria-label="Stacked diff view" value="stacked">
                <Rows3Icon className="size-3" />
              </Toggle>
              <Toggle aria-label="Split diff view" value="split">
                <Columns2Icon className="size-3" />
              </Toggle>
            </ToggleGroup>
            <Toggle
              aria-label={diffWordWrap ? "Disable diff line wrapping" : "Enable diff line wrapping"}
              title={diffWordWrap ? "Disable line wrapping" : "Enable line wrapping"}
              variant="outline"
              size="xs"
              pressed={diffWordWrap}
              onPressedChange={(pressed) => {
                setDiffWordWrap(Boolean(pressed));
              }}
            >
              <TextWrapIcon className="size-3" />
            </Toggle>
          </>
        ) : null}
        {onClosePanel ? (
          <button
            type="button"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-(--color-text-foreground) transition-colors hover:bg-(--sidebar-accent)"
            onClick={(event) => {
              event.stopPropagation();
              onClosePanel();
            }}
          >
            <XIcon className="size-3.5" />
            <span className="sr-only">Close file view</span>
          </button>
        ) : null}
        {revertTurnButton ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              revertTurnButton.onClick();
            }}
            disabled={revertTurnButton.disabled}
            title={revertTurnButton.disabled ? revertTurnButton.disabledTitle : revertTurnButton.title}
            data-testid="diff-panel-revert-turn"
            aria-label={revertTurnButton.title}
            className="shrink-0"
          >
            <RotateCcwIcon className="size-3" />
            <span>撤销此次修改</span>
          </Button>
        ) : null}
      </div>
    </>
  );

  return (
    <DiffPanelShell mode={mode} header={headerRow}>
      {!activeThread ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Select a thread to inspect turn diffs.
        </div>
      ) : !isGitRepo ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Turn diffs are unavailable because this project is not a git repository.
        </div>
      ) : diffEnvironmentPending ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          This chat environment is still being prepared. Diff and summary will be available once the
          worktree is ready.
        </div>
      ) : (
        <>
          <div className="border-b border-border/70 px-3">
            <div className="flex items-end gap-1">
              <button
                type="button"
                className={cn(
                  "relative -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium tracking-[-0.01em] transition-colors",
                  surfaceMode === "summary"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                  !canShowSummary && "cursor-not-allowed opacity-45 hover:text-muted-foreground",
                )}
                disabled={!canShowSummary}
                onClick={() => {
                  setSurfaceMode("summary");
                }}
                aria-pressed={surfaceMode === "summary"}
              >
                <LuWrapText className="size-3.5 opacity-80" />
                <span>Summary</span>
              </button>
              <button
                type="button"
                className={cn(
                  "relative -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium tracking-[-0.01em] transition-colors",
                  surfaceMode === "review"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setSurfaceMode("review");
                }}
                aria-pressed={surfaceMode === "review"}
              >
                <span className="inline-flex size-4 items-center justify-center rounded-[4px]">
                  <FaPlusMinus className="size-2.25 text-[var(--color-text-foreground)]" />
                </span>
                <span>Review</span>
              </button>
              <Menu>
                <MenuTrigger
                  render={
                    <button
                      type="button"
                      className={cn(
                        "relative -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium tracking-[-0.01em] transition-colors",
                        surfaceMode === "total"
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                        !canShowTotal &&
                          "cursor-not-allowed opacity-45 hover:text-muted-foreground",
                      )}
                      disabled={!canShowTotal}
                      onClick={() => {
                        setSurfaceMode("total");
                      }}
                      aria-pressed={surfaceMode === "total"}
                      aria-label="Choose repo diff source"
                    />
                  }
                >
                  <DiffIcon className="size-3.5 opacity-80" />
                  <span>{REPO_DIFF_SCOPE_LABELS[repoDiffScope]}</span>
                  {totalPatchStat && hasNonZeroStat(totalPatchStat) ? (
                    <span className="ml-0.5 inline-flex items-center font-mono text-[11px] font-medium">
                      <DiffStatLabel
                        additions={totalPatchStat.additions}
                        deletions={totalPatchStat.deletions}
                      />
                    </span>
                  ) : null}
                  <ChevronDownIcon className="size-3 opacity-70" />
                </MenuTrigger>
                <MenuPopup align="start">
                  <MenuRadioGroup
                    value={repoDiffScope}
                    onValueChange={(value) => {
                      if (isRepoDiffScope(value)) {
                        setRepoDiffScope(value);
                        setSurfaceMode("total");
                      }
                    }}
                  >
                    <MenuRadioItem value="branch">Branch</MenuRadioItem>
                    <MenuRadioItem value="workingTree">Working tree</MenuRadioItem>
                    <MenuRadioItem value="unstaged">Unstaged</MenuRadioItem>
                    <MenuRadioItem value="staged">Staged</MenuRadioItem>
                  </MenuRadioGroup>
                </MenuPopup>
              </Menu>
              {/* 行级 Review 评论 Tab — 展示当前 thread/turn 下的所有评论,
                  支持新建/解决/忽略/删除;行号旁的 💬 按钮可触发新建草稿。 */}
              <button
                type="button"
                data-testid="diff-panel-comments-tab"
                className={cn(
                  "relative -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium tracking-[-0.01em] transition-colors",
                  surfaceMode === "comments"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setSurfaceMode("comments");
                }}
                aria-pressed={surfaceMode === "comments"}
              >
                <MessageCircleIcon className="size-3.5 opacity-80" />
                <span>Comments</span>
                {openCommentCount > 0 ? (
                  <span className="ml-0.5 inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0 font-mono text-[11px] font-medium text-primary">
                    {openCommentCount}
                  </span>
                ) : null}
              </button>
              {surfaceMode === "review" ? (
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="ml-auto shrink-0 self-center"
                        aria-label="Diff view options"
                        title="Diff view options"
                      />
                    }
                  >
                    <AdjustmentsIcon className="size-3.5" />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuCheckboxItem
                      checked={diffIgnoreWhitespace}
                      variant="switch"
                      onCheckedChange={(checked) => {
                        setDiffIgnoreWhitespace(checked === true);
                      }}
                    >
                      Ignore whitespace-only changes
                    </MenuCheckboxItem>
                  </MenuPopup>
                </Menu>
              ) : null}
              {surfaceMode !== "summary" && surfaceMode !== "comments" && diffCopyText ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className={cn(
                    "shrink-0 gap-1.5 self-center",
                    surfaceMode !== "review" && "ml-auto",
                  )}
                  onClick={() => {
                    copyDiffToClipboard(diffCopyText, undefined);
                  }}
                  aria-label={isDiffCopied ? "Copied full diff" : "Copy full diff"}
                  title={isDiffCopied ? "Copied full diff" : "Copy full diff"}
                >
                  {isDiffCopied ? (
                    <CheckIcon className="size-3 text-success" />
                  ) : (
                    <CopyIcon className="size-3" />
                  )}
                  <span>{isDiffCopied ? "Copied" : "Copy"}</span>
                </Button>
              ) : null}
            </div>
          </div>

          {surfaceMode === "summary" ? (
            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Repo summary</p>
                  <p className="text-[11px] text-muted-foreground">
                    Generated from the current {REPO_DIFF_SCOPE_LABELS[repoDiffScope].toLowerCase()}{" "}
                    diff.
                  </p>
                </div>
                {diffSummaryText ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 gap-1.5"
                    onClick={() => {
                      copyToClipboard(diffSummaryText, undefined);
                    }}
                    aria-label={isSummaryCopied ? "Copied diff summary" : "Copy diff summary"}
                    title={isSummaryCopied ? "Copied diff summary" : "Copy diff summary"}
                  >
                    {isSummaryCopied ? (
                      <CheckIcon className="size-3 text-success" />
                    ) : (
                      <CopyIcon className="size-3" />
                    )}
                    <span>{isSummaryCopied ? "Copied" : "Copy"}</span>
                  </Button>
                ) : null}
              </div>

              {repoDiffQuery.isLoading && !hasResolvedRepoPatch ? (
                <DiffPanelLoadingState
                  label={`Loading ${REPO_DIFF_SCOPE_LABELS[repoDiffScope].toLowerCase()} diff...`}
                />
              ) : repoDiffError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {repoDiffError}
                </div>
              ) : hasNoRepoChanges ? (
                <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
                  No changes in the selected diff source.
                </div>
              ) : diffSummaryQuery.isLoading ? (
                <DiffPanelLoadingState label="Generating repo summary..." />
              ) : diffSummaryError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {diffSummaryError}
                </div>
              ) : diffSummaryText ? (
                <ChatMarkdown
                  text={diffSummaryText}
                  cwd={activeCwd ?? undefined}
                  className="text-sm leading-7"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
                  Summary unavailable for the selected repo diff.
                </div>
              )}
            </div>
          ) : surfaceMode === "comments" ? (
            // 行级 Review 评论面板:threadId 缺失(无活动线程)时给出兜底提示。
            activeThreadId ? (
              <LineReviewCommentsPanel
                className="min-h-0 flex-1"
                threadId={activeThreadId}
                turnId={activeCommentTurnId}
                pendingDraft={pendingCommentDraft}
                onDraftConsumed={() => setPendingCommentDraft(null)}
                onSendToAgent={(formattedMessage) => {
                  const api = readNativeApi();
                  if (!api || !serverThread) return;
                  const modelSelection = activeThread?.modelSelection ?? null;
                  if (!modelSelection) return;
                  void api.orchestration.dispatchCommand({
                    type: "thread.turn.start" as const,
                    commandId: newCommandId(),
                    threadId: activeThreadId,
                    message: {
                      messageId: newMessageId(),
                      role: "user" as const,
                      text: formattedMessage,
                      attachments: [],
                    },
                    modelSelection,
                    dispatchMode: "queue" as const,
                    runtimeMode: serverThread.runtimeMode ?? "work",
                    interactionMode: "agent" as const,
                    createdAt: new Date().toISOString(),
                  });
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
                No active thread to attach review comments to.
              </div>
            )
          ) : (
            <div
              ref={patchViewportRef}
              className="diff-panel-viewport relative min-h-0 min-w-0 flex-1 overflow-hidden"
              onKeyDownCapture={handleDiffPanelKeyDownCapture}
            >
              {activeReviewError && !renderablePatch && (
                <div className="px-3">
                  <p className="mb-2 text-[11px] text-red-500/80">{activeReviewError}</p>
                </div>
              )}
              {!renderablePatch ? (
                activeReviewIsLoading ? (
                  <DiffPanelLoadingState
                    label={
                      surfaceMode === "total"
                        ? `Loading ${REPO_DIFF_SCOPE_LABELS[repoDiffScope].toLowerCase()} diff...`
                        : "Loading checkpoint diff..."
                    }
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-3 py-2 text-xs text-muted-foreground/70">
                    <p>
                      {activeReviewHasNoChanges
                        ? surfaceMode === "total"
                          ? "No changes in the selected diff source."
                          : "No net changes in this selection."
                        : surfaceMode === "total"
                          ? "No repo diff is available right now."
                          : "No patch available for this selection."}
                    </p>
                  </div>
                )
              ) : renderablePatch.kind === "files" ? (
                <>
                {/* W3-1: Review 模式专用工具栏 — 全部接受 / 全部拒绝 / 应用 */}
                {isReviewMode ? (
                  <ReviewDiffToolbar
                    activeReviewPatch={activeReviewPatch}
                    renderableFiles={renderableFiles}
                    fileDiffByKey={fileDiffByKey}
                    acceptedHunks={acceptedHunks}
                    setAcceptedHunks={setAcceptedHunks}
                    activeCwd={activeCwd}
                    onJumpToNextUndecided={handleJumpToReviewHunk}
                  />
                ) : null}
                {/* Apply changes action bar */}
                {acceptedHunks.size > 0 && (
                  <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-sm">
                    <span className="text-xs text-muted-foreground">
                      {Array.from(acceptedHunks.values()).reduce((sum, m) => sum + m.size, 0)} hunk(s) reviewed
                    </span>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!activeReviewPatch || !activeCwd) {
                          toastManager.add({
                            type: "warning",
                            title: "Cannot apply changes",
                            description: "No diff or working directory available.",
                            timeout: 3000,
                          });
                          return;
                        }
                        const patch = buildAcceptedPatch(activeReviewPatch, acceptedHunks, fileDiffByKey);
                        if (!patch) {
                          toastManager.add({
                            type: "warning",
                            title: "No accepted changes",
                            description: "Accept at least one hunk before applying.",
                            timeout: 3000,
                          });
                          return;
                        }
                        const api = readNativeApi();
                        if (!api) {
                          toastManager.add({
                            type: "error",
                            title: "Bridge unavailable",
                            description: "Native API is not connected.",
                            timeout: 3000,
                          });
                          return;
                        }
                        try {
                          await api.git.applyPatch({ cwd: activeCwd, patch });
                          toastManager.add({
                            type: "success",
                            title: "Changes applied",
                            description: "Accepted hunks have been applied to the working tree.",
                            timeout: 3000,
                          });
                          setAcceptedHunks(new Map());
                          void queryClient.invalidateQueries({
                            queryKey: ["git", "working-tree-diff", activeCwd] as const,
                          });
                        } catch (error) {
                          toastManager.add({
                            type: "error",
                            title: "Apply failed",
                            description: error instanceof Error ? error.message : "Failed to apply patch.",
                            timeout: 5000,
                          });
                        }
                      }}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-foreground/90 px-3 text-xs font-medium text-background transition-colors hover:bg-foreground"
                    >
                      <CheckIcon className="size-3.5" />
                      Apply Accepted Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setAcceptedHunks(new Map())}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      <XIcon className="size-3.5" />
                      Clear
                    </button>
                  </div>
                )}
                <Virtualizer
                  className="diff-render-surface h-full min-h-0 overflow-auto px-2 pb-2"
                  config={{
                    overscrollSize: 600,
                    intersectionObserverMargin: 1200,
                  }}
                >
                  {renderableFiles.map((fileDiff) => {
                    const filePath = resolveFileDiffPath(fileDiff);
                    const fileKey = buildFileDiffRenderKey(fileDiff);
                    const themedFileKey = `${fileKey}:${resolvedTheme}`;
                    const isCollapsed = collapsedFiles.has(fileKey);
                    return (
                      <div
                        key={themedFileKey}
                        data-diff-file-path={filePath}
                        className="diff-render-file mb-2 rounded-md first:mt-2 last:mb-0"
                        onClickCapture={(event) => {
                          const nativeEvent = event.nativeEvent as MouseEvent;
                          const composedPath = nativeEvent.composedPath?.() ?? [];
                          const clickedHeader = composedPath.some((node) => {
                            if (!(node instanceof Element)) return false;
                            return (
                              node.hasAttribute("data-diffs-header") ||
                              node.hasAttribute("data-file-info")
                            );
                          });
                          if (!clickedHeader) return;
                          event.stopPropagation();
                          toggleFileCollapsed(fileKey);
                        }}
                      >
                        <FileDiff
                          fileDiff={fileDiff}
                          options={{
                            diffStyle: diffRenderMode === "split" ? "split" : "unified",
                            lineDiffType: "none",
                            overflow: diffWordWrap ? "wrap" : "scroll",
                            theme: resolveDiffThemeName(resolvedTheme),
                            themeType: resolvedTheme as DiffThemeType,
                            unsafeCSS: buildDiffPanelUnsafeCSS(resolvedTheme),
                            collapsed: isCollapsed,
                          }}
                          renderHeaderPrefix={() => (
                            <FileEntryIcon
                              pathValue={filePath}
                              kind="file"
                              theme={resolvedTheme}
                              className="size-4"
                            />
                          )}
                          renderHeaderMetadata={() => (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "2px",
                                color: "inherit",
                              }}
                            >
                              <ChevronDownIcon
                                style={{
                                  width: "14px",
                                  height: "14px",
                                  transition: "transform 150ms ease",
                                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                                  opacity: 0.5,
                                }}
                              />
                            </span>
                          )}
                          renderGutterUtility={(getHoveredLine) => {
                            const hovered = getHoveredLine();
                            if (!hovered) return null;
                            
                            // Only show for addition/deletion lines (not context)
                            if (hovered.side !== 'additions' && hovered.side !== 'deletions') {
                              return null;
                            }
                            
                            // Find hunk index from line number
                            const hunkIndex = fileDiff.hunks?.findIndex((hunk) => {
                              const start = hunk.additionStart;
                              const end = start + (hunk.additionCount ?? 0);
                              return hovered.lineNumber >= start && hovered.lineNumber < end;
                            }) ?? -1;
                            
                            if (hunkIndex < 0) return null;
                            
                            const fileKey = buildFileDiffRenderKey(fileDiff);
                            const fileHunks = acceptedHunks.get(fileKey);
                            const existingAction = fileHunks?.get(hunkIndex);

                            // 计算当前 hover 行的类型与内容,用于行级 Review 评论草稿。
                            // hunkIndex 由 addition 维度定位,deletion-only 行通常不会到达这里;
                            // 此处按 hovered.side 取对应版本的内容,缺省回退到空串。
                            const hoveredHunk = fileDiff.hunks?.[hunkIndex];
                            let commentLineType: "add" | "del" | "context" = "context";
                            let commentLineContent = "";
                            if (hoveredHunk) {
                              if (hovered.side === "additions") {
                                commentLineType = "add";
                                const offset = hovered.lineNumber - hoveredHunk.additionStart;
                                const idx = (hoveredHunk.additionLineIndex ?? 0) + offset;
                                commentLineContent = fileDiff.additionLines?.[idx] ?? "";
                              } else if (hovered.side === "deletions") {
                                commentLineType = "del";
                                const offset = hovered.lineNumber - hoveredHunk.deletionStart;
                                const idx = (hoveredHunk.deletionLineIndex ?? 0) + offset;
                                commentLineContent = fileDiff.deletionLines?.[idx] ?? "";
                              }
                            }

                            return (
                              <div className="flex gap-1 p-1" style={{ opacity: 0.8 }}>
                                <button
                                  className={cn(
                                    "size-5 rounded hover:bg-green-500/20 transition-colors",
                                    existingAction === 'accept' && "bg-green-500/30"
                                  )}
                                  title="Accept change"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleHunkAcceptReject(fileDiff, hunkIndex, 'accept');
                                  }}
                                >
                                  <CheckIcon className="size-4 text-green-500" />
                                </button>
                                <button
                                  className={cn(
                                    "size-5 rounded hover:bg-red-500/20 transition-colors",
                                    existingAction === 'reject' && "bg-red-500/30"
                                  )}
                                  title="Reject change"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleHunkAcceptReject(fileDiff, hunkIndex, 'reject');
                                  }}
                                >
                                  <XIcon className="size-4 text-red-500" />
                                </button>
                                {/* P0-4: 行级 inline edit 按钮,触发 Cmd+K 浮层 */}
                                <button
                                  className="size-5 rounded text-foreground/70 transition-colors hover:bg-primary/15 hover:text-foreground"
                                  title="Inline edit (Cmd+K)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openInlineEdit(fileDiff);
                                  }}
                                >
                                  <SquarePenIcon className="size-4" />
                                </button>
                                {/* 行级 Review 评论按钮:填充 pendingDraft 并切到 Comments Tab,
                                    由 LineReviewCommentsPanel 弹起编辑器。 */}
                                <button
                                  className="size-5 rounded text-foreground/70 transition-colors hover:bg-primary/15 hover:text-foreground"
                                  title="Add review comment"
                                  aria-label="Add review comment"
                                  data-testid="diff-panel-comment-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPendingCommentDraft({
                                      filePath,
                                      hunkIndex,
                                      lineNumber: hovered.lineNumber,
                                      lineType: commentLineType,
                                      lineContent: commentLineContent,
                                    });
                                    setSurfaceMode("comments");
                                  }}
                                >
                                  <MessageCircleIcon className="size-4" />
                                </button>
                              </div>
                            );
                          }}
                        />
                      </div>
                    );
                  })}
                </Virtualizer>
                </>
              ) : (
                <div className="h-full overflow-auto p-2">
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground/75">{renderablePatch.reason}</p>
                    <pre
                      className={cn(
                        "max-h-[72vh] rounded-md border border-border/70 bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground/90",
                        diffWordWrap
                          ? "overflow-auto whitespace-pre-wrap wrap-break-word"
                          : "overflow-auto",
                      )}
                    >
                      {renderablePatch.text}
                    </pre>
                  </div>
                </div>
              )}
              {/* P0-4: Cmd+K inline edit 浮层,定位在 diff 视口底部 */}
              {inlineEditState ? (
                <DiffInlineEditBar
                  filePath={inlineEditState.filePath}
                  language={inlineEditState.language}
                  onClose={() => setInlineEditState(null)}
                  onApplied={handleInlineEditApplied}
                />
              ) : null}
            </div>
          )}
        </>
      )}
    </DiffPanelShell>
  );
}
