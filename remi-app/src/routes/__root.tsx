/**
 * @file 閺嶇鐭鹃悽杈侀崸? * @description 鎼存梻鏁ら弽纭呯熅閻㈡唻绱濈拹鐔荤煑閸掓繂顫愰崠鏍у弿鐏炩偓閻樿埖鈧降鈧椒绨ㄦ禒鎯邦吂闂冨懌鈧椒瀵屾０妯碱吀閻炲棎鈧礁娴楅梽鍛缁涘鐗宠箛鍐ㄥ閼? * @layer 閺嶇鐭鹃悽鍗炵湴
 * @exports Route - 閺嶇鐭鹃悽閬嶅帳缂? */

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

/** Shell 韫囶偆鍙庡鏇烆嚤闂勫秶楠囧鎯扮箿閺冨爼妫块敍鍫燁嚑缁夋帪绱?*/
const SHELL_SNAPSHOT_BOOTSTRAP_FALLBACK_DELAY_MS = 1_500;
/** 缁捐法鈻肩拠锔藉剰鏉╁€熷垁鏉烆喛顕楅梻鎾閿涘牊顕犵粔鎺炵礆 */
const THREAD_DETAIL_CATCHUP_INTERVAL_MS = 1_500;
/** 瀹歌尪顫嗘潻鍥╂畱閹绘劒绶甸懓鍛纯閺備即鈧氨鐓￠柨顕€娉﹂崥鍫礉閻劋绨柆鍨帳闁插秴顦查柅姘辩叀 */
const seenProviderUpdateNotificationKeys = new Set<string>();

/**
 * 閸掋倖鏌?Shell 缁捐法鈻奸弰顖氭儊瀹告彃鎯庨崝? * @param thread - Shell 韫囶偆鍙庢稉顓犳畱缁捐法鈻肩€电钖? * @returns 婵″倹鐏夌痪璺ㄢ柤閺堝娓堕弬鎵畱鏉烆喗顐奸幋鏍︾窗鐠囨繐绱濋崚娆掔箲閸?true
 */
function shellThreadHasStarted(thread: OrchestrationShellSnapshot["threads"][number]): boolean {
  return thread.latestTurn !== null || thread.session !== null;
}

/**
 * 閸掋倖鏌囩拠锔藉剰缁捐法鈻奸弰顖氭儊瀹告彃鎯庨崝? * @param thread - 缂傛牗甯撶痪璺ㄢ柤鐎电钖? * @returns 婵″倹鐏夌痪璺ㄢ柤瀹告彃鎯庨崝銊﹀灗閸栧懎鎯堝☉鍫熶紖閿涘苯鍨潻鏂挎礀 true
 */
function detailThreadHasStarted(thread: OrchestrationThread): boolean {
  return shellThreadHasStarted(thread) || thread.messages.length > 0;
}

/**
 * 娴?Shell 缁捐法鈻奸崚妤勩€冩稉顓炲礂鐠嬪啫鍑￠幓鎰磳閻ㄥ嫯宕忕粙璺ㄥ殠缁? * @param threads - Shell 韫囶偆鍙庢稉顓犳畱缁捐法鈻奸崚妤勩€? * @description 閺嶅洩顔囬幍鈧張澶屽殠缁嬪璐熷鍙夊絹閸楀浄绱濋獮璺虹殺瀹告彃鎯庨崝銊ф畱缁捐法鈻奸弽鍥唶娑撳搫鍑￠張鈧紒鍫濆
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
 * 娴犲海鍤庣粙瀣嚊閹懎宕楃拫鍐ㄥ嚒閹绘劕宕岄惃鍕磸缁嬭法鍤庣粙? * @param thread - 缂傛牗甯撶痪璺ㄢ柤鐎电钖? * @description 閺嶅洩顔囩痪璺ㄢ柤娑撳搫鍑￠幓鎰磳閿涘苯顩ч弸婊冨嚒閸氼垰濮╅崚娆愮垼鐠侀璐熷鍙夋付缂佸牆瀵? */
function reconcilePromotedDraftFromThreadDetail(thread: OrchestrationThread): void {
  markPromotedDraftThreads(new Set([thread.id]));
  if (detailThreadHasStarted(thread)) {
    finalizePromotedDraftThreads(new Set([thread.id]));
  }
}

/**
 * 閺嶇鐭鹃悽閬嶅帳缂? * @description 閸掓稑缂撶敮锔芥箒 QueryClient 娑撳﹣绗呴弬鍥╂畱閺嶇鐭鹃悽鎲嬬礉鐎规矮绠熼弽纭咁潒閸ユ儳鎷伴柨娆掝嚖鐟欏棗娴? */
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
 * 閺嶇鐭鹃悽杈潒閸ュ墽绮嶆禒? * @description 閸掓繂顫愰崠鏍у弿鐏炩偓閺嶅嘲绱￠妴浣峰瘜妫版ǜ鈧礁鐡ф担鎾扁偓浣告禇闂勫懎瀵茬粵澶涚礉楠炶埖瑕嗛弻鎾冲弿鐏炩偓缂佸嫪娆? */
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
 * 閹绘劒绶甸懓鍛纯閺備即鈧氨鐓＄紒鍕
 * @description 閻╂垶甯堕幓鎰返閼板懐澧楅張顒傚Ц閹緤绱濊ぐ鎾存箒閸欘垳鏁ら弴瀛樻煀閺冭埖妯夌粈娲偓姘辩叀閿涘本鏁幐浣稿礋娑擃亝鍨ㄩ幍褰掑櫤閺囧瓨鏌? */
