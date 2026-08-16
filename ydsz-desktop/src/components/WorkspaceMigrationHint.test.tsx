/**
 * @file WorkspaceMigrationHint 组件测试
 *
 * 覆盖:
 * - 没有未选目录的 workspace → 渲染 null
 * - 有未选目录的 workspace → 渲染 status banner
 * - count=1 / count>1 文案区分
 * - dismiss 按钮点击后调 dismissMigrationHint
 * - role=status / aria-live=polite
 * - dismiss 持久化后不再渲染
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { useWorkspaceStore } from "~/workspaceStore";
import { WorkspaceMigrationHint } from "./WorkspaceMigrationHint";
import { I18nProvider } from "~/i18n/I18nContext";

function makeWrapper() {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider language="zh">{children}</I18nProvider>
  );
}

function resetStore() {
  localStorage.clear();
  useWorkspaceStore.setState({
    homeDir: null,
    workspacePages: [],
    activeWorkspaceId: null,
    migrationHintDismissed: false,
  });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

describe("WorkspaceMigrationHint - 渲染条件", () => {
  it("无 workspace → 渲染 null", () => {
    const { container } = render(<WorkspaceMigrationHint />, { wrapper: makeWrapper() });
    expect(container.firstChild).toBeNull();
  });

  it("所有 workspace 都有 cwd → 渲染 null", () => {
    act(() => {
      const id = useWorkspaceStore.getState().createWorkspace();
      useWorkspaceStore.getState().setWorkspaceCwd(id, "/repos/x");
    });
    const { container } = render(<WorkspaceMigrationHint />, { wrapper: makeWrapper() });
    expect(container.firstChild).toBeNull();
  });

  it("dismissed=true → 渲染 null", () => {
    act(() => {
      useWorkspaceStore.getState().createWorkspace();
      useWorkspaceStore.getState().dismissMigrationHint();
    });
    const { container } = render(<WorkspaceMigrationHint />, { wrapper: makeWrapper() });
    expect(container.firstChild).toBeNull();
  });

  it("有 workspace 没有 cwd + 未 dismiss → 渲染 banner", () => {
    act(() => {
      useWorkspaceStore.getState().createWorkspace();
    });
    render(<WorkspaceMigrationHint />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("workspace-migration-hint")).toBeTruthy();
  });
});

describe("WorkspaceMigrationHint - 文案", () => {
  it("1 个未选 → 显示「1 个工作区」文案", () => {
    act(() => {
      useWorkspaceStore.getState().createWorkspace();
    });
    render(<WorkspaceMigrationHint />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("workspace-migration-hint").textContent).toContain("1 个工作区");
  });

  it("多个未选 → 显示「N 个工作区」文案", () => {
    act(() => {
      useWorkspaceStore.getState().createWorkspace();
      useWorkspaceStore.getState().createWorkspace();
      useWorkspaceStore.getState().createWorkspace();
    });
    render(<WorkspaceMigrationHint />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("workspace-migration-hint").textContent).toContain("3 个工作区");
  });
});

describe("WorkspaceMigrationHint - dismiss", () => {
  it("点击 dismiss 调 dismissMigrationHint 并隐藏", async () => {
    act(() => {
      useWorkspaceStore.getState().createWorkspace();
    });
    render(<WorkspaceMigrationHint />, { wrapper: makeWrapper() });
    const button = screen.getByTestId("workspace-migration-hint-dismiss");
    expect(useWorkspaceStore.getState().migrationHintDismissed).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(useWorkspaceStore.getState().migrationHintDismissed).toBe(true);
    await waitFor(() => {
      expect(screen.queryByTestId("workspace-migration-hint")).toBeNull();
    });
  });
});

describe("WorkspaceMigrationHint - a11y", () => {
  it("role=status + aria-live=polite", () => {
    act(() => {
      useWorkspaceStore.getState().createWorkspace();
    });
    render(<WorkspaceMigrationHint />, { wrapper: makeWrapper() });
    const banner = screen.getByTestId("workspace-migration-hint");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
  });
});
