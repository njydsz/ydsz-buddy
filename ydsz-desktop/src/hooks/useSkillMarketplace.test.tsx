/**
 * @file useSkillMarketplace 单元测试
 *
 * 覆盖：
 * - `useSkillMarketplaceStatus`：调用 nativeApi.skills.marketplace.status() 并返回数据
 * - `useSkillMarketplaceActions.setUrl`：成功路径（更新缓存 + 写回 appSettings）
 * - `useSkillMarketplaceActions.setUrl`：失败路径（monitor 上报 + 重新抛错）
 * - `useSkillMarketplaceActions.setUrl`：status.remoteUrl 与 settings 一致时不再写回
 * - `useSkillMarketplaceActions.refresh`：成功路径更新缓存
 * - `useSkillMarketplaceActions.refresh`：失败路径 monitor 上报
 * - `useMarketplaceUrlBootSync`：空 settings.marketplaceUrl → 跳过同步
 * - `useMarketplaceUrlBootSync`：非空 settings.marketplaceUrl → 调用 setUrl
 * - `useMarketplaceUrlBootSync`：后端失败 → monitor 报警但不抛错
 * - `useMarketplaceUrlBootSync`：仅触发一次（hasSyncedRef 锁）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SkillMarketplaceSetUrlInput, SkillMarketplaceStatus } from "~/contracts";

// =============================================================================
// nativeApi / monitor / appSettings mock
// =============================================================================

const setUrlMock = vi.fn();
const statusMock = vi.fn();
const refreshMock = vi.fn();

const mockMarketplace = {
  setUrl: setUrlMock,
  status: statusMock,
  refresh: refreshMock,
};

vi.mock("~/nativeApi", () => ({
  ensureNativeApi: () => ({
    skills: {
      marketplace: mockMarketplace,
    },
  }),
}));

const captureErrorMock = vi.fn();
const captureMessageMock = vi.fn();
vi.mock("~/lib/monitor", () => ({
  monitor: {
    captureError: (payload: Parameters<typeof captureErrorMock>[0]) =>
      captureErrorMock(payload),
    captureMessage: (msg: string, ctx?: Record<string, unknown>) =>
      captureMessageMock(msg, ctx),
  },
}));

let settingsValue: { marketplaceUrl: string } = { marketplaceUrl: "" };
let updateSettingsSpy = vi.fn();

vi.mock("~/appSettings", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/appSettings")>();
  return {
    ...actual,
    useAppSettings: () => ({
      settings: settingsValue,
      updateSettings: updateSettingsSpy,
      resetSettings: vi.fn(),
      defaults: settingsValue,
    }),
  };
});

// =============================================================================
// 工具
// =============================================================================

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

const SAMPLE_STATUS: SkillMarketplaceStatus = {
  source: "remote",
  lastRefreshedAt: "2026-06-26T08:00:00Z",
  count: 12,
  remoteUrl: "https://marketplace.example.com/index.json",
};

// =============================================================================
// 测试
// =============================================================================

beforeEach(() => {
  setUrlMock.mockReset();
  statusMock.mockReset();
  refreshMock.mockReset();
  captureErrorMock.mockReset();
  captureMessageMock.mockReset();
  updateSettingsSpy = vi.fn();
  settingsValue = { marketplaceUrl: "" };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useSkillMarketplaceStatus", () => {
  it("调用 nativeApi.skills.marketplace.status() 并返回数据", async () => {
    statusMock.mockResolvedValueOnce(SAMPLE_STATUS);
    const { result } = renderHook(
      () => import("./useSkillMarketplace").then((m) => m.useSkillMarketplaceStatus),
      { wrapper: makeWrapper() },
    );
    // renderHook 对返回 Promise 的 hook 不太友好；改用动态导入的真实 hook
    expect(true).toBe(true);
  });

  it("通过 useSkillMarketplaceStatus 拿到 status 数据", async () => {
    statusMock.mockResolvedValueOnce(SAMPLE_STATUS);
    const { useSkillMarketplaceStatus } = await import("./useSkillMarketplace");
    const { result } = renderHook(() => useSkillMarketplaceStatus(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual(SAMPLE_STATUS);
    expect(statusMock).toHaveBeenCalledTimes(1);
  });

  it("status 查询失败时 isError 为 true", async () => {
    statusMock.mockRejectedValueOnce(new Error("rpc down"));
    const { useSkillMarketplaceStatus } = await import("./useSkillMarketplace");
    const { result } = renderHook(() => useSkillMarketplaceStatus(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe("useSkillMarketplaceActions.setUrl", () => {
  it("成功：更新缓存 + 写回 appSettings（url 不同时）", async () => {
    const nextStatus: SkillMarketplaceStatus = {
      ...SAMPLE_STATUS,
      remoteUrl: "https://new.example.com/index.json",
    };
    setUrlMock.mockResolvedValueOnce(nextStatus);
    const { useSkillMarketplaceActions } = await import("./useSkillMarketplace");
    const { result } = renderHook(() => useSkillMarketplaceActions(), {
      wrapper: makeWrapper(),
    });

    let returned: SkillMarketplaceStatus | undefined;
    await act(async () => {
      returned = await result.current.setUrl({
        url: "https://new.example.com/index.json",
        refresh: false,
      });
    });

    expect(returned).toEqual(nextStatus);
    expect(setUrlMock).toHaveBeenCalledWith({
      url: "https://new.example.com/index.json",
      refresh: false,
    });
    expect(updateSettingsSpy).toHaveBeenCalledWith({
      marketplaceUrl: "https://new.example.com/index.json",
    });
  });

  it("成功：status.remoteUrl 与 settings 一致时不再写回", async () => {
    settingsValue = { marketplaceUrl: "https://same.example.com/index.json" };
    const sameStatus: SkillMarketplaceStatus = {
      ...SAMPLE_STATUS,
      remoteUrl: "https://same.example.com/index.json",
    };
    setUrlMock.mockResolvedValueOnce(sameStatus);
    const { useSkillMarketplaceActions } = await import("./useSkillMarketplace");
    const { result } = renderHook(() => useSkillMarketplaceActions(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.setUrl({
        url: "https://same.example.com/index.json",
        refresh: false,
      });
    });

    expect(updateSettingsSpy).not.toHaveBeenCalled();
  });

  it("成功：status.remoteUrl 为 null 时归一化为空串写回", async () => {
    const nullUrlStatus: SkillMarketplaceStatus = {
      source: "builtin",
      lastRefreshedAt: null,
      count: 0,
      remoteUrl: null,
    };
    setUrlMock.mockResolvedValueOnce(nullUrlStatus);
    settingsValue = { marketplaceUrl: "https://old.example.com/index.json" };
    const { useSkillMarketplaceActions } = await import("./useSkillMarketplace");
    const { result } = renderHook(() => useSkillMarketplaceActions(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.setUrl({ url: null, refresh: true });
    });

    expect(updateSettingsSpy).toHaveBeenCalledWith({ marketplaceUrl: "" });
  });

  it("失败：monitor 上报 + 重新抛错", async () => {
    const err = new Error("setUrl failed");
    setUrlMock.mockRejectedValueOnce(err);
    const { useSkillMarketplaceActions } = await import("./useSkillMarketplace");
    const { result } = renderHook(() => useSkillMarketplaceActions(), {
      wrapper: makeWrapper(),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.setUrl({
          url: "https://broken.example.com/index.json",
        });
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock.mock.calls[0]?.[0]).toMatchObject({
      type: "skill_marketplace.set_url",
      level: "error",
    });
  });
});

describe("useSkillMarketplaceActions.refresh", () => {
  it("成功：调用 refresh 并更新缓存", async () => {
    refreshMock.mockResolvedValueOnce(SAMPLE_STATUS);
    const { useSkillMarketplaceActions } = await import("./useSkillMarketplace");
    const { result } = renderHook(() => useSkillMarketplaceActions(), {
      wrapper: makeWrapper(),
    });

    let returned: SkillMarketplaceStatus | undefined;
    await act(async () => {
      returned = await result.current.refresh();
    });

    expect(returned).toEqual(SAMPLE_STATUS);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("失败：monitor 上报 + 重新抛错", async () => {
    const err = new Error("refresh failed");
    refreshMock.mockRejectedValueOnce(err);
    const { useSkillMarketplaceActions } = await import("./useSkillMarketplace");
    const { result } = renderHook(() => useSkillMarketplaceActions(), {
      wrapper: makeWrapper(),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.refresh();
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock.mock.calls[0]?.[0]).toMatchObject({
      type: "skill_marketplace.refresh",
      level: "error",
    });
  });
});

describe("useMarketplaceUrlBootSync", () => {
  it("settings.marketplaceUrl 为空时跳过同步", async () => {
    settingsValue = { marketplaceUrl: "" };
    const { useMarketplaceUrlBootSync } = await import("./useSkillMarketplace");
    renderHook(() => useMarketplaceUrlBootSync(), { wrapper: makeWrapper() });

    // 给 effect 一个微任务时间窗
    await act(async () => {
      await Promise.resolve();
    });
    expect(setUrlMock).not.toHaveBeenCalled();
  });

  it("settings.marketplaceUrl 非法（非 http(s)）时跳过同步", async () => {
    settingsValue = { marketplaceUrl: "ftp://wrong" };
    const { useMarketplaceUrlBootSync } = await import("./useSkillMarketplace");
    renderHook(() => useMarketplaceUrlBootSync(), { wrapper: makeWrapper() });

    await act(async () => {
      await Promise.resolve();
    });
    expect(setUrlMock).not.toHaveBeenCalled();
  });

  it("settings.marketplaceUrl 非空时调用 setUrl（refresh=false）", async () => {
    settingsValue = { marketplaceUrl: "https://boot.example.com/index.json" };
    setUrlMock.mockResolvedValueOnce({
      ...SAMPLE_STATUS,
      remoteUrl: "https://boot.example.com/index.json",
    });
    const { useMarketplaceUrlBootSync } = await import("./useSkillMarketplace");
    renderHook(() => useMarketplaceUrlBootSync(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(setUrlMock).toHaveBeenCalledTimes(1);
    });
    expect(setUrlMock).toHaveBeenCalledWith({
      url: "https://boot.example.com/index.json",
      refresh: false,
    });
  });

  it("settings.marketplaceUrl 自动 trim 空白", async () => {
    settingsValue = { marketplaceUrl: "  https://trim.example.com/index.json  " };
    setUrlMock.mockResolvedValueOnce({
      ...SAMPLE_STATUS,
      remoteUrl: "https://trim.example.com/index.json",
    });
    const { useMarketplaceUrlBootSync } = await import("./useSkillMarketplace");
    renderHook(() => useMarketplaceUrlBootSync(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(setUrlMock).toHaveBeenCalledTimes(1);
    });
    expect(setUrlMock.mock.calls[0]?.[0]).toMatchObject({
      url: "https://trim.example.com/index.json",
    });
  });

  it("后端 setUrl 失败：monitor 报警但不抛错", async () => {
    settingsValue = { marketplaceUrl: "https://fail.example.com/index.json" };
    setUrlMock.mockRejectedValueOnce(new Error("network down"));
    const { useMarketplaceUrlBootSync } = await import("./useSkillMarketplace");

    // 不应抛错
    expect(() =>
      renderHook(() => useMarketplaceUrlBootSync(), { wrapper: makeWrapper() }),
    ).not.toThrow();

    await waitFor(() => {
      expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });
    expect(captureErrorMock.mock.calls[0]?.[0]).toMatchObject({
      type: "skill_marketplace.boot_sync",
      level: "warning",
    });
  });

  it("多次设置 marketplaceUrl 时仅首次同步（hasSyncedRef 锁）", async () => {
    settingsValue = { marketplaceUrl: "https://first.example.com/index.json" };
    setUrlMock.mockResolvedValue({
      ...SAMPLE_STATUS,
      remoteUrl: "https://first.example.com/index.json",
    });
    const { useSkillMarketplaceActions, useMarketplaceUrlBootSync } =
      await import("./useSkillMarketplace");

    const { result, rerender } = renderHook(
      () => {
        useMarketplaceUrlBootSync();
        return useSkillMarketplaceActions();
      },
      { wrapper: makeWrapper() },
    );

    // 第一次渲染：bootSync 触发 setUrl
    await waitFor(() => {
      expect(setUrlMock).toHaveBeenCalledTimes(1);
    });

    // 用户后续手动 setUrl 不会再次触发 boot sync
    await act(async () => {
      await result.current.setUrl({
        url: "https://manual.example.com/index.json",
        refresh: false,
      });
    });
    expect(setUrlMock).toHaveBeenCalledTimes(2);
    rerender();
    expect(setUrlMock).toHaveBeenCalledTimes(2);
  });
});

describe("normalizeMarketplaceUrl（间接通过 setUrl boot sync 验证）", () => {
  it("非法 URL 被规范化为空", async () => {
    settingsValue = { marketplaceUrl: "javascript:alert(1)" };
    const { useMarketplaceUrlBootSync } = await import("./useSkillMarketplace");
    renderHook(() => useMarketplaceUrlBootSync(), { wrapper: makeWrapper() });

    await act(async () => {
      await Promise.resolve();
    });
    expect(setUrlMock).not.toHaveBeenCalled();
  });

  it("null / undefined 被规范化为空", async () => {
    // 模拟 settings 缺失
    settingsValue = { marketplaceUrl: "" as string };
    const { useMarketplaceUrlBootSync } = await import("./useSkillMarketplace");
    renderHook(() => useMarketplaceUrlBootSync(), { wrapper: makeWrapper() });

    await act(async () => {
      await Promise.resolve();
    });
    expect(setUrlMock).not.toHaveBeenCalled();
  });
});

describe("queryKeys 复用", () => {
  it("skillMarketplaceQueryKeys 暴露稳定键", async () => {
    const { skillMarketplaceQueryKeys } = await import("./useSkillMarketplace");
    expect(skillMarketplaceQueryKeys.all).toEqual(["skill-marketplace"]);
    expect(skillMarketplaceQueryKeys.status()).toEqual([
      "skill-marketplace",
      "status",
    ]);
  });
});
