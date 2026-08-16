/**
 * @file tauriMetrics.ts
 * @description Tauri 命令 P99 监控埋点 - 记录 invoke 调用耗时并提供 P99 指标
 * @module lib/tauriMetrics
 *
 * ## 设计目标
 *
 * 1. **轻量级**：仅记录命令耗时和成功/失败状态，不捕获 payload
 * 2. **可观测**：提供 P50/P95/P99 实时计算，支持阈值告警
 * 3. **低侵入**：通过包装函数对调用方透明
 * 4. **可重置**：支持运行时清空采样重新统计
 *
 * ## 采样策略
 *
 * - 默认每个命令最多保留 1000 条最近样本
 * - 使用滑动窗口避免历史数据主导
 * - 失败调用也记录（duration 使用超时阈值近似）
 *
 * ## 阈值定义
 *
 * - warning: P99 > 500ms
 * - critical: P99 > 1500ms
 *
 * @example
 * ```typescript
 * import { recordTauriCommand, useTauriCommandMetrics } from "~/lib/tauriMetrics";
 *
 * // 包装 invoke
 * const result = await recordTauriCommand("get_server_ws_url", () =>
 *   invoke<string>("get_server_ws_url")
 * );
 *
 * // 查询 P99
 * const { p99, severity } = useTauriCommandMetrics("get_server_ws_url");
 * ```
 */

import { useSyncExternalStore } from "react";
import type { MetricType } from "./performanceMetrics";

/** Tauri 命令采样 */
export interface TauriCommandSample {
  /** 命令名 */
  command: string;
  /** 耗时（毫秒） */
  durationMs: number;
  /** 时间戳 */
  timestamp: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（仅失败时） */
  error?: string;
}

/** Tauri 命令 P99 指标 */
export interface TauriCommandMetrics {
  /** 命令名 */
  command: string;
  /** 样本数量 */
  count: number;
  /** 成功率（0-1） */
  successRate: number;
  /** 平均耗时（毫秒） */
  avgMs: number;
  /** 中位数（毫秒） */
  p50Ms: number;
  /** 第 95 百分位（毫秒） */
  p95Ms: number;
  /** 第 99 百分位（毫秒） */
  p99Ms: number;
  /** 最大耗时（毫秒） */
  maxMs: number;
  /** 最小耗时（毫秒） */
  minMs: number;
  /** 严重程度 */
  severity: "ok" | "warning" | "critical";
  /** 最近一次采样时间 */
  lastSampleAt: number;
}

/** P99 严重程度阈值（毫秒） */
export const TAURI_P99_WARNING_THRESHOLD_MS = 500;
export const TAURI_P99_CRITICAL_THRESHOLD_MS = 1500;

/** 单个命令最大样本数（滑动窗口） */
const MAX_SAMPLES_PER_COMMAND = 1000;

/**
 * 全局采样表：command -> samples[]
 */
const samplesByCommand = new Map<string, TauriCommandSample[]>();

/** 订阅者表：command -> Set<listener> */
const listenersByCommand = new Map<string, Set<() => void>>();

/** 全局订阅者（订阅所有命令变化） */
const allCommandsListeners = new Set<() => void>();

/**
 * 通知指定命令的订阅者
 */
function notify(command: string): void {
  const listeners = listenersByCommand.get(command);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error("[tauriMetrics] listener error:", error);
      }
    }
  }
  // 同时通知全局订阅者
  for (const listener of allCommandsListeners) {
    try {
      listener();
    } catch (error) {
      console.error("[tauriMetrics] all-listener error:", error);
    }
  }
}

/**
 * 记录一次 Tauri 命令调用
 *
 * @param command - 命令名
 * @param durationMs - 耗时（毫秒）
 * @param success - 是否成功
 * @param error - 错误信息（仅失败时）
 */
export function recordTauriCommand(
  command: string,
  durationMs: number,
  success: boolean,
  error?: string,
): void {
  let samples = samplesByCommand.get(command);
  if (!samples) {
    samples = [];
    samplesByCommand.set(command, samples);
  }

  samples.push({
    command,
    durationMs,
    timestamp: Date.now(),
    success,
    error,
  });

  // 滑动窗口：保留最新 N 条
  if (samples.length > MAX_SAMPLES_PER_COMMAND) {
    samples.splice(0, samples.length - MAX_SAMPLES_PER_COMMAND);
  }

  globalVersion++;
  notify(command);
}

/**
 * 计算百分位数
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];
  const rank = (p / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }
  const weight = rank - lowerIndex;
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

/**
 * 根据 P99 推断严重程度
 */
export function getTauriCommandSeverity(
  p99Ms: number,
): "ok" | "warning" | "critical" {
  if (p99Ms >= TAURI_P99_CRITICAL_THRESHOLD_MS) {
    return "critical";
  }
  if (p99Ms >= TAURI_P99_WARNING_THRESHOLD_MS) {
    return "warning";
  }
  return "ok";
}

/**
 * 计算指定命令的 P99 指标
 */
