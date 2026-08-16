/**
 * @file goalModeTelemetry.ts
 * @description Goal Mode 性能埋点 - 为 24h 长跑测试提供关键路径指标采集
 *
 * ## 设计目标
 *
 * 24h 长跑要求 Goal Mode 在持续运行场景下保持稳定。本模块:
 *
 * 1. **关键路径计时**:包裹 `goal.listActive` / `goal.start` / `goal.abort`
 *   等后端命令,记录调用耗时 → 写入 `metricsCollector`
 * 2. **会话级指标**:汇总 running/achieved/aborted 目标数,
 *   启动/中止成功率等业务级指标
 * 3. **降级信号**:连续 N 次 listActive 失败或 P99 退化时,生成
 *   `goalModeDegraded` 事件供长跑监控消费
 * 4. **零侵入**:业务组件只需 import 一次,无需修改调用处
 *
 * ## 使用
 *
 * ```ts
 * import { measureGoalApi, recordGoalLifecycle } from "~/lib/goalModeTelemetry";
 *
 * const goals = await measureGoalApi("listActive", () => nativeApi.goal.listActive());
 * recordGoalLifecycle({ event: "start", goalId, durationMs, success: true });
 * ```
 *
 * @module lib/goalModeTelemetry
 */

import { metricsCollector, type MetricType } from "./performanceMetrics";

/**
 * Goal Mode 指标名称常量 - 统一管理,避免散落字符串
 */
export const GOAL_METRIC_NAMES = {
  /** 列出活跃目标 */
  listActive: "goal.listActive",
  /** 启动目标 */
  start: "goal.start",
  /** 中止目标 */
  abort: "goal.abort",
  /** 状态归一化 */
  normalize: "goal.normalize",
  /** 渲染面板 */
  render: "goal.render",
  /** 自动刷新轮询 */
  poll: "goal.poll",
} as const;

/** Goal Mode 自定义 MetricType(扩展 performanceMetrics) */
export type GoalMetricType = "goal_mode" | MetricType;

/**
 * Goal 生命周期事件
 */
export type GoalLifecycleEvent =
  | "start"
  | "abort"
  | "complete"
  | "list-fail"
  | "list-empty";

/**
 * Goal 生命周期记录
 */
export interface GoalLifecycleRecord {
  /** 事件类型 */
  event: GoalLifecycleEvent;
  /** 目标 ID(若适用) */
  goalId?: string;
  /** 耗时(毫秒) */
  durationMs?: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息(若失败) */
  error?: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * Goal Mode 会话级指标
 */
export interface GoalSessionMetrics {
  /** 启动次数 */
  startCount: number;
  /** 启动成功次数 */
  startSuccess: number;
  /** 启动失败次数 */
  startFailure: number;
  /** 中止次数 */
  abortCount: number;
  /** 中止成功次数 */
  abortSuccess: number;
  /** 中止失败次数 */
  abortFailure: number;
  /** listActive 调用次数 */
  listCount: number;
  /** listActive 失败次数 */
  listFailure: number;
  /** listActive 连续失败计数(用于降级信号) */
  consecutiveListFailures: number;
  /** 当前活跃目标数(running) */
  activeRunning: number;
  /** 当前已达成目标数 */
  activeAchieved: number;
  /** 当前已中止目标数 */
  activeAborted: number;
  /** session 起始时间 */
  sessionStart: number;
  /** 最后一次更新 */
  lastUpdate: number;
}

/**
 * Goal Mode 降级信号回调
 */
export type GoalDegradationHandler = (info: {
  reason: "consecutive-failures" | "p99-degraded" | "memory-leak";
  message: string;
  metrics: GoalSessionMetrics;
}) => void;

const DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD = 5;

/**
 * Goal Mode 性能埋点器(单例)
 */
export class GoalModeTelemetry {
  private session: GoalSessionMetrics;
  private degradationHandlers: Set<GoalDegradationHandler> = new Set();
  private consecutiveFailureThreshold: number;

  constructor(options: { consecutiveFailureThreshold?: number } = {}) {
    this.consecutiveFailureThreshold =
      options.consecutiveFailureThreshold ?? DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD;
    this.session = this.createEmptySession();
  }

  private createEmptySession(): GoalSessionMetrics {
    const now = Date.now();
    return {
      startCount: 0,
      startSuccess: 0,
      startFailure: 0,
      abortCount: 0,
      abortSuccess: 0,
      abortFailure: 0,
      listCount: 0,
      listFailure: 0,
      consecutiveListFailures: 0,
      activeRunning: 0,
      activeAchieved: 0,
      activeAborted: 0,
      sessionStart: now,
      lastUpdate: now,
    };
  }

  /**
   * 重置 session 指标
   */
  resetSession(): void {
    this.session = this.createEmptySession();
  }

  /**
   * 获取当前 session 指标快照
   */
  getSessionMetrics(): Readonly<GoalSessionMetrics> {
    return { ...this.session };
  }

  /**
   * 注册降级信号回调
   */
  onDegradation(handler: GoalDegradationHandler): () => void {
    this.degradationHandlers.add(handler);
    return () => this.degradationHandlers.delete(handler);
  }

