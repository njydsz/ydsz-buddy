/**
 * @file 聊天索引路由模块
 * @description 应用启动时恢复上次聊天路由，若无可用记录则创建新的家庭聊天草稿
 * @layer 路由层
 * @depends sidebar UI 持久化、共享的新建聊天处理器（用于空状态回退）
 */

import { ThreadId } from "@remi-code/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { SplashScreen } from "../components/SplashScreen";
import { readSidebarUiState } from "../components/Sidebar.uiState";
import { resolveRestorableThreadRoute } from "../chatRouteRestore";
import { useHandleNewChat } from "../hooks/useHandleNewChat";
import { useSplitViewStore } from "../splitViewStore";
import { useStore } from "../store";

/**
 * 聊天索引路由视图组件
 * @description 应用启动时的入口路由，负责恢复上次的聊天会话或创建新会话
 * 工作流程：
 * 1. 等待线程和分割视图数据水合完成
 * 2. 尝试从本地存储恢复上次的线程路由
 * 3. 若无法恢复，则创建新的聊天会话
 * 4. 若创建失败，展示错误信息并提供重试按钮
 */
function ChatIndexRouteView() {
  const { handleNewChat } = useHandleNewChat();
  const navigate = useNavigate();
  /** 线程数据是否已从持久化存储加载完成 */
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  /** 所有可用的线程 ID 列表 */
  const threadIds = useStore((state) => state.threadIds ?? []);
  /** 分割视图数据是否已水合 */
  const splitViewsHydrated = useSplitViewStore((state) => state.hasHydrated);
  /** 所有分割视图的映射表 */
  const splitViewsById = useSplitViewStore((state) => state.splitViewsById);
  /** 过滤出有效的分割视图 ID 列表 */
  const splitViewIds = useMemo(
    () => Object.keys(splitViewsById).filter((splitViewId) => splitViewsById[splitViewId]),
    [splitViewsById],
  );
  /** 重试计数器，每次重试时递增以触发 useEffect 重新执行 */
  const [attempt, setAttempt] = useState(0);
  /** 错误信息，用于在启动屏幕展示失败原因 */
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // 等待数据水合完成后再执行恢复逻辑
    if (!threadsHydrated || !splitViewsHydrated) {
      return;
    }

    let cancelled = false;
    setErrorMessage(null);

    void (async () => {
      // 尝试从本地存储恢复上次的线程路由
      const restorableRoute = resolveRestorableThreadRoute({
        lastThreadRoute: readSidebarUiState().lastThreadRoute,
        availableThreadIds: new Set(threadIds),
        availableSplitViewIds: new Set(splitViewIds),
      });
      if (restorableRoute) {
        if (cancelled) {
          return;
        }
        await navigate({
          to: "/$threadId",
          params: { threadId: ThreadId.makeUnsafe(restorableRoute.threadId) },
          replace: true,
          search: () => ({
            splitViewId: restorableRoute.splitViewId,
          }),
        });
        return;
      }

      // 无法恢复时，创建新的聊天会话
      const result = await handleNewChat({ fresh: true });
      if (cancelled || result.ok) {
        return;
      }
      setErrorMessage(result.error);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    attempt,
    handleNewChat,
    navigate,
    splitViewIds,
    splitViewsHydrated,
    threadIds,
    threadsHydrated,
  ]);

  return (
    <SplashScreen
      errorMessage={errorMessage}
      onRetry={errorMessage ? () => setAttempt((value) => value + 1) : null}
    />
  );
}

/**
 * 聊天索引路由定义
 * @description 定义 /_chat/ 路由，作为应用启动时的默认入口
 */
export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
