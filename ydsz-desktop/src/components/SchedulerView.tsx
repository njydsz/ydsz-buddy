/**
 * @file Scheduler 定时任务可视化页面
 *
 * 侧边栏 "Scheduler" 标签对应的主界面：展示/创建/编辑/删除定时任务，
 * 支持启停与手动触发，并提供 CRON 可视化选择器和人类可读预览。
 *
 * ## 核心导出
 *
 * - `SchedulerView`：定时任务页主组件
 *
 * ## 功能
 *
 * 1. 任务列表展示（表格风格）
 * 2. 创建/编辑任务表单（含可视化 CRON 选择器）
 * 3. 操作按钮：暂停/恢复、删除、立即执行、编辑
 * 4. CRON 预览（人类可读的下次执行时间）
 * 5. 执行历史（最近执行记录）
 * 6. 内置模板快捷创建（日报、周报、数据同步等）
 *
 * ## 后端依赖（Tauri 命令）
 *
 * - `scheduler_task_list({ threadId?: string | null }) -> ScheduledJob[]`
 * - `scheduler_task_create({ taskId, threadId, cronExpression, prompt, enabled }) -> void`
 * - `scheduler_task_update({ taskId, cronExpression?, prompt? }) -> void`
 * - `scheduler_task_delete({ taskId }) -> void`
 * - `scheduler_task_set_enabled({ taskId, enabled }) -> void`
 * - `scheduler_task_trigger({ taskId }) -> void`
 */

import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CalendarIcon,
  ClockIcon,
  ListDetailsIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RocketIcon,
  SettingsIcon,
  SparklesIcon,
  SquarePenIcon,
  Trash2,
  XIcon,
} from "../lib/icons";
import { SidebarInset } from "./ui/sidebar";
import { Switch } from "./ui/switch";
import { tauriBridge } from "../lib/tauri-bridge";
import { isTauri } from "../env";

// ============================================================================
// 类型定义
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

/** 执行历史记录（本地模拟，后端暂无独立接口） */
type ExecutionRecord = {
  id: string;
  taskId: string;
  executedAt: string;
  status: "success" | "failed" | "running";
  outputPreview: string;
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
// CRON 工具函数
// ============================================================================

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAY_NAMES_SHORT = ["日", "一", "二", "三", "四", "五", "六"];

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

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "从未";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = d.getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const minutes = Math.floor(absDiff / 60000);
  const hours = Math.floor(absDiff / 3600000);
  const days = Math.floor(absDiff / 86400000);

  if (diff > 0) {
    if (minutes < 1) return "即将执行";
    if (minutes < 60) return `${minutes} 分钟后`;
    if (hours < 24) return `${hours} 小时后`;
    return `${days} 天后`;
  }
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

// ============================================================================
// CRON 可视化选择器
// ============================================================================

type CronPart = "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek";

function parseCron(expr: string): Record<CronPart, string> {
  const parts = expr.trim().split(/\s+/);
  return {
    minute: parts[0] ?? "*",
    hour: parts[1] ?? "*",
    dayOfMonth: parts[2] ?? "*",
    month: parts[3] ?? "*",
    dayOfWeek: parts[4] ?? "*",
  };
}

function buildCron(parts: Record<CronPart, string>): string {
  return `${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`;
}

/** CRON 分/时/日/月/周 可视化选择器 */
function CronBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (expr: string) => void;
}) {
  const parts = useMemo(() => parseCron(value), [value]);
  const preview = useMemo(() => describeCron(value), [value]);

  const update = (field: CronPart, val: string) => {
    onChange(buildCron({ ...parts, [field]: val }));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        <CronField label="分" value={parts.minute} onChange={(v) => update("minute", v)} />
        <CronField label="时" value={parts.hour} onChange={(v) => update("hour", v)} />
        <CronField label="日" value={parts.dayOfMonth} onChange={(v) => update("dayOfMonth", v)} />
        <CronField label="月" value={parts.month} onChange={(v) => update("month", v)} />
        <CronField
          label="周"
          value={parts.dayOfWeek}
          onChange={(v) => update("dayOfWeek", v)}
          suffix={
            parts.dayOfWeek !== "*" && !parts.dayOfWeek.includes("/")
              ? `(${parts.dayOfWeek
                  .split(",")
                  .map((d) => (isNumeric(d) ? WEEKDAY_NAMES_SHORT[parseInt(d, 10)] ?? d : d))
                  .join("/")})`
              : undefined
          }
        />
      </div>
      <p className="text-[11px] text-muted-foreground/80">
        预览：<span className="font-medium text-foreground/85">{preview}</span>
      </p>
    </div>
  );
}

