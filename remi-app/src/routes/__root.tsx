/**
 * @file 鏍硅矾鐢辨ā鍧? * @description 搴旂敤鏍硅矾鐢憋紝璐熻矗鍒濆鍖栧叏灞€鐘舵€併€佷簨浠惰闃呫€佷富棰樼鐞嗐€佸浗闄呭寲绛夋牳蹇冨姛鑳? * @layer 鏍硅矾鐢卞眰
 * @exports Route - 鏍硅矾鐢遍厤缃? */

import {
  PROVIDER_DISPLAY_NAMES,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamEvent,
  type OrchestrationThread,
  type ServerConfig,
  type ServerProviderStatus,
} from "~/contracts";
import { defaultTerminalTitleForCliKind } from "~/shared/terminalThreads";
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

import { tauriBridge } from "../lib/tauri-bridge";
import { APP_DISPLAY_NAME } from "../branding";
import ShortcutsDialog from "../components/ShortcutsDialog";
import WhatsNewDialog from "../components/WhatsNewDialog";
import { useWhatsNew } from "../whatsNew/useWhatsNew";
import { WhatsNewPopoutCard } from "../whatsNew/WhatsNewPopoutCard";
import { shouldRenderTerminalWorkspace } from "../components/ChatView.logic";
import { Button } from "../components/ui/button";
import { AnchoredToastProvider, ToastProvider, toastManager } from "../components/ui/toast";
import { resolveAndPersistPreferredEditor } from "../editorPreferences";
import { isDesktop } from "../env";
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
import { getThreadFromState } from "../threadDerivation";
import { useAppTypography } from "../hooks/useAppTypography";
import { useChatCodeFont } from "../hooks/useChatCodeFont";
import { useTheme } from "../hooks/useTheme";
import { useUIFont } from "../hooks/useUIFont";
import { useNativeFontSmoothing } from "../hooks/useNativeFontSmoothing";
import { invalidateGitQueries, invalidateGitQueriesForCwds } from "../lib/gitReactQuery";
import { hasLiveThreadsWithMissingProjects } from "../lib/desktopProjectRecovery";
import { parseDiffRouteSearch } from "../diffRouteSearch";
import { resolveSplitViewThreadIds, selectSplitView, useSplitViewStore } from "../splitViewStore";
import { providerDiscoveryQueryKeys } from "../lib/providerDiscoveryReactQuery";
import { useAppSettings } from "../appSettings";
import { I18nProvider } from "../i18n";
import {
  getGitInvalidationThreadIdForEvent,
  resolveGitInvalidationCwdForThreadId,
  shouldInvalidateGitQueriesForEvent,
  shouldInvalidateProviderQueriesForEvent,
} from "./-rootEventInvalidation";

/** Shell 蹇収寮曞闄嶇骇寤惰繜鏃堕棿锛堟绉掞級 */
const SHELL_SNAPSHOT_BOOTSTRAP_FALLBACK_DELAY_MS = 1_500;
/** 绾跨▼璇︽儏杩借刀杞闂撮殧锛堟绉掞級 */
const THREAD_DETAIL_CATCHUP_INTERVAL_MS = 1_500;
/** 宸茶杩囩殑鎻愪緵鑰呮洿鏂伴€氱煡閿泦鍚堬紝鐢ㄤ簬閬垮厤閲嶅閫氱煡 */
const seenProviderUpdateNotificationKeys = new Set<string>();

/**
 * 鍒ゆ柇 Shell 绾跨▼鏄惁宸插惎鍔? * @param thread - Shell 蹇収涓殑绾跨▼瀵硅薄
 * @returns 濡傛灉绾跨▼鏈夋渶鏂扮殑杞鎴栦細璇濓紝鍒欒繑鍥?true
 */
function shellThreadHasStarted(thread: OrchestrationShellSnapshot["threads"][number]): boolean {
  return thread.latestTurn !== null || thread.session !== null;
}

/**
 * 鍒ゆ柇璇︽儏绾跨▼鏄惁宸插惎鍔? * @param thread - 缂栨帓绾跨▼瀵硅薄
 * @returns 濡傛灉绾跨▼宸插惎鍔ㄦ垨鍖呭惈娑堟伅锛屽垯杩斿洖 true
 */
function detailThreadHasStarted(thread: OrchestrationThread): boolean {
  return shellThreadHasStarted(thread) || thread.messages.length > 0;
}

/**
 * 浠?Shell 绾跨▼鍒楄〃涓崗璋冨凡鎻愬崌鐨勮崏绋跨嚎绋? * @param threads - Shell 蹇収涓殑绾跨▼鍒楄〃
 * @description 鏍囪鎵€鏈夌嚎绋嬩负宸叉彁鍗囷紝骞跺皢宸插惎鍔ㄧ殑绾跨▼鏍囪涓哄凡鏈€缁堝寲
 */
