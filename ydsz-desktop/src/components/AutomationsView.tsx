import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BookIcon,
  CalendarIcon,
  ClockIcon,
  PlayIcon,
  PlusIcon,
  RocketIcon,
  SparklesIcon,
  SquarePenIcon,
  Trash2,
  XIcon,
} from "../lib/icons";
import { SidebarInset } from "./ui/sidebar";
import { Switch } from "./ui/switch";
import { useMessages } from "../i18n/I18nContext";
import { tauriBridge } from "../lib/tauri-bridge";
import { isTauri } from "../env";

/**
 * @file 自动化（Automations）视图 — 定时任务管理
 *
 * 侧边栏 "Automations" 标签对应的主界面：展示/创建/编辑/删除定时任务，
 * 支持启停与手动触发，并提供 CRON 表达式的人类可读预览。
 *
 * ## 核心导出
 *
 * - `AutomationsView`：自动化页主组件
 *
 * ## 后端依赖（Tauri 命令）
 *
 * 以下命令需在 src-tauri 侧注册到 `invoke_handler`，各自封装对应的
 * `OrchestrationCommand::SchedulerTask*` 并委托给 `SchedulerService`：
 *
 * - `scheduler_task_list({ threadId?: string | null }) -> ScheduledJob[]`
 * - `scheduler_task_create({ taskId, threadId, cronExpression, prompt, enabled }) -> void`
 * - `scheduler_task_update({ taskId, cronExpression?, prompt? }) -> void`
 * - `scheduler_task_delete({ taskId }) -> void`
 * - `scheduler_task_set_enabled({ taskId, enabled }) -> void`
 * - `scheduler_task_trigger({ taskId }) -> void`
 *
 * 参数名采用 camelCase（Tauri v2 自动将 Rust snake_case 参数名转换为 camelCase）。
 * 返回的 `ScheduledJob` 字段同样为 camelCase（后端 `#[serde(rename_all = "camelCase")]`）。
 */

// ============================================================================
// 类型定义 — 对齐后端 `ScheduledJob`（ydsz-scheduler/src/job.rs）
// ============================================================================

type ScheduledJob = {
  taskId: string;
  threadId: string;
  cronExpression: string;
  prompt: string;
  enabled: boolean;
  createdAt: string;
  lastFiredAt: string | null;
  nextFireAt: string | null;
};

type ThreadSummary = {
  id: string;
  title: string;
};

type FormState = {
  taskId?: string;
  threadId: string;
  cronExpression: string;
  prompt: string;
  enabled: boolean;
};

// ============================================================================
// Tauri 命令封装
// ============================================================================

const SCHEDULER_TASKS_QUERY_KEY = ["scheduler", "tasks"] as const;
const SCHEDULER_THREADS_QUERY_KEY = ["scheduler", "threads"] as const;

async function listSchedulerTasks(): Promise<ScheduledJob[]> {
  if (!isTauri) return [];
  return await invoke<ScheduledJob[]>("scheduler_task_list", { threadId: null });
}

async function listThreads(): Promise<ThreadSummary[]> {
  if (!isTauri) return [];
  const snapshot = await tauriBridge.orchestration.getSnapshot();
  return snapshot.threads.map((t) => ({ id: t.id, title: t.title }));
}

// ============================================================================
// CRON 人类可读预览（best-effort，覆盖常见 5 字段模式）
// ============================================================================

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function isNumeric(s: string): boolean {
  return /^\d+$/.test(s);
}

function pad2(n: string): string {
  return n.padStart(2, "0");
}

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // 每分钟
  if (parts.every((p) => p === "*")) return "每分钟";

  // 每 N 分钟
  const everyNMinutes = minute.match(/^\*\/(\d+)$/);
  if (everyNMinutes && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `每 ${everyNMinutes[1]} 分钟`;
  }

  // 每 N 小时
  const everyNHours = hour.match(/^\*\/(\d+)$/);
  if (
    everyNHours &&
    (minute === "0" || minute === "*") &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `每 ${everyNHours[1]} 小时`;
  }

  // 特定时间
  if (isNumeric(minute) && isNumeric(hour) && dayOfMonth === "*" && month === "*") {
    const time = `${pad2(hour)}:${pad2(minute)}`;
    if (dayOfWeek === "*") return `每天 ${time}`;
    if (dayOfWeek === "1-5") return `每个工作日 ${time}`;
    if (dayOfWeek === "0,6" || dayOfWeek === "6,0") return `每个周末 ${time}`;
    if (isNumeric(dayOfWeek)) {
      const n = parseInt(dayOfWeek, 10);
      if (n >= 0 && n <= 6) return `${WEEKDAY_NAMES[n]} ${time}`;
    }
    const dows = dayOfWeek.split(",");
    if (dows.every((d) => isNumeric(d))) {
      const names = dows
        .map((d) => WEEKDAY_NAMES[parseInt(d, 10)] ?? d)
        .join("、");
      return `${names} ${time}`;
    }
  }

  // 每月 N 日
  if (
    isNumeric(minute) &&
    isNumeric(hour) &&
    isNumeric(dayOfMonth) &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `每月 ${dayOfMonth} 日 ${pad2(hour)}:${pad2(minute)}`;
  }

  return expr;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// 预置模板（保留原占位页的种子 prompt，点击后预填表单）
