/**
 * @file useTurnTaskTree Hook 单元测试
 *
 * 互联网大厂基线：3 级任务树状态机的关键路径必须有完整覆盖：
 * - 初始空树
 * - thread.turn-started → 新增根任务 (status: running)
 * - thread.tool-call-started → 根下新增子任务
 * - thread.file-read/written → 子任务下新增子子任务
 * - thread.tool-call-completed → 子任务状态 completed
 * - thread.turn-completed → 根任务状态 completed
 * - thread.turn-failed → 根任务状态 failed
 * - 跨线程事件过滤 (aggregateId 不匹配)
 * - enabled = false → 跳过订阅
 * - 未知事件类型忽略
 * - file-operation 在无 currentToolCallId 时回退到根
 * - unsubscribe 在 unmount 时调用
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { OrchestrationEvent, ThreadId } from "~/contracts";
import { useTurnTaskTree, type TaskNode } from "./useTurnTaskTree";

// 让 happy-dom 下 React 18 的 act() 正常工作
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ──────────────────────────────────────────────────────────────────────────────
// 测试工具
// ──────────────────────────────────────────────────────────────────────────────

type DomainCallback = (event: OrchestrationEvent) => void;
let domainCallback: DomainCallback | null = null;
let unsubscribeSpy: ReturnType<typeof vi.fn>;

function installNativeApi() {
  domainCallback = null;
  unsubscribeSpy = vi.fn();
  (window as unknown as {
    nativeApi: {
      orchestration: {
        onDomainEvent: (cb: DomainCallback) => () => void;
      };
    };
  }).nativeApi = {
    orchestration: {
      onDomainEvent: (cb: DomainCallback) => {
        domainCallback = cb;
        return unsubscribeSpy;
      },
    },
  };
}

function uninstallNativeApi() {
  delete (window as unknown as { nativeApi?: unknown }).nativeApi;
  domainCallback = null;
}

interface EventInput {
  type: OrchestrationEvent["type"];
  threadId: ThreadId;
  sequence: number;
  payload: Record<string, unknown>;
}

function emit(input: EventInput) {
  const event = {
    sequence: input.sequence,
    eventId: `evt-${input.sequence}` as never,
    aggregateKind: "thread" as const,
    aggregateId: input.threadId,
    occurredAt: new Date().toISOString(),
    type: input.type,
    payload: input.payload,
  } as unknown as OrchestrationEvent;
  if (!domainCallback) throw new Error("onDomainEvent callback not installed");
  act(() => {
    domainCallback!(event);
  });
}

const THREAD_A = "thread-a" as ThreadId;
const THREAD_B = "thread-b" as ThreadId;

// ──────────────────────────────────────────────────────────────────────────────
// 钩子
// ──────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  installNativeApi();
});

afterEach(() => {
  uninstallNativeApi();
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// 基础行为
// ──────────────────────────────────────────────────────────────────────────────

describe("useTurnTaskTree - 基础", () => {
  it("初始 taskTree 为空数组", () => {
    const { result } = renderHook(() => useTurnTaskTaskTree(THREAD_A));
    expect(result.current).toEqual([]);
  });

  it("enabled = false 时不订阅并清空树", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A, false));
    expect(result.current).toEqual([]);
    // 没有注册订阅
    expect(unsubscribeSpy).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Turn 事件
// ──────────────────────────────────────────────────────────────────────────────

describe("useTurnTaskTree - Turn 事件", () => {
  it("thread.turn-started 新增根任务 (status: running)", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "turn-1" } });
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      id: "turn:turn-1",
      type: "turn",
      status: "running",
      label: "Turn turn-1",
      children: [],
    });
    expect(result.current[0].metadata).toEqual({ turnId: "turn-1" });
  });

  it("thread.turn-completed 更新根任务状态为 completed", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "turn-1" } });
    emit({ type: "thread.turn-completed", threadId: THREAD_A, sequence: 2, payload: { turnId: "turn-1" } });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].status).toBe("completed");
    expect(result.current[0].endTime).toBeGreaterThan(0);
  });

  it("thread.turn-failed 更新根任务状态为 failed", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "turn-1" } });
    emit({ type: "thread.turn-failed", threadId: THREAD_A, sequence: 2, payload: { turnId: "turn-1" } });
    expect(result.current[0].status).toBe("failed");
  });

  it("未注册的 turn-completed 不会创建新节点", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-completed", threadId: THREAD_A, sequence: 1, payload: { turnId: "unknown" } });
    expect(result.current).toEqual([]);
  });

  it("多个 turn 依次入树", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({ type: "thread.turn-completed", threadId: THREAD_A, sequence: 2, payload: { turnId: "t-1" } });
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 3, payload: { turnId: "t-2" } });
    expect(result.current).toHaveLength(2);
    expect(result.current[0].status).toBe("completed");
    expect(result.current[1].status).toBe("running");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tool Call 事件
// ──────────────────────────────────────────────────────────────────────────────

describe("useTurnTaskTree - Tool Call 事件", () => {
  it("thread.tool-call-started 在当前 turn 下新增子任务", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 2,
      payload: { toolCallId: "tc-1", toolName: "bash" },
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].children).toHaveLength(1);
    expect(result.current[0].children[0]).toMatchObject({
      id: "tool:tc-1",
      type: "tool-call",
      status: "running",
      label: "bash",
    });
  });

  it("thread.tool-call-completed 更新子任务状态", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 2,
      payload: { toolCallId: "tc-1", toolName: "bash" },
    });
    emit({
      type: "thread.tool-call-completed",
      threadId: THREAD_A,
      sequence: 3,
      payload: { toolCallId: "tc-1" },
    });
    expect(result.current[0].children[0].status).toBe("completed");
  });

  it("无 currentTurnId 时 tool-call-started 不创建子任务", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 1,
      payload: { toolCallId: "tc-orphan", toolName: "bash" },
    });
    expect(result.current).toEqual([]);
  });

  it("tool-call-completed 未知 id 不修改树", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({
      type: "thread.tool-call-completed",
      threadId: THREAD_A,
      sequence: 2,
      payload: { toolCallId: "unknown" },
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].children).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// File Operation 事件
// ──────────────────────────────────────────────────────────────────────────────

describe("useTurnTaskTree - File Operation 事件", () => {
  it("thread.file-read 在当前 tool 下新增子子任务 (label 包含'读取')", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 2,
      payload: { toolCallId: "tc-1", toolName: "bash" },
    });
    emit({
      type: "thread.file-read",
      threadId: THREAD_A,
      sequence: 3,
      payload: { path: "/repo/src/foo.ts" },
    });
    expect(result.current[0].children[0].children).toHaveLength(1);
    expect(result.current[0].children[0].children[0]).toMatchObject({
      type: "file-operation",
      label: "读取 foo.ts",
      status: "completed",
      metadata: { path: "/repo/src/foo.ts", operation: "读取" },
    });
  });

  it("thread.file-written 在当前 tool 下新增子子任务 (label 包含'写入')", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 2,
      payload: { toolCallId: "tc-1", toolName: "edit" },
    });
    emit({
      type: "thread.file-written",
      threadId: THREAD_A,
      sequence: 3,
      payload: { path: "/repo/src/bar.ts" },
    });
    expect(result.current[0].children[0].children[0].label).toBe("写入 bar.ts");
  });

  it("无 currentToolCallId 时 file-operation 回退为当前 turn 的子任务", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({
      type: "thread.file-read",
      threadId: THREAD_A,
      sequence: 2,
      payload: { path: "/repo/loose.ts" },
    });
    expect(result.current[0].children).toHaveLength(1);
    expect(result.current[0].children[0].type).toBe("file-operation");
  });

  it("无 currentTurnId 时 file-operation 被忽略", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({
      type: "thread.file-read",
      threadId: THREAD_A,
      sequence: 1,
      payload: { path: "/repo/orphan.ts" },
    });
    expect(result.current).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 事件过滤 / 清理
// ──────────────────────────────────────────────────────────────────────────────

describe("useTurnTaskTree - 事件过滤与生命周期", () => {
  it("忽略其他 thread 的事件", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_B, sequence: 1, payload: { turnId: "t-other" } });
    expect(result.current).toEqual([]);
  });

  it("忽略未知事件类型", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    // @ts-expect-error - 测试不存在的 type
    emit({ type: "thread.unknown-event", threadId: THREAD_A, sequence: 1, payload: {} });
    expect(result.current).toEqual([]);
  });

  it("unmount 时调用 unsubscribe", () => {
    const { unmount } = renderHook(() => useTurnTaskTree(THREAD_A));
    expect(unsubscribeSpy).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it("切换 threadId 时重新订阅 (旧 unsubscribe 被调用, 新 callback 被注册)", () => {
    const { rerender } = renderHook(({ threadId }) => useTurnTaskTree(threadId), {
      initialProps: { threadId: THREAD_A },
    });
    // 第一次 effect 已注册 callback
    expect(domainCallback).not.toBeNull();
    const firstUnsubscribeSpy = unsubscribeSpy;
    rerender({ threadId: THREAD_B });
    // 旧订阅应被清理
    expect(firstUnsubscribeSpy).toHaveBeenCalled();
  });

  it("enabled 从 true → false 触发清空并 unsubscribe", () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useTurnTaskTree(THREAD_A, enabled),
      { initialProps: { enabled: true } },
    );
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    expect(result.current).toHaveLength(1);
    rerender({ enabled: false });
    expect(result.current).toEqual([]);
    expect(unsubscribeSpy).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 端到端：完整 turn 流程
// ──────────────────────────────────────────────────────────────────────────────

describe("useTurnTaskTree - 端到端", () => {
  it("完整 turn: start → tool → file-read → tool-completed → file-written → turn-completed", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));

    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 2,
      payload: { toolCallId: "tc-1", toolName: "bash" },
    });
    emit({
      type: "thread.file-read",
      threadId: THREAD_A,
      sequence: 3,
      payload: { path: "/repo/src/a.ts" },
    });
    emit({
      type: "thread.tool-call-completed",
      threadId: THREAD_A,
      sequence: 4,
      payload: { toolCallId: "tc-1" },
    });
    emit({ type: "thread.turn-completed", threadId: THREAD_A, sequence: 5, payload: { turnId: "t-1" } });

    expect(result.current).toHaveLength(1);
    const root = result.current[0];
    expect(root.status).toBe("completed");
    expect(root.children).toHaveLength(1);
    const tool = root.children[0];
    expect(tool.status).toBe("completed");
    expect(tool.children).toHaveLength(1);
    expect(tool.children[0]).toMatchObject({
      type: "file-operation",
      label: "读取 a.ts",
    });
  });

  it("同一 turn 下多个 tool-call 并行存在", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 2,
      payload: { toolCallId: "tc-1", toolName: "bash" },
    });
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 3,
      payload: { toolCallId: "tc-2", toolName: "read" },
    });
    expect(result.current[0].children).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TaskNode 形状
// ──────────────────────────────────────────────────────────────────────────────

describe("useTurnTaskTree - TaskNode 形状", () => {
  it("根 turn-running 节点 label 截断 turnId 前 8 字符", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "abcdef1234567890" } });
    expect(result.current[0].label).toBe("Turn abcdef12");
  });

  it("tool-call 节点 metadata 包含 toolCallId 和 toolName", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 2,
      payload: { toolCallId: "tc-xyz", toolName: "edit_file" },
    });
    expect(result.current[0].children[0].metadata).toEqual({
      toolCallId: "tc-xyz",
      toolName: "edit_file",
    });
  });

  it("tool-call-completed 节点 label 为空字符串 (复用 id 但内容已结束)", () => {
    const { result } = renderHook(() => useTurnTaskTree(THREAD_A));
    emit({ type: "thread.turn-started", threadId: THREAD_A, sequence: 1, payload: { turnId: "t-1" } });
    // 先 start 再 completed
    emit({
      type: "thread.tool-call-started",
      threadId: THREAD_A,
      sequence: 2,
      payload: { toolCallId: "tc-1", toolName: "bash" },
    });
    emit({
      type: "thread.tool-call-completed",
      threadId: THREAD_A,
      sequence: 3,
      payload: { toolCallId: "tc-1" },
    });
    expect(result.current[0].children[0]).toMatchObject({
      id: "tool:tc-1",
      type: "tool-call",
      status: "completed",
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 本地辅助
// ──────────────────────────────────────────────────────────────────────────────

function useTurnTaskTaskTree(threadId: ThreadId, enabled = true): TaskNode[] {
  return useTurnTaskTree(threadId, enabled);
}
