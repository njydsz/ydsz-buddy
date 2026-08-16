/**
 * @file 侧边栏命令网格
 *
 * 侧边栏底部的快捷命令网格（线程 / 技能 / 历史 等）：
 *
 * - **网格布局**：2-3 列命令卡
 * - **路由感知**：当前路由高亮
 * - **i18n**：标签来自 `useMessages`
 *
 * ## 核心导出
 *
 * - `SidebarCommandGrid`：主组件
 *
 * ## 使用场景
 *
 * - 侧边栏底部
 *
 * ## 注意事项
 *
 * - 通过 `useSearch` 获取当前路由
 * - 跳转使用 `useNavigate`
 */
import { type FC, useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  BookIcon,
  ClockIcon,
  PlugIcon,
  FileTextIcon,
  Code2Icon,
  GitPullRequestIcon,
  ListTodoIcon,
  PuzzleIcon,
} from "../lib/icons";
import { cn } from "../lib/utils";
import { useMessages } from "../i18n/I18nContext";

type CommandCardProps = {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly testId?: string;
};

function CommandCard({ icon: Icon, label, active, onClick, testId }: CommandCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "group flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2.5 text-left transition-colors",
        "hover:bg-muted/50 hover:text-foreground",
        active
          ? "border-border bg-muted/30 text-foreground"
          : "border-border/40 bg-background/40 text-foreground/80",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="w-full truncate text-center text-[length:var(--app-font-size-ui,12px)] leading-tight font-normal">
        {label}
      </span>
    </button>
  );
}

export function SidebarCommandGrid({ pathname }: { readonly pathname: string }) {
  const messages = useMessages();
  const navigate = useNavigate();
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>;

  const isOnPlugins = pathname.startsWith("/plugins");
  const isOnAutomations = pathname.startsWith("/automations");
  const isOnWiki = pathname.startsWith("/wiki");
  const isOnEditor = pathname.startsWith("/editor");
  const isOnPulls = pathname.startsWith("/pulls");
  const isOnLinear = pathname.startsWith("/linear");
  // 当 `/plugins?tab=extensions` 时,高亮 Extensions 卡;否则按 tab 区分 Skills / Plugins。
  const activeTab =
    isOnPlugins && routeSearch.tab === "skills"
      ? "skills"
      : isOnPlugins && routeSearch.tab === "extensions"
        ? "extensions"
        : "plugins";

  const onSelectSkills = useCallback(() => {
    void navigate({ to: "/plugins", search: { tab: "skills" } });
  }, [navigate]);

  const onSelectPlugins = useCallback(() => {
    void navigate({ to: "/plugins", search: { tab: "plugins" } });
  }, [navigate]);

  const onSelectExtensions = useCallback(() => {
    void navigate({ to: "/plugins", search: { tab: "extensions" } });
  }, [navigate]);

  const onSelectAutomations = useCallback(() => {
    void navigate({ to: "/automations" });
  }, [navigate]);

  const onSelectWiki = useCallback(() => {
    void navigate({ to: "/wiki" });
  }, [navigate]);

  const onSelectEditor = useCallback(() => {
    void navigate({ to: "/editor" });
  }, [navigate]);

  const onSelectPulls = useCallback(() => {
    void navigate({ to: "/pulls" });
  }, [navigate]);

  const onSelectLinear = useCallback(() => {
    void navigate({ to: "/linear" });
  }, [navigate]);

  return (
    <div className="px-1.5 pt-1 pb-1.5">
      <div className="mb-1 flex items-center px-2">
        <span className="text-(length:--app-font-size-ui,12px) font-normal text-muted-foreground/58">
          {messages.sidebar.commandsHeading}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <CommandCard
          icon={BookIcon}
          label={messages.sidebar.skillsLabel}
          active={isOnPlugins && activeTab === "skills"}
          onClick={onSelectSkills}
          testId="sidebar-command-skills"
        />
        <CommandCard
          icon={PlugIcon}
          label={messages.sidebar.pluginsLabel}
          active={isOnPlugins && activeTab === "plugins"}
          onClick={onSelectPlugins}
          testId="sidebar-command-plugins"
        />
        <CommandCard
          icon={PuzzleIcon}
          label={messages.sidebar.extensionsLabel}
          active={isOnPlugins && activeTab === "extensions"}
          onClick={onSelectExtensions}
          testId="sidebar-command-extensions"
        />
        <CommandCard
          icon={ClockIcon}
          label={messages.sidebar.automationsLabel}
          active={isOnAutomations}
          onClick={onSelectAutomations}
          testId="sidebar-command-automations"
        />
        <CommandCard
          icon={FileTextIcon}
          label={messages.sidebar.wikiLabel ?? "Wiki"}
          active={isOnWiki}
          onClick={onSelectWiki}
          testId="sidebar-command-wiki"
        />
        <CommandCard
          icon={Code2Icon}
          label={messages.sidebar.editorLabel}
          active={isOnEditor}
          onClick={onSelectEditor}
          testId="sidebar-command-editor"
        />
        <CommandCard
          icon={GitPullRequestIcon}
          label={messages.sidebar.pullsLabel}
          active={isOnPulls}
          onClick={onSelectPulls}
          testId="sidebar-command-pulls"
        />
        <CommandCard
          icon={ListTodoIcon}
          label={messages.sidebar.linearLabel}
          active={isOnLinear}
          onClick={onSelectLinear}
          testId="sidebar-command-linear"
        />
      </div>
    </div>
  );
}
