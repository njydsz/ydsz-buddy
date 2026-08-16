/**
 * @file EventReplay
 * @description 事件时间线慢动作回放（P2-3）
 *
 * 把线程的全部 ES 事件按时间正序排好,提供"视频播放器"式的逐步回放控制:
 *
 * - Play / Pause / Step forward / Step back / Reset
 * - 速度档位(0.5x / 1x / 2x / 4x)
 * - 进度条 / 拖动 seek
 * - 当前事件在列表中高亮 + 顶部详情区展示完整 JSON
 * - 自动滚动到当前事件
 * - 键盘快捷键:Space 播放/暂停、←/→ 单步、Home/End 跳到首/尾、Esc 关闭
 *
 * ## P2-3 增强功能
 *
 * - 事件分类过滤(项目/线程/消息/Turn/活动/检查点/定时任务)
 * - 人类可读事件摘要卡片(对已知事件类型解析 payload 生成摘要)
 * - 时间线密度条(可视化事件分布,类似视频 mini-map)
 * - 事件计数 + 时间跨度显示
 *
 * ## 数据来源
 *
 * 调用方传入已加载的 events(沿用 EventTimeline 的预取数据,避免重复 IPC)。
 * 内部按 sequence 升序排序作为播放列表。
 *
 * ## 速率解释
 *
 * 1x = 真实节奏(每事件间隔 ~1000ms);0.5x 慢动作;2x/4x 快进。
 * 真实场景中事件密度极高(数百事件/秒),1x 已"慢动作"足够。
 */
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type OrchestrationEvent } from "~/contracts";
import { cn } from "~/lib/utils";
import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  RotateCcwIcon,
} from "~/lib/icons";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useTranslation } from "~/i18n";

/** 播放速率档位(单位:ms / event) */
const SPEED_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 200, label: "4x" },
  { value: 500, label: "2x" },
  { value: 1000, label: "1x" },
  { value: 2000, label: "0.5x" },
];

/** 事件分类(与 EventTimeline 保持一致) */
type EventCategory =
  | "project"
  | "thread"
  | "message"
  | "turn"
  | "activity"
  | "checkpoint"
  | "scheduled"
  | "other";

const CATEGORY_LABELS: Record<EventCategory, string> = {
  project: "项目",
  thread: "线程",
  message: "消息",
  turn: "Turn",
  activity: "活动",
  checkpoint: "检查点",
  scheduled: "定时任务",
  other: "其他",
};

const CATEGORY_COLORS: Record<EventCategory, string> = {
  project: "bg-blue-500",
  thread: "bg-green-500",
  message: "bg-cyan-500",
  turn: "bg-amber-500",
  activity: "bg-orange-500",
  checkpoint: "bg-red-500",
  scheduled: "bg-emerald-500",
  other: "bg-gray-400",
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
  if (eventType.startsWith("thread.")) return "thread";
  return "other";
}

/** 为已知事件类型生成人类可读摘要 */
function formatEventSummary(event: OrchestrationEvent): string {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type as string) {
    case "thread.message-sent": {
      const text = String(payload.text ?? "").replace(/\s+/g, " ").trim();
      return text ? `消息: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}` : "消息已发送";
    }
    case "thread.turn-diff-completed": {
      const status = payload.status ? String(payload.status) : "";
      const turnId = payload.turnId ? String(payload.turnId) : "";
      const files = payload.fileCount as number | undefined;
      return `Turn ${turnId} ${status ? `· ${status}` : ""}${files ? ` · ${files} 文件变更` : ""}`;
    }
    case "thread.checkpoint-revert-requested":
      return `请求回退到 Turn ${payload.turnCount ?? ""}`;
    case "thread.reverted":
      return `已回退到 Turn ${payload.turnCount ?? ""}`;
    case "thread.activity-appended": {
      const activity = payload.activity as { label?: string; kind?: string; status?: string } | null;
      if (!activity) return "活动已追加";
      const parts = [activity.kind, activity.label, activity.status ? `[${activity.status}]` : ""].filter(Boolean);
      return `活动: ${parts.join(" ")}`;
    }
    case "thread.created":
      return "线程已创建";
    case "thread.archived":
      return "线程已归档";
    case "project.created":
      return "项目已创建";
    case "scheduled-job.fired":
      return `定时任务触发: ${payload.jobName ?? payload.jobId ?? ""}`;
    case "scheduled-job.finished":
      return `定时任务完成: ${payload.jobName ?? payload.jobId ?? ""}`;
    default: {
      // 对于未知事件类型,尝试提取关键字段
      const keys = Object.keys(payload);
      if (keys.length === 0) return event.type;
      const summary = keys.slice(0, 3).map((k) => `${k}=${String(payload[k]).slice(0, 50)}`).join(", ");
      return summary;
    }
  }
}

