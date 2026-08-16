/**
 * @file useAutoRetryFailedTasks 单元测试
 *
 * 覆盖目标：
 * - 可重试错误（network / timeout / rate-limit）→ 自动入队 + 触发 smartRetry.execute
 * - 不可重试错误（client-error / permission）→ 跳过 + lastRetryReason 提示
 * - userMessage 缺失 → 跳过
 * - 同一 turn 重复事件 → 跳过（防重入）
 * - 跨线程事件 → 忽略
 * - 重试用尽 → 触发 failover.recordFailure
 * - 成功重试 → recordSuccess
 * - 重试用尽但关闭 failoverOnExhaust → 不触发 recordFailure
 * - 用户手动 dequeue → 触发 smartRetry.cancel
 * - reset → 清空所有内部状态
 *
 * 注意：smartRetry.execute 内部用了 setTimeout/指数退避，
 * 需要 fake timers 控制时间。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { OrchestrationEvent, ThreadId, TurnId } from "~/contracts";
import type { UseFailedTaskRetryProgressResult } from "./useFailedTaskRetryProgress";
import type { UseSmartRetryResult } from "./useSmartRetry";
import type { UseProviderFailoverResult } from "./useProviderFailover";
import type { FailedTask } from "./useFailedTasks";

// =============================================================================
// nativeApi mock
// =============================================================================

type Listener = (event: OrchestrationEvent) => void;
let listeners: Listener[] = [];
const onDomainEvent = vi.fn((cb: Listener) => {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
});

vi.mock("~/nativeApi", () => ({
  readNativeApi: () => ({
    orchestration: { onDomainEvent },
  }),
}));

const captureErrorMock = vi.fn();
const captureMessageMock = vi.fn();
vi.mock("~/lib/monitor", () => ({
  monitor: {
    captureError: (p: Parameters<typeof captureErrorMock>[0]) => captureErrorMock(p),
    captureMessage: (msg: string, ctx?: Record<string, unknown>) =>
      captureMessageMock(msg, ctx),
  },
}));

// =============================================================================
// 测试工具
// =============================================================================

const THREAD = "thread-1" as ThreadId;
const OTHER_THREAD = "thread-2" as ThreadId;
const TURN_A = "turn-a" as TurnId;
const TURN_B = "turn-b" as TurnId;

function emit(event: OrchestrationEvent) {
  for (const l of [...listeners]) l(event);
}

function makeFailedEvent(
  threadId: ThreadId,
  turnId: TurnId,
  payload: Record<string, unknown>,
): OrchestrationEvent {
  return {
    type: "thread.turn-failed",
    aggregateId: threadId,
    payload: { turnId, ...payload },
  } as unknown as OrchestrationEvent;
}

function makeFailedTask(
  turnId: TurnId,
  type: FailedTask["type"] = "network",
  userMessage: string | undefined = "user input",
  threadId: ThreadId = THREAD,
): FailedTask {
  return {
    threadId,
    turnId,
    type,
    message: "boom",
    timestamp: Date.now(),
    userMessage,
  };
}

// smartRetry / retryProgress / failover 状态可由测试驱动
interface MockState {
  smartRetry: UseSmartRetryResult;
  retryProgress: UseFailedTaskRetryProgressResult;
  failover: UseProviderFailoverResult;
  resendCalls: Array<{ turnId: TurnId; userMessage: string }>;
  onResend: (turnId: TurnId, userMessage: string) => Promise<void>;
  enqueueCalls: TurnId[];
  failedTasksSnapshot: FailedTask[];
  // 控制 smartRetry 行为
  resendBehavior: "ok" | "fail" | "fail-forever" | "ok-then-fail";
  resendCallCount: number;
}

function setupState(): MockState {
  const resendCalls: Array<{ turnId: TurnId; userMessage: string }> = [];
  let resendCallCount = 0;

  const smartRetry: UseSmartRetryResult = {
    status: "idle",
    currentAttempt: 0,
    maxRetries: 5,
    remainingDelayMs: 0,
    history: [],
    currentTimeoutMs: 30_000,
    execute: vi.fn(async <T,>(fn: () => Promise<T>): Promise<T> => {
      resendCallCount += 1;
      const mock = mockState!;
      if (mock.resendBehavior === "ok") {
        return await fn();
      }
      if (mock.resendBehavior === "fail") {
        const err = new Error("network down");
        (err as { statusCode?: number }).statusCode = 503;
        throw err;
      }
      if (mock.resendBehavior === "fail-forever") {
        const err = new Error("persistent network failure");
        (err as { statusCode?: number }).statusCode = 503;
        throw err;
      }
      if (mock.resendBehavior === "ok-then-fail") {
        if (resendCallCount === 1) return await fn();
        const err = new Error("transient");
        (err as { statusCode?: number }).statusCode = 503;
        throw err;
      }
      throw new Error("unreachable");
    }),
    cancel: vi.fn(),
    reset: vi.fn(),
  };

  const retryProgress: UseFailedTaskRetryProgressResult = {
    progressMap: {},
    retryAttemptsMap: {},
    retryingTurnIds: [],
    exhaustedTurnIds: [],
    recordStart: vi.fn(),
    recordAttempt: vi.fn(),
    recordSuccess: vi.fn(),
    recordExhausted: vi.fn(),
    clearTurn: vi.fn(),
    clearAll: vi.fn(),
    getProgress: vi.fn(() => undefined),
  };

  const failover: UseProviderFailoverResult = {
    status: "monitoring",
    activeProvider: "codex",
    failureCounts: {} as never,
    history: [],
    autoFailoverEnabled: true,
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    switchProvider: vi.fn(() => true),
    setAutoFailover: vi.fn(),
    resetFailureCounts: vi.fn(),
    getRecommendedFallback: vi.fn(() => null),
  };

  const enqueueCalls: TurnId[] = [];
  const failedTasksSnapshot: FailedTask[] = [];

  const onResend = async (turnId: TurnId, userMessage: string) => {
    resendCalls.push({ turnId, userMessage });
  };

  return {
    smartRetry,
    retryProgress,
    failover,
    resendCalls,
    onResend,
    enqueueCalls,
    failedTasksSnapshot,
    resendBehavior: "ok",
    resendCallCount: 0,
  };
}

let mockState: MockState | null = null;
const useAutoRetryFailedTasksModule = () =>
  import("./useAutoRetryFailedTasks").then((m) => {
    mockState!.resendCallCount = 0;
    return m.useAutoRetryFailedTasks;
  });

// =============================================================================
// 测试
// =============================================================================

beforeEach(() => {
  listeners = [];
  onDomainEvent.mockClear();
  captureErrorMock.mockReset();
  captureMessageMock.mockReset();
  mockState = setupState();
});

afterEach(() => {
  mockState = null;
});

describe("useAutoRetryFailedTasks - 基础监听", () => {
  it("挂载时订阅 thread.turn-failed", async () => {
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );
    expect(onDomainEvent).toHaveBeenCalled();
  });

  it("threadId=null 时不订阅", async () => {
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: null,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );
    // event emit 不会触发任何动作
    emit(
      makeFailedEvent(THREAD, TURN_A, {
        error: "boom",
        userMessage: "msg",
        errorClass: "network",
      }),
    );
    expect(mockState!.smartRetry.execute).not.toHaveBeenCalled();
  });

  it("policy.enabled=false 时不订阅 / 不响应", async () => {
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
        policy: { enabled: false },
      }),
    );
    emit(
      makeFailedEvent(THREAD, TURN_A, {
        error: "boom",
        userMessage: "msg",
        errorClass: "network",
      }),
    );
    expect(mockState!.smartRetry.execute).not.toHaveBeenCalled();
  });

  it("跨线程事件被忽略", async () => {
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );
    emit(
      makeFailedEvent(OTHER_THREAD, TURN_A, {
        error: "boom",
        userMessage: "msg",
        errorClass: "network",
      }),
    );
    expect(mockState!.smartRetry.execute).not.toHaveBeenCalled();
  });
});

describe("useAutoRetryFailedTasks - 入队条件", () => {
  it("network 错误 + userMessage 存在 → 自动入队 + execute", async () => {
    mockState!.resendBehavior = "ok";
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    const enqueueRetry = vi.fn();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry,
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "ECONNREFUSED",
          userMessage: "hi",
          errorClass: "network",
        }),
      );
    });

    await waitFor(() => {
      expect(enqueueRetry).toHaveBeenCalledWith(TURN_A);
    });
    expect(mockState!.retryProgress.recordStart).toHaveBeenCalledWith(TURN_A, 5);
  });

  it("rate-limit / timeout 错误也自动入队", async () => {
    mockState!.resendBehavior = "ok";
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    const enqueueRetry = vi.fn();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry,
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "timeout",
          userMessage: "hi",
          errorClass: "timeout",
        }),
      );
    });
    await waitFor(() => {
      expect(enqueueRetry).toHaveBeenCalledWith(TURN_A);
    });

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_B, {
          error: "rate limit 429",
          userMessage: "hi",
          errorClass: "rate-limit",
        }),
      );
    });
    await waitFor(() => {
      expect(enqueueRetry).toHaveBeenCalledWith(TURN_B);
    });
  });

  it("permission 错误不入队", async () => {
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    const enqueueRetry = vi.fn();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry,
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "unauthorized",
          userMessage: "hi",
          errorClass: "permission",
        }),
      );
    });
    expect(enqueueRetry).not.toHaveBeenCalled();
    expect(mockState!.smartRetry.execute).not.toHaveBeenCalled();
  });

  it("unknown 错误不入队", async () => {
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    const enqueueRetry = vi.fn();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry,
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "something weird",
          userMessage: "hi",
          errorClass: "unknown",
        }),
      );
    });
    expect(enqueueRetry).not.toHaveBeenCalled();
  });

  it("userMessage 缺失不入队", async () => {
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    const enqueueRetry = vi.fn();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry,
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "boom",
          // userMessage 缺失
          errorClass: "network",
        }),
      );
    });
    expect(enqueueRetry).not.toHaveBeenCalled();
  });

  it("同一 turn 重复事件 → 只入队一次", async () => {
    mockState!.resendBehavior = "ok";
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    const enqueueRetry = vi.fn();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry,
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "boom",
          userMessage: "hi",
          errorClass: "network",
        }),
      );
    });
    await waitFor(() => {
      expect(enqueueRetry).toHaveBeenCalledTimes(1);
    });

    // 立即再发一次相同事件（防重入）
    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "boom again",
          userMessage: "hi",
          errorClass: "network",
        }),
      );
    });
    // 等待一会确认未被二次入队
    await new Promise((r) => setTimeout(r, 20));
    expect(enqueueRetry).toHaveBeenCalledTimes(1);
  });
});

describe("useAutoRetryFailedTasks - 执行结果", () => {
  it("onResend 成功 → recordSuccess", async () => {
    mockState!.resendBehavior = "ok";
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "boom",
          userMessage: "hi",
          errorClass: "network",
        }),
      );
    });
    await waitFor(() => {
      expect(mockState!.retryProgress.recordSuccess).toHaveBeenCalledWith(TURN_A);
    });
  });

  it("execute 失败 → recordExhausted + failover.recordFailure", async () => {
    mockState!.resendBehavior = "fail";
    // simulate smartRetry 进入 exhausted 状态
    (mockState!.smartRetry.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        // 模拟 useSmartRetry.execute 抛出后 status = exhausted
        Object.assign(mockState!.smartRetry, { status: "exhausted" });
        throw new Error("network down");
      },
    );

    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "boom",
          userMessage: "hi",
          errorClass: "network",
        }),
      );
    });
    await waitFor(() => {
      expect(mockState!.retryProgress.recordExhausted).toHaveBeenCalledWith(TURN_A);
    });
    expect(mockState!.failover.recordFailure).toHaveBeenCalledWith(
      "codex",
      expect.any(Error),
    );
    expect(captureMessageMock).toHaveBeenCalledWith(
      "auto_retry_exhausted_triggered_failover",
      expect.objectContaining({ turnId: "turn-a", provider: "codex" }),
    );
  });

  it("execute 失败但 failoverOnExhaust=false → 不触发 recordFailure", async () => {
    mockState!.resendBehavior = "fail";
    (mockState!.smartRetry.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        Object.assign(mockState!.smartRetry, { status: "exhausted" });
        throw new Error("boom");
      },
    );

    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
        policy: { failoverOnExhaust: false },
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "boom",
          userMessage: "hi",
          errorClass: "network",
        }),
      );
    });
    await waitFor(() => {
      expect(mockState!.retryProgress.recordExhausted).toHaveBeenCalledWith(TURN_A);
    });
    expect(mockState!.failover.recordFailure).not.toHaveBeenCalled();
  });

  it("execute 失败但 failover=null → 不抛错", async () => {
    mockState!.resendBehavior = "fail";
    (mockState!.smartRetry.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        Object.assign(mockState!.smartRetry, { status: "exhausted" });
        throw new Error("boom");
      },
    );

    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    expect(() =>
      renderHook(() =>
        useAutoRetryFailedTasks({
          threadId: THREAD,
          failedTasksState: {
            failedTasks: [],
            enqueueRetry: vi.fn(),
            dequeueRetry: vi.fn(),
          },
          smartRetry: mockState!.smartRetry,
          retryProgress: mockState!.retryProgress,
          failover: null,
          activeProvider: "codex",
          onResendTurn: mockState!.onResend,
        }),
      ),
    ).not.toThrow();
  });

  it("failover.recordFailure 自身抛错 → monitor 报警", async () => {
    mockState!.resendBehavior = "fail";
    (mockState!.smartRetry.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        Object.assign(mockState!.smartRetry, { status: "exhausted" });
        throw new Error("boom");
      },
    );
    (mockState!.failover.recordFailure as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("failover engine crash");
      },
    );

    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "boom",
          userMessage: "hi",
          errorClass: "network",
        }),
      );
    });
    await waitFor(() => {
      expect(captureErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "auto_retry.failover",
          level: "warning",
        }),
      );
    });
  });
});

describe("useAutoRetryFailedTasks - 用户取消", () => {
  it("用户 dequeue 后 smartRetry.cancel 被调用", async () => {
    // 让 execute 挂起模拟真实退避（不会自行 resolve）
    (mockState!.smartRetry.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async <T,>(_fn: () => Promise<T>) => {
        Object.assign(mockState!.smartRetry, { status: "retrying" });
        return await new Promise<T>((_resolve, reject) => {
          // 监听 cancel：cancel() → reject AbortError
          (mockState!.smartRetry.cancel as ReturnType<typeof vi.fn>).mockImplementation(
            () => reject(new DOMException("Cancelled", "AbortError")),
          );
        });
      },
    );

    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    const failedTasksState = {
      failedTasks: [makeFailedTask(TURN_A)] as ReadonlyArray<FailedTask>,
      enqueueRetry: vi.fn(),
      dequeueRetry: vi.fn(),
    };

    // 单一 renderHook + rerender 共享 useRef（autoRetriedTurnIdsRef / runningTurnIdRef）
    const { rerender } = renderHook(
      ({ tasks }: { tasks: ReadonlyArray<FailedTask> }) =>
        useAutoRetryFailedTasks({
          threadId: THREAD,
          failedTasksState: { ...failedTasksState, failedTasks: tasks },
          smartRetry: mockState!.smartRetry,
          retryProgress: mockState!.retryProgress,
          failover: mockState!.failover,
          activeProvider: "codex",
          onResendTurn: mockState!.onResend,
        }),
      { initialProps: { tasks: failedTasksState.failedTasks } },
    );

    // 触发自动重试：smartRetry.status="retrying", runningTurnIdRef=TURN_A
    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "boom",
          userMessage: "hi",
          errorClass: "network",
        }),
      );
    });
    await waitFor(() => {
      expect(mockState!.smartRetry.execute).toHaveBeenCalled();
    });

    // 模拟用户取消：failedTasks 列表里 turn-a 消失了（dequeue）
    rerender({ tasks: [] });
    // 触发 useEffect：smartRetry.cancel 应被调用
    await waitFor(() => {
      expect(mockState!.smartRetry.cancel).toHaveBeenCalled();
    });
  });
});

describe("useAutoRetryFailedTasks - reset", () => {
  it("reset 清空 autoRetriedTurnIds + smartRetry.reset + retryProgress.clearAll", async () => {
    mockState!.resendBehavior = "ok";
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    const { result } = renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "boom",
          userMessage: "hi",
          errorClass: "network",
        }),
      );
    });
    await waitFor(() => {
      expect(mockState!.retryProgress.recordStart).toHaveBeenCalled();
    });

    act(() => {
      result.current.reset();
    });
    expect(mockState!.smartRetry.reset).toHaveBeenCalled();
    expect(mockState!.retryProgress.clearAll).toHaveBeenCalled();
    expect(result.current.lastRetryReason).toBeNull();
  });
});

describe("useAutoRetryFailedTasks - lastRetryReason", () => {
  it("permission 错误设置 lastRetryReason", async () => {
    const useAutoRetryFailedTasks = await useAutoRetryFailedTasksModule();
    const { result } = renderHook(() =>
      useAutoRetryFailedTasks({
        threadId: THREAD,
        failedTasksState: {
          failedTasks: [],
          enqueueRetry: vi.fn(),
          dequeueRetry: vi.fn(),
        },
        smartRetry: mockState!.smartRetry,
        retryProgress: mockState!.retryProgress,
        failover: mockState!.failover,
        activeProvider: "codex",
        onResendTurn: mockState!.onResend,
      }),
    );

    act(() => {
      emit(
        makeFailedEvent(THREAD, TURN_A, {
          error: "unauthorized",
          userMessage: "hi",
          errorClass: "permission",
        }),
      );
    });
    await waitFor(() => {
      expect(result.current.lastRetryReason).toContain("permission");
    });
  });
});
