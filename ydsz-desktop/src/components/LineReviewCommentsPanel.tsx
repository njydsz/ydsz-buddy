/**
 * @file 行级 Review Comments 面板
 * @description 独立组件：把 `reviewCommentsStore` 的状态渲染成可操作的 Review 列表。
 *              在 DiffPanel 内以"Comments" Tab 形式挂载；通过 props 接收当前 thread/turn 维度。
 *
 * ## 核心能力
 *
 * 1. **按文件分组展示**：`src/foo.ts` 下的所有评论按 hunk/line 排序
 * 2. **新建评论**：行号 + 选区 + Markdown body，键盘友好（Cmd/Ctrl+Enter 提交）
 * 3. **状态机**：open ↔ resolved / dismissed 一键切换
 * 4. **跳转定位**：点击某条评论调用 `onLocateComment` 回调，DiffPanel 滚动到对应行
 * 5. **可达性**：data-testid / aria-label / 键盘 Tab 顺序 / 焦点环
 * 6. **空状态**：用 `<EmptyComments />` 引导用户"在 diff 中点击行号旁的 + 号新建"
 *
 * ## 集成方式
 *
 * ```tsx
 * <LineReviewCommentsPanel
 *   threadId={threadId}
 *   turnId={turnId}
 *   onLocateComment={(comment) => diffPanelRef.current?.scrollToLine(comment)}
 * />
 * ```
 *
 * ## 与 ES 编排引擎的关系
 *
 * - 当前 store 为 localStorage 持久化
 * - 未来对接 ES：addComment 内追加 `eventBus.emit('ReviewCommentAdded', comment)`
 * - 参见 reviewCommentsStore.ts 顶部说明
 */

import { type ThreadId, type TurnId } from "@ydsz-buddy/contracts";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { ScrollArea } from "./ui/scroll-area";
import { toastManager } from "./ui/toast";
import { CheckIcon, XIcon, MessageCircleIcon, Trash2 as TrashIcon, SendIcon } from "~/lib/icons";

import {
  useReviewCommentsStore,
  selectCommentsForTurn,
  REVIEW_COMMENT_STATUS_LABELS,
  REVIEW_COMMENT_LINE_TYPE_LABELS,
  type ReviewComment,
  type NewReviewComment,
} from "../reviewCommentsStore";

/** 新建评论的入参（不包含 threadId / turnId，由 panel 注入） */
export interface LineReviewCommentDraft {
  filePath: string;
  hunkIndex: number;
  lineNumber: number;
  lineType: "add" | "del" | "context";
  lineContent: string;
}

export interface LineReviewCommentsPanelProps {
  threadId: ThreadId;
  turnId: TurnId | null;
  /** 父组件传入的"草稿"——由 DiffPanel 行号 + 按钮触发 */
  pendingDraft: LineReviewCommentDraft | null;
  /** 草稿被消费后回调（父组件清空 pendingDraft 状态） */
  onDraftConsumed: () => void;
  /** 点击某条评论，DiffPanel 滚动到对应行（仅占位 API，父组件决定行为） */
  onLocateComment?: (comment: ReviewComment) => void;
  /** 将评论汇总发送给 Agent，触发 follow-up turn */
  onSendToAgent?: (formattedMessage: string) => void;
  className?: string;
  /** 作者标识（默认 "user"） */
  author?: string;
}

