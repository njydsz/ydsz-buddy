/**
 * @file useIdleLock Hook 单元测试
 * @description P2-1: 验证后端化薄壳 hook 正确处理 invoke / 状态变化 / 活动节流
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { useIdleLock } = await import("./useIdleLock");

const SNAPSHOT_DISARMED = {
  state: "disarmed" as const,
  config: { enabled: false, threshold_secs: 300, privacy_only: false },
  last_activity_ms: 0,
  idle_secs: 0,
  has_pin: false,
  locked_at_ms: 0,
};

const SNAPSHOT_ARMED = {
  state: "armed" as const,
  config: { enabled: true, threshold_secs: 300, privacy_only: false },
  last_activity_ms: 0,
  idle_secs: 0,
  has_pin: false,
  locked_at_ms: 0,
};

const SNAPSHOT_LOCKED = {
  state: "locked" as const,
  config: { enabled: true, threshold_secs: 300, privacy_only: false },
  last_activity_ms: 0,
  idle_secs: 300,
  has_pin: true,
  locked_at_ms: 1700000000000,
};

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useIdleLock - 初始化", () => {
  it("挂载时拉取一次快照", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_DISARMED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_get_state");
    expect(result.current.state).toBe("disarmed");
    expect(result.current.isLocked).toBe(false);
    expect(result.current.isArmed).toBe(false);
    expect(result.current.hasPin).toBe(false);
  });

  it("无快照时给安全默认值", () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_DISARMED);
    const { result } = renderHook(() => useIdleLock());
    expect(result.current.state).toBe("disarmed");
    expect(result.current.idleSeconds).toBe(0);
  });
});

describe("useIdleLock - 状态转换", () => {
  it("arm() 调用 idle_lock_arm 命令", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_DISARMED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockResolvedValueOnce(SNAPSHOT_ARMED);
    await act(async () => {
      await result.current.arm();
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_arm");
    expect(result.current.state).toBe("armed");
    expect(result.current.isArmed).toBe(true);
  });

  it("disarm() 调用 idle_lock_disarm 命令", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_ARMED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockResolvedValueOnce(SNAPSHOT_DISARMED);
    await act(async () => {
      await result.current.disarm();
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_disarm");
    expect(result.current.state).toBe("disarmed");
  });

  it("lockNow() 调用 idle_lock_now 命令并进入 locked", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_ARMED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockResolvedValueOnce(SNAPSHOT_LOCKED);
    await act(async () => {
      await result.current.lockNow();
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_now");
    expect(result.current.isLocked).toBe(true);
    expect(result.current.hasPin).toBe(true);
  });
});

describe("useIdleLock - PIN & unlock", () => {
  it("unlock() 传 PIN 调用 idle_lock_unlock", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_LOCKED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockResolvedValueOnce({ ok: true, reason: "none" });
    // unlock 成功后内部 refresh → 再调一次 idle_lock_get_state
    invokeMock.mockResolvedValueOnce(SNAPSHOT_ARMED);
    await act(async () => {
      const r = await result.current.unlock("1234");
      expect(r.ok).toBe(true);
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_unlock", { pin: "1234" });
  });

  it("unlock 失败时不刷新快照,返回 reason", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_LOCKED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockResolvedValueOnce({ ok: false, reason: "pin_mismatch" });
    const r = await result.current.unlock("9999");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("pin_mismatch");
    // 不应再调用 get_state
    expect(invokeMock).not.toHaveBeenCalledWith("idle_lock_get_state", undefined);
  });

  it("unlock 后端抛错时降级返回 NotLocked", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_LOCKED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockRejectedValueOnce(new Error("ipc down"));
    const r = await result.current.unlock("1234");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_locked");
  });

  it("setPin() 调用 idle_lock_set_pin", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_DISARMED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockResolvedValueOnce({
      ...SNAPSHOT_DISARMED,
      has_pin: true,
    });
    await act(async () => {
      await result.current.setPin("1234");
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_set_pin", { pin: "1234" });
    expect(result.current.hasPin).toBe(true);
  });
});

describe("useIdleLock - 配置 & refresh", () => {
  it("setConfig() 传新配置", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_DISARMED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockResolvedValueOnce({
      ...SNAPSHOT_ARMED,
      config: { enabled: true, threshold_secs: 600, privacy_only: true },
    });
    await act(async () => {
      await result.current.setConfig({
        enabled: true,
        threshold_secs: 600,
        privacy_only: true,
      });
    });
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_set_config", {
      config: { enabled: true, threshold_secs: 600, privacy_only: true },
    });
  });

  it("refresh() 主动拉取", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_DISARMED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockResolvedValueOnce(SNAPSHOT_ARMED);
    await act(async () => {
      await result.current.refresh();
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});

describe("useIdleLock - 活动节流", () => {
  it("连续 recordActivity 在 500ms 内只触发一次 invoke", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue(SNAPSHOT_DISARMED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockClear();
    result.current.recordActivity();
    result.current.recordActivity();
    result.current.recordActivity();
    // 第一次调用,后续被 throttle
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("idle_lock_record_activity");
  });
});

describe("useIdleLock - tick 行为", () => {
  it("disableTick=true 时不自动 tick", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue(SNAPSHOT_DISARMED);
    renderHook(() => useIdleLock({ disableTick: true }));
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockClear();
    // 5 秒过去
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(invokeMock).not.toHaveBeenCalledWith("idle_lock_tick");
  });

  it("默认每 1s 调用一次 tick", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue(SNAPSHOT_DISARMED);
    renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    // 3 秒内应至少 3 次 tick (允许 ±1)
    const tickCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === "idle_lock_tick",
    ).length;
    expect(tickCalls).toBeGreaterThanOrEqual(2);
    expect(tickCalls).toBeLessThanOrEqual(4);
  });
});

describe("useIdleLock - 状态变化回调", () => {
  it("onStateChange 在 snapshot.state 改变时触发", async () => {
    const onStateChange = vi.fn();
    invokeMock.mockResolvedValueOnce(SNAPSHOT_DISARMED);
    const { result } = renderHook(() => useIdleLock({ onStateChange }));
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockResolvedValueOnce(SNAPSHOT_ARMED);
    await act(async () => {
      await result.current.arm();
    });
    expect(onStateChange).toHaveBeenCalledWith("armed", "disarmed");
  });
});

describe("useIdleLock - 后端错误降级", () => {
  it("refresh 失败时保留旧 snapshot", async () => {
    invokeMock.mockResolvedValueOnce(SNAPSHOT_ARMED);
    const { result } = renderHook(() => useIdleLock());
    await act(async () => {
      await Promise.resolve();
    });
    invokeMock.mockRejectedValueOnce(new Error("ipc down"));
    await act(async () => {
      await result.current.refresh();
    });
    // 保留旧值,不崩
    expect(result.current.state).toBe("armed");
  });
});
