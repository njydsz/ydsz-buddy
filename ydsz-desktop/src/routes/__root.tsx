/**
 * @file 应用根路由模块
 * @description 应用的主入口路由，负责全局布局、事件路由、Provider 更新通知和桌面项目引导。
 *   包含以下核心功能：
 *   1. 全局布局组件（Toast、快捷键对话框、新功能提示）
 *   2. WebSocket/Native API 事件路由处理（Shell/Thread 快照和事件流）
 *   3. Provider 更新通知（版本过期提示和批量更新）
 *   4. 桌面项目自举和恢复
 *   5. 全局错误边界
 * @layer 路由层
 * @depends QueryClient, NativeApi, WebSocket 事件处理, Store 状态管理
 */

import {
  PROVIDER_DISPLAY_NAMES,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamEvent,
  type OrchestrationThread,
  type ServerConfig,
  type ServerProviderStatus,
} from "@ydsz-buddy/contracts";
import { defaultTerminalTitleForCliKind } from "@njydsz/shared/terminalThreads";
import {
  Outlet,
  createRootRouteWithContext,
  type ErrorComponentProps,
  useNavigate,
  useParams,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { Throttler } from "@tanstack/react-pacer";

import { APP_DISPLAY_NAME } from "../branding";
import { MESSAGES } from "../i18n/messages";
import { DEFAULT_LANGUAGE } from "../i18n/language";
import ShortcutsDialog from "../components/ShortcutsDialog";
import WhatsNewDialog from "../components/WhatsNewDialog";
import { WindowCaptionButtons } from "../components/WindowCaptionButtons";
import { SplashScreen } from "../components/SplashScreen";
import { CrashRecoveryHost } from "../components/CrashRecoveryHost";
import { SandboxAccessGuardHost } from "../components/SandboxAccessGuardHost";
import { useWhatsNew } from "../whatsNew/useWhatsNew";
import { WhatsNewPopoutCard } from "../whatsNew/WhatsNewPopoutCard";
import { shouldRenderTerminalWorkspace } from "../components/ChatView.logic";
import { Button } from "../components/ui/button";
import { AnchoredToastProvider, ToastProvider, toastManager } from "../components/ui/toast";
import { resolveAndPersistPreferredEditor } from "../editorPreferences";
import { isTauri, isDesktopDevMinimalHooks } from "../env";
import { useFocusedChatContext } from "../focusedChatContext";
import { isTerminalFocused } from "../lib/terminalFocus";
import {
  serverConfigQueryOptions,
  serverQueryKeys,
  serverSettingsQueryOptions,
} from "../lib/serverReactQuery";
import { ensureNativeApi, readNativeApi } from "../nativeApi";
import {
  finalizePromotedDraftThreads,
  markPromotedDraftThreads,
  useComposerDraftStore,
} from "../composerDraftStore";
import { useStore } from "../store";
import { useMessages } from "../i18n";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { terminalActivityFromEvent } from "../terminalActivity";
import {
  onServerConfigUpdated,
  onServerProviderStatusesUpdated,
  onServerSettingsUpdated,
  onServerWelcome,
} from "../wsNativeApi";
import { providerQueryKeys } from "../lib/providerReactQuery";
import { projectQueryKeys } from "../lib/projectReactQuery";
import { collectActiveTerminalThreadIds } from "../lib/terminalStateCleanup";
import { TaskCompletionNotifications } from "../notifications/taskCompletion";
import { useWorkspaceStore, workspaceThreadId } from "../workspaceStore";
import {
  subscribeRetainedThreadDetailIdChanges,
  useRetainedThreadDetailIds,
} from "../threadDetailSubscriptionRetention";
import { useAppTypography } from "../hooks/useAppTypography";
import { useChatCodeFont } from "../hooks/useChatCodeFont";
import { useFontSizeScale } from "../hooks/useFontSizeScale";
import { useFrameRateMonitor, PerformanceSuggestionDialog } from "../hooks/useFrameRateMonitor";
import { useHighContrastDetection } from "../hooks/useHighContrastDetection";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useTheme } from "../hooks/useTheme";
import { useUIFont } from "../hooks/useUIFont";
import { useNativeFontSmoothing } from "../hooks/useNativeFontSmoothing";
import { installAppearanceStorageBridge } from "../shared/appearanceStore";
import { useBootProgressStore, inferBootStageErrorType } from "../shared/bootProgressStore";
import { invalidateGitQueries, invalidateGitQueriesForCwds } from "../lib/gitReactQuery";
import { hasLiveThreadsWithMissingProjects } from "../lib/desktopProjectRecovery";
import { parseDiffRouteSearch } from "../diffRouteSearch";
import { resolveSplitViewThreadIds, selectSplitView, useSplitViewStore } from "../splitViewStore";
import { providerDiscoveryQueryKeys } from "../lib/providerDiscoveryReactQuery";
import { useAppSettings } from "../appSettings";
import { I18nProvider } from "../i18n";
import { AutoProviderFailoverProvider } from "../hooks/useAutoProviderFailover";
import { DEFAULT_PROVIDER_ORDER } from "../providerOrdering";
import { useThreadTurnUsageRecorder } from "../hooks/useThreadTurnUsageRecorder";
import { IdleLockGate } from "../components/IdleLockGate";
import { TermsAcceptanceGate } from "../components/TermsAcceptanceGate";
import { BudgetAlertBanner } from "../components/BudgetAlertBanner";
import {
  coalesceOrchestrationUiEvents,
  shouldFlushDomainEventImmediately,
  isThreadDetailEventForThread,
  shouldPollThreadDetailCatchup,
} from "./EventRouter.helpers";

import {
  getGitInvalidationThreadIdForEvent,
  resolveGitInvalidationCwdForThreadId,
  shouldInvalidateGitQueriesForEvent,
  shouldInvalidateProviderQueriesForEvent,
} from "./-rootEventInvalidation";
// P1-6: Linear API Key 持久化 —— 启动时从 OS Keyring 恢复 API Key 到后端 store
import { loadLinearCredentialsOnBoot } from "../components/LinearTaskBrowser";
// P1-2: Push 通道凭证持久化 —— 启动时从 OS Keyring 恢复凭证到 dispatcher
import { loadPushCredentialsOnBoot } from "../components/PushChannelPanel";

const SHELL_SNAPSHOT_BOOTSTRAP_FALLBACK_DELAY_MS = 1_500;
const THREAD_DETAIL_CATCHUP_INTERVAL_MS = 1_500;
const seenProviderUpdateNotificationKeys = new Set<string>();

