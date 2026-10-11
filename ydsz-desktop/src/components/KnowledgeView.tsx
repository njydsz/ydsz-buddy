/**
 * @file 知识库 RAG 管理组件（G6-P1）
 *
 * 提供知识库列表视图、文档管理、检索测试功能。
 * 基于 src-tauri/src/commands/knowledge.rs 的已有命令构建。
 */

import { memo, useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Database,
  FileText,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { toastManager } from "./ui/toast";
import { useMessages } from "../i18n";

// ===== 类型定义（与 Rust 端 knowledge.rs 对齐） =====

interface KnowledgeSource {
  id: string;
  name: string;
  sourceType: "project" | "url" | "note" | "wiki" | "docs";
  indexedAt: string;
  chunkCount: number;
}

interface KnowledgeSearchResult {
  title: string;
  snippet: string;
  sourcePath: string;
  sourceType: string;
  score: number;
}

interface KnowledgeStats {
  totalSources: number;
  totalChunks: number;
  totalNotes: number;
  lastIndexedAt: string | null;
}

// ===== Tauri invoke（与 Rust 命令对齐） =====

import { invoke } from "@tauri-apps/api/core";

async function knowledgeListSources(): Promise<KnowledgeSource[]> {
  return invoke<KnowledgeSource[]>("knowledge_list_sources");
}

async function knowledgeSearch(
  query: string,
  limit?: number,
): Promise<KnowledgeSearchResult[]> {
  return invoke<KnowledgeSearchResult[]>("knowledge_search", { query, limit });
}

async function knowledgeStats(): Promise<KnowledgeStats> {
  return invoke<KnowledgeStats>("knowledge_stats");
}

async function knowledgeAddNote(
  title: string,
  content: string,
  tags: string[],
): Promise<string> {
  return invoke<string>("knowledge_add_note", { title, content, tags });
}

async function knowledgeIndexProject(projectPath: string): Promise<string> {
  return invoke<string>("knowledge_index_project", { projectPath });
}

// ===== 组件 =====

export const KnowledgeView = memo(function KnowledgeView() {
  const messages = useMessages();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sourcesRes, statsRes] = await Promise.all([
        knowledgeListSources(),
        knowledgeStats(),
      ]);
      setSources(sourcesRes);
      setStats(statsRes);
    } catch {
      toastManager.error("加载知识库数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as { __TAURI__?: unknown }).__TAURI__) {
      loadData();
    }
  }, [loadData]);

  // 检索
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await knowledgeSearch(searchQuery, 10);
      setSearchResults(results);
    } catch {
      toastManager.error("检索失败");
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  return (
    <div className="space-y-6 p-4">
      {/* 顶部统计栏 */}
      {stats && (
        <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <span className="text-xs text-muted-foreground">知识源</span>
            <Badge variant="secondary">{stats.totalSources}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">块数</span>
            <Badge variant="secondary">{stats.totalChunks}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-green-500" />
            <span className="text-xs text-muted-foreground">笔记</span>
            <Badge variant="secondary">{stats.totalNotes}</Badge>
          </div>
          <div className="ms-auto">
            <Button size="xs" variant="outline" onClick={loadData} disabled={loading}>
              {loading ? <Loader2 className="size-3 animate-spin" /> : "刷新"}
            </Button>
          </div>
        </div>
      )}

      {/* 知识源列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">知识源</h3>
          <Button size="xs" variant="default" disabled>
            <Plus className="size-3" />
            新建知识库
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            加载中...
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-8 text-muted-foreground">
            <Database className="mb-2 size-8 opacity-50" />
            <p className="text-sm">暂无知识源</p>
            <p className="text-xs">索引项目或添加笔记开始构建知识库</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center rounded-md border border-border/60 bg-background p-3"
              >
                <FileText className="mr-3 size-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{source.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {source.sourceType} · {source.chunkCount} 块 ·{" "}
                    {new Date(source.indexedAt).toLocaleDateString()}
                  </div>
                </div>
                <Badge variant="outline">{source.sourceType}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 文档上传占位 */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">文档上传</h3>
        <div className="flex flex-col items-center rounded-lg border-2 border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center">
          <Upload className="mb-2 size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">拖拽文件到此处或点击选择</p>
          <p className="text-xs text-muted-foreground/70">
            支持 .md / .txt / .pdf / .docx
          </p>
          <Button size="xs" variant="outline" className="mt-3" disabled>
            选择文件
          </Button>
        </div>
      </div>

      {/* 检索测试 */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">检索测试</h3>
        <div className="flex gap-2">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="输入查询内容..."
            className="h-8 flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <Button size="xs" variant="default" onClick={handleSearch} disabled={searching}>
            {searching ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
            检索
          </Button>
        </div>
        {searchResults.length > 0 && (
          <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border border-border/40 p-2">
            {searchResults.map((result, i) => (
              <div
                key={i}
                className="rounded border border-border/30 bg-muted/30 p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{result.title}</span>
                  <Badge variant="secondary" className="h-5 text-[10px]">
                    {(result.score * 100).toFixed(0)}%
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {result.snippet}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                  {result.sourcePath}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
