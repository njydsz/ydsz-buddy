//! # useProjectRules Hook 单元测试
//!
//! 覆盖目标：
//! - 空 workspaceRoot 时不触发请求
//! - 正常加载返回 merged + files + summary
//! - 失败时静默降级返回空规则
//! - merged 字段在没有规则文件时为 null
//! - hasRules 在不同场景下正确
//!
//! invoke 通过 mock 完全隔离。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  reloadProjectRules,
  useProjectRules,
  type ProjectRulesDto,
} from "./useProjectRules";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const SAMPLE_DTO: ProjectRulesDto = {
  fromCache: false,
  elapsedMs: 12,
  files: [
    {
      source: "AGENTS.md",
      path: "/repo/AGENTS.md",
      content: "rule 1\n",
      originalBytes: 7,
      truncated: false,
    },
    {
      source: "CLAUDE.md",
      path: "/repo/CLAUDE.md",
      content: "rule 2\n",
      originalBytes: 7,
      truncated: false,
    },
  ],
  merged: "# Project Rules\n\n## AGENTS.md\n\nrule 1\n\n## CLAUDE.md\n\nrule 2\n",
  totalBytes: 14,
  skipped: 0,
  teamRules: {
    root: "/home/.ydsz-buddy/team-rules",
    fileCount: 2,
    totalBytes: 50,
    enabled: true,
    teamName: "Platform",
    remoteUrl: null,
    elapsedMs: 3,
    error: null,
  },
};

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useProjectRules", () => {
  it("空 workspaceRoot 时不触发请求", async () => {
    const { result } = renderHook(() => useProjectRules({ workspaceRoot: "" }), {
      wrapper: makeWrapper(),
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.files).toEqual([]);
    expect(result.current.merged).toBeNull();
    expect(result.current.hasRules).toBe(false);
  });

  it("null workspaceRoot 时不触发请求", () => {
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: null }),
      { wrapper: makeWrapper() },
    );
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.hasRules).toBe(false);
  });

  it("enabled=false 时不触发请求", () => {
    const { result } = renderHook(
      () =>
        useProjectRules({ workspaceRoot: "/repo", enabled: false }),
      { wrapper: makeWrapper() },
    );
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.hasRules).toBe(false);
  });

  it("正常加载返回 files + merged + summary", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_DTO);
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: "/repo" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true);
    });
    expect(result.current.files).toHaveLength(2);
    expect(result.current.merged).toContain("rule 1");
    expect(result.current.merged).toContain("rule 2");
    expect(result.current.hasRules).toBe(true);
    expect(result.current.totalBytes).toBe(14);
    expect(result.current.fromCache).toBe(false);
    expect(result.current.elapsedMs).toBe(12);
    expect(result.current.summary).toContain("AGENTS.md");
    expect(result.current.summary).toContain("CLAUDE.md");
  });

  it("无规则文件时 merged 为 null, summary 显示提示", async () => {
    mockInvoke.mockResolvedValueOnce({
      fromCache: false,
      elapsedMs: 1,
      files: [],
      merged: null,
      totalBytes: 0,
      skipped: 0,
    });
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: "/empty" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true);
    });
    expect(result.current.merged).toBeNull();
    expect(result.current.files).toEqual([]);
    expect(result.current.hasRules).toBe(false);
    expect(result.current.summary).toBe("未发现项目规则");
  });

  it("后端失败时返回空规则,不抛出", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("IPC down"));
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: "/repo" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(result.current.query.isError).toBe(true);
    });
    // 即便失败也应安全降级
    expect(result.current.files).toEqual([]);
    expect(result.current.merged).toBeNull();
    expect(result.current.hasRules).toBe(false);
  });

  it("invoke 传参正确", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_DTO);
    renderHook(() => useProjectRules({ workspaceRoot: "/repo" }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "project_rules_load",
      expect.objectContaining({
        params: expect.objectContaining({ workspaceRoot: "/repo" }),
      }),
    );
  });

  it("summary 包含所有加载到的来源", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE_DTO,
      files: [
        { source: "AGENTS.md", path: "/a", content: "x", originalBytes: 1, truncated: false },
        { source: ".cursorrules", path: "/b", content: "y", originalBytes: 1, truncated: false },
        { source: ".windsurfrules", path: "/c", content: "z", originalBytes: 1, truncated: false },
      ],
    });
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: "/repo" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true);
    });
    expect(result.current.summary).toContain("AGENTS.md");
    expect(result.current.summary).toContain(".cursorrules");
    expect(result.current.summary).toContain(".windsurfrules");
  });
});

describe("reloadProjectRules", () => {
  it("调用 invoke 并传 noCache=true", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_DTO);
    await reloadProjectRules("/repo");
    expect(mockInvoke).toHaveBeenCalledWith(
      "project_rules_load",
      expect.objectContaining({
        params: expect.objectContaining({
          workspaceRoot: "/repo",
          noCache: true,
        }),
      }),
    );
  });
});

describe("useProjectRules - 团队规则 (P2-5)", () => {
  it("暴露 teamRules 摘要", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_DTO);
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: "/repo" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true);
    });
    expect(result.current.teamRules).not.toBeNull();
    expect(result.current.teamRules?.fileCount).toBe(2);
    expect(result.current.teamRules?.enabled).toBe(true);
    expect(result.current.teamRules?.teamName).toBe("Platform");
  });

  it("项目级 .ydsz/rules/ 存在时,teamRulesApplied = false", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE_DTO,
      files: [
        { source: ".ydsz/rules/", path: "/a", content: "x", originalBytes: 1, truncated: false },
      ],
    });
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: "/repo" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true);
    });
    expect(result.current.teamRulesApplied).toBe(false);
  });

  it("项目级 .ydsz/rules/ 为空 + 团队规则启用 → teamRulesApplied = true", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE_DTO,
      files: [
        { source: "AGENTS.md", path: "/a", content: "x", originalBytes: 1, truncated: false },
      ],
      merged: "merged-with-team",
    });
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: "/repo" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true);
    });
    // 项目级有 AGENTS.md 但没有 .ydsz/rules/ → 仍会注入团队规则
    expect(result.current.teamRulesApplied).toBe(true);
  });

  it("团队规则禁用时,teamRulesApplied = false", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE_DTO,
      files: [],
      teamRules: {
        ...SAMPLE_DTO.teamRules!,
        enabled: false,
      },
    });
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: "/repo" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true);
    });
    expect(result.current.teamRulesApplied).toBe(false);
  });

  it("后端无 teamRules 字段时,降级为 null", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE_DTO,
      teamRules: undefined,
    });
    const { result } = renderHook(
      () => useProjectRules({ workspaceRoot: "/repo" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true);
    });
    expect(result.current.teamRules).toBeNull();
    expect(result.current.teamRulesApplied).toBe(false);
  });
});
