import { type FC, useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BookIcon, ClockIcon, PlugIcon } from "../lib/icons";
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
        "hover:bg-accent/60 hover:text-foreground",
        active
          ? "border-border bg-accent/40 text-foreground"
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
  const activeTab = isOnPlugins && routeSearch.tab === "skills" ? "skills" : "plugins";

  const onSelectSkills = useCallback(() => {
    void navigate({ to: "/plugins", search: { tab: "skills" } });
  }, [navigate]);

  const onSelectPlugins = useCallback(() => {
    void navigate({ to: "/plugins", search: { tab: "plugins" } });
  }, [navigate]);

  const onSelectAutomations = useCallback(() => {
    void navigate({ to: "/automations" });
  }, [navigate]);

  return (
    <div className="px-1.5 pt-1 pb-1.5">
      <div className="mb-1 flex items-center px-2">
        <span className="text-[length:var(--app-font-size-ui,12px)] font-normal text-muted-foreground/58">
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
          icon={ClockIcon}
          label={messages.sidebar.automationsLabel}
          active={isOnAutomations}
          onClick={onSelectAutomations}
          testId="sidebar-command-automations"
        />
      </div>
    </div>
  );
}
