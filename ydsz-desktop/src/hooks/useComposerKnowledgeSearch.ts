/**
 * @file Composer 知识库提及搜索 Hook（G6-P1）
 *
 * 为 Composer 中输入 `@knowledge <query>` 触发器提供检索功能：
 * - 调用 `knowledge_list_sources` + `knowledge_search` 获取知识源与匹配片段
 * - 结果以 `ComposerCommandItem[]` 格式回传给 `useComposerCommandMenuItems`
 *
 * ## 核心导出
 *
 * - `useComposerKnowledgeSearch`：返回 `{ knowledgeItems, knowledgeLoading }`
 *
 * ## 内部 Tauri invoke
 *
 * - `knowledge_list_sources`：列出已索引的知识源
 * - `knowledge_search`：语义搜索知识库，返回匹配片段 + 相似度分数
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import { invoke } from "@tauri-apps/api/core";

// ===== 类型 =====

type KnowledgeSearchResult = {
  title: string;
  snippet: string;
  sourcePath: string;
  sourceType: string;
  score: number;
};

interface UseComposerKnowledgeSearchResult {
  knowledgeItems: ComposerCommandItem[];
  knowledgeLoading: boolean;
}

// ===== 主 Hook =====

export function useComposerKnowledgeSearch(
  query: string | null,
  enabled: boolean,
): UseComposerKnowledgeSearchResult {
  const [items, setItems] = useState<ComposerCommandItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchKnowledge = useCallback(
    async (q: string) => {
      if (!enabled) return;
      // 提取 @knowledge 后的实际查询文本
      const cleanQuery = q.replace(/^knowledge\s*/, "").trim();
      if (!cleanQuery) {
        setItems([]);
        return;
      }

      setLoading(true);
      try {
        const results = await invoke<KnowledgeSearchResult[]>(
          "knowledge_search",
          { query: cleanQuery, limit: 8 },
        );

        const commandItems: ComposerCommandItem[] = results.map((r, i) => ({
          id: `knowledge-result:${i}`,
          type: "knowledge-result" as const,
          label: r.title,
          description: r.snippet,
          // 可存储额外 metadata 供选中后使用
          ...({
            sourcePath: r.sourcePath,
            sourceType: r.sourceType,
            score: r.score,
          } as Record<string, unknown>),
        }));

        setItems(commandItems);
      } catch {
        // 搜索失败时静默降级
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled || !query) {
      setItems([]);
      return;
    }

    // 防抖 300ms
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void fetchKnowledge(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, enabled, fetchKnowledge]);

  return { knowledgeItems: items, knowledgeLoading: loading };
}
