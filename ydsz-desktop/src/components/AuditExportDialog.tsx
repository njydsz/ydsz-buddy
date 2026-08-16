/**
 * @file 审计导出对话框
 *
 * 选择时间范围、事件分类与导出格式，将线程/全局事件流导出为 JSON / Markdown / CSV 文件。
 *
 * ## 数据来源
 *
 * 优先调用后端 `audit_export` Tauri 命令进行导出（从 EventStore 直接读取，权威数据源）。
 * 后端支持 JSON / Markdown / CSV 三种格式，通过 `invoke("audit_export", ...)` 调用。
 *
 * 当后端命令不可用（Web 环境或 Tauri 未注入）时，回退到前端本地格式化：
 * 使用 EventTimeline 预加载的事件数据，在浏览器端格式化后通过 Blob 下载。
 *
 * ## 产品化增强 (P2-1)
 *
 * - 事件分类过滤(项目/线程/消息/Turn/活动/检查点/定时任务)
 * - 导出预览统计(按分类计数)
 * - 复制到剪贴板(免文件下载)
 * - 包含 Payload 开关(JSON 格式)
 * - 增强的 Markdown / CSV 格式(含分类列)
 *
 * ## 使用场景
 *
 * - EventTimeline 工具栏中的"导出审计"按钮
 * - 设置面板或全局工具栏触发
 */

import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { type OrchestrationEvent, type ThreadId } from "~/contracts";
import { readNativeApi } from "~/nativeApi";
import { cn } from "~/lib/utils";
import { CopyIcon, DownloadIcon, Loader2Icon } from "~/lib/icons";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { toastManager } from "./ui/toast";

type ExportFormat = "json" | "markdown" | "csv";
type TimeRange = "1h" | "24h" | "7d" | "all";

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

const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: TimeRange; label: string }> = [
  { value: "1h", label: "最近 1 小时" },
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "all", label: "全部" },
];

const FORMAT_OPTIONS: ReadonlyArray<{ value: ExportFormat; label: string; extension: string }> = [
  { value: "json", label: "JSON", extension: "json" },
  { value: "markdown", label: "Markdown", extension: "md" },
  { value: "csv", label: "CSV", extension: "csv" },
];

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

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as EventCategory[];

/** 后端 audit_export 命令返回结果 */
interface AuditExportResult {
  count: number;
  outputPath: string;
  exportedAt: string;
}

interface AuditExportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** 限定线程级导出；不传则导出全局事件 */
  readonly threadId?: ThreadId;
  /** 调用方已加载的事件（避免重复请求）；若未提供则内部拉取 */
  readonly events?: readonly OrchestrationEvent[];
}

/** 事件类型 -> 分类映射(与 EventTimeline.categorize 保持一致) */
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

function rangeToTimestamp(range: TimeRange): string | null {
  if (range === "all") return null;
  const now = Date.now();
  const delta =
    range === "1h" ? 60 * 60_000 : range === "24h" ? 24 * 60 * 60_000 : 7 * 24 * 60 * 60_000;
  return new Date(now - delta).toISOString();
}

function summarizeEventForMarkdown(event: OrchestrationEvent): string {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "thread.message-sent":
      return String(payload.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    case "thread.turn-diff-completed":
      return `turnId=${payload.turnId ?? ""} status=${payload.status ?? ""}`;
    case "thread.checkpoint-revert-requested":
    case "thread.reverted":
      return `turnCount=${payload.turnCount ?? ""}`;
    case "thread.activity-appended": {
      const activity = payload.activity as { label?: string; kind?: string; status?: string } | null;
      if (!activity) return "";
      return [activity.kind, activity.label, activity.status ? `[${activity.status}]` : ""].filter(Boolean).join(" ");
    }
    default:
      return "";
  }
}

