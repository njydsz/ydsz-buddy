/**
 * @file WorkspaceModePicker 组件测试
 * @description 覆盖 Trae 风格工作区选择器
 *
 * - 默认 local 模式 + placeholder 提示「选择文件夹」
 * - 已选 cwd 时显示路径尾段 + 全路径
 * - mode 切换(local ↔ worktree)调 setWorkspaceMode
 * - cloud 模式禁用(aria-disabled + 不切换)
 * - 调起 picker 后 isPicking=true;期间 button disabled
 * - picker 抛错时显示 role=alert 错误
 * - a11y: aria-label / role=alert / data-testid
 * - onBeforePick 钩子在 picker 调用前触发
 *
 * 策略:mock useWorkspaceStore + useWorkspaceFolderPicker,绕过 base-ui popover 内部动画,
 * 通过 fireEvent.click + waitFor 触发菜单项 click。
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const { mockState, pickerMock } = vi.hoisted(() => {
  const state = {
    workspacePages: [] as Array<{
      id: string;
      title: string;
      layoutPresetId: string;
      cwd: string | null;
      mode: "local" | "worktree" | "cloud";
      createdAt: string;
      updatedAt: string;
    }>,
    activeWorkspaceId: null as string | null,
    homeDir: null as string | null,
    setWorkspaceMode: vi.fn(),
    setWorkspaceCwd: vi.fn(),
  };
  const picker = {
    pickWorkspaceFolder: vi.fn(async () => null as string | null),
  };
  return { mockState: state, pickerMock: picker };
});

vi.mock("~/workspaceStore", () => ({
  useWorkspaceStore: (selector: (state: unknown) => unknown) =>
    selector({
      workspacePages: mockState.workspacePages,
      activeWorkspaceId: mockState.activeWorkspaceId,
      homeDir: mockState.homeDir,
      setWorkspaceMode: mockState.setWorkspaceMode,
      setWorkspaceCwd: mockState.setWorkspaceCwd,
    }),
}));

vi.mock("~/hooks/useWorkspaceFolderPicker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/hooks/useWorkspaceFolderPicker")>();
  return {
    ...actual,
    useWorkspaceFolderPicker: () => ({
      pickWorkspaceFolder: pickerMock.pickWorkspaceFolder,
    }),
  };
});

import { WorkspaceModePicker } from "./WorkspaceModePicker";
import { I18nProvider } from "~/i18n/I18nContext";

function makeWrapper() {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider language="zh">{children}</I18nProvider>
  );
}

function makeWorkspace(id = "ws-1") {
  const now = new Date().toISOString();
  return {
    id,
    title: "Workspace 1",
    layoutPresetId: "default",
    cwd: null,
    mode: "local" as const,
    createdAt: now,
    updatedAt: now,
  };
}

function setupPickerMock() {
  pickerMock.pickWorkspaceFolder.mockReset();
  pickerMock.pickWorkspaceFolder.mockResolvedValue(null);
}

beforeEach(() => {
  mockState.workspacePages = [makeWorkspace()];
  mockState.activeWorkspaceId = "ws-1";
  mockState.homeDir = null;
  mockState.setWorkspaceMode.mockReset();
  mockState.setWorkspaceCwd.mockReset();
  setupPickerMock();
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// 1. 默认渲染
// =============================================================================

describe("WorkspaceModePicker - 默认渲染", () => {
  it("渲染模式 trigger + 文件夹选择器", () => {
    const { container } = render(
      <WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />,
      { wrapper: makeWrapper() },
    );
    expect(container.querySelector("[data-testid='workspace-mode-trigger']")).toBeTruthy();
    expect(container.querySelector("[data-testid='workspace-folder-picker']")).toBeTruthy();
  });

  it("未选目录时显示 placeholder「选择文件夹」", () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const button = screen.getByTestId("workspace-folder-picker");
    expect(button.textContent).toContain("选择文件夹");
  });

  it("trigger 显示当前 mode 标签「本地」", () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const trigger = screen.getByTestId("workspace-mode-trigger");
    expect(trigger.textContent).toContain("本地");
  });

  it("mode='worktree' 时 trigger 显示「工作树」", () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="worktree" />, {
      wrapper: makeWrapper(),
    });
    const trigger = screen.getByTestId("workspace-mode-trigger");
    expect(trigger.textContent).toContain("工作树");
  });
});

// =============================================================================
// 2. cwd 展示
// =============================================================================

describe("WorkspaceModePicker - cwd 展示", () => {
  it("已选 cwd 时,按钮显示路径尾段(文件夹名)", () => {
    render(
      <WorkspaceModePicker workspaceId="ws-1" cwd="/repos/my-app" mode="local" />,
      { wrapper: makeWrapper() },
    );
    const button = screen.getByTestId("workspace-folder-picker");
    expect(button.textContent).toContain("my-app");
  });

  it("已选 cwd 时,下方展示完整路径", () => {
    render(
      <WorkspaceModePicker workspaceId="ws-1" cwd="/repos/my-app" mode="local" />,
      { wrapper: makeWrapper() },
    );
    const pathHint = screen.getByTestId("workspace-folder-path");
    expect(pathHint.textContent).toBe("/repos/my-app");
  });

  it("Windows 风格路径截取最后一段", () => {
    render(
      <WorkspaceModePicker workspaceId="ws-1" cwd="C:\\Users\\me\\repos\\app" mode="local" />,
      { wrapper: makeWrapper() },
    );
    const button = screen.getByTestId("workspace-folder-picker");
    expect(button.textContent).toContain("app");
  });

  it("未选 cwd 时不展示路径 hint", () => {
    const { container } = render(
      <WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />,
      { wrapper: makeWrapper() },
    );
    expect(container.querySelector("[data-testid='workspace-folder-path']")).toBeNull();
  });

  it("按钮 title 属性(hover tooltip)使用完整路径", () => {
    render(
      <WorkspaceModePicker workspaceId="ws-1" cwd="/repos/my-app" mode="local" />,
      { wrapper: makeWrapper() },
    );
    const button = screen.getByTestId("workspace-folder-picker");
    expect(button.getAttribute("title")).toBe("/repos/my-app");
  });
});

// =============================================================================
// 3. Mode 切换
// =============================================================================

describe("WorkspaceModePicker - mode 切换", () => {
  it("点开 trigger 后能看到 local / worktree / cloud 三个选项", async () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const trigger = screen.getByTestId("workspace-mode-trigger");
    await act(async () => {
      fireEvent.click(trigger);
    });
    await waitFor(() => {
      expect(screen.getByTestId("workspace-mode-option-local")).toBeTruthy();
    });
    expect(screen.getByTestId("workspace-mode-option-worktree")).toBeTruthy();
    expect(screen.getByTestId("workspace-mode-option-cloud")).toBeTruthy();
  });

  it("点击 worktree 选项调 setWorkspaceMode", async () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const trigger = screen.getByTestId("workspace-mode-trigger");
    await act(async () => {
      fireEvent.click(trigger);
    });
    const worktreeOption = await screen.findByTestId("workspace-mode-option-worktree");
    await act(async () => {
      fireEvent.click(worktreeOption);
    });
    expect(mockState.setWorkspaceMode).toHaveBeenCalledWith("ws-1", "worktree");
  });

  it("cloud 选项 disabled(aria-disabled=true)", async () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const trigger = screen.getByTestId("workspace-mode-trigger");
    await act(async () => {
      fireEvent.click(trigger);
    });
    const cloudOption = await screen.findByTestId("workspace-mode-option-cloud");
    expect(cloudOption.getAttribute("aria-disabled")).toBe("true");
    expect(cloudOption.hasAttribute("disabled")).toBe(true);
  });

  it("cloud 选项点击不调 setWorkspaceMode", async () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const trigger = screen.getByTestId("workspace-mode-trigger");
    await act(async () => {
      fireEvent.click(trigger);
    });
    const cloudOption = await screen.findByTestId("workspace-mode-option-cloud");
    await act(async () => {
      fireEvent.click(cloudOption);
    });
    expect(mockState.setWorkspaceMode).not.toHaveBeenCalled();
  });

  it("cloud 选项显示「敬请期待」提示", async () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const trigger = screen.getByTestId("workspace-mode-trigger");
    await act(async () => {
      fireEvent.click(trigger);
    });
    await waitFor(() => {
      expect(screen.getByText("敬请期待")).toBeTruthy();
    });
  });

  it("当前 mode 选项显示 aria-checked=true", async () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const trigger = screen.getByTestId("workspace-mode-trigger");
    await act(async () => {
      fireEvent.click(trigger);
    });
    const localOption = await screen.findByTestId("workspace-mode-option-local");
    expect(localOption.getAttribute("aria-checked")).toBe("true");
  });
});

// =============================================================================
// 4. Picker 调起 + isPicking 状态
// =============================================================================

describe("WorkspaceModePicker - 文件夹选择", () => {
  it("点击文件夹选择按钮调 pickWorkspaceFolder 并传入 workspaceId + mode", async () => {
    pickerMock.pickWorkspaceFolder.mockResolvedValueOnce("/picked/dir");
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const button = screen.getByTestId("workspace-folder-picker");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(pickerMock.pickWorkspaceFolder).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      mode: "local",
    });
  });

  it("picker 返回 null 时不显示错误", async () => {
    pickerMock.pickWorkspaceFolder.mockResolvedValueOnce(null);
    const { container } = render(
      <WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />,
      { wrapper: makeWrapper() },
    );
    const button = screen.getByTestId("workspace-folder-picker");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("picker 抛错时显示 role=alert 错误信息", async () => {
    pickerMock.pickWorkspaceFolder.mockRejectedValueOnce(new Error("disk full"));
    const { container } = render(
      <WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />,
      { wrapper: makeWrapper() },
    );
    const button = screen.getByTestId("workspace-folder-picker");
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => {
      const alert = container.querySelector("[role='alert']");
      expect(alert).toBeTruthy();
      expect(alert?.textContent).toContain("disk full");
    });
  });

  it("picker 抛非 Error 实例时回落到 i18n 默认错误信息", async () => {
    pickerMock.pickWorkspaceFolder.mockRejectedValueOnce("oops");
    const { container } = render(
      <WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />,
      { wrapper: makeWrapper() },
    );
    const button = screen.getByTestId("workspace-folder-picker");
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => {
      const alert = container.querySelector("[role='alert']");
      expect(alert).toBeTruthy();
      expect(alert?.textContent).toContain("无法打开文件夹选择器");
    });
  });

  it("第二次点击(已在 picking 中)不会再次调 picker", async () => {
    // 让 picker 永远 pending,模拟 picking 状态
    let resolvePicker: ((value: string | null) => void) | null = null;
    pickerMock.pickWorkspaceFolder.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolvePicker = resolve;
        }),
    );
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const button = screen.getByTestId("workspace-folder-picker");
    await act(async () => {
      fireEvent.click(button);
    });
    // picking 中再次点击 → 应当被忽略
    await act(async () => {
      fireEvent.click(button);
    });
    expect(pickerMock.pickWorkspaceFolder).toHaveBeenCalledTimes(1);
    // resolve 让 picking 退出,避免测试残留
    await act(async () => {
      resolvePicker?.(null);
    });
  });

  it("onBeforePick 钩子在 picker 调用前触发", async () => {
    const onBeforePick = vi.fn();
    pickerMock.pickWorkspaceFolder.mockResolvedValueOnce("/picked/dir");
    render(
      <WorkspaceModePicker
        workspaceId="ws-1"
        cwd={null}
        mode="local"
        onBeforePick={onBeforePick}
      />,
      { wrapper: makeWrapper() },
    );
    const button = screen.getByTestId("workspace-folder-picker");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onBeforePick).toHaveBeenCalledTimes(1);
    // 顺序:beforePick 早于 pickWorkspaceFolder
    const beforeOrder = onBeforePick.mock.invocationCallOrder[0]!;
    const pickerOrder = pickerMock.pickWorkspaceFolder.mock.invocationCallOrder[0]!;
    expect(beforeOrder).toBeLessThan(pickerOrder);
  });
});

// =============================================================================
// 5. a11y
// =============================================================================

describe("WorkspaceModePicker - a11y", () => {
  it("trigger 有 aria-label 对应到 modeLabel", () => {
    render(<WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />, {
      wrapper: makeWrapper(),
    });
    const trigger = screen.getByTestId("workspace-mode-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("工作区模式");
  });

  it("文件夹选择按钮 aria-label 区分「选择文件夹 / 更改文件夹」", () => {
    const { rerender } = render(
      <WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />,
      { wrapper: makeWrapper() },
    );
    const buttonBefore = screen.getByTestId("workspace-folder-picker");
    expect(buttonBefore.getAttribute("aria-label")).toBe("选择文件夹");

    rerender(
      <I18nProvider language="zh">
        <WorkspaceModePicker workspaceId="ws-1" cwd="/repos/app" mode="local" />
      </I18nProvider>,
    );
    const buttonAfter = screen.getByTestId("workspace-folder-picker");
    expect(buttonAfter.getAttribute("aria-label")).toBe("更改文件夹");
  });

  it("错误提示使用 role=alert", async () => {
    pickerMock.pickWorkspaceFolder.mockRejectedValueOnce(new Error("boom"));
    const { container } = render(
      <WorkspaceModePicker workspaceId="ws-1" cwd={null} mode="local" />,
      { wrapper: makeWrapper() },
    );
    const button = screen.getByTestId("workspace-folder-picker");
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => {
      expect(container.querySelector("[role='alert']")).toBeTruthy();
    });
  });
});