// ============================================================================

type AutomationTemplate = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly prompt: string;
  readonly cron: string;
  readonly icon: React.FC<{ className?: string }>;
};

const AUTOMATION_TEMPLATES: ReadonlyArray<AutomationTemplate> = [
  {
    id: "daily-briefing",
    title: "Daily briefing",
    description: "Each morning, summarize yesterday's commits, open PRs, and team activity.",
    prompt:
      "Summarize yesterday's commits, open pull requests, and team activity in the active project.",
    cron: "0 9 * * 1-5",
    icon: CalendarIcon,
  },
  {
    id: "weekly-review",
    title: "Weekly review",
    description:
      "Every Friday, generate a recap of the week with highlights, blockers, and next steps.",
    prompt:
      "Generate a weekly review recap with highlights, blockers, and proposed next steps for this project.",
    cron: "0 16 * * 5",
    icon: BookIcon,
  },
  {
    id: "project-monitor",
    title: "Project monitor",
    description:
      "Watch the active project for failing checks, stale issues, or drift, and surface a digest.",
    prompt:
      "Scan the active project for failing checks, stale issues, or unreviewed pull requests and produce a prioritized digest.",
    cron: "0 10 * * *",
    icon: RocketIcon,
  },
];

const EMPTY_FORM: FormState = {
  threadId: "",
  cronExpression: "0 9 * * *",
  prompt: "",
  enabled: true,
};

// ============================================================================
// 主组件
// ============================================================================

