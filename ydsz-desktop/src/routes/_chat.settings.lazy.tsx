/**
 * @file 设置页面路由模块
 * @description 渲染独立的设置界面，包含专属的分section侧边栏和分组面板。
 *   支持的功能包括：
 *   1. 提供者管理（添加、配置、排序 Provider）
 *   2. 外观设置（主题、字体、语言）
 *   3. 通知设置（浏览器通知权限管理）
 *   4. 快捷键配置
 *   5. 工作区和工作树管理
 *   6. 模型渠道配置（服务商网关）
 *   7. 版本历史和更新检查
 * @layer 路由层
 * @depends SettingsNavItems, AppSettings, ServerConfig, ThemePackEditor
 */

import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ThreadId,
  DEFAULT_GIT_TEXT_GENERATION_MODEL,
} from "@ydsz-buddy/contracts";
import { useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getModelOptions, normalizeModelSlug } from "@njydsz/shared/model";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_CHAT_FONT_SIZE_PX,
  getCustomModelsForProvider,
  getGitTextGenerationModelOptions,
  MAX_CUSTOM_MODEL_LENGTH,
  MIN_CHAT_FONT_SIZE_PX,
  MODEL_PROVIDER_SETTINGS,
  normalizeChatFontSizePx,
  patchCustomModels,
  type LanguageSetting,
  useAppSettings,
} from "../appSettings";
import { APP_VERSION } from "../branding";
import { SidebarHeaderNavigationControls } from "../components/SidebarHeaderNavigationControls";
import { WindowCaptionButtons } from "../components/WindowCaptionButtons";
import { CostBudgetPanel } from "../components/CostBudgetPanel";
import { TeamRulesView } from "../components/TeamRulesView";
import { OfficeTemplateLibrary } from "../components/OfficeTemplateLibrary";
import { PushChannelPanel } from "../components/PushChannelPanel";
import { useDesktopTopBarTrafficLightGutterClassName } from "../hooks/useDesktopTopBarGutter";
import {
  ClaudeAI,
  CursorIcon,
  Gemini,
  GrokIcon,
  KiloIcon,
  OpenAI,
  OpenCodeIcon,
  PiIcon,
} from "../components/Icons";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { toastManager } from "../components/ui/toast";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../components/ui/dialog";
import { ThemePackEditor } from "../components/ThemePackEditor";
import { SidebarHeaderTrigger, SidebarInset } from "../components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { resolveAndPersistPreferredEditor } from "../editorPreferences";
import { isDesktop, isTauri, isDesktopDevMinimalHooks } from "../env";
import { useTheme } from "../hooks/useTheme";
import {
  FONT_SIZE_SCALES,
  useFontSizeScale,
  type FontSizeScale,
} from "../hooks/useFontSizeScale";
import {
  FontSizeSlider,
  FONT_SIZE_PERCENT_DEFAULT,
  useFontSizePercent,
} from "../components/FontSizeSlider";
import {
  useHighContrastDetection,
  type HighContrastMode,
} from "../hooks/useHighContrastDetection";
import { useFrameRateMonitor, type PerformanceMode } from "../hooks/useFrameRateMonitor";
import { gitRemoveWorktreeMutationOptions } from "../lib/gitReactQuery";
import {
  ArchiveIcon,
  ChevronDownIcon,
  PlusIcon,
  RotateCcwIcon,
  Undo2Icon,
  XIcon,
  EllipsisIcon,
  TerminalIcon,
  RocketIcon,
  MessageCircleIcon,
  FlagIcon,
  CheckIcon as CheckIcon2,
  InfoIcon,
} from "../lib/icons";
import {
  serverConfigQueryOptions,
  serverQueryKeys,
  serverWorktreesQueryOptions,
} from "../lib/serverReactQuery";
import { cn, isMacPlatform } from "../lib/utils";
import { newCommandId } from "../lib/utils";
import { ensureNativeApi, readNativeApi } from "../nativeApi";
import {
  buildNotificationSettingsSupportText,
  readBrowserNotificationPermissionState,
  requestBrowserNotificationPermission,
} from "../notifications/taskCompletion";
import { setFeatureFlagEnabled, useFeatureFlags } from "../featureFlags";
import { normalizeSettingsSection, useSettingsNavItems } from "../settingsNavigation";
import { NATIVE_LANGUAGE_LABELS, SUPPORTED_LANGUAGES, useMessages } from "../i18n";
import { useStore } from "../store";
import ReleaseHistoryDialog from "../components/ReleaseHistoryDialog";
import { createAllThreadsSelector } from "../storeSelectors";
import { formatRelativeTime } from "../components/Sidebar";
import { formatWorktreePathForDisplay } from "../worktreeCleanup";
import { sameProviderOrder } from "../providerOrdering";
import {
  CodingPlanQuotaPanel,
  type CodingPlanProviderId,
} from "../components/CodingPlanQuotaPanel";
import { useCodingPlanQuota } from "../hooks/useCodingPlanQuota";
import { AuthorizedDirsPanel } from "../components/AuthorizedDirsPanel";
import { CredentialStoragePanel } from "../components/CredentialStoragePanel";
import { McpSettingsPanel } from "../components/McpSettingsPanel";
import { SshConnectionConfig } from "../components/SshConnectionConfig";
import { ImageGenerationPanel } from "../components/ImageGenerationPanel";
import { IMIntegrationSettings } from "../components/IMIntegrationSettings";
import { MobileRemoteSettings } from "../components/MobileRemoteSettings";
import { LegalDocumentsSettingsCard } from "../components/TermsAcceptanceGate";
import { useWorkspaceStore } from "../workspaceStore";

// ── Settings taxonomy ──────────────────────────────────────────────────────

// ── Settings UI primitives ────────────────────────────────────────────────

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="space-y-0.5 px-1">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SettingsRow({
  title,
  description,
  status,
  resetAction,
  control,
  children,
  onClick,
}: {
  title: string;
  description: string;
  status?: ReactNode;
  resetAction?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-(--color-border-light) bg-(--color-background-panel) px-4 py-3.5 transition-colors hover:bg-(--sidebar-accent)"
      data-slot="settings-row"
    >
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          onClick && "cursor-pointer",
        )}
        onClick={onClick}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-h-5 items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
              {resetAction}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
          {status ? <div className="pt-1 text-[11px] text-muted-foreground">{status}</div> : null}
        </div>
        {control ? (
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            {control}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SettingResetButton({
  label,
  onClick,
  tooltip,
  ariaLabel,
}: {
  label: string;
  onClick: () => void;
  tooltip?: string;
  ariaLabel?: string;
}) {
  const resolvedTooltip = tooltip ?? "Reset to default";
  const resolvedAriaLabel = ariaLabel ?? `Reset ${label} to default`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={resolvedAriaLabel}
            className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            <Undo2Icon className="size-3" />
          </Button>
        }
      />
      <TooltipPopup side="top">{resolvedTooltip}</TooltipPopup>
    </Tooltip>
  );
}

function normalizeManagedWorktreePath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

// ── Route screen ───────────────────────────────────────────────────────────

