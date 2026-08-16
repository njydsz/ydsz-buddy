/**
 * @file useIdleLock
 * @description 离座锁定 / 隐私屏（P2-1）— 前端 Hook
 *
 * 与后端 `commands::idle_lock` 模块通信：
 *
 * - 挂载时拉取一次快照,之后每 1s 调 `idle_lock_tick` 让后端评估是否需要 lock
 * - 用户活动(mousemove / keydown / pointerdown)由 `useIdleDetector` 上报,本 hook
 *   只负责转发到 `idle_lock_record_activity`(throttle 500ms)
 * - 解锁 / 锁定 / 设置 PIN / 配置变更都通过对应命令完成
 * - 解锁成功后发一个 `lock_state` 事件,让外部能展示 toast
 *
 * ## 与后端的边界
 *
 * - 后端是 single source of truth,前端不持有独立 React state
 * - 后端崩溃时 `safeInvoke` 降级,UI 不会卡死
 * - `try_auto_lock` 在后端跑,前端只是轮询
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 锁定状态(与后端 LockState 对齐) */
export type LockState = "disarmed" | "armed" | "locked";

/** 离座配置(与后端 IdleLockConfig 对齐) */
export interface IdleLockConfig {
  enabled: boolean;
  threshold_secs: number;
  privacy_only: boolean;
}

/** 离座锁定快照(与后端 IdleLockSnapshot 对齐) */
export interface IdleLockSnapshot {
  state: LockState;
  config: IdleLockConfig;
  last_activity_ms: number;
  idle_secs: number;
  has_pin: boolean;
  locked_at_ms: number;
}

/** 解锁结果(与后端 UnlockResult 对齐) */
export type UnlockFailureReason =
  | "none"
  | "pin_not_set"
  | "pin_mismatch"
  | "not_locked";

export interface UnlockResult {
  ok: boolean;
  reason: UnlockFailureReason;
}

/** Hook 选项 */
export interface UseIdleLockOptions {
  /** 状态变化时回调(从 Disarmed→Armed、Armed→Locked、Locked→Armed 等) */
  onStateChange?: (next: LockState, prev: LockState) => void;
  /** 关闭自动 tick,只暴露手动接口(测试 / 高级用法) */
  disableTick?: boolean;
  /** tick 间隔(毫秒),默认 1000 */
  tickIntervalMs?: number;
}

export interface UseIdleLockResult {
  /** 当前快照 */
  snapshot: IdleLockSnapshot | null;
  /** 当前锁定状态 */
  state: LockState;
  /** 是否已锁定 */
  isLocked: boolean;
  /** 是否布防(enabled) */
  isArmed: boolean;
  /** 距今空闲秒数 */
  idleSeconds: number;
  /** 是否设置了 PIN */
  hasPin: boolean;
  /** 启动自动锁定 */
  arm: () => Promise<void>;
  /** 关闭自动锁定 */
  disarm: () => Promise<void>;
  /** 立即锁定 */
  lockNow: () => Promise<void>;
  /** 用 PIN 解锁 */
  unlock: (pin: string) => Promise<UnlockResult>;
  /** 设置 / 更新 PIN;传空字符串清除 */
  setPin: (pin: string) => Promise<IdleLockSnapshot>;
  /** 更新配置 */
  setConfig: (config: IdleLockConfig) => Promise<IdleLockSnapshot>;
  /** 主动上报一次活动(throttle: 500ms) */
  recordActivity: () => void;
  /** 主动拉取最新快照 */
  refresh: () => Promise<void>;
}

const DEFAULT_TICK_MS = 1000;
const ACTIVITY_THROTTLE_MS = 500;

