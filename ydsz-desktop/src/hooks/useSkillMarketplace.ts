/**
 * @file useSkillMarketplace.ts
 * @description Skill 市场（云顶数字 Skill Marketplace）React Query 封装。
 *
 * ## 数据流
 *
 * 1. 启动时由后端从 `~/.ydsz/marketplace-cache.json` 或内置索引加载
 * 2. 5 分钟 TTL 过期后由后端后台静默拉取远端 URL
 * 3. 用户通过 `useSkillMarketplaceActions().setUrl(...)` 运行时切换
 * 4. UI 通过 `useSkillMarketplaceStatus()` 实时观察数据源 / URL / count
 *
 * ## 关键设计
 *
 * - `status` query 设置 `staleTime: 30s`：状态变化频率不高（仅 setUrl / refresh / 启动时变化）
 * - `setUrl` 成功后调用 `queryClient.invalidateQueries` 让所有依赖 status 的 UI 重新拉取
 * - 与 `useAppSettings().settings.marketplaceUrl` 双向同步：localStorage 改 → setUrl；setUrl 成功 → 回写 localStorage
 */

import { useCallback, useEffect, useRef } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";
import type { SkillMarketplaceSetUrlInput, SkillMarketplaceStatus } from "~/contracts";
import { useAppSettings, normalizeMarketplaceUrl } from "~/appSettings";
import { monitor } from "~/lib/monitor";

/** Skill Marketplace 状态查询键集合 */
export const skillMarketplaceQueryKeys = {
  all: ["skill-marketplace"] as const,
  status: () => ["skill-marketplace", "status"] as const,
};

/**
 * Skill Marketplace 当前状态查询（source / remoteUrl / count / lastRefreshedAt）
 *
 * @returns React Query queryOptions
 */
export function skillMarketplaceStatusQueryOptions() {
  return queryOptions({
    queryKey: skillMarketplaceQueryKeys.status(),
    queryFn: async (): Promise<SkillMarketplaceStatus> => {
      const api = ensureNativeApi();
      return api.skills.marketplace.status();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * 使用 Skill Marketplace 当前状态
 *
 * @returns 状态查询的 React Query 结果
 */
export function useSkillMarketplaceStatus() {
  return useQuery(skillMarketplaceStatusQueryOptions());
}

/**
 * Skill Marketplace 操作 hook：setUrl / refresh
 *
 * ## 副作用
 *
 * - `setUrl` 成功后：
 *   1. `invalidateQueries(skillMarketplaceQueryKeys.status())` 让所有依赖 status 的 UI 刷新
 *   2. 同步写回 `appSettings.marketplaceUrl`（用于 localStorage 持久化）
 * - `refresh` 成功后同样 invalidate status query
 */
export function useSkillMarketplaceActions() {
  const queryClient = useQueryClient();
  const { settings, updateSettings } = useAppSettings();

  const setUrl = useCallback(
    async (input: SkillMarketplaceSetUrlInput): Promise<SkillMarketplaceStatus> => {
      try {
        const api = ensureNativeApi();
        const status = await api.skills.marketplace.setUrl(input);
        queryClient.setQueryData(skillMarketplaceQueryKeys.status(), status);
        // 写回 appSettings（localStorage）保持两端同步
        const normalized = normalizeMarketplaceUrl(status.remoteUrl ?? "");
        if (normalized !== settings.marketplaceUrl) {
          updateSettings({ marketplaceUrl: normalized });
        }
        return status;
      } catch (error) {
        monitor.captureError({
          type: "skill_marketplace.set_url",
          message: "failed to set skill marketplace url",
          stack: error instanceof Error ? error.stack : undefined,
          context: { url: input.url },
          level: "error",
        });
        throw error;
      }
    },
    [queryClient, settings.marketplaceUrl, updateSettings],
  );

  const refresh = useCallback(async (): Promise<SkillMarketplaceStatus> => {
    try {
      const api = ensureNativeApi();
      const status = await api.skills.marketplace.refresh();
      queryClient.setQueryData(skillMarketplaceQueryKeys.status(), status);
      return status;
    } catch (error) {
      monitor.captureError({
        type: "skill_marketplace.refresh",
        message: "failed to refresh skill marketplace",
        stack: error instanceof Error ? error.stack : undefined,
        context: {},
        level: "error",
      });
      throw error;
    }
  }, [queryClient]);

  return { setUrl, refresh } as const;
}

/**
 * 启动同步 hook：把 `appSettings.marketplaceUrl` 推到后端
 *
 * ## 行为
 *
 * - 挂载时读取 `useAppSettings().settings.marketplaceUrl`
 * - 若非空（`http(s)://...`）：调用 `setUrl({ url, refresh: false })` 通知后端
 *   采用与启动默认值（不触发 refresh）
 * - 若为空：跳过同步（后端沿用默认 / 环境变量）
 * - 整个流程仅执行一次（`hasSyncedRef` 锁），避免与用户在 UI 中手动 setUrl 冲突
 *   并避免重复网络请求
 *
 * ## 使用场景
 *
 * 挂载在 `router.ts` 的 `Wrap` 组件中（与 `StoreProvider` 同级），
 * 整个应用只需要一个实例。
 *
 * ## 错误处理
 *
 * - 后端调用失败时记入 `monitor.captureError` 但不重试：
 *   - 重启应用会自动重新触发一次
 *   - 同一 URL 已被持久化在 localStorage，不会丢
 */
export function useMarketplaceUrlBootSync(): void {
  const { settings } = useAppSettings();
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    if (hasSyncedRef.current) {
      return;
    }
    const normalized = normalizeMarketplaceUrl(settings.marketplaceUrl);
    if (normalized.length === 0) {
      // 用户未配置过自定义 URL，让后端沿用默认 / 环境变量
      hasSyncedRef.current = true;
      return;
    }
    hasSyncedRef.current = true;

    const input: SkillMarketplaceSetUrlInput = {
      url: normalized,
      refresh: false,
    };

    void ensureNativeApi()
      .skills.marketplace.setUrl(input)
      .catch((error: unknown) => {
        monitor.captureError({
          type: "skill_marketplace.boot_sync",
          message: "failed to sync marketplace url to backend on boot",
          stack: error instanceof Error ? error.stack : undefined,
          context: { url: normalized },
          level: "warning",
        });
      });
  }, [settings.marketplaceUrl]);
}