function ProviderUpdateNotifications() {
  const messages = useMessages();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const updateToastIdRef = useRef<ReturnType<typeof toastManager.add> | null>(null);
  // 鏉╁洦鎶ら崙鐑樻箒閸欘垳鏁ら弴瀛樻煀閻ㄥ嫭褰佹笟娑溾偓?  const outdatedProviders = useMemo(
    () =>
      (serverConfigQuery.data?.providers ?? []).filter(
        (provider) =>
          provider.versionAdvisory?.status === "behind_latest" &&
          provider.versionAdvisory.canUpdate,
      ),
    [serverConfigQuery.data?.providers],
  );

  /**
   * 閹靛綊鍣洪弴瀛樻煀閹碘偓閺堝绻冮弮鍓佹畱閹绘劒绶甸懓?   * @param providers - 闂団偓鐟曚焦娲块弬鎵畱閹绘劒绶甸懓鍛灙鐞?   * @description 娓氭繃顐奸弴瀛樻煀濮ｅ繋閲滈幓鎰返閼板拑绱濋弨鍫曟肠婢惰精瑙︽穱鈩冧紖閿涘苯鑻熼弰鍓с仛閻╃绨查惃鍕偓姘辩叀
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
 * 閸忋劌鐪箛顐ｅ祹闁款喖顕拠婵囶攱缂佸嫪娆? * @description 缁狅紕鎮婇崗銊ョ湰韫囶偅宓庨柨顔碱嚠鐠囨繃顢嬮惃鍕▔缁€鐚寸礉閸濆秴绨查懣婊冨礋閸斻劋缍旈崪宀勬暛閻╂ü绨ㄦ禒? */
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
 * 閸忋劌鐪?閺傛澘濮涢懗?鐏炴洜銇氶棃銏㈢矋娴? * @description 鎼存梻鏁ゆ导姘崇樈缁狙冨焼閻ㄥ嫬宕熸稉鈧幐鍌濇祰閻愮櫢绱濈拹鐔荤煑濞撳弶鐓?閺傛澘濮涢懗?瀵湱鐛ラ崪灞借剨閸戝搫宕遍悧? */
