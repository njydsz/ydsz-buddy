/**
 * @file messageRecall.test.ts
 * @description 消息撤回 Toast 工具的单元测试
 *
 * 验证：
 * 1. 默认 5 秒倒计时
 * 2. 自定义倒计时
 * 3. 预览文本截断
 * 4. 撤销按钮点击触发 onRevert
 * 5. onRevert 错误不会抛出
 * 6. 重复点击撤销按钮的安全处理
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// 必须先设置 React act 环境，再加载依赖 @testing-library/react 的 toast 内部
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ThreadId } from "~/contracts";
import {
  RECALL_TOAST_DURATION_MS,
  showMessageRecallToast,
} from "./messageRecall";

// 拦截 toastManager.add 以避免 base-ui 内部 hook 渲染报错
const addMock = vi.fn<(options: Record<string, unknown>) => string>();
const closeMock = vi.fn();

vi.mock("~/components/ui/toast", () => {
  return {
    toastManager: {
      add: (options: Record<string, unknown>) => {
        const id = `toast-${addMock.mock.calls.length + 1}`;
        addMock(options);
        return id;
      },
      close: (...args: unknown[]) => {
        closeMock(...args);
      },
    },
  };
});

describe("showMessageRecallToast", () => {
  beforeEach(() => {
    addMock.mockReset();
    closeMock.mockReset();
  });

  it("使用默认 5 秒倒计时并写入 ThreadToastData", () => {
    const onRevert = vi.fn();
    const id = showMessageRecallToast({
      threadId: ThreadId.makeUnsafe("thread-1"),
      onRevert,
    });
    expect(id).toBe("toast-1");
    expect(addMock).toHaveBeenCalledTimes(1);
    const options = addMock.mock.calls[0]?.[0] ?? {};
    expect(options.type).toBe("info");
    expect(options.title).toBe("已发送");
    expect(options.description).toBe("5 秒内可点击撤销");
    const data = (options as { data?: Record<string, unknown> }).data ?? {};
    expect(data.threadId).toBe("thread-1");
    expect(data.allowCrossThreadVisibility).toBe(false);
    expect(data.dismissAfterVisibleMs).toBe(RECALL_TOAST_DURATION_MS);
    expect(data.dismissAfterVisibleMs).toBe(5_000);
  });

  it("支持自定义倒计时时长", () => {
    showMessageRecallToast({
      threadId: ThreadId.makeUnsafe("thread-2"),
      onRevert: () => undefined,
      durationMs: 1500,
    });
    const options = addMock.mock.calls[0]?.[0] ?? {};
    const data = (options as { data?: Record<string, unknown> }).data ?? {};
    expect(data.dismissAfterVisibleMs).toBe(1500);
  });

  it("对超过 60 字符的预览做截断并附加省略号", () => {
    const longPreview = "a".repeat(80);
    showMessageRecallToast({
      threadId: ThreadId.makeUnsafe("thread-3"),
      onRevert: () => undefined,
      preview: longPreview,
    });
    const options = addMock.mock.calls[0]?.[0] ?? {};
    const description = (options as { description?: string }).description;
    expect(description?.length).toBe(61);
    expect(description?.endsWith("…")).toBe(true);
  });

  it("短预览原样显示在 description 中", () => {
    showMessageRecallToast({
      threadId: ThreadId.makeUnsafe("thread-4"),
      onRevert: () => undefined,
      preview: "你好世界",
    });
    const options = addMock.mock.calls[0]?.[0] ?? {};
    expect((options as { description?: string }).description).toBe("你好世界");
  });

  it("空预览时回退到 5 秒内可点击撤销", () => {
    showMessageRecallToast({
      threadId: ThreadId.makeUnsafe("thread-5"),
      onRevert: () => undefined,
      preview: "   ",
    });
    const options = addMock.mock.calls[0]?.[0] ?? {};
    expect((options as { description?: string }).description).toBe("5 秒内可点击撤销");
  });

  it("点击撤销按钮时调用 onRevert 并先关闭 toast", () => {
    const onRevert = vi.fn();
    const id = showMessageRecallToast({
      threadId: ThreadId.makeUnsafe("thread-6"),
      onRevert,
    });
    const options = addMock.mock.calls[0]?.[0] ?? {};
    const actionProps = (options as { actionProps?: { onClick: () => void } }).actionProps;
    expect(actionProps).toBeDefined();
    actionProps?.onClick();
    expect(closeMock).toHaveBeenCalledWith(id);
    expect(onRevert).toHaveBeenCalledTimes(1);
  });

  it("onRevert 返回 Promise 时的失败会被静默吞掉", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    showMessageRecallToast({
      threadId: ThreadId.makeUnsafe("thread-7"),
      onRevert: () => Promise.reject(new Error("revert failed")),
    });
    const options = addMock.mock.calls[0]?.[0] ?? {};
    const actionProps = (options as { actionProps?: { onClick: () => void } }).actionProps;
    actionProps?.onClick();
    // 等待 microtask 队列
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("toastManager.close 抛错时不阻塞 onRevert", () => {
    closeMock.mockImplementationOnce(() => {
      throw new Error("already closed");
    });
    const onRevert = vi.fn();
    showMessageRecallToast({
      threadId: ThreadId.makeUnsafe("thread-8"),
      onRevert,
    });
    const options = addMock.mock.calls[0]?.[0] ?? {};
    const actionProps = (options as { actionProps?: { onClick: () => void } }).actionProps;
    expect(() => actionProps?.onClick()).not.toThrow();
    expect(onRevert).toHaveBeenCalledTimes(1);
  });
});
