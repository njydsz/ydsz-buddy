/**
 * @file Composer Indexer 索引检索 Hook
 *
 * 当 Composer 中识别到 `@indexer<query>` 触发器时,异步调用
 * `indexer_search_symbols` 检索已构建索引的代码库符号,
 * 并将结果映射为 `ComposerCommandItem` 列表。
 *
 * ## 与 @codebase 的差异
 *
 * - `@codebase` 关注"在哪儿",全文 + 符号双路并行,更偏定位
 * - `@indexer` 关注"它是什么",主走符号索引(高亮 kind: function / class / trait),
 *   并把 kind 信息显式带进菜单,适合"我要找所有 interface"、"我要找所有函数定义"
 *   这类"按形态过滤"场景
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: 仅在 `composerTrigger.kind === "mention"` 且
 *    query 匹配 `indexer` 前缀时启用。
 * 2. **防抖搜索**: 使用 300ms 防抖,避免每次按键都触发后端调用。
 * 3. **结果排序**: 优先展示精确匹配(完全相等 / 前缀),其余按字母序。
 * 4. **状态降级**: 没有 root 或没有结果时,返回
 *    `indexer-hint` / `indexer-empty` 占位条目,引导用户。
 * 5. **错误降级**: 后端调用失败时,返回 `indexer-empty` 提示。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 触发器下拉取 indexer 结果
 * - ChatView 主动传入当前工作区根目录,确保搜索范围正确
 *
 * ## 注意事项
 *
 * - 该 hook 仅依赖 `indexer_search_symbols`,不依赖 `indexer_build` 已运行;
 *   后端在未构建索引时会返回 "索引未构建" 错误,这里把它降级为 hint。
 * - 选中结果后,ChatView 会插入 `@indexer "<file>:<line>"` 内联 token,
 *   上下文走 `selectedComposerMentions` 携带。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import type { ComposerTrigger } from "../composer-logic";

/** 触发字符串(不含 `@` 前缀) */
const INDEXER_TRIGGER = "indexer";

/** 防抖延迟(毫秒),与 codebase hook 保持一致 */
const INDEXER_DEBOUNCE_MS = 300;

/** 搜索结果上限,避免菜单过长 */
const INDEXER_RESULT_LIMIT = 24;

/**
 * 后端 `indexer_search_symbols` 返回的符号条目(对应 `SymbolEntry`)
 *
 * SymbolKind 在 Rust 端是 enum,会按 `#[serde(rename_all = "camelCase")]`
 * 序列化为 `function` / `class` / `interface` / `method` / `type` /
 * `variable` / `constant` / `module` / `trait` / `enum` / `unknown` 等
 * 字符串。
 */
export interface IndexerSymbolEntry {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
}

export interface UseComposerIndexerPickResult {
  /** 给 Composer 菜单使用的条目列表(可能包含 hint/empty) */
  items: ComposerCommandItem[];
  /** 是否正在等待防抖或后端响应 */
  isLoading: boolean;
  /** 后端调用是否失败(网络/解析错误) */
  hasError: boolean;
  /** 当前触发的查询字符串(已 trim,不含 `indexer` 前缀) */
  query: string;
  /**
   * 后端是否提示"索引未构建"。
   * 区别于 hasError,这个状态可以引导用户先去 Settings/Indexer 构建索引。
   */
  isIndexMissing: boolean;
}

interface ExtractedIndexerQuery {
  matches: boolean;
  query: string;
}

/**
 * 判断 mention 触发器是否匹配 @indexer 模式
 *
 * 支持以下三种状态:
 * - `@indexer` (query === "indexer")
 * - `@indexer<query>` (query 以 "indexer" 开头,后面有内容)
 *
 * @param trigger - 当前 Composer 触发器
 * @returns 是否为 @indexer 触发,以及去除 `indexer` 前缀后的真实查询
 */
function extractIndexerQuery(trigger: ComposerTrigger | null): ExtractedIndexerQuery {
  if (!trigger || trigger.kind !== "mention") {
    return { matches: false, query: "" };
  }
  const raw = trigger.query.trim();
  if (raw === INDEXER_TRIGGER) {
    return { matches: true, query: "" };
  }
  if (raw.startsWith(INDEXER_TRIGGER) && raw.length > INDEXER_TRIGGER.length) {
    // 确保是 `indexer` 后跟空白/分隔,例如 `indexer Auth`,而不是 `indexers`
    const remainder = raw.slice(INDEXER_TRIGGER.length);
    if (remainder.startsWith(" ") || remainder.startsWith("-") || remainder.startsWith("_")) {
      return { matches: true, query: remainder.slice(1).trim() };
    }
  }
  return { matches: false, query: "" };
}

/** 把相对路径/绝对路径压成菜单友好的短形式 */
function shortenFilePath(filePath: string): string {
  const segments = filePath.split(/[/\\]/);
  if (segments.length <= 3) {
    return filePath;
  }
  return segments.slice(-3).join("/");
}

/**
 * 将符号结果转换为 Composer 菜单项
 */
