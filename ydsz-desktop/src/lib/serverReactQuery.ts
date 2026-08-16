/**
 * @file serverReactQuery.ts
 * @description 服务端相关的 React Query 查询配置，提供服务器配置、认证会话、
 * 环境信息、设置、工作树列表及 Provider 用量快照等查询 options。
 */

import type { ProviderKind } from "~/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

/** 服务端查询键集合，用于 React Query 缓存管理 */
export const serverQueryKeys = {
  /** 全局查询键前缀 */
  all: ["server"] as const,
  /** 服务器配置查询键 */
  config: () => ["server", "config"] as const,
  /** 认证会话查询键 */
  authSession: () => ["server", "auth", "session"] as const,
  /** 环境信息查询键 */
  environment: () => ["server", "environment"] as const,
  /** 设置查询键 */
  settings: () => ["server", "settings"] as const,
  /** 工作树列表查询键 */
  worktrees: () => ["server", "worktrees"] as const,
  /** Provider 用量快照查询键 */
  providerUsage: (provider: ProviderKind | null | undefined, homePath?: string | null) =>
    ["server", "providerUsage", provider ?? null, homePath ?? null] as const,
};

/**
 * 创建服务器配置查询配置
 *
 * @returns React Query queryOptions 配置对象，staleTime 为 Infinity
 */
export function serverConfigQueryOptions() {
  return queryOptions({
    queryKey: serverQueryKeys.config(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.getConfig();
    },
    staleTime: Infinity,
  });
}

/**
 * 创建认证会话查询配置
 *
 * @returns React Query queryOptions 配置对象，15 秒 staleTime
 */
export function serverAuthSessionQueryOptions() {
  return queryOptions({
    queryKey: serverQueryKeys.authSession(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.getAuthSession();
    },
    staleTime: 15_000,
  });
}

/**
 * 创建服务器环境信息查询配置
 *
 * @returns React Query queryOptions 配置对象，staleTime 为 Infinity
 */
export function serverEnvironmentQueryOptions() {
  return queryOptions({
    queryKey: serverQueryKeys.environment(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.getEnvironment();
    },
    staleTime: Infinity,
  });
}

/**
 * 创建服务器设置查询配置
 *
 * @returns React Query queryOptions 配置对象，staleTime 为 Infinity
 */
export function serverSettingsQueryOptions() {
  return queryOptions({
    queryKey: serverQueryKeys.settings(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.getSettings();
    },
    staleTime: Infinity,
  });
}

/**
 * 创建工作树列表查询配置
 *
 * @returns React Query queryOptions 配置对象，30 秒 staleTime，窗口聚焦和重连时自动刷新
 */
export function serverWorktreesQueryOptions() {
  return queryOptions({
    queryKey: serverQueryKeys.worktrees(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.listWorktrees();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * 创建 Provider 用量快照查询配置
 *
 * @param input - 查询输入参数
 * @param input.provider - Provider 类型
 * @param input.homePath - 用户主目录路径
 * @returns React Query queryOptions 配置对象，30 秒轮询间隔
 */
export function serverProviderUsageSnapshotQueryOptions(input: {
  provider: ProviderKind | null | undefined;
  homePath?: string | null;
}) {
  return queryOptions({
    queryKey: serverQueryKeys.providerUsage(input.provider, input.homePath),
    enabled: input.provider !== null && input.provider !== undefined,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      if (!input.provider) return null;
      const api = ensureNativeApi();
      return api.server.getProviderUsageSnapshot({
        provider: input.provider,
        ...(input.homePath ? { homePath: input.homePath } : {}),
      });
    },
  });
}