/**
 * @file Composer AST-Grep 搜索 Hook
 *
 * 当 Composer 中识别到 `@ast-grep<query>` 触发器时,异步调用
 * `indexer_ast_grep_search` 检索代码库中的结构化模式匹配项,
 * 并将结果映射为 `ComposerCommandItem` 列表。
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: 仅在 `composerTrigger.kind === "mention"` 且
 *    query 匹配 `ast-grep` 前缀时启用。
 * 2. **防抖搜索**: 使用 300ms 防抖,避免每次按键都触发后端调用。
 * 3. **结果上限**: 限制最多返回 30 个匹配,避免菜单过长。
 * 4. **状态降级**: 没有 root(没有打开工作区)或没有结果时,返回
 *    `ast-grep-hint` / `ast-grep-empty` 占位条目,引导用户。
 * 5. **错误降级**: 后端调用失败时,返回 `ast-grep-empty` 提示。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 触发器下拉取 ast-grep 结果
 * - ChatView 主动传入当前工作区根目录,确保搜索范围正确
 *
 * ## 注意事项
 *
 * - 该 hook 内部维护独立的 effect 计时器,不需要外部状态机配合
 * - 空查询/无 root 时立即返回 hint,无 loading 状态
 * - 搜索中或 debounce 等待中 `isLoading` 为 true
 * - AST-Grep 默认按 "Pattern" 模式搜索(支持 meta-var)
 *   也支持 `kind:NodeKind <node_kind>` 语法走 NodeKind 模式
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { searchAstGrep } from "../lib/astGrepClient";
import type { AstGrepMatch } from "~/contracts";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import type { ComposerTrigger } from "../composer-logic";

/** 触发字符串(不含 `@` 前缀) */
const AST_GREP_TRIGGER = "ast-grep";

/** 防抖延迟(毫秒) */
const AST_GREP_DEBOUNCE_MS = 300;

/** 搜索结果上限,避免菜单过长 */
const AST_GREP_RESULT_LIMIT = 30;

export interface UseComposerAstGrepSearchResult {
  /** 给 Composer 菜单使用的条目列表(可能包含 hint/empty) */
  items: ComposerCommandItem[];
  /** 是否正在等待防抖或后端响应 */
  isLoading: boolean;
  /** 后端调用是否失败(网络/解析错误) */
  hasError: boolean;
  /** 当前触发的查询字符串(已 trim,不含 `ast-grep` 前缀) */
  query: string;
}

interface ExtractedAstGrepQuery {
  matches: boolean;
  query: string;
  /** 内部模式: `pattern` (默认) / `node-kind` */
  mode: "pattern" | "node-kind";
}

/**
 * 判断 mention 触发器是否匹配 @ast-grep 模式
 *
 * 支持以下状态:
 * - `@ast-grep` (query === "ast-grep"): 等待用户输入
 * - `@ast-grep<pattern>` (query 以 "ast-grep " 开头): pattern 模式
 * - `@ast-grep kind:<node_kind>`: node-kind 模式
 *
 * 注意:node-kind 模式下,返回的 `query` 字段是 node_kind 本身(effect 会
 * 把 query 当作 `kind` 发到后端)。
 */
function extractAstGrepQuery(trigger: ComposerTrigger | null): ExtractedAstGrepQuery {
  if (!trigger || trigger.kind !== "mention") {
    return { matches: false, query: "", mode: "pattern" };
  }
  const raw = trigger.query.trim();
  if (raw === AST_GREP_TRIGGER) {
    return { matches: true, query: "", mode: "pattern" };
  }
  if (raw.startsWith(AST_GREP_TRIGGER) && raw.length > AST_GREP_TRIGGER.length) {
    const remainder = raw.slice(AST_GREP_TRIGGER.length);
    if (
      remainder.startsWith(" ") ||
      remainder.startsWith("-") ||
      remainder.startsWith("_")
    ) {
      const query = remainder.slice(1).trim();
      // `kind:NodeKind [extra]` 语法: 切换到 node-kind 模式
      const kindMatch = /^kind:\s*(\w+)\s*(.*)$/.exec(query);
      if (kindMatch) {
        // match[1] = node_kind, match[2] = 后面可能的额外内容(目前未用)
        return {
          matches: true,
          query: kindMatch[1] ?? "",
          mode: "node-kind",
        };
      }
      return { matches: true, query, mode: "pattern" };
    }
  }
  return { matches: false, query: "", mode: "pattern" };
}