export function AutomationsView() {
  const messages = useMessages();
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: SCHEDULER_TASKS_QUERY_KEY,
    queryFn: listSchedulerTasks,
    enabled: isTauri,
    staleTime: 5_000,
    refetchInterval: 30_000,
  });

  const threadsQuery = useQuery({
    queryKey: SCHEDULER_THREADS_QUERY_KEY,
    queryFn: listThreads,
    enabled: isTauri,
    staleTime: 30_000,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const tasks = tasksQuery.data ?? [];
  const threads = threadsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: async (input: FormState) => {
      await invoke("scheduler_task_create", {
        taskId: input.taskId || crypto.randomUUID(),
        threadId: input.threadId,
        cronExpression: input.cronExpression,
        prompt: input.prompt,
        enabled: input.enabled,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCHEDULER_TASKS_QUERY_KEY });
      setFormOpen(false);
      setFormError(null);
    },
    onError: (e) => setFormError(formatError(e)),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: FormState) => {
      await invoke("scheduler_task_update", {
        taskId: input.taskId,
        cronExpression: input.cronExpression,
        prompt: input.prompt,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCHEDULER_TASKS_QUERY_KEY });
      setFormOpen(false);
      setFormError(null);
    },
    onError: (e) => setFormError(formatError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await invoke("scheduler_task_delete", { taskId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCHEDULER_TASKS_QUERY_KEY });
    },
  });

  const setEnabledMutation = useMutation({
    mutationFn: async (args: { taskId: string; enabled: boolean }) => {
      await invoke("scheduler_task_set_enabled", args);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCHEDULER_TASKS_QUERY_KEY });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await invoke("scheduler_task_trigger", { taskId });
    },
  });

  function openCreateForm(partial?: Partial<FormState>) {
    setFormState({ ...EMPTY_FORM, ...partial });
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(task: ScheduledJob) {
    setFormState({
      taskId: task.taskId,
      threadId: task.threadId,
      cronExpression: task.cronExpression,
      prompt: task.prompt,
      enabled: task.enabled,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formState.threadId) {
      setFormError("请选择关联会话");
      return;
    }
    if (!formState.cronExpression.trim()) {
      setFormError("请输入 CRON 表达式");
      return;
    }
    if (!formState.prompt.trim()) {
      setFormError("请输入触发 prompt");
      return;
    }
    if (formState.taskId) {
      updateMutation.mutate(formState);
    } else {
      createMutation.mutate(formState);
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const showEmptyState = !tasksQuery.isLoading && tasks.length === 0 && !formOpen;

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
              onClick={() => openCreateForm()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/90 px-3 text-[12px] font-medium text-background transition-colors hover:bg-foreground"
            >
              <PlusIcon className="size-3.5" />
              新建任务
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
          {formOpen ? (
            <SchedulerTaskForm
              formState={formState}
              threads={threads}
              isEditing={!!formState.taskId}
              isSubmitting={isSubmitting}
              error={formError}
              onChange={setFormState}
              onSubmit={handleSubmit}
              onCancel={() => setFormOpen(false)}
            />
          ) : null}

          {tasksQuery.isLoading ? (
            <div className="mx-auto w-full max-w-3xl py-12 text-center text-[13px] text-muted-foreground/70">
              加载中…
            </div>
          ) : showEmptyState ? (
            <EmptyState
              messages={messages}
              onPickTemplate={(tpl) =>
                openCreateForm({ cronExpression: tpl.cron, prompt: tpl.prompt })
              }
            />
          ) : tasks.length > 0 ? (
            <div className="mx-auto w-full max-w-3xl space-y-3">
              <div className="flex items-baseline justify-between px-1">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  定时任务
                </h3>
                <span className="text-[11px] text-muted-foreground/70">
                  共 {tasks.length} 个
                </span>
              </div>
              {tasks.map((task) => (
                <SchedulerTaskCard
                  key={task.taskId}
                  task={task}
                  threadTitle={
                    threads.find((t) => t.id === task.threadId)?.title ?? task.threadId
                  }
                  onEdit={() => openEditForm(task)}
                  onDelete={() => deleteMutation.mutate(task.taskId)}
                  onToggle={() =>
                    setEnabledMutation.mutate({
                      taskId: task.taskId,
                      enabled: !task.enabled,
                    })
                  }
                  onTrigger={() => triggerMutation.mutate(task.taskId)}
                  isToggling={setEnabledMutation.isPending}
                  isTriggering={triggerMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </SidebarInset>
  );
}

// ============================================================================
// 子组件：创建/编辑表单
// ============================================================================

function SchedulerTaskForm({
  formState,
  threads,
  isEditing,
  isSubmitting,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  formState: FormState;
  threads: ReadonlyArray<ThreadSummary>;
  isEditing: boolean;
  isSubmitting: boolean;
  error: string | null;
  onChange: (state: FormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const cronPreview = useMemo(
    () => describeCron(formState.cronExpression),
    [formState.cronExpression],
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    onChange({ ...formState, [key]: value });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-3xl rounded-xl border border-border/60 bg-background/60 p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">
          {isEditing ? "编辑定时任务" : "新建定时任务"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
          aria-label="取消"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {/* 关联会话 */}
        <Field label="关联会话">
          <select
            value={formState.threadId}
            onChange={(e) => update("threadId", e.target.value)}
            disabled={isEditing}
            className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">选择会话…</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          {isEditing ? (
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              编辑模式下不可更改关联会话
            </p>
          ) : null}
        </Field>

        {/* CRON 表达式 */}
        <Field label="CRON 表达式">
          <input
            type="text"
            value={formState.cronExpression}
            onChange={(e) => update("cronExpression", e.target.value)}
            placeholder="0 9 * * 1-5"
            spellCheck={false}
            className="h-9 w-full rounded-md border border-border/60 bg-background px-3 font-mono text-[13px] text-foreground outline-none transition-colors focus:border-foreground/40"
          />
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            预览：<span className="text-foreground/85">{cronPreview}</span>
            <span className="ml-2 text-muted-foreground/60">（5 字段：分 时 日 月 周）</span>
          </p>
        </Field>

        {/* Prompt */}
        <Field label="触发 Prompt">
          <textarea
            value={formState.prompt}
            onChange={(e) => update("prompt", e.target.value)}
            placeholder="到达触发时间时发送给会话的 prompt"
            rows={3}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none transition-colors focus:border-foreground/40"
          />
        </Field>

        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-foreground">启用任务</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              关闭后任务将不会被自动触发
            </p>
          </div>
          <Switch
            checked={formState.enabled}
            onCheckedChange={(v) => update("enabled", v)}
          />
        </div>

        {error ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-500/90">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center rounded-md border border-border/60 px-3 text-[12px] text-foreground/80 transition-colors hover:bg-muted/40"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-8 items-center rounded-md bg-foreground/90 px-3 text-[12px] font-medium text-background transition-colors hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "保存中…" : isEditing ? "保存修改" : "创建任务"}
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// 子组件：任务卡片
// ============================================================================

function SchedulerTaskCard({
  task,
  threadTitle,
  onEdit,
  onDelete,
  onToggle,
  onTrigger,
  isToggling,
  isTriggering,
  isDeleting,
}: {
  task: ScheduledJob;
  threadTitle: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onTrigger: () => void;
  isToggling: boolean;
  isTriggering: boolean;
  isDeleting: boolean;
}) {
  const cronPreview = useMemo(() => describeCron(task.cronExpression), [task.cronExpression]);

  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium ${
                task.enabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500/90"
                  : "border-border/60 bg-background/60 text-muted-foreground/70"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  task.enabled ? "bg-emerald-500" : "bg-muted-foreground/50"
                }`}
              />
              {task.enabled ? "已启用" : "已暂停"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground/70" title={task.taskId}>
              {task.taskId.slice(0, 8)}
            </span>
          </div>

          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-foreground/90">
            {task.prompt}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground/75">
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="size-3" />
              <span className="font-mono">{task.cronExpression}</span>
              <span className="text-foreground/60">· {cronPreview}</span>
            </span>
            <span className="inline-flex items-center gap-1" title={task.threadId}>
              <BookIcon className="size-3" />
              <span className="max-w-[180px] truncate">{threadTitle}</span>
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground/65">
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3" />
              下次触发：{formatDateTime(task.nextFireAt)}
            </span>
            <span>上次触发：{formatDateTime(task.lastFiredAt)}</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label={task.enabled ? "暂停" : "启用"}
            onClick={onToggle}
            disabled={isToggling}
          >
            {task.enabled ? <PauseGlyph /> : <PlayIcon className="size-3.5" />}
          </IconButton>
          <IconButton label="立即触发" onClick={onTrigger} disabled={isTriggering}>
            <RocketIcon className="size-3.5" />
          </IconButton>
          <IconButton label="编辑" onClick={onEdit}>
            <SquarePenIcon className="size-3.5" />
          </IconButton>
          <IconButton
            label="删除"
            onClick={onDelete}
            disabled={isDeleting}
            danger
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex size-7 items-center justify-center rounded-md border border-border/50 bg-background/60 text-muted-foreground/80 transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? "hover:border-red-500/40 hover:text-red-500/90" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** 暂停图标（项目 icons 中未导出 PauseIcon，用内联 SVG 替代） */
function PauseGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className ?? "size-3.5"}
      aria-hidden="true"
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

// ============================================================================
// 子组件：空状态（保留原模板卡片，点击预填表单）
// ============================================================================

function EmptyState({
  messages,
  onPickTemplate,
}: {
  messages: ReturnType<typeof useMessages>;
  onPickTemplate: (tpl: AutomationTemplate) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-full border border-border/60 bg-background/60">
          <ClockIcon className="size-7 text-muted-foreground/70" />
        </div>
        <h2 className="text-[20px] font-semibold text-foreground">
          {messages.automations.emptyTitle}
        </h2>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground/85">
          {messages.automations.emptyDescription}
        </p>
      </div>

      <div className="mt-10">
        <h3 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {messages.automations.templatesHeading}
        </h3>
        <p className="mt-1 px-1 text-[12px] text-muted-foreground/80">
          {messages.automations.templatesHint}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {AUTOMATION_TEMPLATES.map((template) => (
            <AutomationTemplateCard
              key={template.id}
              template={template}
              onClick={() => onPickTemplate(template)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AutomationTemplateCard({
  template,
  onClick,
}: {
  template: AutomationTemplate;
  onClick: () => void;
}) {
  const Icon = template.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-background/60 p-4 text-left transition-colors hover:border-border hover:bg-muted/30"
    >
      <div className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background/80">
        <Icon className="size-4 text-foreground/85" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug text-foreground">
          {template.title}
        </p>
        <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground/85">
          {template.description}
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 group-hover:text-foreground/70">
        <SparklesIcon className="size-3" />
        用作起点
      </span>
    </button>
  );
}

// ============================================================================
// 辅助：表单字段容器 & 错误格式化
// ============================================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-foreground/85">{label}</span>
      {children}
    </label>
  );
}

function formatError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