function shellThreadHasStarted(thread: OrchestrationShellSnapshot["threads"][number]): boolean {
  return thread.latestTurn !== null || thread.session !== null;
}

function detailThreadHasStarted(thread: OrchestrationThread): boolean {
  return shellThreadHasStarted(thread) || thread.messages.length > 0;
}

function reconcilePromotedDraftsFromShellThreads(
  threads: ReadonlyArray<OrchestrationShellSnapshot["threads"][number]>,
): void {
  markPromotedDraftThreads(new Set(threads.map((thread) => thread.id)));
  finalizePromotedDraftThreads(
    new Set(threads.filter((thread) => shellThreadHasStarted(thread)).map((thread) => thread.id)),
  );
}

function reconcilePromotedDraftFromThreadDetail(thread: OrchestrationThread): void {
  markPromotedDraftThreads(new Set([thread.id]));
  if (detailThreadHasStarted(thread)) {
    finalizePromotedDraftThreads(new Set([thread.id]));
  }
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootRouteView,
  errorComponent: RootRouteErrorView,
  head: () => ({
    meta: [{ name: "title", content: APP_DISPLAY_NAME }],
  }),
});

/**
 * 开发环境渲染诊断 hook。
 * 仅在 DEV 模式下执行渲染计数和性能诊断,生产构建中被 tree-shake。
 */
function useDevRenderDiagnostics(label: string): void {
  if (!import.meta.env.DEV || isTauri) return;
  const renderCountRef = useRef(0);
  const renderTimesRef = useRef<number[]>([]);
  renderCountRef.current++;
  const now = performance.now();
  renderTimesRef.current.push(now);
  while (renderTimesRef.current.length > 0 && now - renderTimesRef.current[0]! > 1000) {
    renderTimesRef.current.shift();
  }
  if (typeof window !== "undefined") {
    const w = window as unknown as {
      __ydszBuddyRenderCount?: number;
      __ydszBuddyRenderTimes?: number[];
    };
    w.__ydszBuddyRenderCount = renderCountRef.current;
    w.__ydszBuddyRenderTimes = renderTimesRef.current;
  }
  if (renderCountRef.current % 30 === 0 && renderTimesRef.current.length > 30) {
    console.warn(
      `[${label}] rendering rapidly: ${renderTimesRef.current.length} renders in last 1s (total #${renderCountRef.current})`,
    );
  }
  const dbg =
    typeof window !== "undefined"
      ? (window as unknown as { __ydszDbg?: (m: string, d?: Record<string, unknown>) => void }).__ydszDbg
      : undefined;
  dbg?.(`${label} render #${renderCountRef.current}`, {
    recent1s: renderTimesRef.current.length,
  });
}

function RootRouteView() {
  useDevRenderDiagnostics("RootRouteView");
  // 桌面端性能调试开关:Tauri dev 模式下默认开启 minimal mode(跳过
  // IdleLockGate + useFrameRateMonitor),这两个组件每秒触发 setState/定时器
  // 在 WebView2 dev 模式下会抢占主线程导致整个 UI 卡死。浏览器端保持原行为。
  // - ?__ydszMin=1 强制开启
  // - window.__ydszMinForce = false 强制关闭(用于在 DevTools 临时恢复完整功能)
  // - 桌面端 release 模式不受影响,保留离座锁定等核心功能
  const _minimalHooks = isDesktopDevMinimalHooks;

  useAppTypography();
  useChatCodeFont();
  useFontSizeScale();
  useHighContrastDetection();
  useReducedMotion();
  useNativeFontSmoothing();
  useTheme();
  useUIFont();
  // 安装跨标签页 storage 桥接,实现多 tab 间字号/对比度实时联动
  if (typeof window !== "undefined") {
    installAppearanceStorageBridge();
  }
  // 帧率监控用于自动性能降级 + 性能建议弹窗;
  // 性能模式会同步到 <html data-performance-mode> 属性,
  // 全局 CSS 据此切换动画/阴影/模糊等耗能样式。
  // 桌面端 __ydszMin=1 时跳过(在 WebView2 dev 模式下会抢占主线程导致卡死)
  const {
    frameRate,
    setPerformanceMode,
    showPerformanceSuggestion,
    dismissPerformanceSuggestion,
  } = _minimalHooks
    ? {
        frameRate: 60,
        setPerformanceMode: () => {},
        showPerformanceSuggestion: false,
        dismissPerformanceSuggestion: () => {},
      }
    : useFrameRateMonitor();
  const { settings: appSettings } = useAppSettings();

  // 原生桥接轮询重试: Tauri 模式下 main.tsx warmup 可能因超时提前结束,
  // 而 getWsUrl() 内部重试仍在进行中。此处持续轮询直到 nativeApi 就绪,
  // 最多等待 30 秒,防止 SplashScreen 永久卡死。

  const [nativeApi, setNativeApi] = useState(() => readNativeApi());

  // 启动阶段推进必须在 useEffect 中执行,避免渲染期间触发 store 更新
  // 导致 "Cannot update a component while rendering a different component" 警告。
  useEffect(() => {
    if (!nativeApi) {
      useBootProgressStore.getState().startStage("native-api");
      return;
    }
    useBootProgressStore.getState().completeStage("native-api");
  }, [nativeApi]);

  useEffect(() => {
    if (nativeApi) return;
    let attempts = 0;
    const maxAttempts = 60; // 30s / 500ms
    const interval = setInterval(() => {
      const api = readNativeApi();
      if (api) {
        setNativeApi(api);
        clearInterval(interval);
        return;
      }
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        useBootProgressStore
          .getState()
          .failStage("native-api", "Native bridge unavailable after 30s", "timeout");
      }
    }, 500);
    return () => clearInterval(interval);
  }, [nativeApi]);

  if (!nativeApi) {
    return (
      <div className="relative flex h-screen flex-col bg-background text-foreground">
        <WindowCaptionButtons className="absolute top-0 right-0" />
        <div className="flex flex-1 items-center justify-center">
          <SplashScreen />
        </div>
      </div>
    );
  }

  return (
    <I18nProvider language={appSettings.language ?? "en"}>
      <IdleLockGate disabled={_minimalHooks}>
        <TermsAcceptanceGate>
          <AutoProviderFailoverProvider
            enabled={true}
            threshold={3}
            enabledProviders={DEFAULT_PROVIDER_ORDER}
          >
            <ThreadTurnUsageRecorderHost />
            <ToastProvider>
              <AnchoredToastProvider>
                <BudgetAlertBanner />
                <EventRouter />
                <GlobalShortcutsDialog />
                <GlobalWhatsNewSurface />
                <TaskCompletionNotifications />
                <ProviderUpdateNotifications />
                <DesktopProjectBootstrap />
                <PerformanceSuggestionDialog
                  isOpen={showPerformanceSuggestion}
                  frameRate={frameRate}
                  onEnablePerformanceMode={() => setPerformanceMode("minimal")}
                  onDismiss={dismissPerformanceSuggestion}
                />
                <BootCompletionSentinel />
                <CrashRecoveryHost />
                <SandboxAccessGuardHost />
                <Outlet />
              </AnchoredToastProvider>
            </ToastProvider>
          </AutoProviderFailoverProvider>
        </TermsAcceptanceGate>
      </IdleLockGate>
    </I18nProvider>
  );
}

