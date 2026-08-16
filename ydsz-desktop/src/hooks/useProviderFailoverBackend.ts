/**
 * @file useProviderFailoverBackend
 * @description Provider 故障转移 (P1-4 后端化) — 前端薄壳 Hook
 *
 * 与 `useProviderFailover` (纯前端 in-memory) 不同,本 Hook 把所有失败
 * 计数 / 自动切换决策下沉到 Rust 后端(`FailoverState`):
 *
 * - **状态权威源**: 后端是 single source of truth
 * - **跨进程一致**: 多个 webview / tab 共享同一份失败计数
 * - **避免状态分裂**: 前端不再有独立 React state,UI 只是渲染后端快照
 * - **能力匹配 / 阈值判断**: 100% 在后端,前端只读
 *
 * ## 工作机制
 *
 * 1. 挂载时调用 `failover_get_state` 拉取一次快照
 * 2. `recordFailure / recordSuccess` 调用后端命令,直接用返回的快照更新本地 state
 * 3. 后端在 `record_failure` 内部完成阈值判断 + 切换动作,
 *    前端无需重复判断
 *
 * ## 多 Workspace 隔离 (P2-5)
 *
 * 多 Workspace 并行 Provider 场景下,故障转移状态需要按 workspace 隔离:
 * - workspace A 的 codex 失败计数 ≠ workspace B 的 codex 失败计数
 * - 每个 workspace 可以独立选用不同的 active provider(后端是 router)
 *
 * `useProviderFailoverByWorkspace(workspaceId)` 提供这个能力。
 *
 * ## 使用场景
 *
 * 替换 `useAutoProviderFailover` / `useProviderFailoverBridge` 内部实现,
 * 让 IPC 失败 → 后端计数 → 跨 tab 切换的链路真正贯通。
 *
 * ## 注意事项
 *
 * - 后端 invoke 是异步的:UI 显示的状态会有一帧延迟(可接受)
 * - 后端崩溃时 invoke 会抛错,这里降级返回上一次快照(不重置 state)
 * - 切换动作在后端完成,前端不直接修改 `activeProvider`
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProviderKind } from "~/contracts";

/** 能力枚举(与后端 ProviderCapability 对齐) */
export type BackendProviderCapability =
  | "tool-calling"
  | "vision"
  | "reasoning-effort"
  | "fast-mode";

/** 故障转移状态(与后端 FailoverStatus 对齐) */
export type BackendFailoverStatus =
  | "idle"
  | "monitoring"
  | "switching"
  | "switched"
  | "no-fallback"
  | "disabled";

/** 故障转移事件(与后端 FailoverEvent 对齐) */
export interface BackendFailoverEvent {
  from: ProviderKind;
  to: ProviderKind;
  reason: string;
  at_ms: number;
  failure_count: number;
}

/** 故障转移快照(与后端 FailoverSnapshot 对齐) */
export interface BackendFailoverSnapshot {
  active_provider: ProviderKind;
  failure_counts: Record<string, number>;
  history: BackendFailoverEvent[];
  config: {
    failure_threshold: number;
    auto_failover: boolean;
    enabled_providers: ProviderKind[];
  };
  status: BackendFailoverStatus;
}

export interface UseProviderFailoverBackendResult {
  /** 当前快照(后端权威源) */
  snapshot: BackendFailoverSnapshot | null;
  /** 当前活跃 Provider(后端决定) */
  activeProvider: ProviderKind | null;
  /** 当前状态 */
  status: BackendFailoverStatus;
  /** 失败计数 */
  failureCounts: Readonly<Record<string, number>>;
  /** 切换历史 */
  history: ReadonlyArray<BackendFailoverEvent>;
  /** 是否启用自动故障转移 */
  autoFailoverEnabled: boolean;
  /** 是否正在与后端通信 */
  isSyncing: boolean;
  /** 最近一次错误(若 invoke 失败) */
  lastError: string | null;
  /** 记录一次失败(后端会自动判断是否切换) */
  recordFailure: (provider: ProviderKind, error?: Error) => Promise<void>;
  /** 记录一次成功(后端重置该 Provider 计数) */
  recordSuccess: (provider: ProviderKind) => Promise<void>;
  /** 手动切换到指定 Provider */
  switchProvider: (target: ProviderKind, reason?: string) => Promise<boolean>;
  /** 启用/禁用自动故障转移 */
  setAutoFailover: (enabled: boolean) => Promise<void>;
  /** 重置所有失败计数和历史 */
  reset: () => Promise<void>;
  /** 主动拉取最新快照 */
  refresh: () => Promise<void>;
}