export function useIdleLock(options: UseIdleLockOptions = {}): UseIdleLockResult {
  const { onStateChange, disableTick, tickIntervalMs } = options;
  const tickMs = tickIntervalMs ?? DEFAULT_TICK_MS;

  const [snapshot, setSnapshot] = useState<IdleLockSnapshot | null>(null);

  // 保存上一次的 state,用于状态变化回调
  const previousStateRef = useRef<LockState | null>(null);

  // 保存上一次快照的关键字段,用于判断新快照是否有意义变化。
  // idle_lock_tick 每秒返回新对象(即使内容相同),不加比较会导致
  // IdleLockGate 每秒重渲染,级联触发整棵子树重渲染。
  const prevSnapshotKeyRef = useRef<string>("");

  /** 比较新快照是否与之前有意义不同,避免无变化的 tick 导致重渲染 */
  const commitSnapshotIfChanged = useCallback((next: IdleLockSnapshot) => {
    const key = `${next.state}:${next.idle_secs}:${next.has_pin}:${next.locked_at_ms}:${next.config.enabled}:${next.config.threshold_secs}:${next.config.privacy_only}`;
    if (key === prevSnapshotKeyRef.current) return;
    prevSnapshotKeyRef.current = key;
    setSnapshot(next);
  }, []);

  // activity throttle:防止 mousemove 等高频事件刷爆 IPC
  const lastReportedAtRef = useRef<number>(0);
  const lastReportPendingRef = useRef<boolean>(false);

  /** 静默调用:失败时不抛错 */
  const safeInvoke = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      // 静默降级:后端暂时不可达不应让 UI 崩
      if (typeof console !== "undefined" && import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[useIdleLock] invoke failed:", err);
      }
      return null;
    }
  }, []);

  /** 拉取最新快照 */
  const refresh = useCallback(async () => {
    const next = await safeInvoke(() =>
      invoke<IdleLockSnapshot>("idle_lock_get_state"),
    );
    if (next) {
      commitSnapshotIfChanged(next);
    }
  }, [safeInvoke, commitSnapshotIfChanged]);

  /** 初始化拉取 */
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** tick:让后端评估是否需要自动锁定 */
  useEffect(() => {
    if (disableTick) return;
    const handle = setInterval(() => {
      void safeInvoke(() => invoke<IdleLockSnapshot>("idle_lock_tick")).then(
        (next) => {
          if (next) commitSnapshotIfChanged(next);
        },
      );
    }, tickMs);
    return () => clearInterval(handle);
  }, [disableTick, tickMs, safeInvoke, commitSnapshotIfChanged]);

  /** 状态变化回调 */
  useEffect(() => {
    const current = snapshot?.state ?? null;
    const previous = previousStateRef.current;
    if (current && previous && current !== previous) {
      onStateChange?.(current, previous);
    }
    if (current) {
      previousStateRef.current = current;
    }
  }, [snapshot?.state, onStateChange]);

  /** 启动自动锁定 */
  const arm = useCallback(async () => {
    const next = await safeInvoke(() => invoke<IdleLockSnapshot>("idle_lock_arm"));
    if (next) commitSnapshotIfChanged(next);
  }, [safeInvoke, commitSnapshotIfChanged]);

  /** 关闭自动锁定 */
  const disarm = useCallback(async () => {
    const next = await safeInvoke(() => invoke<IdleLockSnapshot>("idle_lock_disarm"));
    if (next) commitSnapshotIfChanged(next);
  }, [safeInvoke, commitSnapshotIfChanged]);

  /** 立即锁定 */
  const lockNow = useCallback(async () => {
    const next = await safeInvoke(() => invoke<IdleLockSnapshot>("idle_lock_now"));
    if (next) commitSnapshotIfChanged(next);
  }, [safeInvoke, commitSnapshotIfChanged]);

  /** 用 PIN 解锁 */
  const unlock = useCallback(
    async (pin: string): Promise<UnlockResult> => {
      const result = await safeInvoke(() =>
        invoke<UnlockResult>("idle_lock_unlock", { pin }),
      );
      // 解锁后拉一次新快照(状态可能回到 Armed/Disarmed)
      if (result?.ok) {
        await refresh();
      }
      return result ?? { ok: false, reason: "not_locked" };
    },
    [safeInvoke, refresh],
  );

  /** 设置 PIN */
  const setPin = useCallback(
    async (pin: string): Promise<IdleLockSnapshot> => {
      const next = await safeInvoke(() =>
        invoke<IdleLockSnapshot>("idle_lock_set_pin", { pin }),
      );
      const fallback: IdleLockSnapshot = snapshot ?? {
        state: "disarmed",
        config: { enabled: false, threshold_secs: 300, privacy_only: false },
        last_activity_ms: 0,
        idle_secs: 0,
        has_pin: false,
        locked_at_ms: 0,
      };
      const value = next ?? fallback;
      commitSnapshotIfChanged(value);
      return value;
    },
    [safeInvoke, snapshot, commitSnapshotIfChanged],
  );

  /** 更新配置 */
  const setConfig = useCallback(
    async (config: IdleLockConfig): Promise<IdleLockSnapshot> => {
      const next = await safeInvoke(() =>
        invoke<IdleLockSnapshot>("idle_lock_set_config", { config }),
      );
      const fallback: IdleLockSnapshot = snapshot ?? {
        state: "disarmed",
        config,
        last_activity_ms: 0,
        idle_secs: 0,
        has_pin: false,
        locked_at_ms: 0,
      };
      const value = next ?? fallback;
      commitSnapshotIfChanged(value);
      return value;
    },
    [safeInvoke, snapshot, commitSnapshotIfChanged],
  );

  /** 上报活动(throttle 500ms) */
  const recordActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastReportedAtRef.current < ACTIVITY_THROTTLE_MS) {
      lastReportPendingRef.current = true;
      return;
    }
    lastReportedAtRef.current = now;
    lastReportPendingRef.current = false;
    void safeInvoke(() => invoke<IdleLockSnapshot>("idle_lock_record_activity")).then(
      (next) => {
        if (next) {
          commitSnapshotIfChanged(next);
        }
        // throttle 窗口外有 pending 事件 → 触发一次 trailing
        if (lastReportPendingRef.current) {
          lastReportPendingRef.current = false;
          lastReportedAtRef.current = Date.now();
          void safeInvoke(() =>
            invoke<IdleLockSnapshot>("idle_lock_record_activity"),
          ).then((trailing) => {
            if (trailing) commitSnapshotIfChanged(trailing);
          });
        }
      },
    );
  }, [safeInvoke, commitSnapshotIfChanged]);

  const state = snapshot?.state ?? "disarmed";
  return {
    snapshot,
    state,
    isLocked: state === "locked",
    isArmed: state === "armed",
    idleSeconds: snapshot?.idle_secs ?? 0,
    hasPin: snapshot?.has_pin ?? false,
    arm,
    disarm,
    lockNow,
    unlock,
    setPin,
    setConfig,
    recordActivity,
    refresh,
  };
}