function mapSymbolToItem(symbol: IndexerSymbolEntry): ComposerCommandItem {
  const relativeFile = shortenFilePath(symbol.file);
  return {
    id: `indexer-symbol:${symbol.file}:${symbol.line}:${symbol.name}`,
    type: "indexer-result",
    kind: symbol.kind,
    label: symbol.name,
    description: `${symbol.kind} · ${relativeFile}:${symbol.line}`,
    file: symbol.file,
    line: symbol.line,
    column: symbol.column,
    text: symbol.name,
    context: `@indexer 符号: ${symbol.name} (${symbol.kind})\n文件: ${symbol.file}:${symbol.line}:${symbol.column}`,
  };
}

/**
 * 排序符号:精确匹配 > 前缀匹配 > 包含匹配,其次按字母序
 */
function sortSymbols(
  symbols: readonly IndexerSymbolEntry[],
  query: string,
): IndexerSymbolEntry[] {
  if (!query) {
    return [...symbols];
  }
  const lower = query.toLowerCase();
  const score = (s: IndexerSymbolEntry): number => {
    const n = s.name.toLowerCase();
    if (n === lower) return 0;
    if (n.startsWith(lower)) return 1;
    if (n.includes(lower)) return 2;
    return 3;
  };
  return [...symbols].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Composer Indexer 检索 hook
 *
 * @param trigger - 当前 Composer 触发器
 * @param workspaceRoot - 项目根目录(可选)。为 null 时返回 hint
 * @returns 菜单项 + 加载/错误状态
 */
export function useComposerIndexerPick(
  trigger: ComposerTrigger | null,
  workspaceRoot: string | null,
): UseComposerIndexerPickResult {
  const { matches, query } = extractIndexerQuery(trigger);
  const [items, setItems] = useState<IndexerSymbolEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isIndexMissing, setIsIndexMissing] = useState(false);
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
      setIsIndexMissing(false);
      return;
    }

    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
      setItems([]);
      setIsLoading(false);
      setHasError(false);
      setIsIndexMissing(false);
      return;
    }

    if (query.length === 0) {
      setItems([]);
      setIsLoading(false);
      setHasError(false);
      setIsIndexMissing(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    setIsIndexMissing(false);

    const timer = setTimeout(() => {
      void invoke<IndexerSymbolEntry[]>("indexer_search_symbols", {
        query,
        root: workspaceRoot,
      })
        .then((response) => {
          if (cancelled || !mountedRef.current) return;
          const list = Array.isArray(response) ? [...response] : [];
          const sorted = sortSymbols(list, query).slice(0, INDEXER_RESULT_LIMIT);
          setItems(sorted);
          setIsLoading(false);
        })
        .catch((error: unknown) => {
          if (cancelled || !mountedRef.current) return;
          const message = error instanceof Error ? error.message : String(error);
          // 后端统一返回"索引未构建"错误,这里降级为 hint 而非 error,
          // 引导用户去设置面板构建索引
          if (message.includes("索引未构建")) {
            setIsIndexMissing(true);
            setHasError(false);
          } else {
            // eslint-disable-next-line no-console
            console.warn("[useComposerIndexerPick] search failed:", error);
            setHasError(true);
            setIsIndexMissing(false);
          }
          setItems([]);
          setIsLoading(false);
        });
    }, INDEXER_DEBOUNCE_MS);

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
          id: "indexer-hint:no-root",
          type: "indexer-hint",
          label: "打开工作区后可检索已构建索引的符号",
          description: "Indexer 搜索需要项目根目录 + indexer_build 完成",
        } satisfies ComposerCommandItem,
      ];
    }

    if (query.length === 0) {
      return [
        {
          id: "indexer-hint:empty-query",
          type: "indexer-hint",
          label: "输入符号名检索项目索引",
          description: "例如: AuthService, parseUser, useAuth",
        } satisfies ComposerCommandItem,
      ];
    }

    if (isIndexMissing) {
      return [
        {
          id: "indexer-empty:index-missing",
          type: "indexer-empty",
          label: "当前工作区尚未构建索引",
          description: "请先在 Indexer 面板运行 indexer_build 后再检索",
        } satisfies ComposerCommandItem,
      ];
    }

    if (hasError) {
      return [
        {
          id: "indexer-empty:error",
          type: "indexer-empty",
          label: "Indexer 搜索失败",
          description: "请稍后重试,或检查 Indexer 服务状态",
        } satisfies ComposerCommandItem,
      ];
    }

    if (items.length === 0) {
      return [
        {
          id: `indexer-empty:no-results:${query}`,
          type: "indexer-empty",
          label: `未找到与「${query}」相关的符号`,
          description: "尝试更换关键词,或重新构建索引",
        } satisfies ComposerCommandItem,
      ];
    }

    return items.map(mapSymbolToItem);
  }, [matches, workspaceRoot, query, hasError, isIndexMissing, items]);

  return { items: mappedItems, isLoading, hasError, query, isIndexMissing };
}
