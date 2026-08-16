/**
 * @file useDraftAutoSaveStatus.test.ts
 *
 * 覆盖：
 * - 空内容 → idle
 * - 有内容 → saving → saved
 * - 线程切换 → 重置
 * - ageMs 随时间增长
 * - idleAfterMs 后 → 回落到 idle
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadId } from "~/contracts";
import { useDraftAutoSaveStatus } from "./useDraftAutoSaveStatus";

const TID_A = ThreadId.makeUnsafe("thread-A");
const TID_B = ThreadId.makeUnsafe("thread-B");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDraftAutoSaveStatus", () => {
  it("returns idle when threadId is null", () => {
    const { result } = renderHook(() =>
      useDraftAutoSaveStatus({ threadId: null, prompt: "hello" }),
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("returns idle when prompt is empty", () => {
    const { result } = renderHook(() =>
      useDraftAutoSaveStatus({ threadId: TID_A, prompt: "" }),
    );
    expect(result.current.status).toBe("idle");
  });

  it("transitions saving → saved after debounce window", () => {
    const { result, rerender } = renderHook(
      ({ prompt }) =>
        useDraftAutoSaveStatus({ threadId: TID_A, prompt, debounceMs: 1_000 }),
      { initialProps: { prompt: "hi" } },
    );

    // 立即：saving
    expect(result.current.status).toBe("saving");
    expect(result.current.lastSavedAt).toBeNull();

    // 1s 后：saved
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.lastSavedAt).toBeTypeOf("number");

    rerender({ prompt: "hi again" });
    // 重新进入节流窗口：saving
    expect(result.current.status).toBe("saving");
  });

  it("resets when switching to a different thread", () => {
    const { result, rerender } = renderHook(
      ({ threadId }: { threadId: ReturnType<typeof ThreadId.makeUnsafe> }) =>
        useDraftAutoSaveStatus({ threadId, prompt: "hello" }),
      { initialProps: { threadId: TID_A } },
    );
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(result.current.status).toBe("saved");

    rerender({ threadId: TID_B });
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("returns idle when lastSavedAt is null regardless of prompt", () => {
    const { result } = renderHook(() =>
      useDraftAutoSaveStatus({ threadId: TID_A, prompt: null }),
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("ageMs grows over time after saved", () => {
    const { result } = renderHook(() =>
      useDraftAutoSaveStatus({ threadId: TID_A, prompt: "hello", debounceMs: 500 }),
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const firstAge = result.current.ageMs;
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    // 因为 setNow 每 1s 触发一次，ageMs 应当随 setInterval 增加
    expect(result.current.ageMs).toBeGreaterThan(firstAge);
  });

  it("falls back to idle after idleAfterMs", () => {
    const { result } = renderHook(() =>
      useDraftAutoSaveStatus({
        threadId: TID_A,
        prompt: "hello",
        debounceMs: 500,
        idleAfterMs: 5_000,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(500); // → saved
    });
    expect(result.current.status).toBe("saved");
    act(() => {
      vi.advanceTimersByTime(10_000); // 超过 idleAfterMs
    });
    expect(result.current.status).toBe("idle");
  });
});