/**
 * Provider 故障转移(后端化)Hook
 *
 * @example
 * ```ts
 * const { recordFailure, recordSuccess, activeProvider, history } =
 *   useProviderFailoverBackend();
 *
 * try {
 *   await dispatchCommand(...);
 *   await recordSuccess(provider);
 * } catch (e) {
 *   await recordFailure(provider, e);
 * }
 * ```
 */
export function useProviderFailoverBackend(): UseProviderFailoverBackendResult {
  const [snapshot, setSnapshot] = useState<BackendFailoverSnapshot | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  /** 统一错误处理:降级使用上一次快照,记录错误 */
  const safeInvoke = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setIsSyncing(true);
    try {
      const result = await fn();
      setLastError(null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
      // 不抛错,允许 UI 继续工作
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  /** 主动拉取最新快照 */
  const refresh = useCallback(async () => {
    const next = await safeInvoke(() =>
      invoke<BackendFailoverSnapshot>("failover_get_state"),
    );
    if (next) {
      setSnapshot(next);
    }
  }, [safeInvoke]);

  /** 挂载时拉取一次初始快照 */
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 记录一次失败(后端自动判断是否触发切换) */
  const recordFailure = useCallback(
    async (provider: ProviderKind, error?: Error) => {
      const next = await safeInvoke(() =>
        invoke<BackendFailoverSnapshot>("failover_record_failure", {
          provider,
          error: error?.message ?? null,
        }),
      );
      if (next) {
        setSnapshot(next);
      }
    },
    [safeInvoke],
  );

  /** 记录一次成功 */
  const recordSuccess = useCallback(
    async (provider: ProviderKind) => {
      const next = await safeInvoke(() =>
        invoke<BackendFailoverSnapshot>("failover_record_success", {
          provider,
        }),
      );
      if (next) {
        setSnapshot(next);
      }
    },
    [safeInvoke],
  );

  /** 手动切换到指定 Provider */
  const switchProvider = useCallback(
    async (target: ProviderKind, reason?: string) => {
      const next = await safeInvoke(() =>
        invoke<BackendFailoverSnapshot | null>("failover_switch_to", {
          target,
          reason: reason ?? null,
        }),
      );
      if (next) {
        setSnapshot(next);
        return true;
      }
      return false;
    },
    [safeInvoke],
  );

  /** 启用/禁用自动故障转移 */
  const setAutoFailover = useCallback(
    async (enabled: boolean) => {
      const current = snapshot;
      if (!current) return;
      const next = await safeInvoke(() =>
        invoke<BackendFailoverSnapshot>("failover_set_config", {
          config: {
            ...current.config,
            auto_failover: enabled,
          },
        }),
      );
      if (next) {
        setSnapshot(next);
      }
    },
    [safeInvoke, snapshot],
  );

  /** 重置 */
  const reset = useCallback(async () => {
    const next = await safeInvoke(() =>
      invoke<BackendFailoverSnapshot>("failover_reset"),
    );
    if (next) {
      setSnapshot(next);
    }
  }, [safeInvoke]);

  return {
    snapshot,
    activeProvider: snapshot?.active_provider ?? null,
    status: snapshot?.status ?? "monitoring",
    failureCounts: snapshot?.failure_counts ?? {},
    history: snapshot?.history ?? [],
    autoFailoverEnabled: snapshot?.config.auto_failover ?? true,
    isSyncing,
    lastError,
    recordFailure,
    recordSuccess,
    switchProvider,
    setAutoFailover,
    reset,
    refresh,
  };
}

/* ============================================================================
 * P2-5: 多 Workspace 隔离版本
 * ============================================================================
 */

/** Workspace 唯一标识(后端 `WorkspaceId` 的字符串形态) */
export type WorkspaceId = string;

/**
 * 多 Workspace 故障转移 Hook 选项
 */
export interface UseProviderFailoverByWorkspaceOptions {
  /**
   * 是否在 workspaceId 为空/falsy 时禁用(避免给后端塞 null workspace)
   * 默认 true
   */
  skipWhenEmpty?: boolean;
}

/**
 * 多 Workspace 故障转移 Hook
 *
 * 与 `useProviderFailoverBackend` 的区别:每个 workspaceId 维护独立的
 * `BackendFailoverSnapshot`。后端 `failover_*_for_workspace` 系列命令必须
 * 显式接受 workspaceId 以路由到正确的状态机。
 *
 * ## 关键特性
 *
 * 1. **隔离性**: workspace A 的失败计数不会泄漏到 workspace B
 * 2. **缓存友好**: 同 workspaceId 的多次调用共享同一份 React state
 * 3. **切换无感**: workspaceId 变化时只触发 refresh,不重置 state
 *    (避免 mount/unmount 闪烁)
 */
export function useProviderFailoverByWorkspace(
  workspaceId: WorkspaceId | null | undefined,
  options: UseProviderFailoverByWorkspaceOptions = {},
): UseProviderFailoverBackendResult {
  const { skipWhenEmpty = true } = options;
  const enabled = !skipWhenEmpty || Boolean(workspaceId);
  const [snapshot, setSnapshot] = useState<BackendFailoverSnapshot | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const safeInvoke = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      if (!enabled) return null;
      setIsSyncing(true);
      try {
        const result = await fn();
        setLastError(null);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setLastError(message);
        return null;
      } finally {
        setIsSyncing(false);
      }
    },
    [enabled],
  );

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const next = await safeInvoke(() =>
      invoke<BackendFailoverSnapshot>("failover_get_state_for_workspace", {
        workspaceId: workspaceId ?? null,
      }),
    );
    if (next) {
      setSnapshot(next);
    }
  }, [safeInvoke, enabled, workspaceId]);

  useEffect(() => {
    // workspaceId 变化时只 refresh,不清空 snapshot(避免闪烁)
    void refresh();
  }, [refresh]);

  const recordFailure = useCallback(
    async (provider: ProviderKind, error?: Error) => {
      if (!enabled || !workspaceId) return;
      const next = await safeInvoke(() =>
        invoke<BackendFailoverSnapshot>("failover_record_failure_for_workspace", {
          workspaceId,
          provider,
          error: error?.message ?? null,
        }),
      );
      if (next) {
        setSnapshot(next);
      }
    },
    [safeInvoke, enabled, workspaceId],
  );

  const recordSuccess = useCallback(
    async (provider: ProviderKind) => {
      if (!enabled || !workspaceId) return;
      const next = await safeInvoke(() =>
        invoke<BackendFailoverSnapshot>("failover_record_success_for_workspace", {
          workspaceId,
          provider,
        }),
      );
      if (next) {
        setSnapshot(next);
      }
    },
    [safeInvoke, enabled, workspaceId],
  );

  const switchProvider = useCallback(
    async (target: ProviderKind, reason?: string) => {
      if (!enabled || !workspaceId) return false;
      const next = await safeInvoke(() =>
        invoke<BackendFailoverSnapshot | null>("failover_switch_to_for_workspace", {
          workspaceId,
          target,
          reason: reason ?? null,
        }),
      );
      if (next) {
        setSnapshot(next);
        return true;
      }
      return false;
    },
    [safeInvoke, enabled, workspaceId],
  );

  const setAutoFailover = useCallback(
    async (enabledValue: boolean) => {
      if (!enabled || !workspaceId || !snapshot) return;
      const next = await safeInvoke(() =>
        invoke<BackendFailoverSnapshot>("failover_set_config_for_workspace", {
          workspaceId,
          config: { ...snapshot.config, auto_failover: enabledValue },
        }),
      );
      if (next) {
        setSnapshot(next);
      }
    },
    [safeInvoke, enabled, workspaceId, snapshot],
  );

  const reset = useCallback(async () => {
    if (!enabled || !workspaceId) return;
    const next = await safeInvoke(() =>
      invoke<BackendFailoverSnapshot>("failover_reset_for_workspace", {
        workspaceId,
      }),
    );
    if (next) {
      setSnapshot(next);
    }
  }, [safeInvoke, enabled, workspaceId]);

  return {
    snapshot,
    activeProvider: snapshot?.active_provider ?? null,
    status: snapshot?.status ?? "monitoring",
    failureCounts: snapshot?.failure_counts ?? {},
    history: snapshot?.history ?? [],
    autoFailoverEnabled: snapshot?.config.auto_failover ?? true,
    isSyncing,
    lastError,
    recordFailure,
    recordSuccess,
    switchProvider,
    setAutoFailover,
    reset,
    refresh,
  };
}