/**
 * 启动完成哨兵组件
 *
 * @description
 * 监听关键 query / 状态：appSettings 加载完成 → settings 阶段完成；
 * 全部阶段 done → 标记 ui-ready 阶段完成。
 * 独立成组件，便于 effect 隔离和测试。
 */
function BootCompletionSentinel() {
  useBootProgressCompletion();
  return null;
}

/**
 * 把 thread.turn-completed → costUsageStore 写入 hook 挂到组件树根。
 * 独立成组件,便于 effect 隔离和测试,生命周期跟随 RootRouteView。
 */
function ThreadTurnUsageRecorderHost() {
  useThreadTurnUsageRecorder();
  return null;
}

function useBootProgressCompletion() {
  const queryClient = useQueryClient();
  const stagesStatus = useBootProgressStore((state) => state.stages);

  // settings query 加载完成时,标记 settings 阶段完成
  useEffect(() => {
    let cancelled = false;
    void queryClient
      .fetchQuery(serverSettingsQueryOptions())
      .then(() => {
        if (cancelled) return;
        useBootProgressStore.getState().completeStage("settings");
        useBootProgressStore.getState().startStage("route-ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const errorType = inferBootStageErrorType(error);
        const message =
          error instanceof Error ? error.message : "Failed to load settings";
        useBootProgressStore.getState().failStage("settings", message, errorType);
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  // 全部阶段都 done → 标记 route-ready / ui-ready 完成
  useEffect(() => {
    if (Object.values(stagesStatus).every((stage) => stage.status === "done")) {
      useBootProgressStore.getState().completeStage("route-ready");
      useBootProgressStore.getState().completeStage("ui-ready");
    }
  }, [stagesStatus]);
}

function ProviderUpdateNotifications() {
  const messages = useMessages();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const updateToastIdRef = useRef<ReturnType<typeof toastManager.add> | null>(null);
  const outdatedProviders = useMemo(
    () =>
      (serverConfigQuery.data?.providers ?? []).filter(
        (provider) =>
          provider.versionAdvisory?.status === "behind_latest" &&
          provider.versionAdvisory.canUpdate,
      ),
    [serverConfigQuery.data?.providers],
  );

  const updateAll = useCallback(
    async (providers: ReadonlyArray<ServerProviderStatus>) => {
      if (isUpdatingAll || providers.length === 0) {
        return;
      }

      setIsUpdatingAll(true);
      if (updateToastIdRef.current) {
        toastManager.update(updateToastIdRef.current, {
          type: "loading",
          title: messages.notification.providerUpdate.titleMany(providers.length),
          description:
            providers.length === 1
              ? messages.notification.providerUpdate.description(
                  PROVIDER_DISPLAY_NAMES[providers[0]!.provider],
                )
              : messages.notification.providerUpdate.descriptionMany(providers.length),
          actionProps: undefined,
          data: undefined,
          timeout: 0,
        });
      }

      const api = ensureNativeApi();
      const failures: Array<{ provider: ServerProviderStatus; reason: string }> = [];

      for (const provider of providers) {
        try {
          const result = await api.server.updateProvider({ provider: provider.provider });
          const refreshed = result.providers.find((entry) => entry.provider === provider.provider);
          const updateState = refreshed?.updateState;
          if (updateState?.status === "failed" || updateState?.status === "unchanged") {
            failures.push({
              provider,
              reason: updateState.message ?? messages.notification.providerUpdate.errorFallback,
            });
          } else if (refreshed?.versionAdvisory?.status === "behind_latest") {
            failures.push({
              provider,
              reason: messages.notification.providerUpdate.stillOutdated,
            });
          }
        } catch (error) {
          failures.push({
            provider,
            reason:
              error instanceof Error
                ? error.message
                : messages.notification.providerUpdate.requestFailed,
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: serverQueryKeys.config() });
      setIsUpdatingAll(false);

      if (failures.length > 0) {
        if (updateToastIdRef.current) {
          toastManager.close(updateToastIdRef.current);
          updateToastIdRef.current = null;
        }
        toastManager.add({
          type: "error",
          title:
            failures.length === providers.length
              ? messages.notification.providerUpdate.failedTitleAll
              : messages.notification.providerUpdate.failedTitleSome,
          description: failures
            .map(
              ({ provider, reason }) => `${PROVIDER_DISPLAY_NAMES[provider.provider]}: ${reason}`,
            )
            .join("\n"),
        });
        return;
      }

      if (updateToastIdRef.current) {
        toastManager.update(updateToastIdRef.current, {
          type: "success",
          title:
            providers.length === 1
              ? messages.notification.providerUpdate.successTitleOne(
                  PROVIDER_DISPLAY_NAMES[providers[0]!.provider],
                )
              : messages.notification.providerUpdate.successTitleMany(providers.length),
          description: messages.notification.providerUpdate.successDescription,
          timeout: 6000,
        });
        updateToastIdRef.current = null;
      } else {
        toastManager.add({
          type: "success",
          title:
            providers.length === 1
              ? messages.notification.providerUpdate.successTitleOne(
                  PROVIDER_DISPLAY_NAMES[providers[0]!.provider],
                )
              : messages.notification.providerUpdate.successTitleMany(providers.length),
          description: messages.notification.providerUpdate.successDescription,
        });
      }
    },
    [isUpdatingAll, queryClient, messages],
  );

  useEffect(() => {
    if (outdatedProviders.length === 0 || isUpdatingAll) {
      return;
    }

    const newNotifications = outdatedProviders.filter((provider) => {
      const notificationKey = `${provider.provider}:${provider.versionAdvisory?.latestVersion ?? "unknown"}`;
      if (seenProviderUpdateNotificationKeys.has(notificationKey)) {
        return false;
      }
      seenProviderUpdateNotificationKeys.add(notificationKey);
      return true;
    });

    if (newNotifications.length === 0) {
      return;
    }

    const firstProvider = outdatedProviders[0]!;
    const additionalCount = outdatedProviders.length - 1;
    const providerName = PROVIDER_DISPLAY_NAMES[firstProvider.provider];
    const title =
      outdatedProviders.length === 1
        ? messages.notification.providerUpdate.availableTitleOne(providerName)
        : messages.notification.providerUpdate.availableTitleMany(outdatedProviders.length);
    const description =
      outdatedProviders.length === 1
        ? messages.notification.providerUpdate.availableDescriptionOne(providerName)
        : messages.notification.providerUpdate.availableDescriptionMany(
            providerName,
            additionalCount,
          );

    updateToastIdRef.current = toastManager.add({
      type: "warning",
      title,
      description,
      timeout: 0,
      actionProps: {
        children: messages.notification.providerUpdate.actionReview,
        onClick: () => {
          if (updateToastIdRef.current) {
            toastManager.close(updateToastIdRef.current);
            updateToastIdRef.current = null;
          }
          void navigate({
            to: "/settings",
            search: { section: "providers", target: "provider-updates" },
          });
        },
      },
      data: {
        secondaryActionProps: {
          children: messages.notification.providerUpdate.actionUpdateAll,
          onClick: () => {
            void updateAll(outdatedProviders);
          },
        },
      },
    });
  }, [isUpdatingAll, navigate, outdatedProviders, updateAll]);

  return null;
}

function GlobalShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const { focusedThreadId, activeProject, activeThread } = useFocusedChatContext();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const keybindings = serverConfigQuery.data?.keybindings ?? [];
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  const activeThreadTerminalState = useTerminalStateStore((state) =>
    focusedThreadId
      ? selectThreadTerminalState(state.terminalStateByThreadId, focusedThreadId)
      : null,
  );
  const terminalOpen = activeThreadTerminalState?.terminalOpen ?? false;
  const terminalWorkspaceOpen = shouldRenderTerminalWorkspace({
    activeProjectExists: activeProject !== null,
    presentationMode: activeThreadTerminalState?.presentationMode ?? "drawer",
    terminalOpen,
    runtimeMode: activeThread?.runtimeMode,
  });

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "show-shortcuts") {
        setOpen(true);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    <ShortcutsDialog
      open={open}
      onOpenChange={setOpen}
      keybindings={keybindings}
      projectScripts={activeProject?.kind === "project" ? activeProject.scripts : []}
      platform={platform}
      context={{
        terminalFocus: isTerminalFocused(),
        terminalOpen,
        terminalWorkspaceOpen,
      }}
      isTauri={isTauri}
    />
  );
}

function GlobalWhatsNewSurface() {
  // Single mount point per app session. The hook owns the "popout visible" and
  // "dialog open" booleans and the seen-marker persistence; this component is
  // just the plumbing that renders them together so they share one entry.
  const {
    currentEntry,
    allEntries,
    currentVersion,
    isPopoutVisible,
    isDialogOpen,
    openDialog,
    dismissPopout,
    onDialogOpenChange,
  } = useWhatsNew();

  if (!currentEntry) {
    // Silent-bootstrap or noop ??nothing to render on either surface.
    return null;
  }

  return (
    <>
      {isPopoutVisible && (
        <WhatsNewPopoutCard
          entry={currentEntry}
          currentVersion={currentVersion}
          onOpen={openDialog}
          onDismiss={dismissPopout}
        />
      )}
      <WhatsNewDialog
        open={isDialogOpen}
        onOpenChange={onDialogOpenChange}
        currentEntry={currentEntry}
        allEntries={allEntries}
        currentVersion={currentVersion}
      />
    </>
  );
}

function RootRouteErrorView({ error, reset }: ErrorComponentProps) {
  const t = MESSAGES[DEFAULT_LANGUAGE].errorFallback;
  const message = errorMessage(error, t.unexpected);
  const details = errorDetails(error, t.noDetails);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <WindowCaptionButtons className="absolute top-0 right-0" />
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-red-500)_16%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{t.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => reset()}>
            {t.retry}
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            {t.reload}
          </Button>
        </div>

        <details className="group mt-5 overflow-hidden rounded-lg border border-border/70 bg-background/55">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground">
            <span className="group-open:hidden">{t.showDetails}</span>
            <span className="hidden group-open:inline">{t.hideDetails}</span>
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-border/70 bg-background/80 px-3 py-2 text-xs text-foreground/85">
            {details}
          </pre>
        </details>
      </section>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return fallback;
}

function errorDetails(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return fallback;
  }
}

function EventRouter() {
  useDevRenderDiagnostics("EventRouter");

  const messages = useMessages();
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const syncServerThreadDetailHotPath = useStore((store) => store.syncServerThreadDetailHotPath);
  const applyShellEvent = useStore((store) => store.applyShellEvent);
  const applyOrchestrationEventsHotPath = useStore(
    (store) => store.applyOrchestrationEventsHotPath,
  );
  const setProjectExpanded = useStore((store) => store.setProjectExpanded);
  const removeOrphanedTerminalStates = useTerminalStateStore(
    (store) => store.removeOrphanedTerminalStates,
  );
  const setWorkspaceHomeDir = useWorkspaceStore((store) => store.setHomeDir);
  const setWorkspaceWorktreePath = useWorkspaceStore((store) => store.setWorkspaceWorktreePath);
  const workspacePages = useWorkspaceStore((store) => store.workspacePages);
  const serverThreads = useStore((store) => store.threads);
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const routeSearch = useSearch({
    strict: false,
    select: (search) => parseDiffRouteSearch(search),
  });
  const activeSplitView = useSplitViewStore(selectSplitView(routeSearch.splitViewId ?? null));
  const visibleThreadIds = useMemo(() => {
    if (activeSplitView) {
      return resolveSplitViewThreadIds(activeSplitView);
    }
    return routeThreadId ? [routeThreadId] : [];
  }, [activeSplitView, routeThreadId]);
  const retainedThreadIds = useRetainedThreadDetailIds();
  const serverThreadIds = useMemo(
    () => new Set(serverThreads.map((thread) => thread.id)),
    [serverThreads],
  );
  const subscribedThreadIds = useMemo(() => {
    const nextThreadIds = new Set<ThreadId>();
    for (const threadId of visibleThreadIds) {
      // Visible draft routes need a detail subscription before their shell row exists.
      // Otherwise fast provider responses can complete before the promoted thread is
      // known to the shell list, leaving the chat detail stuck on its optimistic state.
      nextThreadIds.add(threadId);
    }
    for (const threadId of retainedThreadIds) {
      if (serverThreadIds.has(threadId)) {
        nextThreadIds.add(threadId);
      }
    }
    return [...nextThreadIds];
  }, [retainedThreadIds, serverThreadIds, visibleThreadIds]);
  const workspacePagesRef = useRef(workspacePages);
  const pathnameRef = useRef(pathname);
  const routeVisibleThreadIdsRef = useRef(visibleThreadIds);
  const visibleThreadIdsRef = useRef(subscribedThreadIds);
  const reconcileThreadSubscriptionsRef = useRef<
    ((threadIds: readonly ThreadId[]) => Promise<void>) | null
  >(null);

  workspacePagesRef.current = workspacePages;
  pathnameRef.current = pathname;
  routeVisibleThreadIdsRef.current = visibleThreadIds;
  visibleThreadIdsRef.current = subscribedThreadIds;

  useEffect(() => {
    const api = readNativeApi();
    if (!api) return;
    let disposed = false;
    let needsProviderInvalidation = false;
    let needsBroadGitInvalidation = false;
    let pendingGitInvalidationThreadIds = new Set<ThreadId>();
    let pendingDomainEvents: OrchestrationEvent[] = [];
    const immediatelyFlushedAssistantMessageIds = new Set<string>();
    let shellSnapshotSequence = -1;
    let pendingShellEvents: OrchestrationShellStreamEvent[] = [];
    const subscribedThreadIds = new Set<ThreadId>();
    const threadSnapshotSequenceById = new Map<ThreadId, number>();
    const pendingThreadEventsById = new Map<ThreadId, OrchestrationEvent[]>();
    const threadSnapshotRequestInFlight = new Set<ThreadId>();
    const threadReplayRequestInFlight = new Set<ThreadId>();
    let reconcileThreadSubscriptionsChain = Promise.resolve();

    const beginThreadSubscription = (threadId: ThreadId) => {
      threadSnapshotSequenceById.delete(threadId);
      pendingThreadEventsById.set(threadId, []);
      threadSnapshotRequestInFlight.delete(threadId);
    };

    // Draft routes can subscribe before the server thread exists. Once the shell
    // row appears, explicitly request the first thread snapshot so buffered detail
    // events can flush instead of waiting forever.
    const requestThreadSnapshot = async (threadId: ThreadId) => {
      if (threadSnapshotSequenceById.has(threadId) || threadSnapshotRequestInFlight.has(threadId)) {
        return;
      }
      threadSnapshotRequestInFlight.add(threadId);
      try {
        await api.orchestration.subscribeThread({ threadId });
      } catch {
        // Keep the pending buffer intact and retry on the next shell/detail update.
      } finally {
        threadSnapshotRequestInFlight.delete(threadId);
      }
    };

    const flushThreadBuffer = (threadId: ThreadId, snapshotSequence: number) => {
      const pendingEvents = pendingThreadEventsById.get(threadId) ?? [];
      pendingThreadEventsById.delete(threadId);
      let latestThreadSequence = threadSnapshotSequenceById.get(threadId) ?? snapshotSequence;
      for (const event of pendingEvents.toSorted((left, right) => left.sequence - right.sequence)) {
        if (event.sequence > latestThreadSequence) {
          latestThreadSequence = event.sequence;
          threadSnapshotSequenceById.set(threadId, latestThreadSequence);
          queueDomainEvent(event);
        }
      }
    };

    const flushShellBuffer = (snapshotSequence: number) => {
      const nextPending = pendingShellEvents
        .filter((event) => event.sequence > snapshotSequence)
        .toSorted((left, right) => left.sequence - right.sequence);
      pendingShellEvents = [];
      for (const event of nextPending) {
        shellSnapshotSequence = Math.max(shellSnapshotSequence, event.sequence);
        applyShellEvent(event);
      }
    };

    const reconcileThreadSubscriptions = async (threadIds: readonly ThreadId[]) => {
      const nextThreadIds = new Set(threadIds);
      const removals = [...subscribedThreadIds].filter((threadId) => !nextThreadIds.has(threadId));
      const additions = [...nextThreadIds].filter((threadId) => !subscribedThreadIds.has(threadId));

      // Start new detail snapshots first so route changes can paint from the hot thread cache.
      for (const threadId of additions) {
        beginThreadSubscription(threadId);
        subscribedThreadIds.add(threadId);
      }
      await Promise.all(
        additions.map((threadId) =>
          api.orchestration.subscribeThread({ threadId }).catch(() => undefined),
        ),
      );

      for (const threadId of removals) {
        threadSnapshotSequenceById.delete(threadId);
        pendingThreadEventsById.delete(threadId);
        threadSnapshotRequestInFlight.delete(threadId);
        threadReplayRequestInFlight.delete(threadId);
        subscribedThreadIds.delete(threadId);
      }
      await Promise.all(
        removals.map((threadId) =>
          api.orchestration.unsubscribeThread({ threadId }).catch(() => undefined),
        ),
      );
    };

    const enqueueThreadSubscriptionReconcile = (threadIds: readonly ThreadId[]) => {
      const nextThreadIds = [...threadIds];
      reconcileThreadSubscriptionsChain = reconcileThreadSubscriptionsChain
        .catch(() => undefined)
        .then(() => reconcileThreadSubscriptions(nextThreadIds));
      return reconcileThreadSubscriptionsChain;
    };

    const unsubscribeRetainedThreadIdChanges = subscribeRetainedThreadDetailIdChanges(
      (nextRetainedThreadIds) => {
        const nextThreadIds = new Set(routeVisibleThreadIdsRef.current);
        for (const threadId of nextRetainedThreadIds) {
          nextThreadIds.add(threadId);
        }
        void enqueueThreadSubscriptionReconcile([...nextThreadIds]);
      },
    );

    const shouldApplyBootstrapShellSnapshot = (snapshot: OrchestrationShellSnapshot) => {
      if (disposed) {
        return false;
      }
      const currentState = useStore.getState();
      if (!currentState.threadsHydrated) {
        return true;
      }
      // Desktop can briefly hydrate from an empty startup stream before the
      // projection reader is fully ready. Let the later non-empty shell query win.
      return (
        (currentState.projects.length === 0 && snapshot.projects.length > 0) ||
        (currentState.threads.length === 0 && snapshot.threads.length > 0)
      );
    };

    const loadShellSnapshotOnce = async () => {
      let snapshot: OrchestrationShellSnapshot;
      try {
        snapshot = await api.orchestration.getShellSnapshot();
      } catch (error) {
        // ydsz-server 不可用 / WebSocket 断开 / RPC 超时 → 写入空快照翻
        // `threadsHydrated`,让 Sidebar 从 "正在加载项目" 切到空态;真正
        // 重新连上后会通过 shell-snapshot 流再次进入 hydrated 状态。
        if (disposed) return;
        const now = new Date().toISOString();
        const emptySnapshot: OrchestrationShellSnapshot = {
          snapshotSequence: 0,
          projects: [],
          threads: [],
          updatedAt: now,
        };
        const errorType = inferBootStageErrorType(error);
        useBootProgressStore
          .getState()
          .failStage(
            "shell-snapshot",
            error instanceof Error ? error.message : "Shell snapshot unavailable",
            errorType,
          );
        shellSnapshotSequence = emptySnapshot.snapshotSequence;
        syncServerShellSnapshot(emptySnapshot);
        // 静默吞掉:不在控制台刷错误,monitro SDK 已在 failStage 中记录
        return;
      }
      if (!shouldApplyBootstrapShellSnapshot(snapshot)) {
        return;
      }
      shellSnapshotSequence = snapshot.snapshotSequence;
      syncServerShellSnapshot(snapshot);
      reconcilePromotedDraftsFromShellThreads(snapshot.threads);
      removeOrphanedTerminalsForCurrentState();
      flushShellBuffer(snapshot.snapshotSequence);
    };

    const ensureScopedSubscriptions = async () => {
      shellSnapshotSequence = -1;
      pendingShellEvents = [];
      subscribedThreadIds.clear();
      threadSnapshotSequenceById.clear();
      pendingThreadEventsById.clear();
      threadReplayRequestInFlight.clear();
      await api.orchestration.subscribeShell().catch(() => loadShellSnapshotOnce());
      await enqueueThreadSubscriptionReconcile(visibleThreadIdsRef.current);
    };

    const removeOrphanedTerminalsForCurrentState = () => {
      const draftThreadIds = Object.keys(
        useComposerDraftStore.getState().draftThreadsByThreadId,
      ) as ThreadId[];
      const activeThreadIds = collectActiveTerminalThreadIds({
        snapshotThreads: useStore.getState().threads.map((thread) => ({
          id: thread.id,
          deletedAt: null,
          archivedAt: thread.archivedAt ?? null,
        })),
        draftThreadIds,
        retainedThreadIds: workspacePagesRef.current.map((workspace) =>
          workspaceThreadId(workspace.id),
        ),
      });
      removeOrphanedTerminalStates(activeThreadIds);
    };

    const flushPendingDomainEvents = () => {
      if (pendingDomainEvents.length > 0) {
        applyOrchestrationEventsHotPath(coalesceOrchestrationUiEvents(pendingDomainEvents));
        pendingDomainEvents = [];
      }
      if (needsProviderInvalidation) {
        needsProviderInvalidation = false;
        void queryClient.invalidateQueries({ queryKey: providerQueryKeys.all });
        // Invalidate workspace entry queries so the @-mention file picker
        // reflects files created, deleted, or restored during this turn.
        void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
      }
      if (needsBroadGitInvalidation) {
        needsBroadGitInvalidation = false;
        pendingGitInvalidationThreadIds = new Set();
        void invalidateGitQueries(queryClient);
      } else if (pendingGitInvalidationThreadIds.size > 0) {
        const currentState = useStore.getState();
        const scopedCwds = new Set<string>();
        let hasUnresolvedThread = false;
        for (const threadId of pendingGitInvalidationThreadIds) {
          const cwd = resolveGitInvalidationCwdForThreadId(currentState, threadId);
          if (cwd) {
            scopedCwds.add(cwd);
          } else {
            hasUnresolvedThread = true;
          }
        }
        pendingGitInvalidationThreadIds = new Set();
        if (hasUnresolvedThread || scopedCwds.size === 0) {
          void invalidateGitQueries(queryClient);
        } else {
          void invalidateGitQueriesForCwds(queryClient, scopedCwds);
        }
      }
    };

    const queueDomainEvent = (event: OrchestrationEvent) => {
      pendingDomainEvents.push(event);
      if (shouldInvalidateProviderQueriesForEvent(event)) {
        needsProviderInvalidation = true;
      }
      if (shouldInvalidateGitQueriesForEvent(event)) {
        const threadId = getGitInvalidationThreadIdForEvent(event);
        if (threadId) {
          pendingGitInvalidationThreadIds.add(threadId);
        } else {
          needsBroadGitInvalidation = true;
        }
      }
      if (shouldFlushDomainEventImmediately(event, immediatelyFlushedAssistantMessageIds)) {
        domainEventFlushThrottler.cancel();
        flushPendingDomainEvents();
        return;
      }
      domainEventFlushThrottler.maybeExecute();
    };

    const replayThreadEvents = async (
      threadId: ThreadId,
      targetSequence?: number,
    ): Promise<void> => {
      if (disposed || threadReplayRequestInFlight.has(threadId)) {
        return;
      }
      const fromSequence = threadSnapshotSequenceById.get(threadId);
      if (
        fromSequence === undefined ||
        (targetSequence !== undefined && fromSequence >= targetSequence)
      ) {
        return;
      }
      threadReplayRequestInFlight.add(threadId);
      try {
        const replayedEvents = await api.orchestration.replayEvents(fromSequence);
        for (const event of replayedEvents
          .filter((candidate) => isThreadDetailEventForThread(candidate, threadId))
          .filter(
            (candidate) => targetSequence === undefined || candidate.sequence <= targetSequence,
          )
          .toSorted((left, right) => left.sequence - right.sequence)) {
          const latestThreadSequence = threadSnapshotSequenceById.get(threadId) ?? fromSequence;
          if (event.sequence <= latestThreadSequence) {
            continue;
          }
          threadSnapshotSequenceById.set(threadId, event.sequence);
          queueDomainEvent(event);
        }
      } finally {
        threadReplayRequestInFlight.delete(threadId);
      }
    };

    const domainEventFlushThrottler = new Throttler(
      () => {
        flushPendingDomainEvents();
      },
      {
        wait: 100,
        leading: false,
        trailing: true,
      },
    );

    reconcileThreadSubscriptionsRef.current = (threadIds) =>
      enqueueThreadSubscriptionReconcile(threadIds);

    const unsubShellEvent = api.orchestration.onShellEvent((item) => {
      if (item.kind === "snapshot") {
        shellSnapshotSequence = item.snapshot.snapshotSequence;
        syncServerShellSnapshot(item.snapshot);
        reconcilePromotedDraftsFromShellThreads(item.snapshot.threads);
        removeOrphanedTerminalsForCurrentState();
        flushShellBuffer(item.snapshot.snapshotSequence);
        return;
      }

      if (shellSnapshotSequence < 0) {
        pendingShellEvents.push(item);
        return;
      }
      if (item.sequence <= shellSnapshotSequence) {
        return;
      }
      shellSnapshotSequence = item.sequence;
      applyShellEvent(item);
      if (item.kind === "thread-upserted") {
        reconcilePromotedDraftsFromShellThreads([item.thread]);
      }
      if (
        item.kind === "thread-upserted" &&
        subscribedThreadIds.has(item.thread.id) &&
        !threadSnapshotSequenceById.has(item.thread.id)
      ) {
        void requestThreadSnapshot(item.thread.id);
      }
      if (item.kind === "thread-upserted" && subscribedThreadIds.has(item.thread.id)) {
        void replayThreadEvents(item.thread.id, item.sequence).catch(() => undefined);
      }
    });
    const unsubThreadEvent = api.orchestration.onThreadEvent((item) => {
      if (item.kind === "snapshot") {
        const threadId = item.snapshot.thread.id;
        threadSnapshotSequenceById.set(threadId, item.snapshot.snapshotSequence);
        threadSnapshotRequestInFlight.delete(threadId);
        syncServerThreadDetailHotPath(item.snapshot.thread);
        reconcilePromotedDraftFromThreadDetail(item.snapshot.thread);
        flushThreadBuffer(threadId, item.snapshot.snapshotSequence);
        return;
      }

      const threadId = ThreadId.makeUnsafe(String(item.event.aggregateId));
      const latestThreadSequence = threadSnapshotSequenceById.get(threadId);
      if (latestThreadSequence === undefined) {
        const pendingThreadEvents = pendingThreadEventsById.get(threadId) ?? [];
        pendingThreadEvents.push(item.event);
        pendingThreadEventsById.set(threadId, pendingThreadEvents);
        if (subscribedThreadIds.has(threadId)) {
          void requestThreadSnapshot(threadId);
        }
        return;
      }
      if (item.event.sequence <= latestThreadSequence) {
        return;
      }
      threadSnapshotSequenceById.set(threadId, item.event.sequence);
      queueDomainEvent(item.event);
    });
    const unsubTerminalEvent = api.terminal.onEvent((event) => {
      const terminalThreadId = ThreadId.makeUnsafe(event.threadId);
      if (event.type === "activity") {
        if (event.cliKind) {
          useTerminalStateStore.getState().setTerminalMetadata(terminalThreadId, event.terminalId, {
            cliKind: event.cliKind,
            label: defaultTerminalTitleForCliKind(event.cliKind),
          });
        }
      }
      const activity = terminalActivityFromEvent(event);
      if (activity === null) {
        return;
      }
      useTerminalStateStore.getState().setTerminalActivity(terminalThreadId, event.terminalId, {
        hasRunningSubprocess: activity.hasRunningSubprocess,
        agentState: activity.agentState,
      });
    });
    const unsubWelcome = onServerWelcome((payload) => {
      // server welcome 收到 → 标记 server-welcome 阶段完成
      useBootProgressStore.getState().completeStage("server-welcome");
      useBootProgressStore.getState().startStage("shell-snapshot");
      void (async () => {
        setWorkspaceHomeDir(payload.homeDir);
        // P1-2 / P1-6: 启动时从 OS Keyring 恢复 Linear API Key 与 Push 通道凭证,
        // 失败不阻塞启动,内部已 try/catch 静默处理。
        void loadLinearCredentialsOnBoot();
        void loadPushCredentialsOnBoot();
        try {
          await ensureScopedSubscriptions();
          if (disposed) {
            return;
          }
          await loadShellSnapshotOnce();

          // P1-3: Worktree 注册表启动对账
          // 遍历所有 workspace 的 cwd,调用 git.reconcileWorktrees 同步后端注册表,
          // 并清空前端持久化的悬空 worktreePath(磁盘已不存在但 store 仍引用)。
          // 失败不阻塞启动,仅记录 debug 日志。
          if (!disposed) {
            try {
              const pages = workspacePagesRef.current;
              const uniqueCwds = new Set<string>();
              for (const page of pages) {
                if (page.cwd) {
                  uniqueCwds.add(page.cwd);
                }
              }
              const cwdToLivePaths = new Map<string, Set<string>>();
              for (const cwd of uniqueCwds) {
                try {
                  const result = await api.git.reconcileWorktrees({ cwd });
                  const livePaths = new Set(result.worktrees.map((w) => w.path));
                  cwdToLivePaths.set(cwd, livePaths);
                } catch {
                  // 单个 cwd 对账失败不阻塞其它 workspace
                }
              }
              // 清空悬空 worktreePath:磁盘已不存在但 store 仍引用
              for (const page of pages) {
                if (page.worktreePath && page.cwd) {
                  const livePaths = cwdToLivePaths.get(page.cwd);
                  if (livePaths && !livePaths.has(page.worktreePath) && !disposed) {
                    setWorkspaceWorktreePath(page.id, null);
                  }
                }
              }
            } catch {
              // 对账整体失败不阻塞启动
            }
          }
        } catch (error) {
          // shell-snapshot 加载失败（如 ydsz-server 未运行）不应阻塞启动流程，
          // 标记为完成（带 network 错误类型），允许 UI 正常渲染，后续通过
          // shellBootstrapFallbackTimer 和重连机制自动恢复。
          const errorType = inferBootStageErrorType(error);
          useBootProgressStore
            .getState()
            .failStage(
              "shell-snapshot",
              error instanceof Error ? error.message : "Shell snapshot unavailable",
              errorType,
            );
          // 即便 shell-snapshot 失败，也要继续推进 settings 阶段，避免启动卡死
          useBootProgressStore.getState().startStage("settings");
          // 兜底: 强制翻 `threadsHydrated` 让 Sidebar 退出 loading 态,
          // 避免因 ensureScopedSubscriptions 抛错导致整条链断在 welcome
          // 监听器里、侧边栏永远停在 "正在加载项目"。
          if (!disposed) {
            useStore.setState({ threadsHydrated: true });
          }
          return;
        }
        // shell snapshot 加载完成 → 标记 shell-snapshot 阶段完成
        useBootProgressStore.getState().completeStage("shell-snapshot");
        useBootProgressStore.getState().startStage("settings");

        if (!payload.bootstrapProjectId) {
          return;
        }
        setProjectExpanded(payload.bootstrapProjectId, true);

        // 不再自动跳转到 bootstrap thread：保持 Trae 风格的落地页，让用户主动选择
      })().catch(() => undefined);
    });
    // onServerConfigUpdated replays the latest cached value synchronously
    // during subscribe. Skip the toast for that replay so effect re-runs
    // don't produce duplicate toasts.
    let subscribed = false;
    const unsubServerConfigUpdated = onServerConfigUpdated((payload) => {
      void queryClient.invalidateQueries({ queryKey: serverQueryKeys.config() });
      if (!subscribed) return;
      const issue = payload.issues.find((entry) => entry.kind.startsWith("keybindings."));
      if (!issue) {
        return;
      }

      toastManager.add({
        type: "warning",
        title: messages.notification.keybindings.invalidTitle,
        description: issue.message,
        actionProps: {
          children: messages.notification.keybindings.openConfigAction,
          onClick: () => {
            void queryClient
              .ensureQueryData(serverConfigQueryOptions())
              .then((config) => {
                const editor = resolveAndPersistPreferredEditor(config.availableEditors);
                if (!editor) {
                  throw new Error(messages.notification.keybindings.noEditor);
                }
                return api.shell.openInEditor(config.keybindingsConfigPath, editor);
              })
              .catch((error) => {
                toastManager.add({
                  type: "error",
                  title: messages.notification.keybindings.openFileErrorTitle,
                  description:
                    error instanceof Error
                      ? error.message
                      : messages.notification.keybindings.openFileErrorFallback,
                });
              });
          },
        },
      });
    });
    const unsubProviderStatusesUpdated = onServerProviderStatusesUpdated((payload) => {
      const currentConfig = queryClient.getQueryData<ServerConfig>(serverQueryKeys.config());
      if (!currentConfig) {
        void queryClient.fetchQuery(serverConfigQueryOptions()).catch(() => undefined);
        return;
      }
      queryClient.setQueryData(serverQueryKeys.config(), {
        ...currentConfig,
        providers: payload.providers,
      });
      // OpenCode-compatible model availability depends on which underlying providers are connected.
      void queryClient.invalidateQueries({
        queryKey: ["provider-discovery", "models", "kilo"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["provider-discovery", "models", "opencode"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["provider-discovery", "models", "cursor"],
      });
      void queryClient.invalidateQueries({
        queryKey: providerDiscoveryQueryKeys.agents("kilo"),
      });
      void queryClient.invalidateQueries({
        queryKey: providerDiscoveryQueryKeys.agents("opencode"),
      });
    });
    const unsubServerSettingsUpdated = onServerSettingsUpdated((payload) => {
      queryClient.setQueryData(serverQueryKeys.settings(), payload.settings);
      void queryClient.invalidateQueries({
        queryKey: serverSettingsQueryOptions().queryKey,
      });
    });
    subscribed = true;
    void ensureScopedSubscriptions();
    // The shell stream normally delivers the sidebar snapshot. If it fails before
    // the first event, use the same lightweight query instead of the full history.
    const shellBootstrapFallbackTimer = window.setTimeout(() => {
      void loadShellSnapshotOnce().catch(() => undefined);
    }, SHELL_SNAPSHOT_BOOTSTRAP_FALLBACK_DELAY_MS);
    const threadDetailCatchupInterval = window.setInterval(() => {
      for (const threadId of subscribedThreadIds) {
        if (shouldPollThreadDetailCatchup(threadId)) {
          if (!threadSnapshotSequenceById.has(threadId)) {
            void requestThreadSnapshot(threadId);
          } else {
            void replayThreadEvents(threadId).catch(() => undefined);
          }
        }
      }
    }, THREAD_DETAIL_CATCHUP_INTERVAL_MS);

    return () => {
      flushPendingDomainEvents();
      disposed = true;
      window.clearTimeout(shellBootstrapFallbackTimer);
      window.clearInterval(threadDetailCatchupInterval);
      needsProviderInvalidation = false;
      needsBroadGitInvalidation = false;
      pendingGitInvalidationThreadIds = new Set();
      domainEventFlushThrottler.cancel();
      reconcileThreadSubscriptionsRef.current = null;
      void api.orchestration.unsubscribeShell().catch(() => undefined);
      void Promise.all(
        [...subscribedThreadIds].map((threadId) =>
          api.orchestration.unsubscribeThread({ threadId }).catch(() => undefined),
        ),
      );
      unsubscribeRetainedThreadIdChanges();
      unsubShellEvent();
      unsubThreadEvent();
      unsubTerminalEvent();
      unsubWelcome();
      unsubServerConfigUpdated();
      unsubProviderStatusesUpdated();
      unsubServerSettingsUpdated();
    };
  }, [
    applyOrchestrationEventsHotPath,
    applyShellEvent,
    queryClient,
    removeOrphanedTerminalStates,
    setProjectExpanded,
    setWorkspaceHomeDir,
    setWorkspaceWorktreePath,
    syncServerShellSnapshot,
    syncServerThreadDetailHotPath,
  ]);

  useLayoutEffect(() => {
    const reconcile = reconcileThreadSubscriptionsRef.current;
    if (!reconcile) {
      return;
    }
    void reconcile(subscribedThreadIds);
  }, [subscribedThreadIds]);

  return null;
}

function DesktopProjectBootstrap() {
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const attemptedRecoveryRef = useRef(false);

  useEffect(() => {
    const api = readNativeApi();
    if (!api || attemptedRecoveryRef.current || !threadsHydrated) {
      return;
    }

    const projectIds = new Set(projects.map((project) => project.id));
    const hasThreadWithoutProject = threads.some((thread) => !projectIds.has(thread.projectId));
    if (projects.length > 0 && !hasThreadWithoutProject) {
      return;
    }

    attemptedRecoveryRef.current = true;

    // Shell subscriptions should normally hydrate the sidebar. If project rows
    // are missing while live threads exist, repair before accepting the snapshot.
    void api.orchestration
      .getShellSnapshot()
      .then((snapshot) => {
        const needsRepair =
          (snapshot.projects.length === 0 && snapshot.threads.length === 0) ||
          hasLiveThreadsWithMissingProjects(snapshot);
        if (!needsRepair) {
          useStore.getState().syncServerShellSnapshot(snapshot);
          return snapshot;
        }
        return api.orchestration.repairState().then((repairedSnapshot) => {
          syncServerReadModel(repairedSnapshot);
          return repairedSnapshot;
        });
      })
      .catch(() => {
        attemptedRecoveryRef.current = false;
      });
  }, [projects, syncServerReadModel, threads, threadsHydrated]);

  // Desktop hydration normally runs through EventRouter project + orchestration sync.
  return null;
}
