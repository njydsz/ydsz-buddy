/**
 * @file 应用导航控制
 * @description 管理 TanStack 历史实例和浏览器风格的应用导航控制，
 * 包括前进/后退可用性判断和历史索引追踪。
 * 依赖 TanStack Router 历史和 Tauri 环境标识。
 */

import {
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { isTauri } from "./env";

/** 路由历史实例类型 */
type RouterHistory = ReturnType<typeof createBrowserHistory>;
/** 历史订阅事件类型 */
type HistorySubscriberEvent = Parameters<Parameters<RouterHistory["subscribe"]>[0]>[0];
/** 历史订阅动作类型 */
type HistorySubscriberAction = HistorySubscriberEvent["action"];

/** TanStack Router 用于存储历史索引的 state key */
const HISTORY_STATE_INDEX_KEY = "__TSR_index";

/**
 * 创建应用历史实例
 *
 * @description 根据运行环境选择合适的历史实现：
 * - SSR 环境：使用内存历史
 * - Tauri 桌面端：使用哈希历史（避免文件路径解析问题）
 * - 浏览器端：使用浏览器历史
 */
function createAppHistory(): RouterHistory {
  if (typeof window === "undefined") {
    return createMemoryHistory({ initialEntries: ["/"] });
  }
  // Tauri 从文件支持的 shell 加载应用，哈希历史可避免路径解析问题
  return isTauri ? createHashHistory() : createBrowserHistory();
}

/** 应用全局历史实例 */
export const appHistory: RouterHistory = createAppHistory();

/**
 * 每个历史实例对应的最大索引缓存，
 * 用于判断"前进"按钮是否可用（避免浏览器全局 history.length 误判）。
 */
const appHistoryMaxIndexByHistory = new WeakMap<RouterHistory, number>();

/** 读取当前历史索引，无效时返回 null */
function readCurrentHistoryIndex(history: RouterHistory): number | null {
  const index = history.location.state[HISTORY_STATE_INDEX_KEY];
  return typeof index === "number" && Number.isFinite(index) ? index : null;
}

/** 解析已知的应用历史最大索引，首次访问时初始化为当前索引 */
function resolveKnownAppHistoryMaxIndex(history: RouterHistory, currentIndex: number): number {
  const knownMaxIndex = appHistoryMaxIndexByHistory.get(history);
  if (typeof knownMaxIndex === "number") {
    return knownMaxIndex;
  }

  appHistoryMaxIndexByHistory.set(history, currentIndex);
  return currentIndex;
}

/**
 * 同步应用导航状态
 *
 * @description 记录应用自身创建的最高历史索引，避免浏览器全局 history.length
 * 导致"前进"按钮在应用未创建过前进条目前就显示为可用。
 *
 * @param history - 历史实例，默认为 appHistory
 * @param action - 历史订阅事件的动作类型，用于判断是否为 PUSH 操作
 * @returns 当前导航可用性状态
 */
export function syncAppNavigationState(
  history: RouterHistory = appHistory,
  action?: HistorySubscriberAction,
): AppNavigationState {
  const currentIndex = readCurrentHistoryIndex(history);
  if (currentIndex === null) {
    return {
      canGoBack: history.canGoBack(),
      canGoForward: false,
    };
  }

  const knownMaxIndex = resolveKnownAppHistoryMaxIndex(history, currentIndex);
  const nextMaxIndex =
    action?.type === "PUSH" ? currentIndex : Math.max(knownMaxIndex, currentIndex);
  if (nextMaxIndex !== knownMaxIndex) {
    appHistoryMaxIndexByHistory.set(history, nextMaxIndex);
  }

  return {
    canGoBack: history.canGoBack(),
    canGoForward: currentIndex < nextMaxIndex,
  };
}

/** 应用导航可用性状态 */
export interface AppNavigationState {
  /** 是否可以后退 */
  canGoBack: boolean;
  /** 是否可以前进 */
  canGoForward: boolean;
}

/**
 * 在应用历史中后退一步
 *
 * @description 先刷新 TanStack 排队的 URL 写入，再执行后退操作，
 * 确保快速连续点击前进/后退时与内存中的最新路由对齐。
 *
 * @param history - 历史实例，默认为 appHistory
 */
export function goBackInAppHistory(history: RouterHistory = appHistory): void {
  history.flush();
  history.back();
}

/**
 * 在应用历史中前进一步
 *
 * @param history - 历史实例，默认为 appHistory
 */
export function goForwardInAppHistory(history: RouterHistory = appHistory): void {
  history.flush();
  history.forward();
}

/**
 * 解析当前应用导航可用性状态
 *
 * @description 基于应用自身追踪的历史索引判断前进可用性，
 * 而非依赖浏览器全局 history.length。
 *
 * @param history - 历史实例，默认为 appHistory
 * @returns 当前导航可用性状态
 */
export function resolveAppNavigationState(history: RouterHistory = appHistory): AppNavigationState {
  const currentIndex = readCurrentHistoryIndex(history);
  if (currentIndex === null) {
    return {
      canGoBack: history.canGoBack(),
      canGoForward: false,
    };
  }

  const knownMaxIndex = resolveKnownAppHistoryMaxIndex(history, currentIndex);
  return {
    canGoBack: history.canGoBack(),
    canGoForward: currentIndex < knownMaxIndex,
  };
}

/**
 * React Hook：订阅应用导航状态
 *
 * @description 监听历史实例的变化，实时更新前进/后退按钮的可用性。
 * 组件挂载时立即获取当前状态，卸载时自动取消订阅。
 *
 * @returns 当前导航可用性状态
 */
export function useAppNavigationState(): AppNavigationState {
  const [navigationState, setNavigationState] = useState(() => resolveAppNavigationState());

  useEffect(() => {
    const updateNavigationState = (event?: HistorySubscriberEvent) =>
      setNavigationState(syncAppNavigationState(appHistory, event?.action));
    const unsubscribe = appHistory.subscribe(updateNavigationState);
    updateNavigationState();
    return unsubscribe;
  }, []);

  return navigationState;
}
