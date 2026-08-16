/**
 * @file RollbackDrawer 组件单元测试
 *
 * 覆盖目标：
 * - open=false 时不渲染主要内容
 * - open=true 时正确显示标题 / 摘要 / 警告
 * - 加载 diff 时显示 loading
 * - diff 加载成功后展示文件列表 + 行数
 * - diff 加载失败时展示错误
 * - 切换 show diff 按钮可展开 / 收起
 * - 确认按钮触发 onConfirm
 * - 取消按钮触发 onOpenChange(false)
 * - isReverting=true 时按钮 disabled
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThreadId } from "@ydsz-buddy/contracts";
import { RollbackDrawer } from "./RollbackDrawer";

// =============================================================================
// nativeApi / i18n mock
// =============================================================================

const getFullThreadDiffMock = vi.fn();

vi.mock("~/nativeApi", () => ({
  readNativeApi: () => ({
    orchestration: {
      getFullThreadDiff: getFullThreadDiffMock,
    },
  }),
}));

vi.mock("~/i18n", () => ({
  useMessages: () => ({
    chat: {
      rollback: {
        drawerTitle: (turnCount: number) => `回滚到检查点 #${turnCount}`,
        drawerDescription: "此操作将丢弃该线程中更新的消息和 turn 差异。",
        turns: "将丢弃的 Turn",
        files: "变更文件",
        lines: "行数 +/−",
        filesHeading: "将被回滚的文件",
        moreFiles: (extra: number) => `还有 ${extra} 个文件未显示`,
        showDiff: "显示 diff",
        hideDiff: "收起 diff",
        loadingDiff: "正在加载 diff 预览…",
        warning: (turnCount: number) =>
          `此操作不可撤销。检查点 #${turnCount} 之后的所有消息和 turn 差异将被永久删除。`,
        cancel: "取消",
        confirm: "回滚线程",
        reverting: "回滚中…",
        apiUnavailable: "Native API 不可用，无法预览 diff",
      },
    },
  }),
}));

const THREAD_ID = ThreadId.makeUnsafe("thread-1");

const SAMPLE_DIFF = [
  "diff --git a/src/foo.ts b/src/foo.ts",
  "index 1234567..89abcde 100644",
  "--- a/src/foo.ts",
  "+++ b/src/foo.ts",
  "@@ -1,3 +1,4 @@",
  " line 1",
  "-old line",
  "+new line",
  "+added line",
  "diff --git a/src/bar.ts b/src/bar.ts",
  "index aaa..bbb 100644",
  "--- a/src/bar.ts",
  "+++ b/src/bar.ts",
  "@@ -10,2 +10,1 @@",
  "-removed a",
  " kept b",
].join("\n");

beforeEach(() => {
  getFullThreadDiffMock.mockReset();
  document.body.innerHTML = "";
});

describe("RollbackDrawer", () => {
  it("open=false 时抽屉不显示", () => {
    render(
      <RollbackDrawer
        open={false}
        onOpenChange={vi.fn()}
        threadId={THREAD_ID}
        turnCount={5}
        onConfirm={vi.fn()}
      />,
    );
    // Sheet 内部会渲染到 portal，但是因为 Root 不打开所以不会显示面板
    expect(screen.queryByTestId("rollback-drawer")).toBeNull();
  });

  it("open=true 时展示标题 / 摘要 / 警告", async () => {
    getFullThreadDiffMock.mockResolvedValue({ diff: SAMPLE_DIFF });

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={vi.fn()}
        threadId={THREAD_ID}
        turnCount={3}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("rollback-drawer")).toBeDefined();
    });
    expect(screen.getByTestId("rollback-drawer-title").textContent).toContain("#3");
    expect(screen.getByTestId("rollback-stat-turns").textContent).toContain("3");
    expect(screen.getByTestId("rollback-warning").textContent).toContain("不可撤销");
  });

  it("加载 diff 时展示 loading 状态", () => {
    getFullThreadDiffMock.mockReturnValue(new Promise(() => {}));

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={vi.fn()}
        threadId={THREAD_ID}
        turnCount={2}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId("rollback-loading")).toBeDefined();
    expect(screen.getByTestId("rollback-loading").textContent).toContain("正在加载");
  });

  it("diff 加载成功时显示文件列表 + 行数 +/−", async () => {
    getFullThreadDiffMock.mockResolvedValue({ diff: SAMPLE_DIFF });

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={vi.fn()}
        threadId={THREAD_ID}
        turnCount={2}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("rollback-loading")).toBeNull();
    });

    // 解析 SAMPLE_DIFF 应当得到 2 个文件：
    //   - src/foo.ts: +2 / -1 (added line + new line 为 2 个 +, old line 为 1 个 -)
    //   - src/bar.ts: +0 / -1 (removed a 为 1 个 -)
    expect(screen.getByTestId("rollback-file-list")).toBeDefined();
    const items = screen.getAllByTestId("rollback-file-item");
    expect(items.length).toBe(2);
    expect(items[0]?.getAttribute("data-file-path")).toBe("src/foo.ts");
    expect(items[1]?.getAttribute("data-file-path")).toBe("src/bar.ts");

    // lines 总计: +2 / -2 (foo.ts +2/-1 + bar.ts +0/-1)
    expect(screen.getByTestId("rollback-stat-lines").textContent).toContain("+2");
    expect(screen.getByTestId("rollback-stat-lines").textContent).toContain("-2");
  });

  it("diff 加载失败且无 fallback 时展示错误", async () => {
    getFullThreadDiffMock.mockRejectedValue(new Error("RPC failed"));

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={vi.fn()}
        threadId={THREAD_ID}
        turnCount={1}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("rollback-error")).toBeDefined();
    });
    expect(screen.getByTestId("rollback-error").textContent).toContain("RPC failed");
  });

  it("点击 'show diff' 按钮展开完整 diff", async () => {
    getFullThreadDiffMock.mockResolvedValue({ diff: SAMPLE_DIFF });

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={vi.fn()}
        threadId={THREAD_ID}
        turnCount={2}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("rollback-diff-toggle")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("rollback-diff-toggle"));
    expect(screen.getByTestId("rollback-diff-toggle").textContent).toContain("收起");
  });

  it("点击确认按钮触发 onConfirm，触发成功后 onOpenChange(false)", async () => {
    getFullThreadDiffMock.mockResolvedValue({ diff: SAMPLE_DIFF });
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={onOpenChange}
        threadId={THREAD_ID}
        turnCount={2}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("rollback-loading")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("rollback-confirm"));
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("onConfirm 抛错时不关闭抽屉并显示错误", async () => {
    getFullThreadDiffMock.mockResolvedValue({ diff: SAMPLE_DIFF });
    const onConfirm = vi.fn().mockRejectedValue(new Error("Revert failed"));
    const onOpenChange = vi.fn();

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={onOpenChange}
        threadId={THREAD_ID}
        turnCount={2}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("rollback-loading")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("rollback-confirm"));
    await waitFor(() => {
      expect(screen.getByTestId("rollback-confirm-error")).toBeDefined();
    });
    expect(screen.getByTestId("rollback-confirm-error").textContent).toContain("Revert failed");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("isReverting=true 时确认按钮显示回滚中文案且被禁用", async () => {
    getFullThreadDiffMock.mockResolvedValue({ diff: SAMPLE_DIFF });
    const onConfirm = vi.fn();

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={vi.fn()}
        threadId={THREAD_ID}
        turnCount={2}
        onConfirm={onConfirm}
        isReverting={true}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("rollback-loading")).toBeNull();
    });

    const confirmButton = screen.getByTestId("rollback-confirm") as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    expect(confirmButton.textContent).toContain("回滚中");
  });

  it("turnCount=0 时摘要 turns 显示 0", async () => {
    getFullThreadDiffMock.mockResolvedValue({ diff: "" });

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={vi.fn()}
        threadId={THREAD_ID}
        turnCount={0}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("rollback-loading")).toBeNull();
    });
    expect(screen.getByTestId("rollback-stat-turns").textContent).toContain("0");
  });

  it("diff 文件数超过 maxFiles 时显示 moreFiles 提示", async () => {
    const largeDiff = Array.from({ length: 12 })
      .map((_, i) =>
        [
          `diff --git a/src/file${i}.ts b/src/file${i}.ts`,
          "--- a/src/foo.ts",
          "+++ b/src/foo.ts",
          "+line",
        ].join("\n"),
      )
      .join("\n");
    getFullThreadDiffMock.mockResolvedValue({ diff: largeDiff });

    render(
      <RollbackDrawer
        open={true}
        onOpenChange={vi.fn()}
        threadId={THREAD_ID}
        turnCount={1}
        onConfirm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("rollback-loading")).toBeNull();
    });
    // maxFiles 默认 8，应展示 8 - 0 (截断后剩余) = 实际显示的项目数
    const items = screen.getAllByTestId("rollback-file-item");
    expect(items.length).toBe(8);
    // totalFiles = 12, displayed = 8 → 4 more
    expect(screen.getByTestId("rollback-file-list").textContent).toContain("还有 4 个文件未显示");
  });
});