/** CSV 行转义：双引号包裹，内部双引号转义为两个双引号 */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(events: readonly OrchestrationEvent[]): string {
  const header = ["sequence", "occurredAt", "type", "category", "aggregateId", "summary"];
  const rows: string[] = [header.join(",")];
  for (const event of events) {
    const summary = summarizeEventForMarkdown(event).replace(/\n/g, " ");
    const category = categorize(event.type);
    rows.push([
      String(event.sequence),
      csvEscape(event.occurredAt),
      csvEscape(event.type),
      csvEscape(category),
      csvEscape(event.aggregateId),
      csvEscape(summary),
    ].join(","));
  }
  return rows.join("\n");
}

function buildMarkdown(
  events: readonly OrchestrationEvent[],
  threadId: ThreadId | undefined,
): string {
  const lines: string[] = [];
  const header = threadId ? `线程审计导出 · ${threadId}` : "全局审计导出";
  lines.push(`# ${header}`);
  lines.push("");
  lines.push(`- 生成时间：${new Date().toISOString()}`);
  lines.push(`- 事件数量：${events.length}`);

  // 按分类统计
  const categoryCounts: Record<string, number> = {};
  for (const event of events) {
    const cat = categorize(event.type);
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }
  if (Object.keys(categoryCounts).length > 0) {
    lines.push("");
    lines.push("## 分类统计");
    for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${CATEGORY_LABELS[cat as EventCategory] ?? cat}: ${count}`);
    }
  }

  lines.push("");
  lines.push("| 序号 | 时间 | 类型 | 分类 | 摘要 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const event of events) {
    const summary = summarizeEventForMarkdown(event).replace(/\|/g, "\\|");
    const category = categorize(event.type);
    lines.push(
      `| ${event.sequence} | ${event.occurredAt} | \`${event.type}\` | ${CATEGORY_LABELS[category]} | ${summary} |`,
    );
  }
  return lines.join("\n");
}

/** 在前端本地格式化事件为指定格式 */
function formatEventsLocally(
  events: readonly OrchestrationEvent[],
  format: ExportFormat,
  threadId: ThreadId | undefined,
  includePayload: boolean,
): string {
  if (format === "json") {
    if (includePayload) {
      return JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          threadId: threadId ?? null,
          count: events.length,
          events,
        },
        null,
        2,
      );
    }
    // 不含 payload 的精简 JSON
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        threadId: threadId ?? null,
        count: events.length,
        events: events.map((e) => ({
          sequence: e.sequence,
          occurredAt: e.occurredAt,
          type: e.type,
          aggregateId: e.aggregateId,
          category: categorize(e.type),
          summary: summarizeEventForMarkdown(e),
        })),
      },
      null,
      2,
    );
  }
  if (format === "markdown") {
    return buildMarkdown(events, threadId);
  }
  return buildCsv(events);
}

