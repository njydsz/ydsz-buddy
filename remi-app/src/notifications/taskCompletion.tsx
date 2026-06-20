/**
 * @file taskCompletion.tsx
 * @description 线程完成与需关注事件的桥接层，负责将线程/终端的完成和需关注状态
 * 转化为应用内 Toast 提示和操作系统通知。
 * 本模块为通知运行时层，依赖 taskCompletion.logic.ts 中的纯逻辑函数。
 */

import { ThreadId } from "@remi-code/contracts";
import { tauriBridge } from "../lib/tauri-bridge";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { toastManager } from "../components/ui/toast";
import { resolveVisibleToastThreadIds } from "../components/ui/toastRouteVisibility";
import { useAppSettings } from "../appSettings";
import { parseDiffRouteSearch } from "../diffRouteSearch";
import { isDesktop } from "../env";
import { selectSplitView, useSplitViewStore } from "../splitViewStore";
import { useStore } from "../store";
import { createAllThreadsSelector } from "../storeSelectors";
import { useTerminalStateStore } from "../terminalStateStore";
import type { Thread } from "../types";
import {
  buildTerminalAttentionCopy,
  buildTerminalCompletionCopy,
  buildInputNeededCopy,
  buildTaskCompletionCopy,
  collectCompletedThreadCandidates,
  collectCompletedTerminalCandidates,
  collectInputNeededThreadCandidates,
  collectTerminalAttentionCandidates,
  isNotificationRuntimeFreshTimestamp,
  shouldShowThreadNotificationToast,
} from "./taskCompletion.logic";

/**
 * 浏览器通知权限状态类型。
 * 扩展了标准的 NotificationPermission，增加了 "unsupported"（不支持）和 "insecure"（非安全上下文）两种状态。
 */
export type BrowserNotificationPermissionState =
  | NotificationPermission
  | "unsupported"
  | "insecure";

/**
 * 检测当前环境是否支持浏览器通知 API。
 *
 * @returns 若浏览器支持 Notification API 则返回 true
 */
function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * 读取当前浏览器通知权限状态。
 * 浏览器要求安全上下文（HTTPS 或 localhost）才能使用通知功能。
 *
 * @returns 当前通知权限状态：
 *          - "granted"：已授权
 *          - "denied"：已拒绝
 *          - "default"：未决定（可请求授权）
 *          - "unsupported"：浏览器不支持
 *          - "insecure"：非安全上下文（如 HTTP 环境）
 */
export function readBrowserNotificationPermissionState(): BrowserNotificationPermissionState {
  if (typeof window === "undefined") {
    return "unsupported";
  }
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }
  // 非安全上下文（如纯 HTTP 环境）不支持通知
  if (!window.isSecureContext) {
    return "insecure";
  }
  return Notification.permission;
}

/**
 * 请求浏览器通知权限。
 * 若当前状态已确定（不支持、非安全、已拒绝、已授权），则直接返回当前状态；
 * 否则调用浏览器原生权限请求弹窗。
 *
 * @returns 请求后的通知权限状态
 */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  const current = readBrowserNotificationPermissionState();
  // 已确定状态无需再次请求
  if (current === "unsupported" || current === "insecure" || current === "denied") {
    return current;
  }
  if (current === "granted") {
    return current;
  }
  // 调用浏览器原生权限请求弹窗
  return Notification.requestPermission();
}

/**
 * 判断当前应用窗口是否处于前台（可见且有焦点）。
 * 用于决定是否应显示系统通知（后台时才显示）。
 *
 * @returns 若窗口处于前台可见状态则返回 true
 */