/**
 * 把后端 AstGrepMatch 数组映射为 ComposerCommandItem 列表
 */
function mapMatchResultsToItems(
  matches: readonly AstGrepMatch[],
  query: string,
  mode: "pattern" | "node-kind",
): ComposerCommandItem[] {
  const trimmed = matches.slice(0, AST_GREP_RESULT_LIMIT);
  return trimmed.map((m, idx) => {
    const snippet = m.text.length > 80 ? `${m.text.slice(0, 80)}…` : m.text;
    const description = mode === "node-kind"
      ? `${m.nodeKind} · ${m.file}:${m.line}`
      : `${m.file}:${m.line} · ${m.nodeKind}`;
    return {
      id: `ast-grep:${idx}:${m.file}:${m.line}`,
      type: "ast-grep-result" as const,
      file: m.file,
      line: m.line,
      kind: m.nodeKind,
      text: m.text,
      label: snippet,
      description,
      context: query,
    } satisfies ComposerCommandItem;
  });
}

/**
 * Composer AST-Grep 搜索 hook
 *
 * @param trigger - 当前 Composer 触发器
 * @param workspaceRoot - 项目根目录(可选)。为 null 时返回 hint
 * @returns 菜单项 + 加载/错误状态
 */
export function useComposerAstGrepSearch(
  trigger: ComposerTrigger | null,
  workspaceRoot: string | null,
): UseComposerAstGrepSearchResult {
  const { matches, query, mode } = extractAstGrepQuery(trigger);
  const [results, setResults] = useState<AstGrepMatch[]>([]);
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
      setResults([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
      setResults([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

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
      // 双路径：astGrepClient 内部根据运行时选择 Tauri 命令或 WebSocket。
      // 这里传统一 `searchAstGrep` 输入即可。
      const searchMode = mode === "node-kind" ? "node-kind" : "pattern";
      void searchAstGrep({
        workspaceRoot,
        mode: searchMode,
        query,
      })
        .then((response) => {
          if (cancelled || !mountedRef.current) return;
          setResults([...response]);
          setIsLoading(false);
        })
        .catch((error) => {
          if (cancelled || !mountedRef.current) return;
          console.error("[composer-ast-grep] search failed:", error);
          setHasError(true);
          setResults([]);
          setIsLoading(false);
        });
    }, AST_GREP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matches, query, mode, workspaceRoot]);

  const items = useMemo<ComposerCommandItem[]>(() => {
    if (!matches) return [];

    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
      return [
        {
          id: "ast-grep-hint:no-root",
          type: "ast-grep-hint",
          label: "打开工作区后可搜索 AST 模式",
          description: "AST-Grep 搜索需要项目根目录",
        } satisfies ComposerCommandItem,
      ];
    }

    if (query.length === 0) {
      return [
        {
          id: "ast-grep-hint:empty-query",
          type: "ast-grep-hint",
          label: "输入 AST 模式搜索代码",
          description: "例如: console.log($MSG) / kind:call_expression",
        } satisfies ComposerCommandItem,
      ];
    }

    // 重要:loading 状态优先于 error/empty,避免闪烁
    if (isLoading) {
      return [
        {
          id: "ast-grep-hint:loading",
          type: "ast-grep-hint",
          label: "搜索 AST-Grep 中…",
          description: "正在检索代码模式",
        } satisfies ComposerCommandItem,
      ];
    }

    if (hasError) {
      return [
        {
          id: "ast-grep-empty:error",
          type: "ast-grep-empty",
          label: "AST-Grep 搜索失败",
          description: "请检查模式语法,或稍后重试",
        } satisfies ComposerCommandItem,
      ];
    }

    if (results.length === 0) {
      return [
        {
          id: "ast-grep-empty:no-results",
          type: "ast-grep-empty",
          label: `未找到与「${query}」匹配的 AST 节点`,
          description: "尝试更换模式,或使用 kind:<node_kind> 语法",
        } satisfies ComposerCommandItem,
      ];
    }

    return mapMatchResultsToItems(results, query, mode);
  }, [matches, workspaceRoot, query, mode, isLoading, hasError, results]);

  return { items, isLoading, hasError, query };
}