function reconcilePromotedDraftsFromShellThreads(
  threads: ReadonlyArray<OrchestrationShellSnapshot["threads"][number]>,
): void {
  markPromotedDraftThreads(new Set(threads.map((thread) => thread.id)));
  finalizePromotedDraftThreads(
    new Set(threads.filter((thread) => shellThreadHasStarted(thread)).map((thread) => thread.id)),
  );
}

/**
 * 浠庣嚎绋嬭鎯呭崗璋冨凡鎻愬崌鐨勮崏绋跨嚎绋? * @param thread - 缂栨帓绾跨▼瀵硅薄
 * @description 鏍囪绾跨▼涓哄凡鎻愬崌锛屽鏋滃凡鍚姩鍒欐爣璁颁负宸叉渶缁堝寲
 */
function reconcilePromotedDraftFromThreadDetail(thread: OrchestrationThread): void {
  markPromotedDraftThreads(new Set([thread.id]));
  if (detailThreadHasStarted(thread)) {
    finalizePromotedDraftThreads(new Set([thread.id]));
  }
}

/**
 * 鏍硅矾鐢遍厤缃? * @description 鍒涘缓甯︽湁 QueryClient 涓婁笅鏂囩殑鏍硅矾鐢憋紝瀹氫箟鏍硅鍥惧拰閿欒瑙嗗浘
 */
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
 * 鏍硅矾鐢辫鍥剧粍浠? * @description 鍒濆鍖栧叏灞€鏍峰紡銆佷富棰樸€佸瓧浣撱€佸浗闄呭寲绛夛紝骞舵覆鏌撳叏灞€缁勪欢
 */
function RootRouteView() {
  useAppTypography();
  useChatCodeFont();
  useNativeFontSmoothing();
  useTheme();
  useUIFont();
  const { settings: appSettings } = useAppSettings();

  if (!readNativeApi()) {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Connecting to {APP_DISPLAY_NAME} server...
          </p>
        </div>
      </div>
    );
  }

  return (
    <I18nProvider language={appSettings.language}>
      <ToastProvider>
        <AnchoredToastProvider>
          <EventRouter />
          <GlobalShortcutsDialog />
          <GlobalWhatsNewSurface />
          <TaskCompletionNotifications />
          <ProviderUpdateNotifications />
          <DesktopProjectBootstrap />
          <Outlet />
        </AnchoredToastProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

/**
 * 鎻愪緵鑰呮洿鏂伴€氱煡缁勪欢
 * @description 鐩戞帶鎻愪緵鑰呯増鏈姸鎬侊紝褰撴湁鍙敤鏇存柊鏃舵樉绀洪€氱煡锛屾敮鎸佸崟涓垨鎵归噺鏇存柊
 */
function ProviderUpdateNotifications() {
  const messages = useMessages();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const updateToastIdRef = useRef<ReturnType<typeof toastManager.add> | null>(null);
  // 杩囨护鍑烘湁鍙敤鏇存柊鐨勬彁渚涜€?  const outdatedProviders = useMemo(
    () =>
      (serverConfigQuery.data?.providers ?? []).filter(
        (provider) =>
          provider.versionAdvisory?.status === "behind_latest" &&
          provider.versionAdvisory.canUpdate,
      ),
    [serverConfigQuery.data?.providers],
  );

  /**
   * 鎵归噺鏇存柊鎵€鏈夎繃鏃剁殑鎻愪緵鑰?   * @param providers - 闇€瑕佹洿鏂扮殑鎻愪緵鑰呭垪琛?   * @description 渚濇鏇存柊姣忎釜鎻愪緵鑰咃紝鏀堕泦澶辫触淇℃伅锛屽苟鏄剧ず鐩稿簲鐨勯€氱煡
   */
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

/**
 * 鍏ㄥ眬蹇嵎閿璇濇缁勪欢
 * @description 绠＄悊鍏ㄥ眬蹇嵎閿璇濇鐨勬樉绀猴紝鍝嶅簲鑿滃崟鍔ㄤ綔鍜岄敭鐩樹簨浠? */
function GlobalShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const { focusedThreadId, activeProject } = useFocusedChatContext();
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
  });

  useEffect(() => {
    const onMenuAction = tauriBridge.onMenuAction;
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
      isDesktop={isDesktop}
    />
  );
}

/**
 * 鍏ㄥ眬"鏂板姛鑳?灞曠ず闈㈢粍浠? * @description 搴旂敤浼氳瘽绾у埆鐨勫崟涓€鎸傝浇鐐癸紝璐熻矗娓叉煋"鏂板姛鑳?寮圭獥鍜屽脊鍑哄崱鐗? */
