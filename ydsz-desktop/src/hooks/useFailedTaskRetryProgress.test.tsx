/**
 * @file useFailedTaskRetryProgress 单元测试
 *
 * 覆盖：
 * - 初始状态（空 map）
 * - recordStart：开启重试
 * - recordAttempt：递增尝试次数
 * - recordSuccess：标记成功
 * - recordExhausted：标记用尽
 * - clearTurn / clearAll：清理
 * - 派生数据（retryAttemptsMap / retryingTurnIds / exhaustedTurnIds）正确性
 * - 多 turn 并行独立
 * - 边界情况（重复 start / 缺失 maxRetries / 非法输入）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TurnId } from "~/contracts";
import {
  useFailedTaskRetryProgress,
  type UseFailedTaskRetryProgressResult,
} from "./useFailedTaskRetryProgress";

// 让 happy-dom 下 React 18 的 act() 正常工作
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface HookHandle {
  result: UseFailedTaskRetryProgressResult;
  unmount: () => void;
}

function setupHook(): HookHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let captured: UseFailedTaskRetryProgressResult | null = null;
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
    captured = useFailedTaskRetryProgress();
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  return handle;
}

// =============================================================================
// 1. 初始状态
// =============================================================================

describe("useFailedTaskRetryProgress - 初始状态", () => {
  it("挂载时 progressMap 为空、attempts 为空", () => {
    const handle = setupHook();

    expect(handle.result.progressMap).toEqual({});
    expect(handle.result.retryAttemptsMap).toEqual({});
    expect(handle.result.retryingTurnIds).toEqual([]);
    expect(handle.result.exhaustedTurnIds).toEqual([]);
    handle.unmount();
  });

  it("getProgress 对未记录的 turnId 返回 undefined", () => {
    const handle = setupHook();

    expect(handle.result.getProgress("turn-x" as TurnId)).toBeUndefined();
    handle.unmount();
  });
});

// =============================================================================
// 2. recordStart
// =============================================================================

describe("useFailedTaskRetryProgress - recordStart", () => {
  let handle: HookHandle;
  beforeEach(() => {
    handle = setupHook();
  });
  afterEach(() => {
    handle.unmount();
  });

  it("开启某个 turn 的重试，状态为 retrying / attempt=0", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
    });

    const progress = handle.result.progressMap["turn-1"]!;
    expect(progress).toBeDefined();
    expect(progress.status).toBe("retrying");
    expect(progress.attempt).toBe(0);
    expect(progress.maxRetries).toBe(5);
    expect(progress.updatedAt).toBeGreaterThan(0);
  });

  it("maxRetries < 1 时归一化为 1", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 0);
    });
    expect(handle.result.progressMap["turn-1"]!.maxRetries).toBe(1);

    act(() => {
      handle.result.recordStart("turn-2" as TurnId, -3);
    });
    expect(handle.result.progressMap["turn-2"]!.maxRetries).toBe(1);
  });

  it("maxRetries 非整数时取整", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 3.7);
    });
    expect(handle.result.progressMap["turn-1"]!.maxRetries).toBe(3);
  });

  it("空字符串 turnId 不写入", () => {
    act(() => {
      handle.result.recordStart("" as TurnId, 5);
    });
    expect(Object.keys(handle.result.progressMap)).toHaveLength(0);
  });

  it("同一 turn 多次 start 时 attempt 重置为 0", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 3);
    });
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(3);

    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
    });
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(0);
    expect(handle.result.progressMap["turn-1"]!.status).toBe("retrying");
  });
});

// =============================================================================
// 3. recordAttempt
// =============================================================================

describe("useFailedTaskRetryProgress - recordAttempt", () => {
  let handle: HookHandle;
  beforeEach(() => {
    handle = setupHook();
  });
  afterEach(() => {
    handle.unmount();
  });

  it("自增尝试次数", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 1);
    });
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(1);

    act(() => {
      handle.result.recordAttempt("turn-1" as TurnId, 2);
    });
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(2);
  });

  it("attempt 为负数时归一化为 0", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, -2);
    });
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(0);
  });

  it("未 recordStart 直接 recordAttempt 时 maxRetries 默认为 5", () => {
    act(() => {
      handle.result.recordAttempt("turn-1" as TurnId, 2);
    });
    expect(handle.result.progressMap["turn-1"]!.maxRetries).toBe(5);
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(2);
  });

  it("recordAttempt 后状态保持 retrying", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 1);
      handle.result.recordAttempt("turn-1" as TurnId, 2);
    });
    expect(handle.result.progressMap["turn-1"]!.status).toBe("retrying");
  });

  it("errorClass 被持久化到 progress", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 1, { errorClass: "network" });
    });
    expect(handle.result.progressMap["turn-1"]!.lastErrorClass).toBe("network");
  });
});

// =============================================================================
// 4. recordSuccess / recordExhausted
// =============================================================================

describe("useFailedTaskRetryProgress - recordSuccess / recordExhausted", () => {
  let handle: HookHandle;
  beforeEach(() => {
    handle = setupHook();
  });
  afterEach(() => {
    handle.unmount();
  });

  it("recordSuccess 将状态标记为 success", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 2);
      handle.result.recordSuccess("turn-1" as TurnId);
    });

    const progress = handle.result.progressMap["turn-1"]!;
    expect(progress.status).toBe("success");
    expect(progress.attempt).toBe(2);
  });

  it("recordExhausted 将状态标记为 exhausted 且 attempt 等于 maxRetries", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 5);
      handle.result.recordExhausted("turn-1" as TurnId);
    });

    const progress = handle.result.progressMap["turn-1"]!;
    expect(progress.status).toBe("exhausted");
    expect(progress.attempt).toBe(5);
    expect(progress.maxRetries).toBe(5);
  });

  it("未 recordStart 直接 recordSuccess 不会抛错", () => {
    act(() => {
      handle.result.recordSuccess("turn-x" as TurnId);
    });
    const progress = handle.result.progressMap["turn-x"]!;
    expect(progress.status).toBe("success");
    expect(progress.attempt).toBe(1);
    expect(progress.maxRetries).toBe(1);
  });

  it("未 recordStart 直接 recordExhausted 时 maxRetries 默认为 5", () => {
    act(() => {
      handle.result.recordExhausted("turn-x" as TurnId);
    });
    const progress = handle.result.progressMap["turn-x"]!;
    expect(progress.status).toBe("exhausted");
    expect(progress.attempt).toBe(5);
    expect(progress.maxRetries).toBe(5);
  });
});

// =============================================================================
// 5. clearTurn / clearAll
// =============================================================================

describe("useFailedTaskRetryProgress - clearTurn / clearAll", () => {
  let handle: HookHandle;
  beforeEach(() => {
    handle = setupHook();
  });
  afterEach(() => {
    handle.unmount();
  });

  it("clearTurn 移除指定 turn 的进度", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordStart("turn-2" as TurnId, 3);
    });

    act(() => {
      handle.result.clearTurn("turn-1" as TurnId);
    });

    expect(handle.result.progressMap["turn-1"]).toBeUndefined();
    expect(handle.result.progressMap["turn-2"]).toBeDefined();
  });

  it("clearTurn 不存在的 turnId 不会抛错", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
    });
    expect(() => {
      act(() => {
        handle.result.clearTurn("nonexistent" as TurnId);
      });
    }).not.toThrow();
    expect(handle.result.progressMap["turn-1"]).toBeDefined();
  });

  it("clearAll 清空所有进度", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordStart("turn-2" as TurnId, 5);
      handle.result.recordStart("turn-3" as TurnId, 5);
    });

    act(() => {
      handle.result.clearAll();
    });

    expect(Object.keys(handle.result.progressMap)).toHaveLength(0);
  });
});

// =============================================================================
// 6. 派生数据
// =============================================================================

describe("useFailedTaskRetryProgress - 派生数据", () => {
  let handle: HookHandle;
  beforeEach(() => {
    handle = setupHook();
  });
  afterEach(() => {
    handle.unmount();
  });

  it("retryAttemptsMap 仅暴露 attempt 和 maxRetries", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 2);
    });

    const map = handle.result.retryAttemptsMap;
    expect(map["turn-1"]).toEqual({ attempt: 2, maxRetries: 5 });
    // 不应包含 status / updatedAt / lastErrorClass
    expect(Object.keys(map["turn-1"]!).sort()).toEqual(["attempt", "maxRetries"]);
  });

  it("retryingTurnIds 仅包含 retrying 状态", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordStart("turn-2" as TurnId, 5);
      handle.result.recordAttempt("turn-2" as TurnId, 5);
      handle.result.recordExhausted("turn-2" as TurnId);
    });

    expect(handle.result.retryingTurnIds).toContain("turn-1");
    expect(handle.result.retryingTurnIds).not.toContain("turn-2");
  });

  it("exhaustedTurnIds 仅包含 exhausted 状态", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 5);
      handle.result.recordExhausted("turn-1" as TurnId);
      handle.result.recordStart("turn-2" as TurnId, 5);
    });

    expect(handle.result.exhaustedTurnIds).toContain("turn-1");
    expect(handle.result.exhaustedTurnIds).not.toContain("turn-2");
  });
});

// =============================================================================
// 7. 多 Turn 独立性
// =============================================================================

describe("useFailedTaskRetryProgress - 多 Turn 独立性", () => {
  let handle: HookHandle;
  beforeEach(() => {
    handle = setupHook();
  });
  afterEach(() => {
    handle.unmount();
  });

  it("不同 turn 的进度互不影响", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordStart("turn-2" as TurnId, 3);
      handle.result.recordStart("turn-3" as TurnId, 5);

      handle.result.recordAttempt("turn-1" as TurnId, 1);
      handle.result.recordAttempt("turn-2" as TurnId, 2);
      handle.result.recordAttempt("turn-3" as TurnId, 3);
    });

    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(1);
    expect(handle.result.progressMap["turn-2"]!.attempt).toBe(2);
    expect(handle.result.progressMap["turn-3"]!.attempt).toBe(3);

    expect(handle.result.progressMap["turn-1"]!.maxRetries).toBe(5);
    expect(handle.result.progressMap["turn-2"]!.maxRetries).toBe(3);
    expect(handle.result.progressMap["turn-3"]!.maxRetries).toBe(5);
  });

  it("一个 turn exhausted 不会影响其他 turn", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordStart("turn-2" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 5);
      handle.result.recordExhausted("turn-1" as TurnId);
    });

    expect(handle.result.progressMap["turn-1"]!.status).toBe("exhausted");
    expect(handle.result.progressMap["turn-2"]!.status).toBe("retrying");
  });

  it("一个 turn success 不会影响其他 turn", () => {
    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordStart("turn-2" as TurnId, 5);
      handle.result.recordSuccess("turn-1" as TurnId);
    });

    expect(handle.result.progressMap["turn-1"]!.status).toBe("success");
    expect(handle.result.progressMap["turn-2"]!.status).toBe("retrying");
  });
});

// =============================================================================
// 8. 状态时序（典型重试流程）
// =============================================================================

describe("useFailedTaskRetryProgress - 典型重试流程", () => {
  it("start → attempt(1) → attempt(2) → success 完整流程", () => {
    const handle = setupHook();

    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
    });
    expect(handle.result.progressMap["turn-1"]!.status).toBe("retrying");
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(0);

    act(() => {
      handle.result.recordAttempt("turn-1" as TurnId, 1);
    });
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(1);
    expect(handle.result.progressMap["turn-1"]!.status).toBe("retrying");

    act(() => {
      handle.result.recordAttempt("turn-1" as TurnId, 2);
    });
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(2);

    act(() => {
      handle.result.recordSuccess("turn-1" as TurnId);
    });
    expect(handle.result.progressMap["turn-1"]!.status).toBe("success");
    expect(handle.result.progressMap["turn-1"]!.attempt).toBe(2);
    handle.unmount();
  });

  it("start → attempt(1..5) → exhausted 完整流程", () => {
    const handle = setupHook();

    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      for (let i = 1; i <= 5; i++) {
        handle.result.recordAttempt("turn-1" as TurnId, i);
      }
      handle.result.recordExhausted("turn-1" as TurnId);
    });

    const progress = handle.result.progressMap["turn-1"]!;
    expect(progress.status).toBe("exhausted");
    expect(progress.attempt).toBe(5);
    expect(progress.maxRetries).toBe(5);
    expect(handle.result.exhaustedTurnIds).toContain("turn-1");
    handle.unmount();
  });

  it("clearTurn 后可重新 recordStart（重置后再次重试场景）", () => {
    const handle = setupHook();

    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 5);
      handle.result.recordExhausted("turn-1" as TurnId);
    });
    expect(handle.result.progressMap["turn-1"]!.status).toBe("exhausted");

    act(() => {
      handle.result.clearTurn("turn-1" as TurnId);
    });
    expect(handle.result.progressMap["turn-1"]).toBeUndefined();

    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 1);
      handle.result.recordSuccess("turn-1" as TurnId);
    });
    const progress = handle.result.progressMap["turn-1"]!;
    expect(progress.status).toBe("success");
    expect(progress.attempt).toBe(1);
    handle.unmount();
  });
});

// =============================================================================
// 9. 集成场景：与 FailedTaskQueue 协同
// =============================================================================

describe("useFailedTaskRetryProgress - 与 FailedTaskQueue 协同", () => {
  it("派生 retryAttemptsMap 直接可传给 FailedTaskQueue", () => {
    const handle = setupHook();

    act(() => {
      handle.result.recordStart("turn-1" as TurnId, 5);
      handle.result.recordAttempt("turn-1" as TurnId, 2);
      handle.result.recordStart("turn-2" as TurnId, 5);
      handle.result.recordAttempt("turn-2" as TurnId, 5);
      handle.result.recordExhausted("turn-2" as TurnId);
    });

    const map = handle.result.retryAttemptsMap;
    expect(map).toEqual({
      "turn-1": { attempt: 2, maxRetries: 5 },
      "turn-2": { attempt: 5, maxRetries: 5 },
    });

    // retrying 应仅包含 turn-1
    expect(handle.result.retryingTurnIds).toEqual(["turn-1"]);
    // exhausted 应仅包含 turn-2
    expect(handle.result.exhaustedTurnIds).toEqual(["turn-2"]);
    handle.unmount();
  });
});

// =============================================================================
// 10. updatedAt 行为
// =============================================================================

describe("useFailedTaskRetryProgress - updatedAt 行为", () => {
  it("每次写入都会更新 updatedAt", () => {
    vi.useFakeTimers();
    const startTime = new Date("2026-06-25T10:00:00Z").getTime();
    vi.setSystemTime(startTime);

    try {
      const handle = setupHook();

      act(() => {
        handle.result.recordStart("turn-1" as TurnId, 5);
      });
      const t1 = handle.result.progressMap["turn-1"]!.updatedAt;
      expect(t1).toBe(startTime);

      vi.setSystemTime(startTime + 1000);
      act(() => {
        handle.result.recordAttempt("turn-1" as TurnId, 1);
      });
      const t2 = handle.result.progressMap["turn-1"]!.updatedAt;
      expect(t2).toBe(startTime + 1000);

      vi.setSystemTime(startTime + 2000);
      act(() => {
        handle.result.recordSuccess("turn-1" as TurnId);
      });
      const t3 = handle.result.progressMap["turn-1"]!.updatedAt;
      expect(t3).toBe(startTime + 2000);
      handle.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
