/**
 * @file useMessageRetract 单元测试
 *
 * 覆盖：
 * - 初始状态：canRetract=false, remainingSeconds=0
 * - 记录发送消息：canRetract=true, 倒计时启动
 * - 倒计时递减：remainingSeconds 随时间减少
 * - 倒计时归零：canRetract=false, timer 清理
 * - retract：调用 invoke("turn_cancel") + deleteMessage
 * - retract 失败：抛出错误
 * - cancelRetract：清空状态和 timer
 * - turn.tool-call-started 事件：自动取消撤回能力
 * - turn.response-started 事件：自动取消撤回能力
 * - 其他 thread 的事件被忽略
 * - 卸载时清理 timer
 * - retractWindowMs 自定义时长
 * - threadId=null 时不工作
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { OrchestrationEvent, ThreadId, TurnId } from "~/contracts";

// Tauri invoke mock
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// nativeApi mock
type Listener = (event: OrchestrationEvent) => void;
let domainListeners: Listener[] = [];

const mockDeleteMessage = vi.fn(async () => undefined);
const mockApi = {
  threads: {
    deleteMessage: mockDeleteMessage,
  },
  orchestration: {
    onDomainEvent: (cb: Listener) => {
      domainListeners.push(cb);
      return () => {
        domainListeners = domainListeners.filter((l) => l !== cb);
      };
    },
  },
};

vi.mock("~/nativeApi", () => ({
  readNativeApi: () => mockApi,
}));

import { useMessageRetract, type UseMessageRetractResult } from "./useMessageRetract";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetMocks() {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  mockDeleteMessage.mockReset();
  mockDeleteMessage.mockResolvedValue(undefined);
  domainListeners = [];
}

function emitDomainEvent(event: OrchestrationEvent) {
  for (const l of [...domainListeners]) l(event);
}

// =============================================================================
// 1. 初始状态
// =============================================================================

describe("useMessageRetract - 初始状态", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("canRetract=false, remainingSeconds=0, retractedContent=null", () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    expect(result.current.canRetract).toBe(false);
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.retractedContent).toBeNull();
  });
});

// =============================================================================
// 2. 记录发送消息
// =============================================================================

describe("useMessageRetract - 记录发送消息", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("recordSentMessage 后 canRetract=true", () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    act(() => {
      result.current.recordSentMessage("turn-1" as TurnId, "Hello");
    });
    expect(result.current.canRetract).toBe(true);
  });

  it("默认 remainingSeconds=10（10s 撤回窗口）", () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    act(() => {
      result.current.recordSentMessage("turn-1" as TurnId, "Hello");
    });
    expect(result.current.remainingSeconds).toBe(10);
  });

  it("自定义 retractWindowMs 影响 remainingSeconds", () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId, retractWindowMs: 5_000 }),
    );
    act(() => {
      result.current.recordSentMessage("turn-1" as TurnId, "Hello");
    });
    expect(result.current.remainingSeconds).toBe(5);
  });

  it("多次 recordSentMessage 重置倒计时（最后一次的窗口）", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "First");
      });
      expect(result.current.remainingSeconds).toBe(10);

      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      // 经过 3s，remainingSeconds 应为 7
      expect(result.current.remainingSeconds).toBe(7);

      act(() => {
        result.current.recordSentMessage("turn-2" as TurnId, "Second");
      });
      // 重置回 10
      expect(result.current.remainingSeconds).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });
});

// =============================================================================
// 3. 倒计时递减
// =============================================================================

describe("useMessageRetract - 倒计时", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("倒计时随时间递减", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId, retractWindowMs: 10_000 }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });
      expect(result.current.remainingSeconds).toBe(10);

      act(() => {
        vi.advanceTimersByTime(2_500);
      });
      expect(result.current.remainingSeconds).toBe(8);

      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(result.current.remainingSeconds).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("倒计时归零时 canRetract=false", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId, retractWindowMs: 3_000 }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });
      expect(result.current.canRetract).toBe(true);

      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(result.current.canRetract).toBe(false);
      expect(result.current.remainingSeconds).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("自定义 1s 窗口快速倒计时", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId, retractWindowMs: 1_000 }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });
      expect(result.current.remainingSeconds).toBe(1);

      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(result.current.canRetract).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

// =============================================================================
// 4. retract
// =============================================================================

describe("useMessageRetract - 撤回操作", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("retract 调用 invoke('turn_cancel') 和 deleteMessage", async () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    act(() => {
      result.current.recordSentMessage("turn-1" as TurnId, "Hello world");
    });

    await act(async () => {
      await result.current.retract();
    });

    expect(mockInvoke).toHaveBeenCalledWith("turn_cancel", {
      threadId: "thread-1",
      turnId: "turn-1",
    });
    expect(mockDeleteMessage).toHaveBeenCalledWith("thread-1", "turn-1");
  });

  it("retract 后 retractedContent 保留原文", async () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    act(() => {
      result.current.recordSentMessage("turn-1" as TurnId, "原文内容");
    });

    await act(async () => {
      await result.current.retract();
    });

    expect(result.current.retractedContent).toBe("原文内容");
  });

  it("retract 后 canRetract=false", async () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    act(() => {
      result.current.recordSentMessage("turn-1" as TurnId, "Hello");
    });
    expect(result.current.canRetract).toBe(true);

    await act(async () => {
      await result.current.retract();
    });

    expect(result.current.canRetract).toBe(false);
  });

  it("retract 失败时抛出错误", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Cancel failed"));
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    act(() => {
      result.current.recordSentMessage("turn-1" as TurnId, "Hello");
    });

    await act(async () => {
      await expect(result.current.retract()).rejects.toThrow("Cancel failed");
    });
  });

  it("未记录消息时 retract 为 noop", async () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    await act(async () => {
      await result.current.retract();
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockDeleteMessage).not.toHaveBeenCalled();
  });

  it("threadId=null 时 retract 为 noop", async () => {
    const { result } = renderHook(() => useMessageRetract({ threadId: null }));
    act(() => {
      // 模拟直接修改 ref（hook 内部用 currentTurnRef）
      // 实际上 threadId 为 null 时 recordSentMessage 不做任何事
      // 这里我们只验证 retract 不报错
    });
    await act(async () => {
      await result.current.retract();
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("nativeApi 不可用时跳过 deleteMessage", async () => {
    // 用 vi.doMock 临时把 readNativeApi 改为返回 undefined
    const nativeApiModule = await import("~/nativeApi");
    const originalRead = nativeApiModule.readNativeApi;
    (nativeApiModule as { readNativeApi: typeof originalRead }).readNativeApi = () =>
      undefined as never;

    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });

      await act(async () => {
        await result.current.retract();
      });

      // invoke 仍被调用（turn_cancel 通过 tauri）
      expect(mockInvoke).toHaveBeenCalledWith("turn_cancel", {
        threadId: "thread-1",
        turnId: "turn-1",
      });
      // nativeApi 路径的 deleteMessage 没被调用
      expect(mockDeleteMessage).not.toHaveBeenCalled();
    } finally {
      (nativeApiModule as { readNativeApi: typeof originalRead }).readNativeApi = originalRead;
    }
  });
});

// =============================================================================
// 5. cancelRetract
// =============================================================================

describe("useMessageRetract - 取消撤回", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("cancelRetract 后 canRetract=false, retractedContent=null", () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    act(() => {
      result.current.recordSentMessage("turn-1" as TurnId, "Hello");
    });
    expect(result.current.canRetract).toBe(true);

    act(() => {
      result.current.cancelRetract();
    });

    expect(result.current.canRetract).toBe(false);
    expect(result.current.retractedContent).toBeNull();
  });

  it("cancelRetract 后不能再次 retract", async () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    act(() => {
      result.current.recordSentMessage("turn-1" as TurnId, "Hello");
    });
    act(() => {
      result.current.cancelRetract();
    });

    await act(async () => {
      await result.current.retract();
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 6. 事件驱动：Turn 开始执行 → 取消撤回
// =============================================================================

describe("useMessageRetract - Turn 事件", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("turn.tool-call-started 事件触发后取消撤回", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });
      expect(result.current.canRetract).toBe(true);

      act(() => {
        emitDomainEvent({
          type: "thread.tool-call-started",
          aggregateId: "thread-1" as ThreadId,
          payload: { turnId: "turn-1" as TurnId },
        } as unknown as OrchestrationEvent);
      });

      expect(result.current.canRetract).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("turn.response-started 事件触发后取消撤回", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });
      expect(result.current.canRetract).toBe(true);

      act(() => {
        emitDomainEvent({
          type: "thread.turn-started",
          aggregateId: "thread-1" as ThreadId,
          payload: { turnId: "turn-1" as TurnId },
        } as unknown as OrchestrationEvent);
      });

      expect(result.current.canRetract).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("其他 thread 的 turn 事件被忽略", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });
      expect(result.current.canRetract).toBe(true);

      act(() => {
        emitDomainEvent({
          type: "turn.tool-call-started",
          aggregateId: "thread-2" as ThreadId,
          payload: { turnId: "turn-1" as TurnId },
        } as unknown as OrchestrationEvent);
      });

      expect(result.current.canRetract).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("其他 turnId 的 turn 事件被忽略", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });
      expect(result.current.canRetract).toBe(true);

      act(() => {
        emitDomainEvent({
          type: "turn.tool-call-started",
          aggregateId: "thread-1" as ThreadId,
          payload: { turnId: "turn-other" as TurnId },
        } as unknown as OrchestrationEvent);
      });

      expect(result.current.canRetract).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("非 turn 事件不影响撤回能力", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });
      expect(result.current.canRetract).toBe(true);

      act(() => {
        emitDomainEvent({
          type: "thread.message-sent",
          aggregateId: "thread-1" as ThreadId,
          payload: { messageId: "m1" },
        } as unknown as OrchestrationEvent);
      });

      expect(result.current.canRetract).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// =============================================================================
// 7. 卸载清理
// =============================================================================

describe("useMessageRetract - 卸载清理", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("卸载时清理 timer（不抛错）", () => {
    vi.useFakeTimers();
    try {
      const { result, unmount } = renderHook(() =>
        useMessageRetract({ threadId: "thread-1" as ThreadId }),
      );
      act(() => {
        result.current.recordSentMessage("turn-1" as TurnId, "Hello");
      });
      // 卸载应正常清理
      expect(() => unmount()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

// =============================================================================
// 8. type sanity
// =============================================================================

describe("useMessageRetract - API 形状", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("暴露完整 API", () => {
    const { result } = renderHook(() =>
      useMessageRetract({ threadId: "thread-1" as ThreadId }),
    );
    const keys = Object.keys(result.current).sort();
    expect(keys).toEqual(
      [
        "canRetract",
        "cancelRetract",
        "recordSentMessage",
        "remainingSeconds",
        "retract",
        "retractedContent",
      ].sort(),
    );
    expect(typeof result.current.retract).toBe("function");
    expect(typeof result.current.cancelRetract).toBe("function");
    expect(typeof result.current.recordSentMessage).toBe("function");
  });
});
