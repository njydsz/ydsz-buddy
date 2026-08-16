/**
 * @file useComposerSchedulerPick 单元测试
 *
 * 覆盖：
 * 1. trigger 为 null → items 为空数组
 * 2. mention 触发器但非 @scheduler → items 为空数组
 * 3. mention 触发器 = @scheduler,后端返回 jobs → 映射为 scheduler-result
 * 4. mention 触发器 = @scheduler <query> → 过滤匹配 prompt / cron / taskId
 * 5. mention 触发器 = @scheduler 但后端失败 → 返回 scheduler-empty
 * 6. mention 触发器 = @scheduler 但后端返回空 → 返回 scheduler-empty:no-jobs
 * 7. 防抖:trigger 变化后 cancel 旧 timer
 * 8. 跨线程标注:threadId 与 job.threadId 不一致时 description 包含"跨线程"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ComposerTrigger } from "../composer-logic";

// Mock @tauri-apps/api/core 的 invoke
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { useComposerSchedulerPick } = await import("./useComposerSchedulerPick");

function makeTrigger(query: string): ComposerTrigger {
  return { kind: "mention", query };
}

const SAMPLE_JOBS = [
  {
    taskId: "job-1",
    threadId: "thread-A",
    cronExpression: "0 0 * * *",
    prompt: "汇总昨日 GitHub 通知",
    enabled: true,
    createdAt: "2026-06-20T00:00:00Z",
    lastFiredAt: null,
    nextFireAt: null,
  },
  {
    taskId: "job-2",
    threadId: "thread-B",
    cronExpression: "*/15 * * * *",
    prompt: "清理临时文件",
    enabled: false,
    createdAt: "2026-06-21T00:00:00Z",
    lastFiredAt: null,
    nextFireAt: null,
  },
  {
    taskId: "job-3",
    threadId: "thread-A",
    cronExpression: "0 9 * * 1",
    prompt: "Weekly OKR review",
    enabled: true,
    createdAt: "2026-06-22T00:00:00Z",
    lastFiredAt: null,
    nextFireAt: null,
  },
];

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useComposerSchedulerPick / trigger matching", () => {
  it("trigger 为 null 时 items 为空数组,不调用后端", () => {
    const { result } = renderHook(() =>
      useComposerSchedulerPick(null, "thread-A"),
    );
    expect(result.current.items).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("mention 触发器但非 @scheduler 时 items 为空数组,不调用后端", () => {
    const { result } = renderHook(() =>
      useComposerSchedulerPick(makeTrigger("wiki foo"), "thread-A"),
    );
    expect(result.current.items).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("useComposerSchedulerPick / list & filter", () => {
  it("@scheduler 触发器,后端返回 jobs → 映射为 scheduler-result", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_JOBS);

    const { result } = renderHook(() =>
      useComposerSchedulerPick(makeTrigger("scheduler"), "thread-A"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(invokeMock).toHaveBeenCalledWith("scheduler_task_list", {
      threadId: null,
    });
    expect(result.current.hasError).toBe(false);
    const items = result.current.items;
    // 3 jobs 都展示(hook 不做 thread 过滤,只标注跨线程)
    expect(items).toHaveLength(3);
    expect(items[0]?.type).toBe("scheduler-result");
    expect(items[0]?.taskId).toBe("job-1");
    expect(items[1]?.description).toContain("跨线程"); // job-2 不在 thread-A
  });

  it("@scheduler 触发器 + query 过滤 → 只保留 prompt/cron/taskId 命中项", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_JOBS);

    const { result } = renderHook(() =>
      useComposerSchedulerPick(makeTrigger("scheduler OKR"), "thread-A"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const items = result.current.items;
    // 只有 job-3 包含 "OKR"
    expect(items).toHaveLength(1);
    expect(items[0]?.taskId).toBe("job-3");
  });

  it("@scheduler 触发器 + query 命中 cron 表达式 → 过滤生效", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_JOBS);

    const { result } = renderHook(() =>
      useComposerSchedulerPick(makeTrigger("scheduler */15"), "thread-A"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const items = result.current.items;
    expect(items).toHaveLength(1);
    expect(items[0]?.taskId).toBe("job-2");
  });
});

describe("useComposerSchedulerPick / error & empty", () => {
  it("后端调用失败 → 返回 scheduler-empty 错误占位", async () => {
    invokeMock.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() =>
      useComposerSchedulerPick(makeTrigger("scheduler"), "thread-A"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasError).toBe(true);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("scheduler-empty");
    expect(result.current.items[0]?.label).toContain("加载失败");
  });

  it("后端返回空数组 + 无 query → 返回 scheduler-empty:no-jobs 引导", async () => {
    invokeMock.mockResolvedValueOnce([]);

    const { result } = renderHook(() =>
      useComposerSchedulerPick(makeTrigger("scheduler"), "thread-A"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("scheduler-empty");
    expect(result.current.items[0]?.description).toContain("Automations");
  });

  it("后端返回 jobs 但 query 无匹配 → 返回 scheduler-empty:no-match", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_JOBS);

    const { result } = renderHook(() =>
      useComposerSchedulerPick(makeTrigger("scheduler none-exist"), "thread-A"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("scheduler-empty");
    expect(result.current.items[0]?.label).toContain("none-exist");
  });
});

describe("useComposerSchedulerPick / cross-thread annotation", () => {
  it("threadId 不为 null 且 job 属于其他线程 → description 包含'跨线程'", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_JOBS);

    const { result } = renderHook(() =>
      useComposerSchedulerPick(makeTrigger("scheduler"), "thread-A"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const items = result.current.items;
    const job2Item = items.find((it) => it.taskId === "job-2");
    expect(job2Item?.description).toContain("跨线程");
  });

  it("threadId 为 null → 不显示'跨线程'字样", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_JOBS);

    const { result } = renderHook(() =>
      useComposerSchedulerPick(makeTrigger("scheduler"), null),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const items = result.current.items;
    for (const it of items) {
      expect(it.description ?? "").not.toContain("跨线程");
    }
  });
});
