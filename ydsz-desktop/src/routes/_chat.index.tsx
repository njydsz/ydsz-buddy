/**
 * @file 聊天首页路由组件
 * @description 处理应用首页的路由逻辑，包括：
 *   1. 等待线程数据和分屏视图数据加载完成
 *   2. 尝试恢复用户上次访问的对话线程
 *   3. 如果没有可恢复的对话，则创建新的对话线程
 *   4. 在加载过程中显示着陆页骨架屏
 * @layer 路由层
 * @depends sidebar UI 组件, 线程恢复逻辑, 新建对话, 分屏管理, 着陆页组件 */

import { ThreadId } from "~/contracts";
import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { UnifiedLandingPage, type LandingPageMode } from "../components/UnifiedLandingPage";
import { LandingModeSwitcher } from "../components/LandingModeSwitcher";
import { LandingComposer } from "../components/LandingComposer";
import { AppTopChrome } from "../components/AppTopChrome";
import { YdszBuddyWordmark } from "../components/Sidebar";
import { SidebarInset } from "../components/ui/sidebar";
import { SplashScreen } from "../components/SplashScreen";
import { readSidebarUiState } from "../components/Sidebar.uiState";
import { resolveRestorableThreadRoute } from "../chatRouteRestore";
import { useHandleNewChat } from "../hooks/useHandleNewChat";
import { useMessages } from "../i18n/I18nContext";
import { setPendingInitialPrompt } from "../lib/pendingInitialPrompt";
import { useSplitViewStore } from "../splitViewStore";
import { useStore } from "../store";
import { useWorkspaceStore } from "../workspaceStore";
import { toastManager } from "../components/ui/toast";

/**
 * 聊天首页路由视图组件
 * @description 处理聊天首页的渲染逻辑，包括：
 *   1. 等待线程数据和分屏视图数据加载完成
 *   2. 尝试恢复用户上次访问的对话线程
 *   3. 如果没有可恢复的对话，则创建新对话
 *   4. 在加载过程中显示着陆页，出错时显示错误信息 */
function ChatIndexRouteView() {
  const { handleNewChat } = useHandleNewChat();
  const navigate = useNavigate();
  const location = useLocation();
  /** 线程数据是否加载完成 */
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  /** 所有对话线程 ID 列表 */
  const threadIds = useStore((state) => state.threadIds ?? []);
  /** Whether the home directory has been resolved. */
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  /** 分屏视图是否加载完成 */
  const splitViewsHydrated = useSplitViewStore((state) => state.hasHydrated);
  /** 所有分屏视图按 ID 索引 */
  const splitViewsById = useSplitViewStore((state) => state.splitViewsById);
  /** 有效分屏视图 ID 列表 */
  const splitViewIds = useMemo(
    () => Object.keys(splitViewsById).filter((splitViewId) => splitViewsById[splitViewId]),
    [splitViewsById],
  );
  const messages = useMessages();
  /** 重试次数计数器，用于在创建新对话失败后重新尝试 */
  const [attempt, setAttempt] = useState(0);
  /** 创建新对话时的错误信息 */
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** 落地页 composer 的预填 prompt（快捷操作点击时设置） */
  const [landingComposerPrefill, setLandingComposerPrefill] = useState("");
  /** 是否正在从落地页创建线程 */
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  /** Whether the underlying chat thread auto-creation is in flight. */
  const isBooting = !threadsHydrated || !splitViewsHydrated || !homeDir;
  /**
   * Mode used by the default landing page hero. While booting we default to
   * "work" so the user sees a stable, recognizable entry.
   */
  const landingMode: LandingPageMode = location.pathname.startsWith("/workspace")
    ? "code"
    : "work";

  // Work 模式快捷操作 → prompt 模板
  const workQuickActionPrompts: Record<string, string> = useMemo(
    () => ({
      docProcess: messages.landing.quickActionDocProcess + "：",
      dataAnalysis: messages.landing.quickActionDataAnalysis + "：",
      webRead: messages.landing.quickActionWebRead + "：",
      fileManager: messages.landing.quickActionFileManager + "：",
    }),
    [messages.landing],
  );

  useEffect(() => {
    // 等待数据加载完成
    if (!threadsHydrated || !splitViewsHydrated) {
      return;
    }

    let cancelled = false;
    setErrorMessage(null);

    void (async () => {
      // 尝试恢复用户上次访问的对话
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

      // 不再自动创建新线程：显示 Trae 风格的落地页，等待用户输入
    })();

    return () => {
      cancelled = true;
    };
  }, [
    attempt,
    navigate,
    splitViewIds,
    splitViewsHydrated,
    threadIds,
    threadsHydrated,
  ]);

  /** 提交落地页 composer：保存 prompt，创建线程并导航 */
  const handleLandingComposerSubmit = useCallback(
    async (prompt: string) => {
      if (isCreatingThread) {
        return;
      }
      if (!homeDir) {
        toastManager.add({
          type: "error",
          title: "Home folder not ready",
          description: "Please wait a moment and try again.",
        });
        return;
      }
      setIsCreatingThread(true);
      setPendingInitialPrompt(prompt);
      const result = await handleNewChat({ fresh: true });
      setIsCreatingThread(false);
      if (!result.ok) {
        setErrorMessage(result.error);
        setPendingInitialPrompt(null);
      }
    },
    [homeDir, isCreatingThread, handleNewChat],
  );

  /** 快捷操作：预填 composer */
  const handleQuickAction = useCallback(
    (actionId: string) => {
      const prompt = workQuickActionPrompts[actionId];
      if (prompt) {
        setLandingComposerPrefill(prompt);
      }
    },
    [workQuickActionPrompts],
  );

  const composerSection = (
    <LandingComposer
      onSubmit={(prompt) => void handleLandingComposerSubmit(prompt)}
      disabled={isCreatingThread}
      prefilledPrompt={landingComposerPrefill}
      onPrefillConsumed={() => setLandingComposerPrefill("")}
      placeholder="输入你的工作任务，例如整理论文综述、分析 Excel、编写文档、读取网页等"
    />
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <AppTopChrome
          logo={
            <span className="inline-flex size-5 shrink-0 items-center justify-center">
              <YdszBuddyWordmark />
            </span>
          }
          title={<LandingModeSwitcher mode={landingMode} />}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {errorMessage ? (
            <SplashScreen
              errorMessage={errorMessage}
              onRetry={() => setAttempt((value) => value + 1)}
            />
          ) : (
            <UnifiedLandingPage
              mode={landingMode}
              loading={isBooting}
              composerSection={composerSection}
              onQuickAction={handleQuickAction}
            />
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

/**
 * 聊天首页路由定义
 * @description 定义 /_chat/ 路由，渲染聊天首页视图组件
 */
export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
