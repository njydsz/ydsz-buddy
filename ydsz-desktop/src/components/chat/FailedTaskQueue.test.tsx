/**
 * @file FailedTaskQueue 组件单元测试
 *
 * 覆盖目标：
 * - 空数据时组件返回 null
 * - 失败任务列表渲染
 * - "已自动尝试 X/Y" 提示（重试中状态）
 * - "已试 X/Y 次，需手动接管" 提示（用尽状态）
 * - 重试按钮：点击切换入队/出队
 * - 重试按钮：用尽次数后禁用
 * - 类型徽章展示
 * - 清空按钮
 * - 紧凑模式
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TurnId, ThreadId } from "@ydsz-buddy/contracts";
import { FailedTaskQueue } from "./FailedTaskQueue";
import type { FailedTask, FailureStats } from "~/hooks/useFailedTasks";

const THREAD_ID = ThreadId.makeUnsafe("thread-1");

function makeFailedTask(overrides: Partial<FailedTask> = {}): FailedTask {
  return {
    threadId: THREAD_ID,
    turnId: TurnId.makeUnsafe("turn-1"),
    type: "network",
    message: "Network connection failed",
    timestamp: Date.now(),
    userMessage: "hello",
    ...overrides,
  };
}

function makeStats(overrides: Partial<FailureStats> = {}): FailureStats {
  return {
    total: 1,
    lastFailureAt: Date.now(),
    byType: { network: 1, timeout: 0, permission: 0, "rate-limit": 0, unknown: 0 },
    ...overrides,
  };
}

describe("FailedTaskQueue", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("空数据时组件返回 null", () => {
    const { container } = render(
      <FailedTaskQueue
        failedTasks={[]}
        stats={makeStats({ total: 0, byType: { network: 0, timeout: 0, permission: 0, "rate-limit": 0, unknown: 0 } })}
        retryQueue={[]}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("渲染失败任务列表", () => {
    render(
      <FailedTaskQueue
        failedTasks={[
          makeFailedTask({ turnId: TurnId.makeUnsafe("turn-1"), message: "网络错误" }),
          makeFailedTask({ turnId: TurnId.makeUnsafe("turn-2"), type: "timeout", message: "请求超时" }),
        ]}
        stats={makeStats({
          total: 2,
          byType: { network: 1, timeout: 1, permission: 0, "rate-limit": 0, unknown: 0 },
        })}
        retryQueue={[]}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("失败任务")).toBeDefined();
    expect(screen.getByText("网络")).toBeDefined();
    expect(screen.getByText("超时")).toBeDefined();
    // 消息以 truncate 形式展示，使用 getAllByText 匹配
    const messages = screen.getAllByText(/网络错误|请求超时/);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("重试中显示 '已自动尝试 X/Y' 提示", () => {
    const turnId = TurnId.makeUnsafe("turn-1");
    render(
      <FailedTaskQueue
        failedTasks={[makeFailedTask({ turnId })]}
        stats={makeStats()}
        retryQueue={[turnId]}
        retryAttemptsMap={{ [turnId]: { attempt: 2, maxRetries: 5 } }}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("已自动尝试 2/5")).toBeDefined();
  });

  it("用尽次数后显示 '已试 X/Y 次，需手动接管' 提示", () => {
    const turnId = TurnId.makeUnsafe("turn-1");
    render(
      <FailedTaskQueue
        failedTasks={[makeFailedTask({ turnId })]}
        stats={makeStats()}
        retryQueue={[]}
        retryAttemptsMap={{ [turnId]: { attempt: 5, maxRetries: 5 } }}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("已试 5/5 次，需手动接管")).toBeDefined();
  });

  it("点击未入队的任务的重试按钮触发 onEnqueueRetry", () => {
    const turnId = TurnId.makeUnsafe("turn-1");
    const onEnqueueRetry = vi.fn();
    render(
      <FailedTaskQueue
        failedTasks={[makeFailedTask({ turnId })]}
        stats={makeStats()}
        retryQueue={[]}
        onEnqueueRetry={onEnqueueRetry}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const retryButton = screen.getByLabelText("重试");
    fireEvent.click(retryButton);
    expect(onEnqueueRetry).toHaveBeenCalledWith(turnId);
  });

  it("点击已入队的任务的重试按钮触发 onDequeueRetry", () => {
    const turnId = TurnId.makeUnsafe("turn-1");
    const onDequeueRetry = vi.fn();
    render(
      <FailedTaskQueue
        failedTasks={[makeFailedTask({ turnId })]}
        stats={makeStats()}
        retryQueue={[turnId]}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={onDequeueRetry}
        onClear={vi.fn()}
      />,
    );
    const retryButton = screen.getByLabelText("重试");
    fireEvent.click(retryButton);
    expect(onDequeueRetry).toHaveBeenCalledWith(turnId);
  });

  it("用尽次数后重试按钮被禁用", () => {
    const turnId = TurnId.makeUnsafe("turn-1");
    const onEnqueueRetry = vi.fn();
    render(
      <FailedTaskQueue
        failedTasks={[makeFailedTask({ turnId })]}
        stats={makeStats()}
        retryQueue={[turnId]}
        retryAttemptsMap={{ [turnId]: { attempt: 5, maxRetries: 5 } }}
        onEnqueueRetry={onEnqueueRetry}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const retryButton = screen.getByLabelText("重试");
    expect((retryButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("点击清空按钮触发 onClear", () => {
    const onClear = vi.fn();
    render(
      <FailedTaskQueue
        failedTasks={[makeFailedTask()]}
        stats={makeStats()}
        retryQueue={[]}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={vi.fn()}
        onClear={onClear}
      />,
    );
    const clearButton = screen.getByLabelText("清空失败记录");
    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalled();
  });

  it("紧凑模式下不展示消息文本", () => {
    render(
      <FailedTaskQueue
        failedTasks={[makeFailedTask({ message: "网络错误" })]}
        stats={makeStats()}
        retryQueue={[]}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
        compact
      />,
    );
    expect(screen.queryByText("网络错误")).toBeNull();
  });

  it("紧凑模式下不展示类型统计徽章", () => {
    render(
      <FailedTaskQueue
        failedTasks={[
          makeFailedTask({ type: "network" }),
          makeFailedTask({ type: "timeout" }),
        ]}
        stats={makeStats({ total: 2, byType: { network: 1, timeout: 1, permission: 0, "rate-limit": 0, unknown: 0 } })}
        retryQueue={[]}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
        compact
      />,
    );
    // 紧凑模式下不展示 "网络 1" / "超时 1" 类型的统计徽章
    expect(screen.queryByText("网络 1")).toBeNull();
    expect(screen.queryByText("超时 1")).toBeNull();
  });

  it("展示总失败数徽章", () => {
    render(
      <FailedTaskQueue
        failedTasks={[
          makeFailedTask(),
          makeFailedTask({ turnId: TurnId.makeUnsafe("turn-2") }),
        ]}
        stats={makeStats({ total: 2, byType: { network: 2, timeout: 0, permission: 0, "rate-limit": 0, unknown: 0 } })}
        retryQueue={[]}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("2")).toBeDefined();
  });

  it("retrQueue 中有任务时显示 '重试中 N' 徽章", () => {
    const t1 = TurnId.makeUnsafe("turn-1");
    const t2 = TurnId.makeUnsafe("turn-2");
    render(
      <FailedTaskQueue
        failedTasks={[
          makeFailedTask({ turnId: t1 }),
          makeFailedTask({ turnId: t2 }),
        ]}
        stats={makeStats({ total: 2, byType: { network: 2, timeout: 0, permission: 0, "rate-limit": 0, unknown: 0 } })}
        retryQueue={[t1, t2]}
        retryAttemptsMap={{
          [t1]: { attempt: 1, maxRetries: 5 },
          [t2]: { attempt: 0, maxRetries: 5 },
        }}
        onEnqueueRetry={vi.fn()}
        onDequeueRetry={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    // 只有 attempt > 0 的才算重试中
    expect(screen.getByText("重试中 1")).toBeDefined();
  });
});
