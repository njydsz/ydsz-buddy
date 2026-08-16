//! # useCrashRecovery Hook 单元测试
//!
//! 覆盖目标：
//! - 初始状态：pendingCheckpoints 为空 / hasPendingRecovery = false
//! - 启动时自动调用 `checkpoint_list_pending` 加载
//! - resumeCheckpoint / cancelCheckpoint / inspectCheckpoint 触发对应 Tauri 命令
//! - 调用后从 pendingCheckpoints 中移除
//! - enabled=false 时不加载、不清理
//!
//! Tauri invoke 通过 vi.mock 拦截。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock readNativeApi 返回 null（hook 内 useTurnCheckpointMonitor 才用）
vi.mock("~/nativeApi", () => ({
  readNativeApi: () => null,
}));

// Mock isTauri = true，让 useEffect 中的守卫通过
vi.mock("~/env", () => ({
  isTauri: true,
  isDesktop: true,
  isElectron: false,
}));

import { useCrashRecovery } from "./useCrashRecovery";
import type { TurnCheckpoint } from "./useCrashRecovery";

const fakeCheckpoint: TurnCheckpoint = {
  threadId: "thread-1" as never,
  turnId: "turn-1" as never,
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:00:01.000Z",
  status: "running",
  summary: "running task",
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCrashRecovery", () => {
  it("初始状态：pendingCheckpoints 空 / hasPendingRecovery = false", async () => {
    const { result } = renderHook(() => useCrashRecovery());
    expect(result.current.pendingCheckpoints).toEqual([]);
    expect(result.current.hasPendingRecovery).toBe(false);
  });

  it("挂载时调用 checkpoint_list_pending 加载未完成任务", async () => {
    mockInvoke.mockResolvedValueOnce([fakeCheckpoint]);
    const { result } = renderHook(() => useCrashRecovery());
    await waitFor(() => {
      expect(result.current.pendingCheckpoints.length).toBe(1);
    });
    expect(result.current.hasPendingRecovery).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("checkpoint_list_pending");
  });

  it("enabled=false 不调用 Tauri", async () => {
    renderHook(() => useCrashRecovery({ enabled: false }));
    // 让所有 useEffect 跑完
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("resumeCheckpoint 调用 checkpoint_resume 并从列表移除", async () => {
    mockInvoke.mockResolvedValueOnce([fakeCheckpoint]);
    const { result } = renderHook(() => useCrashRecovery());
    await waitFor(() => {
      expect(result.current.pendingCheckpoints.length).toBe(1);
    });
    mockInvoke.mockClear();
    await act(async () => {
      await result.current.resumeCheckpoint(fakeCheckpoint);
    });
    expect(mockInvoke).toHaveBeenCalledWith("checkpoint_resume", {
      params: {
        threadId: fakeCheckpoint.threadId,
        turnId: fakeCheckpoint.turnId,
      },
    });
    expect(result.current.pendingCheckpoints.length).toBe(0);
  });

  it("cancelCheckpoint 调用 checkpoint_cancel 并从列表移除", async () => {
    mockInvoke.mockResolvedValueOnce([fakeCheckpoint]);
    const { result } = renderHook(() => useCrashRecovery());
    await waitFor(() => {
      expect(result.current.pendingCheckpoints.length).toBe(1);
    });
    mockInvoke.mockClear();
    await act(async () => {
      await result.current.cancelCheckpoint(fakeCheckpoint);
    });
    expect(mockInvoke).toHaveBeenCalledWith("checkpoint_cancel", {
      params: {
        threadId: fakeCheckpoint.threadId,
        turnId: fakeCheckpoint.turnId,
      },
    });
    expect(result.current.pendingCheckpoints.length).toBe(0);
  });

  it("inspectCheckpoint 调用 checkpoint_inspect 但不移除", async () => {
    mockInvoke.mockResolvedValueOnce([fakeCheckpoint]);
    const { result } = renderHook(() => useCrashRecovery());
    await waitFor(() => {
      expect(result.current.pendingCheckpoints.length).toBe(1);
    });
    mockInvoke.mockClear();
    await act(async () => {
      await result.current.inspectCheckpoint(fakeCheckpoint);
    });
    expect(mockInvoke).toHaveBeenCalledWith("checkpoint_inspect", {
      params: {
        threadId: fakeCheckpoint.threadId,
        turnId: fakeCheckpoint.turnId,
      },
    });
    expect(result.current.pendingCheckpoints.length).toBe(1);
  });

  it("cleanupOldCheckpoints 调用 checkpoint_cleanup_old 并 reload", async () => {
    mockInvoke
      .mockResolvedValueOnce([fakeCheckpoint]) // list_pending（挂载）
      .mockResolvedValueOnce([]) // cleanup_old
      .mockResolvedValueOnce([]); // list_pending（reload）
    const { result } = renderHook(() => useCrashRecovery({ autoCleanupDays: 7 }));
    await waitFor(() => {
      expect(result.current.pendingCheckpoints.length).toBe(1);
    });
    mockInvoke.mockClear();
    await act(async () => {
      await result.current.cleanupOldCheckpoints();
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "checkpoint_cleanup_old",
      expect.objectContaining({
        params: expect.objectContaining({ cutoffIso: expect.any(String) }),
      }),
    );
    expect(result.current.pendingCheckpoints.length).toBe(0);
  });

  it("checkpoint_list_pending 失败时静默不抛错", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useCrashRecovery());
    await waitFor(() => {
      // 即使加载失败，pendingCheckpoints 仍应为空数组
      expect(result.current.pendingCheckpoints).toEqual([]);
    });
    expect(result.current.hasPendingRecovery).toBe(false);
  });

  it("resumeCheckpoint 失败时 throw 但状态不更新", async () => {
    // 挂载时:1) list_pending 2) cleanup_old;resumeCheckpoint 时:3) checkpoint_resume
    mockInvoke
      .mockResolvedValueOnce([fakeCheckpoint]) // list_pending
      .mockResolvedValueOnce(undefined) // cleanup_old
      .mockRejectedValueOnce(new Error("resume failed")); // checkpoint_resume
    const { result } = renderHook(() => useCrashRecovery());
    await waitFor(() => {
      expect(result.current.pendingCheckpoints.length).toBe(1);
    });
    await act(async () => {
      await expect(result.current.resumeCheckpoint(fakeCheckpoint)).rejects.toThrow(
        "resume failed",
      );
    });
    // resume 失败：pendingCheckpoints 仍保留该项
    expect(result.current.pendingCheckpoints.length).toBe(1);
  });
});
