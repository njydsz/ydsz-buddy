/**
 * @file 事件时间线组件
 *
 * 显示线程的完整事件溯源时间线，支持：
 * - 按事件类型分组过滤（项目/线程/消息/Turn/活动/检查点/定时任务/其他）
 * - 文本搜索（在事件类型、摘要、序列号中匹配）
 * - 彩色类型标签
 * - 点击展开查看完整 JSON
 * - 选中检查点事件进行回退（调用 thread.checkpoint.revert 命令）
 * - 分页加载（大量事件时按需追加）
 * - 审计导出（JSON / Markdown / CSV）
 * - 事件回放
 *
 * ## 数据来源
 *
 * 通过 `api.orchestration.replayEvents(0)` 获取全部事件，再按 `aggregateId` 过滤当前线程。
 * 同时订阅 `onDomainEvent` 实时追加新事件。
 *
 * ## 注意事项
 *
 * - 后端目前没有专用的 `thread_stream_events` 命令，使用 `replayEvents` 全量拉取后过滤。
 *   事件量较大时建议后端新增 `thread_stream_events({ threadId, limit })` 命令以减少传输。
 * - 检查点回退复用 ChatView 中已有的 `thread.checkpoint.revert` 命令调度路径。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { type OrchestrationEvent, type ThreadId } from "~/contracts";
import { readNativeApi } from "~/nativeApi";
import { cn } from "~/lib/utils";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  Loader2Icon,
  RotateCcwIcon,
  PlayIcon,
  SearchIcon,
} from "~/lib/icons";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { AuditExportDialog } from "../AuditExportDialog";
import { EventReplay } from "./EventReplay";

/** 事件分类 */
type EventCategory =
  | "project"
  | "thread"
  | "message"
  | "turn"
  | "activity"
  | "checkpoint"
  | "scheduled"
  | "other";

/** 分类 -> 颜色 token 映射（与 Tailwind 深色主题对齐） */
const CATEGORY_STYLE: Record<
  EventCategory,
  { label: string; badgeClass: string; dotClass: string }
> = {
  project: {
    label: "项目",
    badgeClass:
      "bg-(--color-info)/12 text-(--color-info-foreground) dark:bg-(--color-info)/20",
    dotClass: "bg-(--color-info)",
  },
  thread: {
    label: "线程",
    badgeClass:
      "bg-(--color-success)/12 text-(--color-success-foreground) dark:bg-(--color-success)/20",
    dotClass: "bg-(--color-success)",
  },
  message: {
    label: "消息",
    badgeClass:
      "bg-(--color-info)/12 text-(--color-info-foreground) dark:bg-(--color-info)/24",
    dotClass: "bg-(--color-info)",
  },
  turn: {
    label: "Turn",
    badgeClass:
      "bg-(--color-warning)/12 text-(--color-warning-foreground) dark:bg-(--color-warning)/20",
    dotClass: "bg-(--color-warning)",
  },
  checkpoint: {
    label: "检查点",
    badgeClass:
      "bg-(--color-destructive)/12 text-(--color-destructive-foreground) dark:bg-(--color-destructive)/20",
    dotClass: "bg-(--color-destructive)",
  },
  scheduled: {
    label: "定时任务",
    badgeClass:
      "bg-(--color-success)/12 text-(--color-success-foreground) dark:bg-(--color-success)/24",
    dotClass: "bg-(--color-success)",
  },
  activity: {
    label: "活动",
    badgeClass:
      "bg-(--color-warning)/12 text-(--color-warning-foreground) dark:bg-(--color-warning)/24",
    dotClass: "bg-(--color-warning)",
  },
  other: {
    label: "其他",
    badgeClass:
      "bg-(--color-background-button-secondary) text-(--color-text-foreground-secondary)",
    dotClass: "text-(--color-text-foreground-secondary)",
  },
};