export function calculateTauriCommandMetrics(
  command: string,
): TauriCommandMetrics | null {
  const samples = samplesByCommand.get(command);
  if (!samples || samples.length === 0) {
    return null;
  }

  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const successCount = samples.filter((s) => s.success).length;
  const successRate = successCount / samples.length;
  const sum = durations.reduce((acc, d) => acc + d, 0);
  const avgMs = sum / durations.length;
  const p50Ms = percentile(durations, 50);
  const p95Ms = percentile(durations, 95);
  const p99Ms = percentile(durations, 99);
  const maxMs = durations[durations.length - 1];
  const minMs = durations[0];
  const severity = getTauriCommandSeverity(p99Ms);
  const lastSampleAt = samples[samples.length - 1]?.timestamp ?? 0;

  return {
    command,
    count: samples.length,
    successRate,
    avgMs,
    p50Ms,
    p95Ms,
    p99Ms,
    maxMs,
    minMs,
    severity,
    lastSampleAt,
  };
}

/**
 * 单命令指标缓存：command -> {version, metrics|null}
 */
const singleMetricsCache = new Map<
  string,
  { version: number; metrics: TauriCommandMetrics | null }
>();

/**
 * 获取单命令指标快照（带版本缓存）
 */
function getSingleMetricsSnapshot(command: string): TauriCommandMetrics | null {
  const cached = singleMetricsCache.get(command);
  if (cached && cached.version === globalVersion) {
    return cached.metrics;
  }
  const metrics = calculateTauriCommandMetrics(command);
  singleMetricsCache.set(command, { version: globalVersion, metrics });
  return metrics;
}

/**
 * 获取所有已记录的命令名
 */
export function getTrackedCommands(): string[] {
  return Array.from(samplesByCommand.keys());
}

/**
 * 订阅指定命令的指标变化
 *
 * @param command - 命令名
 * @param listener - 变化时回调
 * @returns 取消订阅函数
 */
export function subscribeTauriCommand(
  command: string,
  listener: () => void,
): () => void {
  let listeners = listenersByCommand.get(command);
  if (!listeners) {
    listeners = new Set();
    listenersByCommand.set(command, listeners);
  }
  listeners.add(listener);

  return () => {
    const set = listenersByCommand.get(command);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) {
      listenersByCommand.delete(command);
    }
  };
}

/**
 * 订阅所有命令的指标变化
 */
export function subscribeAllTauriCommands(
  listener: () => void,
): () => void {
  allCommandsListeners.add(listener);
  return () => {
    allCommandsListeners.delete(listener);
  };
}

/** 缓存的全命令指标快照引用 */
let cachedAllMetrics: TauriCommandMetrics[] = [];
let cachedAllMetricsVersion = -1;

/** 全局版本号：每次记录新样本或清空时自增 */
let globalVersion = 0;

/**
 * 获取所有命令指标快照（带版本缓存，保证 useSyncExternalStore 引用稳定）
 */
function getAllMetricsSnapshot(): TauriCommandMetrics[] {
  if (cachedAllMetricsVersion === globalVersion) {
    return cachedAllMetrics;
  }
  const result: TauriCommandMetrics[] = [];
  for (const cmd of samplesByCommand.keys()) {
    const m = calculateTauriCommandMetrics(cmd);
    if (m) result.push(m);
  }
  cachedAllMetrics = result;
  cachedAllMetricsVersion = globalVersion;
  return result;
}

/**
 * 清空指定命令的采样
 */
export function clearTauriCommandMetrics(command: string): void {
  samplesByCommand.delete(command);
  globalVersion++;
  notify(command);
}

/**
 * 清空所有命令的采样
 */
export function clearAllTauriCommandMetrics(): void {
  const commands = Array.from(samplesByCommand.keys());
  samplesByCommand.clear();
  globalVersion++;
  for (const cmd of commands) {
    notify(cmd);
  }
}

/**
 * React Hook：订阅指定命令的 P99 指标
 *
 * @param command - 命令名
 * @returns TauriCommandMetrics 或 null（无样本时）
 */
export function useTauriCommandMetrics(
  command: string,
): TauriCommandMetrics | null {
  const subscribe = (listener: () => void) => subscribeTauriCommand(command, listener);
  const getSnapshot = () => getSingleMetricsSnapshot(command);
  // getServerSnapshot 在 SSR 中使用，这里保持一致
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * React Hook：获取所有命令的 P99 指标快照
 */
export function useAllTauriCommandMetrics(): TauriCommandMetrics[] {
  const subscribe = (listener: () => void) => subscribeAllTauriCommands(listener);
  const getSnapshot = () => getAllMetricsSnapshot();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * 包装 Tauri invoke 调用，自动记录 P99 指标
 *
 * @param command - 命令名
 * @param invoker - 原始 invoke 函数
 * @returns invoke 结果
 */
export async function measureTauriInvoke<T>(
  command: string,
  invoker: () => Promise<T>,
): Promise<T> {
  const startTime = performance.now();
  let success = true;
  let errorMessage: string | undefined;

  try {
    const result = await invoker();
    return result;
  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const durationMs = performance.now() - startTime;
    recordTauriCommand(command, durationMs, success, errorMessage);
  }
}

/**
 * 指标类型映射（用于 performanceMetrics 集成）
 */
export function toPerformanceMetricType(): MetricType {
  return "tauri_command";
}