/** 格式化时间跨度 */
function formatTimeSpan(events: readonly OrchestrationEvent[]): string {
  if (events.length < 2) return "—";
  const first = new Date(events[0]!.occurredAt).getTime();
  const last = new Date(events[events.length - 1]!.occurredAt).getTime();
  const span = last - first;
  if (span < 60_000) return `${(span / 1000).toFixed(1)}s`;
  if (span < 3_600_000) return `${(span / 60_000).toFixed(1)}min`;
  return `${(span / 3_600_000).toFixed(1)}h`;
}

interface EventReplayProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** 调用方预取好的事件(已按 aggregateId 过滤);按 sequence 升序作为播放列表 */
  readonly events: readonly OrchestrationEvent[];
  /** 顶栏标题(线程名 / 项目名) */
  readonly title?: string;
  /** 描述(时间范围 / 事件总数) */
  readonly description?: string;
}

export function EventReplay({
  open,
  onOpenChange,
  events,
  title,
  description,
}: EventReplayProps) {
  const { messages } = useTranslation();
  const t = messages.eventReplay;

  /** 升序排列作为播放列表(ES 写入是顺序的,但调用方可能传任意顺序) */
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.sequence - b.sequence),
    [events],
  );

  /** 分类过滤 */
  const [enabledCategories, setEnabledCategories] = useState<Set<EventCategory>>(
    () => new Set(Object.keys(CATEGORY_LABELS) as EventCategory[]),
  );

  /** 过滤后的播放列表 */
  const playlist = useMemo(() => {
    return sortedEvents.filter((e) => enabledCategories.has(categorize(e.type)));
  }, [sortedEvents, enabledCategories]);

  /** 分类统计(用于过滤标签) */
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<EventCategory, number>> = {};
    for (const e of sortedEvents) {
      const cat = categorize(e.type);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [sortedEvents]);

  const handleToggleCategory = useCallback((cat: EventCategory) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEED_OPTIONS[2]!.value); // 1x

  // 打开对话框 / playlist 变化 → 重置 cursor
  useEffect(() => {
    if (open) {
      setCursor(0);
      setPlaying(false);
    }
  }, [open, playlist.length]);

  // 播放循环:每 speed 毫秒推进一格
  useEffect(() => {
    if (!playing) return;
    if (playlist.length === 0) return;
    if (cursor >= playlist.length - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      setCursor((c) => Math.min(c + 1, playlist.length - 1));
    }, speed);
    return () => window.clearTimeout(id);
  }, [playing, cursor, speed, playlist.length]);

  const handlePlayPause = useCallback(() => {
    if (playlist.length === 0) return;
    if (cursor >= playlist.length - 1) {
      // 走到末尾 → 重置后从头播放
      setCursor(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [cursor, playlist.length]);

  const handleStepForward = useCallback(() => {
    setPlaying(false);
    setCursor((c) => Math.min(c + 1, playlist.length - 1));
  }, [playlist.length]);

  const handleStepBack = useCallback(() => {
    setPlaying(false);
    setCursor((c) => Math.max(c - 1, 0));
  }, []);

  const handleReset = useCallback(() => {
    setPlaying(false);
    setCursor(0);
  }, []);

  const handleSeek = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const idx = Number(e.target.value);
      if (Number.isFinite(idx)) {
        setPlaying(false);
        setCursor(Math.max(0, Math.min(idx, playlist.length - 1)));
      }
    },
    [playlist.length],
  );

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === " ") {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleStepForward();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleStepBack();
      } else if (e.key === "Home") {
        e.preventDefault();
        handleReset();
      } else if (e.key === "End") {
        e.preventDefault();
        setPlaying(false);
        setCursor(Math.max(0, playlist.length - 1));
      }
    },
    [handlePlayPause, handleStepForward, handleStepBack, handleReset, playlist.length],
  );

  const current = playlist[cursor] ?? null;
  const canPlay = playlist.length > 0;
  const isAtEnd = cursor >= playlist.length - 1;
  const timeSpan = useMemo(() => formatTimeSpan(sortedEvents), [sortedEvents]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className="max-w-4xl"
        onKeyDown={handleKeyDown}
        data-testid="event-replay"
      >
        <DialogHeader>
          <DialogTitle>{title ?? t.title}</DialogTitle>
          <DialogDescription>
            {description ?? t.descriptionWithCount(playlist.length)}
            {sortedEvents.length > 0 && (
              <span className="ms-2 text-[10px] opacity-70">
                ({sortedEvents.length} 总事件 · 跨度 {timeSpan})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="flex min-h-0 flex-col gap-3">
          {/* 事件分类过滤 */}
          {sortedEvents.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(Object.keys(CATEGORY_LABELS) as EventCategory[]).map((cat) => {
                const count = categoryCounts[cat] ?? 0;
                if (count === 0) return null;
                const isEnabled = enabledCategories.has(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleToggleCategory(cat)}
                    className={cn(
                      "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                      isEnabled
                        ? "border-transparent bg-(--color-background-button-secondary) text-(--color-text-foreground)"
                        : "border-(--color-border) text-(--color-text-foreground-secondary) opacity-50 hover:opacity-80",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", CATEGORY_COLORS[cat])} />
                    {CATEGORY_LABELS[cat]} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* 时间线密度条 (mini-map) */}
          {playlist.length > 1 && (
            <div className="relative h-6 overflow-hidden rounded border border-(--color-border-light) bg-(--color-background-surface)">
              <div className="flex h-full items-stretch">
                {playlist.map((event, idx) => {
                  const cat = categorize(event.type);
                  const isCurrent = idx === cursor;
                  return (
                    <div
                      key={`${event.sequence}-${idx}`}
                      className={cn(
                        "flex-1 min-w-[2px] transition-opacity",
                        CATEGORY_COLORS[cat],
                        isCurrent ? "opacity-100 ring-1 ring-(--color-info) ring-offset-0" : "opacity-30",
                      )}
                      title={`#${event.sequence} · ${event.type}`}
                      onClick={() => {
                        setPlaying(false);
                        setCursor(idx);
                      }}
                      role="button"
                      tabIndex={0}
                    />
                  );
                })}
              </div>
              {/* 当前位置指示器 */}
              {playlist.length > 0 && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-(--color-info)"
                  style={{
                    left: `${playlist.length > 1 ? (cursor / (playlist.length - 1)) * 100 : 0}%`,
                  }}
                />
              )}
            </div>
          )}

          {/* 当前事件详情 */}
          <div
            className="rounded-md border border-(--color-border-light) bg-(--color-background-surface) p-3"
            data-testid="event-replay-current"
            aria-live="polite"
          >
            {current ? (
              <>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-(--color-text-foreground-secondary)">
                    #{current.sequence}
                  </span>
                  <span className="rounded bg-(--color-info)/10 px-1.5 py-0.5 font-mono text-[11px] text-(--color-info-foreground)">
                    {current.type}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px]",
                      "bg-(--color-background-button-secondary) text-(--color-text-foreground-secondary)",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", CATEGORY_COLORS[categorize(current.type)])} />
                    {CATEGORY_LABELS[categorize(current.type)]}
                  </span>
                  <span className="text-[11px] text-(--color-text-foreground-secondary)">
                    {new Date(current.occurredAt).toLocaleString()}
                  </span>
                  <span className="ms-auto text-[11px] text-(--color-text-foreground-secondary)">
                    {t.position(cursor + 1, playlist.length)}
                  </span>
                </div>
                {/* 人类可读摘要 */}
                <div className="mb-2 rounded bg-(--color-background-elevated-secondary)/50 px-2 py-1.5 text-xs text-(--color-text-foreground)">
                  {formatEventSummary(current)}
                </div>
                <pre
                  className="max-h-48 overflow-auto rounded bg-(--color-background-elevated-secondary) p-2 font-mono text-[11px] leading-relaxed text-(--color-text-foreground)"
                  data-testid="event-replay-current-json"
                >
                  {JSON.stringify(current.payload, null, 2)}
                </pre>
              </>
            ) : (
              <p className="py-6 text-center text-xs text-(--color-text-foreground-secondary)">
                {t.empty}
              </p>
            )}
          </div>

          {/* 播放控制条 */}
          <div
            className="flex flex-col gap-2 rounded-md border border-(--color-border-light) bg-(--color-background-surface) p-3"
            data-testid="event-replay-controls"
          >
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleReset}
                disabled={!canPlay}
                aria-label={t.reset}
                data-testid="event-replay-reset"
              >
                <RotateCcwIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleStepBack}
                disabled={!canPlay || cursor === 0}
                aria-label={t.stepBack}
                data-testid="event-replay-step-back"
              >
                <SkipBackIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={handlePlayPause}
                disabled={!canPlay}
                aria-label={playing ? t.pause : t.play}
                data-testid="event-replay-play"
              >
                {playing ? (
                  <PauseIcon className="size-4" />
                ) : (
                  <PlayIcon className="size-4" />
                )}
                <span>{playing ? t.pause : t.play}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleStepForward}
                disabled={!canPlay || isAtEnd}
                aria-label={t.stepForward}
                data-testid="event-replay-step-forward"
              >
                <SkipForwardIcon className="size-3.5" />
              </Button>
              <div className="ms-auto flex items-center gap-1.5 text-xs">
                <span className="text-(--color-text-foreground-secondary)">{t.speed}</span>
                <select
                  className="rounded border border-(--color-border) bg-background px-1.5 py-0.5 text-xs"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  data-testid="event-replay-speed"
                  aria-label={t.speed}
                >
                  {SPEED_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, playlist.length - 1)}
              step={1}
              value={cursor}
              onChange={handleSeek}
              disabled={!canPlay}
              aria-label={t.scrubberAria}
              data-testid="event-replay-scrubber"
              className="h-2 w-full cursor-pointer accent-(--color-info) disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between text-[11px] text-(--color-text-foreground-secondary)">
              <span>{playlist.length > 0 ? `#${playlist[0]?.sequence}` : "—"}</span>
              <span>{t.hintShortcuts}</span>
              <span>
                {playlist.length > 0 ? `#${playlist[playlist.length - 1]?.sequence}` : "—"}
              </span>
            </div>
          </div>

          {/* 事件列表(高亮当前) */}
          <ScrollArea className="min-h-0 flex-1" scrollFade>
            <ol
              className="flex flex-col gap-1"
              data-testid="event-replay-list"
            >
              {playlist.length === 0 ? (
                <li className="py-12 text-center text-xs text-(--color-text-foreground-secondary)">
                  {t.empty}
                </li>
              ) : null}
              {playlist.map((event, idx) => {
                const isCurrent = idx === cursor;
                return (
                  <ReplayListItem
                    key={`${event.sequence}-${idx}`}
                    event={event}
                    index={idx}
                    isCurrent={isCurrent}
                    onJump={() => {
                      setPlaying(false);
                      setCursor(idx);
                    }}
                  />
                );
              })}
            </ol>
          </ScrollArea>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

interface ReplayListItemProps {
  event: OrchestrationEvent;
  index: number;
  isCurrent: boolean;
  onJump: () => void;
}

function ReplayListItem({ event, isCurrent, onJump }: ReplayListItemProps) {
  const itemRef = useRef<HTMLLIElement | null>(null);
  const cat = categorize(event.type);

  // 当前事件变化时,自动滚动到视图内
  useEffect(() => {
    if (isCurrent && itemRef.current) {
      itemRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isCurrent]);

  return (
    <li
      ref={itemRef}
      data-testid="event-replay-item"
      data-current={isCurrent ? "true" : "false"}
    >
      <button
        type="button"
        onClick={onJump}
        className={cn(
          "flex w-full items-start gap-2 rounded border px-2.5 py-1.5 text-left transition-colors",
          isCurrent
            ? "border-(--color-info) bg-(--color-info)/10"
            : "border-(--color-border-light) bg-(--color-background-surface) hover:border-(--color-border) hover:bg-(--color-background-elevated-secondary)",
        )}
      >
        <span
          className={cn(
            "mt-1 size-1.5 shrink-0 rounded-full",
            isCurrent ? "bg-(--color-info)" : CATEGORY_COLORS[cat],
          )}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-mono text-(--color-text-foreground-secondary)">
              #{event.sequence}
            </span>
            <span className="font-mono text-(--color-text-foreground)">{event.type}</span>
            <span className="text-[9px] text-(--color-text-foreground-secondary)">
              {CATEGORY_LABELS[cat]}
            </span>
            <span className="ms-auto text-(--color-text-foreground-secondary)">
              {new Date(event.occurredAt).toLocaleTimeString()}
            </span>
          </div>
          {/* 事件摘要 */}
          <div className="truncate text-[10px] text-(--color-text-foreground-secondary)">
            {formatEventSummary(event)}
          </div>
        </div>
      </button>
    </li>
  );
}
