/**
 * @file performanceMetrics.ts
 * @description 性能指标定义和收集工具 - 提供统一的性能数据采集接口
 * @module lib/performanceMetrics
 */

/**
 * 性能指标类型
 */
export type MetricType = 
  | "tauri_command"
  | "provider_api"
  | "filesystem"
  | "memory"
  | "frame_rate";

/**
 * 性能指标记录
 */
export interface PerformanceMetric {
  /** 指标类型 */
  type: MetricType;
  /** 指标名称 */
  name: string;
  /** 执行时间（毫秒） */
  duration: number;
  /** 时间戳 */
  timestamp: number;
  /** 额外的元数据 */
  metadata?: Record<string, unknown>;
  /** 是否成功 */
  success?: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 性能指标统计摘要
 */
export interface MetricSummary {
  /** 指标类型 */
  type: MetricType;
  /** 指标名称 */
  name: string;
  /** 样本数量 */
  count: number;
  /** 平均值（毫秒） */
  avg: number;
  /** 最小值（毫秒） */
  min: number;
  /** 最大值（毫秒） */
  max: number;
  /** 中位数（毫秒） */
  median: number;
  /** 第 95 百分位（毫秒） */
  p95: number;
  /** 第 99 百分位（毫秒） */
  p99: number;
  /** 标准差 */
  stddev: number;
}

/**
 * 性能指标收集器
 */
export class PerformanceMetricsCollector {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetricsCount = 10000;

  /**
   * 记录性能指标
   */
  record(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    // 防止内存溢出，保留最新的记录
    if (this.metrics.length > this.maxMetricsCount) {
      this.metrics = this.metrics.slice(-this.maxMetricsCount);
    }
  }

  /**
   * 开始计时并返回一个结束函数
   */
  startTimer(
    type: MetricType,
    name: string,
    metadata?: Record<string, unknown>
  ): () => void {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      this.record({
        type,
        name,
        duration,
        timestamp: Date.now(),
        metadata,
        success: true,
      });
    };
  }

  /**
   * 记录 Tauri 命令执行
   */
  async measureTauriCommand<T>(
    commandName: string,
    command: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const endTimer = this.startTimer("tauri_command", commandName, metadata);
    try {
      const result = await command();
      endTimer();
      return result;
    } catch (error) {
      const duration = performance.now() - performance.now(); // 近似值
      this.record({
        type: "tauri_command",
        name: commandName,
        duration,
        timestamp: Date.now(),
        metadata,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 记录 Provider API 调用
   */
  async measureProviderApi<T>(
    providerName: string,
    apiCall: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const endTimer = this.startTimer("provider_api", providerName, metadata);
    try {
      const result = await apiCall();
      endTimer();
      return result;
    } catch (error) {
      this.record({
        type: "provider_api",
        name: providerName,
        duration: 0,
        timestamp: Date.now(),
        metadata,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 记录文件系统操作
   */
  async measureFilesystem<T>(
    operationName: string,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const endTimer = this.startTimer("filesystem", operationName, metadata);
    try {
      const result = await operation();
      endTimer();
      return result;
    } catch (error) {
      this.record({
        type: "filesystem",
        name: operationName,
        duration: 0,
        timestamp: Date.now(),
        metadata,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 记录内存使用情况
   */
  recordMemoryUsage(): void {
    if (typeof performance === "undefined") {
      return;
    }

    // performance.memory 是非标准 API，仅在 Chromium 浏览器中可用
    const perfWithMemory = performance as unknown as {
      memory?: {
        totalJSHeapSize: number;
        usedJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };

    if (!perfWithMemory.memory) {
      return;
    }

    const memory = perfWithMemory.memory;
    this.record({
      type: "memory",
      name: "heap_usage",
      duration: memory.usedJSHeapSize,
      timestamp: Date.now(),
      metadata: {
        totalJSHeapSize: memory.totalJSHeapSize,
        usedJSHeapSize: memory.usedJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      },
    });
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * 获取指定类型的指标
   */
  getMetricsByType(type: MetricType): PerformanceMetric[] {
    return this.metrics.filter((m) => m.type === type);
  }

  /**
   * 获取指定时间范围内的指标
   */
  getMetricsInRange(startTime: number, endTime: number): PerformanceMetric[] {
    return this.metrics.filter(
      (m) => m.timestamp >= startTime && m.timestamp <= endTime
    );
  }

  /**
   * 计算指标统计摘要
   */
  calculateSummary(type: MetricType, name?: string): MetricSummary | null {
    let filteredMetrics = this.metrics.filter((m) => m.type === type);
    
    if (name) {
      filteredMetrics = filteredMetrics.filter((m) => m.name === name);
    }

    if (filteredMetrics.length === 0) {
      return null;
    }

    const durations = filteredMetrics.map((m) => m.duration).sort((a, b) => a - b);
    const count = durations.length;
    const sum = durations.reduce((acc, d) => acc + d, 0);
    const avg = sum / count;
    const min = durations[0];
    const max = durations[count - 1];
    const median = this.percentile(durations, 50);
    const p95 = this.percentile(durations, 95);
    const p99 = this.percentile(durations, 99);
    
    // 计算标准差
    const variance = durations.reduce((acc, d) => acc + Math.pow(d - avg, 2), 0) / count;
    const stddev = Math.sqrt(variance);

    return {
      type,
      name: name || "all",
      count,
      avg,
      min,
      max,
      median,
      p95,
      p99,
      stddev,
    };
  }

  /**
   * 计算百分位数
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    if (p <= 0) return sortedArray[0];
    if (p >= 100) return sortedArray[sortedArray.length - 1];

    const rank = (p / 100) * (sortedArray.length - 1);
    const lowerIndex = Math.floor(rank);
    const upperIndex = Math.ceil(rank);

    if (lowerIndex === upperIndex) {
      return sortedArray[lowerIndex];
    }

    const weight = rank - lowerIndex;
    return sortedArray[lowerIndex] * (1 - weight) + sortedArray[upperIndex] * weight;
  }

  /**
   * 清空所有指标
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * 导出指标为 JSON
   */
  exportToJSON(): string {
    return JSON.stringify(this.metrics, null, 2);
  }

  /**
   * 从 JSON 导入指标
   */
  importFromJSON(json: string): void {
    try {
      const imported = JSON.parse(json) as PerformanceMetric[];
      this.metrics = imported;
    } catch (error) {
      console.error("Failed to import metrics:", error);
    }
  }
}

// 导出全局单例
export const metricsCollector = new PerformanceMetricsCollector();
