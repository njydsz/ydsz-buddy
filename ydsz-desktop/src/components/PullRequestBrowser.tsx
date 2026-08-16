/**
 * @file GitHub Pull Request 浏览器组件
 *
 * 提供在应用内浏览 GitHub Pull Requests 的功能：
 * - 列表展示（按状态过滤）
 * - 查看详情
 * - 查看 diff
 * - PR 操作（合并 / 关闭 / 重开 / 评论）
 * - 打开浏览器、复制链接
 *
 * ## 入口
 *
 * 通过 `Sidebar` 的 "Pull Requests" 入口打开（P1-3）。
 * 依赖系统 `gh` CLI 已认证（`gh auth login`）。
 */

import { useCallback, useEffect, useState } from "react";
import {
  GitPullRequestSummary,
  GitPullRequestDetail,
  GitMergeMethod,
} from "~/contracts";
import { readNativeApi } from "~/nativeApi";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  XIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { DiffPanelShell } from "./DiffPanelShell";
import type { DiffPanelMode } from "./DiffPanelShell";
import { toastManager } from "./ui/toast";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { ScrollArea } from "./ui/scroll-area";

type PrState = "open" | "closed" | "merged" | "all";
type ViewMode = "list" | "detail" | "diff";

export interface PullRequestBrowserProps {
  mode: DiffPanelMode;
  projectCwd: string | null;
  onClose: () => void;
}

function stateToLabel(state: PrState): string {
  return state === "all" ? "All PRs" : `${state.charAt(0).toUpperCase() + state.slice(1)} PRs`;
}

function stateToBadgeColor(state: string): string {
  switch (state) {
    case "open":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
    case "closed":
      return "bg-muted/50 text-muted-foreground border-border/50";
    case "merged":
      return "bg-purple-500/15 text-purple-300 border-purple-500/25";
    default:
      return "bg-muted/50 text-muted-foreground border-border/50";
  }
}

