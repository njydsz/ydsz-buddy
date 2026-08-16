/**
 * @file 检查点回滚 Drawer
 *
 * 在用户从 EventTimeline 触发 "回退到此检查点" 时，提供可视化的预览 + 确认 UI：
 *
 * - 摘要：要丢弃的 turn 数 / 修改的文件数 / 受影响的消息数
 * - 折叠展示：调 `getFullThreadDiff` 拿到要回退的 diff 文本，按文件拆分预览
 * - 警告条：明确「不可撤销」
 * - 操作：取消 / 确认回滚
 *
 * ## 使用方式
 *
 * ```tsx
 * <RollbackDrawer
 *   open={isRollbackOpen}
 *   onOpenChange={setIsRollbackOpen}
 *   threadId={activeThread.id}
 *   turnCount={selectedTurnCount}
 *   onConfirm={async () => {
 *     await api.orchestration.dispatchCommand({
 *       type: "thread.checkpoint.revert",
 *       ...
 *     });
 *   }}
 * />
 * ```
 *
 * ## 关键设计
 *
 * - **不阻塞 UI**：fetching diff 时显示骨架屏；用户可点取消
 * - **数据完整性**：diff 字符串为空时（说明没有任何变更），仍允许回退
 * - **i18n**：使用 `messages.chat.rollback.*` 命名空间
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetBackdrop,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "~/components/ui/sheet";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { readNativeApi } from "~/nativeApi";
import { useMessages } from "~/i18n";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  Loader2Icon,
  MessageCircleIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import type { ThreadId } from "~/contracts";

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface RollbackDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: ThreadId;
  turnCount: number;
  /** 触发回滚的实际回调（由 ChatView 注入 `thread.checkpoint.revert` 派发逻辑） */
  onConfirm: () => Promise<void> | void;
  /** 当前是否正在回滚中（由 ChatView 提供，避免重复触发） */
  isReverting?: boolean;
}

// ─── Diff 摘要（按文件聚合）────────────────────────────────────────────────────

interface FileDiffSummary {
  /** 相对路径（如 "src/hooks/useFoo.ts"） */
  path: string;
  /** 新增行数 */
  additions: number;
  /** 删除行数 */
  deletions: number;
}

const DIFF_FILE_HEADER_REGEX = /^diff --git a\/(.+?) b\//;
const DIFF_ADDITION_REGEX = /^\+[^+]/;
const DIFF_DELETION_REGEX = /^-[^-]/;

/**
 * 解析 unified diff 字符串，按文件聚合 add/del 数量。
 * 仅取前 N 个文件做预览，避免大 diff 拖慢渲染。
 */
