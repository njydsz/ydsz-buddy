/**
 * @file Composer Browser 标签页 Pick Hook
 *
 * 当 Composer 中识别到 `@browser` 触发器时,从后端
 * `browser_get_state` 拉取当前线程的标签页列表,并映射为
 * `ComposerCommandItem` 列表。
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: 仅在 `composerTrigger.kind === "mention"` 且
 *    query 以 `browser` 开头时启用。
 * 2. **防抖拉取**: 使用 250ms 防抖,避免用户连续按键时频繁调用后端。
 * 3. **结果上限**: 限制最多返回 20 个 tab,避免菜单过长。
 * 4. **状态降级**: 没有 threadId / 没有结果时,返回 hint/empty。
 * 5. **错误降级**: 后端调用失败时返回 browser-empty 提示。
 * 6. **活动 tab 优先**: `is_active` 为 true 的标签排在最前。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 触发器下拉取 browser 结果
 * - ChatView 主动传入当前 threadId,确保只显示该线程的标签页
 *
 * ## 注意事项
 *
 * - 切换线程时需重新拉取;hook 通过 threadId 作为 effect 依赖实现
 * - 没有 threadId(尚未绑定线程)时,直接返回 hint 引导
 * - 选中 browser-result 后由 ChatView 负责把 `tabId` 写入 selectedComposerMentions
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import type { ComposerTrigger } from "../composer-logic";
import type { ThreadBrowserState } from "~/contracts";

/** 触发字符串(不含 `@` 前缀) */
const BROWSER_TRIGGER = "browser";

/** 防抖延迟(毫秒) */
const BROWSER_DEBOUNCE_MS = 250;

/** 标签页结果上限,避免菜单过长 */
const BROWSER_RESULT_LIMIT = 20;

export interface UseComposerBrowserPickResult {
  items: ComposerCommandItem[];
  isLoading: boolean;
  hasError: boolean;
  query: string;
}

interface ExtractedBrowserQuery {
  matches: boolean;
  query: string;
}

/**
 * 判断 mention 触发器是否匹配 @browser 模式
 *
 * - `@browser` (query === "browser"): 列出所有 tab,等待用户输入
 * - `@browser <keywords>` (query 以 "browser " 开头): 按关键词过滤
 */
function extractBrowserQuery(trigger: ComposerTrigger | null): ExtractedBrowserQuery {
  if (!trigger || trigger.kind !== "mention") {
    return { matches: false, query: "" };
  }
  const raw = trigger.query.trim();
  if (raw === BROWSER_TRIGGER) {
    return { matches: true, query: "" };
  }
  if (raw.startsWith(BROWSER_TRIGGER) && raw.length > BROWSER_TRIGGER.length) {
    const remainder = raw.slice(BROWSER_TRIGGER.length);
    // 只在 `browser` 后跟空格时认定为 @browser 触发器(避免与
    // `browser-foo` 等更长的别名冲突)
    if (remainder.startsWith(" ")) {
      return { matches: true, query: remainder.slice(1).trim() };
    }
  }
  return { matches: false, query: "" };
}

/**
 * URL 安全显示:去掉 query 参数过长部分,保留 host + path
 */
function shortenUrl(url: string): string {
  if (url.length <= 60) return url;
  return `${url.slice(0, 57)}…`;
}

/**
 * 按关键词过滤标签页(命中 title / url,大小写不敏感)
 */
function filterTabs(
  tabs: ThreadBrowserState["tabs"],
  keyword: string,
): ThreadBrowserState["tabs"] {
  if (!keyword) return [...tabs];
  const lowered = keyword.toLowerCase();
  return tabs.filter((tab) => {
    return (
      tab.title.toLowerCase().includes(lowered) ||
      tab.url.toLowerCase().includes(lowered)
    );
  });
}

/**
 * 把 ThreadBrowserState.tabs 映射为 ComposerCommandItem 列表
 */