function isWindowForeground(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * 线程通知文案接口，包含标题和正文。
 */
interface ThreadNotificationCopy {
  /** 通知标题 */
  title: string;
  /** 通知正文内容 */
  body: string;
}

/**
 * 聚焦到指定线程，跳转到线程详情页。
 * 通知点击时的导航行为是通用的线程激活，因此会清除 splitViewId，
 * 避免恢复之前隐藏的拆分视图配对。
 *
 * @param threadId - 目标线程 ID
 * @param navigate - TanStack Router 的导航函数
 */
function focusThread(threadId: Thread["id"], navigate: ReturnType<typeof useNavigate>): void {
  void navigate({
    to: "/$threadId",
    params: { threadId },
    // 清除 splitViewId，避免恢复隐藏的拆分视图
    search: (previous) => ({ ...previous, splitViewId: undefined }),
  });
}

/**
 * 显示操作系统级别的线程通知。
 * 优先使用 Tauri 桌面端通知，若不可用则降级为浏览器原生 Notification。
 *
 * @param copy - 通知文案（标题和正文）
 * @param threadId - 关联的线程 ID，用于通知去重和点击跳转
 * @param navigate - TanStack Router 的导航函数，用于通知点击后跳转
 * @returns 若成功显示通知则返回 true，否则返回 false
 */
async function showSystemThreadNotification(
  copy: ThreadNotificationCopy,
  threadId: Thread["id"],
  navigate: ReturnType<typeof useNavigate>,
): Promise<boolean> {
  const { body, title } = copy;

  // 优先使用 Tauri 桌面端通知能力
  if (tauriBridge) {
    const supported = await tauriBridge.notifications.isSupported();
    if (!supported) {
      return false;
    }
    return tauriBridge.notifications.show({ title, body, silent: false, threadId });
  }

  // 降级为浏览器原生通知，需先确认权限已授予
  if (readBrowserNotificationPermissionState() !== "granted") {
    return false;
  }

  const notification = new Notification(title, {
    body,
    // 使用 tag 实现通知去重，同一线程只显示最新的一条通知
    tag: `thread-notification:${threadId}`,
  });
  // 点击通知时聚焦窗口并跳转到对应线程
  notification.addEventListener("click", () => {
    window.focus();
    focusThread(threadId, navigate);
  });
  return true;
}

/**
 * 显示应用内 Toast 提示。
 * 用于在应用界面内展示轻量级通知消息。
 *
 * @param copy - 通知文案（标题和正文）
 * @param threadId - 关联的线程 ID，用于 Toast 可见性控制和点击跳转
 * @param tone - Toast 风格："success"（成功/完成）或 "warning"（警告/需关注）
 * @param navigate - TanStack Router 的导航函数，用于 Toast 操作按钮点击后跳转
 */
function showThreadToast(
  copy: ThreadNotificationCopy,
  threadId: Thread["id"],
  tone: "success" | "warning",
  navigate: ReturnType<typeof useNavigate>,
): void {
  const { body, title } = copy;
  toastManager.add({
    type: tone,
    title,
    description: body,
    data: {
      // 允许跨线程显示，即使当前在其他线程页面也能看到此 Toast
      allowCrossThreadVisibility: true,
      threadId,
      // 当线程变为可见后 8 秒自动消失
      dismissAfterVisibleMs: 8000,
    },
    actionProps: {
      children: "Open",
      onClick: () => focusThread(threadId, navigate),
    },
  });
}

/**
 * 任务完成通知组件。
 * 监听线程和终端状态变化，在任务完成或需要用户关注时触发 Toast 和系统通知。
 * 该组件不渲染任何 UI 元素（返回 null），仅作为副作用组件运行。
 *
 * 功能包括：
 * 1. 检测线程任务完成事件，显示完成通知
 * 2. 检测终端任务完成事件，显示完成通知
 * 3. 检测线程需要用户输入/审批的事件，显示警告通知
 * 4. 检测终端需要用户关注的事件，显示警告通知
 * 5. 监听 Tauri 菜单操作，支持从系统通知点击跳转到对应线程
 *
 * @returns null（不渲染任何 UI）
 */
export function TaskCompletionNotifications() {
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  // 获取当前路由中的活动线程 ID
  const activeThreadId = useParams({
    strict: false,
    select: (params) =>
      typeof params.threadId === "string" ? ThreadId.makeUnsafe(params.threadId) : null,
  });
  // 获取路由查询参数（用于解析拆分视图 ID）
  const routeSearch = useSearch({
    strict: false,
    select: (search) => parseDiffRouteSearch(search),
  });
  // 获取当前拆分视图状态
  const splitView = useSplitViewStore(selectSplitView(routeSearch.splitViewId ?? null));
  // 获取所有线程数据，使用 ref 缓存选择器以避免不必要的重渲染
  const threads = useStore(useRef(createAllThreadsSelector()).current);
  // 线程数据是否已完成水合（hydration）
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  // 获取各线程下的终端状态映射
  const terminalStateByThreadId = useTerminalStateStore((store) => store.terminalStateByThreadId);
  // 计算当前可见的线程 ID 集合，用于判断是否应显示通知
  const visibleThreadIds = useMemo(() => {
    return resolveVisibleToastThreadIds({ activeThreadId, splitView });
  }, [activeThreadId, splitView]);
  // 存储上一次快照的线程数据，用于对比检测状态变化
  const previousThreadsRef = useRef<readonly Thread[]>([]);
  // 存储上一次快照的终端状态，用于对比检测状态变化
  const previousTerminalStateRef = useRef(terminalStateByThreadId);
  // 记录通知运行时的启动时间，用于过滤水合阶段的历史事件
  const runtimeStartedAtMsRef = useRef(Date.now());
  // 标记组件是否已就绪（跳过首次渲染的状态检测）
  const readyRef = useRef(false);

  // 监听 Tauri 菜单操作事件，处理从系统通知点击跳转到线程的行为
  useEffect(() => {
    const onMenuAction = tauriBridge.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      const prefix = "notification-open-thread:";
      // 仅处理通知打开线程的操作
      if (!action.startsWith(prefix)) {
        return;
      }
      const threadId = action.slice(prefix.length).trim();
      if (threadId.length === 0) {
        return;
      }
      focusThread(threadId as Thread["id"], navigate);
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  // 核心通知逻辑：监听线程和终端状态变化，触发相应通知
  useEffect(() => {
    // 线程数据未完成水合前不处理
    if (!threadsHydrated) {
      return;
    }

    // 首次就绪时仅记录快照，不触发通知（避免水合数据产生误报）
    if (!readyRef.current) {
      previousThreadsRef.current = threads;
      previousTerminalStateRef.current = terminalStateByThreadId;
      readyRef.current = true;
      return;
    }

    // 收集新产生的已完成线程候选项，并过滤掉水合阶段的历史事件
    const completions = collectCompletedThreadCandidates(
      previousThreadsRef.current,
      threads,
    ).filter((candidate) =>
      isNotificationRuntimeFreshTimestamp(candidate.completedAt, runtimeStartedAtMsRef.current),
    );
    // 收集新产生的已完成终端任务候选项
    const terminalCompletions = collectCompletedTerminalCandidates(
      previousTerminalStateRef.current,
      terminalStateByThreadId,
    );
    // 收集新产生的需要用户输入的线程候选项，并过滤掉水合阶段的历史事件
    const inputNeededCandidates = collectInputNeededThreadCandidates(
      previousThreadsRef.current,
      threads,
    ).filter((candidate) =>
      isNotificationRuntimeFreshTimestamp(candidate.createdAt, runtimeStartedAtMsRef.current),
    );
    // 收集新产生的需要用户关注的终端候选项
    const terminalAttentionCandidates = collectTerminalAttentionCandidates(
      previousTerminalStateRef.current,
      terminalStateByThreadId,
    );
    // 更新快照为当前状态，供下次对比使用
    previousThreadsRef.current = threads;
    previousTerminalStateRef.current = terminalStateByThreadId;

    // 若无任何通知候选项，直接返回
    if (
      completions.length === 0 &&
      inputNeededCandidates.length === 0 &&
      terminalCompletions.length === 0 &&
      terminalAttentionCandidates.length === 0
    ) {
      return;
    }

    // 判断是否应尝试显示系统通知：
    // 1. 用户已开启系统通知设置
    // 2. 桌面端始终尝试，Web 端仅在窗口处于后台时尝试
    const shouldAttemptSystemNotification =
      settings.enableSystemTaskCompletionNotifications &&
      (tauriBridge ? true : !isWindowForeground());

    // 处理线程任务完成通知
    for (const completion of completions) {
      const copy = buildTaskCompletionCopy(completion);
      // 若用户开启 Toast 设置且线程当前不可见，则显示 Toast
      if (
        settings.enableTaskCompletionToasts &&
        shouldShowThreadNotificationToast({
          threadId: completion.threadId,
          visibleThreadIds,
        })
      ) {
        showThreadToast(copy, completion.threadId, "success", navigate);
      }

      // 尝试显示系统级通知
      if (shouldAttemptSystemNotification) {
        void showSystemThreadNotification(copy, completion.threadId, navigate);
      }
    }

    // 处理线程需要用户输入的通知
    for (const candidate of inputNeededCandidates) {
      const copy = buildInputNeededCopy(candidate);
      if (
        settings.enableTaskCompletionToasts &&
        shouldShowThreadNotificationToast({
          threadId: candidate.threadId,
          visibleThreadIds,
        })
      ) {
        showThreadToast(copy, candidate.threadId, "warning", navigate);
      }

      if (shouldAttemptSystemNotification) {
        void showSystemThreadNotification(copy, candidate.threadId, navigate);
      }
    }

    // 处理终端任务完成通知
    for (const completion of terminalCompletions) {
      const copy = buildTerminalCompletionCopy(completion);
      if (
        settings.enableTaskCompletionToasts &&
        shouldShowThreadNotificationToast({
          threadId: completion.threadId,
          visibleThreadIds,
        })
      ) {
        showThreadToast(copy, completion.threadId, "success", navigate);
      }

      if (shouldAttemptSystemNotification) {
        void showSystemThreadNotification(copy, completion.threadId, navigate);
      }
    }

    // 处理终端需要用户关注的通知
    for (const candidate of terminalAttentionCandidates) {
      const copy = buildTerminalAttentionCopy(candidate);
      if (
        settings.enableTaskCompletionToasts &&
        shouldShowThreadNotificationToast({
          threadId: candidate.threadId,
          visibleThreadIds,
        })
      ) {
        showThreadToast(copy, candidate.threadId, "warning", navigate);
      }

      if (shouldAttemptSystemNotification) {
        void showSystemThreadNotification(copy, candidate.threadId, navigate);
      }
    }
  }, [
    navigate,
    settings.enableSystemTaskCompletionNotifications,
    settings.enableTaskCompletionToasts,
    terminalStateByThreadId,
    threads,
    threadsHydrated,
    visibleThreadIds,
  ]);

  // 该组件不渲染任何 UI，仅作为副作用组件运行
  return null;
}

/**
 * 构建通知设置的支持说明文本。
 * 根据运行环境和浏览器权限状态返回对应的提示文案，用于设置界面展示。
 *
 * @param permissionState - 当前浏览器通知权限状态
 * @returns 人类可读的通知设置说明文本
 */
export function buildNotificationSettingsSupportText(
  permissionState: BrowserNotificationPermissionState,
): string {
  // 桌面端使用系统通知中心
  if (isDesktop) {
    return "Desktop app notifications use your operating system notification center.";
  }
  // Web 端根据权限状态返回对应提示
  switch (permissionState) {
    case "granted":
      return "Browser notifications are enabled for this app.";
    case "denied":
      return "Browser notifications are blocked. Re-enable them in your browser site settings.";
    case "insecure":
      return "Browser notifications need a secure context. Localhost works; plain HTTP does not.";
    case "unsupported":
      return "This browser does not support desktop notifications.";
    case "default":
      return "Allow browser notifications to get alerts when chats or terminal agents finish or need input in the background.";
  }
}
