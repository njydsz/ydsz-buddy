// FILE: SkillsView.tsx
// Purpose: Skills browser. Defaults to the user's local skills (scanned from well-known
//          home dirs like ~/.claude/skills, ~/.codex/skills, ~/.agents/skills) and surfaces
//          a "Browse skill.sh" CTA so users can discover and install new skills.
// Layer: Route-level screen
// Exports: SkillsView
/**
 * @file 技能浏览页
 *
 * `/plugins?tab=skills` 对应的技能浏览界面：
 *
 * - **本地优先**：默认展示 `~/.claude/skills`、`~/.codex/skills`、`~/.agents/skills` 扫描结果
 * - **CTA**：跳转到 skill.sh 浏览更多
 * - **搜索**：跨技能名/描述过滤
 * - **安装状态**：与已安装列表对比
 *
 * ## 核心导出
 *
 * - `SkillsView`：主组件
 *
 * ## 使用场景
 *
 * - 路由 `/plugins?tab=skills`
 *
 * ## 注意事项
 *
 * - 数据来源：`localSkillsQueryOptions`
 * - 搜索使用 `useDeferredValue`
 */
import { useDeferredValue, useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  Loader2Icon,
  RocketIcon,
  SearchIcon,
  StarIcon,
  StarFilledIcon,
  TerminalIcon,
  PlusIcon,
  XIcon,
} from "~/lib/icons";
import { localSkillsQueryOptions } from "~/localSkillsReactQuery";
import { useMessages } from "~/i18n/I18nContext";
import { cn } from "~/lib/utils";
import { isDesktop } from "~/env";
import type {
  InstalledSkill,
  LocalUserSkillSource,
  MarketplaceCategory,
  MarketplaceEntry,
  SkillTemplate,
} from "~/contracts";
import { SidebarInset } from "./ui/sidebar";
import { SidebarHeaderNavigationControls } from "./SidebarHeaderNavigationControls";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";
import { Skeleton } from "./ui/skeleton";
import { useProviderDiscoveryData } from "./useProviderDiscoveryData";
import {
  colorClassForSkillRuntimeMode,
  labelForSkillRuntimeMode,
  skillRuntimeModeFor,
} from "~/localSkillMode";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ensureNativeApi } from "~/nativeApi";
import { useSkillFavorites, type UseSkillFavoritesResult } from "~/hooks/useSkillFavorites";
import {
  SkillFavoritesSection,
  type FavoriteSkillDescriptor,
} from "./SkillFavoritesSection";
import { toastManager } from "./ui/toast";
import { monitor } from "~/lib/monitor";

/** 技能市场 API（nativeApi 上的可选扩展） */
interface SkillMarketplaceApi {
  categories: () => Promise<MarketplaceCategory[]>;
  search: (input: { query: string; category?: string | null }) => Promise<MarketplaceEntry[]>;
  trending: (input?: { limit?: number } | null) => Promise<MarketplaceEntry[]>;
  install: (input: { source: string }) => Promise<InstalledSkill>;
  uninstall: (input: { name: string }) => Promise<{ success: boolean }>;
  listInstalled: () => Promise<InstalledSkill[]>;
  status: () => Promise<{ source: string; lastRefreshedAt?: string | null; count: number; remoteUrl?: string | null }>;
  refresh: () => Promise<{ source: string; lastRefreshedAt?: string | null; count: number; remoteUrl?: string | null }>;
  // Future: renderTemplate / createFromTemplate (not yet implemented in backend)
  renderTemplate?: (formData: unknown) => Promise<string>;
  createFromTemplate?: (formData: unknown) => Promise<InstalledSkill>;
}

function getSkillMarketplaceApi(): SkillMarketplaceApi | undefined {
  const api = ensureNativeApi();
  return (api as unknown as { skills?: { marketplace?: SkillMarketplaceApi } }).skills
    ?.marketplace;
}

const SKILL_SH_HOMEPAGE = "https://skill.sh/";

