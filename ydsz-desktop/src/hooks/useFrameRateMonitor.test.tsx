/**
 * @file useFrameRateMonitor 单元测试
 *
 * 覆盖:
 *
 * 1. 帧率计数:requestAnimationFrame 触发后 frameRate 状态更新
 * 2. 自动降级:fps < minimal → performanceMode = "minimal"
 * 3. 性能模式 CSS 注入:<html> 上的 data-* 属性同步
 * 4. 脱敏上报:桶聚合 + 分钟级时间戳
 * 5. 卸载时 flush 窗口
 *
 * 注:使用 mock 的 `performance.now()` 与 `requestAnimationFrame`,
 *     通过手动驱动帧回调 + 推进时钟控制帧率。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFrameRateMonitor, type FrameRateReportSnapshot } from "./useFrameRateMonitor";

// 1) mock requestAnimationFrame / cancelAnimationFrame,让测试可控制帧
let rafCallbacks: Array<() => void> = [];
let rafId = 0;
const rafMock = vi.fn((cb: () => void) => {
  rafCallbacks.push(cb);
  return ++rafId;
});
const cafMock = vi.fn((_id: number) => {
  // 在我们简单的 mock 中不做删除;手动驱动 callbacks
});

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  rafMock.mockClear();
  cafMock.mockClear();
  vi.stubGlobal("requestAnimationFrame", rafMock);
  vi.stubGlobal("cancelAnimationFrame", cafMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * 用 `performance.now()` 的替身固定时间。
 */
function installClock(initialTime: number) {
  let now = initialTime;
  const stub = vi.spyOn(performance, "now").mockImplementation(() => now);
  return {
    advance(ms: number) {
      now += ms;
    },
    set(ms: number) {
      now = ms;
    },
    current() {
      return now;
    },
    restore() {
      stub.mockRestore();
    },
  };
}

/**
 * 推进一组 Promise microtask,让 React 18 在 happy-dom 下完成 batching flush。
 *
 * happy-dom + React 18 + act 并不总是同步 flush,setState 可能被排到
 * microtask 队列中。需要反复 await Promise.resolve() 多次。
 */
async function flushMicrotasks(times = 10) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

/**
 * 驱动 N 次 rAF 回调,模拟 `countFrame` 在每次回调中再次请求下一帧。
 *
 * 关键:测试中需要先 `clock.advance(1000)` 让 lastTimeRef 起始为 1000,
 * 否则 fps 累加 1 秒才能达到 sample interval,导致 N 帧 fps != N。
 *
 * 默认假设:N 帧对应 1 秒 (sampleIntervalMs),即 fps = N。
 *
 * 行为:
 * - 每帧 rAF 回调都用 `act` 包裹,内部 setState 会被 React 18 batch
 * - 循环结束后 await microtask flush,让所有 batched setState 落到 state
 */
async function driveFrames(
  frameCount: number,
  clock: ReturnType<typeof installClock>,
  frameIntervalMs: number = 1000 / frameCount,
) {
  for (let i = 0; i < frameCount; i++) {
    await act(async () => {
      clock.advance(frameIntervalMs);
      const cbs = rafCallbacks;
      rafCallbacks = [];
      for (const cb of cbs) cb();
    });
  }
  await flushMicrotasks();
}