export function PullRequestBrowser({
  mode,
  projectCwd,
  onClose,
}: PullRequestBrowserProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [state, setState] = useState<PrState>("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prs, setPrs] = useState<GitPullRequestSummary[]>([]);
  const [selectedPr, setSelectedPr] = useState<GitPullRequestDetail | null>(null);
  const [prDiff, setPrDiff] = useState<string | null>(null);
  // PR 操作状态
  const [actionLoading, setActionLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [showMergeMenu, setShowMergeMenu] = useState(false);
  const api = readNativeApi();

  const loadPrs = useCallback(async () => {
    if (!projectCwd || !api) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.git.listPullRequests({
        cwd: projectCwd,
        state: state === "all" ? undefined : state,
        limit: 50,
      });
      setPrs(result ? [...result] : []);
    } catch {
      setError("Failed to load pull requests");
    } finally {
      setLoading(false);
    }
  }, [api, projectCwd, state]);

  useEffect(() => {
    loadPrs();
  }, [loadPrs]);

  const handleSelectPr = useCallback(
    async (pr: GitPullRequestSummary) => {
      if (!api || !projectCwd) return;
      setLoading(true);
      setError(null);
      try {
        const detail = await api.git.viewPullRequest({
          cwd: projectCwd,
          prNumber: pr.number,
        });
        setSelectedPr(detail);
        setViewMode("detail");
      } catch {
        setError("Failed to load pull request details");
      } finally {
        setLoading(false);
      }
    },
    [api, projectCwd],
  );

  const handleViewDiff = useCallback(
    async (pr: GitPullRequestSummary) => {
      if (!api || !projectCwd) return;
      setLoading(true);
      setError(null);
      try {
        const diff = await api.git.diffPullRequest({
          cwd: projectCwd,
          prNumber: pr.number,
        });
        setPrDiff(diff.diff);
        setViewMode("diff");
      } catch {
        setError("Failed to load pull request diff");
      } finally {
        setLoading(false);
      }
    },
    [api, projectCwd],
  );

  const handleOpenInBrowser = useCallback((url: string) => {
    if (api) {
      void api.shell.openExternal(url);
    }
  }, [api]);

  const handleCopyLink = useCallback((url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toastManager.add({
        type: "success",
        title: "PR link copied to clipboard",
      });
    });
  }, []);

  // ── PR 操作（P1-3） ──
  // 合并 / 关闭 / 重开 / 评论 —— 调用现有 RPC,操作后刷新详情

  const refreshSelectedPr = useCallback(
    async (prNumber: number) => {
      if (!api || !projectCwd) return;
      try {
        const detail = await api.git.viewPullRequest({
          cwd: projectCwd,
          prNumber,
        });
        setSelectedPr(detail);
      } catch {
        // 静默:detail 刷新失败不影响操作成功反馈
      }
    },
    [api, projectCwd],
  );

  const handleMerge = useCallback(
    async (method: GitMergeMethod) => {
      if (!api || !projectCwd || !selectedPr) return;
      setShowMergeMenu(false);
      setActionLoading(true);
      setError(null);
      try {
        await api.git.mergePullRequest({
          cwd: projectCwd,
          prNumber: selectedPr.number,
          method,
          deleteBranch: false,
        });
        toastManager.add({
          type: "success",
          title: `PR #${selectedPr.number} merged (${method})`,
          timeout: 3000,
        });
        await refreshSelectedPr(selectedPr.number);
        await loadPrs();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to merge pull request",
        );
      } finally {
        setActionLoading(false);
      }
    },
    [api, projectCwd, selectedPr, refreshSelectedPr, loadPrs],
  );

  const handleClose = useCallback(async () => {
    if (!api || !projectCwd || !selectedPr) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.git.closePullRequest({
        cwd: projectCwd,
        prNumber: selectedPr.number,
      });
      toastManager.add({
        type: "info",
        title: `PR #${selectedPr.number} closed`,
        timeout: 3000,
      });
      await refreshSelectedPr(selectedPr.number);
      await loadPrs();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to close pull request",
      );
    } finally {
      setActionLoading(false);
    }
  }, [api, projectCwd, selectedPr, refreshSelectedPr, loadPrs]);

  const handleReopen = useCallback(async () => {
    if (!api || !projectCwd || !selectedPr) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.git.reopenPullRequest({
        cwd: projectCwd,
        prNumber: selectedPr.number,
      });
      toastManager.add({
        type: "success",
        title: `PR #${selectedPr.number} reopened`,
        timeout: 3000,
      });
      await refreshSelectedPr(selectedPr.number);
      await loadPrs();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reopen pull request",
      );
    } finally {
      setActionLoading(false);
    }
  }, [api, projectCwd, selectedPr, refreshSelectedPr, loadPrs]);

  const handleComment = useCallback(async () => {
    if (!api || !projectCwd || !selectedPr) return;
    const body = commentInput.trim();
    if (!body) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.git.commentPullRequest({
        cwd: projectCwd,
        prNumber: selectedPr.number,
        body,
      });
      toastManager.add({
        type: "success",
        title: "Comment added",
        timeout: 2000,
      });
      setCommentInput("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to comment on pull request",
      );
    } finally {
      setActionLoading(false);
    }
  }, [api, projectCwd, selectedPr, commentInput]);

  return (
    <DiffPanelShell
      mode={mode}
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitPullRequestIcon className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Pull Requests</span>
          </div>
          <Menu modal={false}>
            <MenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                >
                  <ChevronRightIcon className="size-3.5" />
                </Button>
              }
            />
            <MenuPopup align="end" side="bottom" className="w-40">
              {(["open", "closed", "merged", "all"] as const).map((s) => (
                <MenuItem
                  key={s}
                  className={cn(state === s && "bg-(--color-background-elevated-secondary)")}
                  onClick={() => {
                    setState(s);
                    setViewMode("list");
                    setSelectedPr(null);
                    setPrDiff(null);
                  }}
                >
                  {stateToLabel(s)}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7"
            onClick={onClose}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {error && (
          <div className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {viewMode === "list" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {stateToLabel(state)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6"
                disabled={loading}
                onClick={loadPrs}
              >
                <RefreshCwIcon
                  className={cn("size-3", loading && "animate-spin")}
                />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {loading && prs.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : prs.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center p-4 text-xs text-muted-foreground">
                  <GitPullRequestIcon className="mb-2 size-8 opacity-50" />
                  No pull requests found
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {prs.map((pr) => (
                    <button
                      key={pr.number}
                      type="button"
                      className="w-full px-3 py-3 text-left transition-colors hover:bg-muted/50"
                      onClick={() => handleSelectPr(pr)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-medium text-sm">#{pr.number}</span>
                            <span
                              className={cn(
                                "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                                stateToBadgeColor(pr.state),
                              )}
                            >
                              {pr.state}
                            </span>
                          </div>
                          <div className="mb-1 truncate text-xs text-foreground">
                            {pr.title}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{pr.author ?? "unknown"}</span>
                            <span className="shrink-0">{pr.head_ref}</span>
                            <span>→</span>
                            <span className="shrink-0">{pr.base_ref}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {viewMode === "detail" && selectedPr && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6"
                onClick={() => setViewMode("list")}
              >
                <ChevronRightIcon className="size-3.5 rotate-180" />
              </Button>
              <span className="flex-1 truncate text-sm font-medium">
                #{selectedPr.number}: {selectedPr.title}
              </span>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-3 py-2">
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 font-medium",
                        stateToBadgeColor(selectedPr.state),
                      )}
                    >
                      {selectedPr.state}
                    </span>
                    {selectedPr.is_draft && (
                      <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-muted-foreground">
                        Draft
                      </span>
                    )}
                  </div>
                  <Menu modal={false}>
                    <MenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-6"
                        >
                          <ChevronRightIcon className="size-3.5" />
                        </Button>
                      }
                    />
                    <MenuPopup align="end" side="bottom">
                      <MenuItem onClick={() => handleViewDiff(selectedPr)}>
                        View Diff
                      </MenuItem>
                      <MenuItem onClick={() => handleOpenInBrowser(selectedPr.url)}>
                        Open in Browser
                      </MenuItem>
                      <MenuItem onClick={() => handleCopyLink(selectedPr.url)}>
                        Copy Link
                      </MenuItem>
                    </MenuPopup>
                  </Menu>
                </div>

                <div className="space-y-2">
                  <div className="text-muted-foreground">Description</div>
                  <div className="whitespace-pre-wrap break-words text-foreground/85">
                    {selectedPr.body || "No description"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-muted-foreground">Source</div>
                    <div className="font-mono text-foreground">{selectedPr.head_ref}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Target</div>
                    <div className="font-mono text-foreground">{selectedPr.base_ref}</div>
                  </div>
                </div>

                {selectedPr.assignees && selectedPr.assignees.length > 0 && (
                  <div>
                    <div className="text-muted-foreground">Assignees</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedPr.assignees.map((assignee) => (
                        <span
                          key={assignee}
                          className="rounded-md bg-muted/50 px-2 py-0.5 text-foreground"
                        >
                          {assignee}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPr.labels && selectedPr.labels.length > 0 && (
                  <div>
                    <div className="text-muted-foreground">Labels</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedPr.labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-indigo-300"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-muted-foreground">Actions</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => handleViewDiff(selectedPr)}
                      data-testid="pr-view-diff-btn"
                    >
                      View Diff
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => handleOpenInBrowser(selectedPr.url)}
                    >
                      <ExternalLinkIcon className="size-3" />
                      Open in Browser
                    </Button>
                  </div>

                  {/* PR 状态变更操作（P1-3） */}
                  <div className="flex flex-wrap gap-2">
                    {/* Merge：仅 open 状态可合并,草稿需先 ready for review */}
                    {selectedPr.state === "open" && !selectedPr.is_draft ? (
                      <div className="relative">
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1"
                          disabled={actionLoading}
                          onClick={() => setShowMergeMenu((v) => !v)}
                          data-testid="pr-merge-btn"
                        >
                          {actionLoading ? (
                            <LoaderCircleIcon className="mr-1 size-3 animate-spin" />
                          ) : null}
                          Merge
                          <ChevronRightIcon className="size-3" />
                        </Button>
                        {showMergeMenu ? (
                          <div
                            className="absolute left-0 top-full z-10 mt-1 w-32 rounded-md border border-border bg-background shadow-md"
                            data-testid="pr-merge-menu"
                          >
                            {(["merge", "squash", "rebase"] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted/50"
                                onClick={() => void handleMerge(m)}
                              >
                                {m === "merge"
                                  ? "Create merge commit"
                                  : m === "squash"
                                    ? "Squash and merge"
                                    : "Rebase and merge"}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Close：仅 open 状态可关闭 */}
                    {selectedPr.state === "open" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={actionLoading}
                        onClick={handleClose}
                        data-testid="pr-close-btn"
                      >
                        Close
                      </Button>
                    ) : null}

                    {/* Reopen：仅 closed 状态可重开（merged 不可重开） */}
                    {selectedPr.state === "closed" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={actionLoading}
                        onClick={handleReopen}
                        data-testid="pr-reopen-btn"
                      >
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* 评论输入（P1-3） */}
                <div className="space-y-2">
                  <div className="text-muted-foreground">Add a comment</div>
                  <textarea
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="Leave a comment..."
                    rows={3}
                    className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    data-testid="pr-comment-input"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={actionLoading || !commentInput.trim()}
                    onClick={handleComment}
                    data-testid="pr-comment-submit-btn"
                  >
                    {actionLoading ? (
                      <LoaderCircleIcon className="mr-1 size-3 animate-spin" />
                    ) : null}
                    Comment
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </div>
        )}

        {viewMode === "diff" && selectedPr && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6"
                onClick={() => setViewMode("detail")}
              >
                <ChevronRightIcon className="size-3.5 rotate-180" />
              </Button>
              <span className="flex-1 truncate text-sm font-medium">
                Diff: #{selectedPr.number}
              </span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words bg-black/5 p-3 text-[11px] leading-relaxed font-mono">
                  {prDiff || "No diff available"}
                </pre>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
    </DiffPanelShell>
  );
}

export default PullRequestBrowser;