const SOURCE_LABEL: Record<string, string> = {
  claude: "~/.claude/skills",
  codex: "~/.codex/skills",
  agents: "~/.agents/skills",
  openclaw: "~/.openclaw/skills",
  unknown: "Unknown",
};

const RUNTIME_BADGE: Record<string, { label: string; className: string }> = {
  code: { label: "Code", className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  work: { label: "Work", className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  any: { label: "Any", className: "border-border bg-muted text-muted-foreground" },
};

type SkillsTab = "local" | "browse" | "create";

export function SkillsView() {
  const messages = useMessages();
  const data = useProviderDiscoveryData("skills");
  const localSkillsQuery = useQuery(localSkillsQueryOptions());
  const deferredQuery = useDeferredValue(data.skillSearch);
  const [activeTab, setActiveTab] = useState<SkillsTab>("local");

  const localSkills = localSkillsQuery.data?.skills ?? [];
  const filteredLocalSkills = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return localSkills;
    return localSkills.filter((skill) => {
      const haystack = `${skill.name} ${skill.description ?? ""} ${skill.sourceDir}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [deferredQuery, localSkills]);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden isolate">
      <div className="flex h-full min-h-0 flex-col bg-background" data-testid="skills-view">
        <div
          className={cn(
            "flex shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6",
            isDesktop && "h-[44px]",
          )}
        >
          <SidebarHeaderNavigationControls />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 pt-8 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="flex items-center gap-2 text-[22px] font-semibold text-foreground">
                  <BookIcon className="size-5" />
                  {messages.skills.title}
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground/85">
                  {messages.skills.subtitle}
                </p>
              </div>
            </div>

            {/* Tab 导航 */}
            <div className="mt-6 flex items-center gap-2 border-b border-border">
              <button
                onClick={() => setActiveTab("local")}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  activeTab === "local"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                本地技能
              </button>
              <button
                onClick={() => setActiveTab("browse")}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  activeTab === "browse"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                浏览市场
              </button>
              <button
                onClick={() => setActiveTab("create")}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  activeTab === "create"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                创建模板
              </button>
            </div>

            <div className="mt-6">
              <InputGroup className="rounded-xl bg-background/70 shadow-xs">
                <InputGroupAddon>
                  <InputGroupText>
                    <SearchIcon className="size-4 text-muted-foreground/60" />
                  </InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  value={data.skillSearch}
                  onChange={(e) => data.setSkillSearch(e.target.value)}
                  placeholder={messages.skills.searchPlaceholder}
                  className="text-sm"
                />
              </InputGroup>
            </div>

            {!data.discoveryCwd ? (
              <div className="mt-4">
                <SkillsInlineWarning>{messages.skills.needsWorkspace}</SkillsInlineWarning>
              </div>
            ) : null}
          </div>

          <div className="mx-auto w-full max-w-2xl space-y-6 px-6 pb-10">
            {activeTab === "local" && (
              <LocalSkillsContent
                isLoading={localSkillsQuery.isLoading}
                skills={filteredLocalSkills}
                search={deferredQuery}
                messages={messages}
              />
            )}

            {activeTab === "browse" && <MarketplaceSection search={deferredQuery} />}

            {activeTab === "create" && <CreateSkillTemplateSection />}

            {activeTab === "local" && (
              <div className="border-t border-border/60 pt-6">
                <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {messages.skills.providerHeading}
                </h2>
                <p className="mt-1 px-1 text-[12px] text-muted-foreground/80">
                  {messages.skills.providerHint}
                </p>
                <div className="mt-4 space-y-1">
                  {!data.canListSkills ? (
                    <SkillsEmptyPanel
                      title={messages.skills.unavailableTitle.replace(
                        "{provider}",
                        data.providerLabel,
                      )}
                      description={messages.skills.unavailableDescription}
                    />
                  ) : data.skillsQuery.isLoading && data.discoveredSkills.length === 0 ? (
                    <>
                      {["1", "2", "3", "4", "5", "6"].map((k) => (
                        <Skeleton key={k} className="h-[68px] w-full rounded-xl" />
                      ))}
                    </>
                  ) : data.filteredSkills.length === 0 ? (
                    <SkillsEmptyPanel
                      title={
                        deferredQuery ? messages.skills.emptySearchTitle : messages.skills.emptyTitle
                      }
                      description={
                        deferredQuery
                          ? messages.skills.emptySearchDescription
                          : messages.skills.emptyDescription
                      }
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2">
                      {data.filteredSkills.map((skill) => (
                        <ProviderSkillCard key={skill.path} skill={skill} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

type LocalSkillCardData = {
  name: string;
  description?: string | undefined;
  version?: string | undefined;
  homepage?: string | undefined;
  path: string;
  source: LocalUserSkillSource;
  sourceDir: string;
  enabled: boolean;
};

function LocalSkillsContent({
  isLoading,
  skills,
  search,
  messages,
}: {
  isLoading: boolean;
  skills: ReadonlyArray<LocalSkillCardData>;
  search: string;
  messages: ReturnType<typeof useMessages>;
}) {
  const favoritesApi = useSkillFavorites();
  const favoritesByPath = useMemo(() => {
    const map = new Map<string, LocalSkillCardData>();
    for (const skill of skills) {
      map.set(skill.path, skill);
    }
    return map;
  }, [skills]);

  const resolveFavorite = useCallback(
    (path: string): FavoriteSkillDescriptor | undefined => {
      const skill = favoritesByPath.get(path);
      if (!skill) return undefined;
      return {
        path: skill.path,
        name: skill.name,
        description: skill.description,
        sourceLabel: SOURCE_LABEL[skill.source] ?? SOURCE_LABEL.unknown ?? "Unknown",
      };
    },
    [favoritesByPath],
  );

  if (isLoading) {
    return (
      <section>
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {messages.skills.localHeading}
        </h2>
        <div className="mt-3 space-y-1">
          {["1", "2", "3"].map((k) => (
            <Skeleton key={k} className="h-[72px] w-full rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (skills.length === 0) {
    return (
      <section>
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {messages.skills.localHeading}
        </h2>
        <div className="mt-3">
          <SkillsEmptyPanel
            title={search ? messages.skills.localEmptySearchTitle : messages.skills.localEmptyTitle}
            description={
              search
                ? messages.skills.localEmptySearchDescription
                : messages.skills.localEmptyDescription
            }
          />
        </div>
      </section>
    );
  }

  // 按 RuntimeMode 分组（Code 域在前，Work 域在后），保持布局稳定。
  const grouped = groupLocalSkillsByMode(skills);

  return (
    <div className="space-y-6">
      <SkillFavoritesSection resolveFavorite={resolveFavorite} />
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {messages.skills.localHeading}
          </h2>
          <span className="text-[11px] text-muted-foreground/70">
            {messages.skills.localCount.replace("{count}", String(skills.length))}
          </span>
        </div>
        <div className="mt-3 space-y-4">
          {(["code", "work"] as const).map((mode) => {
            const items = grouped.get(mode);
            if (!items || items.length === 0) return null;
            return (
              <div key={mode} className="space-y-2" data-skill-mode={mode}>
                <div className="flex items-center gap-1.5 px-1">
                  <SkillModeBadge mode={mode} />
                  <span className="text-[11px] text-muted-foreground/70">
                    {items.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {items.map((skill) => (
                    <LocalSkillCard
                      key={`${skill.source}::${skill.name}`}
                      skill={skill}
                      favoritesApi={favoritesApi}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function groupLocalSkillsByMode(
  skills: ReadonlyArray<{
    name: string;
    description?: string | undefined;
    version?: string | undefined;
    homepage?: string | undefined;
    path: string;
    source: LocalUserSkillSource;
    sourceDir: string;
    enabled: boolean;
  }>,
): Map<"code" | "work", typeof skills> {
  const result = new Map<"code" | "work", typeof skills>();
  for (const skill of skills) {
    const mode = skillRuntimeModeFor(skill);
    const key: "code" | "work" = mode === "work" ? "work" : "code";
    const existing = result.get(key);
    if (existing) {
      (existing as Array<(typeof skills)[number]>).push(skill);
    } else {
      result.set(key, [skill] as unknown as typeof skills);
    }
  }
  return result;
}

function SkillModeBadge({
  mode,
  compact = false,
}: {
  mode: "code" | "work";
  compact?: boolean;
}) {
  const Icon = mode === "work" ? RocketIcon : TerminalIcon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-medium",
        compact ? "h-4 px-1 text-[9.5px]" : "h-5 px-1.5 text-[10px]",
        colorClassForSkillRuntimeMode(mode),
      )}
      data-skill-mode-badge={mode}
      data-compact={compact ? "true" : "false"}
    >
      <Icon className={compact ? "size-2" : "size-2.5"} />
      {labelForSkillRuntimeMode(mode)}
    </span>
  );
}

function LocalSkillCard({
  skill,
  favoritesApi,
}: {
  skill: {
    name: string;
    description?: string | undefined;
    version?: string | undefined;
    homepage?: string | undefined;
    path: string;
    source: LocalUserSkillSource;
    sourceDir: string;
    enabled: boolean;
  };
  favoritesApi: UseSkillFavoritesResult;
}) {
  const sourceLabel = SOURCE_LABEL[skill.source] ?? SOURCE_LABEL.unknown ?? "Unknown";
  const mode = skillRuntimeModeFor(skill);
  const isFav = favoritesApi.isFavorite(skill.path);
  return (
    <div
      className="group flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 px-4 py-3 transition-colors hover:border-border hover:bg-muted/30"
      data-skill-mode={mode}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-semibold leading-snug text-foreground">
              {skill.name}
            </p>
            <SkillModeBadge mode={mode === "work" ? "work" : "code"} compact />
            {skill.version ? (
              <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
                v{skill.version}
              </span>
            ) : null}
            {skill.enabled ? (
              <span
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border/40 text-muted-foreground/60"
                title="Enabled"
              >
                <CheckIcon className="size-2.5" />
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => favoritesApi.toggleFavorite(skill.path)}
              aria-label={isFav ? `从收藏中移除 ${skill.name}` : `收藏 ${skill.name}`}
              aria-pressed={isFav}
              data-testid={`local-skill-favorite-${skill.path}`}
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
                isFav
                  ? "text-amber-500 hover:bg-amber-500/10"
                  : "text-muted-foreground/55 opacity-0 group-hover:opacity-100 hover:bg-muted/70 hover:text-foreground focus-visible:opacity-100",
              )}
              title={isFav ? "取消收藏" : "收藏"}
            >
              {isFav ? (
                <StarFilledIcon className="size-3.5" />
              ) : (
                <StarIcon className="size-3.5" />
              )}
            </button>
          </div>
          {skill.description ? (
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground/85">
              {skill.description}
            </p>
          ) : null}
        </div>
        {skill.homepage ? (
          <a
            href={skill.homepage}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 text-[11px] text-foreground/80 transition-colors hover:bg-muted/40"
            title={skill.homepage}
          >
            <ExternalLinkIcon className="size-3" />
          </a>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground/70">
        <span className="rounded-full border border-border/40 bg-background/70 px-1.5 py-0.5 font-mono">
          {sourceLabel}
        </span>
        <span className="truncate font-mono" title={skill.path}>
          {skill.path}
        </span>
      </div>
    </div>
  );
}

function ProviderSkillCard({
  skill,
}: {
  skill: {
    name: string;
    description?: string | undefined;
    interface?:
      | {
          readonly displayName?: string | undefined;
          readonly shortDescription?: string | undefined;
        }
      | undefined;
    enabled: boolean;
    path: string;
  };
}) {
  const displayName = skill.interface?.displayName ?? skill.name;
  const description = skill.interface?.shortDescription ?? skill.description ?? "";
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-(--sidebar-accent)">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-accent/30 text-[15px] font-semibold text-foreground">
        {skill.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-foreground">{displayName}</p>
        {description ? (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {skill.enabled ? (
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground/60">
          <CheckIcon className="size-3.5" />
        </span>
      ) : null}
    </div>
  );
}

function SkillsEmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 px-5 py-6 text-center">
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SkillsInlineWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/6 px-3 py-2.5 text-xs text-muted-foreground">
      <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
      <div>{children}</div>
    </div>
  );
}

/**
 * 市场浏览区域
 *
 * 展示 marketplace 上的热门技能，支持分类筛选、关键字搜索和安装。
 *
 * 数据流：
 * 1. 启动时拉取 categories + trending
 * 2. 用户输入搜索词时拉取 search(query, category)
 * 3. 点击安装时调用 install(marketplace:slug)
 */
function MarketplaceSection({ search }: { search: string }) {
  const [skills, setSkills] = useState<MarketplaceEntry[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [marketplaceStatus, setMarketplaceStatus] = useState<{ source: string; lastRefreshedAt?: string | null; count: number; remoteUrl?: string | null } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());

  // 拉取 categories + installed skills + status（仅一次）
  useEffect(() => {
    const marketplace = getSkillMarketplaceApi();
    if (!marketplace) return;

    marketplace
      .categories()
      .then((list: MarketplaceCategory[]) => {
        if (Array.isArray(list)) {
          setCategories(list);
        }
      })
      .catch((error: unknown) => {
        monitor.captureError({
          type: "skill_marketplace.categories",
          message: "failed to load skill marketplace categories",
          stack: error instanceof Error ? error.stack : undefined,
          context: {},
          level: "warning",
        });
      });

    // 拉取已安装技能列表，用于在市场卡片上标记已安装状态
    marketplace
      .listInstalled()
      .then((list: InstalledSkill[]) => {
        setInstalledNames(new Set(list.map((s) => s.name)));
      })
      .catch(() => {
        // 静默失败：不影响浏览体验
      });

    // 拉取市场状态
    marketplace
      .status()
      .then((status) => setMarketplaceStatus(status))
      .catch(() => {
        // 静默失败
      });
  }, []);

  // 刷新市场
  const handleRefresh = useCallback(async () => {
    const marketplace = getSkillMarketplaceApi();
    if (!marketplace) return;
    setIsRefreshing(true);
    try {
      const status = await marketplace.refresh();
      setMarketplaceStatus(status);
      // 重新拉取 trending/search
      const q = search.trim();
      const list = q
        ? await marketplace.search({ query: q, category: activeCategory === "all" ? null : activeCategory })
        : await marketplace.trending({ limit: 40 });
      setSkills(Array.isArray(list) ? list : []);
      toastManager.add({ type: "success", title: "市场已刷新", description: `${status.count} 个技能可用`, timeout: 2000 });
    } catch (error) {
      toastManager.add({ type: "error", title: "刷新失败", description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsRefreshing(false);
    }
  }, [search, activeCategory]);

  // 拉取 trending 或 search
  useEffect(() => {
    const marketplace = getSkillMarketplaceApi();
    if (!marketplace) return;
    setIsLoading(true);
    setLoadError(null);
    const q = search.trim();
    const promise = q
      ? marketplace.search({ query: q, category: activeCategory === "all" ? null : activeCategory })
      : marketplace.trending({ limit: 40 });
    promise
      .then((list: MarketplaceEntry[]) => {
        if (Array.isArray(list)) {
          setSkills(list);
        } else {
          setSkills([]);
        }
      })
      .catch((error: unknown) => {
        setLoadError(
          error instanceof Error ? error.message : "加载市场失败，请稍后重试",
        );
        monitor.captureError({
          type: "skill_marketplace.list",
          message: "failed to load skill marketplace list",
          stack: error instanceof Error ? error.stack : undefined,
          context: { query: q, category: activeCategory },
          level: "warning",
        });
      })
      .finally(() => setIsLoading(false));
  }, [search, activeCategory]);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            技能市场
          </h2>
          {marketplaceStatus && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {marketplaceStatus.source === "remote" ? "在线" : marketplaceStatus.source === "diskCache" ? "缓存" : "内置"}
              {" · "}
              {marketplaceStatus.count} 技能
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[11px] px-2"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="刷新市场索引"
          >
            {isRefreshing ? (
              <Loader2Icon className="mr-1 size-3 animate-spin" />
            ) : (
              <RocketIcon className="mr-1 size-3" />
            )}
            刷新
          </Button>
          <a
            href={SKILL_SH_HOMEPAGE}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <ExternalLinkIcon className="size-3" />
            访问 skill.sh
        </a>
        </div>
      </div>

      {categories.length > 0 && (
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          data-testid="skill-marketplace-categories"
        >
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                activeCategory === cat.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
              data-testid={`skill-category-${cat.id}`}
            >
              {cat.label}
              <span className="ml-1 text-[10px] text-muted-foreground/70">
                {cat.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {loadError ? (
        <div className="mt-4">
          <SkillsEmptyPanel title="加载失败" description={loadError} />
        </div>
      ) : isLoading && skills.length === 0 ? (
        <div className="mt-4 space-y-3">
          {["1", "2", "3", "4"].map((k) => (
            <Skeleton key={k} className="h-[88px] w-full rounded-xl" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="mt-4">
          <SkillsEmptyPanel
            title="未找到匹配的技能"
            description="尝试其他搜索词或切换分类"
          />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {skills.map((skill) => (
            <MarketplaceSkillCard
              key={`${skill.githubOwner}/${skill.githubRepo}#${skill.githubRef}/${skill.slug}`}
              skill={skill}
              alreadyInstalled={installedNames.has(skill.name)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MarketplaceSkillCard({ skill, alreadyInstalled }: { skill: MarketplaceEntry; alreadyInstalled?: boolean }) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(alreadyInstalled ?? false);
  const [installError, setInstallError] = useState<string | null>(null);

  const handleInstall = async () => {
    setIsInstalling(true);
    setInstallError(null);
    try {
      const marketplace = getSkillMarketplaceApi();
      // 后端 install 接受 marketplace:slug 格式
      await marketplace?.install({ source: `marketplace:${skill.slug}` });
      setIsInstalled(true);
      toastManager.add({
        type: "success",
        title: "安装成功",
        description: `${skill.name} 已安装到本地`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "安装失败，请稍后重试";
      setInstallError(message);
      monitor.captureError({
        type: "skill_marketplace.install",
        message: `failed to install skill ${skill.slug}`,
        stack: error instanceof Error ? error.stack : undefined,
        context: { slug: skill.slug },
        level: "error",
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const runtimeBadge = RUNTIME_BADGE[skill.runtime] ?? RUNTIME_BADGE.any;
  const githubUrl = `https://github.com/${skill.githubOwner}/${skill.githubRepo}`;

  return (
    <div
      className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-background/60 p-4 transition-colors hover:border-border hover:bg-muted/30"
      data-testid={`marketplace-skill-${skill.slug}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold leading-snug text-foreground">
              {skill.name}
            </p>
            {skill.verified && (
              <span title="已认证" className="inline-flex">
                <CircleCheckIcon className="size-3.5 shrink-0 text-primary" />
              </span>
            )}
            <Badge
              variant="outline"
              className={cn("text-[10px] font-medium", runtimeBadge?.className)}
            >
              {runtimeBadge?.label ?? skill.runtime}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground/85">
            {skill.description}
          </p>
          {skill.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skill.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border/40 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground/75"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <a
          href={githubUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 text-[11px] text-foreground/80 transition-colors hover:bg-muted/40"
          title={githubUrl}
        >
          <ExternalLinkIcon className="size-3" />
        </a>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span className="truncate font-mono" title={`${skill.githubOwner}/${skill.githubRepo}@${skill.githubRef}`}>
          {skill.githubOwner}/{skill.githubRepo}@{skill.githubRef}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={handleInstall}
          disabled={isInstalling || isInstalled}
          data-testid={`marketplace-skill-install-${skill.slug}`}
        >
          {isInstalling ? (
            <>
              <Loader2Icon className="mr-1 size-3 animate-spin" />
              安装中...
            </>
          ) : isInstalled ? (
            <>
              <CheckIcon className="mr-1 size-3" />
              已安装
            </>
          ) : (
            <>
              <DownloadIcon className="mr-1 size-3" />
              安装
            </>
          )}
        </Button>
      </div>

      {installError && (
        <p
          className="text-[11px] text-destructive"
          data-testid={`marketplace-skill-error-${skill.slug}`}
        >
          {installError}
        </p>
      )}
    </div>
  );
}

/**
 * 创建技能模板区域
 *
 * 提供可视化表单，帮助用户快速创建自定义 Skill。
 * 集成 `skill_marketplace.render_template` 实时预览 SKILL.md，
 * 以及 `skill_marketplace.create_from_template` 提交创建。
 */
function CreateSkillTemplateSection() {
  const [formData, setFormData] = useState<SkillTemplate>({
    name: "",
    version: "0.0.0",
    description: "",
    author: "",
    runtime: "any",
    tags: [],
    depends: [],
    body: "",
  });
  const [tagInput, setTagInput] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSkill, setCreatedSkill] = useState<InstalledSkill | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // 预览 SKILL.md：输入变化时 debounce 调用 render_template
  useEffect(() => {
    if (!formData.name || !(formData.body ?? "").trim()) {
      setPreview("");
      setPreviewError(null);
      return;
    }
    const handle = window.setTimeout(() => {
      const marketplace = getSkillMarketplaceApi();
      if (!marketplace) return;
      marketplace.renderTemplate?.(formData)
        .then((rendered: string) => {
          setPreview(typeof rendered === "string" ? rendered : "");
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          setPreviewError(
            error instanceof Error ? error.message : "无法生成预览",
          );
        });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [formData]);

  const isNameValid = /^[a-z0-9_-]{1,40}$/.test(formData.name);
  const canSubmit =
    isNameValid && (formData.body ?? "").trim().length > 0 && !isSubmitting;

  const handleAddTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (formData.tags?.includes(t)) {
      setTagInput("");
      return;
    }
    setFormData({
      ...formData,
      tags: [...(formData.tags ?? []), t],
    });
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: (formData.tags ?? []).filter((t) => t !== tag),
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setCreateError(null);
    try {
      const marketplace = getSkillMarketplaceApi();
      if (!marketplace) {
        throw new Error("技能市场 API 不可用");
      }
      if (!marketplace.createFromTemplate) {
        throw new Error("技能创建功能尚不可用");
      }
      const result = await marketplace.createFromTemplate(formData);
      setCreatedSkill(result);
      toastManager.add({
        type: "success",
        title: "技能已创建",
        description: `${formData.name} v${formData.version} 已写入本地注册表`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "创建技能失败";
      setCreateError(message);
      monitor.captureError({
        type: "skill_marketplace.create_from_template",
        message: `failed to create skill ${formData.name}`,
        stack: error instanceof Error ? error.stack : undefined,
        context: { name: formData.name, version: formData.version },
        level: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData({
      name: "",
      version: "0.0.0",
      description: "",
      author: "",
      runtime: "any",
      tags: [],
      depends: [],
      body: "",
    });
    setPreview("");
    setPreviewError(null);
    setCreatedSkill(null);
    setCreateError(null);
  };

  return (
    <section>
      <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        创建自定义技能
      </h2>
      <p className="mt-1 px-1 text-[12px] text-muted-foreground/80">
        填写以下信息创建您的自定义技能模板，右侧可预览 SKILL.md
      </p>

      {createdSkill ? (
        <div className="mt-4 space-y-3 rounded-xl border border-green-500/30 bg-green-500/5 p-6">
          <div className="flex items-center gap-2">
            <CircleCheckIcon className="size-5 text-green-600 dark:text-green-400" />
            <p className="text-sm font-semibold text-foreground">
              技能已创建成功
            </p>
          </div>
          <dl className="space-y-1 text-[12px] text-muted-foreground">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium">名称</dt>
              <dd className="font-mono">{createdSkill.name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium">版本</dt>
              <dd className="font-mono">{createdSkill.version}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium">运行时</dt>
              <dd className="font-mono">{createdSkill.runtime}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium">安装目录</dt>
              <dd className="truncate font-mono" title={createdSkill.installDir}>
                {createdSkill.installDir}
              </dd>
            </div>
          </dl>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleReset}>
              <PlusIcon className="mr-1 size-4" />
              再创建一个
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 左侧：表单 */}
          <div className="space-y-4 rounded-xl border border-border/60 bg-background/60 p-6">
            {/* 技能名称 */}
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground">
                技能名称
                <span className="ml-1 text-destructive">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="例如：code-review"
                data-testid="skill-template-name"
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {formData.name && !isNameValid && (
                <p className="text-[11px] text-destructive">
                  名称仅支持小写字母、数字、_、-，长度 1-40
                </p>
              )}
            </div>

            {/* 版本 + 运行时 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground">
                  版本
                </label>
                <input
                  type="text"
                  value={formData.version ?? ""}
                  onChange={(e) =>
                    setFormData({ ...formData, version: e.target.value })
                  }
                  placeholder="0.0.0"
                  data-testid="skill-template-version"
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground">
                  运行时
                </label>
                <select
                  value={formData.runtime ?? "any"}
                  onChange={(e) =>
                    setFormData({ ...formData, runtime: e.target.value })
                  }
                  data-testid="skill-template-runtime"
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="any">Any</option>
                  <option value="code">Code</option>
                  <option value="work">Work</option>
                </select>
              </div>
            </div>

            {/* 作者 */}
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground">
                作者
              </label>
              <input
                type="text"
                value={formData.author ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, author: e.target.value })
                }
                placeholder="例如：云顶数字 Team"
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* 描述 */}
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground">
                描述
              </label>
              <textarea
                value={formData.description ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="简要描述这个技能的功能..."
                rows={2}
                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* 标签 */}
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground">
                标签
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="输入后回车添加"
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={handleAddTag}
                  disabled={!tagInput.trim()}
                >
                  添加
                </Button>
              </div>
              {(formData.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(formData.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-foreground"
                        aria-label={`移除标签 ${tag}`}
                      >
                        <XIcon className="size-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 提示词 */}
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground">
                提示词模板
                <span className="ml-1 text-destructive">*</span>
              </label>
              <textarea
                value={formData.body ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, body: e.target.value })
                }
                placeholder="输入技能的提示词模板（注入 LLM 上下文）..."
                rows={8}
                data-testid="skill-template-body"
                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground/70">
                这段文本会作为 SKILL.md 的正文，注入到模型上下文
              </p>
            </div>

            {/* 错误提示 */}
            {createError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {createError}
              </div>
            )}

            {/* 提交按钮 */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleReset}>
                重置
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                data-testid="skill-template-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2Icon className="mr-1 size-4 animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <PlusIcon className="mr-1 size-4" />
                    创建技能
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 右侧：SKILL.md 预览 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                SKILL.md 预览
              </h3>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <EyeIcon className="size-3" />
                {showPreview ? "隐藏" : "显示"}
              </button>
            </div>
            {showPreview ? (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                {previewError ? (
                  <p className="text-[12px] text-destructive">{previewError}</p>
                ) : preview ? (
                  <pre
                    className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground/85"
                    data-testid="skill-template-preview"
                  >
                    {preview}
                  </pre>
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    填写名称与提示词后，将在此预览 SKILL.md
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/30 p-6 text-center">
                <p className="text-[12px] text-muted-foreground">
                  点击右上角"显示"查看 SKILL.md 渲染效果
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