function GlobalWhatsNewSurface() {
  // 鍗曚竴鎸傝浇鐐癸紝Hook 璐熻矗"寮瑰嚭鍗＄墖鍙"鍜?瀵硅瘽妗嗘墦寮€"鐨勫竷灏旂姸鎬佷互鍙婂凡鏌ョ湅鏍囪鐨勬寔涔呭寲
  // 璇ョ粍浠朵粎璐熻矗灏嗗畠浠粍鍚堟覆鏌擄紝鍏变韩涓€涓叆鍙?  const {
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
    // 闈欓粯鍚姩鎴栨棤鎿嶄綔 - 涓や釜灞曠ず闈㈤兘鏃犻渶娓叉煋
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

/**
 * 鏍硅矾鐢遍敊璇鍥剧粍浠? * @description 褰撹矾鐢卞彂鐢熼敊璇椂鏄剧ず鐨勯敊璇〉闈紝鎻愪緵閲嶈瘯鍜岄噸杞藉簲鐢ㄧ殑閫夐」
 * @param error - 閿欒瀵硅薄
 * @param reset - 閲嶇疆鍑芥暟锛岀敤浜庨噸璇? */
function RootRouteErrorView({ error, reset }: ErrorComponentProps) {
  const message = errorMessage(error);
  const details = errorDetails(error);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-red-500)_16%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Something went wrong.</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => reset()}>
            Try again
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>

        <details className="group mt-5 overflow-hidden rounded-lg border border-border/70 bg-background/55">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground">
            <span className="group-open:hidden">Show error details</span>
            <span className="hidden group-open:inline">Hide error details</span>
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-border/70 bg-background/80 px-3 py-2 text-xs text-foreground/85">
            {details}
          </pre>
        </details>
      </section>
    </div>
  );
}

/**
 * 鎻愬彇閿欒娑堟伅
 * @param error - 閿欒瀵硅薄
 * @returns 鏍煎紡鍖栫殑閿欒娑堟伅瀛楃涓? */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "An unexpected router error occurred.";
}

/**
 * 鎻愬彇閿欒璇︽儏
 * @param error - 閿欒瀵硅薄
 * @returns 鏍煎紡鍖栫殑閿欒璇︽儏瀛楃涓诧紝鍖呭惈鍫嗘爤淇℃伅鎴?JSON 搴忓垪鍖栫粨鏋? */
function errorDetails(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return "No additional error details are available.";
  }
}

/**
 * 鍚堝苟缂栨帓 UI 浜嬩欢
 * @description 灏嗚繛缁殑鐩稿悓娑堟伅鍙戦€佷簨浠跺悎骞朵负涓€涓紝閬垮厤 UI 閲嶅娓叉煋
 * @param events - 缂栨帓浜嬩欢鏁扮粍
 * @returns 鍚堝苟鍚庣殑浜嬩欢鏁扮粍
 */
function coalesceOrchestrationUiEvents(
  events: ReadonlyArray<OrchestrationEvent>,
): OrchestrationEvent[] {
  if (events.length < 2) {
    return [...events];
  }

  const coalesced: OrchestrationEvent[] = [];
  for (const event of events) {
    const previous = coalesced.at(-1);
    if (
      previous?.type === "thread.message-sent" &&
      event.type === "thread.message-sent" &&
      previous.payload.threadId === event.payload.threadId &&
      previous.payload.messageId === event.payload.messageId
    ) {
      coalesced[coalesced.length - 1] = {
        ...event,
        payload: {
          ...event.payload,
          attachments: event.payload.attachments ?? previous.payload.attachments,
          createdAt: previous.payload.createdAt,
          text:
            !event.payload.streaming && event.payload.text.length > 0
              ? event.payload.text
              : previous.payload.text + event.payload.text,
        },
      };
      continue;
    }

    coalesced.push(event);
  }

  return coalesced;
}

/**
 * 鍒ゆ柇鏄惁搴旇绔嬪嵆鍒锋柊棰嗗煙浜嬩欢
 * @description 瀵逛簬鍔╂墜娑堟伅鐨勯涓祦寮忎簨浠讹紝绔嬪嵆鍒锋柊浠ョ‘淇?UI 鍙婃椂鍝嶅簲
 * @param event - 缂栨帓浜嬩欢瀵硅薄
 * @param immediatelyFlushedAssistantMessageIds - 宸茬珛鍗冲埛鏂扮殑鍔╂墜娑堟伅 ID 闆嗗悎
 * @returns 濡傛灉搴旇绔嬪嵆鍒锋柊鍒欒繑鍥?true
 */
