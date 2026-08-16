/**
 * @file tauriMetrics 单元测试
 *
 * 覆盖:
 *
 * 1. recordTauriCommand 记录样本
 * 2. calculateTauriCommandMetrics 计算 P50/P95/P99
 * 3. getTauriCommandSeverity 阈值判断
 * 4. measureTauriInvoke 包装 invoke 并自动记录
 * 5. subscribeTauriCommand 订阅变化
 * 6. clearTauriCommandMetrics 清空
 * 7. 滑动窗口上限（>1000 样本时保留最新）
 * 8. Hook 集成
 */

import { act, renderHook } from "@testing-library/react";
import {
  TAURI_P99_CRITICAL_THRESHOLD_MS,
  TAURI_P99_WARNING_THRESHOLD_MS,
  calculateTauriCommandMetrics,
  clearAllTauriCommandMetrics,
  clearTauriCommandMetrics,
  getTauriCommandSeverity,
  getTrackedCommands,
  measureTauriInvoke,
  recordTauriCommand,
  subscribeTauriCommand,
  useAllTauriCommandMetrics,
  useTauriCommandMetrics,
} from "./tauriMetrics";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  clearAllTauriCommandMetrics();
});

afterEach(() => {
  clearAllTauriCommandMetrics();
  vi.useRealTimers();
});

describe("recordTauriCommand", () => {
  it("记录单次命令调用", () => {
    recordTauriCommand("test_cmd", 100, true);
    const metrics = calculateTauriCommandMetrics("test_cmd");
    expect(metrics).not.toBeNull();
    expect(metrics?.count).toBe(1);
    expect(metrics?.avgMs).toBe(100);
    expect(metrics?.p99Ms).toBe(100);
    expect(metrics?.successRate).toBe(1);
  });

  it("记录多次调用并正确计算统计", () => {
    recordTauriCommand("multi_cmd", 10, true);
    recordTauriCommand("multi_cmd", 20, true);
    recordTauriCommand("multi_cmd", 30, true);
    const metrics = calculateTauriCommandMetrics("multi_cmd");
    expect(metrics?.count).toBe(3);
    expect(metrics?.avgMs).toBe(20);
    expect(metrics?.minMs).toBe(10);
    expect(metrics?.maxMs).toBe(30);
    expect(metrics?.p50Ms).toBe(20);
  });

  it("记录失败调用并更新成功率", () => {
    recordTauriCommand("fail_cmd", 50, true);
    recordTauriCommand("fail_cmd", 100, false, "error");
    const metrics = calculateTauriCommandMetrics("fail_cmd");
    expect(metrics?.count).toBe(2);
    expect(metrics?.successRate).toBe(0.5);
  });

  it("无样本时返回 null", () => {
    const metrics = calculateTauriCommandMetrics("nonexistent_cmd");
    expect(metrics).toBeNull();
  });

  it("滑动窗口：超过 1000 样本时保留最新", () => {
    // 插入 1001 个样本：前 1000 个 1ms，最后 1 个 1000ms
    for (let i = 0; i < 1000; i++) {
      recordTauriCommand("sliding_cmd", 1, true);
    }
    recordTauriCommand("sliding_cmd", 1000, true);
    const metrics = calculateTauriCommandMetrics("sliding_cmd");
    expect(metrics?.count).toBe(1000); // 滑动窗口上限
    // 因为最早的 1ms 被丢弃，平均值应明显大于 1
    expect(metrics?.avgMs).toBeGreaterThan(1);
  });
});

describe("getTauriCommandSeverity", () => {
  it("ok 状态：P99 < warning 阈值", () => {
    expect(getTauriCommandSeverity(0)).toBe("ok");
    expect(getTauriCommandSeverity(TAURI_P99_WARNING_THRESHOLD_MS - 1)).toBe("ok");
  });

  it("warning 状态：warning 阈值 <= P99 < critical 阈值", () => {
    expect(getTauriCommandSeverity(TAURI_P99_WARNING_THRESHOLD_MS)).toBe("warning");
    expect(getTauriCommandSeverity(TAURI_P99_CRITICAL_THRESHOLD_MS - 1)).toBe("warning");
  });

  it("critical 状态：P99 >= critical 阈值", () => {
    expect(getTauriCommandSeverity(TAURI_P99_CRITICAL_THRESHOLD_MS)).toBe("critical");
    expect(getTauriCommandSeverity(TAURI_P99_CRITICAL_THRESHOLD_MS + 1000)).toBe("critical");
  });
});

describe("measureTauriInvoke", () => {
  it("记录成功调用并返回结果", async () => {
    const result = await measureTauriInvoke("measured_cmd", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "ok";
    });
    expect(result).toBe("ok");
    const metrics = calculateTauriCommandMetrics("measured_cmd");
    expect(metrics).not.toBeNull();
    expect(metrics?.count).toBe(1);
    expect(metrics?.successRate).toBe(1);
  });

  it("记录失败调用并抛出错误", async () => {
    await expect(
      measureTauriInvoke("error_cmd", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const metrics = calculateTauriCommandMetrics("error_cmd");
    expect(metrics).not.toBeNull();
    expect(metrics?.count).toBe(1);
    expect(metrics?.successRate).toBe(0);
  });

  it("即使失败也记录耗时", async () => {
    await expect(
      measureTauriInvoke("failed_timed_cmd", async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        throw new Error("late");
      }),
    ).rejects.toThrow("late");
    const metrics = calculateTauriCommandMetrics("failed_timed_cmd");
    expect(metrics?.avgMs).toBeGreaterThanOrEqual(20);
  });
});

