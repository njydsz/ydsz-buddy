/**
 * @file ReviewDiffToolbar 单元测试
 *
 * 覆盖：
 * - 基础渲染：标题、文件数、按钮可见性、data-testid
 * - 接受 / 拒绝 / 清空 计数实时更新
 * - 全部接受 / 全部拒绝：对所有文件所有 hunks 正确标记
 * - Apply 按钮：accept > 0 才可点击；无 cwd / 无 patch 时禁用
 * - 边界：fileCount = 0 时全部接受/拒绝仍可见但 disabled
 */

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FileDiffMetadata } from "@pierre/diffs/react";
import {
  ReviewDiffToolbar,
  type HunkDecisions,
} from "./ReviewDiffToolbar";

// --- Mocks ------------------------------------------------------------------

const applyPatchMock = vi.fn();
const toastAddMock = vi.fn<(options: Record<string, unknown>) => string>();

vi.mock("../../nativeApi", () => ({
  readNativeApi: () => ({
    git: {
      applyPatch: applyPatchMock,
    },
  }),
}));

vi.mock("~/components/ui/toast", () => ({
  toastManager: {
    add: (options: Record<string, unknown>) => {
      const id = `toast-${toastAddMock.mock.calls.length + 1}`;
      toastAddMock(options);
      return id;
    },
  },
}));

vi.mock("~/lib/icons", () => ({
  CheckIcon: ({ className }: { className?: string }) => (
    <span data-testid="icon-check" className={className} />
  ),
  ChevronRightIcon: ({ className }: { className?: string }) => (
    <span data-testid="icon-chevron-right" className={className} />
  ),
  EyeIcon: ({ className }: { className?: string }) => (
    <span data-testid="icon-eye" className={className} />
  ),
  XIcon: ({ className }: { className?: string }) => (
    <span data-testid="icon-x" className={className} />
  ),
}));

vi.mock("~/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
    ...rest
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      {...rest}
    >
      {children}
    </button>
  ),
}));

// --- Fixtures ---------------------------------------------------------------

const FILE_KEY_A = "a:src/foo.ts";
const FILE_KEY_B = "b:src/bar.ts";

const fakeFileA: FileDiffMetadata = {
  cacheKey: FILE_KEY_A,
  name: "src/foo.ts",
  prevName: "src/foo.ts",
  hunks: [
    {
      additionStart: 1,
      additionCount: 2,
      deletionStart: 1,
      deletionCount: 1,
    } as unknown as FileDiffMetadata["hunks"][number],
    {
      additionStart: 10,
      additionCount: 3,
      deletionStart: 10,
      deletionCount: 0,
    } as unknown as FileDiffMetadata["hunks"][number],
  ],
} as unknown as FileDiffMetadata;

const fakeFileB: FileDiffMetadata = {
  cacheKey: FILE_KEY_B,
  name: "src/bar.ts",
  prevName: "src/bar.ts",
  hunks: [
    {
      additionStart: 5,
      additionCount: 1,
      deletionStart: 5,
      deletionCount: 0,
    } as unknown as FileDiffMetadata["hunks"][number],
  ],
} as unknown as FileDiffMetadata;

const RENDERABLE_FILES: FileDiffMetadata[] = [fakeFileA, fakeFileB];
const FILE_DIFF_BY_KEY: ReadonlyMap<string, FileDiffMetadata> = new Map([
  [FILE_KEY_A, fakeFileA],
  [FILE_KEY_B, fakeFileB],
]);

