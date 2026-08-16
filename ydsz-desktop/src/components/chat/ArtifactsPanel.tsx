/**
 * @file 产物审查面板
 *
 * 本组件提供 AI 执行产物的统一审查界面，包含 5 个 Tab：
 * - Spec：规范文档（Markdown）
 * - Diff：代码差异对比
 * - Preview：HTML/PPT 预览
 * - Terminal：终端输出日志
 * - Files：生成的文件列表
 *
 * ## 核心功能
 *
 * - **多视图切换**：5 种产物类型统一展示
 * - **实时刷新**：监听事件流自动更新
 * - **导出功能**：一键导出所有产物
 * - **差异高亮**：Diff 视图支持语法高亮
 *
 * ## 使用场景
 *
 * - AI 完成任务后的产物审查
 * - 代码变更确认
 * - 文档/原型预览
 *
 * ## 注意事项
 *
 * - 默认显示 Spec Tab
 * - Diff 视图需要 diff 数据
 * - Preview 支持 HTML 和 PPT 格式
 * - 空状态显示友好提示
 */

import { memo, useState, useMemo } from "react";
import { PiFile, PiGitDiff, PiEye, PiTerminal, PiFolder } from "react-icons/pi";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { cn } from "~/lib/utils";
import { toastManager } from "../ui/toast";
import { invoke } from "@tauri-apps/api/core";

/** 产物类型 */
export type ArtifactTab = "spec" | "diff" | "preview" | "terminal" | "files";

/** 产物数据 */
export interface ArtifactsData {
  /** 规范文档（Markdown） */
  spec?: string;
  /** 差异列表 */
  diffs?: Array<{
    path: string;
    before: string;
    after: string;
  }>;
  /** 预览内容（HTML/PPT） */
  preview?: {
    type: "html" | "ppt";
    content: string;
  };
  /** 终端日志 */
  terminal?: string[];
  /** 文件列表 */
  files?: Array<{
    path: string;
    status: "added" | "modified" | "deleted";
  }>;
}

interface ArtifactsPanelProps {
  /** 线程 ID */
  threadId: string;
  /** 产物数据 */
  artifacts: ArtifactsData;
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * Spec Tab 内容
 */
const SpecTab = memo(function SpecTab({ spec }: { spec?: string }) {
  if (!spec) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        暂无规范文档
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="prose prose-sm max-w-none p-4 dark:prose-invert">
        <div dangerouslySetInnerHTML={{ __html: spec }} />
      </div>
    </ScrollArea>
  );
});

/**
 * Diff Tab 内容
 */