function shouldFlushDomainEventImmediately(
  event: OrchestrationEvent,
  immediatelyFlushedAssistantMessageIds: Set<string>,
): boolean {
  if (event.type !== "thread.message-sent" || event.payload.role !== "assistant") {
    return false;
  }

  if (!event.payload.streaming) {
    immediatelyFlushedAssistantMessageIds.delete(event.payload.messageId);
    return false;
  }

  if (immediatelyFlushedAssistantMessageIds.has(event.payload.messageId)) {
    return false;
  }

  immediatelyFlushedAssistantMessageIds.add(event.payload.messageId);
  return true;
}

/**
 * 鍒ゆ柇浜嬩欢鏄惁涓烘寚瀹氱嚎绋嬬殑璇︽儏浜嬩欢
 * @param event - 缂栨帓浜嬩欢瀵硅薄
 * @param threadId - 绾跨▼ ID
 * @returns 濡傛灉浜嬩欢灞炰簬鎸囧畾绾跨▼鐨勮鎯呬簨浠跺垯杩斿洖 true
 */
function isThreadDetailEventForThread(event: OrchestrationEvent, threadId: ThreadId): boolean {
  if (event.aggregateKind !== "thread" || event.aggregateId !== threadId) {
    return false;
  }
  return (
    event.type === "thread.message-sent" ||
    event.type === "thread.proposed-plan-upserted" ||
    event.type === "thread.activity-appended" ||
    event.type === "thread.turn-diff-completed" ||
    event.type === "thread.reverted" ||
    event.type === "thread.conversation-rolled-back" ||
    event.type === "thread.session-set" ||
    event.type === "thread.meta-updated" ||
    event.type === "thread.archived" ||
    event.type === "thread.unarchived"
  );
}

/**
 * 鍒ゆ柇鏄惁搴旇杞绾跨▼璇︽儏杩借刀
 * @param threadId - 绾跨▼ ID
 * @returns 濡傛灉绾跨▼姝ｅ湪杩愯锛堜細璇濇垨鏈€鏂拌疆娆★級锛屽垯杩斿洖 true
 */
function shouldPollThreadDetailCatchup(threadId: ThreadId): boolean {
  const thread = getThreadFromState(useStore.getState(), threadId);
  return (
    thread?.session?.orchestrationStatus === "running" || thread?.latestTurn?.state === "running"
  );
}

/**
 * 浜嬩欢璺敱缁勪欢
 * @description 鏍稿績浜嬩欢璁㈤槄鍜屽垎鍙戠粍浠讹紝璐熻矗锛? * - 璁㈤槄 Shell 鍜岀嚎绋嬭鎯呬簨浠舵祦
 * - 绠＄悊绾跨▼璁㈤槄鐨勭敓鍛藉懆鏈? * - 鍗忚皟缂撳瓨澶辨晥鍜屾煡璇㈠埛鏂? * - 澶勭悊缁堢浜嬩欢鍜屾杩庢秷鎭? * - 缁存姢绾跨▼蹇収搴忓垪鍙峰拰浜嬩欢缂撳啿
 */
function EventRouter() {
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
  const workspacePages = useWorkspaceStore((store) => store.workspacePages);
  const serverThreads = useStore((store) => store.threads);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const handledBootstrapThreadIdRef = useRef<string | null>(null);
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
      const snapshot = await api.orchestration.getShellSnapshot();
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
      void (async () => {
        setWorkspaceHomeDir(payload.homeDir);
        await ensureScopedSubscriptions();
        if (disposed) {
          return;
        }
        await loadShellSnapshotOnce();

        if (!payload.bootstrapProjectId || !payload.bootstrapThreadId) {
          return;
        }
        setProjectExpanded(payload.bootstrapProjectId, true);

        if (pathnameRef.current !== "/") {
          return;
        }
        if (handledBootstrapThreadIdRef.current === payload.bootstrapThreadId) {
          return;
        }
        await navigate({
          to: "/$threadId",
          params: { threadId: payload.bootstrapThreadId },
          replace: true,
        });
        handledBootstrapThreadIdRef.current = payload.bootstrapThreadId;
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
    navigate,
    queryClient,
    removeOrphanedTerminalStates,
    setProjectExpanded,
    setWorkspaceHomeDir,
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

/**
 * 妗岄潰椤圭洰寮曞缁勪欢
 * @description 澶勭悊妗岄潰搴旂敤鐨勯」鐩垵濮嬪寲閫昏緫锛岀‘淇濋」鐩暟鎹纭姞杞? */
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

    // Shell 璁㈤槄閫氬父浼氬垵濮嬪寲渚ц竟鏍忔暟鎹€傚鏋滈」鐩缂哄け浣嗗瓨鍦ㄦ椿璺冪嚎绋嬶紝
    // 鍦ㄦ帴鍙楀揩鐓т箣鍓嶅厛杩涜淇
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

  // 妗岄潰绔殑鏁版嵁鍒濆鍖栭€氬父閫氳繃 EventRouter 鐨勯」鐩拰缂栨帓鍚屾鏉ュ畬鎴?  return null;
}
