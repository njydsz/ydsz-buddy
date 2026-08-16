/**
 * @fileoverview 任务完成通知模块
 * @description 将线程完成和需要关注的事件桥接到应用内 Toast 和操作系统通知。
 *               监听线程状态变化,检测新完成的线程、需要用户输入的线程,
 *               以及终端任务状态,并在适当条件下展示 Toast 通知或系统通知。
 * @layer 通知运行时层
 * @exports TaskCompletionNotifications 组件、浏览器通知权限辅助函数
 */

import { ThreadId } from "@ydsz-buddy/contracts";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { toastManager } from "../components/ui/toast";
import { resolveVisibleToastThreadIds } from "../components/ui/toastRouteVisibility";
import { useAppSettings } from "../appSettings";
import { parseDiffRouteSearch } from "../diffRouteSearch";
import { isTauri } from "../env";
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
 * 浏览器通知权限状态类型
 * @description 表示浏览器通知权限的各种可能状态
 */
export type BrowserNotificationPermissionState =
  | NotificationPermission
  | "unsupported"
  | "insecure";

/**
 * 检查浏览器是否支持通知 API
 * @returns 如果支持则返回 true
 */
function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * 读取当前浏览器通知权限状态
 * @returns 权限状态,可能是 'granted'、'denied'、'default'、'unsupported' 或 'insecure'
 *
 * @remarks
 * 浏览器需要安全上下文和用户手势才能请求权限。
 */
export function readBrowserNotificationPermissionState(): BrowserNotificationPermissionState {
  if (typeof window === "undefined") {
    return "unsupported";
  }
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }
  if (!window.isSecureContext) {
    return "insecure";
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  const current = readBrowserNotificationPermissionState();
  if (current === "unsupported" || current === "insecure" || current === "denied") {
    return current;
  }
  if (current === "granted") {
    return current;
  }
  return Notification.requestPermission();
}

/**
 * 检查窗口是否处于前台
 * @returns 如果窗口可见且获得焦点则返回 true
 */
function isWindowForeground(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  return document.visibilityState === "visible" && document.hasFocus();
}

interface ThreadNotificationCopy {
  title: string;
  body: string;
}

// Notification opens are generic thread activations, so they clear splitViewId
// instead of resurrecting a hidden split pairing.
function focusThread(threadId: Thread["id"], navigate: ReturnType<typeof useNavigate>): void {
  void navigate({
    to: "/$threadId",
    params: { threadId },
    search: (previous) => ({ ...previous, splitViewId: undefined }),
  });
}

/**
 * 显示系统线程通知
 * @description 通过桌面桥接或浏览器通知 API 显示系统通知
 * @param copy - 通知文案
 * @param threadId - 关联的线程 ID
 * @param navigate - 导航函数
 * @returns 如果成功显示通知则返回 true
 */
async function showSystemThreadNotification(
  copy: ThreadNotificationCopy,
  threadId: Thread["id"],
  navigate: ReturnType<typeof useNavigate>,
): Promise<boolean> {
  const { body, title } = copy;

  if (window.desktopBridge) {
    const supported = await window.desktopBridge.notifications.isSupported();
    if (!supported) {
      return false;
    }
    return window.desktopBridge.notifications.show({ title, body, silent: false, threadId });
  }

  if (readBrowserNotificationPermissionState() !== "granted") {
    return false;
  }

  const notification = new Notification(title, {
    body,
    tag: `thread-notification:${threadId}`,
  });
  notification.addEventListener("click", () => {
    window.focus();
    focusThread(threadId, navigate);
  });
  return true;
}

/**
 * 显示线程 Toast 通知
 * @description 在应用内显示线程完成的 Toast 提示
 * @param copy - 通知文案
 * @param threadId - 关联的线程 ID
 * @param tone - Toast 类型,'success' 或 'warning'
 * @param navigate - 导航函数
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
      allowCrossThreadVisibility: true,
      threadId,
      dismissAfterVisibleMs: 8000,
    },
    actionProps: {
      children: "Open",
      onClick: () => focusThread(threadId, navigate),
    },
  });
}

/**
 * 任务完成通知组件
 * @description 监听线程和终端状态变化,检测新完成的线程、需要用户输入的线程,
 *              以及终端任务状态,并在适当条件下展示 Toast 通知或系统通知。
 *              该组件不渲染任何 UI,仅作为通知逻辑的运行时。
 * @returns null
 */
export function TaskCompletionNotifications() {
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const activeThreadId = useParams({
    strict: false,
    select: (params) =>
      typeof params.threadId === "string" ? ThreadId.makeUnsafe(params.threadId) : null,
  });
  const routeSearch = useSearch({
    strict: false,
    select: (search) => parseDiffRouteSearch(search),
  });
  const splitView = useSplitViewStore(selectSplitView(routeSearch.splitViewId ?? null));
  const threads = useStore(useRef(createAllThreadsSelector()).current);
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const terminalStateByThreadId = useTerminalStateStore((store) => store.terminalStateByThreadId);
  const visibleThreadIds = useMemo(() => {
    return resolveVisibleToastThreadIds({ activeThreadId, splitView });
  }, [activeThreadId, splitView]);
  const previousThreadsRef = useRef<readonly Thread[]>([]);
  const previousTerminalStateRef = useRef(terminalStateByThreadId);
  const runtimeStartedAtMsRef = useRef(Date.now());
  const readyRef = useRef(false);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      const prefix = "notification-open-thread:";
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

  useEffect(() => {
    if (!threadsHydrated) {
      return;
    }

    if (!readyRef.current) {
      previousThreadsRef.current = threads;
      previousTerminalStateRef.current = terminalStateByThreadId;
      readyRef.current = true;
      return;
    }

    const completions = collectCompletedThreadCandidates(
      previousThreadsRef.current,
      threads,
    ).filter((candidate) =>
      isNotificationRuntimeFreshTimestamp(candidate.completedAt, runtimeStartedAtMsRef.current),
    );
    const terminalCompletions = collectCompletedTerminalCandidates(
      previousTerminalStateRef.current,
      terminalStateByThreadId,
    );
    const inputNeededCandidates = collectInputNeededThreadCandidates(
      previousThreadsRef.current,
      threads,
    ).filter((candidate) =>
      isNotificationRuntimeFreshTimestamp(candidate.createdAt, runtimeStartedAtMsRef.current),
    );
    const terminalAttentionCandidates = collectTerminalAttentionCandidates(
      previousTerminalStateRef.current,
      terminalStateByThreadId,
    );
    previousThreadsRef.current = threads;
    previousTerminalStateRef.current = terminalStateByThreadId;

    if (
      completions.length === 0 &&
      inputNeededCandidates.length === 0 &&
      terminalCompletions.length === 0 &&
      terminalAttentionCandidates.length === 0
    ) {
      return;
    }

    const shouldAttemptSystemNotification =
      settings.enableSystemTaskCompletionNotifications &&
      (window.desktopBridge ? true : !isWindowForeground());

    for (const completion of completions) {
      const copy = buildTaskCompletionCopy(completion);
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

  return null;
}

/**
 * 构建通知设置支持说明文本
 * @description 根据当前通知权限状态生成用户友好的说明文本,
 *              帮助用户理解为什么通知不工作或如何启用通知
 * @param permissionState - 浏览器通知权限状态
 * @returns 说明文本
 */
export function buildNotificationSettingsSupportText(
  permissionState: BrowserNotificationPermissionState,
): string {
  if (isTauri) {
    return "Desktop app notifications use your operating system notification center.";
  }
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