/** 检测当前是否在 Tauri 环境中（可调用后端命令） */
function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function AuditExportDialog({
  open,
  onOpenChange,
  threadId,
  events: preloadedEvents,
}: AuditExportDialogProps) {
  const [range, setRange] = useState<TimeRange>("24h");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [enabledCategories, setEnabledCategories] = useState<Set<EventCategory>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [includePayload, setIncludePayload] = useState(true);

  /** 按时间范围 + 分类过滤后的事件 */
  const filteredEvents = useMemo(() => {
    const source = preloadedEvents ?? [];
    const from = rangeToTimestamp(range);
    const fromMs = from ? new Date(from).getTime() : 0;
    return source.filter((event) => {
      if (from && new Date(event.occurredAt).getTime() < fromMs) return false;
      const cat = categorize(event.type);
      if (!enabledCategories.has(cat)) return false;
      return true;
    });
  }, [preloadedEvents, range, enabledCategories]);

  /** 按分类统计事件数量 */
  const categoryBreakdown = useMemo(() => {
    const source = preloadedEvents ?? [];
    const from = rangeToTimestamp(range);
    const fromMs = from ? new Date(from).getTime() : 0;
    const counts: Record<EventCategory, number> = {
      project: 0,
      thread: 0,
      message: 0,
      turn: 0,
      activity: 0,
      checkpoint: 0,
      scheduled: 0,
      other: 0,
    };
    for (const event of source) {
      if (from && new Date(event.occurredAt).getTime() < fromMs) continue;
      counts[categorize(event.type)]++;
    }
    return counts;
  }, [preloadedEvents, range]);

  const handleToggleCategory = useCallback((cat: EventCategory) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const handleSelectAllCategories = useCallback(() => {
    setEnabledCategories(new Set(ALL_CATEGORIES));
  }, []);

  const handleDeselectAllCategories = useCallback(() => {
    setEnabledCategories(new Set());
  }, []);

  const handleExport = useCallback(async () => {
    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "导出失败",
        description: "Native API 不可用",
      });
      return;
    }

    setIsExporting(true);
    try {
      const baseFilename = threadId
        ? `audit-${threadId}-${Date.now()}`
        : `audit-global-${Date.now()}`;

      const extension = format === "json" ? "json" : format === "markdown" ? "md" : "csv";
      const filename = `${baseFilename}.${extension}`;

      // 优先尝试后端 audit_export 命令（Tauri 环境）
      if (isTauriEnvironment()) {
        try {
          const filePath = await saveDialog({
            defaultPath: filename,
            filters: [
              {
                name: format === "json" ? "JSON" : format === "markdown" ? "Markdown" : "CSV",
                extensions: [extension],
              },
            ],
          });

          if (filePath) {
            const fromTs = rangeToTimestamp(range);
            const result = await invoke<AuditExportResult>("audit_export", {
              params: {
                threadId: threadId ?? null,
                from: fromTs,
                to: null,
                format,
                outputPath: filePath,
              },
            });

            toastManager.add({
              type: "success",
              title: "审计导出完成",
              description: `已导出 ${result.count} 条事件到 ${result.outputPath}`,
            });
            onOpenChange(false);
            return;
          }
          // 用户取消了保存对话框
          return;
        } catch {
          // 后端命令失败，回退到前端本地格式化
          // 继续走下面的本地格式化路径
        }
      }

      // 回退路径：前端本地格式化 + save_file / Blob 下载
      const sourceEvents = filteredEvents;
      const content = formatEventsLocally(sourceEvents, format, threadId, includePayload);

      if (api.dialogs.saveFile) {
        const filePath = await api.dialogs.saveFile({
          defaultFilename: filename,
          contents: content,
          filters: [
            {
              name: format === "json" ? "JSON" : format === "markdown" ? "Markdown" : "CSV",
              extensions: [extension],
            },
          ],
        });

        if (filePath) {
          toastManager.add({
            type: "success",
            title: "审计导出完成",
            description: `已导出 ${sourceEvents.length} 条事件到 ${filePath}`,
          });
          onOpenChange(false);
        }
      } else {
        // Web 环境回退：使用 Blob 下载
        const blob = new Blob([content], {
          type: format === "json" ? "application/json" : format === "markdown" ? "text/markdown" : "text/csv",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        toastManager.add({
          type: "success",
          title: "审计导出已下载",
          description: filename,
        });
        onOpenChange(false);
      }
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "导出失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setIsExporting(false);
    }
  }, [filteredEvents, format, onOpenChange, threadId, range, includePayload]);

  /** 复制到剪贴板 */
  const handleCopyToClipboard = useCallback(async () => {
    setIsCopying(true);
    try {
      const content = formatEventsLocally(filteredEvents, format, threadId, includePayload);
      await navigator.clipboard.writeText(content);
      toastManager.add({
        type: "success",
        title: "已复制到剪贴板",
        description: `${filteredEvents.length} 条事件 · ${format.toUpperCase()}`,
      });
      onOpenChange(false);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "复制失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setIsCopying(false);
    }
  }, [filteredEvents, format, threadId, includePayload, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md gap-0 p-0">
        <DialogHeader className="gap-1 p-4 pr-12">
          <DialogTitle className="text-base">导出审计日志</DialogTitle>
          <DialogDescription className="text-xs">
            选择时间范围、事件分类与格式，导出{threadId ? "当前线程" : "全局"}事件流。
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="flex flex-col gap-4 px-4 py-3">
          {/* 时间范围 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-(--color-text-foreground-secondary)">
              时间范围
            </label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {TIME_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
                    range === option.value
                      ? "border-transparent bg-(--color-background-button-secondary) text-(--color-text-foreground)"
                      : "border-(--color-border) text-(--color-text-foreground-secondary) hover:bg-(--color-background-button-secondary-hover)",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 事件分类过滤 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-(--color-text-foreground-secondary)">
                事件分类
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllCategories}
                  className="text-[10px] text-(--color-text-foreground-secondary) hover:text-(--color-text-foreground)"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllCategories}
                  className="text-[10px] text-(--color-text-foreground-secondary) hover:text-(--color-text-foreground)"
                >
                  清空
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CATEGORIES.map((cat) => {
                const count = categoryBreakdown[cat] ?? 0;
                const isEnabled = enabledCategories.has(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleToggleCategory(cat)}
                    disabled={count === 0}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                      isEnabled && count > 0
                        ? "border-transparent bg-(--color-background-button-secondary) text-(--color-text-foreground)"
                        : count === 0
                          ? "border-(--color-border)/40 text-(--color-text-foreground-secondary)/40 cursor-not-allowed"
                          : "border-(--color-border) text-(--color-text-foreground-secondary) hover:bg-(--color-background-button-secondary-hover)",
                    )}
                  >
                    {CATEGORY_LABELS[cat]} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* 导出格式 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-(--color-text-foreground-secondary)">
              导出格式
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormat(option.value)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
                    format === option.value
                      ? "border-transparent bg-(--color-background-button-secondary) text-(--color-text-foreground)"
                      : "border-(--color-border) text-(--color-text-foreground-secondary) hover:bg-(--color-background-button-secondary-hover)",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* JSON 格式额外选项 */}
          {format === "json" && (
            <label className="flex items-center gap-2 text-[11px] text-(--color-text-foreground-secondary)">
              <input
                type="checkbox"
                checked={includePayload}
                onChange={(e) => setIncludePayload(e.target.checked)}
                className="size-3 accent-(--color-primary)"
              />
              包含完整 Payload (取消则仅导出元数据摘要)
            </label>
          )}

          {/* 导出预览统计 */}
          <div className="space-y-1 rounded-md border border-(--color-border-light) bg-(--color-background-elevated-secondary) px-2.5 py-2">
            <div className="text-[11px] text-(--color-text-foreground-secondary)">
              预计导出 <span className="font-medium text-(--color-text-foreground)">{filteredEvents.length}</span> 条事件
            </div>
            {filteredEvents.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-(--color-text-foreground-secondary)/70">
                {ALL_CATEGORIES.filter((cat) => {
                  const count = filteredEvents.filter((e) => categorize(e.type) === cat).length;
                  return count > 0;
                }).map((cat) => {
                  const count = filteredEvents.filter((e) => categorize(e.type) === cat).length;
                  return (
                    <span key={cat}>
                      {CATEGORY_LABELS[cat]}: {count}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </DialogPanel>

        <DialogFooter className="flex items-center justify-between px-4 py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyToClipboard}
            disabled={isCopying || isExporting || filteredEvents.length === 0}
            className="gap-1.5"
          >
            {isCopying ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
            <span>复制</span>
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isExporting || isCopying}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={isExporting || filteredEvents.length === 0}
            >
              {isExporting ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <DownloadIcon className="size-3.5" />
              )}
              <span>导出</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
