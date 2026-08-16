/**
 * @file openUsageReactQuery 单元测试
 *
 * 覆盖 React Query 配置、queryFn 的所有分支(204/404/非 ok/网络异常)以及
 * 启用/禁用 localStorage 开关。
 *
 * ## 数据构造策略
 *
 * - 通过 `vi.stubGlobal` 注入 fetch
 * - 通过 `localStorage` 注入启用状态
 * - 调用 queryFn 直接验证返回(绕过 useQuery 异步调度)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  openUsageProviderSnapshotQueryOptions,
  openUsageQueryKeys,
} from "./openUsageReactQuery";

interface FetchResponseLike {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
}

function makeResponse(overrides: Partial<FetchResponseLike> = {}): FetchResponseLike {
  return {
    status: 200,
    ok: true,
    json: async () => ({}),
    ...overrides,
  };
}

function setOpenUsageEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  if (enabled) {
    window.localStorage.setItem("2. 环境变量 YDSZ_BOOTSTRAP_TOKEN.openUsage.enabled", "true");
  } else {
    window.localStorage.removeItem("2. 环境变量 YDSZ_BOOTSTRAP_TOKEN.openUsage.enabled");
  }
}

describe("openUsageReactQuery", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  describe("openUsageQueryKeys", () => {
    it("all 包含 'openUsage' 标识", () => {
      expect(openUsageQueryKeys.all[0]).toBe("openUsage");
    });

    it("provider 返回包含 providerId 的键", () => {
      expect(openUsageQueryKeys.provider("codex")).toEqual([
        "openUsage",
        "provider",
        "codex",
      ]);
    });

    it("provider(null) 使用 null 占位", () => {
      expect(openUsageQueryKeys.provider(null)).toEqual([
        "openUsage",
        "provider",
        null,
      ]);
    });

    it("provider(undefined) 使用 null 占位", () => {
      expect(openUsageQueryKeys.provider(undefined)).toEqual([
        "openUsage",
        "provider",
        null,
      ]);
    });
  });

  describe("openUsageProviderSnapshotQueryOptions", () => {
    it("基础结构: queryKey 来自 openUsageQueryKeys.provider", () => {
      const options = openUsageProviderSnapshotQueryOptions("codex");
      expect(options.queryKey).toEqual(["openUsage", "provider", "codex"]);
    });

    it("staleTime 与 refetchInterval 均为 15s", () => {
      const options = openUsageProviderSnapshotQueryOptions("codex");
      expect(options.staleTime).toBe(15_000);
      expect(options.refetchInterval).toBe(15_000);
    });

    it("不重试且不在窗口聚焦时重取", () => {
      const options = openUsageProviderSnapshotQueryOptions("codex");
      expect(options.retry).toBe(false);
      expect(options.refetchOnWindowFocus).toBe(false);
    });

    it("localStorage 未开启时 enabled=false", () => {
      setOpenUsageEnabled(false);
      const options = openUsageProviderSnapshotQueryOptions("codex");
      expect(options.enabled).toBe(false);
    });

    it("localStorage 开启时 enabled=true", () => {
      setOpenUsageEnabled(true);
      const options = openUsageProviderSnapshotQueryOptions("codex");
      expect(options.enabled).toBe(true);
    });

    it("未知 provider 时 enabled=false(providerId 映射失败)", () => {
      setOpenUsageEnabled(true);
      // @ts-expect-error 故意传入未在联合中的 provider
      const options = openUsageProviderSnapshotQueryOptions("unknown");
      expect(options.enabled).toBe(false);
    });

    it("queryFn 命中成功响应时返回 JSON", async () => {
      setOpenUsageEnabled(true);
      const payload = { providerId: "codex", lines: [] };
      fetchSpy.mockResolvedValueOnce(
        makeResponse({ status: 200, json: async () => payload }),
      );
      const options = openUsageProviderSnapshotQueryOptions("codex");
      const result = await options.queryFn();
      expect(result).toEqual(payload);
      expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:6736/v1/usage/codex");
    });

    it("queryFn 命中 204 时返回 null", async () => {
      setOpenUsageEnabled(true);
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 204, ok: false }));
      const options = openUsageProviderSnapshotQueryOptions("codex");
      const result = await options.queryFn();
      expect(result).toBeNull();
    });

    it("queryFn 命中 404 时返回 null", async () => {
      setOpenUsageEnabled(true);
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 404, ok: false }));
      const options = openUsageProviderSnapshotQueryOptions("codex");
      const result = await options.queryFn();
      expect(result).toBeNull();
    });

    it("queryFn 命中 500 时返回 null(非 ok)", async () => {
      setOpenUsageEnabled(true);
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 500, ok: false }));
      const options = openUsageProviderSnapshotQueryOptions("codex");
      const result = await options.queryFn();
      expect(result).toBeNull();
    });

    it("queryFn fetch 抛错时返回 null(不冒泡)", async () => {
      setOpenUsageEnabled(true);
      fetchSpy.mockRejectedValueOnce(new Error("Network failed"));
      const options = openUsageProviderSnapshotQueryOptions("codex");
      const result = await options.queryFn();
      expect(result).toBeNull();
    });

    it("queryFn 未知 providerId 时直接返回 null(不会触发 fetch)", async () => {
      setOpenUsageEnabled(true);
      // @ts-expect-error 故意传入未在联合中的 provider
      const options = openUsageProviderSnapshotQueryOptions("unknown");
      const result = await options.queryFn();
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("不同 Provider 对应不同 URL", async () => {
      setOpenUsageEnabled(true);
      fetchSpy.mockResolvedValue(makeResponse({ json: async () => ({}) }));
      const codex = openUsageProviderSnapshotQueryOptions("codex");
      const claude = openUsageProviderSnapshotQueryOptions("claudeAgent");
      const gemini = openUsageProviderSnapshotQueryOptions("gemini");
      await codex.queryFn();
      await claude.queryFn();
      await gemini.queryFn();
      expect(fetchSpy).toHaveBeenNthCalledWith(1, "http://127.0.0.1:6736/v1/usage/codex");
      expect(fetchSpy).toHaveBeenNthCalledWith(2, "http://127.0.0.1:6736/v1/usage/claude");
      expect(fetchSpy).toHaveBeenNthCalledWith(3, "http://127.0.0.1:6736/v1/usage/gemini");
    });
  });
});