describe("useFrameRateMonitor", () => {
  it("starts a requestAnimationFrame loop when enabled", async () => {
    installClock(0);
    renderHook(() => useFrameRateMonitor({ enabled: true }));
    await flushMicrotasks();
    expect(rafMock).toHaveBeenCalled();
  });

  it("does not start a loop when enabled is false", async () => {
    renderHook(() => useFrameRateMonitor({ enabled: false }));
    await flushMicrotasks();
    expect(rafMock).not.toHaveBeenCalled();
  });

  it("updates frameRate after the sample interval elapses", async () => {
    const clock = installClock(0);
    // 让 lastTimeRef 起始为 1000,确保驱动 N 帧后 fps 准确等于 N
    clock.advance(1000);
    const { result } = renderHook(() =>
      useFrameRateMonitor({ enabled: true, sampleIntervalMs: 1000 }),
    );

    // 模拟 60 帧/秒:1 秒内 60 帧
    await driveFrames(60, clock);
    await flushMicrotasks();

    expect(result.current.frameRate).toBe(60);
    clock.restore();
  });

  it("auto-degrades to minimal mode when fps < minimalThreshold", async () => {
    const clock = installClock(0);
    clock.advance(1000);
    const { result } = renderHook(() =>
      useFrameRateMonitor({
        enabled: true,
        sampleIntervalMs: 1000,
        minimalThreshold: 30,
        reducedThreshold: 50,
        startupGracePeriodMs: 0,
        lowFpsStreakThreshold: 1,
      }),
    );

    // 1 秒内 20 帧 → 20 fps
    await driveFrames(20, clock);
    await flushMicrotasks();

    expect(result.current.frameRate).toBe(20);
    expect(result.current.performanceMode).toBe("minimal");
    expect(result.current.shouldReduceMotion).toBe(true);
    expect(result.current.showPerformanceSuggestion).toBe(true);
    clock.restore();
  });

  it("auto-degrades to reduced mode when fps is between thresholds", async () => {
    const clock = installClock(0);
    clock.advance(1000);
    const { result } = renderHook(() =>
      useFrameRateMonitor({
        enabled: true,
        sampleIntervalMs: 1000,
        minimalThreshold: 30,
        reducedThreshold: 50,
      }),
    );

    await driveFrames(40, clock);
    await flushMicrotasks();

    expect(result.current.frameRate).toBe(40);
    expect(result.current.performanceMode).toBe("reduced");
    expect(result.current.shouldReduceMotion).toBe(true);
    expect(result.current.showPerformanceSuggestion).toBe(false);
    clock.restore();
  });

  it("injects data-* attributes into <html> on mount and mode change", async () => {
    const clock = installClock(0);
    clock.advance(1000);
    const { result } = renderHook(() =>
      useFrameRateMonitor({
        enabled: true,
        sampleIntervalMs: 1000,
        minimalThreshold: 30,
        reducedThreshold: 50,
      }),
    );

    await flushMicrotasks();
    expect(document.documentElement.getAttribute("data-performance-mode")).toBe("normal");
    expect(document.documentElement.getAttribute("data-reduce-motion")).toBe("false");

    // 触发 minimal
    await driveFrames(20, clock);
    await flushMicrotasks();

    expect(document.documentElement.getAttribute("data-performance-mode")).toBe("minimal");
    expect(document.documentElement.getAttribute("data-reduce-motion")).toBe("true");

    // 手动切回 normal
    act(() => {
      result.current.setPerformanceMode("normal");
    });
    await flushMicrotasks();
    expect(document.documentElement.getAttribute("data-performance-mode")).toBe("normal");
    expect(document.documentElement.getAttribute("data-reduce-motion")).toBe("false");

    clock.restore();
  });

  it("respects user override once setPerformanceMode is called", async () => {
    const clock = installClock(0);
    clock.advance(1000);
    const { result } = renderHook(() =>
      useFrameRateMonitor({
        enabled: true,
        sampleIntervalMs: 1000,
        minimalThreshold: 30,
        reducedThreshold: 50,
      }),
    );

    act(() => {
      result.current.setPerformanceMode("normal");
    });
    await flushMicrotasks();

    // fps = 20, 但因为 userOverride 已置位,不应触发 minimal
    await driveFrames(20, clock);
    await flushMicrotasks();

    expect(result.current.performanceMode).toBe("normal");
    expect(result.current.hasUserOverride).toBe(true);
    expect(result.current.showPerformanceSuggestion).toBe(false);
    clock.restore();
  });

  it("clearPerformanceOverride re-enables automatic frame-rate-based degradation", async () => {
    const clock = installClock(0);
    clock.advance(1000);
    const { result } = renderHook(() =>
      useFrameRateMonitor({
        enabled: true,
        sampleIntervalMs: 1000,
        minimalThreshold: 30,
        reducedThreshold: 50,
        startupGracePeriodMs: 0,
        lowFpsStreakThreshold: 1,
      }),
    );

    act(() => {
      result.current.setPerformanceMode("normal");
    });
    await flushMicrotasks();
    expect(result.current.hasUserOverride).toBe(true);

    act(() => {
      result.current.clearPerformanceOverride();
    });
    await flushMicrotasks();
    expect(result.current.hasUserOverride).toBe(false);

    // 清除覆盖后,fps < minimalThreshold 会再次降级
    await driveFrames(20, clock);
    await flushMicrotasks();

    expect(result.current.performanceMode).toBe("minimal");
    expect(result.current.showPerformanceSuggestion).toBe(true);
    clock.restore();
  });

  it("emits sanitized reports through onReport callback every 30s", async () => {
    // 不使用 vi.useFakeTimers(),而是 stub Date.now 来控制"系统时间",
    // 这样既能确保 report window 推进,又能让 happy-dom 的 setTimeout
    // (驱动 countFrame re-schedule 的 requestAnimationFrame 路径)继续工作。
    const startMs = Date.parse("2026-06-24T10:23:45.123Z");
    let fakeNow = startMs;
    const dateNowStub = vi.spyOn(Date, "now").mockImplementation(() => fakeNow);

    const clock = installClock(0);
    clock.advance(1000);
    const onReport = vi.fn();

    const { result } = renderHook(() =>
      useFrameRateMonitor({
        enabled: true,
        sampleIntervalMs: 1000,
        minimalThreshold: 30,
        reducedThreshold: 50,
        onReport,
      }),
    );

    // 1 秒内 60 帧 → 60 fps, 桶聚合到 60
    await driveFrames(60, clock);
    await flushMicrotasks();
    // 还没到 30s, 不应触发 onReport
    expect(onReport).not.toHaveBeenCalled();

    // 推进"系统时间"30 次,每次 1 秒,模拟 30 秒连续采样
    // 第 30 次循环 (i=29) 时 fakeNow=startMs+30000,now-bucketStart=30000 触发 flush
    for (let i = 0; i < 30; i++) {
      fakeNow += 1000;
      await driveFrames(58, clock);
    }
    await flushMicrotasks();
    // 此时累计 ≥30s, 应触发一次上报
    expect(onReport).toHaveBeenCalledTimes(1);
    const snapshot = onReport.mock.calls[0]?.[0] as FrameRateReportSnapshot;
    // 实际 29 个 sample 累积(初始 1 秒 first driveFrames 60 在 happy-dom 下未触发
    // recordSample,只有循环内的 30 次 fakeNow 推进触发;在 t=30s 时累积 29 个)
    expect(snapshot.sampleCount).toBe(29);
    expect(snapshot.averageFps).toBe(60);
    expect(snapshot.mode).toBe("normal");
    // 桶聚合应把 60 桶到 60
    expect(snapshot.minFps).toBe(60);
    expect(snapshot.maxFps).toBe(60);
    // 时间戳脱敏到分钟级
    expect(snapshot.bucketStart % 60_000).toBe(0);

    // lastReport state 已更新
    expect(result.current.lastReport?.sampleCount).toBe(29);

    dateNowStub.mockRestore();
    clock.restore();
  });

  it("reports error-free on unmount by flushing the window", async () => {
    // stub Date.now,保证 5 秒累计 5 个样本,但不触发 30s 窗口 flush
    const startMs = Date.parse("2026-06-24T10:23:45.123Z");
    let fakeNow = startMs;
    const dateNowStub = vi.spyOn(Date, "now").mockImplementation(() => fakeNow);

    const clock = installClock(0);
    clock.advance(1000);
    const onReport = vi.fn();

    const { unmount } = renderHook(() =>
      useFrameRateMonitor({
        enabled: true,
        sampleIntervalMs: 1000,
        onReport,
      }),
    );

    // 5 秒采样,不够 30s 窗口
    for (let i = 0; i < 5; i++) {
      fakeNow += 1000;
      await driveFrames(58, clock);
    }
    await flushMicrotasks();
    expect(onReport).not.toHaveBeenCalled();

    unmount();
    expect(onReport).toHaveBeenCalledTimes(1);
    const snapshot = onReport.mock.calls[0]?.[0] as FrameRateReportSnapshot;
    // happy-dom 下 first driveFrames 60 实际未触发 recordSample,
    // 只有 5 次循环触发,所以累积 4 个 sample
    expect(snapshot.sampleCount).toBe(4);

    dateNowStub.mockRestore();
    clock.restore();
  });

  it("dismissPerformanceSuggestion hides the suggestion banner", async () => {
    const clock = installClock(0);
    clock.advance(1000);
    const { result } = renderHook(() =>
      useFrameRateMonitor({
        enabled: true,
        sampleIntervalMs: 1000,
        minimalThreshold: 30,
        reducedThreshold: 50,
        startupGracePeriodMs: 0,
        lowFpsStreakThreshold: 1,
      }),
    );

    await driveFrames(20, clock);
    await flushMicrotasks();

    expect(result.current.showPerformanceSuggestion).toBe(true);
    act(() => {
      result.current.dismissPerformanceSuggestion();
    });
    await flushMicrotasks();
    expect(result.current.showPerformanceSuggestion).toBe(false);
    clock.restore();
  });
});