function CronField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="*"
        className="h-8 w-full rounded-md border border-border/60 bg-background px-1 text-center font-mono text-[12px] text-foreground outline-none transition-colors focus:border-foreground/40"
      />
      {suffix ? (
        <span className="text-[9px] text-muted-foreground/50">{suffix}</span>
      ) : null}
    </div>
  );
}

// ============================================================================
// 执行历史（本地模拟数据 — 后端暂无独立接口，占位用）
// ============================================================================

function useExecutionHistory(taskId: string): ExecutionRecord[] {
  // 当前后端未暴露执行历史接口，返回空数组；后续可接入 scheduler_task_history 命令
  return useMemo(() => [], [taskId]);
}

// ============================================================================
// 预置模板
// ============================================================================

type SchedulerTemplate = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly prompt: string;
  readonly cron: string;
};

const SCHEDULER_TEMPLATES: ReadonlyArray<SchedulerTemplate> = [
  {
    id: "daily-report",
    title: "每日日报",
    description: "每天早上汇总昨日工作、今日计划和阻塞项",
    prompt:
      "请汇总昨日完成的工作事项、今日的工作计划，以及当前遇到的阻塞项。生成一份简洁的日报。",
    cron: "0 9 * * 1-5",
  },
  {
    id: "weekly-report",
    title: "每周周报",
    description: "每周五下午生成本周工作总结与下周规划",
    prompt:
      "请生成本周的工作总结报告，包括：本周完成的主要工作、遇到的挑战和解决方案、下周的工作计划。以结构化周报形式输出。",
    cron: "0 17 * * 5",
  },
  {
    id: "data-sync",
    title: "数据同步",
    description: "定期同步项目数据，检查 CI/CD 状态",
    prompt:
      "检查当前项目的最新 CI/CD pipeline 运行状态，汇总最近一次构建结果和测试报告。如有失败，分析原因并给出修复建议。",
    cron: "0 */2 * * *",
  },
  {
    id: "code-review-digest",
    title: "代码审查摘要",
    description: "定时检查待审查的 Pull Request 并生成摘要",
    prompt:
      "列出当前所有待审查的 pull request，对每一个 PR 给出简要摘要，包括变更范围、潜在风险点。按优先级排序。",
    cron: "0 10,15 * * 1-5",
  },
  {
    id: "standup-prep",
    title: "站会准备",
    description: "站会前自动整理个人进度与阻塞",
    prompt:
      "基于最近的 git commits、项目进度和待办事项，生成今日站会发言要点：昨日完成、今日计划、当前阻塞。控制在 2 分钟内可读完。",
    cron: "0 9 * * 1-5",
  },
];

// ============================================================================
// 表单初始值
// ============================================================================

const EMPTY_FORM: FormState = {
  threadId: "",
  cronExpression: "0 9 * * 1-5",
  prompt: "",
  enabled: true,
};

// ============================================================================
// 主组件
// ============================================================================

