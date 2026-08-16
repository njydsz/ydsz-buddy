/**
 * @file Codebase/AST-Grep 搜索结果卡片
 *
 * 当 Composer 中通过 `@codebase` 或 `@ast-grep` 搜索代码时，
 * 选中结果后在本卡片中展示结构化的搜索结果预览：
 *
 * - **代码片段预览**：高亮显示命中的代码行
 * - **文件位置**：文件路径 + 行号 + 列号
 * - **节点类型/符号类型**：显示 AST 节点 kind 或 symbol kind
 * - **捕获变量**：AST-Grep S-expression 捕获的 `@name → text` 映射
 * - **批量操作**：全部插入到 Composer / 复制到剪贴板
 *
 * ## 设计原则
 *
 * - 轻量内联 — 作为 Composer 上方的附加卡片渲染，不抢占编辑器空间
 * - 渐进展示 — 默认折叠只显示摘要，点击展开查看完整代码
 * - 双源兼容 — 同时支持 `@codebase`（符号/文本搜索）和 `@ast-grep`（结构搜索）
 *
 * ## 核心导出
 *
 * - `CodebaseSearchCard`：搜索结果卡片组件
 * - `CodebaseSearchResult`：统一化的搜索结果类型
 */

import { memo, useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Copy,
  Check,
  Plus,
  Search,
  Code2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "~/lib/utils";

// ==================== Types ====================

/** 搜索结果来源 */
export type CodebaseSearchSource = "codebase" | "ast-grep";

/** 统一化的搜索结果条目 */
export interface CodebaseSearchResult {
  /** 唯一 ID */
  id: string;
  /** 来源类型 */
  source: CodebaseSearchSource;
  /** 文件路径 */
  file: string;
  /** 行号（1-based） */
  line: number;
  /** 列号（1-based） */
  column?: number;
  /** 节点/符号类型（如 "function"、"call_expression"、"try_statement"） */
  kind: string;
  /** 命中的代码文本 */
  text: string;
  /** 上下文（前后几行代码） */
  context?: string;
  /** AST-Grep 捕获变量（仅 ast-grep 来源） */
  captures?: Array<{ name: string; text: string }>;
  /** 原始查询 */
  query?: string;
}

interface CodebaseSearchCardProps {
  /** 搜索结果列表 */
  results: CodebaseSearchResult[];
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 错误信息 */
  error?: string | null;
  /** 搜索查询 */
  query?: string;
  /** 来源类型 */
  source?: CodebaseSearchSource;
  /** 将结果插入 Composer 回调 */
  onInsertToComposer?: (result: CodebaseSearchResult) => void;
  /** 全部插入回调 */
  onInsertAll?: (results: CodebaseSearchResult[]) => void;
  /** 关闭卡片回调 */
  onClose?: () => void;
  /** 自定义类名 */
  className?: string;
}

// ==================== Helpers ====================

/** 从文件路径提取文件名 */
function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

/** 从文件路径提取语言（用于语法高亮提示） */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    rs: "rust",
    py: "python",
    go: "go",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
  };
  return langMap[ext] ?? "text";
}

