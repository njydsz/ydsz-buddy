/**
 * @file Composer 定时任务 Pick Hook
 *
 * 当 Composer 中识别到 `@scheduler` / `@scheduler <query>` 触发器时,
 * 调用后端 `scheduler_task_list` 拉取当前线程的定时任务列表,并将结果
 * 映射为 `ComposerCommandItem` 列表。
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: 仅在 `composerTrigger.kind === "mention"` 且
 *    query 匹配 `scheduler` 前缀时启用。
 * 2. **列表拉取**: 调用后端 `scheduler_task_list({ threadId: null })`
 *    拉取全部任务,在 hook 内部按 threadId / cron / prompt 关键词过滤。
 * 3. **状态降级**: 后端调用失败时,返回 `scheduler-empty` 提示条目。
 * 4. **选中行为**: 由 ChatView 接收 `scheduler-result` 后插入
 *    `@scheduler "<taskId>"` 形式的内联 token 到 Composer。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 触发器下拉取任务列表
 * - 用户在 Work 模式下用定时任务做"周期性跑任务"工作流
 *
 * ## 注意事项
 *
 * - 后端 `SchedulerJobsState` 是 in-memory 快照,服务重启后清空(事件
 *   流 replay 暂未还原;后续 P1-2 Repo Wiki 阶段可统一把 scheduler
 *   state 持久化到 SQLite)。
 * - `threadId` 过滤在 hook 内部做,避免每次查询都走后端。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import type { ComposerTrigger } from "../composer-logic";
import type { ScheduledJob } from "../contracts/scheduledJob";

/** 触发字符串(不含 `@` 前缀) */
const SCHEDULER_TRIGGER = "scheduler";

/** 调用后端的最小防抖延迟(毫秒) */
const SCHEDULER_DEBOUNCE_MS = 200;

/** 菜单中展示的最大任务数 */
const SCHEDULER_RESULT_LIMIT = 20;

export interface UseComposerSchedulerPickResult {
  /** 给 Composer 菜单使用的条目列表(可能包含 hint/empty) */
  items: ComposerCommandItem[];
  /** 是否正在等待防抖或后端响应 */
  isLoading: boolean;
  /** 后端调用是否失败 */
  hasError: boolean;
  /** 当前触发的查询字符串(已 trim,不含 `scheduler` 前缀) */
  query: string;
}

/**
 * 判断 mention 触发器是否匹配 @scheduler 模式
 *
 * 支持以下三种状态:
 * - `@scheduler` (query === "scheduler")
 * - `@scheduler<query>` (query 以 "scheduler" 开头,后面有内容)
 */
function extractSchedulerQuery(trigger: ComposerTrigger | null): {
  matches: boolean;
  query: string;
} {
  if (!trigger || trigger.kind !== "mention") {
    return { matches: false, query: "" };
  }
  const raw = trigger.query.trim();
  if (raw === SCHEDULER_TRIGGER) {
    return { matches: true, query: "" };
  }
  if (raw.startsWith(SCHEDULER_TRIGGER) && raw.length > SCHEDULER_TRIGGER.length) {
    const remainder = raw.slice(SCHEDULER_TRIGGER.length);
    if (
      remainder.startsWith(" ") ||
      remainder.startsWith("-") ||
      remainder.startsWith("_")
    ) {
      return { matches: true, query: remainder.slice(1).trim() };
    }
  }
  return { matches: false, query: "" };
}

/**
 * 把单条任务映射为 Composer 菜单项
 */
function mapJobToItem(job: ScheduledJob, threadId: string | null): ComposerCommandItem {
  const statusTag = job.enabled ? "启用" : "停用";
  const promptPreview =
    job.prompt.length > 60 ? `${job.prompt.slice(0, 60)}…` : job.prompt;
  return {
    id: `scheduler-result:${job.taskId}`,
    type: "scheduler-result",
    taskId: job.taskId,
    cron: job.cronExpression,
    enabled: job.enabled,
    prompt: job.prompt,
    label: `${statusTag} · ${job.cronExpression}`,
    description:
      threadId && job.threadId !== threadId
        ? `跨线程 · ${promptPreview}`
        : promptPreview,
  };
}

/**
 * 按 query 关键词过滤任务列表(在 prompt / cron / taskId 上做不区分大小写子串匹配)
 */
function filterJobsByQuery(jobs: readonly ScheduledJob[], query: string): ScheduledJob[] {
  if (!query) return [...jobs];
  const lowered = query.toLowerCase();
  return jobs.filter(
    (job) =>
      job.prompt.toLowerCase().includes(lowered) ||
      job.cronExpression.toLowerCase().includes(lowered) ||
      job.taskId.toLowerCase().includes(lowered),
  );
}

/**
 * Composer 定时任务 Pick hook
 *
 * @param trigger - 当前 Composer 触发器
 * @param threadId - 当前线程 ID(可选)。为 null 时显示全部任务并标注"跨线程"
 * @returns 菜单项 + 加载/错误状态 + 查询字符串
 */
export function useComposerSchedulerPick(
  trigger: ComposerTrigger | null,
  threadId: string | null,
): UseComposerSchedulerPickResult {
  const { matches, query } = extractSchedulerQuery(trigger);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!matches) {
      setJobs([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    const timer = setTimeout(() => {
      invoke<ScheduledJob[]>("scheduler_task_list", { threadId: null })
        .then((result) => {
          if (cancelled || !mountedRef.current) return;
          setJobs(result);
          setIsLoading(false);
        })
        .catch((error) => {
          if (cancelled || !mountedRef.current) return;
          console.error("[composer-scheduler] list failed:", error);
          setHasError(true);
          setJobs([]);
          setIsLoading(false);
        });
    }, SCHEDULER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matches]);

  const items = useMemo<ComposerCommandItem[]>(() => {
    if (!matches) return [];

    if (hasError) {
      return [
        {
          id: "scheduler-empty:error",
          type: "scheduler-empty",
          label: "定时任务加载失败",
          description: "请检查 Scheduler 服务状态,或稍后重试",
        } satisfies ComposerCommandItem,
      ];
    }

    const filtered = filterJobsByQuery(jobs, query).slice(0, SCHEDULER_RESULT_LIMIT);
    if (filtered.length === 0) {
      return [
        {
          id: query ? "scheduler-empty:no-match" : "scheduler-empty:no-jobs",
          type: "scheduler-empty",
          label: query
            ? `未找到匹配「${query}」的定时任务`
            : "当前还没有定时任务",
          description: query
            ? "尝试更换关键词,或在 Automations 面板中创建"
            : "前往 Automations 面板创建 CRON 任务",
        } satisfies ComposerCommandItem,
      ];
    }

    return filtered.map((job) => mapJobToItem(job, threadId));
  }, [matches, hasError, jobs, query, threadId]);

  return { items, isLoading, hasError, query };
}
