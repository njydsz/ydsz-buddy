/**
 * @file usePerformanceMonitor.ts
 * @description 性能监控 Hook - 集成帧率监控、指标收集和基线管理
 * @module hooks/usePerformanceMonitor
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  baselineManager,
  DegradationResult,
  PerformanceBaseline,
  PerformanceBaselineManager,
  PerformanceReport,
} from "../lib/performanceBaseline";
import {
  MetricSummary,
  MetricType,
  metricsCollector,
  PerformanceMetricsCollector,
} from "../lib/performanceMetrics";

/**
 * 性能监控选项
 */
export interface UsePerformanceMonitorOptions {
  /** 是否启用 */
  enabled?: boolean;
  /** 内存采样间隔（毫秒） */
  memorySampleIntervalMs?: number;
  /** 基线自动更新间隔（毫秒） */
  baselineUpdateIntervalMs?: number;
  /** 警告阈值（退化比例，如 0.2 表示 20%） */
  warningThreshold?: number;
  /** 严重阈值（退化比例，如 0.5 表示 50%） */
  criticalThreshold?: number;
}

/**
 * 性能监控结果
 */
export interface UsePerformanceMonitorResult {
  /** 当前内存使用情况（字节） */
  memoryUsage: number | null;
  /** 内存使用上限（字节） */
  memoryLimit: number | null;
  /** 当前性能报告 */
  report: PerformanceReport | null;
  /** 性能退化列表 */
  degradations: DegradationResult[];
  /** 当前基线 */
  baseline: PerformanceBaseline | null;
  /** 指标摘要列表 */
  summaries: MetricSummary[];
  /** 手动重置基线 */
  resetBaseline: () => void;
  /** 手动构建基线 */
  buildBaseline: () => void;
  /** 导出性能报告 */
  exportReport: () => string;
  /** 清空指标数据 */
  clearMetrics: () => void;
  /** 指标收集器实例 */
  collector: PerformanceMetricsCollector;
}

/**
 * 性能监控 Hook
 *
 * 集成帧率监控、指标收集和基线管理，提供统一的性能监控接口。
 *
 * @example
 * ```tsx
 * const {
 *   memoryUsage,
 *   degradations,
 *   report,
 *   resetBaseline,
 *   exportReport,
 * } = usePerformanceMonitor();
 * ```
 */
export function usePerformanceMonitor(
  options: UsePerformanceMonitorOptions = {}
): UsePerformanceMonitorResult {
  const {
    enabled = true,
    memorySampleIntervalMs = 5000,
    baselineUpdateIntervalMs = 7 * 24 * 60 * 60 * 1000,
    warningThreshold = 0.2,
    criticalThreshold = 0.5,
  } = options;

  const [memoryUsage, setMemoryUsage] = useState<number | null>(null);
  const [memoryLimit, setMemoryLimit] = useState<number | null>(null);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [degradations, setDegradations] = useState<DegradationResult[]>([]);
  const [baseline, setBaseline] = useState<PerformanceBaseline | null>(null);
  const [summaries, setSummaries] = useState<MetricSummary[]>([]);

  const baselineManagerRef = useRef(baselineManager);
  const collectorRef = useRef(metricsCollector);

  // 配置基线管理器
  useEffect(() => {
    baselineManagerRef.current = new PerformanceBaselineManager({
      warningThreshold,
      criticalThreshold,
      updateIntervalMs: baselineUpdateIntervalMs,
    });
  }, [warningThreshold, criticalThreshold, baselineUpdateIntervalMs]);

  // 内存采样
  useEffect(() => {
    if (!enabled) return;

    const sampleMemory = () => {
      if (typeof performance !== "undefined" && "memory" in performance) {
        const mem = (performance as unknown as { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        setMemoryUsage(mem.usedJSHeapSize);
        setMemoryLimit(mem.jsHeapSizeLimit);

        collectorRef.current.recordMemoryUsage();
      }
    };

    sampleMemory();
    const intervalId = setInterval(sampleMemory, memorySampleIntervalMs);

    return () => clearInterval(intervalId);
  }, [enabled, memorySampleIntervalMs]);

  // 定期更新性能报告和退化检测
  useEffect(() => {
    if (!enabled) return;

    const updateReport = () => {
      const currentBaseline = baselineManagerRef.current.getBaseline();
      setBaseline(currentBaseline);

      // 如果需要更新基线
      if (baselineManagerRef.current.shouldUpdateBaseline()) {
        const newBaseline = baselineManagerRef.current.buildBaselineFromCurrent();
        setBaseline(newBaseline);
      }

      const currentDegradations = baselineManagerRef.current.detectAllDegradations();
      setDegradations(currentDegradations);

      const currentReport = baselineManagerRef.current.generateReport();
      setReport(currentReport);

      // 更新摘要
      const types: MetricType[] = [
        "tauri_command",
        "provider_api",
        "filesystem",
        "memory",
      ];
      const currentSummaries: MetricSummary[] = [];
      for (const type of types) {
        const metrics = collectorRef.current.getMetricsByType(type);
        const names = new Set(metrics.map((m) => m.name));
        for (const name of names) {
          const summary = collectorRef.current.calculateSummary(type, name);
          if (summary) {
            currentSummaries.push(summary);
          }
        }
      }
      setSummaries(currentSummaries);
    };

    updateReport();
    const intervalId = setInterval(updateReport, 10000);

    return () => clearInterval(intervalId);
  }, [enabled]);

  const resetBaseline = useCallback(() => {
    const newBaseline = baselineManagerRef.current.resetBaseline();
    setBaseline(newBaseline);
  }, []);

  const buildBaseline = useCallback(() => {
    const newBaseline = baselineManagerRef.current.buildBaselineFromCurrent();
    setBaseline(newBaseline);
  }, []);

  const exportReport = useCallback(() => {
    return baselineManagerRef.current.exportReport();
  }, []);

  const clearMetrics = useCallback(() => {
    collectorRef.current.clear();
    setSummaries([]);
    setDegradations([]);
  }, []);

  return {
    memoryUsage,
    memoryLimit,
    report,
    degradations,
    baseline,
    summaries,
    resetBaseline,
    buildBaseline,
    exportReport,
    clearMetrics,
    collector: collectorRef.current,
  };
}