  private emitDegradation(
    reason: "consecutive-failures" | "p99-degraded" | "memory-leak",
    message: string,
  ): void {
    if (this.degradationHandlers.size === 0) return;
    for (const handler of this.degradationHandlers) {
      try {
        handler({ reason, message, metrics: this.getSessionMetrics() });
      } catch {
        // 静默失败,避免污染主流程
      }
    }
  }

  /**
   * 测量并执行 goal 命令(同步/异步),写入 metricsCollector + session
   *
   * @param op 操作名(对应 GOAL_METRIC_NAMES 中的一项)
   * @param fn 实际执行的函数
   * @returns fn 的返回值
   */
  async measure<T>(
    op: keyof typeof GOAL_METRIC_NAMES,
    fn: () => Promise<T>,
  ): Promise<T> {
    const name = GOAL_METRIC_NAMES[op];
    const start = performance.now();
    let success = false;
    let error: string | undefined;
    try {
      const result = await fn();
      success = true;
      this.recordCall(op, true);
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.recordCall(op, false, error);
      throw err;
    } finally {
      const duration = performance.now() - start;
      // 写入 metricsCollector(用 tauri_command 类型,长跑时由基线统一对比)
      metricsCollector.record({
        type: "tauri_command",
        name,
        duration,
        timestamp: Date.now(),
        success,
        error,
        metadata: { module: "goal_mode" },
      });
    }
  }

  private recordCall(
    op: keyof typeof GOAL_METRIC_NAMES,
    success: boolean,
    _error?: string,
  ): void {
    this.session.lastUpdate = Date.now();
    switch (op) {
      case "listActive":
        this.session.listCount += 1;
        if (!success) {
          this.session.listFailure += 1;
          this.session.consecutiveListFailures += 1;
          if (
            this.session.consecutiveListFailures >=
            this.consecutiveFailureThreshold
          ) {
            this.emitDegradation(
              "consecutive-failures",
              `goal.listActive 连续失败 ${this.session.consecutiveListFailures} 次`,
            );
          }
        } else {
          this.session.consecutiveListFailures = 0;
        }
        break;
      case "start":
        this.session.startCount += 1;
        if (success) {
          this.session.startSuccess += 1;
        } else {
          this.session.startFailure += 1;
        }
        break;
      case "abort":
        this.session.abortCount += 1;
        if (success) {
          this.session.abortSuccess += 1;
        } else {
          this.session.abortFailure += 1;
        }
        break;
      default:
        break;
    }
  }

  /**
   * 更新活跃目标计数(由 listActive 调用方在拿到结果后调用)
   */
  updateActiveCounts(counts: {
    running: number;
    achieved: number;
    aborted: number;
  }): void {
    this.session.activeRunning = counts.running;
    this.session.activeAchieved = counts.achieved;
    this.session.activeAborted = counts.aborted;
    this.session.lastUpdate = Date.now();
  }

  /**
   * 记录一次 listActive 失败(measure 抛错时不会到这里,
   * 但业务侧若需手动降级可调用)
   */
  recordListFailure(reason: string): void {
    this.session.listFailure += 1;
    this.session.consecutiveListFailures += 1;
    this.session.lastUpdate = Date.now();
    if (
      this.session.consecutiveListFailures >=
      this.consecutiveFailureThreshold
    ) {
      this.emitDegradation(
        "consecutive-failures",
        `goal.listActive 连续失败 ${this.session.consecutiveListFailures} 次: ${reason}`,
      );
    }
  }

  /**
   * 记录一次 listActive 成功(供业务侧手动重置连续失败计数)
   */
  recordListSuccess(): void {
    this.session.consecutiveListFailures = 0;
    this.session.lastUpdate = Date.now();
  }

  /**
   * 导出 session 报告(JSON)
   */
  exportSessionReport(): string {
    return JSON.stringify(
      {
        generatedAt: Date.now(),
        session: this.session,
        duration: Date.now() - this.session.sessionStart,
      },
      null,
      2,
    );
  }
}

/** 全局单例 */
export const goalModeTelemetry = new GoalModeTelemetry();

/**
 * 便捷方法:测量 goal API 调用(全局单例包装)
 */
export async function measureGoalApi<T>(
  op: keyof typeof GOAL_METRIC_NAMES,
  fn: () => Promise<T>,
): Promise<T> {
  return goalModeTelemetry.measure(op, fn);
}

/**
 * 记录 goal 生命周期事件(独立于 measure,业务侧可选择性调用)
 */
export function recordGoalLifecycle(record: Omit<GoalLifecycleRecord, "timestamp">): void {
  const full: GoalLifecycleRecord = { ...record, timestamp: Date.now() };
  // 写入 metricsCollector 的 metadata,方便长跑测试聚合
  metricsCollector.record({
    type: "tauri_command",
    name: `goal.lifecycle.${record.event}`,
    duration: record.durationMs ?? 0,
    timestamp: full.timestamp,
    success: record.success,
    error: record.error,
    metadata: {
      goalId: record.goalId,
      event: record.event,
    },
  });
}
