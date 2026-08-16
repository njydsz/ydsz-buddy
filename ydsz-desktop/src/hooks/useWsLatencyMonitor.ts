/**
 * @file useWsLatencyMonitor.ts
 * @description WebSocket 消息延迟监控 hook
 *
 * 功能：
 * - 记录每次 WS JSON-RPC 请求的 RTT（Round Trip Time）
 * - 维护滑动窗口（最近 200 条）
 * - 计算 P50/P95/P99 延迟
 * - 提供给 MiniProfiler 和 PerformanceDashboard 使用
 *
 * 使用方式：
 *   const monitor = useWsLatencyMonitor();
 *   monitor.recordRtt("provider.turn", 120);
 *   const stats = monitor.getStats();
 */

import { useCallback, useRef, useState } from "react";

/** WS 延迟记录 */
export interface WsLatencyRecord {
  method: string;
  rttMs: number;
  timestamp: number;
}

/** WS 延迟统计 */
export interface WsLatencyStats {
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** 按方法分组统计 */
  byMethod: Record<string, { count: number; avgMs: number; p95Ms: number }>;
}

/** 最大保留记录数 */
const MAX_RECORDS = 200;

/** 空统计 */
const EMPTY_STATS: WsLatencyStats = {
  count: 0,
  avgMs: 0,
  p50Ms: 0,
  p95Ms: 0,
  p99Ms: 0,
  maxMs: 0,
  byMethod: {},
};

/**
 * 计算 RTT 统计
 */
function computeStats(records: WsLatencyRecord[]): WsLatencyStats {
  if (records.length === 0) return EMPTY_STATS;

  const rtts = records.map((r) => r.rttMs).sort((a, b) => a - b);
  const avg = rtts.reduce((a, b) => a + b, 0) / rtts.length;
  const p50 = rtts[Math.floor(rtts.length * 0.5)] || 0;
  const p95 = rtts[Math.floor(rtts.length * 0.95)] || 0;
  const p99 = rtts[Math.floor(rtts.length * 0.99)] || 0;
  const max = rtts[rtts.length - 1] || 0;

  // 按方法分组
  const methodMap: Record<string, number[]> = {};
  for (const r of records) {
    if (!methodMap[r.method]) methodMap[r.method] = [];
    methodMap[r.method].push(r.rttMs);
  }

  const byMethod: WsLatencyStats["byMethod"] = {};
  for (const [method, rtts] of Object.entries(methodMap)) {
    const sorted = [...rtts].sort((a, b) => a - b);
    byMethod[method] = {
      count: sorted.length,
      avgMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
    };
  }

  return { count: rtts.length, avgMs: avg, p50Ms: p50, p95Ms: p95, p99Ms: p99, maxMs: max, byMethod };
}

/**
 * WebSocket 延迟监控 hook
 */
export function useWsLatencyMonitor() {
  const recordsRef = useRef<WsLatencyRecord[]>([]);
  const [stats, setStats] = useState<WsLatencyStats>(EMPTY_STATS);

  /** 记录一次 RTT */
  const recordRtt = useCallback((method: string, rttMs: number) => {
    recordsRef.current.push({
      method,
      rttMs,
      timestamp: Date.now(),
    });
    // 滑动窗口
    if (recordsRef.current.length > MAX_RECORDS) {
      recordsRef.current = recordsRef.current.slice(-MAX_RECORDS);
    }
    setStats(computeStats(recordsRef.current));
  }, []);

  /** 获取统计 */
  const getStats = useCallback(() => stats, [stats]);

  /** 获取最近记录 */
  const getRecords = useCallback(() => recordsRef.current, []);

  /** 清除记录 */
  const clear = useCallback(() => {
    recordsRef.current = [];
    setStats(EMPTY_STATS);
  }, []);

  return { recordRtt, getStats, getRecords, clear, stats };
}
