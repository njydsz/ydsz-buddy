/**
 * @file Composer Codebase 搜索 Hook
 *
 * 当 Composer 中识别到 `@codebase<query>` 触发器时,异步调用
 * `indexer_search_symbols` + `indexer_search_text` 检索代码库,
 * 并将结果映射为 `ComposerCommandItem` 列表。
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: 仅在 `composerTrigger.kind === "mention"` 且
 *    query 匹配 `codebase` 前缀时启用。
 * 2. **防抖搜索**: 使用 300ms 防抖,避免每次按键都触发后端调用。
 * 3. **双路并行**: symbols 与 text 两路同时查询,合并后去重截断到上限。
 * 4. **状态降级**: 没有 root(没有打开工作区)或没有结果时,返回
 *    `codebase-hint` / `codebase-empty` 占位条目,引导用户。
 * 5. **错误降级**: 后端调用失败时,返回 `codebase-empty` 提示。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 触发器下拉取 codebase 结果
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
import type { CodebaseSymbolResult, CodebaseTextResult } from "../lib/composerMentions";

/** 触发字符串(不含 `@` 前缀) */
const CODEBASE_TRIGGER = "codebase";

/** 防抖延迟(毫秒),与 `composerMentions` 内置常量保持一致 */
const CODEBASE_DEBOUNCE_MS = 300;

/** 搜索结果上限,避免菜单过长 */
const CODEBASE_RESULT_LIMIT = 20;

export interface UseComposerCodebaseSearchResult {
  /** 给 Composer 菜单使用的条目列表(可能包含 hint/empty) */
  items: ComposerCommandItem[];
  /** 是否正在等待防抖或后端响应 */
  isLoading: boolean;
  /** 后端调用是否失败(网络/解析错误) */
  hasError: boolean;
  /** 当前触发的查询字符串(已 trim,不含 `codebase` 前缀) */
  query: string;
}

/**
 * 判断 mention 触发器是否匹配 @codebase 模式
 *
 * 支持以下三种状态:
 * - `@codebase` (query === "codebase")
 * - `@codebase<query>` (query 以 "codebase" 开头,后面有内容)
 *
 * @param trigger - 当前 Composer 触发器
 * @returns 是否为 @codebase 触发,以及去除 `codebase` 前缀后的真实查询
 */
function extractCodebaseQuery(trigger: ComposerTrigger | null): {
  matches: boolean;
  query: string;
} {
  if (!trigger || trigger.kind !== "mention") {
    return { matches: false, query: "" };
  }
  const raw = trigger.query.trim();
  if (raw === CODEBASE_TRIGGER) {
    return { matches: true, query: "" };
  }
  if (raw.startsWith(CODEBASE_TRIGGER) && raw.length > CODEBASE_TRIGGER.length) {
    // 确保是 `codebase` 后跟空白/分隔,例如 `codebase auth`,而不是 `codebases`
    const remainder = raw.slice(CODEBASE_TRIGGER.length);
    if (remainder.startsWith(" ") || remainder.startsWith("-") || remainder.startsWith("_")) {
      return { matches: true, query: remainder.slice(1).trim() };
    }
  }
  return { matches: false, query: "" };
}

/**
 * 将符号结果转换为 Composer 菜单项
 */
function mapSymbolToItem(symbol: CodebaseSymbolResult): ComposerCommandItem {
  return {
    id: `codebase-symbol:${symbol.file}:${symbol.line}:${symbol.name}`,
    type: "codebase-result",
    kind: "symbol",
    label: symbol.name,
    description: `${symbol.kind} · ${symbol.file}:${symbol.line}`,
    file: symbol.file,
    line: symbol.line,
    column: symbol.column,
    text: symbol.name,
    context: "",
  };
}

/**
 * 将文本搜索结果转换为 Composer 菜单项
 */