export function SchedulerView() {
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
    onError: (e: unknown) => setFormError(formatError(e)),
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
    onError: (e: unknown) => setFormError(formatError(e)),
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
      setFormError("请输入 Prompt/指令内容");
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
        {/* 头部 */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold text-foreground">定时任务</h1>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground/80">
              在可视化界面中管理、调度和监控定时任务
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

        {/* 主体内容 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
          {/* 统计概览 */}
          {tasks.length > 0 && !formOpen ? (
            <StatsOverview tasks={tasks} />
          ) : null}

          {/* 表单 */}
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

          {/* 加载状态 */}
          {tasksQuery.isLoading ? (
            <div className="mx-auto w-full max-w-4xl py-12 text-center text-[13px] text-muted-foreground/70">
              加载中…
            </div>
          ) : showEmptyState ? (
            <SchedulerEmptyState
              onPickTemplate={(tpl) =>
                openCreateForm({ cronExpression: tpl.cron, prompt: tpl.prompt })
              }
            />
          ) : tasks.length > 0 ? (
            <div className="mx-auto w-full max-w-4xl space-y-3">
              <div className="flex items-baseline justify-between px-1">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  任务列表
                </h3>
                <span className="text-[11px] text-muted-foreground/70">
                  共 {tasks.length} 个任务 · {tasks.filter((t) => t.enabled).length} 个运行中
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border/60">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        状态
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        CRON 表达式
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        下次执行
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        上次执行
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        关联会话
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <SchedulerTaskRow
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
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </SidebarInset>
  );
}

// ============================================================================
// 统计概览
// ============================================================================

function StatsOverview({ tasks }: { tasks: ScheduledJob[] }) {
  const enabled = tasks.filter((t) => t.enabled).length;
  const disabled = tasks.length - enabled;
  const nextRun = tasks
    .filter((t) => t.enabled && t.nextFireAt)
    .sort((a, b) => {
      const aTime = a.nextFireAt ? Date.parse(a.nextFireAt) : Infinity;
      const bTime = b.nextFireAt ? Date.parse(b.nextFireAt) : Infinity;
      return aTime - bTime;
    })[0];

  return (
    <div className="mx-auto mb-6 grid w-full max-w-4xl grid-cols-4 gap-3">
      <StatCard label="总任务数" value={String(tasks.length)} />
      <StatCard label="运行中" value={String(enabled)} accent="green" />
      <StatCard label="已暂停" value={String(disabled)} accent="amber" />
      <StatCard
        label="下次执行"
        value={nextRun ? formatRelativeTime(nextRun.nextFireAt) : "无"}
        sub={nextRun ? describeCron(nextRun.cronExpression) : undefined}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "amber";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3.5">
      <p className="text-[11px] text-muted-foreground/70">{label}</p>
      <p
        className={`mt-1 text-[18px] font-semibold ${
          accent === "green"
            ? "text-emerald-500/90"
            : accent === "amber"
              ? "text-amber-500/90"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[10px] text-muted-foreground/60">{sub}</p> : null}
    </div>
  );
}

// ============================================================================
// 任务表格行
// ============================================================================

function SchedulerTaskRow({
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
  const [showHistory, setShowHistory] = useState(false);
  const history = useExecutionHistory(task.taskId);

  return (
    <>
      <tr className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/20">
        {/* 状态 */}
        <td className="px-4 py-3">
          <span
            className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] font-medium ${
              task.enabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : "border-border/60 bg-background/60 text-muted-foreground/70"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                task.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"
              }`}
            />
            {task.enabled ? "运行中" : "已暂停"}
          </span>
        </td>
        {/* CRON */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="size-3 shrink-0 text-muted-foreground/60" />
            <span className="font-mono text-[12px] text-foreground/90">{task.cronExpression}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground/60">{cronPreview}</p>
        </td>
        {/* 下次执行 */}
        <td className="px-4 py-3">
          <span
            className="text-[12px] text-foreground/85"
            title={task.nextFireAt ?? undefined}
          >
            {formatRelativeTime(task.nextFireAt)}
          </span>
          <p className="text-[10px] text-muted-foreground/55">
            {formatDateTime(task.nextFireAt)}
          </p>
        </td>
        {/* 上次执行 */}
        <td className="px-4 py-3">
          <span className="text-[12px] text-foreground/70">
            {formatRelativeTime(task.lastFiredAt)}
          </span>
          <p className="text-[10px] text-muted-foreground/55">
            {formatDateTime(task.lastFiredAt)}
          </p>
        </td>
        {/* 关联会话 */}
        <td className="px-4 py-3">
          <span className="max-w-[140px] truncate text-[12px] text-foreground/75">
            {threadTitle}
          </span>
        </td>
        {/* 操作 */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-0.5">
            <RowButton label={task.enabled ? "暂停" : "恢复"} onClick={onToggle} disabled={isToggling}>
              {task.enabled ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
            </RowButton>
            <RowButton label="立即执行" onClick={onTrigger} disabled={isTriggering}>
              <RocketIcon className="size-3.5" />
            </RowButton>
            <RowButton label="编辑" onClick={onEdit}>
              <SquarePenIcon className="size-3.5" />
            </RowButton>
                <RowButton label="历史" onClick={() => setShowHistory(!showHistory)}>
                  <ListDetailsIcon className="size-3.5" />
                </RowButton>
            <RowButton label="删除" onClick={onDelete} disabled={isDeleting} danger>
              <Trash2 className="size-3.5" />
            </RowButton>
          </div>
        </td>
      </tr>
      {/* 执行历史展开行 */}
      {showHistory ? (
        <tr className="border-b border-border/40 bg-muted/10 last:border-b-0">
          <td colSpan={6} className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/70">
              <ListDetailsIcon className="size-3" />
              执行历史
            </div>
            {history.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground/55">
                暂无执行记录（后端执行历史接口开发中）
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {history.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center gap-3 rounded-md border border-border/40 bg-background/60 px-3 py-2 text-[11px]"
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        record.status === "success"
                          ? "bg-emerald-500"
                          : record.status === "failed"
                            ? "bg-red-500"
                            : "bg-amber-500 animate-pulse"
                      }`}
                    />
                    <span className="font-mono text-muted-foreground/70">
                      {formatDateTime(record.executedAt)}
                    </span>
                    <span className="text-foreground/80">{record.outputPreview}</span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RowButton({
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
      className={`inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? "hover:text-red-500/90" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ============================================================================
// 创建/编辑表单
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
      className="mx-auto w-full max-w-4xl rounded-xl border border-border/60 bg-background/60 p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-foreground">
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

      <div className="mt-4 space-y-5">
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

        {/* CRON 可视化选择器 */}
        <Field label="CRON 表达式">
          <CronBuilder
            value={formState.cronExpression}
            onChange={(expr) => update("cronExpression", expr)}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground/80">
            预览：<span className="text-foreground/85">{cronPreview}</span>
            <span className="ml-2 text-muted-foreground/60">
              （格式：分 时 日 月 周，支持 * 通配和 /N 步长语法）
            </span>
          </p>
        </Field>

        {/* Prompt / 指令内容 */}
        <Field label="Prompt / 指令内容">
          <textarea
            value={formState.prompt}
            onChange={(e) => update("prompt", e.target.value)}
            placeholder="到达触发时间时发送给会话的 prompt 或指令"
            rows={4}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none transition-colors focus:border-foreground/40"
          />
        </Field>

        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-foreground">启用任务</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              关闭后任务将不会被自动触发，但仍可手动执行
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
// 空状态 + 模板
// ============================================================================

function SchedulerEmptyState({ onPickTemplate }: { onPickTemplate: (tpl: SchedulerTemplate) => void }) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-full border border-border/60 bg-background/60">
          <ClockIcon className="size-7 text-muted-foreground/70" />
        </div>
        <h2 className="text-[20px] font-semibold text-foreground">创建首个定时任务</h2>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground/85">
          定时任务让你可以按计划自动向会话发送
          Prompt，实现日报、周报、数据同步等重复性工作流的自动化。
        </p>
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center gap-2 px-1">
          <SparklesIcon className="size-4 text-muted-foreground/60" />
          <h3 className="text-[13px] font-semibold text-foreground/85">模板快捷创建</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCHEDULER_TEMPLATES.map((template) => (
            <TemplateCard
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

function TemplateCard({ template, onClick }: { template: SchedulerTemplate; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-background/60 p-4 text-left transition-colors hover:border-border hover:bg-muted/30"
    >
      <div className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background/80">
        <SettingsIcon className="size-4 text-foreground/85" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug text-foreground">
          {template.title}
        </p>
        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground/85">
          {template.description}
        </p>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
        <span className="inline-flex items-center gap-1">
          <CalendarIcon className="size-3" />
          <span className="font-mono">{template.cron}</span>
        </span>
        <span className="inline-flex items-center gap-1 group-hover:text-foreground/70">
          <SparklesIcon className="size-3" />
          使用模板
        </span>
      </div>
    </button>
  );
}

// ============================================================================
// 辅助
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
