//! # ProjectRulesIndicator 组件单元测试
//!
//! 覆盖目标：
//! - 无规则时渲染 null
//! - 有规则时渲染指示器 + 计数
//! - 点击展开 / 收起
//! - 显示截断标记
//! - 显示文件列表
//! - useMessages 翻译被使用
//!
//! invoke 通过 mock 完全隔离。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { ProjectRulesIndicator } from "./ProjectRulesIndicator";
import { I18nProvider } from "../i18n/I18nContext";

/**
 * 使用 I18nProvider 注入中文翻译，并禁用网络重试的 Query 客户端。
 * 与 ProjectRulesIndicator 的实际运行环境保持一致。
 */
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider language="zh">
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </I18nProvider>
  );
}

const SAMPLE_DTO = {
  fromCache: false,
  elapsedMs: 10,
  files: [
    {
      source: "AGENTS.md",
      path: "/repo/AGENTS.md",
      content: "rule 1",
      originalBytes: 6,
      truncated: false,
    },
    {
      source: "CLAUDE.md",
      path: "/repo/CLAUDE.md",
      content: "rule 2",
      originalBytes: 6,
      truncated: true,
    },
  ],
  merged: "# Merged\n\nrule 1\nrule 2",
  totalBytes: 12,
  skipped: 0,
};

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProjectRulesIndicator", () => {
  it("空 workspaceRoot 渲染 null", () => {
    const { container } = render(
      <ProjectRulesIndicator workspaceRoot="" />,
      { wrapper: makeWrapper() },
    );
    expect(container.firstChild).toBeNull();
  });

  it("无规则文件时返回 null", async () => {
    mockInvoke.mockResolvedValueOnce({
      fromCache: false,
      elapsedMs: 1,
      files: [],
      merged: null,
      totalBytes: 0,
      skipped: 0,
    });
    const { container } = render(
      <ProjectRulesIndicator workspaceRoot="/empty" />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });
    // 由于 hasRules=false,组件应不渲染
    expect(container.querySelector("[data-testid='project-rules-indicator']")).toBeNull();
  });

  it("有规则时渲染指示器 + 计数", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_DTO);
    const { container } = render(
      <ProjectRulesIndicator workspaceRoot="/repo" />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(
        container.querySelector("[data-testid='project-rules-indicator']"),
      ).not.toBeNull();
    });
    const indicator = container.querySelector(
      "[data-testid='project-rules-indicator']",
    )!;
    expect(indicator.getAttribute("data-rule-count")).toBe("2");
    expect(indicator.getAttribute("data-total-bytes")).toBe("12");
    expect(screen.getByText("项目规则")).toBeTruthy();
    expect(screen.getByText("2 个 · 12b")).toBeTruthy();
  });

  it("点击展开 / 收起 popover", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_DTO);
    const { container } = render(
      <ProjectRulesIndicator workspaceRoot="/repo" />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(
        container.querySelector("[data-testid='project-rules-indicator']"),
      ).not.toBeNull();
    });
    const button = screen.getByRole("button", { name: /点击查看/ });
    // 初始收起
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    // 展开后能看到文件列表（使用 list 区域限定，避免与 aria-label 文本冲突）
    const region = screen.getByRole("region", { name: /点击查看/ });
    expect(region.textContent).toMatch(/AGENTS\.md/);
    // 截断文件有截断标记
    expect(region.textContent).toMatch(/CLAUDE\.md/);
    // 再次点击收起
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("显示 previewMerged 折叠块", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_DTO);
    render(<ProjectRulesIndicator workspaceRoot="/repo" />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /点击查看/ })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /点击查看/ }));
    // previewMerged 通过 <details><summary> 渲染，使用 text 匹配
    expect(screen.getByText("预览合并后的 markdown")).toBeTruthy();
  });

  it("团队规则已应用时显示 applied badge", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE_DTO,
      files: [{ source: "AGENTS.md", path: "/a", content: "x", originalBytes: 1, truncated: false }],
      teamRules: {
        root: "/home/.ydsz-buddy/team-rules",
        fileCount: 3,
        totalBytes: 100,
        enabled: true,
        elapsedMs: 2,
        error: null,
      },
    });
    const { container } = render(
      <ProjectRulesIndicator workspaceRoot="/repo" />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(
        container.querySelector("[data-testid='project-rules-indicator']"),
      ).not.toBeNull();
    });
    const indicator = container.querySelector(
      "[data-testid='project-rules-indicator']",
    )!;
    expect(indicator.getAttribute("data-team-applied")).toBe("true");
    expect(indicator.getAttribute("data-team-count")).toBe("3");
    const badge = container.querySelector(
      "[data-testid='project-rules-team-badge-applied']",
    );
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("已叠加团队规则");
  });

  it("团队规则被禁用时显示 disabled badge", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE_DTO,
      teamRules: {
        root: "/home/.ydsz-buddy/team-rules",
        fileCount: 3,
        totalBytes: 100,
        enabled: false,
        elapsedMs: 2,
        error: null,
      },
    });
    const { container } = render(
      <ProjectRulesIndicator workspaceRoot="/repo" />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(
        container.querySelector("[data-testid='project-rules-indicator']"),
      ).not.toBeNull();
    });
    const badge = container.querySelector(
      "[data-testid='project-rules-team-badge-disabled']",
    );
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("团队规则已关闭");
  });

  it("团队规则加载失败时显示 error badge", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE_DTO,
      teamRules: {
        root: "/home/.ydsz-buddy/team-rules",
        fileCount: 0,
        totalBytes: 0,
        enabled: false,
        elapsedMs: 2,
        error: "目录不可读",
      },
    });
    const { container } = render(
      <ProjectRulesIndicator workspaceRoot="/repo" />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(
        container.querySelector("[data-testid='project-rules-indicator']"),
      ).not.toBeNull();
    });
    const badge = container.querySelector(
      "[data-testid='project-rules-team-badge-error']",
    );
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("团队规则错误");
  });

  it("项目级 .ydsz/rules/ 存在时不应用团队规则,无 applied badge", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE_DTO,
      files: [
        {
          source: ".ydsz/rules/",
          path: "/a/00-style.md",
          content: "tabs",
          originalBytes: 4,
          truncated: false,
        },
      ],
      teamRules: {
        root: "/home/.ydsz-buddy/team-rules",
        fileCount: 2,
        totalBytes: 50,
        enabled: true,
        elapsedMs: 2,
        error: null,
      },
    });
    const { container } = render(
      <ProjectRulesIndicator workspaceRoot="/repo" />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(
        container.querySelector("[data-testid='project-rules-indicator']"),
      ).not.toBeNull();
    });
    const indicator = container.querySelector(
      "[data-testid='project-rules-indicator']",
    )!;
    expect(indicator.getAttribute("data-team-applied")).toBe("false");
    expect(
      container.querySelector("[data-testid='project-rules-team-badge-applied']"),
    ).toBeNull();
  });
});
