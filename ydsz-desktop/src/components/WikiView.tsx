/**
 * @file Wiki 查看界面 (2.0)
 * @description 展示项目 Wiki 文档,支持搜索、模块浏览、按需按模块名查看。
 *   数据来自 Tauri 后端 `repo_wiki_*` 命令(读 `.ydsz/wiki/*.md`)。
 *
 * ## 2.0 新增功能
 *
 * - **文档大纲 (TOC)**：右侧侧边栏展示当前模块的标题层级导航
 * - **统计面板**：模块数、符号数、每模块符号分布、最近更新
 * - **全量导出**：一键将所有模块导出为单个 Markdown 文档
 * - **依赖图视图**：展示模块间依赖关系
 * - **增量生成**：基于文件 mtime 的增量更新按钮
 *
 * ## 核心导出
 *
 * - `WikiView`:主组件,接收 `workspaceRoot` 显式指定根目录
 * - `useActiveWikiRoot`:在没有显式根目录时,回退到当前工作区 home 目录
 */

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  FileText,
  FolderOpen,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check as CheckIcon2,
  Clock,
  Hash,
  Sparkles,
  Download,
  BarChart3,
  ListTree,
  Zap,
  ArrowRight,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import ChatMarkdown from "./ChatMarkdown";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { useWorkspaceStore } from "../workspaceStore";
import { toastManager } from "./ui/toast";
import { monitor } from "../lib/monitor";

/** Wiki 条目,后端 `WikiEntryDto` 的前端形态 */
export interface WikiEntry {
  module: string;
  title: string;
  content: string;
  symbols: string[];
  updated_at: string;
}

/** 后端搜索/列表的响应壳 */
interface WikiListResponse {
  count: number;
  entries: WikiEntry[];
}

/** 后端生成 Wiki 的响应壳 */
interface WikiGenerateResponse {
  module_count: number;
  wiki_dir: string;
  generated_at: string;
}

/** Wiki 元数据(目录路径 + 最后生成时间) */
interface WikiMetaResponse {
  wiki_dir: string;
  last_generated_at: string | null;
  module_count: number;
}

/** 统计信息 */
interface WikiStatsResponse {
  module_count: number;
  total_symbols: number;
  symbols_per_module: [string, number][];
  recently_updated: [string, string][];
}

/** 文档大纲节点 */
interface OutlineNode {
  level: number;
  text: string;
  anchor: string;
}

/** 依赖图 */
interface DependencyGraphResponse {
  edges: [string, string[]][];
}

interface WikiViewProps {
  /** 显式指定项目根目录(可选),覆盖工作区 homeDir */
  workspaceRoot?: string | null;
}

/** 当前工作区根目录 hook:从 store 读取 homeDir */
function useActiveWikiRoot(override?: string | null): string | null {
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  return useMemo(() => {
    if (override && override.trim().length > 0) return override;
    if (homeDir && homeDir.trim().length > 0) return homeDir;
    return null;
  }, [override, homeDir]);
}

/** 复制文本到剪贴板（带降级） */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 降级到 document.execCommand
    }
  }
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

/** 格式化相对时间 */
function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "从未";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "未知";
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return "刚刚";
  if (diffMs < 3600_000) return `${Math.round(diffMs / 60_000)} 分钟前`;
  if (diffMs < 86_400_000) return `${Math.round(diffMs / 3600_000)} 小时前`;
  if (diffMs < 7 * 86_400_000) return `${Math.round(diffMs / 86_400_000)} 天前`;
  return new Date(iso).toLocaleDateString();
}

/** 视图模式 */
type ViewMode = "wiki" | "stats" | "deps";

