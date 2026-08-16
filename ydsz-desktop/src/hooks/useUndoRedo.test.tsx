/**
 * @file useUndoRedo 单元测试
 *
 * 覆盖：
 * - 记录用户消息：undoStack 累积 / redoStack 清空 / maxHistory 上限
 * - 撤销：canUndo 状态 / 调用 deleteMessage / 同时删除 AI 回复 / redoStack 推入
 * - 重做：canRedo 状态 / 调用 sendTurn / redoStack 弹出 / undoStack 推回
 * - 清空历史：两个栈都清空
 * - 快捷键：Cmd+Z 撤销 / Cmd+Shift+Z 重做 / Cmd+Y 重做
 * - 边界：空栈时不执行 / API 不存在时不执行 / threadId 为 null 不执行
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MessageId, ThreadId } from "~/contracts";
import { useUndoRedo, type UseUndoRedoResult } from "./useUndoRedo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================================================
// nativeApi mock
// =============================================================================

const deleteMessageMock = vi.fn(async () => undefined);
const sendTurnMock = vi.fn(async () => undefined);

const mockApi = {
  threads: {
    deleteMessage: deleteMessageMock,
    sendTurn: sendTurnMock,
  },
};

vi.mock("~/nativeApi", () => ({
  readNativeApi: () => mockApi,
}));

function resetMocks() {
  deleteMessageMock.mockClear();
  sendTurnMock.mockClear();
  deleteMessageMock.mockImplementation(async () => undefined);
  sendTurnMock.mockImplementation(async () => undefined);
}

// =============================================================================
// hook 挂载工具
// =============================================================================

interface HookHandle {
  result: UseUndoRedoResult;
  unmount: () => void;
  /** 等待 React 状态更新 flush */
  flush: () => Promise<void>;
}

function setupHook(
  threadId: ThreadId | null,
  options?: { maxHistory?: number },
): HookHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let captured: UseUndoRedoResult | null = null;
  const handle: HookHandle = {
    get result() {
      if (!captured) throw new Error("hook not yet rendered");
      return captured;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
    flush: async () => {
      // 给 React 一次 micro-task 时间让 setState 推入的事件循环执行
      await act(async () => {
        await Promise.resolve();
      });
    },
  };
  function Probe() {
    captured = useUndoRedo({
      threadId,
      ...(options?.maxHistory !== undefined ? { maxHistory: options.maxHistory } : {}),
    });
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  return handle;
}

/** 在 act 中执行异步操作并等待 state flush */
async function runAsync<T>(fn: () => Promise<T> | T): Promise<T> {
  return await act(async () => {
    return await fn();
  });
}

// =============================================================================
// 1. 基础状态
// =============================================================================

describe("useUndoRedo - 基础状态", () => {
  beforeEach(() => resetMocks());
  afterEach(() => resetMocks());

  it("初始状态：canUndo=false, canRedo=false", () => {
    const handle = setupHook("thread-1" as ThreadId);
    expect(handle.result.canUndo).toBe(false);
    expect(handle.result.canRedo).toBe(false);
    handle.unmount();
  });

  it("记录消息后 canUndo=true", () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });
    expect(handle.result.canUndo).toBe(true);
    expect(handle.result.canRedo).toBe(false);
    handle.unmount();
  });
});

// =============================================================================
// 2. recordUserMessage
// =============================================================================