function summarizeDiff(diffText: string, maxFiles: number = 8): {
  files: FileDiffSummary[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
} {
  if (!diffText) {
    return { files: [], totalAdditions: 0, totalDeletions: 0, totalFiles: 0 };
  }
  const lines = diffText.split("\n");
  const files: FileDiffSummary[] = [];
  let current: FileDiffSummary | null = null;
  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalFiles = 0;

  for (const line of lines) {
    const headerMatch = DIFF_FILE_HEADER_REGEX.exec(line);
    if (headerMatch) {
      if (current) files.push(current);
      totalFiles += 1;
      current = { path: headerMatch[1] ?? "", additions: 0, deletions: 0 };
      continue;
    }
    if (!current) continue;
    if (DIFF_ADDITION_REGEX.test(line)) {
      current.additions += 1;
      totalAdditions += 1;
    } else if (DIFF_DELETION_REGEX.test(line)) {
      current.deletions += 1;
      totalDeletions += 1;
    }
  }
  if (current) files.push(current);

  return {
    files: files.slice(0, maxFiles),
    totalAdditions,
    totalDeletions,
    totalFiles,
  };
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export function RollbackDrawer({
  open,
  onOpenChange,
  threadId,
  turnCount,
  onConfirm,
  isReverting = false,
}: RollbackDrawerProps) {
  const messages = useMessages();
  const rollbackMessages = messages.chat.rollback;
  const [diff, setDiff] = useState<string | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // ── 拉取要丢弃的 turn diff ──
  useEffect(() => {
    if (!open) {
      setDiff(null);
      setDiffError(null);
      setIsLoadingDiff(false);
      setShowFullDiff(false);
      setConfirmError(null);
      return;
    }
    const api = readNativeApi();
    if (!api) {
      setDiffError(rollbackMessages.apiUnavailable);
      return;
    }

    let cancelled = false;
    setIsLoadingDiff(true);
    setDiffError(null);
    setDiff(null);

    (async () => {
      try {
        const result = await api.orchestration.getFullThreadDiff({
          threadId,
          toTurnCount: 0,
        });
        if (cancelled) return;
        setDiff(result.diff ?? "");
      } catch (err) {
        if (cancelled) return;
        try {
          const fallback = await api.orchestration.getFullThreadDiff({
            threadId,
            toTurnCount: 9999,
          });
          if (cancelled) return;
          setDiff(fallback.diff ?? "");
        } catch (err2) {
          if (cancelled) return;
          setDiffError(
            err2 instanceof Error ? err2.message : "Failed to load diff preview",
          );
        }
      } finally {
        if (!cancelled) setIsLoadingDiff(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, threadId, rollbackMessages.apiUnavailable]);

  const summary = useMemo(() => summarizeDiff(diff ?? ""), [diff]);

  const handleConfirm = useCallback(async () => {
    setConfirmError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Failed to revert thread");
    }
  }, [onConfirm, onOpenChange]);

  // diff 字符串前 30 行（折叠视图）
  const diffPreview = useMemo(() => {
    if (!diff) return "";
    const lines = diff.split("\n");
    if (lines.length <= 30) return diff;
    return lines.slice(0, 30).join("\n");
  }, [diff]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetBackdrop />
      <SheetPopup
        side="right"
        className="w-full sm:max-w-lg"
        data-testid="rollback-drawer"
        data-thread-id={threadId}
        data-turn-count={turnCount}
      >
        <SheetHeader>
          <div className="flex items-center gap-2">
            <RotateCcwIcon className="size-5 text-(--color-warning)" />
            <SheetTitle data-testid="rollback-drawer-title">
              {rollbackMessages.drawerTitle(turnCount)}
            </SheetTitle>
          </div>
          <SheetDescription data-testid="rollback-drawer-description">
            {rollbackMessages.drawerDescription}
          </SheetDescription>
        </SheetHeader>

        <SheetPanel>
          <div className="space-y-4">
            {/* 摘要卡片：turn 数 / 文件数 / 行数 */}
            <div
              className="grid grid-cols-3 gap-2 rounded-lg border border-(--color-border-light) bg-(--color-background-elevated-secondary) p-3"
              data-testid="rollback-drawer-summary"
            >
              <SummaryStat
                icon={<MessageCircleIcon className="size-3.5" />}
                label={rollbackMessages.turns}
                value={String(Math.max(0, turnCount))}
                testId="rollback-stat-turns"
              />
              <SummaryStat
                icon={<FileTextIcon className="size-3.5" />}
                label={rollbackMessages.files}
                value={String(summary.totalFiles)}
                testId="rollback-stat-files"
              />
              <SummaryStat
                icon={<span className="font-mono text-[10px]">±</span>}
                label={rollbackMessages.lines}
                value={`+${summary.totalAdditions} / -${summary.totalDeletions}`}
                testId="rollback-stat-lines"
              />
            </div>

            {/* 文件变更列表 */}
            {!isLoadingDiff && summary.files.length > 0 ? (
              <div data-testid="rollback-file-list">
                <div className="mb-2 text-xs font-medium text-(--color-text-foreground-secondary)">
                  {rollbackMessages.filesHeading}
                </div>
                <ul className="space-y-1 rounded-lg border border-(--color-border-light)">
                  {summary.files.map((file) => (
                    <li
                      key={file.path}
                      className="flex items-center justify-between gap-2 border-b border-(--color-border-light) px-3 py-1.5 text-xs last:border-b-0"
                      data-testid="rollback-file-item"
                      data-file-path={file.path}
                    >
                      <span
                        className="truncate font-mono text-(--color-text-foreground)"
                        title={file.path}
                      >
                        {file.path}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
                        {file.additions > 0 ? (
                          <span className="text-(--color-success)">+{file.additions}</span>
                        ) : null}
                        {file.deletions > 0 ? (
                          <span className="text-(--color-destructive)">-{file.deletions}</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {summary.totalFiles > summary.files.length ? (
                  <div className="mt-1 text-[10px] text-(--color-text-foreground-secondary)">
                    {rollbackMessages.moreFiles(summary.totalFiles - summary.files.length)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* diff 预览（折叠 / 展开） */}
            {diff !== null && diff.length > 0 ? (
              <div data-testid="rollback-diff-preview">
                <button
                  type="button"
                  onClick={() => setShowFullDiff((v) => !v)}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium text-(--color-text-foreground-secondary)",
                    "hover:text-(--color-text-foreground)",
                  )}
                  data-testid="rollback-diff-toggle"
                >
                  {showFullDiff ? (
                    <ChevronDownIcon className="size-3.5" />
                  ) : (
                    <ChevronRightIcon className="size-3.5" />
                  )}
                  {showFullDiff ? rollbackMessages.hideDiff : rollbackMessages.showDiff}
                </button>
                {showFullDiff ? (
                  <ScrollArea className="mt-2 max-h-72 rounded-md border border-(--color-border-light) bg-(--color-background-elevated-secondary)">
                    <pre
                      className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed"
                      data-testid="rollback-diff-content"
                    >
                      {diff}
                    </pre>
                  </ScrollArea>
                ) : (
                  <pre
                    className="mt-2 max-h-24 overflow-hidden rounded-md border border-(--color-border-light) bg-(--color-background-elevated-secondary) p-2 font-mono text-[10px] leading-relaxed text-(--color-text-foreground-secondary)"
                    data-testid="rollback-diff-content"
                  >
                    {diffPreview}
                    {diff.split("\n").length > 30 ? "\n…" : ""}
                  </pre>
                )}
              </div>
            ) : null}

            {/* loading / error */}
            {isLoadingDiff ? (
              <div
                className="flex items-center gap-2 text-xs text-(--color-text-foreground-secondary)"
                data-testid="rollback-loading"
              >
                <Loader2Icon className="size-3.5 animate-spin" />
                {rollbackMessages.loadingDiff}
              </div>
            ) : null}
            {diffError ? (
              <div
                className="rounded-md border border-(--color-destructive)/30 bg-(--color-destructive)/5 p-2 text-xs text-(--color-destructive-foreground)"
                data-testid="rollback-error"
                role="alert"
              >
                {diffError}
              </div>
            ) : null}

            <Separator />

            {/* 警告条 */}
            <div
              className="flex items-start gap-2 rounded-md border border-(--color-warning)/40 bg-(--color-warning)/5 p-2.5"
              data-testid="rollback-warning"
              role="alert"
            >
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-(--color-warning)" />
              <div className="text-xs text-(--color-text-foreground)">
                {rollbackMessages.warning(turnCount)}
              </div>
            </div>

            {/* 确认错误 */}
            {confirmError ? (
              <div
                className="rounded-md border border-(--color-destructive)/30 bg-(--color-destructive)/5 p-2 text-xs text-(--color-destructive-foreground)"
                data-testid="rollback-confirm-error"
                role="alert"
              >
                {confirmError}
              </div>
            ) : null}
          </div>
        </SheetPanel>

        <SheetFooter>
          <SheetClose
            render={<Button variant="outline" data-testid="rollback-cancel" />}
            disabled={isReverting}
          >
            {rollbackMessages.cancel}
          </SheetClose>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={isReverting || isLoadingDiff}
            data-testid="rollback-confirm"
          >
            {isReverting ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                {rollbackMessages.reverting}
              </>
            ) : (
              <>
                <RotateCcwIcon className="size-3.5" />
                {rollbackMessages.confirm}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

// ─── 子组件 ──────────────────────────────────────────────────────────────────

interface SummaryStatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  testId: string;
}

function SummaryStat({ icon, label, value, testId }: SummaryStatProps) {
  return (
    <div
      className="flex flex-col gap-1 rounded-md bg-(--color-background-surface) p-2"
      data-testid={testId}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-(--color-text-foreground-secondary)">
        {icon}
        <span>{label}</span>
      </div>
      <Badge variant="secondary" className="w-fit font-mono text-[11px]">
        {value}
      </Badge>
    </div>
  );
}
