import { BookIcon, CalendarIcon, ClockIcon, RocketIcon, SparklesIcon } from "../lib/icons";
import { SidebarInset } from "./ui/sidebar";
import { useMessages } from "../i18n/I18nContext";

type AutomationTemplate = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly prompt: string;
  readonly icon: React.FC<{ className?: string }>;
};

const AUTOMATION_TEMPLATES: ReadonlyArray<AutomationTemplate> = [
  {
    id: "daily-briefing",
    title: "Daily briefing",
    description: "Each morning, summarize yesterday's commits, open PRs, and team activity.",
    prompt:
      "Create a daily briefing automation that runs every weekday at 8:00 AM, summarizing yesterday's commits, open pull requests, and team activity in the active project.",
    icon: CalendarIcon,
  },
  {
    id: "weekly-review",
    title: "Weekly review",
    description:
      "Every Friday, generate a recap of the week with highlights, blockers, and next steps.",
    prompt:
      "Create a weekly review automation that runs every Friday at 4:00 PM, generating a recap of the week with highlights, blockers, and proposed next steps.",
    icon: BookIcon,
  },
  {
    id: "project-monitor",
    title: "Project monitor",
    description:
      "Watch the active project for failing checks, stale issues, or drift, and surface a digest on demand.",
    prompt:
      "Create an on-demand project monitor automation that scans the active project for failing checks, stale issues, or unreviewed pull requests and produces a prioritized digest.",
    icon: RocketIcon,
  },
];

export function AutomationsView() {
  const messages = useMessages();

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden isolate">
      <div className="flex h-full min-h-0 flex-col bg-background">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold text-foreground">
              {messages.sidebar.automationsLabel}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground/80">
              {messages.automations.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-3 text-[12px] text-foreground/80 transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SparklesIcon className="size-3.5" />
              {messages.automations.viewTemplates}
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-8 items-center rounded-md bg-foreground/90 px-3 text-[12px] font-medium text-background transition-colors hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {messages.automations.createFromChat}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-10">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
            <div className="mb-6 flex size-16 items-center justify-center rounded-full border border-border/60 bg-background/60">
              <ClockIcon className="size-7 text-muted-foreground/70" />
            </div>
            <h2 className="text-[20px] font-semibold text-foreground">
              {messages.automations.emptyTitle}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground/85">
              {messages.automations.emptyDescription}
            </p>
            <span className="mt-6 inline-flex h-7 items-center rounded-full border border-dashed border-border/70 px-3 text-[11px] uppercase tracking-wider text-muted-foreground/60">
              {messages.sidebar.automationsComingSoon}
            </span>
          </div>

          <div className="mx-auto mt-10 w-full max-w-3xl">
            <h3 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {messages.automations.templatesHeading}
            </h3>
            <p className="mt-1 px-1 text-[12px] text-muted-foreground/80">
              {messages.automations.templatesHint}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {AUTOMATION_TEMPLATES.map((template) => (
                <AutomationTemplateCard key={template.id} template={template} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

function AutomationTemplateCard({ template }: { template: AutomationTemplate }) {
  const Icon = template.icon;
  return (
    <button
      type="button"
      disabled
      className="group flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-background/60 p-4 text-left transition-colors hover:border-border hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-90"
    >
      <div className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background/80">
        <Icon className="size-4 text-foreground/85" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug text-foreground">{template.title}</p>
        <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground/85">
          {template.description}
        </p>
      </div>
    </button>
  );
}