function mapTabsToItems(
  tabs: ThreadBrowserState["tabs"],
  activeTabId: string | null,
): ComposerCommandItem[] {
  // 活动 tab 排在最前
  const sorted = [...tabs].sort((a, b) => {
    if (a.id === activeTabId) return -1;
    if (b.id === activeTabId) return 1;
    return 0;
  });
  const limited = sorted.slice(0, BROWSER_RESULT_LIMIT);
  return limited.map((tab) => ({
    id: `browser-result:${tab.id}`,
    type: "browser-result" as const,
    tabId: tab.id,
    title: tab.title || tab.url || tab.id,
    url: tab.url,
    active: tab.id === activeTabId,
    label: tab.title || shortenUrl(tab.url) || tab.id,
    description: tab.id === activeTabId
      ? `活动 · ${shortenUrl(tab.url)}`
      : shortenUrl(tab.url),
  }));
}

/**
 * Composer Browser 标签页 Pick hook
 *
 * @param trigger - 当前 Composer 触发器
 * @param threadId - 当前线程 ID(可选,无线程时返回 hint 引导)
 */
export function useComposerBrowserPick(
  trigger: ComposerTrigger | null,
  threadId: string | null,
): UseComposerBrowserPickResult {
  const { matches, query } = extractBrowserQuery(trigger);
  const [tabs, setTabs] = useState<ThreadBrowserState["tabs"]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
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
      setTabs([]);
      setActiveTabId(null);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    if (!threadId || threadId.trim().length === 0) {
      setTabs([]);
      setActiveTabId(null);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    const timer = setTimeout(() => {
      void invoke<ThreadBrowserState>("browser_get_state", {
        input: { threadId },
      })
        .then((response) => {
          if (cancelled || !mountedRef.current) return;
          setTabs(response.tabs ?? []);
          setActiveTabId(response.activeTabId ?? null);
          setIsLoading(false);
        })
        .catch((error) => {
          if (cancelled || !mountedRef.current) return;
          // eslint-disable-next-line no-console
          console.warn("[useComposerBrowserPick] browser_get_state 失败", error);
          setHasError(true);
          setTabs([]);
          setActiveTabId(null);
          setIsLoading(false);
        });
    }, BROWSER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matches, threadId]);

  const items = useMemo<ComposerCommandItem[]>(() => {
    if (!matches) return [];

    if (!threadId || threadId.trim().length === 0) {
      return [
        {
          id: "browser-hint:no-thread",
          type: "browser-hint",
          label: "未绑定线程,无法显示标签页",
          description: "请先在对话中创建/选择线程",
        } satisfies ComposerCommandItem,
      ];
    }

    // loading 优先于其他状态,避免闪烁
    if (isLoading) {
      return [
        {
          id: "browser-hint:loading",
          type: "browser-hint",
          label: "加载浏览器标签页中…",
          description: "正在拉取当前线程的标签页",
        } satisfies ComposerCommandItem,
      ];
    }

    if (hasError) {
      return [
        {
          id: "browser-empty:error",
          type: "browser-empty",
          label: "加载浏览器标签页失败",
          description: "请检查后端日志,或稍后重试",
        } satisfies ComposerCommandItem,
      ];
    }

    const filtered = filterTabs(tabs, query);

    if (filtered.length === 0) {
      if (query) {
        return [
          {
            id: `browser-empty:no-match:${query}`,
            type: "browser-empty",
            label: `未找到与「${query}」匹配的标签页`,
            description: "尝试更换关键词,或清空 query 列出全部",
          } satisfies ComposerCommandItem,
        ];
      }
      return [
        {
          id: "browser-empty:no-tabs",
          type: "browser-empty",
          label: "当前线程没有打开的标签页",
          description: "在浏览器面板中新建一个 tab 后再试",
        } satisfies ComposerCommandItem,
      ];
    }

    return mapTabsToItems(filtered, activeTabId);
  }, [matches, threadId, isLoading, hasError, tabs, query, activeTabId]);

  return { items, isLoading, hasError, query };
}