describe("useUndoRedo - 记录用户消息", () => {
  beforeEach(() => resetMocks());
  afterEach(() => resetMocks());

  it("多次记录后 canUndo 仍为 true", () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "first");
      handle.result.recordUserMessage("m2" as MessageId, "second");
      handle.result.recordUserMessage("m3" as MessageId, "third");
    });
    expect(handle.result.canUndo).toBe(true);
    handle.unmount();
  });

  it("新操作清空 redoStack", async () => {
    const handle = setupHook("thread-1" as ThreadId);

    // 记录 2 条
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "first");
      handle.result.recordUserMessage("m2" as MessageId, "second");
    });

    // 撤销 1 次 → canRedo=true
    await runAsync(() => handle.result.undo());
    expect(handle.result.canRedo).toBe(true);
    expect(handle.result.canUndo).toBe(true);

    // 新操作清空 redo
    act(() => {
      handle.result.recordUserMessage("m3" as MessageId, "new");
    });
    expect(handle.result.canRedo).toBe(false);
    expect(handle.result.canUndo).toBe(true);
    handle.unmount();
  });

  it("maxHistory 限制历史数量", async () => {
    const handle = setupHook("thread-1" as ThreadId, { maxHistory: 3 });

    act(() => {
      for (let i = 0; i < 5; i++) {
        handle.result.recordUserMessage(`m${i}` as MessageId, `msg ${i}`);
      }
    });

    // 撤销栈最多保留 3 条
    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenCalledTimes(1);
    expect(deleteMessageMock).toHaveBeenLastCalledWith(
      "thread-1" as ThreadId,
      "m4" as MessageId,
    );

    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenCalledTimes(2);
    expect(deleteMessageMock).toHaveBeenLastCalledWith(
      "thread-1" as ThreadId,
      "m3" as MessageId,
    );

    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenCalledTimes(3);
    expect(deleteMessageMock).toHaveBeenLastCalledWith(
      "thread-1" as ThreadId,
      "m2" as MessageId,
    );

    // 第 4 次撤销无操作（栈已空，只剩 m1 在 stack 顶部时应可撤销，但 maxHistory=3 实际是 m2/m3/m4）
    // 等等：3 条记录是 m2/m3/m4（最早的被截断）
    // 所以撤销 3 次后栈为空，第 4 次撤销应无操作
    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenCalledTimes(3);
    handle.unmount();
  });

  it("maxHistory 默认 50", async () => {
    const handle = setupHook("thread-1" as ThreadId);

    act(() => {
      for (let i = 0; i < 60; i++) {
        handle.result.recordUserMessage(`m${i}` as MessageId, `msg ${i}`);
      }
    });

    // 撤销 50 次（栈最多 50 条）
    for (let i = 0; i < 50; i++) {
      await runAsync(() => handle.result.undo());
    }
    expect(deleteMessageMock).toHaveBeenCalledTimes(50);
    // 第 51 次撤销无操作
    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenCalledTimes(50);
    handle.unmount();
  });
});

// =============================================================================
// 3. undo
// =============================================================================

describe("useUndoRedo - 撤销", () => {
  beforeEach(() => resetMocks());
  afterEach(() => resetMocks());

  it("撤销时调用 deleteMessage", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenCalledWith(
      "thread-1" as ThreadId,
      "m1" as MessageId,
    );
    handle.unmount();
  });

  it("撤销时同时删除对应的 AI 回复", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello", "m2" as MessageId);
    });

    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenCalledTimes(2);
    expect(deleteMessageMock).toHaveBeenNthCalledWith(
      1,
      "thread-1" as ThreadId,
      "m1" as MessageId,
    );
    expect(deleteMessageMock).toHaveBeenNthCalledWith(
      2,
      "thread-1" as ThreadId,
      "m2" as MessageId,
    );
    handle.unmount();
  });

  it("撤销后 canUndo=false（栈已空）", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(() => handle.result.undo());
    expect(handle.result.canUndo).toBe(false);
    handle.unmount();
  });

  it("撤销后 canRedo=true", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(() => handle.result.undo());
    expect(handle.result.canRedo).toBe(true);
    handle.unmount();
  });

  it("空栈时撤销不调用 API", async () => {
    const handle = setupHook("thread-1" as ThreadId);

    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).not.toHaveBeenCalled();
    handle.unmount();
  });

  it("threadId=null 时撤销不调用 API", async () => {
    const handle = setupHook(null);

    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).not.toHaveBeenCalled();
    handle.unmount();
  });

  it("多次撤销按 LIFO 顺序删除", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "first");
      handle.result.recordUserMessage("m2" as MessageId, "second");
      handle.result.recordUserMessage("m3" as MessageId, "third");
    });

    // 撤销顺序：m3 → m2 → m1
    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenLastCalledWith(
      "thread-1" as ThreadId,
      "m3" as MessageId,
    );

    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenLastCalledWith(
      "thread-1" as ThreadId,
      "m2" as MessageId,
    );

    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenLastCalledWith(
      "thread-1" as ThreadId,
      "m1" as MessageId,
    );
    handle.unmount();
  });
});