/** 复制文本到剪贴板 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ==================== Result Item ====================

interface ResultItemProps {
  result: CodebaseSearchResult;
  onInsert: (result: CodebaseSearchResult) => void;
}

const ResultItem = memo(function ResultItem({ result, onInsert }: ResultItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lang = detectLanguage(result.file);
  const hasContext = result.context && result.context.trim().length > 0;
  const hasCaptures = result.captures && result.captures.length > 0;

  const handleCopy = useCallback(async () => {
    const text = hasContext ? result.context! : result.text;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }, [result.text, result.context]);

  return (
    <div
      className="rounded-lg border border-border/60 bg-card/40 overflow-hidden transition-colors hover:border-border"
      data-testid="codebase-search-result-item"
      data-source={result.source}
      data-file={result.file}
      data-line={result.line}
    >
      {/* 头部：文件 + 位置 + 类型 */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/60 hover:text-foreground"
          aria-label={expanded ? "折叠" : "展开"}
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <FileCode2 className="size-3.5 shrink-0 text-primary/70" />
        <span className="truncate font-mono text-[11px] text-foreground/80" title={result.file}>
          {fileName(result.file)}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/60">
          :{result.line}
          {result.column ? `:${result.column}` : ""}
        </span>
        <Badge variant="outline" className="ml-auto shrink-0 text-[9px] px-1.5 py-0">
          {result.kind}
        </Badge>
        {result.source === "ast-grep" && (
          <Badge variant="secondary" className="shrink-0 text-[9px] px-1.5 py-0">
            AST
          </Badge>
        )}
      </div>

      {/* 代码片段（始终显示一行摘要） */}
      <div className="px-3 py-2">
        <pre
          className={cn(
            "overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground/85",
            !expanded && "max-h-[2.4em] overflow-hidden",
          )}
        >
          <code data-language={lang}>
            {expanded && hasContext ? result.context : result.text}
          </code>
        </pre>

        {/* 展开后显示捕获变量 */}
        {expanded && hasCaptures && (
          <div className="mt-2 space-y-1 rounded-md border border-border/40 bg-muted/30 p-2">
            <p className="text-[10px] font-medium text-muted-foreground">
              捕获变量 ({result.captures!.length})
            </p>
            {result.captures!.map((cap, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <code className="shrink-0 text-primary">@{cap.name}</code>
                <span className="text-muted-foreground/60">→</span>
                <code className="min-w-0 truncate font-mono text-foreground/70" title={cap.text}>
                  {cap.text}
                </code>
              </div>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="size-3 text-green-500" />
                已复制
              </>
            ) : (
              <>
                <Copy className="size-3" />
                复制
              </>
            )}
          </Button>
          {onInsert && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={() => onInsert(result)}
            >
              <Plus className="size-3" />
              插入
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

// ==================== Main Component ====================

export const CodebaseSearchCard = memo(function CodebaseSearchCard({
  results,
  isLoading = false,
  error = null,
  query = "",
  source = "codebase",
  onInsertToComposer,
  onInsertAll,
  onClose,
  className,
}: CodebaseSearchCardProps) {
  const totalCount = results.length;
  const sourceLabel = source === "ast-grep" ? "AST-Grep" : "Codebase";
  const sourceIcon = source === "ast-grep" ? Code2 : Search;

  const handleInsertAll = useCallback(() => {
    if (onInsertAll) {
      onInsertAll(results);
    } else if (onInsertToComposer) {
      results.forEach((r) => onInsertToComposer(r));
    }
  }, [results, onInsertAll, onInsertToComposer]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border/60 bg-background/80 backdrop-blur-sm",
        className,
      )}
      data-testid="codebase-search-card"
      data-source={source}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
        {(() => {
          const Icon = sourceIcon;
          return <Icon className="size-4 text-primary/70" />;
        })()}
        <span className="text-[12px] font-medium text-foreground/80">
          {sourceLabel} 搜索结果
        </span>
        {query && (
          <span className="truncate text-[11px] text-muted-foreground/60" title={query}>
            「{query}」
          </span>
        )}
        {totalCount > 0 && (
          <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
            {totalCount} 条
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          {totalCount > 0 && (onInsertAll || onInsertToComposer) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={handleInsertAll}
            >
              <Plus className="size-3" />
              全部插入
            </Button>
          )}
          {onClose && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-6 p-0"
              onClick={onClose}
              aria-label="关闭"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <ScrollArea className="max-h-[320px]">
        <div className="space-y-2 p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              <span className="text-[12px]">搜索中...</span>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="text-[12px] font-medium text-destructive">搜索失败</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              {(() => {
                const Icon = sourceIcon;
                return <Icon className="mb-2 size-6 opacity-50" />;
              })()}
              <p className="text-[12px]">暂无搜索结果</p>
              {query && (
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  尝试更换关键词或模式
                </p>
              )}
            </div>
          ) : (
            results.map((result) => (
              <ResultItem
                key={result.id}
                result={result}
                onInsert={(result) => onInsertToComposer?.(result)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
