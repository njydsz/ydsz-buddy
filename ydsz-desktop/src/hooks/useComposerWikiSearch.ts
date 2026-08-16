/**
 * @file Composer Wiki 搜索 Hook
 *
 * 当 Composer 中识别到 `@wiki<query>` 触发器时,异步调用
 * `repo_wiki_search` 检索项目 Wiki 条目,并将结果映射为
 * `ComposerCommandItem` 列表。
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: 仅在 `composerTrigger.kind === "mention"` 且
 *    query 匹配 `wiki` 前缀时启用。
 * 2. **防抖搜索**: 使用 300ms 防抖,避免每次按键都触发后端调用。
 * 3. **状态降级**: 没有 root(没有打开工作区)或没有结果时,返回
 *    `wiki-hint` / `wiki-empty` 占位条目,引导用户。
 * 4. **错误降级**: 后端调用失败时,返回 `wiki-empty` 提示。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 触发器下拉取 wiki 结果
 * - ChatView 主动传入当前工作区根目录,确保搜索范围正确
 *
 * ## 注意事项
 *
 * - 该 hook 内部维护独立的 effect 计时器,不需要外部状态机配合
 * - 空查询/无 root 时立即返回 hint,无 loading 状态
 * - 搜索中或 debounce 等待中 `isLoading` 为 true
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import type { ComposerTrigger } from "../composer-logic";
import type { WikiSearchResultDto } from "../lib/composerMentions";

/** 触发字符串(不含 `@` 前缀) */
const WIKI_TRIGGER = "wiki";

/** 防抖延迟(毫秒),与 `composerMentions` 内置常量保持一致 */
const WIKI_DEBOUNCE_MS = 300;

/** 搜索结果上限,避免菜单过长 */
const WIKI_RESULT_LIMIT = 20;

/** 后端响应结构(只取需要字段) */
interface WikiSearchResponse {
  count: number;
  entries: WikiSearchResultDto[];
}

export interface UseComposerWikiSearchResult {
  /** 给 Composer 菜单使用的条目列表(可能包含 hint/empty) */
  items: ComposerCommandItem[];
  /** 是否正在等待防抖或后端响应 */
  isLoading: boolean;
  /** 后端调用是否失败(网络/解析错误) */
  hasError: boolean;
  /** 当前触发的查询字符串(已 trim,不含 `wiki` 前缀) */
  query: string;
}

/**
 * 判断 mention 触发器是否匹配 @wiki 模式
 *
 * 支持以下三种状态:
 * - `@wiki` (query === "wiki")
 * - `@wiki<query>` (query 以 "wiki" 开头,后面有内容)
 *
 * @param trigger - 当前 Composer 触发器
 * @returns 是否为 @wiki 触发,以及去除 `wiki` 前缀后的真实查询
 */
function extractWikiQuery(trigger: ComposerTrigger | null): {
  matches: boolean;
  query: string;
} {
  if (!trigger || trigger.kind !== "mention") {
    return { matches: false, query: "" };
  }
  const raw = trigger.query.trim();
  if (raw === WIKI_TRIGGER) {
    return { matches: true, query: "" };
  }
  if (raw.startsWith(WIKI_TRIGGER) && raw.length > WIKI_TRIGGER.length) {
    // 确保是 `wiki` 后跟空白/分隔,例如 `wiki auth`,而不是 `wikipedia`
    const remainder = raw.slice(WIKI_TRIGGER.length);
    if (remainder.startsWith(" ") || remainder.startsWith("-") || remainder.startsWith("_")) {
      return { matches: true, query: remainder.slice(1).trim() };
    }
  }
  return { matches: false, query: "" };
}

/**
 * 将后端 Wiki 条目映射为 Composer 菜单项
 */
function mapWikiEntryToItem(entry: WikiSearchResultDto): ComposerCommandItem {
  return {
    id: `wiki:${entry.module}`,
    type: "wiki-result",
    module: entry.module,
    title: entry.title,
    symbols: entry.symbols,
    context: entry.content,
    label: entry.title,
    description: `${entry.module} · ${entry.symbols.length} 符号`,
  };
}

/**
 * Composer Wiki 搜索 hook
 *
 * @param trigger - 当前 Composer 触发器
 * @param workspaceRoot - 项目根目录(可选)。为 null 时返回 hint
 * @returns 菜单项 + 加载/错误状态
 */
export function useComposerWikiSearch(
  trigger: ComposerTrigger | null,
  workspaceRoot: string | null,
): UseComposerWikiSearchResult {
  const { matches, query } = extractWikiQuery(trigger);
  const [results, setResults] = useState<WikiSearchResultDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  // 用于防抖的 effect 句柄,避免组件卸载后回写 setState
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // 不匹配 @wiki 触发器,直接清空
    if (!matches) {
      setResults([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    // 没有工作区根目录,不能搜索 Wiki
    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
      setResults([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    // 空查询(@wiki 后没输入),等待用户输入关键词
    if (query.length === 0) {
      setResults([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    const timer = setTimeout(() => {
      void invoke<WikiSearchResponse>("repo_wiki_search", {
        params: {
          root: workspaceRoot,
          query,
        },
      })
        .then((response) => {
          if (cancelled || !mountedRef.current) return;
          setResults(response.entries.slice(0, WIKI_RESULT_LIMIT));
          setIsLoading(false);
        })
        .catch((error) => {
          if (cancelled || !mountedRef.current) return;
          console.error("[composer-wiki] search failed:", error);
          setHasError(true);
          setResults([]);
          setIsLoading(false);
        });
    }, WIKI_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matches, query, workspaceRoot]);

  const items = useMemo<ComposerCommandItem[]>(() => {
    if (!matches) return [];

    // 无根目录:提示打开工作区
    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
      return [
        {
          id: "wiki-hint:no-root",
          type: "wiki-hint",
          label: "打开工作区后可搜索 Wiki",
          description: "Wiki 搜索需要项目根目录",
        } satisfies ComposerCommandItem,
      ];
    }

    // 无查询:提示用户输入关键词
    if (query.length === 0) {
      return [
        {
          id: "wiki-hint:empty-query",
          type: "wiki-hint",
          label: "输入关键词搜索 Wiki 文档",
          description: "例如: auth, parser, schema",
        } satisfies ComposerCommandItem,
      ];
    }

    if (hasError) {
      return [
        {
          id: "wiki-empty:error",
          type: "wiki-empty",
          label: "Wiki 搜索失败",
          description: "请稍后重试,或打开「Repo Wiki」侧栏检查服务",
        } satisfies ComposerCommandItem,
      ];
    }

    if (results.length === 0) {
      return [
        {
          id: "wiki-empty:no-results",
          type: "wiki-empty",
          label: `未找到与「${query}」相关的 Wiki`,
          description: "尝试更换关键词,或在侧栏中先运行「重新生成」",
        } satisfies ComposerCommandItem,
      ];
    }

    return results.map(mapWikiEntryToItem);
  }, [matches, workspaceRoot, query, hasError, results]);

  return { items, isLoading, hasError, query };
}