const SAMPLE_PATCH = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,1 +1,2 @@
+line added
`;

// --- Helpers ----------------------------------------------------------------

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderToolbar(propsOverride: Partial<React.ComponentProps<typeof ReviewDiffToolbar>> = {}) {
  let latestSet: HunkDecisions = new Map();
  const setAcceptedHunks = vi.fn((updater: React.SetStateAction<HunkDecisions>) => {
    latestSet = typeof updater === "function" ? updater(latestSet) : updater;
  });

  const utils = render(
    <QueryClientProvider client={makeQueryClient()}>
      <ReviewDiffToolbar
        activeReviewPatch={SAMPLE_PATCH}
        renderableFiles={RENDERABLE_FILES}
        fileDiffByKey={FILE_DIFF_BY_KEY}
        acceptedHunks={latestSet}
        setAcceptedHunks={setAcceptedHunks}
        activeCwd={"/tmp/proj"}
        {...propsOverride}
      />
    </QueryClientProvider>,
  );

  return { ...utils, latestSet: () => latestSet, setAcceptedHunks };
}

beforeEach(() => {
  applyPatchMock.mockReset();
  applyPatchMock.mockResolvedValue(undefined);
  toastAddMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// --- Tests ------------------------------------------------------------------

describe("ReviewDiffToolbar", () => {
  it("renders the review badge, file count and data-testid", () => {
    renderToolbar();

    expect(screen.getByTestId("review-diff-toolbar")).toBeTruthy();
    expect(screen.getByTestId("review-diff-toolbar-file-count").textContent).toBe(
      "2 个文件",
    );
    // code review badge
    expect(screen.getByText("代码审查")).toBeTruthy();
  });

  it("disables accept-all / reject-all / apply when no files are present", () => {
    renderToolbar({ renderableFiles: [] });

    const acceptAll = screen.getByTestId("review-diff-toolbar-accept-all") as HTMLButtonElement;
    const rejectAll = screen.getByTestId("review-diff-toolbar-reject-all") as HTMLButtonElement;
    const apply = screen.getByTestId("review-diff-toolbar-apply") as HTMLButtonElement;

    expect(acceptAll.disabled).toBe(true);
    expect(rejectAll.disabled).toBe(true);
    expect(apply.disabled).toBe(true);
  });

  it("marks every hunk as accept when 全部接受 is clicked", () => {
    const { setAcceptedHunks } = renderToolbar();

    fireEvent.click(screen.getByTestId("review-diff-toolbar-accept-all"));

    expect(setAcceptedHunks).toHaveBeenCalledTimes(1);
    // 模拟 React 行为：传入的 updater 收到 previous state
    const updater = setAcceptedHunks.mock.calls[0][0] as (
      prev: HunkDecisions,
    ) => HunkDecisions;
    const next = updater(new Map());
    expect(next.get(FILE_KEY_A)?.size).toBe(2);
    expect(next.get(FILE_KEY_B)?.size).toBe(1);
    expect(next.get(FILE_KEY_A)?.get(0)).toBe("accept");
    expect(next.get(FILE_KEY_A)?.get(1)).toBe("accept");
    expect(next.get(FILE_KEY_B)?.get(0)).toBe("accept");
  });

  it("marks every hunk as reject when 全部拒绝 is clicked", () => {
    const { setAcceptedHunks } = renderToolbar();

    fireEvent.click(screen.getByTestId("review-diff-toolbar-reject-all"));

    const updater = setAcceptedHunks.mock.calls[0][0] as (
      prev: HunkDecisions,
    ) => HunkDecisions;
    const next = updater(new Map());
    expect(next.get(FILE_KEY_A)?.get(0)).toBe("reject");
    expect(next.get(FILE_KEY_B)?.get(0)).toBe("reject");
  });

  it("clears the decision map when 清空 is clicked", () => {
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([[0, "accept"]])],
    ]);
    const { setAcceptedHunks } = renderToolbar({ acceptedHunks: decided });

    fireEvent.click(screen.getByTestId("review-diff-toolbar-clear"));

    // handleClear 直接调用 setAcceptedHunks(new Map())，不传 updater
    expect(setAcceptedHunks).toHaveBeenCalledWith(expect.any(Map));
    const value = setAcceptedHunks.mock.calls[0][0] as Map<unknown, unknown>;
    expect(value.size).toBe(0);
  });

  it("disables 清空 when no decisions yet", () => {
    renderToolbar();

    const clear = screen.getByTestId("review-diff-toolbar-clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
  });

  it("disables Apply when no accept decisions yet", () => {
    // 只标记 reject，apply 仍应禁用（只对 accept 计数）
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([[0, "reject"]])],
    ]);
    renderToolbar({ acceptedHunks: decided });

    const apply = screen.getByTestId("review-diff-toolbar-apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });

  it("enables Apply when at least one hunk is accept", () => {
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([[0, "accept"]])],
    ]);
    renderToolbar({ acceptedHunks: decided });

    const apply = screen.getByTestId("review-diff-toolbar-apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
  });

  it("shows the correct accept/reject counts", () => {
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([
        [0, "accept"],
        [1, "reject"],
      ])],
      [FILE_KEY_B, new Map([[0, "accept"]])],
    ]);
    renderToolbar({ acceptedHunks: decided });

    const stats = screen.getByTestId("review-diff-toolbar-decisions");
    // 文本应包含 +2 / -1
    const text = within(stats).getByText("+2");
    const text2 = within(stats).getByText("-1");
    expect(text).toBeTruthy();
    expect(text2).toBeTruthy();
  });

  it("renders fine with empty patch (no diff stats shown)", () => {
    renderToolbar({ activeReviewPatch: "" });

    expect(screen.getByTestId("review-diff-toolbar")).toBeTruthy();
    expect(screen.getByText("2 个文件")).toBeTruthy();
  });

  it("renders fine with no activeCwd (apply disabled)", () => {
    renderToolbar({ activeCwd: null });

    const apply = screen.getByTestId("review-diff-toolbar-apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });

  it("applies decisions count correctly with multiple files", () => {
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([
        [0, "accept"],
        [1, "accept"],
      ])],
      [FILE_KEY_B, new Map([[0, "reject"]])],
    ]);
    renderToolbar({ acceptedHunks: decided });

    const stats = screen.getByTestId("review-diff-toolbar-decisions");
    expect(stats.textContent).toContain("+2");
    expect(stats.textContent).toContain("-1");
  });

  it("renders progress bar with correct percent text", () => {
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([[0, "accept"]])],
    ]);
    renderToolbar({ acceptedHunks: decided });

    const progress = screen.getByTestId("review-diff-toolbar-progress");
    expect(progress.getAttribute("data-progress-percent")).toBe("33.3");
    expect(progress.getAttribute("data-is-complete")).toBe("false");
    expect(screen.getByTestId("review-diff-toolbar-progress-text").textContent).toBe(
      "1/3 hunks · 33.3%",
    );
  });

  it("marks progress as complete when all hunks decided", () => {
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([
        [0, "accept"],
        [1, "accept"],
      ])],
      [FILE_KEY_B, new Map([[0, "accept"]])],
    ]);
    renderToolbar({ acceptedHunks: decided });

    const progress = screen.getByTestId("review-diff-toolbar-progress");
    expect(progress.getAttribute("data-progress-percent")).toBe("100");
    expect(progress.getAttribute("data-is-complete")).toBe("true");
  });

  it("does not render progress bar when there are no hunks", () => {
    renderToolbar({ renderableFiles: [] });
    expect(screen.queryByTestId("review-diff-toolbar-progress")).toBeNull();
  });

  it("calls onJumpToNextUndecided with the next undecided hunk location", () => {
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([[0, "accept"]])],
    ]);
    const onJump = vi.fn();
    renderToolbar({ acceptedHunks: decided, onJumpToNextUndecided: onJump });

    fireEvent.click(screen.getByTestId("review-diff-toolbar-jump-next"));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0][0]).toEqual({
      fileKey: FILE_KEY_A,
      fileIndex: 0,
      hunkIndex: 1,
    });
  });

  it("skips entirely-decided files when jumping to next undecided", () => {
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([
        [0, "accept"],
        [1, "accept"],
      ])],
    ]);
    const onJump = vi.fn();
    renderToolbar({ acceptedHunks: decided, onJumpToNextUndecided: onJump });

    fireEvent.click(screen.getByTestId("review-diff-toolbar-jump-next"));
    expect(onJump.mock.calls[0][0]).toEqual({
      fileKey: FILE_KEY_B,
      fileIndex: 1,
      hunkIndex: 0,
    });
  });

  it("shows info toast and does not call onJumpToNextUndecided when all decided", () => {
    const decided: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([
        [0, "accept"],
        [1, "accept"],
      ])],
      [FILE_KEY_B, new Map([[0, "accept"]])],
    ]);
    const onJump = vi.fn();
    renderToolbar({
      acceptedHunks: decided,
      onJumpToNextUndecided: onJump,
    });

    // 验证 onJump 未被调用
    fireEvent.click(screen.getByTestId("review-diff-toolbar-jump-next"));
    expect(onJump).not.toHaveBeenCalled();
    // toastManager.add 通过 vi.mock 已替换为 toastAddMock,验证其被调用
    expect(toastAddMock).toHaveBeenCalled();
    const opts = toastAddMock.mock.calls[0][0] as { type?: string; title?: string };
    expect(opts.type).toBe("info");
    expect(opts.title).toBe("所有 hunk 都已决策");
  });
});
