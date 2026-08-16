//! # useTeamRules Hook 单元测试
//!
//! 覆盖目标：
//! - 空 baseDir / null 时不阻塞
//! - 正常加载返回 files + manifest + summary
//! - saveRule / deleteRule / saveManifest 走正确的命令名
//! - merged 在 hasRules=false 时为 null
//! - isEnabled 反映 manifest.enabled
//!
//! invoke 通过 mock 完全隔离。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  readTeamRule,
  resolveTeamRulesBaseDir,
  useTeamRules,
  type TeamRulesListDto,
} from "./useTeamRules";

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

const SAMPLE: TeamRulesListDto = {
  root: "/home/test/.ydsz-buddy/team-rules",
  manifest: {
    schemaVersion: 1,
    updatedAt: "2026-06-26T08:00:00Z",
    teamName: "Platform",
    remoteUrl: null,
    remoteCommit: null,
    enabled: true,
  },
  files: [
    {
      name: "00-style.md",
      path: "/home/test/.ydsz-buddy/team-rules/00-style.md",
      content: "use tabs",
      originalBytes: 8,
      truncated: false,
      modifiedAt: 1719390000,
    },
    {
      name: "01-test.md",
      path: "/home/test/.ydsz-buddy/team-rules/01-test.md",
      content: "always write tests",
      originalBytes: 18,
      truncated: false,
      modifiedAt: 1719390100,
    },
  ],
  skipped: 0,
  error: null,
  elapsedMs: 4,
};

describe("useTeamRules", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("正常加载返回 files + manifest + summary", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE);
    const { result } = renderHook(() => useTeamRules(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.files.length).toBe(2);
    });
    expect(result.current.hasRules).toBe(true);
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.manifest?.teamName).toBe("Platform");
    expect(result.current.summary).toContain("2");
    expect(result.current.merged).toContain("00-style.md");
    expect(result.current.merged).toContain("use tabs");
  });

  it("空 baseDir / 文件夹不存在时,返回空规则", async () => {
    mockInvoke.mockResolvedValueOnce({
      root: null,
      manifest: null,
      files: [],
      skipped: 0,
      error: null,
      elapsedMs: 1,
    });
    const { result } = renderHook(() => useTeamRules(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.query.isLoading).toBe(false);
    });
    expect(result.current.files).toEqual([]);
    expect(result.current.hasRules).toBe(false);
    expect(result.current.merged).toBeNull();
  });

  it("manifest.enabled=false 时 isEnabled=false 且 merged=null", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE,
      manifest: { ...SAMPLE.manifest!, enabled: false },
    });
    const { result } = renderHook(() => useTeamRules(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.query.isLoading).toBe(false);
    });
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.merged).toBeNull();
  });

  it("load 命令透传 baseDir=null", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE);
    renderHook(() => useTeamRules(), { wrapper: makeWrapper() });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    const call = mockInvoke.mock.calls.find(
      (c) => c[0] === "team_rules_list",
    );
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ baseDir: null });
  });

  it("load 命令透传 baseDir 字符串", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE);
    renderHook(() => useTeamRules({ baseDir: "/tmp/foo" }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    const call = mockInvoke.mock.calls.find(
      (c) => c[0] === "team_rules_list",
    );
    expect(call?.[1]).toMatchObject({ baseDir: "/tmp/foo" });
  });

  it("saveRule 调用 team_rules_save 并 invalidate 查询", async () => {
    mockInvoke
      .mockResolvedValueOnce(SAMPLE) // 首次 load
      .mockResolvedValueOnce({
        // save 响应
        name: "rule.md",
        path: "/home/test/.ydsz-buddy/team-rules/rule.md",
        content: "x",
        originalBytes: 1,
        truncated: false,
        modifiedAt: 1719390000,
      })
      .mockResolvedValueOnce(SAMPLE); // refresh 后的 load

    const { result } = renderHook(() => useTeamRules(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.files.length).toBe(2));

    await act(async () => {
      await result.current.saveRule.mutateAsync({
        fileName: "rule.md",
        content: "x",
      });
    });

    const saveCall = mockInvoke.mock.calls.find(
      (c) => c[0] === "team_rules_save",
    );
    expect(saveCall).toBeDefined();
    expect(saveCall?.[1]).toMatchObject({
      baseDir: null,
      input: { fileName: "rule.md", content: "x" },
    });
  });

  it("deleteRule 调用 team_rules_delete", async () => {
    mockInvoke
      .mockResolvedValueOnce(SAMPLE)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(SAMPLE);

    const { result } = renderHook(() => useTeamRules(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.files.length).toBe(2));

    await act(async () => {
      await result.current.deleteRule.mutateAsync("00-style.md");
    });

    const delCall = mockInvoke.mock.calls.find(
      (c) => c[0] === "team_rules_delete",
    );
    expect(delCall).toBeDefined();
    expect(delCall?.[1]).toMatchObject({
      baseDir: null,
      fileName: "00-style.md",
    });
  });

  it("saveManifest 调用 team_rules_save_manifest", async () => {
    mockInvoke
      .mockResolvedValueOnce(SAMPLE)
      .mockResolvedValueOnce(SAMPLE.manifest)
      .mockResolvedValueOnce(SAMPLE);

    const { result } = renderHook(() => useTeamRules(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.files.length).toBe(2));

    await act(async () => {
      await result.current.saveManifest.mutateAsync(SAMPLE.manifest!);
    });

    const mCall = mockInvoke.mock.calls.find(
      (c) => c[0] === "team_rules_save_manifest",
    );
    expect(mCall).toBeDefined();
    expect(mCall?.[1]).toMatchObject({
      baseDir: null,
      manifest: SAMPLE.manifest,
    });
  });

  it("error 字段透传到 error 派生", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...SAMPLE,
      error: "boom",
    });
    const { result } = renderHook(() => useTeamRules(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.error).toBe("boom"));
  });
});

describe("readTeamRule / resolveTeamRulesBaseDir", () => {
  beforeEach(() => mockInvoke.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("readTeamRule 透传 fileName + baseDir", async () => {
    mockInvoke.mockResolvedValueOnce({
      found: true,
      file: SAMPLE.files[0],
      error: null,
    });
    const res = await readTeamRule("00-style.md", null);
    expect(res.found).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("team_rules_read", {
      baseDir: null,
      fileName: "00-style.md",
    });
    expect(res.file?.name).toBe("00-style.md");
  });

  it("resolveTeamRulesBaseDir 走 team_rules_resolve_base_dir", async () => {
    mockInvoke.mockResolvedValueOnce(
      "/home/test/.ydsz-buddy/team-rules",
    );
    const p = await resolveTeamRulesBaseDir();
    expect(p).toBe("/home/test/.ydsz-buddy/team-rules");
    expect(mockInvoke).toHaveBeenCalledWith(
      "team_rules_resolve_base_dir",
      { baseDir: null },
    );
  });
});