describe("subscribeTauriCommand", () => {
  it("新记录触发订阅者回调", () => {
    const listener = vi.fn();
    const unsub = subscribeTauriCommand("sub_cmd", listener);
    recordTauriCommand("sub_cmd", 10, true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("取消订阅后不再触发", () => {
    const listener = vi.fn();
    const unsub = subscribeTauriCommand("sub2_cmd", listener);
    unsub();
    recordTauriCommand("sub2_cmd", 10, true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("不同命令的订阅独立", () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = subscribeTauriCommand("cmd_a", listenerA);
    const unsubB = subscribeTauriCommand("cmd_b", listenerB);
    recordTauriCommand("cmd_a", 1, true);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();
    unsubA();
    unsubB();
  });
});

describe("clearTauriCommandMetrics", () => {
  it("清空指定命令的样本", () => {
    recordTauriCommand("to_clear", 10, true);
    expect(calculateTauriCommandMetrics("to_clear")).not.toBeNull();
    clearTauriCommandMetrics("to_clear");
    expect(calculateTauriCommandMetrics("to_clear")).toBeNull();
  });

  it("clearAllTauriCommandMetrics 清空所有命令", () => {
    recordTauriCommand("cmd1", 10, true);
    recordTauriCommand("cmd2", 20, true);
    expect(getTrackedCommands().length).toBe(2);
    clearAllTauriCommandMetrics();
    expect(getTrackedCommands().length).toBe(0);
  });
});

describe("getTrackedCommands", () => {
  it("返回所有已记录的命令名", () => {
    recordTauriCommand("alpha", 10, true);
    recordTauriCommand("beta", 20, true);
    recordTauriCommand("gamma", 30, true);
    const commands = getTrackedCommands();
    expect(commands).toContain("alpha");
    expect(commands).toContain("beta");
    expect(commands).toContain("gamma");
    expect(commands.length).toBe(3);
  });
});

describe("P99 计算准确性", () => {
  it("100 个样本的 P99 应接近第 99 个值", () => {
    // 插入 100 个递增样本：1, 2, 3, ..., 100
    for (let i = 1; i <= 100; i++) {
      recordTauriCommand("p99_test", i, true);
    }
    const metrics = calculateTauriCommandMetrics("p99_test");
    expect(metrics).not.toBeNull();
    // P99 应在 98-100 范围内
    expect(metrics!.p99Ms).toBeGreaterThanOrEqual(98);
    expect(metrics!.p99Ms).toBeLessThanOrEqual(100);
  });

  it("P95 应在合理范围内", () => {
    for (let i = 1; i <= 100; i++) {
      recordTauriCommand("p95_test", i, true);
    }
    const metrics = calculateTauriCommandMetrics("p95_test");
    expect(metrics!.p95Ms).toBeGreaterThanOrEqual(94);
    expect(metrics!.p95Ms).toBeLessThanOrEqual(96);
  });

  it("P50 中位数准确", () => {
    for (let i = 1; i <= 100; i++) {
      recordTauriCommand("p50_test", i, true);
    }
    const metrics = calculateTauriCommandMetrics("p50_test");
    // 1-100 的中位数是 50.5
    expect(metrics!.p50Ms).toBeGreaterThanOrEqual(49);
    expect(metrics!.p50Ms).toBeLessThanOrEqual(52);
  });
});

describe("useTauriCommandMetrics Hook", () => {
  it("返回 null 当无样本时", () => {
    const { result } = renderHook(() => useTauriCommandMetrics("no_data_cmd"));
    expect(result.current).toBeNull();
  });

  it("记录样本后返回正确指标", () => {
    const { result } = renderHook(() => useTauriCommandMetrics("hook_cmd"));
    act(() => {
      recordTauriCommand("hook_cmd", 50, true);
    });
    expect(result.current).not.toBeNull();
    expect(result.current?.command).toBe("hook_cmd");
    expect(result.current?.count).toBe(1);
  });

  it("样本更新时 Hook 自动响应", () => {
    const { result } = renderHook(() => useTauriCommandMetrics("reactive_cmd"));
    expect(result.current).toBeNull();
    act(() => {
      recordTauriCommand("reactive_cmd", 100, true);
    });
    expect(result.current?.count).toBe(1);
  });
});

describe("useAllTauriCommandMetrics Hook", () => {
  it("返回所有命令的指标", () => {
    recordTauriCommand("a_cmd", 10, true);
    recordTauriCommand("b_cmd", 20, true);
    const { result } = renderHook(() => useAllTauriCommandMetrics());
    expect(result.current.length).toBe(2);
  });

  it("新增命令时自动包含", () => {
    const { result } = renderHook(() => useAllTauriCommandMetrics());
    expect(result.current.length).toBe(0);
    act(() => {
      recordTauriCommand("new_cmd", 30, true);
    });
    expect(result.current.length).toBe(1);
  });
});

describe("阈值常量", () => {
  it("warning < critical", () => {
    expect(TAURI_P99_WARNING_THRESHOLD_MS).toBeLessThan(TAURI_P99_CRITICAL_THRESHOLD_MS);
  });
  it("warning 阈值为合理值（500ms）", () => {
    expect(TAURI_P99_WARNING_THRESHOLD_MS).toBe(500);
  });
  it("critical 阈值为合理值（1500ms）", () => {
    expect(TAURI_P99_CRITICAL_THRESHOLD_MS).toBe(1500);
  });
});