function GlobalWhatsNewSurface() {
  // 閸楁洑绔撮幐鍌濇祰閻愮櫢绱滺ook 鐠愮喕鐭?瀵懓鍤崡锛勫閸欘垵顫?閸?鐎电鐦藉鍡樺ⅵ瀵偓"閻ㄥ嫬绔风亸鏃傚Ц閹椒浜掗崣濠傚嚒閺屻儳婀呴弽鍥唶閻ㄥ嫭瀵旀稊鍛
  // 鐠囥儳绮嶆禒鏈电矌鐠愮喕鐭楃亸鍡楃暊娴狀剛绮嶉崥鍫熻閺屾搫绱濋崗鍙橀煩娑撯偓娑擃亜鍙嗛崣?  const {
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
    // 闂堟瑩绮崥顖氬З閹存牗妫ら幙宥勭稊 - 娑撱倓閲滅仦鏇犮仛闂堛垽鍏橀弮鐘绘付濞撳弶鐓?    return null;
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
 * 閺嶇鐭鹃悽閬嶆晩鐠囶垵顫嬮崶鍓х矋娴? * @description 瑜版捁鐭鹃悽鍗炲絺閻㈢喖鏁婄拠顖涙閺勫墽銇氶惃鍕晩鐠囶垶銆夐棃顫礉閹绘劒绶甸柌宥堢槸閸滃矂鍣告潪钘夌安閻劎娈戦柅澶愩€? * @param error - 闁挎瑨顕ょ€电钖? * @param reset - 闁插秶鐤嗛崙鑺ユ殶閿涘瞼鏁ゆ禍搴ㄥ櫢鐠? */
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
 * 閹绘劕褰囬柨娆掝嚖濞戝牊浼? * @param error - 闁挎瑨顕ょ€电钖? * @returns 閺嶇厧绱￠崠鏍畱闁挎瑨顕ゅ☉鍫熶紖鐎涙顑佹稉? */
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
 * 閹绘劕褰囬柨娆掝嚖鐠囷附鍎? * @param error - 闁挎瑨顕ょ€电钖? * @returns 閺嶇厧绱￠崠鏍畱闁挎瑨顕ょ拠锔藉剰鐎涙顑佹稉璇х礉閸栧懎鎯堥崼鍡樼垽娣団剝浼呴幋?JSON 鎼村繐鍨崠鏍波閺? */
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
 * 閸氬牆鑻熺紓鏍ㄥ笓 UI 娴滃娆? * @description 鐏忓棜绻涚紒顓犳畱閻╃鎮撳☉鍫熶紖閸欐垿鈧椒绨ㄦ禒璺烘値楠炴湹璐熸稉鈧稉顏庣礉闁灝鍘?UI 闁插秴顦插〒鍙夌厠
 * @param events - 缂傛牗甯撴禍瀣╂閺佹壆绮? * @returns 閸氬牆鑻熼崥搴ｆ畱娴滃娆㈤弫鎵矋
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
 * 閸掋倖鏌囬弰顖氭儊鎼存棁顕氱粩瀣祮閸掗攱鏌婃０鍡楃厵娴滃娆? * @description 鐎甸€涚艾閸斺晜澧滃☉鍫熶紖閻ㄥ嫰顩绘稉顏呯ウ瀵繋绨ㄦ禒璁圭礉缁斿宓嗛崚閿嬫煀娴犮儳鈥樻穱?UI 閸欏﹥妞傞崫宥呯安
 * @param event - 缂傛牗甯撴禍瀣╂鐎电钖? * @param immediatelyFlushedAssistantMessageIds - 瀹歌尙鐝涢崡鍐插煕閺傛壆娈戦崝鈺傚濞戝牊浼?ID 闂嗗棗鎮? * @returns 婵″倹鐏夋惔鏃囶嚉缁斿宓嗛崚閿嬫煀閸掓瑨绻戦崶?true
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
 * 閸掋倖鏌囨禍瀣╂閺勵垰鎯佹稉鐑樺瘹鐎规氨鍤庣粙瀣畱鐠囷附鍎忔禍瀣╂
 * @param event - 缂傛牗甯撴禍瀣╂鐎电钖? * @param threadId - 缁捐法鈻?ID
 * @returns 婵″倹鐏夋禍瀣╂鐏炵偘绨幐鍥х暰缁捐法鈻奸惃鍕嚊閹懍绨ㄦ禒璺哄灟鏉╂柨娲?true
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
 * 閸掋倖鏌囬弰顖氭儊鎼存棁顕氭潪顔款嚄缁捐法鈻肩拠锔藉剰鏉╁€熷垁
 * @param threadId - 缁捐法鈻?ID
 * @returns 婵″倹鐏夌痪璺ㄢ柤濮濓絽婀潻鎰攽閿涘牅绱扮拠婵囧灗閺堚偓閺傛媽鐤嗗▎鈽呯礆閿涘苯鍨潻鏂挎礀 true
 */
function shouldPollThreadDetailCatchup(threadId: ThreadId): boolean {
  const thread = getThreadFromState(useStore.getState(), threadId);
  return (
    thread?.session?.orchestrationStatus === "running" || thread?.latestTurn?.state === "running"
  );
}

/**
 * 娴滃娆㈢捄顖滄暠缂佸嫪娆? * @description 閺嶇绺炬禍瀣╂鐠併垽妲勯崪灞藉瀻閸欐垹绮嶆禒璁圭礉鐠愮喕鐭楅敍? * - 鐠併垽妲?Shell 閸滃瞼鍤庣粙瀣嚊閹懍绨ㄦ禒鑸电ウ
 * - 缁狅紕鎮婄痪璺ㄢ柤鐠併垽妲勯惃鍕晸閸涜棄鎳嗛張? * - 閸楀繗鐨熺紓鎾崇摠婢惰鲸鏅ラ崪灞剧叀鐠囥垹鍩涢弬? * - 婢跺嫮鎮婄紒鍫㈩伂娴滃娆㈤崪灞绢偨鏉╁孩绉烽幁? * - 缂佸瓨濮㈢痪璺ㄢ柤韫囶偆鍙庢惔蹇撳灙閸欏嘲鎷版禍瀣╂缂傛挸鍟? */
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
 * 濡楀矂娼版い鍦窗瀵洖顕辩紒鍕
 * @description 婢跺嫮鎮婂宀勬桨鎼存梻鏁ら惃鍕€嶉惄顔煎灥婵瀵查柅鏄忕帆閿涘瞼鈥樻穱婵嬨€嶉惄顔芥殶閹诡喗顒滅涵顔煎鏉? */
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

    // Shell 鐠併垽妲勯柅姘埗娴兼艾鍨垫慨瀣娓氀嗙珶閺嶅繑鏆熼幑顔衡偓鍌氼洤閺嬫粓銆嶉惄顔款攽缂傚搫銇戞担鍡楃摠閸︺劍妞跨捄鍐殠缁嬪绱?    // 閸︺劍甯撮崣妤€鎻╅悡褌绠ｉ崜宥呭帥鏉╂稖顢戞穱顔碱槻
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

  // 濡楀矂娼扮粩顖滄畱閺佺増宓侀崚婵嗩潗閸栨牠鈧艾鐖堕柅姘崇箖 EventRouter 閻ㄥ嫰銆嶉惄顔兼嫲缂傛牗甯撻崥灞绢劄閺夈儱鐣幋?  return null;
}