export function WikiView({ workspaceRoot }: WikiViewProps = {}) {
  const root = useActiveWikiRoot(workspaceRoot);
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("wiki");

  // 拉取 Wiki 列表
  const {
    data: wikiList,
    isLoading: isLoadingList,
    isError: isListError,
    error: listError,
  } = useQuery({
    queryKey: ["wiki", "list", root],
    queryFn: async () => {
      if (!root) return { count: 0, entries: [] } satisfies WikiListResponse;
      const result = await invoke<WikiListResponse>("repo_wiki_list", {
        params: { root },
      });
      return result;
    },
    enabled: !!root,
  });

  // 搜索 Wiki
  const { data: searchResults } = useQuery({
    queryKey: ["wiki", "search", root, searchQuery],
    queryFn: async () => {
      if (!root || !searchQuery.trim()) {
        return { count: 0, entries: [] } satisfies WikiListResponse;
      }
      const result = await invoke<WikiListResponse>("repo_wiki_search", {
        params: { root, query: searchQuery },
      });
      return result;
    },
    enabled: !!root && searchQuery.trim().length > 0,
  });

  // 按模块名获取详细内容
  const { data: selectedWiki, isLoading: isLoadingContent } = useQuery({
    queryKey: ["wiki", "get", root, selectedModule],
    queryFn: async () => {
      if (!root || !selectedModule) return null;
      const result = await invoke<WikiEntry | null>("repo_wiki_get", {
        params: { root, module: selectedModule },
      });
      return result;
    },
    enabled: !!root && !!selectedModule,
  });

  // 获取文档大纲 (TOC)
  const { data: outline } = useQuery({
    queryKey: ["wiki", "outline", root, selectedModule],
    queryFn: async () => {
      if (!root || !selectedModule) return [] as OutlineNode[];
      const result = await invoke<OutlineNode[]>("repo_wiki_outline", {
        params: { root, module: selectedModule },
      });
      return result;
    },
    enabled: !!root && !!selectedModule && viewMode === "wiki",
  });

  // Wiki 元数据(目录路径 + 最后生成时间)
  const { data: wikiMeta } = useQuery({
    queryKey: ["wiki", "meta", root],
    queryFn: async () => {
      if (!root) {
        return { wiki_dir: "", last_generated_at: null, module_count: 0 } satisfies WikiMetaResponse;
      }
      try {
        const result = await invoke<WikiMetaResponse | null>("repo_wiki_status", {
          params: { root },
        });
        return (
          result ?? {
            wiki_dir: `${root}/.ydsz/wiki`,
            last_generated_at: null,
            module_count: 0,
          }
        );
      } catch (error) {
        monitor.captureError({
          type: "wiki.status",
          message: "failed to load wiki status",
          stack: error instanceof Error ? error.stack : undefined,
          context: { root },
          level: "info",
        });
        return {
          wiki_dir: `${root}/.ydsz/wiki`,
          last_generated_at: null,
          module_count: 0,
        } satisfies WikiMetaResponse;
      }
    },
    enabled: !!root,
  });

  // 统计信息
  const { data: wikiStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["wiki", "stats", root],
    queryFn: async () => {
      if (!root) return null;
      return invoke<WikiStatsResponse>("repo_wiki_stats", { params: { root } });
    },
    enabled: !!root && viewMode === "stats",
  });

  // 依赖图
  const { data: depGraph, isLoading: isLoadingDeps } = useQuery({
    queryKey: ["wiki", "deps", root],
    queryFn: async () => {
      if (!root) return { edges: [] } as DependencyGraphResponse;
      return invoke<DependencyGraphResponse>("repo_wiki_dependencies", {
        params: { root },
      });
    },
    enabled: !!root && viewMode === "deps",
  });

  // 生成 Wiki 触发器（全量）
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!root) throw new Error("缺少工作区根目录");
      return invoke<WikiGenerateResponse>("repo_wiki_generate", {
        params: { root },
      });
    },
    onSuccess: (data) => {
      toastManager.add({
        type: "success",
        title: `已生成 ${data.module_count} 个模块的 Wiki`,
        description: data.wiki_dir,
        timeout: 4000,
      });
      void queryClient.invalidateQueries({ queryKey: ["wiki"] });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "生成 Wiki 失败",
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // 增量生成
  const incrementalMutation = useMutation({
    mutationFn: async () => {
      if (!root) throw new Error("缺少工作区根目录");
      return invoke<WikiGenerateResponse>("repo_wiki_generate_incremental", {
        params: { root },
      });
    },
    onSuccess: (data) => {
      const msg =
        data.module_count === 0
          ? "文件无变化，跳过生成"
          : `增量生成 ${data.module_count} 个模块`;
      toastManager.add({
        type: data.module_count === 0 ? "info" : "success",
        title: msg,
        timeout: 3000,
      });
      void queryClient.invalidateQueries({ queryKey: ["wiki"] });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "增量生成失败",
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // 导出全量 Wiki
  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!root) throw new Error("缺少工作区根目录");
      return invoke<string>("repo_wiki_export", { params: { root } });
    },
    onSuccess: async (data) => {
      const ok = await copyToClipboard(data);
      if (ok) {
        toastManager.add({
          type: "success",
          title: "已导出到剪贴板",
          description: `${data.length} 字符`,
          timeout: 3000,
        });
      }
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "导出失败",
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // 全量 symbol 聚合（用于顶部 symbol filter）
  const allSymbols = useMemo(() => {
    const symbolSet = new Map<string, number>();
    for (const entry of wikiList?.entries ?? []) {
      for (const sym of entry.symbols) {
        symbolSet.set(sym, (symbolSet.get(sym) ?? 0) + 1);
      }
    }
    return Array.from(symbolSet.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([sym]) => sym);
  }, [wikiList]);

  // 应用 symbol 过滤
  const filteredList = useMemo(() => {
    const list = (searchQuery.trim() ? searchResults : wikiList)?.entries ?? [];
    if (!activeSymbol) return list;
    return list.filter((e) => e.symbols.includes(activeSymbol));
  }, [searchResults, wikiList, searchQuery, activeSymbol]);

  const displayList = filteredList;
  const hasAnyEntry = displayList.length > 0;

  const refreshList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["wiki"] });
  }, [queryClient]);

  // 复制 Markdown 源文件
  const handleCopyMarkdown = useCallback(async () => {
    if (!selectedWiki) return;
    const ok = await copyToClipboard(selectedWiki.content);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      toastManager.add({
        type: "success",
        title: "已复制到剪贴板",
        description: `${selectedWiki.module}.md (${selectedWiki.content.length} 字符)`,
        timeout: 2000,
      });
    } else {
      toastManager.add({
        type: "error",
        title: "复制失败",
        description: "请检查浏览器剪贴板权限",
      });
    }
  }, [selectedWiki]);

  // 在 Markdown 中点击 symbol 跳转到对应模块
  const handleSymbolClick = useCallback(
    (symbol: string) => {
      const target = (wikiList?.entries ?? []).find((e) =>
        e.symbols.includes(symbol),
      );
      if (target) {
        setSelectedModule(target.module);
        setSearchQuery("");
      }
    },
    [wikiList],
  );

  // 缺根目录:提示用户先打开工作区
  if (!root) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        <div className="max-w-sm space-y-3">
          <FolderOpen className="mx-auto h-10 w-10 opacity-50" />
          <p>
            Wiki 需要项目根目录。请先打开一个工作区,或在调用处显式传入 <code>workspaceRoot</code>。
          </p>
        </div>
      </div>
    );
  }

  // 反向依赖映射：谁依赖了模块 X
  const reverseDeps = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!depGraph) return map;
    for (const [module, deps] of depGraph.edges) {
      for (const dep of deps) {
        if (!map.has(dep)) map.set(dep, []);
        map.get(dep)!.push(module);
      }
    }
    return map;
  }, [depGraph]);

  return (
    <div className="flex h-full" data-testid="wiki-view">
      {/* 左侧:模块列表 + 视图切换 */}
      <div className="flex w-80 flex-col border-r bg-muted/30">
        {/* 视图切换 Tabs */}
        <div className="flex items-center gap-1 border-b p-2">
          <Button
            size="sm"
            variant={viewMode === "wiki" ? "secondary" : "ghost"}
            onClick={() => setViewMode("wiki")}
            className="flex-1"
            title="Wiki 浏览"
          >
            <FileText className="mr-1.5 size-3.5" />
            Wiki
          </Button>
          <Button
            size="sm"
            variant={viewMode === "stats" ? "secondary" : "ghost"}
            onClick={() => setViewMode("stats")}
            className="flex-1"
            title="统计信息"
          >
            <BarChart3 className="mr-1.5 size-3.5" />
            统计
          </Button>
          <Button
            size="sm"
            variant={viewMode === "deps" ? "secondary" : "ghost"}
            onClick={() => setViewMode("deps")}
            className="flex-1"
            title="依赖图"
          >
            <ListTree className="mr-1.5 size-3.5" />
            依赖
          </Button>
        </div>

        {viewMode === "wiki" && (
          <>
            <div className="space-y-2 border-b p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索 Wiki..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  aria-label="搜索 Wiki 条目"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => incrementalMutation.mutate()}
                  disabled={incrementalMutation.isPending}
                  className="flex-1"
                  title="增量生成（仅更新变化的文件）"
                >
                  <Zap
                    className={`mr-1.5 size-3.5 ${incrementalMutation.isPending ? "animate-pulse" : ""}`}
                  />
                  {incrementalMutation.isPending ? "更新中..." : "增量更新"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  title="全量重新生成"
                >
                  <RefreshCw
                    className={`size-3.5 ${generateMutation.isPending ? "animate-spin" : ""}`}
                  />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                  title="导出全量 Wiki 到剪贴板"
                >
                  <Download
                    className={`size-3.5 ${exportMutation.isPending ? "animate-pulse" : ""}`}
                  />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={refreshList}
                  aria-label="刷新 Wiki 列表"
                  title="刷新"
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>

              {/* Wiki 元数据信息 */}
              {wikiMeta && (
                <div
                  className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-[11px] text-muted-foreground"
                  data-testid="wiki-meta"
                >
                  <div className="flex items-center gap-1.5">
                    <FolderOpen className="size-3 shrink-0" />
                    <span
                      className="truncate font-mono text-[10.5px]"
                      title={wikiMeta.wiki_dir}
                    >
                      {wikiMeta.wiki_dir}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Clock className="size-3 shrink-0" />
                    <span>
                      上次生成：{formatRelativeTime(wikiMeta.last_generated_at)}
                    </span>
                  </div>
                </div>
              )}

              {/* Symbol 过滤器 */}
              {allSymbols.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/85">
                    <Hash className="size-3" />
                    按 symbol 过滤
                  </div>
                  <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                    {allSymbols.map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() =>
                          setActiveSymbol((prev) => (prev === sym ? null : sym))
                        }
                        aria-pressed={activeSymbol === sym}
                        data-testid={`wiki-symbol-filter-${sym}`}
                        className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                          activeSymbol === sym
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-1 p-2">
                {isLoadingList ? (
                  <div className="space-y-2 p-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-12 animate-pulse rounded-md bg-muted/60"
                        aria-hidden
                      />
                    ))}
                  </div>
                ) : isListError ? (
                  <div className="m-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="size-3.5" />
                      加载失败
                    </div>
                    <p className="mt-1 opacity-80">
                      {listError instanceof Error ? listError.message : String(listError)}
                    </p>
                  </div>
                ) : !hasAnyEntry ? (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {searchQuery ? (
                      <>未找到匹配「{searchQuery}」的 Wiki</>
                    ) : activeSymbol ? (
                      <>没有模块包含 symbol「{activeSymbol}」</>
                    ) : (
                      <div className="space-y-2">
                        <Sparkles className="mx-auto size-6 opacity-50" />
                        <p>暂无 Wiki 文档</p>
                        <p className="text-[11px] opacity-75">
                          点击「增量更新」开始构建项目知识库
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  displayList.map((wiki) => (
                    <Button
                      key={wiki.module}
                      variant={selectedModule === wiki.module ? "secondary" : "ghost"}
                      className="h-auto w-full justify-start px-3 py-2.5"
                      onClick={() => setSelectedModule(wiki.module)}
                      aria-pressed={selectedModule === wiki.module}
                    >
                      <div className="flex w-full flex-col items-start gap-1">
                        <div className="flex w-full items-center gap-2">
                          <FileText className="size-4 shrink-0" />
                          <span className="truncate font-medium">{wiki.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{wiki.module}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {wiki.symbols.length} 符号
                          </Badge>
                        </div>
                      </div>
                    </Button>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {viewMode === "stats" && (
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-4">
              {isLoadingStats ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-md bg-muted/60"
                      aria-hidden
                    />
                  ))}
                </div>
              ) : wikiStats ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-background/60 p-3 text-center">
                      <div className="text-2xl font-bold text-primary">
                        {wikiStats.module_count}
                      </div>
                      <div className="text-[11px] text-muted-foreground">模块</div>
                    </div>
                    <div className="rounded-lg border bg-background/60 p-3 text-center">
                      <div className="text-2xl font-bold text-primary">
                        {wikiStats.total_symbols}
                      </div>
                      <div className="text-[11px] text-muted-foreground">符号（去重）</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-medium text-muted-foreground">
                      每模块符号数
                    </h3>
                    {wikiStats.symbols_per_module
                      .slice(0, 15)
                      .map(([mod, count]) => (
                        <button
                          key={mod}
                          type="button"
                          onClick={() => {
                            setViewMode("wiki");
                            setSelectedModule(mod);
                          }}
                          className="flex w-full items-center justify-between rounded-md border bg-background/40 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                        >
                          <span className="truncate font-mono">{mod}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {count}
                          </Badge>
                        </button>
                      ))}
                  </div>

                  <div className="space-y-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Clock className="size-3" />
                      最近更新
                    </h3>
                    {wikiStats.recently_updated.map(([mod, time]) => (
                      <button
                        key={mod}
                        type="button"
                        onClick={() => {
                          setViewMode("wiki");
                          setSelectedModule(mod);
                        }}
                        className="flex w-full items-center justify-between rounded-md border bg-background/40 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                      >
                        <span className="truncate font-mono">{mod}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeTime(time)}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  暂无统计数据
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {viewMode === "deps" && (
          <ScrollArea className="flex-1">
            <div className="space-y-2 p-4">
              {isLoadingDeps ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-md bg-muted/60"
                      aria-hidden
                    />
                  ))}
                </div>
              ) : depGraph && depGraph.edges.length > 0 ? (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    {depGraph.edges.length} 个模块有依赖关系
                  </p>
                  {depGraph.edges.map(([mod, deps]) => (
                    <div
                      key={mod}
                      className="rounded-md border bg-background/40 p-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode("wiki");
                          setSelectedModule(mod);
                        }}
                        className="mb-1.5 flex w-full items-center gap-1.5 text-left text-xs font-medium hover:text-primary"
                      >
                        <FileText className="size-3 shrink-0" />
                        <span className="truncate font-mono">{mod}</span>
                      </button>
                      <div className="flex flex-wrap gap-1 pl-4">
                        {deps.map((dep) => (
                          <button
                            key={dep}
                            type="button"
                            onClick={() => {
                              setViewMode("wiki");
                              setSelectedModule(dep);
                            }}
                            className="inline-flex items-center gap-0.5 rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          >
                            <ArrowRight className="size-2.5" />
                            {dep}
                          </button>
                        ))}
                      </div>
                      {reverseDeps.get(mod) && reverseDeps.get(mod)!.length > 0 && (
                        <div className="mt-1.5 pl-4">
                          <span className="text-[10px] text-muted-foreground/70">
                            被依赖：
                          </span>
                          {reverseDeps.get(mod)!.map((rdep) => (
                            <span
                              key={rdep}
                              className="ml-1 inline-block rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]"
                            >
                              {rdep}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <ListTree className="mx-auto mb-2 size-6 opacity-50" />
                  <p>暂无依赖图数据</p>
                  <p className="mt-1 text-[11px] opacity-75">
                    生成 Wiki 后将自动分析模块依赖
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* 右侧:内容展示 + TOC */}
      <div className="flex flex-1">
        {/* 主内容区 */}
        <div className="flex flex-1 flex-col">
          {viewMode !== "wiki" ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <div className="max-w-md space-y-3 text-center">
                <BarChart3 className="mx-auto size-12 opacity-50" />
                <p className="text-sm">
                  切换到 Wiki 标签浏览模块文档
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewMode("wiki")}
                >
                  返回 Wiki 浏览
                </Button>
              </div>
            </div>
          ) : !selectedModule ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <div className="max-w-md space-y-3 text-center">
                <FolderOpen className="mx-auto size-12 opacity-50" />
                <p className="text-sm">选择一个模块查看 Wiki 文档</p>
                <p className="mt-1 text-xs opacity-70">
                  数据源：<code className="rounded bg-muted px-1">.ydsz/wiki/*.md</code>
                </p>
                <div className="mt-3 rounded-md border border-dashed border-border/60 bg-background/30 p-3 text-left text-[11px] text-muted-foreground/80">
                  <p className="font-medium text-foreground">提示：</p>
                  <ul className="mt-1.5 ml-4 list-disc space-y-0.5">
                    <li>在 Composer 中输入 <code className="rounded bg-muted px-1">@wiki 关键词</code> 快速检索</li>
                    <li>点击模块内的 symbol 可跳转到对应模块</li>
                    <li>点击「复制」按钮把 Markdown 原文复制到剪贴板</li>
                    <li>切换到「统计」或「依赖」标签查看更多信息</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <span>Wiki</span>
                    <ChevronRight className="size-4" />
                    <span className="truncate">{selectedModule}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyMarkdown}
                    disabled={!selectedWiki}
                    data-testid="wiki-copy-markdown"
                    className="shrink-0"
                  >
                    {copied ? (
                      <>
                        <CheckIcon2 className="mr-1.5 size-3.5" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1.5 size-3.5" />
                        复制 Markdown
                      </>
                    )}
                  </Button>
                </div>
                <h1 className="text-2xl font-bold">
                  {selectedWiki?.title ?? "加载中..."}
                </h1>
                {selectedWiki ? (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>更新于 {new Date(selectedWiki.updated_at).toLocaleString()}</span>
                    <Badge variant="secondary">{selectedWiki.symbols.length} 个符号</Badge>
                  </div>
                ) : null}
                {selectedWiki && selectedWiki.symbols.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedWiki.symbols.map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => handleSymbolClick(sym)}
                        className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 font-mono text-[11px] text-foreground/80 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
                        title={`跳转到包含 ${sym} 的模块`}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <ScrollArea className="flex-1">
                <div className="mx-auto max-w-4xl p-6">
                  {isLoadingContent ? (
                    <div className="space-y-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-4 w-full animate-pulse rounded bg-muted/60"
                          aria-hidden
                        />
                      ))}
                    </div>
                  ) : selectedWiki ? (
                    <div className="chat-markdown text-foreground/85">
                      <ChatMarkdown text={selectedWiki.content} cwd={root} />
                    </div>
                  ) : (
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                      未找到模块 <code>{selectedModule}</code> 的 Wiki 条目
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* 右侧 TOC 侧边栏 */}
        {viewMode === "wiki" && selectedModule && outline && outline.length > 0 && (
          <div className="hidden w-56 flex-col border-l bg-muted/20 lg:flex">
            <div className="border-b px-4 py-2.5">
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ListTree className="size-3" />
                大纲
              </h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-0.5 p-2">
                {outline.map((node, i) => (
                  <a
                    key={`${node.anchor}-${i}`}
                    href={`#${node.anchor}`}
                    onClick={(e) => {
                      e.preventDefault();
                      // 滚动到标题位置
                      const el = document.getElementById(node.anchor);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                    className="block truncate py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    style={{ paddingLeft: `${(node.level - 1) * 12 + 8}px` }}
                    title={node.text}
                  >
                    {node.text}
                  </a>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