/** 事件类型 -> 分类映射 */
function categorize(eventType: string): EventCategory {
  if (eventType.startsWith("project.")) return "project";
  if (eventType.startsWith("scheduled-job.")) return "scheduled";
  if (eventType === "thread.message-sent") return "message";
  if (eventType === "thread.activity-appended") return "activity";
  if (eventType.startsWith("thread.turn-")) return "turn";
  if (
    eventType === "thread.checkpoint-revert-requested" ||
    eventType === "thread.reverted" ||
    eventType === "thread.turn-diff-completed" ||
    eventType === "thread.conversation-rollback-requested" ||
    eventType === "thread.conversation.rolled-back"
  ) {
    return "checkpoint";
  }
  if (
    eventType === "thread.created" ||
    eventType === "thread.deleted" ||
    eventType === "thread.archived" ||
    eventType === "thread.unarchived" ||
    eventType === "thread.meta-updated" ||
    eventType === "thread.runtime-mode-set" ||
    eventType === "thread.interaction-mode-set"
  ) {
    return "thread";
  }
  return "other";
}

/** 从事件 payload 中提取关键字段摘要 */
function summarizeEvent(event: OrchestrationEvent): string {
  const payload = event.payload as Record<string, unknown>;
  const type = event.type;
  switch (type) {
    case "project.created":
      return `${payload.title ?? ""} · ${payload.workspaceRoot ?? ""}`.trim();
    case "project.meta-updated":
      return payload.title ? `title → ${payload.title}` : "";
    case "thread.created":
      return `${payload.title ?? ""} · ${payload.runtimeMode ?? ""}`.trim();
    case "thread.meta-updated":
      return payload.title ? `title → ${payload.title}` : "";
    case "thread.runtime-mode-set":
      return `mode → ${payload.runtimeMode ?? ""}`;
    case "thread.interaction-mode-set":
      return `mode → ${payload.interactionMode ?? ""}`;
    case "thread.message-sent": {
      const text = String(payload.text ?? "");
      const trimmed = text.replace(/\s+/g, " ").trim();
      return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
    }
    case "thread.turn-queued":
    case "thread.turn-start-requested":
      return `turnId=${payload.turnId ?? payload.messageId ?? ""}`;
    case "thread.turn-interrupt-requested":
      return `turnId=${payload.turnId ?? ""}`;
    case "thread.checkpoint-revert-requested":
      return `turnCount=${payload.turnCount ?? ""}`;
    case "thread.reverted":
      return `turnCount=${payload.turnCount ?? ""}`;
    case "thread.turn-diff-completed":
      return `turnId=${payload.turnId ?? ""} · status=${payload.status ?? ""}`;
    case "thread.conversation-rollback-requested":
    case "thread.conversation.rolled-back":
      return `messageId=${payload.messageId ?? ""} · numTurns=${payload.numTurns ?? ""}`;
    case "thread.message-edit-resend-requested": {
      const text = String(payload.text ?? "");
      const trimmed = text.replace(/\s+/g, " ").trim();
      return `messageId=${payload.messageId ?? ""} · ${trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed}`;
    }
    case "thread.session-stop-requested":
      return "";
    case "thread.session-set":
      return `status=${(payload.session as { status?: string } | null)?.status ?? ""}`;
    case "thread.proposed-plan-upserted": {
      const plan = payload.proposedPlan as { title?: string } | null;
      return plan?.title ? `plan=${plan.title}` : "";
    }
    case "thread.activity-appended": {
      const activity = payload.activity as {
        label?: string;
        kind?: string;
        detail?: string;
        status?: string;
      } | null;
      if (!activity) return "";
      const parts: string[] = [];
      if (activity.kind) parts.push(activity.kind);
      if (activity.label) parts.push(activity.label);
      if (activity.status) parts.push(`[${activity.status}]`);
      if (activity.detail) {
        const detail = String(activity.detail).replace(/\s+/g, " ").trim();
        parts.push(detail.length > 60 ? `${detail.slice(0, 60)}…` : detail);
      }
      return parts.join(" · ");
    }
    default:
      // 兜底：包括 scheduled-job.* 等后端已定义但前端契约尚未收录的事件类型
      if (typeof type === "string" && type.startsWith("scheduled-job.")) {
        return `taskId=${payload.taskId ?? ""}`;
      }
      return "";
  }
}

interface EventTimelineProps {
  threadId: ThreadId;
  isRevertingCheckpoint: boolean;
  onRevertToTurnCount: (turnCount: number) => void;
}

const INITIAL_PAGE_SIZE = 100;
const PAGE_SIZE = 100;