export function Component() {
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const activeSection = normalizeSettingsSection(routeSearch.section);
  const settingsTarget = typeof routeSearch.target === "string" ? routeSearch.target : null;
  const messages = useMessages();
  const localizedNavItems = useSettingsNavItems();
  const activeSectionItem =
    localizedNavItems.find((item) => item.id === activeSection) ?? localizedNavItems[0]!;
  const featureFlags = useFeatureFlags();

  const { isDefaultActiveTheme, resetAllThemes, resolvedTheme, theme, setTheme } = useTheme();
  const { fontSizeScale, setFontSizeScale, resetFontSizeScale } = useFontSizeScale();
  const { percent: fontSizePercent, setPercent: setFontSizePercent, resetPercent: resetFontSizePercent } =
    useFontSizePercent();
  const {
    highContrastMode,
    setHighContrastMode,
    resetHighContrastMode,
    systemPrefersContrast,
  } = useHighContrastDetection();
  const {
    frameRate,
    performanceMode,
    hasUserOverride,
    setPerformanceMode,
    clearPerformanceOverride,
  } = isDesktopDevMinimalHooks
    ? { frameRate: 60, performanceMode: "normal" as PerformanceMode, hasUserOverride: false, setPerformanceMode: () => {}, clearPerformanceOverride: () => {} }
    : useFrameRateMonitor();
  const { settings, defaults, updateSettings, resetSettings } = useAppSettings();
  const desktopTopBarTrafficLightGutterClassName = useDesktopTopBarTrafficLightGutterClassName();
  const queryClient = useQueryClient();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const serverWorktreesQuery = useQuery(serverWorktreesQueryOptions());
  const removeWorktreeMutation = useMutation(gitRemoveWorktreeMutationOptions({ queryClient }));
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const threads = useStore(useMemo(() => createAllThreadsSelector(), []));
  const projects = useStore((store) => store.projects);
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  // 当前活动工作区根目录（供 MCP / SSH 配置使用）
  const activeWorkspaceCwd = useWorkspaceStore((store) => {
    const active = store.workspacePages.find((w) => w.id === store.activeWorkspaceId);
    return active?.cwd ?? active?.worktreePath ?? null;
  });
  // 国内 Coding Plan 配额（GLM/DeepSeek/Moonshot/Qwen 4 家）
  const {
    snapshots: codingPlanSnapshots,
    refresh: codingPlanRefresh,
  } = useCodingPlanQuota({ enablePolling: false });
  const handleCodingPlanBind = useCallback((_provider: CodingPlanProviderId) => {
    // Provider 安装区块已移除，此回调保留为空以保持接口兼容
  }, []);
  const archivedThreads = threads.filter((thread) => thread.archivedAt != null);
  const shouldOfferRecoveryTools = useMemo(() => {
    if (!threadsHydrated || projects.length === 0) {
      return false;
    }
    return threads.length === 0 || threads.every((thread) => thread.messages.length === 0);
  }, [projects.length, threads, threadsHydrated]);

  const [isOpeningKeybindings, setIsOpeningKeybindings] = useState(false);
  const [isRepairingLocalState, setIsRepairingLocalState] = useState(false);
  const [showRecoveryTools, setShowRecoveryTools] = useState(false);
  const [releaseHistoryOpen, setReleaseHistoryOpen] = useState(false);
  const [openKeybindingsError, setOpenKeybindingsError] = useState<string | null>(null);
  // Agent 工具权限级别（本地存储，非服务器设置）
  const [agentToolPermission, setAgentToolPermission] = useState<string>(() => {
    if (typeof window === "undefined") return "fileReadWriteAll";
    return window.localStorage.getItem("ydsz-buddy:agent-tool-permission") || "fileReadWriteAll";
  });
  const handleAgentToolPermissionChange = useCallback((value: string) => {
    setAgentToolPermission(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ydsz-buddy:agent-tool-permission", value);
    }
  }, []);
  const providerUpdatesRef = useRef<HTMLDivElement | null>(null);
  const [selectedCustomModelProvider, setSelectedCustomModelProvider] =
    useState<ProviderKind>("codex");
  const [customModelInputByProvider, setCustomModelInputByProvider] = useState<
    Record<ProviderKind, string>
  >({
    codex: "",
    claudeAgent: "",
    cursor: "",
    gemini: "",
    grok: "",
    kilo: "",
    opencode: "",
    pi: "",
    glm: "",
    deepseek: "",
    moonshot: "",
    qwen: "",
    mimo: "",
    MiniMax: "",
    // 新增 3 家国内 Provider
    doubao: "",
    ernie: "",
    hunyuan: "",
  });
  const [customModelErrorByProvider, setCustomModelErrorByProvider] = useState<
    Partial<Record<ProviderKind, string | null>>
  >({});
  const [showAllCustomModels, setShowAllCustomModels] = useState(false);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState(
    readBrowserNotificationPermissionState(),
  );
  const shouldShowFontSmoothing = isMacPlatform(
    typeof navigator === "undefined" ? "" : navigator.platform,
  );

  const hiddenProviderSet = useMemo(
    () => new Set<ProviderKind>(settings.hiddenProviders),
    [settings.hiddenProviders],
  );
  const hiddenProviderCount = hiddenProviderSet.size;
  const isProviderOrderDirty = !sameProviderOrder(settings.providerOrder, defaults.providerOrder);
  const keybindingsConfigPath = serverConfigQuery.data?.keybindingsConfigPath ?? null;
  const availableEditors = serverConfigQuery.data?.availableEditors;
  const shouldFocusProviderUpdates =
    activeSection === "agent" && settingsTarget === "provider-updates";

  useEffect(() => {
    if (!shouldFocusProviderUpdates) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      providerUpdatesRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [serverConfigQuery.data?.providers, shouldFocusProviderUpdates]);
  const managedWorktrees = serverWorktreesQuery.data?.worktrees ?? [];
  const worktreesByWorkspaceRoot = managedWorktrees.reduce<
    Array<{
      workspaceRoot: string;
      worktrees: Array<{
        path: string;
        linkedThreads: typeof threads;
      }>;
    }>
  >((groups, worktree) => {
    const linkedThreads = threads.filter((thread) => {
      const candidatePaths = [
        normalizeManagedWorktreePath(thread.worktreePath),
        normalizeManagedWorktreePath(thread.associatedWorktreePath),
      ];
      return candidatePaths.includes(worktree.path);
    });
    const existingGroup = groups.find((group) => group.workspaceRoot === worktree.workspaceRoot);
    const nextWorktree = {
      path: worktree.path,
      linkedThreads,
    };
    if (existingGroup) {
      existingGroup.worktrees.push(nextWorktree);
    } else {
      groups.push({
        workspaceRoot: worktree.workspaceRoot,
        worktrees: [nextWorktree],
      });
    }
    return groups;
  }, []);

  const gitTextGenerationModelOptions = getGitTextGenerationModelOptions(settings);
  const currentGitTextGenerationProvider = settings.textGenerationProvider ?? "codex";
  const currentGitTextGenerationModel =
    settings.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL;
  const currentGitTextGenerationValue = `${currentGitTextGenerationProvider}:${currentGitTextGenerationModel}`;
  const defaultGitTextGenerationProvider = defaults.textGenerationProvider ?? "codex";
  const defaultGitTextGenerationModel =
    defaults.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL;
  const isGitTextGenerationModelDirty =
    currentGitTextGenerationProvider !== defaultGitTextGenerationProvider ||
    currentGitTextGenerationModel !== defaultGitTextGenerationModel;
  const selectedGitTextGenerationModelLabel =
    gitTextGenerationModelOptions.find(
      (option) =>
        option.provider === currentGitTextGenerationProvider &&
        option.slug === currentGitTextGenerationModel,
    )?.name ?? currentGitTextGenerationModel;
  const selectedCustomModelProviderSettings = MODEL_PROVIDER_SETTINGS.find(
    (providerSettings) => providerSettings.provider === selectedCustomModelProvider,
  )!;
  const selectedCustomModelInput = customModelInputByProvider[selectedCustomModelProvider];
  const selectedCustomModelError = customModelErrorByProvider[selectedCustomModelProvider] ?? null;
  const totalCustomModels =
    settings.customCodexModels.length +
    settings.customClaudeModels.length +
    settings.customCursorModels.length +
    settings.customGeminiModels.length +
    settings.customGrokModels.length +
    settings.customKiloModels.length +
    settings.customOpenCodeModels.length +
    settings.customPiModels.length;
  const savedCustomModelRows = MODEL_PROVIDER_SETTINGS.flatMap((providerSettings) =>
    getCustomModelsForProvider(settings, providerSettings.provider).map((slug) => ({
      key: `${providerSettings.provider}:${slug}`,
      provider: providerSettings.provider,
      providerTitle: providerSettings.title,
      slug,
    })),
  );
  const visibleCustomModelRows = showAllCustomModels
    ? savedCustomModelRows
    : savedCustomModelRows.slice(0, 5);
  const isInstallSettingsDirty =
    settings.claudeBinaryPath !== defaults.claudeBinaryPath ||
    settings.cursorBinaryPath !== defaults.cursorBinaryPath ||
    settings.cursorApiEndpoint !== defaults.cursorApiEndpoint ||
    settings.geminiBinaryPath !== defaults.geminiBinaryPath ||
    settings.grokBinaryPath !== defaults.grokBinaryPath ||
    settings.kiloBinaryPath !== defaults.kiloBinaryPath ||
    settings.kiloServerUrl !== defaults.kiloServerUrl ||
    settings.kiloServerPassword !== defaults.kiloServerPassword ||
    settings.codexBinaryPath !== defaults.codexBinaryPath ||
    settings.codexHomePath !== defaults.codexHomePath ||
    settings.openCodeBinaryPath !== defaults.openCodeBinaryPath ||
    settings.openCodeServerUrl !== defaults.openCodeServerUrl ||
    settings.openCodeServerPassword !== defaults.openCodeServerPassword ||
    settings.piBinaryPath !== defaults.piBinaryPath ||
    settings.piAgentDir !== defaults.piAgentDir;

  const changedSettingLabels = [
    ...(theme !== "system" ? [messages.settings.changedSettingLabel.theme] : []),
    ...(!isDefaultActiveTheme
      ? [
          resolvedTheme === "dark"
            ? messages.settings.changedSettingLabel.darkThemePack
            : messages.settings.changedSettingLabel.lightThemePack,
        ]
      : []),
    ...(settings.defaultProvider !== defaults.defaultProvider
      ? [messages.settings.changedSettingLabel.defaultProvider]
      : []),
    ...(settings.defaultThreadEnvMode !== defaults.defaultThreadEnvMode
      ? [messages.settings.changedSettingLabel.newThreadMode]
      : []),
    ...(settings.sidebarSide !== defaults.sidebarSide
      ? [messages.settings.changedSettingLabel.sidebarPosition]
      : []),
    ...(settings.sidebarProjectSortOrder !== defaults.sidebarProjectSortOrder
      ? [messages.settings.changedSettingLabel.projectSortOrder]
      : []),
    ...(settings.sidebarThreadSortOrder !== defaults.sidebarThreadSortOrder
      ? [messages.settings.changedSettingLabel.threadSortOrder]
      : []),
    ...(settings.uiFontFamily !== defaults.uiFontFamily
      ? [messages.settings.changedSettingLabel.uiFont]
      : []),
    ...(settings.chatCodeFontFamily !== defaults.chatCodeFontFamily
      ? [messages.settings.changedSettingLabel.codeFont]
      : []),
    ...(settings.chatFontSizePx !== defaults.chatFontSizePx
      ? [messages.settings.changedSettingLabel.baseFontSize]
      : []),
    ...(shouldShowFontSmoothing &&
    settings.enableNativeFontSmoothing !== defaults.enableNativeFontSmoothing
      ? [messages.settings.changedSettingLabel.fontSmoothing]
      : []),
    ...(settings.timestampFormat !== defaults.timestampFormat
      ? [messages.settings.changedSettingLabel.timeFormat]
      : []),
    ...(settings.enableTaskCompletionToasts !== defaults.enableTaskCompletionToasts
      ? [messages.settings.changedSettingLabel.activityToasts]
      : []),
    ...(settings.enableSystemTaskCompletionNotifications !==
    defaults.enableSystemTaskCompletionNotifications
      ? [messages.settings.changedSettingLabel.desktopNotifications]
      : []),
    ...(settings.enableAssistantStreaming !== defaults.enableAssistantStreaming
      ? [messages.settings.changedSettingLabel.assistantOutput]
      : []),
    ...(settings.enableVoicePolish !== defaults.enableVoicePolish
      ? [messages.settings.changedSettingLabel.voicePolish]
      : []),
    ...(settings.diffWordWrap !== defaults.diffWordWrap
      ? [messages.settings.changedSettingLabel.diffLineWrapping]
      : []),
    ...(settings.confirmThreadDelete !== defaults.confirmThreadDelete
      ? [messages.settings.changedSettingLabel.deleteConfirmation]
      : []),
    ...(settings.confirmThreadArchive !== defaults.confirmThreadArchive
      ? [messages.settings.changedSettingLabel.archiveConfirmation]
      : []),
    ...(settings.confirmTerminalTabClose !== defaults.confirmTerminalTabClose
      ? [messages.settings.changedSettingLabel.terminalCloseConfirmation]
      : []),
    ...(isGitTextGenerationModelDirty
      ? [messages.settings.changedSettingLabel.gitWritingModel]
      : []),
    ...(settings.customCodexModels.length > 0 ||
    settings.customClaudeModels.length > 0 ||
    settings.customCursorModels.length > 0 ||
    settings.customGeminiModels.length > 0 ||
    settings.customGrokModels.length > 0 ||
    settings.customKiloModels.length > 0 ||
    settings.customOpenCodeModels.length > 0 ||
    settings.customPiModels.length > 0
      ? [messages.settings.changedSettingLabel.customModels]
      : []),
    ...(isInstallSettingsDirty ? [messages.settings.changedSettingLabel.providerInstalls] : []),
    ...(hiddenProviderCount > 0 ? [messages.settings.changedSettingLabel.providerVisibility] : []),
    ...(isProviderOrderDirty ? [messages.settings.changedSettingLabel.providerOrder] : []),
  ];

  const openKeybindingsFile = useCallback(() => {
    if (!keybindingsConfigPath) return;
    setOpenKeybindingsError(null);
    setIsOpeningKeybindings(true);
    const api = ensureNativeApi();
    const editor = resolveAndPersistPreferredEditor(availableEditors ?? []);
    if (!editor) {
      setOpenKeybindingsError("No available editors found.");
      setIsOpeningKeybindings(false);
      return;
    }
    void api.shell
      .openInEditor(keybindingsConfigPath, editor)
      .catch((error) => {
        setOpenKeybindingsError(
          error instanceof Error ? error.message : "Unable to open keybindings file.",
        );
      })
      .finally(() => {
        setIsOpeningKeybindings(false);
      });
  }, [availableEditors, keybindingsConfigPath]);

  useEffect(() => {
    setBrowserNotificationPermission(readBrowserNotificationPermissionState());
  }, []);

  const addCustomModel = useCallback(
    (provider: ProviderKind) => {
      const customModelInput = customModelInputByProvider[provider];
      const customModels = getCustomModelsForProvider(settings, provider);
      const normalized = normalizeModelSlug(customModelInput, provider);
      if (!normalized) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "Enter a model slug.",
        }));
        return;
      }
      if (getModelOptions(provider).some((option) => option.slug === normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "That model is already built in.",
        }));
        return;
      }
      if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: `Model slugs must be ${MAX_CUSTOM_MODEL_LENGTH} characters or less.`,
        }));
        return;
      }
      if (customModels.includes(normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "That custom model is already saved.",
        }));
        return;
      }

      updateSettings(patchCustomModels(provider, [...customModels, normalized]));
      setCustomModelInputByProvider((existing) => ({
        ...existing,
        [provider]: "",
      }));
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
    },
    [customModelInputByProvider, settings, updateSettings],
  );

  const removeCustomModel = useCallback(
    (provider: ProviderKind, slug: string) => {
      const customModels = getCustomModelsForProvider(settings, provider);
      updateSettings(
        patchCustomModels(
          provider,
          customModels.filter((model) => model !== slug),
        ),
      );
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
    },
    [settings, updateSettings],
  );

  async function restoreDefaults() {
    if (changedSettingLabels.length === 0) return;

    const api = readNativeApi();
    const confirmed = await (api ?? ensureNativeApi()).dialogs.confirm(
      ["Restore default settings?", `This will reset: ${changedSettingLabels.join(", ")}.`].join(
        "\n",
      ),
    );
    if (!confirmed) return;

    setTheme("system");
    resetAllThemes();
    resetSettings();
    setSelectedCustomModelProvider("codex");
    setCustomModelInputByProvider({
      codex: "",
      claudeAgent: "",
      cursor: "",
      gemini: "",
      grok: "",
      kilo: "",
      opencode: "",
      pi: "",
      glm: "",
      deepseek: "",
      moonshot: "",
      qwen: "",
      mimo: "",
      MiniMax: "",
      // 新增 3 家国内 Provider
      doubao: "",
      ernie: "",
      hunyuan: "",
    });
    setCustomModelErrorByProvider({});
    setShowAllCustomModels(false);
    setShowRecoveryTools(false);
    setOpenKeybindingsError(null);
  }

  async function setSystemNotificationsEnabled(nextEnabled: boolean) {
    if (!nextEnabled) {
      updateSettings({ enableSystemTaskCompletionNotifications: false });
      return;
    }

    if (isTauri) {
      updateSettings({ enableSystemTaskCompletionNotifications: true });
      return;
    }

    const permission = await requestBrowserNotificationPermission();
    setBrowserNotificationPermission(permission);

    if (permission === "granted") {
      updateSettings({ enableSystemTaskCompletionNotifications: true });
      return;
    }

    updateSettings({ enableSystemTaskCompletionNotifications: false });
    toastManager.add({
      type: permission === "denied" ? "warning" : "error",
      title: "Desktop notifications unavailable",
      description: buildNotificationSettingsSupportText(permission),
    });
  }

  async function sendTestNotification() {
    const title = "Activity notification";
    const body = "Notification test for chats and terminal agents.";

    if (window.desktopBridge) {
      const shown = await window.desktopBridge.notifications.show({ title, body, silent: false });
      toastManager.add({
        type: shown ? "success" : "warning",
        title: shown ? "Test notification sent" : "Notifications unavailable",
        description: shown
          ? "Your operating system should show the notification."
          : "Desktop notifications are not supported on this device.",
      });
      return;
    }

    const permission = await requestBrowserNotificationPermission();
    setBrowserNotificationPermission(permission);
    if (permission !== "granted") {
      toastManager.add({
        type: permission === "denied" ? "warning" : "error",
        title: "Desktop notifications unavailable",
        description: buildNotificationSettingsSupportText(permission),
      });
      return;
    }

    const notification = new Notification(title, { body, tag: "ydsz-buddy:test-notification" });
    notification.addEventListener("click", () => {
      window.focus();
    });
    toastManager.add({
      type: "success",
      title: "Test notification sent",
      description: "Your browser should show the notification.",
    });
  }

  // Rebuild the local project indexes after an older install leaves them out of sync.
  const repairLocalState = useCallback(async () => {
    if (isRepairingLocalState) {
      return;
    }

    const api = readNativeApi() ?? ensureNativeApi();
    const confirmed = await api.dialogs.confirm(
      [
        "Repair local state?",
        "This rebuilds local project indexes and refreshes project snapshots.",
        "It keeps existing chats in place, but it may take a moment.",
      ].join("\n"),
    );
    if (!confirmed) {
      return;
    }

    setIsRepairingLocalState(true);
    try {
      const snapshot = await api.orchestration.repairState();
      syncServerReadModel(snapshot);
      toastManager.add({
        type: "success",
        title: "Local state repaired",
        description: "Project indexes were rebuilt without clearing existing chats.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Repair failed",
        description: error instanceof Error ? error.message : "Unable to repair local state.",
      });
    } finally {
      setIsRepairingLocalState(false);
    }
  }, [isRepairingLocalState, syncServerReadModel]);

  const deleteManagedWorktree = useCallback(
    async (input: { workspaceRoot: string; worktreePath: string }) => {
      const api = readNativeApi() ?? ensureNativeApi();
      const displayName = formatWorktreePathForDisplay(input.worktreePath);
      const snapshot = await api.orchestration.getShellSnapshot().catch(() => null);
      if (snapshot === null) {
        toastManager.add({
          type: "error",
          title: "Could not verify linked conversations",
          description: "Retry once the app reconnects to the server.",
        });
        return;
      }

      const linkedThreadsFromSnapshot = snapshot.threads.filter((thread) => {
        const candidatePaths = [
          normalizeManagedWorktreePath(thread.worktreePath),
          normalizeManagedWorktreePath(thread.associatedWorktreePath ?? null),
        ];
        return candidatePaths.includes(input.worktreePath);
      });
      const linkedArchivedThreadIds = linkedThreadsFromSnapshot
        .filter((thread) => (thread.archivedAt ?? null) !== null)
        .map((thread) => thread.id);
      const linkedActiveThreadCount = linkedThreadsFromSnapshot.filter(
        (thread) => (thread.archivedAt ?? null) === null,
      ).length;
      const linkedConversationCount = linkedActiveThreadCount + linkedArchivedThreadIds.length;
      const confirmed = await api.dialogs.confirm(
        linkedConversationCount > 0
          ? [
              `Delete worktree "${displayName}"?`,
              "",
              `${linkedActiveThreadCount} active and ${linkedArchivedThreadIds.length} archived conversation${linkedConversationCount === 1 ? " is" : "s are"} linked to this worktree.`,
              linkedArchivedThreadIds.length > 0
                ? "Archived conversations will be deleted first."
                : "Deleting it can break reopening those chats in the same workspace.",
              "",
              "Delete the worktree anyway?",
            ].join("\n")
          : [`Delete worktree "${displayName}"?`, "This removes the Git worktree from disk."].join(
              "\n",
            ),
      );
      if (!confirmed) {
        return;
      }

      try {
        for (const archivedThreadId of linkedArchivedThreadIds) {
          await api.orchestration.dispatchCommand({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId: archivedThreadId,
          });
        }

        await removeWorktreeMutation.mutateAsync({
          cwd: input.workspaceRoot,
          path: input.worktreePath,
          force: true,
        });
        await queryClient.invalidateQueries({
          queryKey: serverQueryKeys.worktrees(),
        });
        toastManager.add({
          type: "success",
          title: "Worktree deleted",
          description:
            linkedArchivedThreadIds.length > 0
              ? `${displayName} was removed and ${linkedArchivedThreadIds.length} archived conversation${linkedArchivedThreadIds.length === 1 ? "" : "s"} were deleted.`
              : `${displayName} was removed.`,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not delete worktree",
          description: error instanceof Error ? error.message : "Unable to delete the worktree.",
        });
      }
    },
    [queryClient, removeWorktreeMutation],
  );

  const unarchiveThread = useCallback(async (threadId: ThreadId) => {
    const api = readNativeApi();
    if (!api) return;
    try {
      await api.orchestration.dispatchCommand({
        type: "thread.unarchive",
        commandId: newCommandId(),
        threadId,
      });
      toastManager.add({
        type: "success",
        title: "Thread restored",
        description: "The thread has been moved back to the sidebar.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not restore thread",
        description: error instanceof Error ? error.message : "Unable to restore the thread.",
      });
    }
  }, []);

  const deleteArchivedThread = useCallback(async (threadId: ThreadId, threadTitle: string) => {
    const api = readNativeApi();
    if (!api) return;

    const confirmed = await api.dialogs.confirm(
      `Permanently delete "${threadTitle}"?\n\nThis will remove the thread and its conversation history forever.`,
    );
    if (!confirmed) return;

    try {
      await api.orchestration.dispatchCommand({
        type: "thread.delete",
        commandId: newCommandId(),
        threadId,
      });
      toastManager.add({
        type: "success",
        title: "Thread deleted",
        description: "The archived thread has been permanently removed.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not delete thread",
        description: error instanceof Error ? error.message : "Unable to delete the thread.",
      });
    }
  }, []);

  const handleArchivedThreadContextMenu = useCallback(
    async (threadId: ThreadId, threadTitle: string, position: { x: number; y: number }) => {
      const api = readNativeApi();
      if (!api) return;

      const clicked = await api.contextMenu.show(
        [
          { id: "restore", label: "Restore" },
          { id: "delete", label: "Delete", destructive: true },
        ],
        position,
      );

      if (clicked === "restore") {
        await unarchiveThread(threadId);
        return;
      }

      if (clicked === "delete") {
        await deleteArchivedThread(threadId, threadTitle);
      }
    },
    [deleteArchivedThread, unarchiveThread],
  );

  const renderGeneralPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.general.coreDefaults}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.general.language.title}
            description={messages.settings.general.language.description}
            resetAction={
              settings.language !== defaults.language ? (
                <SettingResetButton
                  label={messages.settings.general.language.title.toLowerCase()}
                  onClick={() => updateSettings({ language: defaults.language })}
                />
              ) : null
            }
            control={
              <Select
                value={settings.language}
                onValueChange={(value) => {
                  if (!SUPPORTED_LANGUAGES.includes(value as LanguageSetting)) {
                    return;
                  }
                  updateSettings({ language: value as LanguageSetting });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.language.title}
                >
                  <SelectValue>{NATIVE_LANGUAGE_LABELS[settings.language as LanguageSetting]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <SelectItem key={language} hideIndicator value={language}>
                      {NATIVE_LANGUAGE_LABELS[language]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title={messages.settings.general.defaultProvider.title}
            description={messages.settings.general.defaultProvider.description}
            resetAction={
              settings.defaultProvider !== defaults.defaultProvider ? (
                <SettingResetButton
                  label={messages.settings.general.defaultProvider.resetLabel}
                  onClick={() => updateSettings({ defaultProvider: defaults.defaultProvider })}
                />
              ) : null
            }
            control={
              <Select
                value={settings.defaultProvider}
                onValueChange={(value) => {
                  if (
                    value !== "codex" &&
                    value !== "claudeAgent" &&
                    value !== "cursor" &&
                    value !== "gemini" &&
                    value !== "grok" &&
                    value !== "kilo" &&
                    value !== "opencode" &&
                    value !== "pi"
                  ) {
                    return;
                  }
                  updateSettings({ defaultProvider: value });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.defaultProvider.title}
                >
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      {settings.defaultProvider === "claudeAgent" ? (
                        <ClaudeAI className="size-3.5 text-foreground" />
                      ) : settings.defaultProvider === "cursor" ? (
                        <CursorIcon className="size-3.5 text-foreground" />
                      ) : settings.defaultProvider === "gemini" ? (
                        <Gemini className="size-3.5 text-foreground" />
                      ) : settings.defaultProvider === "grok" ? (
                        <GrokIcon className="size-3.5 text-foreground" />
                      ) : settings.defaultProvider === "kilo" ? (
                        <KiloIcon className="size-3.5 text-muted-foreground/70" />
                      ) : settings.defaultProvider === "opencode" ? (
                        <OpenCodeIcon className="size-3.5 text-muted-foreground/70" />
                      ) : settings.defaultProvider === "pi" ? (
                        <PiIcon className="size-3.5 text-foreground" />
                      ) : (
                        <OpenAI className="size-3.5" />
                      )}
                      {PROVIDER_DISPLAY_NAMES[settings.defaultProvider ?? "codex"]}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="codex">
                    <span className="flex items-center gap-2">
                      <OpenAI className="size-3.5" />
                      Codex
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="claudeAgent">
                    <span className="flex items-center gap-2">
                      <ClaudeAI className="size-3.5 text-foreground" />
                      Claude
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="cursor">
                    <span className="flex items-center gap-2">
                      <CursorIcon className="size-3.5 text-foreground" />
                      Cursor
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="gemini">
                    <span className="flex items-center gap-2">
                      <Gemini className="size-3.5 text-foreground" />
                      Gemini
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="grok">
                    <span className="flex items-center gap-2">
                      <GrokIcon className="size-3.5 text-foreground" />
                      Grok
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="opencode">
                    <span className="flex items-center gap-2">
                      <OpenCodeIcon className="size-3.5 text-muted-foreground/70" />
                      OpenCode
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="kilo">
                    <span className="flex items-center gap-2">
                      <KiloIcon className="size-3.5 text-muted-foreground/70" />
                      Kilo
                    </span>
                  </SelectItem>
                  <SelectItem hideIndicator value="pi">
                    <span className="flex items-center gap-2">
                      <PiIcon className="size-3.5 text-foreground" />
                      Pi
                    </span>
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title={messages.settings.general.newThreads.title}
            description={messages.settings.general.newThreads.description}
            resetAction={
              settings.defaultThreadEnvMode !== defaults.defaultThreadEnvMode ? (
                <SettingResetButton
                  label={messages.settings.general.newThreads.resetLabel}
                  onClick={() =>
                    updateSettings({
                      defaultThreadEnvMode: defaults.defaultThreadEnvMode,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.defaultThreadEnvMode}
                onValueChange={(value) => {
                  if (value !== "local" && value !== "worktree") return;
                  updateSettings({
                    defaultThreadEnvMode: value,
                  });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.newThreads.title}
                >
                  <SelectValue>
                    {settings.defaultThreadEnvMode === "worktree"
                      ? messages.settings.general.newThreads.worktree
                      : messages.settings.general.newThreads.local}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="local">
                    {messages.settings.general.newThreads.local}
                  </SelectItem>
                  <SelectItem hideIndicator value="worktree">
                    {messages.settings.general.newThreads.worktree}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title={messages.settings.general.sidebarOrganization}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.general.sidebarPosition.title}
            description={messages.settings.general.sidebarPosition.description}
            resetAction={
              settings.sidebarSide !== defaults.sidebarSide ? (
                <SettingResetButton
                  label={messages.settings.general.sidebarPosition.resetLabel}
                  onClick={() =>
                    updateSettings({
                      sidebarSide: defaults.sidebarSide,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.sidebarSide}
                onValueChange={(value) => {
                  if (value !== "left" && value !== "right") {
                    return;
                  }
                  updateSettings({ sidebarSide: value });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.sidebarPosition.title}
                >
                  <SelectValue>
                    {settings.sidebarSide === "left"
                      ? messages.settings.general.sidebarPosition.left
                      : messages.settings.general.sidebarPosition.right}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="left">
                    {messages.settings.general.sidebarPosition.left}
                  </SelectItem>
                  <SelectItem hideIndicator value="right">
                    {messages.settings.general.sidebarPosition.right}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title={messages.settings.general.projectOrder.title}
            description={messages.settings.general.projectOrder.description}
            resetAction={
              settings.sidebarProjectSortOrder !== defaults.sidebarProjectSortOrder ? (
                <SettingResetButton
                  label={messages.settings.general.projectOrder.resetLabel}
                  onClick={() =>
                    updateSettings({
                      sidebarProjectSortOrder: defaults.sidebarProjectSortOrder,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.sidebarProjectSortOrder}
                onValueChange={(value) => {
                  if (value !== "updated_at" && value !== "created_at" && value !== "manual") {
                    return;
                  }
                  updateSettings({ sidebarProjectSortOrder: value });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.projectOrder.title}
                >
                  <SelectValue>
                    {settings.sidebarProjectSortOrder === "updated_at"
                      ? messages.settings.general.projectOrder.recentlyActive
                      : settings.sidebarProjectSortOrder === "created_at"
                        ? messages.settings.general.projectOrder.recentlyAdded
                        : messages.settings.general.projectOrder.manual}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="updated_at">
                    {messages.settings.general.projectOrder.recentlyActive}
                  </SelectItem>
                  <SelectItem hideIndicator value="created_at">
                    {messages.settings.general.projectOrder.recentlyAdded}
                  </SelectItem>
                  <SelectItem hideIndicator value="manual">
                    {messages.settings.general.projectOrder.manual}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title={messages.settings.general.threadOrder.title}
            description={messages.settings.general.threadOrder.description}
            resetAction={
              settings.sidebarThreadSortOrder !== defaults.sidebarThreadSortOrder ? (
                <SettingResetButton
                  label={messages.settings.general.threadOrder.resetLabel}
                  onClick={() =>
                    updateSettings({
                      sidebarThreadSortOrder: defaults.sidebarThreadSortOrder,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.sidebarThreadSortOrder}
                onValueChange={(value) => {
                  if (value !== "updated_at" && value !== "created_at") {
                    return;
                  }
                  updateSettings({ sidebarThreadSortOrder: value });
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label={messages.settings.general.threadOrder.title}
                >
                  <SelectValue>
                    {settings.sidebarThreadSortOrder === "updated_at"
                      ? messages.settings.general.threadOrder.recentlyActive
                      : messages.settings.general.threadOrder.newestFirst}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="updated_at">
                    {messages.settings.general.threadOrder.recentlyActive}
                  </SelectItem>
                  <SelectItem hideIndicator value="created_at">
                    {messages.settings.general.threadOrder.newestFirst}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  const renderAppearancePanel = () => {
    const themeOptionLabels = {
      system: messages.settings.appearance.theme.system,
      light: messages.settings.appearance.theme.light,
      dark: messages.settings.appearance.theme.dark,
    } as const;
    const themeOptionDescriptions = {
      system: messages.settings.appearance.theme.systemDescription,
      light: messages.settings.appearance.theme.lightDescription,
      dark: messages.settings.appearance.theme.darkDescription,
    } as const;
    const themeOptions = [
      {
        value: "system" as const,
        label: themeOptionLabels.system,
        description: themeOptionDescriptions.system,
      },
      {
        value: "light" as const,
        label: themeOptionLabels.light,
        description: themeOptionDescriptions.light,
      },
      {
        value: "dark" as const,
        label: themeOptionLabels.dark,
        description: themeOptionDescriptions.dark,
      },
    ];
    const timestampLabels = {
      locale: messages.settings.appearance.timestamp.systemDefault,
      "12-hour": messages.settings.appearance.timestamp.twelveHour,
      "24-hour": messages.settings.appearance.timestamp.twentyFourHour,
    } as const;
    return (
      <div className="space-y-6">
        <SettingsSection title={messages.settings.appearance.themeAndTypographySection}>
          <div className="space-y-2">
            <SettingsRow
              title={messages.settings.appearance.theme.title}
              description={messages.settings.appearance.theme.description}
              resetAction={
                theme !== "system" ? (
                  <SettingResetButton
                    label={messages.settings.general.defaultProvider.resetLabel}
                    onClick={() => setTheme("system")}
                  />
                ) : null
              }
              control={
                <Select
                  value={theme}
                  onValueChange={(value) => {
                    if (value !== "system" && value !== "light" && value !== "dark") return;
                    setTheme(value);
                  }}
                >
                  <SelectTrigger
                    className="w-full sm:w-40"
                    aria-label={messages.settings.appearance.theme.title}
                  >
                    <SelectValue>
                      {theme === "light"
                        ? themeOptionLabels.light
                        : theme === "dark"
                          ? themeOptionLabels.dark
                          : themeOptionLabels.system}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {themeOptions.map((option) => (
                      <SelectItem hideIndicator key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              }
            />

            <div className="space-y-3 pt-1">
              {(resolvedTheme === "dark"
                ? (["dark", "light"] as const)
                : (["light", "dark"] as const)
              ).map((variant) => (
                <ThemePackEditor
                  key={variant}
                  variant={variant}
                  isActive={resolvedTheme === variant}
                  mode={theme}
                />
              ))}
            </div>

            <SettingsRow
              title={messages.settings.appearance.typography.uiFont}
              description={messages.settings.appearance.typography.uiFontDescription}
              resetAction={
                settings.uiFontFamily !== defaults.uiFontFamily ? (
                  <SettingResetButton
                    label={messages.settings.appearance.typography.uiFont}
                    onClick={() => updateSettings({ uiFontFamily: defaults.uiFontFamily })}
                  />
                ) : null
              }
              control={
                <Input
                  className="w-full text-right sm:w-48"
                  value={settings.uiFontFamily}
                  onChange={(event) => updateSettings({ uiFontFamily: event.target.value })}
                  placeholder="-apple-system, BlinkMacSystemFont"
                  spellCheck={false}
                  aria-label={messages.settings.appearance.typography.uiFontAria}
                />
              }
            />

            <SettingsRow
              title={messages.settings.appearance.typography.codeFont}
              description={messages.settings.appearance.typography.codeFontDescription}
              resetAction={
                settings.chatCodeFontFamily !== defaults.chatCodeFontFamily ? (
                  <SettingResetButton
                    label={messages.settings.appearance.typography.codeFont}
                    onClick={() =>
                      updateSettings({ chatCodeFontFamily: defaults.chatCodeFontFamily })
                    }
                  />
                ) : null
              }
              control={
                <Input
                  className="w-full text-right sm:w-48"
                  value={settings.chatCodeFontFamily}
                  onChange={(event) => updateSettings({ chatCodeFontFamily: event.target.value })}
                  placeholder={'"JetBrains Mono"'}
                  spellCheck={false}
                  aria-label={messages.settings.appearance.typography.codeFontAria}
                />
              }
            />

            <SettingsRow
              title={messages.settings.appearance.typography.baseFontSize}
              description={messages.settings.appearance.typography.baseFontSizeDescription}
              resetAction={
                settings.chatFontSizePx !== defaults.chatFontSizePx ? (
                  <SettingResetButton
                    label={messages.settings.appearance.typography.baseFontSize}
                    onClick={() =>
                      updateSettings({
                        chatFontSizePx: defaults.chatFontSizePx,
                      })
                    }
                  />
                ) : null
              }
              control={
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <Input
                    type="number"
                    min={MIN_CHAT_FONT_SIZE_PX}
                    max={MAX_CHAT_FONT_SIZE_PX}
                    step={1}
                    inputMode="numeric"
                    className="w-full text-right sm:w-20"
                    value={String(settings.chatFontSizePx)}
                    onChange={(event) => {
                      const nextValue = event.target.value.trim();
                      if (nextValue.length === 0) return;
                      updateSettings({
                        chatFontSizePx: normalizeChatFontSizePx(Number(nextValue)),
                      });
                    }}
                    aria-label={messages.settings.appearance.typography.baseFontSizeAria}
                  />
                  <span className="text-xs text-muted-foreground">
                    {messages.settings.appearance.typography.unitPx}
                  </span>
                </div>
              }
            />

            {shouldShowFontSmoothing ? (
              <SettingsRow
                title={messages.settings.appearance.typography.fontSmoothing}
                description={messages.settings.appearance.typography.fontSmoothingDescription}
                resetAction={
                  settings.enableNativeFontSmoothing !== defaults.enableNativeFontSmoothing ? (
                    <SettingResetButton
                      label={messages.settings.appearance.typography.fontSmoothing}
                      onClick={() =>
                        updateSettings({
                          enableNativeFontSmoothing: defaults.enableNativeFontSmoothing,
                        })
                      }
                    />
                  ) : null
                }
                control={
                  <Switch
                    checked={settings.enableNativeFontSmoothing}
                    onCheckedChange={(checked) =>
                      updateSettings({ enableNativeFontSmoothing: checked })
                    }
                    aria-label={messages.settings.appearance.typography.fontSmoothingAria}
                  />
                }
              />
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection title={messages.settings.appearance.timeAndReadingSection}>
          <div className="space-y-2">
            <SettingsRow
              title={messages.settings.appearance.timestamp.title}
              description={messages.settings.appearance.timestamp.description}
              resetAction={
                settings.timestampFormat !== defaults.timestampFormat ? (
                  <SettingResetButton
                    label={messages.settings.appearance.timestamp.title}
                    onClick={() =>
                      updateSettings({
                        timestampFormat: defaults.timestampFormat,
                      })
                    }
                  />
                ) : null
              }
              control={
                <Select
                  value={settings.timestampFormat}
                  onValueChange={(value) => {
                    if (value !== "locale" && value !== "12-hour" && value !== "24-hour") {
                      return;
                    }
                    updateSettings({
                      timestampFormat: value,
                    });
                  }}
                >
                  <SelectTrigger
                    className="w-full sm:w-40"
                    aria-label={messages.settings.appearance.timestamp.ariaLabel}
                  >
                    <SelectValue>
                      {settings.timestampFormat === "12-hour"
                        ? timestampLabels["12-hour"]
                        : settings.timestampFormat === "24-hour"
                          ? timestampLabels["24-hour"]
                          : timestampLabels.locale}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    <SelectItem hideIndicator value="locale">
                      {timestampLabels.locale}
                    </SelectItem>
                    <SelectItem hideIndicator value="12-hour">
                      {timestampLabels["12-hour"]}
                    </SelectItem>
                    <SelectItem hideIndicator value="24-hour">
                      {timestampLabels["24-hour"]}
                    </SelectItem>
                  </SelectPopup>
                </Select>
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection title={messages.settings.appearance.accessibilitySection}>
          <div className="space-y-2">
            <SettingsRow
              title={messages.settings.appearance.accessibility.fontSizeScale}
              description={messages.settings.appearance.accessibility.fontSizeScaleDescription}
              resetAction={
                fontSizeScale !== "medium" ? (
                  <SettingResetButton
                    label={messages.settings.appearance.accessibility.fontSizeScale}
                    onClick={resetFontSizeScale}
                  />
                ) : null
              }
              control={
                <Select
                  value={fontSizeScale}
                  onValueChange={(value) => {
                    if (
                      value === "small" ||
                      value === "medium" ||
                      value === "large" ||
                      value === "xlarge"
                    ) {
                      setFontSizeScale(value as FontSizeScale);
                    }
                  }}
                >
                  <SelectTrigger
                    className="w-full sm:w-40"
                    aria-label={messages.settings.appearance.accessibility.fontSizeScaleAria}
                  >
                    <SelectValue>
                      {(() => {
                        const sizeLabelKey = (() => {
                          switch (fontSizeScale) {
                            case "small":
                              return messages.settings.appearance.accessibility.fontSizeScaleSmall;
                            case "large":
                              return messages.settings.appearance.accessibility.fontSizeScaleLarge;
                            case "xlarge":
                              return messages.settings.appearance.accessibility
                                .fontSizeScaleXlarge;
                            case "medium":
                            default:
                              return messages.settings.appearance.accessibility.fontSizeScaleMedium;
                          }
                        })();
                        return sizeLabelKey;
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {FONT_SIZE_SCALES.map((scale) => {
                      const labelKey = (() => {
                        switch (scale) {
                          case "small":
                            return messages.settings.appearance.accessibility.fontSizeScaleSmall;
                          case "large":
                            return messages.settings.appearance.accessibility.fontSizeScaleLarge;
                          case "xlarge":
                            return messages.settings.appearance.accessibility
                              .fontSizeScaleXlarge;
                          case "medium":
                          default:
                            return messages.settings.appearance.accessibility.fontSizeScaleMedium;
                        }
                      })();
                      return (
                        <SelectItem key={scale} hideIndicator value={scale}>
                          {labelKey}
                        </SelectItem>
                      );
                    })}
                  </SelectPopup>
                </Select>
              }
            />

            <SettingsRow
              title={messages.settings.appearance.accessibility.fontSizePercent}
              description={messages.settings.appearance.accessibility.fontSizePercentDescription}
              resetAction={
                fontSizePercent !== FONT_SIZE_PERCENT_DEFAULT ? (
                  <SettingResetButton
                    label={messages.settings.appearance.accessibility.fontSizePercent}
                    onClick={resetFontSizePercent}
                  />
                ) : null
              }
              control={
                <div
                  className="w-full sm:w-72"
                  aria-label={messages.settings.appearance.accessibility.fontSizePercentAria}
                >
                  <FontSizeSlider
                    percent={fontSizePercent}
                    onChange={setFontSizePercent}
                    onReset={resetFontSizePercent}
                    showReset={false}
                  />
                </div>
              }
            />

            <SettingsRow
              title={messages.settings.appearance.accessibility.highContrast}
              description={messages.settings.appearance.accessibility.highContrastDescription}
              status={
                highContrastMode === "auto"
                  ? messages.settings.appearance.accessibility.highContrastSystemHint(
                      systemPrefersContrast,
                    )
                  : null
              }
              resetAction={
                highContrastMode !== "auto" ? (
                  <SettingResetButton
                    label={messages.settings.appearance.accessibility.highContrast}
                    onClick={resetHighContrastMode}
                  />
                ) : null
              }
              control={
                <Select
                  value={highContrastMode}
                  onValueChange={(value) => {
                    if (value === "auto" || value === "on" || value === "off") {
                      setHighContrastMode(value as HighContrastMode);
                    }
                  }}
                >
                  <SelectTrigger
                    className="w-full sm:w-40"
                    aria-label={messages.settings.appearance.accessibility.highContrastAria}
                  >
                    <SelectValue>
                      {highContrastMode === "on"
                        ? messages.settings.appearance.accessibility.highContrastOn
                        : highContrastMode === "off"
                          ? messages.settings.appearance.accessibility.highContrastOff
                          : messages.settings.appearance.accessibility.highContrastAuto}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    <SelectItem hideIndicator value="auto">
                      {messages.settings.appearance.accessibility.highContrastAuto}
                    </SelectItem>
                    <SelectItem hideIndicator value="on">
                      {messages.settings.appearance.accessibility.highContrastOn}
                    </SelectItem>
                    <SelectItem hideIndicator value="off">
                      {messages.settings.appearance.accessibility.highContrastOff}
                    </SelectItem>
                  </SelectPopup>
                </Select>
              }
            />

            <SettingsRow
              title={messages.settings.appearance.accessibility.performance}
              description={messages.settings.appearance.accessibility.performanceDescription}
              status={
                <span className="flex flex-col gap-0.5">
                  <span>
                    {messages.settings.appearance.accessibility.performanceCurrentFps(frameRate)}
                  </span>
                  {!hasUserOverride ? (
                    <span className="text-muted-foreground/80">
                      {messages.settings.appearance.accessibility.performanceAutoHint}
                    </span>
                  ) : null}
                </span>
              }
              resetAction={
                hasUserOverride ? (
                  <SettingResetButton
                    label={messages.settings.appearance.accessibility.performance}
                    onClick={clearPerformanceOverride}
                  />
                ) : null
              }
              control={
                <Select
                  value={hasUserOverride ? performanceMode : "auto"}
                  onValueChange={(value) => {
                    if (value === "auto") {
                      clearPerformanceOverride();
                      return;
                    }
                    if (
                      value === "normal" ||
                      value === "reduced" ||
                      value === "minimal"
                    ) {
                      setPerformanceMode(value as PerformanceMode);
                    }
                  }}
                >
                  <SelectTrigger
                    className="w-full sm:w-44"
                    aria-label={messages.settings.appearance.accessibility.performanceAria}
                  >
                    <SelectValue>
                      {hasUserOverride
                        ? performanceMode === "reduced"
                          ? messages.settings.appearance.accessibility.performanceReduced
                          : performanceMode === "minimal"
                            ? messages.settings.appearance.accessibility.performanceMinimal
                            : messages.settings.appearance.accessibility.performanceAuto
                        : messages.settings.appearance.accessibility.performanceAuto}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    <SelectItem hideIndicator value="auto">
                      {messages.settings.appearance.accessibility.performanceAuto}
                    </SelectItem>
                    <SelectItem hideIndicator value="reduced">
                      {messages.settings.appearance.accessibility.performanceReduced}
                    </SelectItem>
                    <SelectItem hideIndicator value="minimal">
                      {messages.settings.appearance.accessibility.performanceMinimal}
                    </SelectItem>
                  </SelectPopup>
                </Select>
              }
            />
          </div>
        </SettingsSection>
      </div>
    );
  };

  const renderNotificationsPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.notifications.activityAlertsSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.notifications.activityToasts.title}
            description={messages.settings.notifications.activityToasts.description}
            resetAction={
              settings.enableTaskCompletionToasts !== defaults.enableTaskCompletionToasts ? (
                <SettingResetButton
                  label={messages.settings.notifications.activityToasts.title.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      enableTaskCompletionToasts: defaults.enableTaskCompletionToasts,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.enableTaskCompletionToasts}
                onCheckedChange={(checked) =>
                  updateSettings({ enableTaskCompletionToasts: Boolean(checked) })
                }
                aria-label={messages.settings.notifications.activityToasts.ariaLabel}
              />
            }
          />

          <SettingsRow
            title={messages.settings.notifications.desktopNotifications.title}
            description={messages.settings.notifications.desktopNotifications.description}
            status={buildNotificationSettingsSupportText(browserNotificationPermission)}
            resetAction={
              settings.enableSystemTaskCompletionNotifications !==
              defaults.enableSystemTaskCompletionNotifications ? (
                <SettingResetButton
                  label={messages.settings.notifications.desktopNotifications.title.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      enableSystemTaskCompletionNotifications:
                        defaults.enableSystemTaskCompletionNotifications,
                    })
                  }
                />
              ) : null
            }
            control={
              <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
                <Button size="xs" variant="outline" onClick={() => void sendTestNotification()}>
                  {messages.settings.notifications.testButton}
                </Button>
                <Switch
                  checked={settings.enableSystemTaskCompletionNotifications}
                  onCheckedChange={(checked) => {
                    void setSystemNotificationsEnabled(Boolean(checked));
                  }}
                  aria-label={messages.settings.notifications.desktopNotifications.ariaLabel}
                />
              </div>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  const renderBehaviorPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.behavior.runtimeSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.behavior.assistantOutput}
            description={messages.settings.behavior.assistantOutputDescription}
            resetAction={
              settings.enableAssistantStreaming !== defaults.enableAssistantStreaming ? (
                <SettingResetButton
                  label={messages.settings.behavior.assistantOutput.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      enableAssistantStreaming: defaults.enableAssistantStreaming,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.enableAssistantStreaming}
                onCheckedChange={(checked) =>
                  updateSettings({
                    enableAssistantStreaming: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.assistantOutputAria}
              />
            }
          />

          <SettingsRow
            title={messages.settings.behavior.voicePolishTitle}
            description={messages.settings.behavior.voicePolishDescription}
            resetAction={
              settings.enableVoicePolish !== defaults.enableVoicePolish ? (
                <SettingResetButton
                  label={messages.settings.behavior.voicePolishTitle.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      enableVoicePolish: defaults.enableVoicePolish,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.enableVoicePolish}
                onCheckedChange={(checked) =>
                  updateSettings({
                    enableVoicePolish: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.voicePolishAria}
              />
            }
          />

          <SettingsRow
            title={messages.settings.behavior.voicePolishAdvanced}
            description={messages.settings.behavior.voicePolishAdvancedDescription}
          >
            <div className="mt-3 space-y-2 border-t border-(--color-border-light) pt-3">
              <SettingsRow
                title={messages.settings.behavior.voicePolishRemoveFillerWords}
                description={messages.settings.behavior.voicePolishRemoveFillerWordsDescription}
                resetAction={
                  settings.voicePolishRemoveFillerWords !==
                  defaults.voicePolishRemoveFillerWords ? (
                    <SettingResetButton
                      label={messages.settings.behavior.voicePolishRemoveFillerWords.toLowerCase()}
                      onClick={() =>
                        updateSettings({
                          voicePolishRemoveFillerWords: defaults.voicePolishRemoveFillerWords,
                        })
                      }
                    />
                  ) : null
                }
                control={
                  <Switch
                    checked={settings.voicePolishRemoveFillerWords}
                    onCheckedChange={(checked) =>
                      updateSettings({
                        voicePolishRemoveFillerWords: Boolean(checked),
                      })
                    }
                    aria-label={messages.settings.behavior.voicePolishRemoveFillerWords}
                  />
                }
              />
              <SettingsRow
                title={messages.settings.behavior.voicePolishFixGrammar}
                description={messages.settings.behavior.voicePolishFixGrammarDescription}
                resetAction={
                  settings.voicePolishFixGrammar !== defaults.voicePolishFixGrammar ? (
                    <SettingResetButton
                      label={messages.settings.behavior.voicePolishFixGrammar.toLowerCase()}
                      onClick={() =>
                        updateSettings({
                          voicePolishFixGrammar: defaults.voicePolishFixGrammar,
                        })
                      }
                    />
                  ) : null
                }
                control={
                  <Switch
                    checked={settings.voicePolishFixGrammar}
                    onCheckedChange={(checked) =>
                      updateSettings({
                        voicePolishFixGrammar: Boolean(checked),
                      })
                    }
                    aria-label={messages.settings.behavior.voicePolishFixGrammar}
                  />
                }
              />
              <SettingsRow
                title={messages.settings.behavior.voicePolishAddStructure}
                description={messages.settings.behavior.voicePolishAddStructureDescription}
                resetAction={
                  settings.voicePolishAddStructure !== defaults.voicePolishAddStructure ? (
                    <SettingResetButton
                      label={messages.settings.behavior.voicePolishAddStructure.toLowerCase()}
                      onClick={() =>
                        updateSettings({
                          voicePolishAddStructure: defaults.voicePolishAddStructure,
                        })
                      }
                    />
                  ) : null
                }
                control={
                  <Switch
                    checked={settings.voicePolishAddStructure}
                    onCheckedChange={(checked) =>
                      updateSettings({
                        voicePolishAddStructure: Boolean(checked),
                      })
                    }
                    aria-label={messages.settings.behavior.voicePolishAddStructure}
                  />
                }
              />
              <SettingsRow
                title={messages.settings.behavior.voicePolishTargetLanguage}
                description={messages.settings.behavior.voicePolishTargetLanguageDescription}
                resetAction={
                  settings.voicePolishTargetLanguage !== defaults.voicePolishTargetLanguage ? (
                    <SettingResetButton
                      label={messages.settings.behavior.voicePolishTargetLanguage.toLowerCase()}
                      onClick={() =>
                        updateSettings({
                          voicePolishTargetLanguage: defaults.voicePolishTargetLanguage,
                        })
                      }
                    />
                  ) : null
                }
                control={
                  <Select
                    value={settings.voicePolishTargetLanguage}
                    onValueChange={(value) => {
                      if (
                        value !== "auto" &&
                        value !== "zh" &&
                        value !== "en"
                      ) {
                        return;
                      }
                      updateSettings({
                        voicePolishTargetLanguage: value,
                      });
                    }}
                  >
                    <SelectTrigger
                      className="w-full sm:w-40"
                      aria-label={messages.settings.behavior.voicePolishTargetLanguage}
                    >
                      <SelectValue>
                        {settings.voicePolishTargetLanguage === "zh"
                          ? messages.settings.behavior.voicePolishTargetLanguageZh
                          : settings.voicePolishTargetLanguage === "en"
                            ? messages.settings.behavior.voicePolishTargetLanguageEn
                            : messages.settings.behavior.voicePolishTargetLanguageAuto}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup align="end" alignItemWithTrigger={false}>
                      <SelectItem hideIndicator value="auto">
                        {messages.settings.behavior.voicePolishTargetLanguageAuto}
                      </SelectItem>
                      <SelectItem hideIndicator value="zh">
                        {messages.settings.behavior.voicePolishTargetLanguageZh}
                      </SelectItem>
                      <SelectItem hideIndicator value="en">
                        {messages.settings.behavior.voicePolishTargetLanguageEn}
                      </SelectItem>
                    </SelectPopup>
                  </Select>
                }
              />
            </div>
          </SettingsRow>

          <SettingsRow
            title={messages.settings.behavior.diffLineWrapping}
            description={messages.settings.behavior.diffLineWrappingDescription}
            resetAction={
              settings.diffWordWrap !== defaults.diffWordWrap ? (
                <SettingResetButton
                  label={messages.settings.behavior.diffLineWrapping.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      diffWordWrap: defaults.diffWordWrap,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.diffWordWrap}
                onCheckedChange={(checked) =>
                  updateSettings({
                    diffWordWrap: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.diffLineWrappingAria}
              />
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title={messages.settings.behavior.safetySection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.behavior.deleteConfirmation}
            description={messages.settings.behavior.deleteConfirmationDescription}
            resetAction={
              settings.confirmThreadDelete !== defaults.confirmThreadDelete ? (
                <SettingResetButton
                  label={messages.settings.behavior.deleteConfirmation.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      confirmThreadDelete: defaults.confirmThreadDelete,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.confirmThreadDelete}
                onCheckedChange={(checked) =>
                  updateSettings({
                    confirmThreadDelete: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.deleteConfirmationAria}
              />
            }
          />

          <SettingsRow
            title={messages.settings.behavior.archiveConfirmation}
            description={messages.settings.behavior.archiveConfirmationDescription}
            resetAction={
              settings.confirmThreadArchive !== defaults.confirmThreadArchive ? (
                <SettingResetButton
                  label={messages.settings.behavior.archiveConfirmation.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      confirmThreadArchive: defaults.confirmThreadArchive,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.confirmThreadArchive}
                onCheckedChange={(checked) =>
                  updateSettings({
                    confirmThreadArchive: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.archiveConfirmationAria}
              />
            }
          />

          <SettingsRow
            title={messages.settings.behavior.terminalCloseConfirmation}
            description={messages.settings.behavior.terminalCloseConfirmationDescription}
            resetAction={
              settings.confirmTerminalTabClose !== defaults.confirmTerminalTabClose ? (
                <SettingResetButton
                  label={messages.settings.behavior.terminalCloseConfirmation.toLowerCase()}
                  onClick={() =>
                    updateSettings({
                      confirmTerminalTabClose: defaults.confirmTerminalTabClose,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.confirmTerminalTabClose}
                onCheckedChange={(checked) =>
                  updateSettings({
                    confirmTerminalTabClose: Boolean(checked),
                  })
                }
                aria-label={messages.settings.behavior.terminalCloseConfirmationAria}
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  const renderWorktreesPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.worktrees.managedSection}>
        <div className="space-y-4">
          {serverWorktreesQuery.isLoading ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              {messages.settings.worktrees.loading}
            </div>
          ) : serverWorktreesQuery.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
              {serverWorktreesQuery.error instanceof Error
                ? serverWorktreesQuery.error.message
                : messages.settings.worktrees.loadFailedFallback}
            </div>
          ) : worktreesByWorkspaceRoot.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              {messages.settings.worktrees.emptyState}
            </div>
          ) : (
            worktreesByWorkspaceRoot.map((group) => (
              <section key={group.workspaceRoot} className="space-y-2">
                <h3 className="px-1 font-mono text-[11px] text-muted-foreground">
                  {group.workspaceRoot}
                </h3>

                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/50">
                  {group.worktrees.map((worktree, index) => {
                    const deleteDisabled = removeWorktreeMutation.isPending;
                    return (
                      <div
                        key={worktree.path}
                        className={cn(
                          "flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between",
                          index > 0 && "border-t border-border/60",
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium text-foreground">
                              {messages.settings.worktrees.worktreeLabel}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {worktree.path}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              {messages.settings.worktrees.conversationsLabel}
                            </div>
                            {worktree.linkedThreads.length > 0 ? (
                              <div className="space-y-1">
                                {worktree.linkedThreads.map((thread) => (
                                  <div key={thread.id} className="text-sm text-foreground">
                                    {thread.title}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                {messages.settings.worktrees.noConversations}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Button
                            size="xs"
                            variant="destructive"
                            disabled={deleteDisabled}
                            onClick={() =>
                              void deleteManagedWorktree({
                                workspaceRoot: group.workspaceRoot,
                                worktreePath: worktree.path,
                              })
                            }
                          >
                            {messages.settings.worktrees.deleteButton}
                          </Button>
                          {worktree.linkedThreads.length > 0 ? (
                            <p className="max-w-40 text-right text-[11px] text-muted-foreground">
                              {messages.settings.worktrees.deleteWarning}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </SettingsSection>
    </div>
  );

  const renderArchivedPanel = () => {
    const archivedGroups = [
      ...projects.map((project) => ({
        project,
        threads: archivedThreads
          .filter((thread) => thread.projectId === project.id)
          .toSorted((left, right) => {
            const leftKey = left.archivedAt ?? left.updatedAt ?? left.createdAt;
            const rightKey = right.archivedAt ?? right.updatedAt ?? right.createdAt;
            return rightKey.localeCompare(leftKey) || right.id.localeCompare(left.id);
          }),
      })),
      ...(() => {
        const knownProjectIds = new Set(projects.map((project) => project.id));
        const orphanedThreads = archivedThreads
          .filter((thread) => !knownProjectIds.has(thread.projectId))
          .toSorted((left, right) => {
            const leftKey = left.archivedAt ?? left.updatedAt ?? left.createdAt;
            const rightKey = right.archivedAt ?? right.updatedAt ?? right.createdAt;
            return rightKey.localeCompare(leftKey) || right.id.localeCompare(left.id);
          });
        return orphanedThreads.length > 0
          ? [
              {
                project: null,
                threads: orphanedThreads,
              },
            ]
          : [];
      })(),
    ].filter((group) => group.threads.length > 0);

    return (
      <div className="space-y-6">
        {archivedGroups.length === 0 ? (
          <SettingsSection title={messages.settings.archived.emptySection}>
            <div className="rounded-2xl border border-dashed border-border/70 bg-card/35 px-5 py-10 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground">
                <ArchiveIcon className="size-5" />
              </div>
              <div className="text-sm font-medium text-foreground">
                {messages.settings.archived.emptyTitle}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {messages.settings.archived.emptyDescription}
              </div>
            </div>
          </SettingsSection>
        ) : (
          archivedGroups.map(({ project, threads: projectThreads }) => (
            <SettingsSection
              key={project?.id ?? "unknown-project"}
              title={project?.name ?? messages.settings.archived.unknownProject}
            >
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/50">
                {projectThreads.map((thread, index) => (
                  <div
                    key={thread.id}
                    className={cn(
                      "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
                      index > 0 && "border-t border-border/60",
                    )}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void handleArchivedThreadContextMenu(thread.id, thread.title, {
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {thread.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {messages.settings.archived.archivedAt(
                          formatRelativeTime(thread.archivedAt ?? thread.createdAt),
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => void unarchiveThread(thread.id)}
                      >
                        {messages.settings.archived.restoreButton}
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => void deleteArchivedThread(thread.id, thread.title)}
                      >
                        {messages.settings.archived.deleteButton}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </SettingsSection>
          ))
        )}
      </div>
    );
  };

  // ── 模型设置面板 — 参考 Trae 设计，2026年7月最新模型数据 ──
  const renderModelsPanel = () => {
    const [addModelDialogOpen, setAddModelDialogOpen] = useState(false);
    const [addModelTab, setAddModelTab] = useState<"provider" | "custom">("provider");

    // 2026年7月最新 — 全部13家厂商内置模型列表
    const builtInModelProviders = [
      // ── 国际 4 家 ──
      { provider: "codex" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.codex, models: ["GPT-5.6 Sol (Flagship)", "GPT-5.6 Terra (Balanced)", "GPT-5.6 Luna (Lightweight)", "GPT-5.5 Sol/Terra (Legacy)"], color: "#10a37f" },
      { provider: "claudeAgent" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.claudeAgent, models: ["Claude Opus 4.8 (Flagship)", "Claude Sonnet 5 (Default Main)", "Claude Sonnet 4.7 (Stable)", "Claude Haiku 4.5 (Fast)"], color: "#d97757" },
      { provider: "gemini" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.gemini, models: ["Gemini 3.5 Flash (GA Main)", "Gemini 3.5 Ultra (Flagship)", "Gemini 3.5 Pro (Preview)", "Gemini 3.1 Flash-Lite"], color: "#4285f4" },
      { provider: "grok" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.grok, models: ["Grok 4.5 Advanced (Flagship)", "Grok 4.5 Standard (Main)", "Grok 4.5 Long Context", "Grok 4.3 (Legacy)"], color: "#000000" },
      // ── 国内 9 家 ──
      { provider: "deepseek" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.deepseek, models: ["DeepSeek V4 Pro (Flagship)", "DeepSeek V4 Flash (Fast)", "DeepSeek V4 Code (Coding)", "DeepSeek V3.1 Pro/Flash (Legacy)"], color: "#4D6BFA" },
      { provider: "glm" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.glm, models: ["GLM-5.2 Ultra (Flagship)", "GLM-5.2 Open (MIT Open Source)", "GLM-5.2 Code (ZCODE3)", "GLM-5V (Vision)"], color: "#5b39c9" },
      { provider: "qwen" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.qwen, models: ["Qwen3.7 Max (Flagship)", "Qwen3.7 Max-Thinking (Reasoning)", "Qwen3.7 Plus (Balanced)", "Qwen3.7 Flash (Lightweight)"], color: "#F97316" },
      { provider: "doubao" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.doubao, models: ["Seed 2.1 Pro (Flagship)", "Seed 2.1 Turbo (Fast)", "Seed-Evolving (Adaptive)", "Seedream 5.0 Pro (Vision Gen)"], color: "#3B82F6" },
      { provider: "ernie" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.ernie, models: ["ERNIE 5.1 (General Flagship)", "ERNIE X1.1 (Deep Thinking)", "文心快码 3.5S (Code Specialized)", "ERNIE-4.5-21B-A3B (Open Source)"], color: "#2b55b3" },
      { provider: "hunyuan" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.hunyuan, models: ["Hy3 Base (295B MoE Flagship)", "Hy3 Thinking (Reasoning)", "Hy3 Code (Code Tuned)", "Hy3-7B/13B (Open Source)"], color: "#05b096" },
      { provider: "MiniMax" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.MiniMax, models: ["MiniMax M3 (4280B MoE Flagship)", "MiniMax M3 Light (Lightweight)", "M3 Pro Preview (27T, Q3 2026)"], color: "#10B981" },
      { provider: "moonshot" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.moonshot, models: ["Kimi K2.7 Code (Programming)", "Kimi K2.7 Instruct (General)", "Kimi K2.7 Thinking (Reasoning)", "K2.5 (Legacy)"], color: "#7c3aed" },
      { provider: "mimo" as ProviderKind, name: PROVIDER_DISPLAY_NAMES.mimo, models: ["MiMo-32B (Flagship Open Source)", "MiMo-7B (Ultra-Light)", "MiMo-V2.5 (Legacy Compatible)"], color: "#ef4444" },
    ];

    return (
      <div className="space-y-6">
        {/* ===== 标题栏 ===== */}
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{messages.settings.models.managementTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{messages.settings.models.managementDescription}</p>
          <div className="mt-3">
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setAddModelDialogOpen(true)}>
              <PlusIcon className="size-3.5" />
              {messages.settings.models.addModel}
            </Button>
          </div>
        </div>

        {/* ===== 内置模型分组表格（13家厂商） ===== */}
        <section className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border/60">
            <div className="grid grid-cols-[1fr_100px_80px] gap-4 border-b border-border/50 bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>{messages.settings.models.builtInLabel}</span>
              <span>{messages.settings.models.dialogProviderLabel}</span>
              <span className="text-right">{messages.settings.byok.testConnection}</span>
            </div>
            {builtInModelProviders.map((entry) => (
              <details key={entry.provider} className="group" open>
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors list-none">
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  <span className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white" style={{ backgroundColor: entry.color }}>{entry.name.charAt(0)}</span>
                  <span className="flex-1">{entry.name}</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{entry.models.length} model{entry.models.length > 1 ? "s" : ""}</span>
                </summary>
                <div className="border-t border-border/40 divide-y divide-border/30">
                  {entry.models.map((model) => (
                    <div key={`${entry.provider}-${model}`} className="grid grid-cols-[1fr_100px_80px] gap-4 px-4 py-2.5 text-sm hover:bg-muted/20 transition-colors items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white/90" style={{ backgroundColor: entry.color, opacity: 0.7 }}>{entry.name.charAt(0)}</span>
                        <span className="truncate font-medium text-foreground">{model}</span>
                      </div>
                      <span className="text-xs text-muted-foreground truncate hidden sm:block">{entry.name}</span>
                      <div className="flex justify-end"><span className="text-xs text-muted-foreground">—</span></div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ===== 自定义模型区域 ===== */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <ChevronDownIcon className="size-4 text-muted-foreground" />
            {messages.settings.models.customLabel}
          </h3>
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {messages.settings.models.customEmpty}，
              <button type="button" className="inline-flex items-center underline hover:text-foreground transition-colors ml-1"
                onClick={() => { setAddModelDialogOpen(true); setAddModelTab("custom"); }}>
                {messages.settings.models.customCreateLink}
              </button>
            </p>
          </div>
        </section>

        {/* ===== 原有设置区域（保留核心部分） ===== */}
        <SettingsSection title={messages.settings.models.generationSection}>
          <div className="space-y-2">
            <SettingsRow title={messages.settings.models.gitWritingModel} description={messages.settings.models.gitWritingModelDescription}
              resetAction={isGitTextGenerationModelDirty ? (<SettingResetButton label={messages.settings.models.gitWritingModel.toLowerCase()} onClick={() => updateSettings({ textGenerationProvider: defaults.textGenerationProvider, textGenerationModel: defaults.textGenerationModel })} />) : null}
              control={<Select value={currentGitTextGenerationValue} onValueChange={(value) => { if (!value) return; const si = value.indexOf(":"); updateSettings({ textGenerationProvider: value.slice(0, si) as ProviderKind, textGenerationModel: value.slice(si + 1) }); }}>
                <SelectTrigger className="w-full sm:w-52" aria-label={messages.settings.models.gitWritingModelAria}><SelectValue>{selectedGitTextGenerationModelLabel}</SelectValue></SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {gitTextGenerationModelOptions.map((option) => (<SelectItem hideIndicator key={`${option.provider}:${option.slug}`} value={`${option.provider}:${option.slug}`}>{PROVIDER_DISPLAY_NAMES[option.provider]} / {option.name}</SelectItem>))}
                </SelectPopup>
              </Select>}
            />
          </div>
        </SettingsSection>

        {/* 原有自定义 slug 设置 */}
        <SettingsSection title={messages.settings.models.customSection}>
          <div className="space-y-2">
            <SettingsRow title={messages.settings.models.savedModelSlugs} description={messages.settings.models.savedModelSlugsDescription}
              resetAction={totalCustomModels > 0 ? (<SettingResetButton label={messages.settings.models.customModelResetLabel} onClick={() => { updateSettings({ customCodexModels: defaults.customCodexModels, customClaudeModels: defaults.customClaudeModels, customCursorModels: defaults.customCursorModels, customGeminiModels: defaults.customGeminiModels, customGrokModels: defaults.customGrokModels, customKiloModels: defaults.customKiloModels, customOpenCodeModels: defaults.customOpenCodeModels, customPiModels: defaults.customPiModels }); setCustomModelErrorByProvider({}); setShowAllCustomModels(false); }} />) : null}>
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={selectedCustomModelProvider} onValueChange={(value) => { if (!value || !["codex","claudeAgent","cursor","gemini","grok","kilo","opencode","pi"].includes(value)) return; setSelectedCustomModelProvider(value); }}>
                    <SelectTrigger size="sm" className="w-full sm:w-40" aria-label={messages.settings.models.customProviderAria}><SelectValue>{selectedCustomModelProviderSettings.title}</SelectValue></SelectTrigger>
                    <SelectPopup align="start" alignItemWithTrigger={false}>{MODEL_PROVIDER_SETTINGS.map((ps) => (<SelectItem hideIndicator className="min-h-7 text-sm" key={ps.provider} value={ps.provider}>{ps.title}</SelectItem>))}</SelectPopup>
                  </Select>
                  <Input id="custom-model-slug" value={selectedCustomModelInput} onChange={(e) => { setCustomModelInputByProvider((ex) => ({ ...ex, [selectedCustomModelProvider]: e.target.value })); if (selectedCustomModelError) setCustomModelErrorByProvider((ex) => ({ ...ex, [selectedCustomModelProvider]: null })); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomModel(selectedCustomModelProvider); } }} placeholder={selectedCustomModelProviderSettings.example} spellCheck={false} />
                  <Button className="shrink-0" variant="outline" onClick={() => addCustomModel(selectedCustomModelProvider)}><PlusIcon className="size-3.5" />{messages.settings.models.customAddButton}</Button>
                </div>
                {selectedCustomModelError ? (<p className="mt-2 text-xs text-destructive">{selectedCustomModelError}</p>) : null}
                {totalCustomModels > 0 ? (<div className="mt-3"><div>{visibleCustomModelRows.map((row) => (<div key={row.key} className="group grid grid-cols-[minmax(5rem,6rem)_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 px-4 py-2 first:border-t-0"><span className="truncate text-xs text-muted-foreground">{row.providerTitle}</span><code className="min-w-0 truncate text-sm text-foreground">{row.slug}</code><button type="button" className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100" aria-label={messages.settings.models.customRemoveAria(row.slug)} onClick={() => removeCustomModel(row.provider, row.slug)}><XIcon className="size-3.5 text-muted-foreground hover:text-foreground" /></button></div>))}</div>{savedCustomModelRows.length > 5 ? (<button type="button" className="mt-2 text-xs text-muted-foreground transition-colors hover:text-foreground" onClick={() => setShowAllCustomModels((v) => !v)}>{showAllCustomModels ? messages.settings.models.customShowLess : messages.settings.models.customShowMore(savedCustomModelRows.length - 5)}</button>) : null}</div>) : null}
              </div>
            </SettingsRow>
          </div>
        </SettingsSection>

        {/* 添加模型 Dialog */}
        <Dialog open={addModelDialogOpen} onOpenChange={setAddModelDialogOpen}>
          <DialogPopup className="max-w-xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>{messages.settings.models.dialogTitle}</DialogTitle>
              <DialogDescription>{messages.settings.models.managementDescription}</DialogDescription>
            </DialogHeader>
            <DialogPanel className="space-y-5 -mx-1 overflow-y-auto">
              <div className="flex rounded-lg border border-border/60 p-1">
                {(["provider", "custom"] as const).map((tab) => (
                  <button key={tab} type="button" className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${addModelTab === tab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setAddModelTab(tab)}>
                    {tab === "provider" ? messages.settings.models.dialogTabProvider : messages.settings.models.dialogTabCustom}
                  </button>
                ))}
              </div>
              {addModelTab === "provider" ? (
                <div className="space-y-4">
                  <div className="space-y-1.5"><label className="block text-sm font-medium"><span className="text-destructive">*</span> {messages.settings.models.dialogProviderLabel}</label><Select defaultValue=""><SelectTrigger className="w-full"><SelectValue placeholder={messages.settings.models.dialogProviderPlaceholder} /></SelectTrigger><SelectContent>{builtInModelProviders.map((p) => (<SelectItem key={p.provider} value={p.provider}>{p.name}</SelectItem>))}</SelectContent></Select></div>
                  <div className="space-y-1.5"><label className="block text-sm font-medium"><span className="text-destructive">*</span> {messages.settings.models.dialogModelLabel}</label><Select defaultValue=""><SelectTrigger className="w-full"><SelectValue placeholder={messages.settings.models.dialogModelPlaceholder} /></SelectTrigger><SelectContent><SelectItem value="gpt-5.6-sol">GPT-5.6 Sol</SelectItem><SelectItem value="claude-opus-4.8">Claude Opus 4.8</SelectItem><SelectItem value="gemini-3.5-ultra">Gemini 3.5 Ultra</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1.5"><label className="block text-sm font-medium"><span className="text-destructive">*</span> {messages.settings.models.dialogApiKeyLabel}</label><Input type="password" placeholder={messages.settings.models.dialogApiKeyPlaceholder} /></div>
                  <details className="group"><summary className="cursor-pointer text-sm font-medium text-foreground list-none flex items-center gap-1 py-1"><ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />{messages.settings.models.dialogAdvancedConfig}</summary><div className="mt-3 space-y-3 pl-4"><div className="space-y-1.5"><label className="block text-xs font-medium text-muted-foreground">{messages.settings.models.dialogDisplayNameLabel}</label><Input placeholder={messages.settings.models.dialogDisplayNamePlaceholder} maxLength={32} /><p className="text-[11px] text-muted-foreground">{messages.settings.models.dialogDisplayNameHint}</p></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className="block text-xs font-medium text-muted-foreground">{messages.settings.models.dialogContextWindowLabel} ({messages.settings.models.dialogContextInput})</label><Input placeholder="184000" type="number" /></div><div className="space-y-1.5"><label className="block text-xs font-medium text-muted-foreground">{messages.settings.models.dialogContextWindowLabel} ({messages.settings.models.dialogContextOutput})</label><Input placeholder="16000" type="number" /></div></div><div className="space-y-1.5"><label className="block text-xs font-medium text-muted-foreground">{messages.settings.models.dialogToolRoundsLabel}</label><Input placeholder={messages.settings.models.dialogToolRoundsPlaceholder} type="number" /></div></div></details>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5"><label className="block text-sm font-medium"><span className="text-destructive">*</span> {messages.settings.models.dialogApiFormatLabel}</label><Select defaultValue="openai"><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="openai">{messages.settings.models.dialogApiFormatOpenAI}</SelectItem><SelectItem value="anthropic">{messages.settings.models.dialogApiFormatAnthropic}</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1.5"><label className="block text-sm font-medium"><span className="text-destructive">*</span> {messages.settings.models.dialogCustomUrlLabel}</label><div className="flex items-center gap-2"><Input className="flex-1" placeholder={messages.settings.models.dialogCustomUrlPlaceholder} /><Switch defaultChecked /></div><div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-2.5 flex gap-2"><InfoIcon className="size-4 shrink-0 text-blue-500 mt-0.5" /><p className="text-xs text-blue-600 dark:text-blue-400">{messages.settings.models.dialogCustomUrlHint}</p></div></div>
                  <div className="space-y-1.5"><div className="flex items-center justify-between"><label className="block text-sm font-medium"><span className="text-destructive">*</span> {messages.settings.models.dialogModelIdLabel}</label><label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"><Switch defaultChecked />{messages.settings.models.dialogMultiModel}</label></div><Input placeholder={messages.settings.models.dialogModelIdPlaceholder} /></div>
                  <div className="space-y-1.5"><label className="block text-sm font-medium"><span className="text-destructive">*</span> {messages.settings.models.dialogApiKeyLabel}</label><Input type="password" placeholder={messages.settings.models.dialogApiKeyPlaceholder} /></div>
                  <details className="group"><summary className="cursor-pointer text-sm font-medium text-foreground list-none flex items-center gap-1 py-1"><ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />{messages.settings.models.dialogAdvancedConfig}</summary><div className="mt-3 space-y-3 pl-4"><div className="space-y-1.5"><label className="block text-xs font-medium text-muted-foreground">{messages.settings.models.dialogDisplayNameLabel}</label><Input placeholder={messages.settings.models.dialogDisplayNamePlaceholder} maxLength={32} /><p className="text-[11px] text-muted-foreground">{messages.settings.models.dialogDisplayNameHint}</p></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className="block text-xs font-medium text-muted-foreground">{messages.settings.models.dialogContextWindowLabel} ({messages.settings.models.dialogContextInput})</label><Input placeholder="184000" type="number" /></div><div className="space-y-1.5"><label className="block text-xs font-medium text-muted-foreground">{messages.settings.models.dialogContextWindowLabel} ({messages.settings.models.dialogContextOutput})</label><Input placeholder="16000" type="number" /></div></div><div className="space-y-1.5"><label className="block text-xs font-medium text-muted-foreground">{messages.settings.models.dialogToolRoundsLabel}</label><Input placeholder={messages.settings.models.dialogToolRoundsPlaceholder} type="number" /></div></div></details>
                </div>
              )}
            </DialogPanel>
            <DialogFooter variant="default">
              <Button variant="outline" onClick={() => setAddModelDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => { setAddModelDialogOpen(false); toastManager.add({ type: "success", title: messages.settings.models.addModel }); }}>{messages.settings.models.dialogSubmit}</Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </div>
    );
  };

  const renderAdvancedPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.advanced.mcpSection}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {messages.settings.advanced.mcpDescription}
          </p>
          {activeWorkspaceCwd ? (
            <McpSettingsPanel workspaceRoot={activeWorkspaceCwd} />
          ) : (
            <p className="text-xs italic text-muted-foreground">
              {messages.settings.advanced.mcpNoWorkspace}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={messages.settings.advanced.sshSection}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {messages.settings.advanced.sshDescription}
          </p>
          {activeWorkspaceCwd ? (
            <div className="h-[520px] overflow-hidden rounded-lg border border-border/60 bg-background">
              <SshConnectionConfig visible={true} />
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              {messages.settings.advanced.sshNoWorkspace}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={messages.settings.advanced.developerSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.advanced.keybindings.title}
            description={messages.settings.advanced.keybindings.description}
            status={
              <>
                <span className="block break-all font-mono text-[11px] text-foreground">
                  {keybindingsConfigPath ?? messages.settings.advanced.keybindings.pathPlaceholder}
                </span>
                {openKeybindingsError ? (
                  <span className="mt-1 block text-destructive">{openKeybindingsError}</span>
                ) : (
                  <span className="mt-1 block">
                    {messages.settings.advanced.keybindings.openEditorHint}
                  </span>
                )}
              </>
            }
            control={
              <Button
                size="xs"
                variant="outline"
                disabled={!keybindingsConfigPath || isOpeningKeybindings}
                onClick={openKeybindingsFile}
              >
                {isOpeningKeybindings
                  ? messages.settings.advanced.keybindings.openingButton
                  : messages.settings.advanced.keybindings.openButton}
              </Button>
            }
          />

          <SettingsRow
            title={messages.settings.advanced.recovery.title}
            description={messages.settings.advanced.recovery.description}
            status={
              shouldOfferRecoveryTools
                ? messages.settings.advanced.recovery.offerReason
                : messages.settings.advanced.recovery.hiddenReason
            }
            control={
              <Button
                size="xs"
                variant="outline"
                disabled={!shouldOfferRecoveryTools || isRepairingLocalState}
                onClick={() => void repairLocalState()}
              >
                {isRepairingLocalState
                  ? messages.settings.advanced.recovery.repairingButton
                  : messages.settings.advanced.recovery.repairButton}
              </Button>
            }
          >
            {shouldOfferRecoveryTools ? (
              <div className="mt-3 border-t border-border/70 pt-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setShowRecoveryTools((current) => !current)}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {messages.settings.advanced.recovery.whatThisDoesLabel}
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      showRecoveryTools && "rotate-180",
                    )}
                  />
                </button>
                {showRecoveryTools ? (
                  <div className="mt-3 rounded-xl border border-border/70 px-3 py-3 text-xs text-muted-foreground">
                    {messages.settings.advanced.recovery.whatThisDoesBody}
                  </div>
                ) : null}
              </div>
            ) : null}
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection title={messages.settings.advanced.aboutSection}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.advanced.version.title}
            description={messages.settings.advanced.version.description}
            control={
              <code className="text-xs font-medium text-muted-foreground">{APP_VERSION}</code>
            }
          />
          <SettingsRow
            title={messages.settings.advanced.version.releaseHistory}
            description={messages.settings.advanced.version.releaseHistoryDescription}
            control={
              <Button size="sm" variant="outline" onClick={() => setReleaseHistoryOpen(true)}>
                {messages.settings.advanced.version.viewReleaseHistory}
              </Button>
            }
          />
        </div>
      </SettingsSection>

      {/* P2-5: 团队共享规则管理面板 */}
      <SettingsSection
        title={messages.teamRules.viewTitle}
        description={messages.teamRules.viewDescription}
      >
        <TeamRulesView />
      </SettingsSection>

      {/* P0-6: 隐私政策 + 使用条款入口 */}
      <SettingsSection title={messages.termsAcceptance.dialogTitleTerms}>
        <LegalDocumentsSettingsCard />
      </SettingsSection>

      {/* P1-2: Office 模板库 */}
      <SettingsSection title="Office 模板库" description="选择模板，填写参数，一键生成 Word / Excel / PowerPoint 文档">
        <div className="rounded-lg border border-border/60 bg-background">
          <OfficeTemplateLibrary />
        </div>
      </SettingsSection>
    </div>
  );

  // P2-4 成本预算面板:放 settings 顶层,跟其他核心设置并列
  const renderBudgetPanel = () => (
    <div className="space-y-6">
      <CostBudgetPanel />
      <SettingsSection title="Coding Plan 配额">
        <div className="space-y-2">
          <CodingPlanQuotaPanel
            snapshots={codingPlanSnapshots}
            onRefresh={codingPlanRefresh}
            onBind={handleCodingPlanBind}
          />
        </div>
      </SettingsSection>
    </div>
  );

  // 智能体设置面板 — 参考 Trae 设计：自定义智能体 + 内置智能体列表 + 高级配置
  const renderAgentPanel = () => {
    // 内置智能体定义（与 AGENTS.md 和 ModeSwitcher 对齐）
    const builtInAgents = [
      {
        id: "code",
        name: messages.settings.agent.builtInAgents.code.name,
        description: messages.settings.agent.builtInAgents.code.description,
        icon: (
          <span className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <TerminalIcon className="size-5" />
          </span>
        ),
      },
      {
        id: "work",
        name: messages.settings.agent.builtInAgents.work.name,
        description: messages.settings.agent.builtInAgents.work.description,
        icon: (
          <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <RocketIcon className="size-5" />
          </span>
        ),
      },
      {
        id: "plan",
        name: messages.settings.agent.builtInAgents.plan.name,
        description: messages.settings.agent.builtInAgents.plan.description,
        icon: (
          <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <FlagIcon className="size-5" />
          </span>
        ),
      },
      {
        id: "review",
        name: messages.settings.agent.builtInAgents.review.name,
        description: messages.settings.agent.builtInAgents.review.description,
        icon: (
          <span className="flex size-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <CheckIcon2 className="size-5" />
          </span>
        ),
      },
      {
        id: "ask",
        name: messages.settings.agent.builtInAgents.ask.name,
        description: messages.settings.agent.builtInAgents.ask.description,
        icon: (
          <span className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <MessageCircleIcon className="size-5" />
          </span>
        ),
      },
    ];

    return (
      <div className="space-y-6">
        {/* ===== 标题栏：智能体 + 创建按钮 ===== */}
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{messages.settings.agent.heading}</h2>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="gap-1.5"
                  onClick={() => {
                    toastManager.add({
                      type: "info",
                      title: messages.settings.agent.customAgents.createTooltip,
                    });
                  }}
                >
                  <PlusIcon className="size-3.5" />
                  {messages.settings.agent.customAgents.create}
                </Button>
              }
            />
            <TooltipPopup>{messages.settings.agent.customAgents.createTooltip}</TooltipPopup>
          </Tooltip>
        </div>

        {/* ===== 自定义智能体区域 ===== */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">{messages.settings.agent.customAgents.label}</h3>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {messages.settings.agent.customAgents.empty}{" "}
              <button
                type="button"
                className="inline-flex items-center underline hover:text-foreground transition-colors"
                onClick={() => {
                  toastManager.add({
                    type: "info",
                    title: messages.settings.agent.customAgents.createTooltip,
                  });
                }}
              >
                {messages.settings.agent.customAgents.create}
              </button>
            </p>
          </div>
        </section>

        {/* ===== 内置智能体列表 ===== */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">{messages.settings.agent.builtInAgents.label}</h3>
          <div className="overflow-hidden rounded-lg border border-border/60 divide-y divide-border/50">
            {builtInAgents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors group"
              >
                {agent.icon}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{agent.name}</p>
                </div>
                <p className="hidden sm:block flex-1 min-w-0 text-sm text-muted-foreground truncate px-2">
                  {agent.description}
                </p>
                <button
                  type="button"
                  className="shrink-0 size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-all"
                  aria-label={`${agent.name} settings`}
                  onClick={() => {
                    toastManager.add({
                      type: "info",
                      title: `${agent.name} ${messages.settings.agent.heading}`,
                    });
                  }}
                >
                  <EllipsisIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ===== 高级配置（原有内容） ===== */}
        <SettingsSection title={messages.settings.agent.sandbox.title}>
          <div className="space-y-2">
            <SettingsRow
              title={messages.settings.agent.toolPermissions.title}
              description={messages.settings.agent.toolPermissions.description}
              control={
                <Select
                  value={agentToolPermission}
                  onValueChange={(value) => {
                    if (value) handleAgentToolPermissionChange(value);
                  }}
                >
                  <SelectTrigger className="w-[180px]" aria-label={messages.settings.agent.toolPermissions.ariaLabel}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fileReadWriteAll">{messages.settings.agent.toolPermissions.fileReadWriteAll}</SelectItem>
                    <SelectItem value="fileRead">{messages.settings.agent.toolPermissions.fileRead}</SelectItem>
                    <SelectItem value="none">{messages.settings.agent.toolPermissions.none}</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
            <SettingsRow
              title={messages.settings.agent.sandbox.worktreeIsolation}
              description={messages.settings.agent.sandbox.worktreeIsolationDescription}
              control={
                <Switch
                  checked={featureFlags["agent-worktree-isolation"] ?? true}
                  onCheckedChange={(checked) =>
                    setFeatureFlagEnabled("agent-worktree-isolation", Boolean(checked))
                  }
                  aria-label={messages.settings.agent.sandbox.worktreeIsolationAria}
                />
              }
            />
            <SettingsRow
              title={messages.settings.agent.retry.autoRetry}
              description={messages.settings.agent.retry.autoRetryDescription}
              control={
                <Switch
                  checked={featureFlags["agent-auto-retry"] ?? true}
                  onCheckedChange={(checked) =>
                    setFeatureFlagEnabled("agent-auto-retry", Boolean(checked))
                  }
                  aria-label={messages.settings.agent.retry.autoRetryAria}
                />
              }
            />
          </div>
        </SettingsSection>

        {/* ===== 凭证存储模式（P0-2） ===== */}
        <SettingsSection title="凭证存储模式">
          <CredentialStoragePanel />
        </SettingsSection>

        {/* ===== 授权目录管理（P0-3） ===== */}
        <SettingsSection title="授权目录管理">
          <AuthorizedDirsPanel />
        </SettingsSection>
      </div>
    );
  };

  // MCP 设置面板
  const renderMcpPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.mcp.heading}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.mcp.servers.title}
            description={messages.settings.mcp.servers.description}
            control={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {messages.settings.mcp.servers.status}
              </span>
            }
          />
          <SettingsRow
            title={messages.settings.mcp.servers.transportType}
            description={messages.settings.mcp.servers.stdio + " / " + messages.settings.mcp.servers.sse}
            control={
              <span className="text-xs text-muted-foreground">
                {messages.settings.mcp.servers.stdio} + {messages.settings.mcp.servers.sse}
              </span>
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.mcp.presets.title}>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{messages.settings.mcp.presets.description}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {["filesystem", "fetch", "memory", "github", "git", "sqlite", "postgres", "playwright"].map((preset) => (
              <div
                key={preset}
                className="flex flex-col gap-1 rounded-md border border-border/40 bg-background/40 p-2"
              >
                <span className="text-xs font-medium text-foreground">{preset}</span>
                <Button size="sm" variant="outline" className="h-6 text-xs">
                  {messages.settings.mcp.presets.install}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </SettingsSection>
    </div>
  );

  // CUE 提示词工程面板
  const renderCuePanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.cue.heading}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.cue.templates.title}
            description={messages.settings.cue.templates.description}
            control={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {messages.settings.cue.templates.status}
              </span>
            }
          />
          <p className="text-xs text-muted-foreground">{messages.settings.cue.templates.empty}</p>
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.cue.responseTuning.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.cue.responseTuning.temperature}
            description={messages.settings.cue.responseTuning.temperatureDescription}
            control={
              <code className="text-xs font-medium text-muted-foreground">0.7</code>
            }
          />
          <SettingsRow
            title={messages.settings.cue.responseTuning.maxTokens}
            description={messages.settings.cue.responseTuning.maxTokensDescription}
            control={
              <code className="text-xs font-medium text-muted-foreground">4096</code>
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.cue.voicePolish.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.cue.voicePolish.enabled}
            description={messages.settings.cue.voicePolish.enabledDescription}
            control={
              <Switch
                checked={featureFlags["cue-voice-polish"] ?? false}
                onCheckedChange={(checked) =>
                  setFeatureFlagEnabled("cue-voice-polish", Boolean(checked))
                }
                aria-label={messages.settings.cue.voicePolish.ariaLabel}
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  // 对话流设置面板
  const renderConversationFlowPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.conversationFlow.heading}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.conversationFlow.contextWindow.title}
            description={messages.settings.conversationFlow.contextWindow.description}
            control={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {messages.settings.conversationFlow.contextWindow.status}
              </span>
            }
          />
          <SettingsRow
            title={messages.settings.conversationFlow.contextWindow.compaction}
            description={messages.settings.conversationFlow.contextWindow.compactionDescription}
            control={
              <Switch
                checked={featureFlags["flow-context-compaction"] ?? true}
                onCheckedChange={(checked) =>
                  setFeatureFlagEnabled("flow-context-compaction", Boolean(checked))
                }
                aria-label={messages.settings.conversationFlow.contextWindow.compactionAria}
              />
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.conversationFlow.turnLimits.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.conversationFlow.turnLimits.maxTurns}
            description={messages.settings.conversationFlow.turnLimits.maxTurnsDescription}
            control={
              <code className="text-xs font-medium text-muted-foreground">25</code>
            }
          />
          <SettingsRow
            title={messages.settings.conversationFlow.turnLimits.maxRetries}
            description={messages.settings.conversationFlow.turnLimits.maxRetriesDescription}
            control={
              <code className="text-xs font-medium text-muted-foreground">3</code>
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.conversationFlow.streaming.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.conversationFlow.streaming.enabled}
            description={messages.settings.conversationFlow.streaming.enabledDescription}
            control={
              <Switch
                checked={featureFlags["flow-streaming"] ?? true}
                onCheckedChange={(checked) =>
                  setFeatureFlagEnabled("flow-streaming", Boolean(checked))
                }
                aria-label={messages.settings.conversationFlow.streaming.ariaLabel}
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  // Browser 设置面板
  const renderBrowserPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.browser.heading}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.browser.automation.enabled}
            description={messages.settings.browser.automation.enabledDescription}
            control={
              <Switch
                checked={featureFlags["browser-automation"] ?? false}
                onCheckedChange={(checked) =>
                  setFeatureFlagEnabled("browser-automation", Boolean(checked))
                }
                aria-label={messages.settings.browser.automation.ariaLabel}
              />
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.browser.security.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.browser.security.blockedHosts}
            description={messages.settings.browser.security.blockedHostsDescription}
            control={
              <code className="text-xs font-medium text-muted-foreground">localhost, 127.0.0.1, 169.254.169.254</code>
            }
          />
          <SettingsRow
            title={messages.settings.browser.security.rateLimit}
            description={messages.settings.browser.security.rateLimitDescription}
            control={
              <code className="text-xs font-medium text-muted-foreground">30/min</code>
            }
          />
          <SettingsRow
            title={messages.settings.browser.security.executionTimeout}
            description={messages.settings.browser.security.executionTimeoutDescription}
            control={
              <code className="text-xs font-medium text-muted-foreground">10s</code>
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.browser.screenshot.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.browser.screenshot.autoInject}
            description={messages.settings.browser.screenshot.autoInjectDescription}
            control={
              <Switch
                checked={featureFlags["browser-screenshot-inject"] ?? true}
                onCheckedChange={(checked) =>
                  setFeatureFlagEnabled("browser-screenshot-inject", Boolean(checked))
                }
                aria-label={messages.settings.browser.screenshot.ariaLabel}
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  // 索引与文档设置面板
  const renderIndexerPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.indexer.heading}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.indexer.codeIndex.title}
            description={messages.settings.indexer.codeIndex.description}
            control={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {messages.settings.indexer.codeIndex.status}
              </span>
            }
          />
          <SettingsRow
            title={messages.settings.indexer.codeIndex.rebuild}
            description={messages.settings.indexer.codeIndex.fileCount + ": —"}
            control={
              <Button size="sm" variant="outline">
                {messages.settings.indexer.codeIndex.rebuild}
              </Button>
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.indexer.astGrep.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.indexer.astGrep.patterns}
            description={messages.settings.indexer.astGrep.description}
          />
          <p className="text-xs text-muted-foreground">{messages.settings.indexer.astGrep.empty}</p>
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.indexer.semantic.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.indexer.semantic.enabled}
            description={messages.settings.indexer.semantic.enabledDescription}
            control={
              <Switch
                checked={featureFlags["indexer-semantic"] ?? false}
                onCheckedChange={(checked) =>
                  setFeatureFlagEnabled("indexer-semantic", Boolean(checked))
                }
                aria-label={messages.settings.indexer.semantic.ariaLabel}
              />
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.indexer.repoWiki.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.indexer.repoWiki.title}
            description={messages.settings.indexer.repoWiki.description}
            control={
              <Button size="sm" variant="outline">
                {messages.settings.indexer.repoWiki.generate}
              </Button>
            }
          />
          <p className="text-xs text-muted-foreground">{messages.settings.indexer.repoWiki.status}</p>
        </div>
      </SettingsSection>
    </div>
  );

  // 技能与命令设置面板
  const renderSkillsPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.skills.heading}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.skills.customSkills.title}
            description={messages.settings.skills.customSkills.description}
            control={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {messages.settings.skills.customSkills.status}
              </span>
            }
          />
          <p className="text-xs text-muted-foreground">{messages.settings.skills.customSkills.scanPaths}</p>
          <p className="text-xs text-muted-foreground">{messages.settings.skills.customSkills.empty}</p>
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.skills.slashCommands.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.skills.slashCommands.title}
            description={messages.settings.skills.slashCommands.description}
          />
          <p className="text-xs text-muted-foreground">{messages.settings.skills.slashCommands.empty}</p>
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.skills.marketplace.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.skills.marketplace.title}
            description={messages.settings.skills.marketplace.description}
            control={
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  {messages.settings.skills.marketplace.refresh}
                </Button>
                <Button size="sm" variant="outline">
                  {messages.settings.skills.marketplace.browse}
                </Button>
              </div>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );

  // 规则与记忆设置面板
  const renderRulesPanel = () => (
    <div className="space-y-6">
      <SettingsSection title={messages.settings.rules.heading}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.rules.projectRules.title}
            description={messages.settings.rules.projectRules.description}
            control={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {messages.settings.rules.projectRules.status}
              </span>
            }
          />
          <p className="text-xs text-muted-foreground">{messages.settings.rules.projectRules.noRules}</p>
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.rules.teamRules.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.rules.teamRules.enabled}
            description={messages.settings.rules.teamRules.enabledDescription}
            control={
              <Switch
                checked={featureFlags["rules-team-enabled"] ?? true}
                onCheckedChange={(checked) =>
                  setFeatureFlagEnabled("rules-team-enabled", Boolean(checked))
                }
                aria-label={messages.settings.rules.teamRules.ariaLabel}
              />
            }
          />
          <SettingsRow
            title={messages.settings.rules.teamRules.manage}
            description={messages.settings.rules.teamRules.description}
            control={
              <Button size="sm" variant="outline">
                {messages.settings.rules.teamRules.manage}
              </Button>
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title={messages.settings.rules.memory.title}>
        <div className="space-y-2">
          <SettingsRow
            title={messages.settings.rules.memory.title}
            description={messages.settings.rules.memory.description}
            control={
              <Button size="sm" variant="outline">
                {messages.settings.rules.memory.clear}
              </Button>
            }
          />
          <p className="text-xs text-muted-foreground">{messages.settings.rules.memory.status}</p>
        </div>
      </SettingsSection>
    </div>
  );

  // P1-2: 移动推送通道配置面板（JPush / Umeng 凭证 + 连接测试 + dry_run）
  const renderPushPanel = () => (
    <div className="space-y-6">
      <SettingsSection
        title={messages.settings.push.heading}
        description={messages.settings.push.description}
      >
        <div className="rounded-lg border border-border/60 bg-background">
          <PushChannelPanel />
        </div>
      </SettingsSection>
    </div>
  );

  const renderImageGenPanel = () => (
    <div className="space-y-6">
      <SettingsSection title="AI 文生图" description="配置 AI 图片生成后端">
        <div className="rounded-lg border border-border/60 bg-background">
          <ImageGenerationPanel />
        </div>
      </SettingsSection>
    </div>
  );

  const renderIMPanel = () => (
    <div className="space-y-6">
      <SettingsSection title="IM 渠道集成" description="连接企业微信、钉钉、飞书等 IM 平台">
        <div className="rounded-lg border border-border/60 bg-background">
          <IMIntegrationSettings />
        </div>
      </SettingsSection>
    </div>
  );

  const renderMobilePanel = () => (
    <div className="space-y-6">
      <SettingsSection title="移动端远程协作" description="推送通知、远程审批与设备配对">
        <div className="rounded-lg border border-border/60 bg-background">
          <MobileRemoteSettings />
        </div>
      </SettingsSection>
    </div>
  );

  const renderActivePanel = () => {
    switch (activeSection) {
      case "general":
        return renderGeneralPanel();
      case "appearance":
        return renderAppearancePanel();
      case "notifications":
        return renderNotificationsPanel();
      case "behavior":
        return renderBehaviorPanel();
      case "worktrees":
        return renderWorktreesPanel();
      case "archived":
        return renderArchivedPanel();
      case "budget":
        return renderBudgetPanel();
      case "models":
        return renderModelsPanel();
      case "agent":
        return renderAgentPanel();
      case "mcp":
        return renderMcpPanel();
      case "cue":
        return renderCuePanel();
      case "conversationFlow":
        return renderConversationFlowPanel();
      case "browser":
        return renderBrowserPanel();
      case "indexer":
        return renderIndexerPanel();
      case "skills":
        return renderSkillsPanel();
      case "rules":
        return renderRulesPanel();
      case "imageGen":
        return renderImageGenPanel();
      case "im":
        return renderIMPanel();
      case "mobile":
        return renderMobilePanel();
      case "advanced":
        return renderAdvancedPanel();
      case "push":
        return renderPushPanel();
      default:
        return null;
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        {isDesktop ? (
          <div
            className={cn(
              "drag-region flex h-[44px] shrink-0 items-center border-b border-border px-3 sm:px-5",
              desktopTopBarTrafficLightGutterClassName,
            )}
          >
            <SidebarHeaderNavigationControls />
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              {messages.settings.title}
            </span>
            <div className="ms-auto flex items-center gap-2" data-no-drag>
              <Button
                size="xs"
                variant="outline"
                disabled={changedSettingLabels.length === 0}
                onClick={() => void restoreDefaults()}
              >
                <RotateCcwIcon className="size-3.5" />
                {messages.settings.restoreDefaults}
              </Button>
              <WindowCaptionButtons />
            </div>
          </div>
        ) : (
          <header className="border-b border-border/70 px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2">
              <SidebarHeaderTrigger className="size-7 shrink-0" />
              <span className="text-sm font-medium text-foreground">{messages.settings.title}</span>
              <div className="ms-auto flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={changedSettingLabels.length === 0}
                  onClick={() => void restoreDefaults()}
                >
                  <RotateCcwIcon className="size-3.5" />
                  {messages.settings.restoreDefaults}
                </Button>
              </div>
            </div>
          </header>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 py-6">
            {/* Section header */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground">{activeSectionItem.label}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{activeSectionItem.description}</p>
            </div>

            {renderActivePanel()}
          </div>
        </div>
      </div>
      {/* Mounted at the route level (outside the scrollable panel) so the
          dialog portal can overlay the entire settings view without being
          clipped by the content wrapper's overflow. */}
      <ReleaseHistoryDialog
        open={releaseHistoryOpen}
        onOpenChange={setReleaseHistoryOpen}
        defaultExpandedVersion={APP_VERSION}
      />
    </SidebarInset>
  );
}