// =============================================================================
// 4. redo
// =============================================================================

describe("useUndoRedo - 重做", () => {
  beforeEach(() => resetMocks());
  afterEach(() => resetMocks());

  it("重做时调用 sendTurn 重新发送", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello world");
    });

    await runAsync(() => handle.result.undo());
    sendTurnMock.mockClear();

    await runAsync(() => handle.result.redo());
    expect(sendTurnMock).toHaveBeenCalledWith({
      threadId: "thread-1" as ThreadId,
      content: "hello world",
    });
    handle.unmount();
  });

  it("重做后 canRedo=false（栈已空）", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(() => handle.result.undo());
    expect(handle.result.canRedo).toBe(true);

    await runAsync(() => handle.result.redo());
    expect(handle.result.canRedo).toBe(false);
    handle.unmount();
  });

  it("重做后 canUndo=true", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(() => handle.result.undo());
    expect(handle.result.canUndo).toBe(false);

    await runAsync(() => handle.result.redo());
    expect(handle.result.canUndo).toBe(true);
    handle.unmount();
  });

  it("空 redoStack 时重做不调用 API", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(() => handle.result.redo());
    expect(sendTurnMock).not.toHaveBeenCalled();
    handle.unmount();
  });

  it("重做顺序：redoStack 是 FIFO（首次撤销的最先重做）", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "first");
      handle.result.recordUserMessage("m2" as MessageId, "second");
      handle.result.recordUserMessage("m3" as MessageId, "third");
    });

    await runAsync(() => handle.result.undo());
    await runAsync(() => handle.result.undo());
    await runAsync(() => handle.result.undo());
    // 实际实现：undo 用 unshift 推入 redoStack,redo 取 redoStack[0],
    // 所以 redo 顺序为 m1 → m2 → m3(按撤销的相反顺序)
    sendTurnMock.mockClear();
    await runAsync(() => handle.result.redo());
    expect(sendTurnMock).toHaveBeenLastCalledWith({
      threadId: "thread-1" as ThreadId,
      content: "first",
    });

    await runAsync(() => handle.result.redo());
    expect(sendTurnMock).toHaveBeenLastCalledWith({
      threadId: "thread-1" as ThreadId,
      content: "second",
    });

    await runAsync(() => handle.result.redo());
    expect(sendTurnMock).toHaveBeenLastCalledWith({
      threadId: "thread-1" as ThreadId,
      content: "third",
    });
    handle.unmount();
  });
});

// =============================================================================
// 5. clearHistory
// =============================================================================

describe("useUndoRedo - 清空历史", () => {
  beforeEach(() => resetMocks());
  afterEach(() => resetMocks());

  it("清空后 canUndo=false, canRedo=false", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
      handle.result.recordUserMessage("m2" as MessageId, "world");
    });

    await runAsync(() => handle.result.undo());
    expect(handle.result.canRedo).toBe(true);

    act(() => {
      handle.result.clearHistory();
    });
    expect(handle.result.canUndo).toBe(false);
    expect(handle.result.canRedo).toBe(false);
    handle.unmount();
  });
});

// =============================================================================
// 6. 键盘快捷键
// =============================================================================