const DiffTab = memo(function DiffTab({
  diffs,
}: {
  diffs?: Array<{ path: string; before: string; after: string }>;
}) {
  if (!diffs || diffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        暂无代码差异
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {diffs.map((diff, index) => (
          <div key={index} className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
              <span className="text-sm font-medium">{diff.path}</span>
              <Badge variant="outline" className="text-xs">
                {diff.before === diff.after ? "未变更" : "已修改"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-0 text-xs font-mono">
              <div className="border-r border-border bg-red-500/5 p-3">
                <div className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
                  修改前
                </div>
                <pre className="whitespace-pre-wrap text-foreground/80">{diff.before}</pre>
              </div>
              <div className="bg-green-500/5 p-3">
                <div className="mb-2 text-xs font-medium text-green-600 dark:text-green-400">
                  修改后
                </div>
                <pre className="whitespace-pre-wrap text-foreground/80">{diff.after}</pre>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
});

/**
 * Preview Tab 内容
 */
const PreviewTab = memo(function PreviewTab({
  preview,
}: {
  preview?: { type: "html" | "ppt"; content: string };
}) {
  if (!preview) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        暂无预览内容
      </div>
    );
  }

  if (preview.type === "html") {
    return (
      <div className="h-full w-full">
        <iframe
          srcDoc={preview.content}
          className="h-full w-full border-0"
          sandbox="allow-scripts"
          title="HTML 预览"
        />
      </div>
    );
  }

  // PPT 预览（简化为文本展示）
  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="mb-2 text-sm font-medium">PPT 内容预览</div>
          <pre className="whitespace-pre-wrap text-xs text-foreground/80">
            {preview.content}
          </pre>
        </div>
      </div>
    </ScrollArea>
  );
});

/**
 * Terminal Tab 内容
 */
const TerminalTab = memo(function TerminalTab({ logs }: { logs?: string[] }) {
  if (!logs || logs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        暂无终端日志
      </div>
    );
  }

  // 只显示最近 100 行
  const recentLogs = logs.slice(-100);

  return (
    <ScrollArea className="h-full bg-black/5 dark:bg-black/20">
      <div className="p-4 font-mono text-xs">
        {recentLogs.map((log, index) => (
          <div key={index} className="flex gap-2 py-0.5">
            <span className="select-none text-muted-foreground/50">
              {String(index + 1).padStart(3, "0")}
            </span>
            <span className="flex-1 whitespace-pre-wrap text-foreground/90">{log}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
});

/**
 * Files Tab 内容
 */
const FilesTab = memo(function FilesTab({
  files,
}: {
  files?: Array<{ path: string; status: "added" | "modified" | "deleted" }>;
}) {
  if (!files || files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        暂无文件变更
      </div>
    );
  }

  const statusConfig = {
    added: { label: "新增", className: "bg-green-500/10 text-green-600 border-green-500/20" },
    modified: { label: "修改", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
    deleted: { label: "删除", className: "bg-red-500/10 text-red-600 border-red-500/20" },
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-4">
        {files.map((file, index) => {
          const config = statusConfig[file.status];
          return (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
            >
              <PiFile className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-sm font-mono">{file.path}</span>
              <Badge variant="outline" className={cn("text-xs", config.className)}>
                {config.label}
              </Badge>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
});

/**
 * 产物审查面板
 */
export const ArtifactsPanel = memo(function ArtifactsPanel({
  threadId,
  artifacts,
  isOpen,
  onClose,
}: ArtifactsPanelProps) {
  const [activeTab, setActiveTab] = useState<ArtifactTab>("spec");

  const tabConfig = useMemo(
    () => [
      {
        value: "spec" as const,
        label: "Spec",
        icon: PiFile,
        count: artifacts.spec ? 1 : 0,
      },
      {
        value: "diff" as const,
        label: "Diff",
        icon: PiGitDiff,
        count: artifacts.diffs?.length ?? 0,
      },
      {
        value: "preview" as const,
        label: "Preview",
        icon: PiEye,
        count: artifacts.preview ? 1 : 0,
      },
      {
        value: "terminal" as const,
        label: "Terminal",
        icon: PiTerminal,
        count: artifacts.terminal?.length ?? 0,
      },
      {
        value: "files" as const,
        label: "Files",
        icon: PiFolder,
        count: artifacts.files?.length ?? 0,
      },
    ],
    [artifacts],
  );

  const handleExportAll = async () => {
    try {
      await invoke("artifacts_export_all", {
        threadId,
        artifacts,
      });
      toastManager.add({
        type: "success",
        title: "产物导出成功",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "导出失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="flex h-full w-96 flex-col border-l border-border bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <PiEye className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">产物审查</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportAll}>
            导出全部
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭">
            ×
          </Button>
        </div>
      </div>

      {/* Tab 切换 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ArtifactTab)}>
        <div className="border-b border-border px-4">
          <TabsList className="h-10 w-full justify-start bg-transparent">
            {tabConfig.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1.5 px-3 text-xs"
                >
                  <Icon className="size-3.5" />
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 min-w-[16px] px-1 text-[10px]"
                    >
                      {tab.count}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab 内容 */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="spec" className="h-full m-0">
            <SpecTab spec={artifacts.spec} />
          </TabsContent>
          <TabsContent value="diff" className="h-full m-0">
            <DiffTab diffs={artifacts.diffs} />
          </TabsContent>
          <TabsContent value="preview" className="h-full m-0">
            <PreviewTab preview={artifacts.preview} />
          </TabsContent>
          <TabsContent value="terminal" className="h-full m-0">
            <TerminalTab logs={artifacts.terminal} />
          </TabsContent>
          <TabsContent value="files" className="h-full m-0">
            <FilesTab files={artifacts.files} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
});
