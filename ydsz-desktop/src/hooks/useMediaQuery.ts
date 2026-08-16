/**
 * @file useMediaQuery.ts
 * @description 媒体查询 Hook - 响应式监听 CSS 媒体查询状态
 * @module hooks/useMediaQuery
 */

import { useCallback, useSyncExternalStore } from "react";

/** 预定义的断点值（像素） */
const BREAKPOINTS = {
  "2xl": 1536,
  "3xl": 1600,
  "4xl": 2000,
  lg: 1024,
  md: 768,
  sm: 640,
  xl: 1280,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

/** 断点查询字符串类型 */
type BreakpointQuery = Breakpoint | `max-${Breakpoint}` | `${Breakpoint}:max-${Breakpoint}`;

/**
 * 解析最小宽度值
 * 
 * @param value - 断点名称或像素值
 * @returns CSS 媒体查询字符串
 */
function resolveMin(value: Breakpoint | number): string {
  const px = typeof value === "number" ? value : BREAKPOINTS[value];
  return `(min-width: ${px}px)`;
}

/**
 * 解析最大宽度值
 * 
 * @param value - 断点名称或像素值
 * @returns CSS 媒体查询字符串
 */
function resolveMax(value: Breakpoint | number): string {
  const px = typeof value === "number" ? value : BREAKPOINTS[value];
  return `(max-width: ${px - 1}px)`;
}

/**
 * 解析媒体查询字符串
 * 
 * @description
 * 支持多种查询格式：
 * - 断点名称：如 "md" 表示最小宽度 768px
 * - 最大断点：如 "max-md" 表示最大宽度 767px
 * - 范围查询：如 "md:max-xl" 表示 768px 到 1279px
 * - 对象格式：如 { min: "md", max: "xl", pointer: "coarse" }
 * - 原生 CSS：如 "(min-width: 768px)"
 * 
 * @param query - 查询字符串或对象
 * @returns 标准化的 CSS 媒体查询字符串
 */
function parseQuery(query: BreakpointQuery | MediaQueryInput | (string & {})): string {
  // 对象格式查询
  if (typeof query !== "string") {
    const parts: string[] = [];
    if (query.min != null) parts.push(resolveMin(query.min));
    if (query.max != null) parts.push(resolveMax(query.max));
    if (query.pointer === "coarse") parts.push("(pointer: coarse)");
    if (query.pointer === "fine") parts.push("(pointer: fine)");
    if (parts.length === 0) return "(min-width: 0px)";
    return parts.join(" and ");
  }

  // 原生 CSS 媒体查询
  if (query.startsWith("(")) return query;

  // 字符串格式查询（断点名称或范围）
  const parts: string[] = [];
  for (const segment of query.split(":")) {
    if (segment.startsWith("max-")) {
      const bp = segment.slice(4);
      if (bp in BREAKPOINTS) parts.push(resolveMax(bp as Breakpoint));
    } else if (segment in BREAKPOINTS) {
      parts.push(resolveMin(segment as Breakpoint));
    }
  }

  return parts.length > 0 ? parts.join(" and ") : query;
}

/**
 * 服务端渲染时的快照函数
 * 
 * @returns 始终返回 false（服务端无法获取媒体查询状态）
 */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * 媒体查询输入对象类型
 */
export type MediaQueryInput = {
  /** 最小宽度（断点名称或像素值） */
  min?: Breakpoint | number;
  /** 最大宽度（断点名称或像素值） */
  max?: Breakpoint | number;
  /** 指针类型：coarse（触摸）或 fine（鼠标/触控板） */
  pointer?: "coarse" | "fine";
};

/**
 * 媒体查询 Hook
 * 
 * @description
 * 响应式监听 CSS 媒体查询状态，支持多种查询格式。
 * 使用 useSyncExternalStore 确保状态与浏览器同步。
 * 
 * @param query - 媒体查询（断点名称、范围字符串、对象或原生 CSS）
 * @returns 是否匹配媒体查询
 * 
 * @example
 * ```tsx
 * // 使用断点名称
 * const isMedium = useMediaQuery("md"); // min-width: 768px
 * 
 * // 使用最大断点
 * const isNotLarge = useMediaQuery("max-lg"); // max-width: 1023px
 * 
 * // 使用范围
 * const isTablet = useMediaQuery("md:max-xl"); // 768px 到 1279px
 * 
 * // 使用对象格式
 * const isTouch = useMediaQuery({ pointer: "coarse" });
 * 
 * // 使用原生 CSS
 * const isCustom = useMediaQuery("(min-width: 800px) and (max-width: 1200px)");
 * ```
 */
export function useMediaQuery(query: BreakpointQuery | MediaQueryInput | (string & {})): boolean {
  const mediaQuery = parseQuery(query);

  /**
   * 订阅媒体查询变化
   */
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(mediaQuery);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [mediaQuery],
  );

  /**
   * 获取当前匹配状态
   */
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(mediaQuery).matches;
  }, [mediaQuery]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 移动端检测 Hook
 * 
 * @description
 * 检测当前是否为移动端视口（最大宽度 767px）
 * 
 * @returns 是否为移动端
 * 
 * @example
 * ```tsx
 * const isMobile = useIsMobile();
 * 
 * if (isMobile) {
 *   return <MobileLayout />;
 * }
 * return <DesktopLayout />;
 * ```
 */
export function useIsMobile(): boolean {
  return useMediaQuery("max-md");
}