function mapTextToItem(result: CodebaseTextResult): ComposerCommandItem {
  const snippet = result.text.length > 80 ? `${result.text.slice(0, 80)}…` : result.text;
  return {
    id: `codebase-text:${result.file}:${result.line}:${result.column}`,
    type: "codebase-result",
    kind: "text",
    label: snippet,
    description: `${result.file}:${result.line}`,
    file: result.file,
    line: result.line,
    column: result.column,
    text: result.text,
    context: result.context,
  };
}

/**
 * Composer Codebase 搜索 hook
 *
 * @param trigger - 当前 Composer 触发器
 * @param workspaceRoot - 项目根目录(可选)。为 null 时返回 hint
 * @returns 菜单项 + 加载/错误状态
 */
export function useComposerCodebaseSearch(
  trigger: ComposerTrigger | null,
  workspaceRoot: string | null,
): UseComposerCodebaseSearchResult {
  const { matches, query } = extractCodebaseQuery(trigger);
  const [items, setItems] = useState<CodebaseSearchEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!matches) {
      setItems([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
      setItems([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    if (query.length === 0) {
      setItems([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    const timer = setTimeout(() => {
      const symbolsPromise = invoke<CodebaseSymbolResult[]>("indexer_search_symbols", {
        query,
        root: workspaceRoot,
      }).catch(() => [] as CodebaseSymbolResult[]);
      const textPromise = invoke<CodebaseTextResult[]>("indexer_search_text", {
        query,
        root: workspaceRoot,
      }).catch(() => [] as CodebaseTextResult[]);

      Promise.all([symbolsPromise, textPromise])
        .then(([symbols, texts]) => {
          if (cancelled || !mountedRef.current) return;
          const merged: CodebaseSearchEntry[] = [
            ...symbols.slice(0, CODEBASE_RESULT_LIMIT).map((s) => ({ source: "symbol" as const, symbol: s })),
            ...texts.slice(0, CODEBASE_RESULT_LIMIT - Math.min(symbols.length, CODEBASE_RESULT_LIMIT)).map(
              (t) => ({ source: "text" as const, text: t }),
            ),
          ];
          setItems(merged);
          setIsLoading(false);
        })
        .catch((error) => {
          if (cancelled || !mountedRef.current) return;
          console.error("[composer-codebase] search failed:", error);
          setHasError(true);
          setItems([]);
          setIsLoading(false);
        });
    }, CODEBASE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matches, query, workspaceRoot]);

  const mappedItems = useMemo<ComposerCommandItem[]>(() => {
    if (!matches) return [];

    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
      return [
        {
          id: "codebase-hint:no-root",
          type: "codebase-hint",
          label: "打开工作区后可搜索代码库",
          description: "Codebase 搜索需要项目根目录",
        } satisfies ComposerCommandItem,
      ];
    }

    if (query.length === 0) {
      return [
        {
          id: "codebase-hint:empty-query",
          type: "codebase-hint",
          label: "输入关键词搜索代码库符号与文本",
          description: "例如: auth, parseUser, handleError",
        } satisfies ComposerCommandItem,
      ];
    }

    if (hasError) {
      return [
        {
          id: "codebase-empty:error",
          type: "codebase-empty",
          label: "Codebase 搜索失败",
          description: "请稍后重试,或检查 Indexer 服务状态",
        } satisfies ComposerCommandItem,
      ];
    }

    if (items.length === 0) {
      return [
        {
          id: "codebase-empty:no-results",
          type: "codebase-empty",
          label: `未找到与「${query}」相关的代码`,
          description: "尝试更换关键词,或重新构建索引",
        } satisfies ComposerCommandItem,
      ];
    }

    return items.map((entry) =>
      entry.source === "symbol" ? mapSymbolToItem(entry.symbol) : mapTextToItem(entry.text),
    );
  }, [matches, workspaceRoot, query, hasError, items]);

  return { items: mappedItems, isLoading, hasError, query };
}

type CodebaseSearchEntry =
  | { source: "symbol"; symbol: CodebaseSymbolResult }
  | { source: "text"; text: CodebaseTextResult };
