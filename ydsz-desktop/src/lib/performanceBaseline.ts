/**
 * @file performanceBaseline.ts
 * @description 性能基线管理工具 - 收集、存储和对比性能基线数据
 * @module lib/performanceBaseline
 */

import { MetricSummary, metricsCollector, MetricType } from "./performanceMetrics";

/**
 * 基线条目
 */
export interface BaselineEntry {
  /** 指标类型 */
  type: MetricType;
  /** 指标名称 */
  name: string;
  /** 基线平均值（毫秒） */
  avg: number;
  /** 基线中位数（毫秒） */
  median: number;
  /** 基线第 95 百分位（毫秒） */
  p95: number;
  /** 基线第 99 百分位（毫秒） */
  p99: number;
  /** 基线标准差 */
  stddev: number;
  /** 样本数量 */
  sampleCount: number;
}

/**
 * 性能基线数据
 */
export interface PerformanceBaseline {
  /** 基线版本 */
  version: number;
  /** 基线创建时间 */
  createdAt: number;
  /** 基线最后更新时间 */
  updatedAt: number;
  /** 基线条目列表 */
  entries: BaselineEntry[];
}

/**
 * 性能退化检测结果
 */
export interface DegradationResult {
  /** 指标类型 */
  type: MetricType;
  /** 指标名称 */
  name: string;
  /** 当前值（毫秒） */
  currentValue: number;
  /** 基线值（毫秒） */
  baselineValue: number;
  /** 退化百分比（正数表示退化，负数表示改善） */
  degradationPercent: number;
  /** 是否超过警告阈值 */
  isWarning: boolean;
  /** 是否超过严重阈值 */
  isCritical: boolean;
  /** 严重程度 */
  severity: "ok" | "warning" | "critical";
}

/**
 * 性能报告
 */
export interface PerformanceReport {
  /** 报告生成时间 */
  generatedAt: number;
  /** 基线信息 */
  baseline: PerformanceBaseline | null;
  /** 退化检测结果 */
  degradations: DegradationResult[];
  /** 当前指标摘要 */
  currentSummaries: MetricSummary[];
  /** 总体健康状态 */
  overallHealth: "healthy" | "degraded" | "critical";
}

/** 默认存储键 */
const BASELINE_STORAGE_KEY = "ydsz-buddy:performance-baseline";

/** 默认基线更新间隔（7 天） */
const DEFAULT_BASELINE_UPDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** 默认警告阈值（20%） */
const DEFAULT_WARNING_THRESHOLD = 0.2;

/** 默认严重阈值（50%） */
const DEFAULT_CRITICAL_THRESHOLD = 0.5;

/**
 * 性能基线管理器
 */
export class PerformanceBaselineManager {
  private baseline: PerformanceBaseline | null = null;
  private storageKey: string;
  private warningThreshold: number;
  private criticalThreshold: number;
  private updateIntervalMs: number;

  constructor(options?: {
    storageKey?: string;
    warningThreshold?: number;
    criticalThreshold?: number;
    updateIntervalMs?: number;
  }) {
    this.storageKey = options?.storageKey ?? BASELINE_STORAGE_KEY;
    this.warningThreshold = options?.warningThreshold ?? DEFAULT_WARNING_THRESHOLD;
    this.criticalThreshold = options?.criticalThreshold ?? DEFAULT_CRITICAL_THRESHOLD;
    this.updateIntervalMs =
      options?.updateIntervalMs ?? DEFAULT_BASELINE_UPDATE_INTERVAL_MS;

    this.loadBaseline();
  }

