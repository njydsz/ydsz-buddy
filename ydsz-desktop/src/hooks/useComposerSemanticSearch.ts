/**
 * @file Composer 语义搜索 Hook
 *
 * 当 Composer 中识别到 `@semantic<query>` 触发器时,通过 embedding API
 * 将查询向量化,再在 IndexedDB 向量存储中执行余弦相似度检索,返回
 * 最相关的代码片段。
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: mention 触发器匹配 `semantic` 前缀。
 * 2. **配置获取**: 从 Custom Provider Store 获取第一个 OpenAI 兼容 Provider
 *    的 baseUrl + apiKey,用于调用 embedding API。
 * 3. **防抖搜索**: 500ms 防抖(embedding API 调用比本地搜索慢)。
 * 4. **查询缓存**: 查询向量缓存在 IndexedDB,相同查询不重复调用 API。
 * 5. **结果降级**: 无 Provider 配置/无索引数据/API 失败时返回 hint。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 触发器下拉取 semantic 结果
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import type { ComposerTrigger } from "../composer-logic";
import { DEFAULT_EMBEDDING_MODEL, embedText } from "../lib/embeddingClient";
import {
  cacheQueryVector,
  getCachedQueryVector,
  semanticSearch,
  type SemanticSearchResult,
} from "../lib/vectorStore";
import { useCustomProviderStore } from "../lib/customProviderStore";

/** 触发字符串(不含 `@` 前缀) */
const SEMANTIC_TRIGGER = "semantic";
/** 防抖延迟(毫秒) */
const SEMANTIC_DEBOUNCE_MS = 500;
/** 搜索结果上限 */
const SEMANTIC_RESULT_LIMIT = 20;
/** 最低相似度阈值 */
const MIN_SIMILARITY_SCORE = 0.25;

export interface UseComposerSemanticSearchResult {
  /** 给 Composer 菜单使用的条目列表 */
  items: ComposerCommandItem[];
  /** 是否正在等待防抖或 API 响应 */
  isLoading: boolean;
  /** API 调用是否失败 */
  hasError: boolean;
  /** 当前触发的查询字符串 */
  query: string;
}

/**
 * 判断 mention 触发器是否匹配 @semantic 模式
 */
function extractSemanticQuery(trigger: ComposerTrigger | null): {
  matches: boolean;
  query: string;
} {
  if (!trigger || trigger.kind !== "mention") {
    return { matches: false, query: "" };
  }
  const raw = trigger.query.trim();
  if (raw === SEMANTIC_TRIGGER) {
    return { matches: true, query: "" };
  }
  if (raw.startsWith(SEMANTIC_TRIGGER) && raw.length > SEMANTIC_TRIGGER.length) {
    const remainder = raw.slice(SEMANTIC_TRIGGER.length);
    if (remainder.startsWith(" ") || remainder.startsWith("-") || remainder.startsWith("_")) {
      return { matches: true, query: remainder.slice(1).trim() };
    }
  }
  return { matches: false, query: "" };
}

/**
 * 将语义搜索结果转换为 Composer 菜单项
 */
function mapResultToItem(
  result: SemanticSearchResult,
  query: string,
): ComposerCommandItem {
  const scorePercent = Math.round(result.score * 100);
  return {
    id: `semantic:${result.filePath}:${result.startLine}`,
    type: "codebase-result",
    kind: "semantic",
    label: result.filePath.split(/[\\/]/).pop() ?? result.filePath,
    description: `${result.filePath}:${result.startLine + 1} · ${scorePercent}%`,
    file: result.filePath,
    line: result.startLine + 1,
    text: result.snippet.slice(0, 80),
    context: query,
  };
}

/**
 * Composer 语义搜索 Hook
 *
 * @param trigger - 当前 Composer 触发器
 * @param workspaceRoot - 当前工作区根目录
 * @returns 搜索结果与状态
 */
export function useComposerSemanticSearch(
  trigger: ComposerTrigger | null,
  workspaceRoot: string | null,
): UseComposerSemanticSearchResult {
  const { matches, query } = useMemo(
    () => extractSemanticQuery(trigger),
    [trigger],
  );

  const [items, setItems] = useState<ComposerCommandItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 从 Custom Provider Store 获取第一个 OpenAI 兼容 Provider
  const embeddingProvider = useCustomProviderStore((state) => {
    const providers = state.providers;
    return (
      providers.find(
        (p) => p.protocol === "openai" && p.hasApiKey && p.baseUrl,
      ) ?? null
    );
  });
  const getResolvedProvider = useCustomProviderStore(
    (state) => state.getResolvedProvider,
  );

  useEffect(() => {
    if (!matches) {
      setItems([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    if (!query) {
      setItems([
        {
          id: "semantic-hint",
          type: "codebase-hint",
          label: "Semantic search",
          description: "Type a natural language query to find code by meaning",
        },
      ]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    if (!workspaceRoot || !embeddingProvider) {
      setItems([
        {
          id: "semantic-no-config",
          type: "codebase-hint",
          label: "Semantic search unavailable",
          description: embeddingProvider
            ? "Open a workspace to search"
            : "Add an OpenAI-compatible provider with API key to enable",
        },
      ]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const resolved = getResolvedProvider(embeddingProvider.id);
        if (!resolved) {
          setItems([]);
          setHasError(true);
          return;
        }

        const model =
          (resolved.models ? Object.keys(resolved.models)[0] : undefined) ??
          DEFAULT_EMBEDDING_MODEL;

        // 检查查询缓存
        let queryVector = await getCachedQueryVector(query, model);
        if (!queryVector) {
          const result = await embedText(query, {
            baseUrl: resolved.baseUrl,
            apiKey: resolved.apiKey,
            model,
          });
          queryVector = result.vector;
          await cacheQueryVector(query, model, queryVector);
        }

        const results = await semanticSearch(
          queryVector,
          workspaceRoot,
          SEMANTIC_RESULT_LIMIT,
          MIN_SIMILARITY_SCORE,
        );

        if (results.length === 0) {
          setItems([
            {
              id: "semantic-empty",
              type: "codebase-hint",
              label: "No semantic matches",
              description: "Try a different query or index more files",
            },
          ]);
        } else {
          setItems(results.map((r) => mapResultToItem(r, query)));
        }
      } catch (error) {
        setHasError(true);
        setItems([
          {
            id: "semantic-error",
            type: "codebase-hint",
            label: "Semantic search failed",
            description: error instanceof Error ? error.message.slice(0, 100) : "Unknown error",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    }, SEMANTIC_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [matches, query, workspaceRoot, embeddingProvider, getResolvedProvider]);

  return { items, isLoading, hasError, query };
}
