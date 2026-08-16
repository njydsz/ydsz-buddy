/**
 * @file 诊断面板组件
 *
 * 提供实时日志查看、过滤、导出功能：
 * - 实时 tail 日志
 * - 按级别过滤（debug/info/warn/error）
 * - 搜索过滤
 * - 导出 zip（含日志 + 事件快照 + 脱敏设置）
 * - 一键报告问题
 *
 * ## 核心功能
 *
 * - **实时日志**：tail 本地日志文件
 * - **过滤**：按级别/关键词过滤
 * - **导出**：一键打包诊断信息
 * - **报告**：生成 issue 链接
 *
 * ## 使用场景
 *
 * - 设置页 → 诊断 Tab
 * - 用户报障时查看日志
 * - 问题排查
 *
 * ## 注意事项
 *
 * - 默认保留 7 天日志
 * - 自动清理旧日志
 * - 导出时脱敏处理
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { PiDownload, PiBug, PiTrash, PiCopy, PiMagnifyingGlass, PiFolderOpen } from "react-icons/pi";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn } from "~/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { toastManager } from "./ui/toast";

/** 日志级别 */
type LogLevel = "debug" | "info" | "warn" | "error";

/** 日志条目 */
interface LogEntry {
  /** 时间戳 */
  timestamp: string;
  /** 级别 */
  level: LogLevel;
  /** 消息（Rust 侧字段名为 line；保留 message 别名以兼容旧数据） */
  message: string;
  /** 行内容（Rust 侧真实字段） */
  line?: string;
  /** 模块 */
  module?: string;
  /** 堆栈（仅 error） */
  stack?: string;
  /** 目标模块（Rust 侧 target 字段） */
  target?: string;
}

interface DiagnosticsPanelProps {
  /** 自定义类名 */
  className?: string;
}

/** 级别配置 */
const LEVEL_CONFIG: Record<LogLevel, { label: string; className: string }> = {
  debug: { label: "调试", className: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
  info: { label: "信息", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  warn: { label: "警告", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  error: { label: "错误", className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

/**
 * 诊断面板
 */
export const DiagnosticsPanel = memo(function DiagnosticsPanel({
  className,
}: DiagnosticsPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportedPath, setLastExportedPath] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 加载日志
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const entries = await invoke<LogEntry[]>("diagnostics_get_logs");
        setLogs(entries);
      } catch (error) {
        console.error("Failed to load logs:", error);
      }
    };

    void loadLogs();

    // 定时刷新（每 2s）
    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // 过滤日志
  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== "all" && (log.level ?? "").toLowerCase() !== filterLevel) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const text = (log.message ?? log.line ?? "").toLowerCase();
      return (
        text.includes(query) ||
        log.module?.toLowerCase().includes(query) ||
        log.target?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // 清除日志
  const handleClear = useCallback(async () => {
    try {
      await invoke("diagnostics_clear_logs");
      setLogs([]);
      toastManager.add({
        type: "success",
        title: "日志已清除",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "清除失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  }, []);

  // 在系统文件管理器中打开诊断包
  const handleRevealInFolder = useCallback(async (path: string) => {
    try {
      await invoke("diagnostics_reveal_in_folder", { path });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "打开文件夹失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  }, []);

  // 导出诊断信息
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const outputPath = await invoke<string>("diagnostics_export_zip");
      setLastExportedPath(outputPath);
      toastManager.add({
        type: "success",
        title: "导出成功",
        description: `已保存到: ${outputPath}`,
        actionProps: {
          children: "打开文件夹",
          onClick: () => {
            void handleRevealInFolder(outputPath);
          },
        },
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "导出失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setIsExporting(false);
    }
  }, []);

  // 复制日志
  const handleCopy = useCallback(async () => {
    const text = filteredLogs
      .map((log) => `[${log.timestamp}] [${log.level}] ${log.message ?? log.line ?? ""}`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toastManager.add({
        type: "success",
        title: "已复制到剪贴板",
      });
    } catch {
      toastManager.add({
        type: "error",
        title: "复制失败",
      });
    }
  }, [filteredLogs]);

  // 报告问题
  const handleReport = useCallback(async () => {
    try {
      const issueUrl = await invoke<string>("diagnostics_report_issue");
      // 打开浏览器
      window.open(issueUrl, "_blank");
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "生成报告失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  }, []);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* 工具栏 */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Select value={filterLevel} onValueChange={(v) => setFilterLevel(v as LogLevel | "all")}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="级别" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="debug">调试</SelectItem>
            <SelectItem value="info">信息</SelectItem>
            <SelectItem value="warn">警告</SelectItem>
            <SelectItem value="error">错误</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <PiMagnifyingGlass className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索日志..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        <Button variant="outline" size="sm" onClick={handleCopy}>
          <PiCopy className="mr-1 size-3" />
          复制
        </Button>

        <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
          <PiDownload className="mr-1 size-3" />
          {isExporting ? "导出中..." : "导出"}
        </Button>

        {lastExportedPath && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRevealInFolder(lastExportedPath)}
            data-testid="diagnostics-reveal-in-folder"
            title={lastExportedPath}
          >
            <PiFolderOpen className="mr-1 size-3" />
            打开文件夹
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={handleReport}>
          <PiBug className="mr-1 size-3" />
          报告问题
        </Button>

        <Button variant="ghost" size="icon-sm" onClick={handleClear} aria-label="清除日志">
          <PiTrash className="size-4" />
        </Button>
      </div>

      {/* 日志列表 */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="space-y-0.5 p-2 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              暂无日志
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              const levelKey = ((log.level ?? "info") as string).toLowerCase();
              const config = LEVEL_CONFIG[levelKey as LogLevel] ?? LEVEL_CONFIG.info;
              return (
                <div
                  key={index}
                  className={cn(
                    "flex gap-2 rounded px-2 py-1 hover:bg-muted/50",
                    (log.level ?? "").toLowerCase() === "error" && "bg-red-500/5",
                  )}
                >
                  <span className="shrink-0 text-muted-foreground/60">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge variant="outline" className={cn("shrink-0 text-[10px]", config.className)}>
                    {config.label}
                  </Badge>
                  {log.module && (
                    <span className="shrink-0 text-muted-foreground/80">[{log.module}]</span>
                  )}
                  <span className="flex-1 whitespace-pre-wrap break-all">{log.message ?? log.line ?? ""}</span>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* 底部状态 */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span>共 {filteredLogs.length} 条日志</span>
        <span>自动刷新: 2s</span>
      </div>
    </div>
  );
});