export function LineReviewCommentsPanel({
  threadId,
  turnId,
  pendingDraft,
  onDraftConsumed,
  onLocateComment,
  onSendToAgent,
  className,
  author = "user",
}: LineReviewCommentsPanelProps) {
  const comments = useReviewCommentsStore((s) => s.comments);
  const addComment = useReviewCommentsStore((s) => s.addComment);
  const resolveComment = useReviewCommentsStore((s) => s.resolveComment);
  const reopenComment = useReviewCommentsStore((s) => s.reopenComment);
  const dismissComment = useReviewCommentsStore((s) => s.dismissComment);
  const deleteComment = useReviewCommentsStore((s) => s.deleteComment);

  const scoped = useMemo(
    () => selectCommentsForTurn(comments, threadId, turnId),
    [comments, threadId, turnId],
  );

  /** 按 filePath 分组（保持文件之间的稳定性） */
  const grouped = useMemo(() => {
    const m = new Map<string, ReviewComment[]>();
    for (const c of scoped) {
      const list = m.get(c.filePath);
      if (list) list.push(c);
      else m.set(c.filePath, [c]);
    }
    // 排序：每组内按 hunkIndex / lineNumber；组间按最早评论时间
    const entries = Array.from(m.entries()).map(([filePath, list]) => {
      const sorted = [...list].sort((a, b) => {
        if (a.hunkIndex !== b.hunkIndex) return a.hunkIndex - b.hunkIndex;
        return a.lineNumber - b.lineNumber;
      });
      return { filePath, comments: sorted };
    });
    entries.sort((a, b) => {
      const aFirst = a.comments[0]?.createdAt ?? "";
      const bFirst = b.comments[0]?.createdAt ?? "";
      return aFirst < bFirst ? -1 : aFirst > bFirst ? 1 : 0;
    });
    return entries;
  }, [scoped]);

  /** pendingDraft 弹起时，body 聚焦 */
  const [pendingBody, setPendingBody] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (pendingDraft) {
      setPendingBody("");
      // 下一帧聚焦（等父组件 setState 提交完再 focus）
      const id = requestAnimationFrame(() => {
        bodyRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [pendingDraft]);

  const handleSubmit = useCallback(() => {
    if (!pendingDraft) return;
    const body = pendingBody.trim();
    if (body.length === 0) {
      toastManager.add({
        type: "warning",
        title: "评论为空",
        description: "请输入评论内容。",
        timeout: 2000,
      });
      return;
    }
    const input: NewReviewComment = {
      threadId,
      turnId,
      filePath: pendingDraft.filePath,
      hunkIndex: pendingDraft.hunkIndex,
      lineNumber: pendingDraft.lineNumber,
      lineType: pendingDraft.lineType,
      lineContent: pendingDraft.lineContent,
      body,
      author,
    };
    addComment(input);
    setPendingBody("");
    onDraftConsumed();
    toastManager.add({
      type: "success",
      title: "评论已添加",
      description: `${pendingDraft.filePath}:${pendingDraft.lineNumber}`,
      timeout: 1800,
    });
  }, [pendingDraft, pendingBody, threadId, turnId, author, addComment, onDraftConsumed]);

  const handleCancel = useCallback(() => {
    setPendingBody("");
    onDraftConsumed();
  }, [onDraftConsumed]);

  /** 将所有 open 状态的评论汇总成结构化消息，发送给 Agent */
  const handleSendToAgent = useCallback(() => {
    if (!onSendToAgent) return;
    const openComments = scoped.filter((c) => c.status === "open");
    if (openComments.length === 0) {
      toastManager.add({
        type: "warning",
        title: "没有待处理的评论",
        description: "所有评论已解决或忽略。",
        timeout: 2000,
      });
      return;
    }

    // 按文件分组格式化
    const byFile = new Map<string, ReviewComment[]>();
    for (const c of openComments) {
      const list = byFile.get(c.filePath);
      if (list) list.push(c);
      else byFile.set(c.filePath, [c]);
    }

    const sections: string[] = [];
    for (const [filePath, list] of byFile) {
      const sorted = [...list].sort((a, b) => a.lineNumber - b.lineNumber);
      const lines: string[] = [`### \`${filePath}\``];
      for (const c of sorted) {
        const lineTypeLabel = REVIEW_COMMENT_LINE_TYPE_LABELS[c.lineType];
        lines.push(`**L${c.lineNumber} (${lineTypeLabel})**: ${c.body}`);
        if (c.lineContent) {
          lines.push("```");
          lines.push(c.lineContent);
          lines.push("```");
        }
      }
      sections.push(lines.join("\n"));
    }

    const message = [
      "## Code Review Comments",
      "",
      "Please address the following review comments:",
      "",
      sections.join("\n\n"),
      "",
      "Please make the necessary changes to resolve these comments.",
    ].join("\n");

    onSendToAgent(message);
    toastManager.add({
      type: "success",
      title: "已发送给 Agent",
      description: `${openComments.length} 条评论已作为 follow-up 发送。`,
      timeout: 2500,
    });
  }, [onSendToAgent, scoped]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl+Enter 提交
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSubmit, handleCancel],
  );

  return (
    <div
      data-testid="line-review-comments-panel"
      className={cn("flex h-full flex-col", className)}
    >
      {/* 顶部：标题 + 统计 */}
      <div
        className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs"
        data-testid="line-review-comments-header"
      >
        <div className="flex items-center gap-1.5 font-medium">
          <MessageCircleIcon className="size-3.5" />
          <span>Review 评论</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {scoped.length} 条
          </Badge>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            待解决 {scoped.filter((c) => c.status === "open").length}
          </Badge>
          {onSendToAgent ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSendToAgent}
              disabled={scoped.filter((c) => c.status === "open").length === 0}
              data-testid="line-review-comments-send-to-agent"
              aria-label="发送评论给 Agent"
              className="h-6 gap-1 px-1.5 text-[11px]"
            >
              <SendIcon className="size-3" />
              发给 Agent
            </Button>
          ) : null}
        </div>
      </div>

      {/* 新建评论编辑器（仅在有 pendingDraft 时显示） */}
      {pendingDraft ? (
        <div
          className="flex flex-col gap-2 border-b border-border/60 bg-card/50 p-3"
          data-testid="line-review-comments-composer"
        >
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="font-mono text-foreground">
              {pendingDraft.filePath}:{pendingDraft.lineNumber}
            </span>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {REVIEW_COMMENT_LINE_TYPE_LABELS[pendingDraft.lineType]}
            </Badge>
          </div>
          <div
            className="max-h-24 overflow-y-auto rounded border border-border/40 bg-background/60 p-1.5 font-mono text-[11px] text-muted-foreground"
            data-testid="line-review-comments-composer-selection"
          >
            {pendingDraft.lineContent || "(空行)"}
          </div>
          <Textarea
            ref={bodyRef}
            value={pendingBody}
            onChange={(e) => setPendingBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="写下你的 review 意见…（Cmd/Ctrl+Enter 提交，Esc 取消）"
            rows={3}
            className="resize-y text-xs"
            data-testid="line-review-comments-composer-input"
            aria-label="Review 评论正文"
          />
          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              data-testid="line-review-comments-composer-cancel"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              data-testid="line-review-comments-composer-submit"
            >
              提交评论
            </Button>
          </div>
        </div>
      ) : null}

      {/* 评论列表 */}
      <ScrollArea className="flex-1">
        {grouped.length === 0 ? (
          <EmptyComments
            hasDraft={false}
            onAddFromHunk={() => {
              /* DiffPanel 通过 pendingDraft 触发；此处提示 */
            }}
          />
        ) : (
          <div
            className="flex flex-col"
            data-testid="line-review-comments-list"
          >
            {grouped.map(({ filePath, comments: list }) => (
              <CommentGroup
                key={filePath}
                filePath={filePath}
                comments={list}
                onLocate={onLocateComment}
                onResolve={resolveComment}
                onReopen={reopenComment}
                onDismiss={dismissComment}
                onDelete={deleteComment}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface CommentGroupProps {
  filePath: string;
  comments: ReviewComment[];
  onLocate?: (c: ReviewComment) => void;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => void;
}

function CommentGroup({
  filePath,
  comments,
  onLocate,
  onResolve,
  onReopen,
  onDismiss,
  onDelete,
}: CommentGroupProps) {
  return (
    <section
      data-testid="line-review-comments-group"
      data-file-path={filePath}
      className="flex flex-col gap-1 px-3 py-2"
    >
      <header className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <span className="font-mono text-foreground/80">{filePath}</span>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {comments.length}
        </Badge>
      </header>
      <Separator />
      <ul className="flex flex-col gap-1.5">
        {comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            onLocate={onLocate}
            onResolve={onResolve}
            onReopen={onReopen}
            onDismiss={onDismiss}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </section>
  );
}

interface CommentItemProps {
  comment: ReviewComment;
  onLocate?: (c: ReviewComment) => void;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => void;
}

function CommentItem({
  comment,
  onLocate,
  onResolve,
  onReopen,
  onDismiss,
  onDelete,
}: CommentItemProps) {
  const [expanded, setExpanded] = useState(false);
  const truncated = comment.body.length > 200 && !expanded;
  const displayBody = truncated ? `${comment.body.slice(0, 200)}…` : comment.body;

  const statusBadgeVariant =
    comment.status === "open"
      ? "default"
      : comment.status === "resolved"
        ? "secondary"
        : "outline";

  return (
    <li
      data-testid="line-review-comment-item"
      data-comment-id={comment.id}
      data-comment-status={comment.status}
      className={cn(
        "flex flex-col gap-1 rounded-md border border-border/40 bg-card/40 p-2 text-[12px]",
        comment.status === "resolved" && "opacity-60",
        comment.status === "dismissed" && "opacity-40 line-through",
      )}
    >
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <button
          type="button"
          className="font-mono text-foreground/80 hover:underline"
          onClick={() => onLocate?.(comment)}
          aria-label={`跳转到 ${comment.filePath}:${comment.lineNumber}`}
          data-testid="line-review-comment-locate"
        >
          L{comment.lineNumber}
        </button>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {REVIEW_COMMENT_LINE_TYPE_LABELS[comment.lineType]}
        </Badge>
        <Badge variant={statusBadgeVariant} className="px-1.5 py-0 text-[10px]">
          {REVIEW_COMMENT_STATUS_LABELS[comment.status]}
        </Badge>
        <span className="ml-auto text-[10px]">{formatRelative(comment.updatedAt)}</span>
      </div>

      {comment.lineContent ? (
        <pre
          className="overflow-x-auto rounded border border-border/30 bg-background/60 p-1 font-mono text-[10.5px] text-muted-foreground"
          data-testid="line-review-comment-line-content"
        >
          {comment.lineContent}
        </pre>
      ) : null}

      <p
        className="whitespace-pre-wrap break-words"
        data-testid="line-review-comment-body"
      >
        {displayBody}
      </p>
      {comment.body.length > 200 ? (
        <button
          type="button"
          className="self-start text-[10px] text-primary hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "收起" : "展开"}
        </button>
      ) : null}

      <div className="flex items-center gap-1">
        {comment.status === "open" ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onResolve(comment.id)}
              data-testid="line-review-comment-resolve"
              aria-label="标记为已解决"
              className="h-6 px-1.5 text-[11px]"
            >
              <CheckIcon className="size-3" />
              解决
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onDismiss(comment.id)}
              data-testid="line-review-comment-dismiss"
              aria-label="忽略该评论"
              className="h-6 px-1.5 text-[11px]"
            >
              <XIcon className="size-3" />
              忽略
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onReopen(comment.id)}
            data-testid="line-review-comment-reopen"
            aria-label="重新打开"
            className="h-6 px-1.5 text-[11px]"
          >
            重新打开
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onDelete(comment.id)}
          data-testid="line-review-comment-delete"
          aria-label="删除评论"
          className="ml-auto h-6 px-1.5 text-[11px] text-destructive hover:text-destructive"
        >
          <TrashIcon className="size-3" />
        </Button>
      </div>
    </li>
  );
}

function EmptyComments({ hasDraft }: { hasDraft: boolean; onAddFromHunk: () => void }) {
  if (hasDraft) {
    return (
      <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
        请在上方编辑器中填写评论内容。
      </div>
    );
  }
  return (
    <div
      className="flex flex-col items-center gap-2 px-3 py-10 text-center text-[12px] text-muted-foreground"
      data-testid="line-review-comments-empty"
    >
      <MessageCircleIcon className="size-8 opacity-40" />
      <p className="max-w-[200px]">还没有 Review 评论。</p>
      <p className="max-w-[260px] text-[11px] opacity-80">
        在 diff 中点击行号旁的 <span className="font-mono">+</span>{" "}
        按钮，可对单行/单 hunk 发起评论。
      </p>
    </div>
  );
}

/** 简短时间展示（"3 分钟前" / "2 小时前" / "2026-06-25 14:30"） */
function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diffSec = (Date.now() - ts) / 1000;
  if (diffSec < 60) return "刚刚";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)} 小时前`;
  if (diffSec < 86_400 * 7) return `${Math.floor(diffSec / 86_400)} 天前`;
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
