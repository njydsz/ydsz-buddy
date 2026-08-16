/**
 * @file useFailedTasks 单元测试
 *
 * 覆盖：
 * - 失败任务聚合（10 条上限）
 * - 失败类型分类（network / timeout / permission / rate-limit / unknown）
 * - 重试队列（enqueue / dequeue / 去重）
 * - 统计信息（total / lastFailureAt / byType）
 * - 事件订阅生命周期（enabled/threadId 切换）
 * - 线程 ID 过滤（其他线程事件被忽略）
 * - 错误消息提取
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OrchestrationEvent, ThreadId, TurnId } from "~/contracts";
import {
  useFailedTasks,
  type FailedTask,
  type UseFailedTasksResult,
} from "./useFailedTasks";

// 让 happy-dom 下 React 18 的 act() 正常工作
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================================================
// nativeApi mock
// =============================================================================

type Listener = (event: OrchestrationEvent) => void;

let mockListeners: Listener[] = [];
let mockUnsubscribeCalls = 0;

const mockApi = {
  orchestration: {
    onDomainEvent: vi.fn((listener: Listener) => {
      mockListeners.push(listener);
      return () => {
        mockUnsubscribeCalls += 1;
        mockListeners = mockListeners.filter((l) => l !== listener);
      };
    }),
  },
};

vi.mock("~/nativeApi", () => ({
  readNativeApi: () => mockApi,
}));

function resetMocks() {
  mockListeners = [];
  mockUnsubscribeCalls = 0;
  mockApi.orchestration.onDomainEvent.mockClear();
}

function emitEvent(event: OrchestrationEvent) {
  // 找到当前 threadId 的所有监听器并触发
  for (const l of [...mockListeners]) {
    l(event);
  }
}

function makeFailedEvent(
  threadId: ThreadId,
  turnId: string,
  errorMessage: string,
  userMessage?: string,
): OrchestrationEvent {
  return {
    type: "thread.turn-failed",
    aggregateId: threadId,
    payload: {
      turnId,
      error: errorMessage,
      ...(userMessage ? { userMessage } : {}),
    },
  } as unknown as OrchestrationEvent;
}

function makeOtherEvent(threadId: ThreadId): OrchestrationEvent {
  return {
    type: "thread.message-sent",
    aggregateId: threadId,
    payload: { messageId: "m1" },
  } as unknown as OrchestrationEvent;
}

// =============================================================================
// hook 挂载工具
// =============================================================================

interface HookHandle {
  result: UseFailedTasksResult;
  unmount: () => void;
}

function setupHook(threadId: ThreadId | null, enabled: boolean = true): HookHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let captured: UseFailedTasksResult | null = null;
  const handle: HookHandle = {
    get result() {
      if (!captured) throw new Error("hook not yet rendered");
      return captured;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
  function Probe() {
    captured = useFailedTasks(threadId, enabled);
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  return handle;
}

// =============================================================================
// 1. 基础状态
// =============================================================================

describe("useFailedTasks - 基础状态", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("threadId 为 null 时不订阅事件，failedTasks 为空", () => {
    const handle = setupHook(null);

    expect(handle.result.failedTasks).toEqual([]);
    expect(handle.result.retryQueue).toEqual([]);
    expect(handle.result.stats.total).toBe(0);
    expect(mockApi.orchestration.onDomainEvent).not.toHaveBeenCalled();
    handle.unmount();
  });

  it("enabled=false 时不订阅事件", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId, false);

    expect(mockApi.orchestration.onDomainEvent).not.toHaveBeenCalled();
    expect(handle.result.stats.total).toBe(0);
    handle.unmount();
  });

  it("挂载时立即订阅 onDomainEvent", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    expect(mockApi.orchestration.onDomainEvent).toHaveBeenCalledTimes(1);
    handle.unmount();
  });

  it("卸载时调用 unsubscribe", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);
    const beforeUnmount = mockUnsubscribeCalls;
    handle.unmount();
    expect(mockUnsubscribeCalls).toBeGreaterThan(beforeUnmount);
  });
});

// =============================================================================
// 2. 失败任务聚合
// =============================================================================

describe("useFailedTasks - 失败任务聚合", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("收到失败事件后追加到列表头部", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(
        makeFailedEvent(threadId, "turn-1", "Network error: connection reset"),
      );
    });

    expect(handle.result.failedTasks).toHaveLength(1);
    expect(handle.result.failedTasks[0].turnId).toBe("turn-1");
    expect(handle.result.failedTasks[0].type).toBe("network");
    handle.unmount();
  });

  it("最多保留 10 条失败记录", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      for (let i = 0; i < 15; i++) {
        emitEvent(
          makeFailedEvent(threadId, `turn-${i}`, `error ${i}`),
        );
      }
    });

    expect(handle.result.failedTasks).toHaveLength(10);
    // 最新事件应在头部
    expect(handle.result.failedTasks[0].turnId).toBe("turn-14");
    // 最早的事件应被截断
    expect(
      handle.result.failedTasks.find((t) => t.turnId === "turn-0"),
    ).toBeUndefined();
    handle.unmount();
  });

  it("忽略其他事件类型", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeOtherEvent(threadId));
    });

    expect(handle.result.failedTasks).toHaveLength(0);
    handle.unmount();
  });

  it("忽略其他线程的失败事件", () => {
    const threadId = "thread-1" as ThreadId;
    const otherThread = "thread-2" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(otherThread, "turn-x", "error"));
    });

    expect(handle.result.failedTasks).toHaveLength(0);
    handle.unmount();
  });
});

// =============================================================================
// 3. 失败类型分类
// =============================================================================

describe("useFailedTasks - 失败类型分类", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("network 类型", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "fetch failed"));
      emitEvent(makeFailedEvent(threadId, "t2", "network connection lost"));
      emitEvent(makeFailedEvent(threadId, "t3", "Connection refused"));
    });

    expect(handle.result.failedTasks.every((t) => t.type === "network")).toBe(true);
    expect(handle.result.stats.byType.network).toBe(3);
    handle.unmount();
  });

  it("timeout 类型", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "Request timed out after 30s"));
    });

    expect(handle.result.failedTasks[0].type).toBe("timeout");
    expect(handle.result.stats.byType.timeout).toBe(1);
    handle.unmount();
  });

  it("permission 类型", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "Permission denied"));
      emitEvent(makeFailedEvent(threadId, "t2", "401 unauthorized"));
    });

    expect(handle.result.failedTasks[0].type).toBe("permission");
    expect(handle.result.failedTasks[1].type).toBe("permission");
    expect(handle.result.stats.byType.permission).toBe(2);
    handle.unmount();
  });

  it("rate-limit 类型", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "rate limit exceeded"));
      emitEvent(makeFailedEvent(threadId, "t2", "429 Too Many Requests"));
    });

    expect(handle.result.stats.byType["rate-limit"]).toBe(2);
    handle.unmount();
  });

  it("unknown 类型（无法识别）", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "Something weird happened"));
    });

    expect(handle.result.failedTasks[0].type).toBe("unknown");
    expect(handle.result.stats.byType.unknown).toBe(1);
    handle.unmount();
  });
});

// =============================================================================
// 4. 错误消息提取
// =============================================================================

describe("useFailedTasks - 错误消息提取", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("提取错误消息和 userMessage", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(
        makeFailedEvent(threadId, "t1", "Network error", "Hello world"),
      );
    });

    const task = handle.result.failedTasks[0];
    expect(task.message).toBe("Network error");
    expect(task.userMessage).toBe("Hello world");
    handle.unmount();
  });

  it("缺失 payload.error 时使用 'Unknown error'", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent({
        type: "thread.turn-failed",
        aggregateId: threadId,
        payload: { turnId: "t1" },
      } as unknown as OrchestrationEvent);
    });

    expect(handle.result.failedTasks[0].message).toBe("Unknown error");
    handle.unmount();
  });

  it("timestamp 应为近期时间", () => {
    const threadId = "thread-1" as ThreadId;
    const before = Date.now();
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "error"));
    });

    const after = Date.now();
    const task = handle.result.failedTasks[0];
    expect(task.timestamp).toBeGreaterThanOrEqual(before);
    expect(task.timestamp).toBeLessThanOrEqual(after);
    handle.unmount();
  });
});

// =============================================================================
// 5. 重试队列
// =============================================================================

describe("useFailedTasks - 重试队列", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("enqueueRetry 添加 turnId", () => {
    const handle = setupHook("thread-1" as ThreadId);

    act(() => {
      handle.result.enqueueRetry("turn-1" as TurnId);
    });

    expect(handle.result.retryQueue).toEqual(["turn-1"]);
    handle.unmount();
  });

  it("重复 enqueue 不会重复添加", () => {
    const handle = setupHook("thread-1" as ThreadId);

    act(() => {
      handle.result.enqueueRetry("turn-1" as TurnId);
      handle.result.enqueueRetry("turn-1" as TurnId);
      handle.result.enqueueRetry("turn-1" as TurnId);
    });

    expect(handle.result.retryQueue).toEqual(["turn-1"]);
    handle.unmount();
  });

  it("dequeueRetry 从队列移除指定 turnId", () => {
    const handle = setupHook("thread-1" as ThreadId);

    act(() => {
      handle.result.enqueueRetry("turn-1" as TurnId);
      handle.result.enqueueRetry("turn-2" as TurnId);
      handle.result.enqueueRetry("turn-3" as TurnId);
    });

    act(() => {
      handle.result.dequeueRetry("turn-2" as TurnId);
    });

    expect(handle.result.retryQueue).toEqual(["turn-1", "turn-3"]);
    handle.unmount();
  });

  it("dequeueRetry 不存在的 turnId 不会报错", () => {
    const handle = setupHook("thread-1" as ThreadId);

    act(() => {
      handle.result.enqueueRetry("turn-1" as TurnId);
    });

    act(() => {
      handle.result.dequeueRetry("nonexistent" as TurnId);
    });

    expect(handle.result.retryQueue).toEqual(["turn-1"]);
    handle.unmount();
  });

  it("clearFailedTasks 同时清空失败任务和重试队列", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "error"));
      handle.result.enqueueRetry("t1" as TurnId);
    });

    expect(handle.result.failedTasks).toHaveLength(1);
    expect(handle.result.retryQueue).toHaveLength(1);

    act(() => {
      handle.result.clearFailedTasks();
    });

    expect(handle.result.failedTasks).toEqual([]);
    expect(handle.result.retryQueue).toEqual([]);
    handle.unmount();
  });
});

// =============================================================================
// 6. 统计信息
// =============================================================================

describe("useFailedTasks - 统计信息", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("total 等于 failedTasks 长度", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "error"));
      emitEvent(makeFailedEvent(threadId, "t2", "error"));
      emitEvent(makeFailedEvent(threadId, "t3", "error"));
    });

    expect(handle.result.stats.total).toBe(3);
    handle.unmount();
  });

  it("lastFailureAt 始终指向最新任务", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "error"));
    });
    const firstTimestamp = handle.result.stats.lastFailureAt;

    // 等待 1ms 让时间戳不同
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        act(() => {
          emitEvent(makeFailedEvent(threadId, "t2", "error"));
        });
        expect(handle.result.stats.lastFailureAt).toBeGreaterThan(firstTimestamp!);
        handle.unmount();
        resolve();
      }, 5);
    });
  });

  it("lastFailureAt 在无失败时为 null", () => {
    const handle = setupHook("thread-1" as ThreadId);
    expect(handle.result.stats.lastFailureAt).toBeNull();
    handle.unmount();
  });

  it("byType 各类型计数准确", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "t1", "network error"));
      emitEvent(makeFailedEvent(threadId, "t2", "network reset"));
      emitEvent(makeFailedEvent(threadId, "t3", "timed out"));
      emitEvent(makeFailedEvent(threadId, "t4", "permission denied"));
      emitEvent(makeFailedEvent(threadId, "t5", "rate limit exceeded"));
      emitEvent(makeFailedEvent(threadId, "t6", "some unknown failure"));
    });

    const stats = handle.result.stats;
    expect(stats.byType.network).toBe(2);
    expect(stats.byType.timeout).toBe(1);
    expect(stats.byType.permission).toBe(1);
    expect(stats.byType["rate-limit"]).toBe(1);
    expect(stats.byType.unknown).toBe(1);
    handle.unmount();
  });
});

// =============================================================================
// 7. 集成场景
// =============================================================================

describe("useFailedTasks - 集成场景", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  it("失败 → 入队重试 → 成功 → 清理完整流程", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    // 1. 失败事件
    act(() => {
      emitEvent(
        makeFailedEvent(threadId, "turn-1", "Network error", "请翻译这段"),
      );
    });

    expect(handle.result.failedTasks).toHaveLength(1);
    expect(handle.result.stats.total).toBe(1);

    // 2. 加入重试队列
    act(() => {
      handle.result.enqueueRetry("turn-1" as TurnId);
    });
    expect(handle.result.retryQueue).toEqual(["turn-1"]);

    // 3. 移出重试队列
    act(() => {
      handle.result.dequeueRetry("turn-1" as TurnId);
    });
    expect(handle.result.retryQueue).toEqual([]);

    // 4. 清理所有
    act(() => {
      handle.result.clearFailedTasks();
    });
    expect(handle.result.failedTasks).toEqual([]);
    handle.unmount();
  });

  it("多次失败累积并按时间倒序排列", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => {
      emitEvent(makeFailedEvent(threadId, "first", "error 1"));
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        act(() => {
          emitEvent(makeFailedEvent(threadId, "second", "error 2"));
        });
        act(() => {
          emitEvent(makeFailedEvent(threadId, "third", "error 3"));
        });

        const tasks = handle.result.failedTasks;
        expect(tasks).toHaveLength(3);
        // 最新（third）应在头部
        expect(tasks[0].turnId).toBe("third");
        expect(tasks[1].turnId).toBe("second");
        expect(tasks[2].turnId).toBe("first");
        handle.unmount();
        resolve();
      }, 5);
    });
  });

  it("不同 threadId 的失败事件互相隔离", () => {
    const threadA = "thread-a" as ThreadId;
    const threadB = "thread-b" as ThreadId;
    const handleA = setupHook(threadA);
    const handleB = setupHook(threadB);

    // threadA 收到失败
    act(() => {
      emitEvent(makeFailedEvent(threadA, "a1", "error A"));
    });
    // threadB 收到失败
    act(() => {
      emitEvent(makeFailedEvent(threadB, "b1", "error B"));
    });

    // 各自只看到自己的事件
    expect(handleA.result.failedTasks).toHaveLength(1);
    expect(handleA.result.failedTasks[0].turnId).toBe("a1");
    expect(handleB.result.failedTasks).toHaveLength(1);
    expect(handleB.result.failedTasks[0].turnId).toBe("b1");

    handleA.unmount();
    handleB.unmount();
  });
});