describe("useUndoRedo - 键盘快捷键", () => {
  beforeEach(() => resetMocks());
  afterEach(() => resetMocks());

  function fireKey(opts: Partial<KeyboardEventInit>) {
    const event = new KeyboardEvent("keydown", { bubbles: true, ...opts });
    window.dispatchEvent(event);
  }

  it("Cmd+Z 触发 undo", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(async () => {
      fireKey({ key: "z", metaKey: true });
      // 给事件处理一些时间
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(deleteMessageMock).toHaveBeenCalled();
    handle.unmount();
  });

  it("Cmd+Shift+Z 触发 redo", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(() => handle.result.undo());
    sendTurnMock.mockClear();

    await runAsync(async () => {
      fireKey({ key: "z", metaKey: true, shiftKey: true });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(sendTurnMock).toHaveBeenCalled();
    handle.unmount();
  });

  it("Cmd+Y 触发 redo", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(() => handle.result.undo());
    sendTurnMock.mockClear();

    await runAsync(async () => {
      fireKey({ key: "y", metaKey: true });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(sendTurnMock).toHaveBeenCalled();
    handle.unmount();
  });

  it("Ctrl+Z 在非 Mac 系统触发 undo", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(async () => {
      fireKey({ key: "z", ctrlKey: true });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(deleteMessageMock).toHaveBeenCalled();
    handle.unmount();
  });

  it("纯 Z 键不触发 undo（缺少数控键）", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    await runAsync(async () => {
      fireKey({ key: "z" });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(deleteMessageMock).not.toHaveBeenCalled();
    handle.unmount();
  });
});

// =============================================================================
// 7. 集成场景
// =============================================================================

describe("useUndoRedo - 集成场景", () => {
  beforeEach(() => resetMocks());
  afterEach(() => resetMocks());

  it("记录 → 撤销 → 重做 → 再撤销 的完整循环", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "first", "m2" as MessageId);
    });

    // 撤销
    await runAsync(() => handle.result.undo());
    expect(deleteMessageMock).toHaveBeenCalledTimes(2);
    expect(handle.result.canUndo).toBe(false);
    expect(handle.result.canRedo).toBe(true);

    // 重做
    await runAsync(() => handle.result.redo());
    expect(sendTurnMock).toHaveBeenCalledWith({
      threadId: "thread-1" as ThreadId,
      content: "first",
    });
    expect(handle.result.canUndo).toBe(true);
    expect(handle.result.canRedo).toBe(false);

    // 再次撤销
    await runAsync(() => handle.result.undo());
    expect(handle.result.canUndo).toBe(false);
    expect(handle.result.canRedo).toBe(true);
    handle.unmount();
  });

  it("多消息的撤销/重做分支", async () => {
    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "first");
      handle.result.recordUserMessage("m2" as MessageId, "second");
      handle.result.recordUserMessage("m3" as MessageId, "third");
    });

    // 撤销 m3
    await runAsync(() => handle.result.undo());
    // 撤销 m2
    await runAsync(() => handle.result.undo());
    // 此时 undoStack: [m1], redoStack: [m3, m2]
    expect(handle.result.canUndo).toBe(true);
    expect(handle.result.canRedo).toBe(true);

    // 新操作清空 redoStack
    act(() => {
      handle.result.recordUserMessage("m4" as MessageId, "branch");
    });
    expect(handle.result.canRedo).toBe(false);
    handle.unmount();
  });

  it("undo API 失败时不影响后续操作", async () => {
    // 第一次撤销失败
    deleteMessageMock.mockImplementationOnce(async () => {
      throw new Error("API error");
    });

    const handle = setupHook("thread-1" as ThreadId);
    act(() => {
      handle.result.recordUserMessage("m1" as MessageId, "hello");
    });

    // 第一次撤销失败
    await runAsync(() => handle.result.undo());
    // canUndo 应仍为 true（操作失败，栈未修改）
    expect(handle.result.canUndo).toBe(true);

    // 再次撤销成功
    await runAsync(() => handle.result.undo());
    expect(handle.result.canUndo).toBe(false);
    handle.unmount();
  });
});