  /**
   * 从 localStorage 加载基线数据
   */
  loadBaseline(): PerformanceBaseline | null {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.baseline = JSON.parse(stored) as PerformanceBaseline;
      }
    } catch (error) {
      console.error("[PerformanceBaseline] Failed to load baseline:", error);
      this.baseline = null;
    }
    return this.baseline;
  }

  /**
   * 保存基线数据到 localStorage
   */
  saveBaseline(): void {
    if (!this.baseline) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.baseline));
    } catch (error) {
      console.error("[PerformanceBaseline] Failed to save baseline:", error);
    }
  }

  /**
   * 获取当前基线
   */
  getBaseline(): PerformanceBaseline | null {
    return this.baseline;
  }

  /**
   * 检查是否需要更新基线
   */
  shouldUpdateBaseline(): boolean {
    if (!this.baseline) return true;

    const now = Date.now();
    return now - this.baseline.updatedAt >= this.updateIntervalMs;
  }

  /**
   * 从当前指标收集器构建新基线
   */
  buildBaselineFromCurrent(): PerformanceBaseline {
    const types: MetricType[] = [
      "tauri_command",
      "provider_api",
      "filesystem",
      "memory",
      "frame_rate",
    ];

    const entries: BaselineEntry[] = [];

    for (const type of types) {
      const metrics = metricsCollector.getMetricsByType(type);
      const names = new Set(metrics.map((m) => m.name));

      for (const name of names) {
        const summary = metricsCollector.calculateSummary(type, name);
        if (summary && summary.count >= 3) {
          entries.push({
            type,
            name,
            avg: summary.avg,
            median: summary.median,
            p95: summary.p95,
            p99: summary.p99,
            stddev: summary.stddev,
            sampleCount: summary.count,
          });
        }
      }
    }

    const now = Date.now();
    this.baseline = {
      version: (this.baseline?.version ?? 0) + 1,
      createdAt: this.baseline?.createdAt ?? now,
      updatedAt: now,
      entries,
    };

    this.saveBaseline();
    return this.baseline;
  }

  /**
   * 重置基线（清空并重新收集）
   */
  resetBaseline(): PerformanceBaseline {
    this.baseline = null;
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error("[PerformanceBaseline] Failed to remove baseline:", error);
    }
    return this.buildBaselineFromCurrent();
  }

  /**
   * 检测单个指标的性能退化
   */
  detectDegradation(
    type: MetricType,
    name: string,
    currentValue: number
  ): DegradationResult | null {
    if (!this.baseline) return null;

    const entry = this.baseline.entries.find(
      (e) => e.type === type && e.name === name
    );
    if (!entry) return null;

    const baselineValue = entry.avg;
    const degradationPercent = (currentValue - baselineValue) / baselineValue;

    const isCritical = degradationPercent >= this.criticalThreshold;
    const isWarning = degradationPercent >= this.warningThreshold;

    return {
      type,
      name,
      currentValue,
      baselineValue,
      degradationPercent,
      isWarning,
      isCritical,
      severity: isCritical ? "critical" : isWarning ? "warning" : "ok",
    };
  }

  /**
   * 检测所有指标的性能退化
   */
  detectAllDegradations(): DegradationResult[] {
    if (!this.baseline) return [];

    const degradations: DegradationResult[] = [];
    const types: MetricType[] = [
      "tauri_command",
      "provider_api",
      "filesystem",
      "memory",
    ];

    for (const type of types) {
      const metrics = metricsCollector.getMetricsByType(type);
      const names = new Set(metrics.map((m) => m.name));

      for (const name of names) {
        const summary = metricsCollector.calculateSummary(type, name);
        if (summary) {
          const result = this.detectDegradation(type, name, summary.avg);
          if (result) {
            degradations.push(result);
          }
        }
      }
    }

    return degradations;
  }

  /**
   * 生成性能报告
   */
  generateReport(): PerformanceReport {
    const degradations = this.detectAllDegradations();
    const types: MetricType[] = [
      "tauri_command",
      "provider_api",
      "filesystem",
      "memory",
    ];
    const currentSummaries: MetricSummary[] = [];

    for (const type of types) {
      const metrics = metricsCollector.getMetricsByType(type);
      const names = new Set(metrics.map((m) => m.name));
      for (const name of names) {
        const summary = metricsCollector.calculateSummary(type, name);
        if (summary) {
          currentSummaries.push(summary);
        }
      }
    }

    const hasCritical = degradations.some((d) => d.severity === "critical");
    const hasWarning = degradations.some((d) => d.severity === "warning");

    const overallHealth: PerformanceReport["overallHealth"] = hasCritical
      ? "critical"
      : hasWarning
        ? "degraded"
        : "healthy";

    return {
      generatedAt: Date.now(),
      baseline: this.baseline,
      degradations,
      currentSummaries,
      overallHealth,
    };
  }

  /**
   * 导出性能报告为 JSON
   */
  exportReport(): string {
    return JSON.stringify(this.generateReport(), null, 2);
  }
}

// 导出全局单例
export const baselineManager = new PerformanceBaselineManager();
