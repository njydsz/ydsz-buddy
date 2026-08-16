/**
 * @file ExtensionsView — 扩展管理页
 *
 * `/extensions` 路由对应的扩展管理界面，提供完整的 Extension 生命周期管理：
 *
 * - **已安装扩展列表**：显示所有已安装扩展及其状态
 * - **安装扩展**：支持从本地路径或 GitHub 仓库安装
 * - **扩展详情**：查看扩展的完整 contributes 信息
 * - **激活/停用**：控制扩展的启用状态
 * - **卸载**：删除扩展并清理注册信息
 * - **命令面板**：查看已激活扩展贡献的命令
 *
 * ## 核心导出
 *
 * - `ExtensionsView`：扩展管理页主组件
 *
 * ## 使用场景
 *
 * - 路由 `/extensions`（Extension 管理 tab）
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  ExternalLinkIcon,
  SearchIcon,
  FolderIcon,
  GithubIcon,
  SettingsIcon,
  TerminalIcon,
  CodeIcon,
  XIcon,
  CheckIcon,
  Loader2Icon,
  ChevronRightIcon,
} from "~/lib/icons";
import { SidebarInset } from "./ui/sidebar";
import { SidebarHeaderNavigationControls } from "./SidebarHeaderNavigationControls";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";
import { isDesktop } from "~/env";
import {
  extensionInit,
  extensionList,
  extensionGet,
  extensionActivate,
  extensionDeactivate,
  extensionUninstall,
  extensionInstallFromPath,
  extensionInstallFromGithub,
  extensionListCommands,
  type ExtensionDto,
  type ExtensionDetailDto,
  type CommandContributionDto,
  type ExtensionState,
} from "~/contracts/extensions";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";

// ============================================================================
// 查询键
// ============================================================================

const EXTENSIONS_QUERY_KEY = ["extensions", "list"] as const;
const EXTENSION_DETAIL_QUERY_KEY = ["extensions", "detail"] as const;
const EXTENSION_COMMANDS_QUERY_KEY = ["extensions", "commands"] as const;

// ============================================================================
// Tauri 命令封装
// ============================================================================

async function fetchExtensions(): Promise<ExtensionDto[]> {
  await extensionInit();
  return extensionList();
}

async function fetchExtensionDetail(name: string): Promise<ExtensionDetailDto | null> {
  return extensionGet(name);
}

async function fetchExtensionCommands(): Promise<CommandContributionDto[]> {
  return extensionListCommands();
}

// ============================================================================
// 状态元数据
// ============================================================================

const STATE_META: Record<ExtensionState, { label: string; color: string; bgColor: string }> = {
  installed: { label: "已安装", color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-500/10" },
  activated: { label: "已激活", color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-500/10" },
  deactivated: { label: "已停用", color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-500/10" },
  error: { label: "错误", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-500/10" },
};

// ============================================================================
// 主组件
// ============================================================================

export function ExtensionsView() {
  const queryClient = useQueryClient();

  const extensionsQuery = useQuery({
    queryKey: EXTENSIONS_QUERY_KEY,
    queryFn: fetchExtensions,
    enabled: isDesktop,
    staleTime: 10_000,
  });

  const commandsQuery = useQuery({
    queryKey: EXTENSION_COMMANDS_QUERY_KEY,
    queryFn: fetchExtensionCommands,
    enabled: isDesktop,
    staleTime: 30_000,
  });

  const [selectedExtension, setSelectedExtension] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInstallDialog, setShowInstallDialog] = useState(false);

  const extensions = extensionsQuery.data ?? [];
  const commands = commandsQuery.data ?? [];

  const filteredExtensions = useMemo(() => {
    if (!search.trim()) return extensions;
    const q = search.toLowerCase();
    return extensions.filter(
      (ext) =>
        ext.name.toLowerCase().includes(q) ||
        ext.displayName.toLowerCase().includes(q) ||
        ext.description.toLowerCase().includes(q) ||
        ext.categories.some((c) => c.toLowerCase().includes(q)),
    );
  }, [extensions, search]);

  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: EXTENSIONS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: EXTENSION_COMMANDS_QUERY_KEY });
  }, [queryClient]);

  // 如果选中了某个扩展，显示详情
  if (selectedExtension) {
    return (
      <ExtensionDetailView
        name={selectedExtension}
        onBack={() => setSelectedExtension(null)}
        commands={commands}
        onRefresh={refreshAll}
      />
    );
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden isolate">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6">
          <SidebarHeaderNavigationControls />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Hero */}
          <div className="px-6 py-8 text-center">
            <h1 className="text-[28px] font-semibold text-foreground">扩展管理</h1>
            <p className="mt-2 text-[13px] text-muted-foreground/80">
              管理本地已安装的扩展 · {extensions.length} 个扩展 · {commands.length} 个命令
            </p>
          </div>

          {/* 搜索 + 操作 */}
          <div className="mx-auto max-w-2xl px-6 pb-4">
            <div className="flex items-center gap-2">
              <InputGroup className="flex-1 rounded-xl bg-background/70 shadow-xs">
                <InputGroupAddon>
                  <InputGroupText>
                    <SearchIcon className="size-4 text-muted-foreground/60" />
                  </InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索扩展名称 / 描述 / 分类"
                  className="text-sm"
                />
              </InputGroup>
              <button
                type="button"
                onClick={refreshAll}
                disabled={extensionsQuery.isLoading}
                className="inline-flex size-10 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-muted-foreground/70 transition-colors hover:bg-muted disabled:opacity-50"
                title="刷新"
              >
                <RefreshCwIcon className={cn("size-4", extensionsQuery.isLoading && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={() => setShowInstallDialog(true)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-foreground/90 px-4 text-[12px] font-medium text-background transition-colors hover:bg-foreground"
              >
                <PlusIcon className="size-4" />
                安装扩展
              </button>
            </div>
          </div>

          {/* 内容 */}
          <div className="px-3 pb-10 sm:px-5">
            {extensionsQuery.isLoading && extensions.length === 0 ? (
              <div className="space-y-2">
                {["1", "2", "3"].map((k) => (
                  <div key={k} className="h-[88px] w-full animate-pulse rounded-xl bg-muted/30" />
                ))}
              </div>
            ) : filteredExtensions.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 px-5 py-10 text-center">
                <PackageIcon className="size-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  {search ? "未找到匹配的扩展" : "尚未安装任何扩展"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {search ? "请尝试其他关键词" : "点击「安装扩展」从本地或 GitHub 安装"}
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-2">
                {filteredExtensions.map((ext) => (
                  <ExtensionCard
                    key={ext.name}
                    extension={ext}
                    onSelect={() => setSelectedExtension(ext.name)}
                    onRefresh={refreshAll}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 安装对话框 */}
      {showInstallDialog && (
        <InstallExtensionDialog
          onClose={() => setShowInstallDialog(false)}
          onSuccess={() => {
            setShowInstallDialog(false);
            refreshAll();
          }}
        />
      )}
    </SidebarInset>
  );
}

// ============================================================================
// 扩展卡片
// ============================================================================

function ExtensionCard({
  extension,
  onSelect,
  onRefresh,
}: {
  extension: ExtensionDto;
  onSelect: () => void;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const stateMeta = STATE_META[extension.state];

  const activateMutation = useMutation({
    mutationFn: () => extensionActivate(extension.name),
    onSuccess: () => {
      toastManager.add({ type: "success", title: "扩展已激活", description: extension.displayName, timeout: 3000 });
      void queryClient.invalidateQueries({ queryKey: EXTENSIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: EXTENSION_COMMANDS_QUERY_KEY });
      onRefresh();
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "激活失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => extensionDeactivate(extension.name),
    onSuccess: () => {
      toastManager.add({ type: "success", title: "扩展已停用", description: extension.displayName, timeout: 3000 });
      void queryClient.invalidateQueries({ queryKey: EXTENSIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: EXTENSION_COMMANDS_QUERY_KEY });
      onRefresh();
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "停用失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: () => extensionUninstall(extension.name),
    onSuccess: () => {
      toastManager.add({ type: "success", title: "扩展已卸载", description: extension.displayName, timeout: 3000 });
      void queryClient.invalidateQueries({ queryKey: EXTENSIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: EXTENSION_COMMANDS_QUERY_KEY });
      onRefresh();
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "卸载失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const isPending = activateMutation.isPending || deactivateMutation.isPending || uninstallMutation.isPending;

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-4 py-3 transition-colors hover:border-border">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-muted/50">
        <PackageIcon className={cn("size-5", stateMeta.color)} />
      </div>

      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <p className="text-[13px] font-semibold leading-snug text-foreground">
          {extension.displayName}
          <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">v{extension.version}</span>
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{extension.description}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className={cn("inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-medium", stateMeta.bgColor, stateMeta.color)}>
            {stateMeta.label}
          </span>
          {extension.contributesCommands > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
              <TerminalIcon className="size-3" />
              {extension.contributesCommands} 命令
            </span>
          )}
          {extension.categories.map((cat) => (
            <span key={cat} className="rounded bg-muted/50 px-1 py-0.5 text-[9px] text-muted-foreground/60">
              {cat}
            </span>
          ))}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {extension.state === "activated" ? (
          <button
            type="button"
            onClick={() => deactivateMutation.mutate()}
            disabled={isPending}
            className="inline-flex size-7 items-center justify-center rounded-md text-amber-500/80 transition-colors hover:bg-amber-500/10"
            title="停用"
          >
            <PauseIcon className="size-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => activateMutation.mutate()}
            disabled={isPending}
            className="inline-flex size-7 items-center justify-center rounded-md text-emerald-500/80 transition-colors hover:bg-emerald-500/10"
            title="激活"
          >
            {activateMutation.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlayIcon className="size-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm(`确定卸载扩展「${extension.displayName}」吗？`)) {
              uninstallMutation.mutate();
            }
          }}
          disabled={isPending}
          className="inline-flex size-7 items-center justify-center rounded-md text-red-500/80 transition-colors hover:bg-red-500/10"
          title="卸载"
        >
          {uninstallMutation.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <TrashIcon className="size-3.5" />}
        </button>
        <ChevronRightIcon className="size-4 text-muted-foreground/40" />
      </div>
    </div>
  );
}

// ============================================================================
// 扩展详情视图
// ============================================================================

function ExtensionDetailView({
  name,
  onBack,
  commands,
  onRefresh,
}: {
  name: string;
  onBack: () => void;
  commands: CommandContributionDto[];
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: [...EXTENSION_DETAIL_QUERY_KEY, name],
    queryFn: () => fetchExtensionDetail(name),
    enabled: isDesktop && !!name,
  });

  const detail = detailQuery.data;
  const stateMeta = detail ? STATE_META[detail.state] : STATE_META.installed;

  const activateMutation = useMutation({
    mutationFn: () => extensionActivate(name),
    onSuccess: () => {
      toastManager.add({ type: "success", title: "扩展已激活", timeout: 3000 });
      void queryClient.invalidateQueries({ queryKey: [...EXTENSION_DETAIL_QUERY_KEY, name] });
      onRefresh();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => extensionDeactivate(name),
    onSuccess: () => {
      toastManager.add({ type: "success", title: "扩展已停用", timeout: 3000 });
      void queryClient.invalidateQueries({ queryKey: [...EXTENSION_DETAIL_QUERY_KEY, name] });
      onRefresh();
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: () => extensionUninstall(name),
    onSuccess: () => {
      toastManager.add({ type: "success", title: "扩展已卸载", timeout: 3000 });
      onBack();
      onRefresh();
    },
  });

  const contributedCommands = commands.filter((cmd) =>
    cmd.id.startsWith(`${name}.`),
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden isolate">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6">
          <SidebarHeaderNavigationControls />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-2xl">
            {/* 返回 */}
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <ChevronRightIcon className="size-3.5 rotate-180" />
              返回扩展列表
            </button>

            {detailQuery.isLoading ? (
              <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted/30" />
            ) : !detail ? (
              <div className="mt-4 rounded-xl border border-border/60 p-6 text-center">
                <p className="text-sm text-muted-foreground">扩展不存在或已卸载</p>
              </div>
            ) : (
              <>
                {/* 头部信息 */}
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex size-12 items-center justify-center rounded-[16px] bg-muted/50">
                      <PackageIcon className={cn("size-6", stateMeta.color)} />
                    </div>
                    <div>
                      <h1 className="text-[18px] font-semibold text-foreground">{detail.displayName}</h1>
                      <p className="font-mono text-[12px] text-muted-foreground">
                        {detail.name} · v{detail.version} · {detail.author}
                      </p>
                      <p className="mt-1 text-[13px] text-muted-foreground/80">{detail.description}</p>
                    </div>
                  </div>
                  <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-[11px] font-medium", stateMeta.bgColor, stateMeta.color)}>
                    {stateMeta.label}
                  </span>
                </div>

                {/* 操作按钮 */}
                <div className="mt-4 flex items-center gap-2">
                  {detail.state === "activated" ? (
                    <button
                      type="button"
                      onClick={() => deactivateMutation.mutate()}
                      disabled={deactivateMutation.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 text-[12px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20"
                    >
                      {deactivateMutation.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <PauseIcon className="size-3.5" />}
                      停用扩展
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => activateMutation.mutate()}
                      disabled={activateMutation.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      {activateMutation.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlayIcon className="size-3.5" />}
                      激活扩展
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`确定卸载扩展「${detail.displayName}」吗？此操作将删除扩展目录。`)) {
                        uninstallMutation.mutate();
                      }
                    }}
                    disabled={uninstallMutation.isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-500/20"
                  >
                    {uninstallMutation.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <TrashIcon className="size-3.5" />}
                    卸载
                  </button>
                </div>

                {/* 贡献信息 */}
                <div className="mt-6 space-y-4">
                  {/* 目录 */}
                  <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                    <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                      <FolderIcon className="size-3.5 text-muted-foreground/70" />
                      安装路径
                    </h3>
                    <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground/70" title={detail.installPath}>
                      {detail.installPath}
                    </p>
                  </div>

                  {/* 依赖 */}
                  {detail.extensionDependencies.length > 0 && (
                    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                        <ExternalLinkIcon className="size-3.5 text-muted-foreground/70" />
                        扩展依赖
                      </h3>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {detail.extensionDependencies.map((dep) => (
                          <span key={dep} className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
                            {dep}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 命令贡献 */}
                  {detail.contributes.commands.length > 0 && (
                    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                        <TerminalIcon className="size-3.5 text-muted-foreground/70" />
                        贡献命令（{detail.contributes.commands.length}）
                      </h3>
                      <div className="mt-2 space-y-1.5">
                        {detail.contributes.commands.map((cmd) => {
                          const isFromThis = contributedCommands.some((c) => c.id === `${detail.name}.${cmd.id}`);
                          return (
                            <div key={cmd.id} className="flex items-center gap-2 text-[12px]">
                              <span className={cn("font-mono", isFromThis ? "text-emerald-600" : "text-foreground/80")}>
                                {detail.name}.{cmd.id}
                              </span>
                              <span className="text-muted-foreground/70">— {cmd.title}</span>
                              {cmd.keybinding && (
                                <kbd className="rounded border border-border/50 bg-muted/40 px-1 py-0.5 font-mono text-[9px] text-muted-foreground/60">
                                  {cmd.keybinding}
                                </kbd>
                              )}
                              {isFromThis && <CheckIcon className="size-3 text-emerald-500" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 设置贡献 */}
                  {detail.contributes.settings.length > 0 && (
                    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                        <SettingsIcon className="size-3.5 text-muted-foreground/70" />
                        贡献设置（{detail.contributes.settings.length}）
                      </h3>
                      <div className="mt-2 space-y-1.5">
                        {detail.contributes.settings.map((s) => (
                          <div key={s.key} className="flex items-center gap-2 text-[12px]">
                            <span className="font-mono text-foreground/80">{s.key}</span>
                            <span className="rounded bg-muted/50 px-1 py-0.5 text-[9px] text-muted-foreground/60">{s.settingType}</span>
                            <span className="text-muted-foreground/70">— {s.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 语言贡献 */}
                  {detail.contributes.languages.length > 0 && (
                    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                        <CodeIcon className="size-3.5 text-muted-foreground/70" />
                        贡献语言（{detail.contributes.languages.length}）
                      </h3>
                      <div className="mt-2 space-y-1.5">
                        {detail.contributes.languages.map((lang) => (
                          <div key={lang.id} className="flex items-center gap-2 text-[12px]">
                            <span className="font-medium text-foreground/80">{lang.id}</span>
                            <span className="text-muted-foreground/70">
                              扩展名：{lang.extensions.join(", ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Provider 贡献 */}
                  {detail.contributes.providers.length > 0 && (
                    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                        <ExternalLinkIcon className="size-3.5 text-muted-foreground/70" />
                        贡献 Provider（{detail.contributes.providers.length}）
                      </h3>
                      <div className="mt-2 space-y-1.5">
                        {detail.contributes.providers.map((p) => (
                          <div key={p.displayName} className="flex items-center gap-2 text-[12px]">
                            <span className="font-medium text-foreground/80">{p.displayName}</span>
                            <span className="text-muted-foreground/70">协议：{p.protocol}</span>
                            <span className="text-muted-foreground/70">默认模型：{p.defaultModel}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 错误信息 */}
                  {detail.error && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                      <h3 className="text-[12px] font-semibold text-red-600">错误信息</h3>
                      <p className="mt-1 text-[12px] text-red-500/80">{detail.error}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

// ============================================================================
// 安装扩展对话框
// ============================================================================

function InstallExtensionDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"path" | "github">("github");
  const [path, setPath] = useState("");
  const [repo, setRepo] = useState("");
  const [subdir, setSubdir] = useState("");

  const installFromPathMutation = useMutation({
    mutationFn: () => extensionInstallFromPath(path),
    onSuccess: (dto) => {
      toastManager.add({ type: "success", title: "扩展安装成功", description: dto.displayName, timeout: 4000 });
      void queryClient.invalidateQueries({ queryKey: EXTENSIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: EXTENSION_COMMANDS_QUERY_KEY });
      onSuccess();
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "安装失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const installFromGithubMutation = useMutation({
    mutationFn: () => extensionInstallFromGithub(repo, subdir || undefined),
    onSuccess: (dto) => {
      toastManager.add({ type: "success", title: "扩展安装成功", description: dto.displayName, timeout: 4000 });
      void queryClient.invalidateQueries({ queryKey: EXTENSIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: EXTENSION_COMMANDS_QUERY_KEY });
      onSuccess();
    },
    onError: (e) => {
      toastManager.add({ type: "error", title: "安装失败", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const pickFolder = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        setPath(selected);
      }
    } catch {
      // 非桌面环境忽略
    }
  }, []);

  const isPending = installFromPathMutation.isPending || installFromGithubMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-foreground">安装扩展</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="mt-4 flex gap-1 rounded-lg bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setTab("github")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              tab === "github" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground/70 hover:text-foreground",
            )}
          >
            <GithubIcon className="mr-1.5 inline size-3.5" />
            GitHub 仓库
          </button>
          <button
            type="button"
            onClick={() => setTab("path")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              tab === "path" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground/70 hover:text-foreground",
            )}
          >
            <FolderIcon className="mr-1.5 inline size-3.5" />
            本地路径
          </button>
        </div>

        {/* GitHub 安装 */}
        {tab === "github" && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-foreground/85">仓库地址</label>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="owner/repo 或 https://github.com/owner/repo"
                className="h-9 w-full rounded-md border border-border/60 bg-background px-3 font-mono text-[13px] text-foreground outline-none transition-colors focus:border-foreground/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-foreground/85">
                子目录 <span className="text-muted-foreground/60">（可选）</span>
              </label>
              <input
                type="text"
                value={subdir}
                onChange={(e) => setSubdir(e.target.value)}
                placeholder="extensions/my-extension"
                className="h-9 w-full rounded-md border border-border/60 bg-background px-3 font-mono text-[13px] text-foreground outline-none transition-colors focus:border-foreground/40"
              />
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              仓库需包含 <code className="rounded bg-muted/50 px-1">extension.json</code> 清单文件
            </p>
          </div>
        )}

        {/* 本地路径安装 */}
        {tab === "path" && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-foreground/85">扩展目录</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="包含 extension.json 的目录路径"
                  className="h-9 flex-1 rounded-md border border-border/60 bg-background px-3 font-mono text-[13px] text-foreground outline-none transition-colors focus:border-foreground/40"
                />
                <button
                  type="button"
                  onClick={pickFolder}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/60 px-3 text-[12px] text-foreground/80 transition-colors hover:bg-muted/40"
                >
                  <FolderIcon className="size-3.5" />
                  浏览
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-md border border-border/60 px-3 text-[12px] text-foreground/80 transition-colors hover:bg-muted/40"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (tab === "github") {
                installFromGithubMutation.mutate();
              } else {
                installFromPathMutation.mutate();
              }
            }}
            disabled={isPending || (tab === "github" ? !repo.trim() : !path.trim())}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/90 px-3 text-[12px] font-medium text-background transition-colors hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                安装中…
              </>
            ) : (
              <>
                <PlusIcon className="size-3.5" />
                安装扩展
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
