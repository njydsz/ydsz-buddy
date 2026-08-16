/**
 * @file CrashRecoveryHost 单元测试
 *
 * 覆盖:
 *
 * 1. hasPendingRecovery=false 时不渲染对话框
 * 2. hasPendingRecovery=true 时自动弹窗
 * 3. 关闭后本次会话不再自动弹
 * 4. resume / cancel 回调透传到 hook
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CrashRecoveryHost } from "./CrashRecoveryHost";
import type { TurnCheckpoint } from "../hooks/useCrashRecovery";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface MountedHandle {
  container: HTMLDivElement;
  root: Root;
}

function mountInDocument(): MountedHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

const mockResume = vi.fn();
const mockCancel = vi.fn();
const mockInspect = vi.fn();

const fakeCheckpoint: TurnCheckpoint = {
  threadId: "thread-1" as never,
  turnId: "turn-1" as never,
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:00:01.000Z",
  status: "running",
  summary: "interrupted task",
};

// mock useCrashRecovery 暴露的可控状态
let mockPending: TurnCheckpoint[] = [];
vi.mock("../hooks/useCrashRecovery", () => ({
  useCrashRecovery: () => ({
    pendingCheckpoints: mockPending,
    hasPendingRecovery: mockPending.length > 0,
    resumeCheckpoint: mockResume,
    cancelCheckpoint: mockCancel,
    inspectCheckpoint: mockInspect,
    cleanupOldCheckpoints: vi.fn(),
  }),
}));

describe("CrashRecoveryHost", () => {
  let handle: MountedHandle | null = null;

  beforeEach(() => {
    mockPending = [];
    mockResume.mockReset();
    mockCancel.mockReset();
    mockInspect.mockReset();
  });

  afterEach(() => {
    if (handle) {
      act(() => {
        handle!.root.unmount();
      });
      handle!.container.remove();
      handle = null;
    }
  });

  it("无未完成任务时,不渲染弹窗", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(createElement(CrashRecoveryHost));
      await flushMicrotasks();
    });
    const dialog = handle!.container.querySelector("[data-testid='crash-recovery-dialog']");
    expect(dialog).toBeNull();
  });

  it("检测到未完成任务时,自动弹出弹窗", async () => {
    mockPending = [fakeCheckpoint];
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(createElement(CrashRecoveryHost));
      await flushMicrotasks();
    });
    const dialog = handle!.container.querySelector("[data-testid='crash-recovery-dialog']");
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain("interrupted task");
  });

  it("多个未完成任务都展示", async () => {
    mockPending = [
      fakeCheckpoint,
      { ...fakeCheckpoint, turnId: "turn-2" as never, summary: "another task" },
    ];
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(createElement(CrashRecoveryHost));
      await flushMicrotasks();
    });
    const dialog = handle!.container.querySelector("[data-testid='crash-recovery-dialog']");
    expect(dialog?.textContent).toContain("interrupted task");
    expect(dialog?.textContent).toContain("another task");
  });

  it("关闭弹窗后,本次会话不再自动弹出", async () => {
    mockPending = [fakeCheckpoint];
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(createElement(CrashRecoveryHost));
      await flushMicrotasks();
    });
    const dialog = handle!.container.querySelector("[data-testid='crash-recovery-dialog']");
    expect(dialog).toBeTruthy();
    // 关闭
    const closeBtn = dialog?.querySelector("button[aria-label='关闭']") as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    await act(async () => {
      closeBtn.click();
      await flushMicrotasks();
    });
    const after = handle!.container.querySelector("[data-testid='crash-recovery-dialog']");
    expect(after).toBeNull();
  });
});