export function EventTimeline({
  threadId,
  isRevertingCheckpoint,
  onRevertToTurnCount,
}: EventTimelineProps) {
  const api = readNativeApi();
  const [allEvents, setAllEvents] = useState<OrchestrationEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE_SIZE);
  const [expandedSeqs, setExpandedSeqs] = useState<Set<number>>(new Set());
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    new Set(),
  );
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 拉取全量事件并按 threadId 过滤
  const loadEvents = useCallback(async () => {
    if (!api) {
      setError("Native API 不可用");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const events = await api.orchestration.replayEvents(0);
      const filtered = events.filter((event) => event.aggregateId === threadId);
      // 按序列号倒序（最新在前）
      filtered.sort((a, b) => b.sequence - a.sequence);
      setAllEvents(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载事件失败");
    } finally {
      setIsLoading(false);
    }
  }, [api, threadId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // 订阅实时事件
  useEffect(() => {
    if (!api) return;
    const unsubscribe = api.orchestration.onDomainEvent((event) => {
      if (event.aggregateId !== threadId) return;
      setAllEvents((prev) => {
        if (prev.some((e) => e.sequence === event.sequence)) return prev;
        const next = [event, ...prev];
        next.sort((a, b) => b.sequence - a.sequence);
        return next;
      });
    });
    return unsubscribe;
  }, [api, threadId]);

  const filteredEvents = useMemo(() => {
    let result = allEvents;
    // 按分类过滤
    if (activeCategories.size > 0) {
      result = result.filter((event) => activeCategories.has(categorize(event.type)));
    }
    // 按搜索文本过滤
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((event) => {
        if (event.type.toLowerCase().includes(query)) return true;
        if (String(event.sequence).includes(query)) return true;
        const summary = summarizeEvent(event).toLowerCase();
        if (summary.includes(query)) return true;
        return false;
      });
    }
    return result;
  }, [allEvents, activeCategories, searchQuery]);

  const visibleEvents = useMemo(
    () => filteredEvents.slice(0, visibleCount),
    [filteredEvents, visibleCount],
  );

  const toggleCategory = useCallback((category: EventCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
    setVisibleCount(INITIAL_PAGE_SIZE);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setVisibleCount(INITIAL_PAGE_SIZE);
  }, []);

  const toggleExpand = useCallback((sequence: number) => {
    setExpandedSeqs((prev) => {
      const next = new Set(prev);
      if (next.has(sequence)) {
        next.delete(sequence);
      } else {
        next.add(sequence);
      }
      return next;
    });
  }, []);

  const handleRevert = useCallback(
    (event: OrchestrationEvent) => {
      if (event.type !== "thread.turn-diff-completed") return;
      const turnCount = (event.payload as { checkpointTurnCount?: number }).checkpointTurnCount;
      if (typeof turnCount !== "number") return;
      onRevertToTurnCount(turnCount);
    },
    [onRevertToTurnCount],
  );

  const handleExport = useCallback(() => {
    setAuditDialogOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-(--color-text-foreground-secondary)">
        <Loader2Icon className="size-4 animate-spin" />
        <span className="ms-2 text-xs">加载事件流…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-xs text-(--color-destructive-foreground)">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void loadEvents()}>
          重试
        </Button>
      </div>
    );
  }

  const categoryCounts = allEvents.reduce(
    (acc, event) => {
      const cat = categorize(event.type);
      acc[cat] = (acc[cat] ?? 0) + 1;
      return acc;
    },
    {} as Record<EventCategory, number>,
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="flex flex-col gap-2 border-b border-(--color-border-light) px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(CATEGORY_STYLE) as EventCategory[]).map((category) => {
            const style = CATEGORY_STYLE[category];
            const active = activeCategories.has(category);
            const count = categoryCounts[category] ?? 0;
            if (count === 0 && !active) return null;
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  active
                    ? "border-transparent " + style.badgeClass
                    : "border-(--color-border) text-(--color-text-foreground-secondary) hover:bg-(--color-background-button-secondary-hover)",
                )}
              >
                <span className={cn("size-1.5 rounded-full", style.dotClass)} />
                <span>{style.label}</span>
                <span className="opacity-70">{count}</span>
              </button>
            );
          })}
          <div className="ms-auto flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setReplayOpen(true)}
              disabled={allEvents.length === 0}
              aria-label="回放事件"
              data-testid="event-timeline-replay"
            >
              <PlayIcon className="size-3.5" />
              <span>回放</span>
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void loadEvents()}
              aria-label="刷新事件流"
            >
              <RotateCcwIcon className="size-3.5" />
            </Button>
            <Button size="xs" variant="ghost" onClick={handleExport}>
              <DownloadIcon className="size-3.5" />
              <span>导出审计</span>
            </Button>
          </div>
        </div>
        {/* 搜索框 */}
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-(--color-text-foreground-secondary)" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="搜索事件类型、摘要或序列号…"
            className="w-full rounded-md border border-(--color-border) bg-(--color-background-surface) py-1 pr-2 pl-8 text-[11px] text-(--color-text-foreground) placeholder:text-(--color-text-foreground-secondary) focus:border-(--color-border-focus) focus:outline-none"
          />
        </div>
        <div className="text-[11px] text-(--color-text-foreground-secondary)">
          共 {allEvents.length} 条事件{activeCategories.size > 0 || searchQuery.trim() ? ` · 过滤后 ${filteredEvents.length} 条` : ""}
        </div>
      </div>

      {/* 事件列表 */}
      <ScrollArea className="min-h-0 flex-1" scrollFade>
        <ol className="mx-auto flex max-w-3xl flex-col gap-1 px-3 py-2 sm:px-4">
          {visibleEvents.length === 0 ? (
            <li className="py-12 text-center text-xs text-(--color-text-foreground-secondary)">
              暂无事件
            </li>
          ) : null}
          {visibleEvents.map((event) => {
            const category = categorize(event.type);
            const style = CATEGORY_STYLE[category];
            const expanded = expandedSeqs.has(event.sequence);
            const summary = summarizeEvent(event);
            const canRevert = event.type === "thread.turn-diff-completed";
            const occurredAt = new Date(event.occurredAt);
            const timeLabel = `${occurredAt.toLocaleDateString()} ${occurredAt.toLocaleTimeString()}`;
            return (
              <li
                key={event.sequence}
                className="rounded-lg border border-(--color-border-light) bg-(--color-background-surface) transition-colors hover:border-(--color-border)"
              >
                <div className="flex items-start gap-2 px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(event.sequence)}
                    className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded text-(--color-text-foreground-secondary) hover:bg-(--color-background-button-secondary-hover)"
                    aria-label={expanded ? "收起" : "展开"}
                  >
                    {expanded ? (
                      <ChevronDownIcon className="size-3" />
                    ) : (
                      <ChevronRightIcon className="size-3" />
                    )}
                  </button>
                  <span
                    className={cn(
                      "mt-1 size-1.5 shrink-0 rounded-full",
                      style.dotClass,
                    )}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn("font-mono text-[10px]", style.badgeClass)}
                      >
                        {event.type}
                      </Badge>
                      <span className="font-mono text-[10px] text-(--color-text-foreground-secondary)">
                        #{event.sequence}
                      </span>
                      <span
                        className="text-[10px] text-(--color-text-foreground-secondary)"
                        title={event.occurredAt}
                      >
                        {timeLabel}
                      </span>
                      {canRevert ? (
                        <Button
                          size="xs"
                          variant="outline"
                          className="ms-auto"
                          disabled={isRevertingCheckpoint}
                          onClick={() => handleRevert(event)}
                        >
                          <RotateCcwIcon className="size-3" />
                          <span>回退到此检查点</span>
                        </Button>
                      ) : null}
                    </div>
                    {summary ? (
                      <p className="truncate text-[11px] text-(--color-text-foreground)">
                        {summary}
                      </p>
                    ) : null}
                    {expanded ? (
                      <pre className="mt-1 max-h-80 overflow-auto rounded-md border border-(--color-border-light) bg-(--color-background-elevated-secondary) p-2 font-mono text-[10px] leading-relaxed text-(--color-text-foreground)">
                        {JSON.stringify(event, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
          {visibleCount < filteredEvents.length ? (
            <li className="py-2 text-center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                加载更多（剩余 {filteredEvents.length - visibleCount} 条）
              </Button>
            </li>
          ) : null}
        </ol>
      </ScrollArea>

      <AuditExportDialog
        open={auditDialogOpen}
        onOpenChange={setAuditDialogOpen}
        threadId={threadId}
        events={allEvents}
      />

      <EventReplay
        open={replayOpen}
        onOpenChange={setReplayOpen}
        events={allEvents}
        title={`回放 · ${threadId.slice(0, 8)}`}
        description={`共 ${allEvents.length} 条事件，按时间正序逐步播放`}
      />
    </div>
  );
}
