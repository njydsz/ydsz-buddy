/**
 * @file monitor.ts
 * @description 桌面端崩溃 + 性能监控接口 —— 默认走 console stub,
 *              通过 setMonitorImpl 注入真实实现(Sentry / 自家后端)。
 *
 * 设计原则(与移动端 monitor.ts 对齐):
 *  1. **不强制依赖**:不引入 Sentry SDK,保持 bundle 小。
 *  2. **统一接口**:captureError / captureMessage / startSpan / endSpan。
 *  3. **PII 安全**:严禁把 token / 消息内容 / 文件路径写入 error context。
 *     调用方在 captureError 时需主动做脱敏。
 *  4. **可降级**:真实实现 throw 时自动降级回 console,不阻塞主流程。
 *  5. **Tauri 桥接**:可通过 tauri 通道把错误转发到后端(可选,默认 console)。
 */

export type ErrorContext = Record<
  string,
  string | number | boolean | null | undefined
>;

export type ErrorPayload = {
  /** 简短错误类型,如 "TypeError" / "NetworkError" / "ReactErrorBoundary" */
  type: string;
  message: string;
  /** stack trace 顶层 5 帧 */
  stack?: string;
  context?: ErrorContext;
  /** 严重级别:info/warning/error/fatal */
  level?: "info" | "warning" | "error" | "fatal";
};

export type Span = {
  /** 业务名,如 "rpc.call" / "ws.connect" / "page.render" */
  name: string;
  /** 开始时间(performance.now()) */
  start: number;
  /** 自定义标签 */
  tags?: ErrorContext;
};

export type MonitorImpl = {
  captureError: (payload: ErrorPayload) => void;
  captureMessage: (message: string, context?: ErrorContext) => void;
  /** 自定义数值指标(非错误,例如 aiShare / aiLines / 渲染耗时) */
  captureMetric?: (name: string, value: number, context?: ErrorContext) => void;
  startSpan: (name: string, tags?: ErrorContext) => Span;
  endSpan: (span: Span, extra?: ErrorContext) => void;
};

const noopImpl: MonitorImpl = {
  captureError: (p) => {
    // eslint-disable-next-line no-console
    console.error(`[monitor] ${p.type}: ${p.message}`, p.context ?? {});
  },
  captureMessage: (m, c) => {
    // eslint-disable-next-line no-console
    console.warn(`[monitor] ${m}`, c ?? {});
  },
  startSpan: (name) => ({ name, start: performance.now() }),
  endSpan: (span) => {
    const ms = performance.now() - span.start;
    // eslint-disable-next-line no-console
    console.debug(`[monitor] span ${span.name} = ${ms.toFixed(1)}ms`);
  },
};

let currentImpl: MonitorImpl = noopImpl;

/** 注入真实监控实现(Sentry / 自家后端 / Tauri IPC 转发) */
export function setMonitorImpl(impl: MonitorImpl): void {
  currentImpl = impl;
}

/** 重置为 console stub(测试 / 隐私擦除用) */
export function resetMonitorImpl(): void {
  currentImpl = noopImpl;
}

/** 取回当前实现(测试断言用) */
export function getMonitorImpl(): MonitorImpl {
  return currentImpl;
}

function safeCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    // 监控 SDK 自身失败时,降级到 console
    // eslint-disable-next-line no-console
    console.error("[monitor] impl failed", e);
    return undefined;
  }
}

export const monitor = {
  captureError(payload: ErrorPayload): void {
    safeCall(() => currentImpl.captureError(payload));
  },
  captureMessage(message: string, context?: ErrorContext): void {
    safeCall(() => currentImpl.captureMessage(message, context));
  },
  captureMetric(name: string, value: number, context?: ErrorContext): void {
    safeCall(() => currentImpl.captureMetric?.(name, value, context));
  },
  startSpan(name: string, tags?: ErrorContext): Span {
    return (
      safeCall(() => currentImpl.startSpan(name, tags)) ?? {
        name,
        start: performance.now(),
        tags,
      }
    );
  },
  endSpan(span: Span, extra?: ErrorContext): void {
    safeCall(() => currentImpl.endSpan(span, extra));
  },
};

/**
 * 高阶工具:用 monitor.startSpan/endSpan 包一层异步操作,
 * 自动捕获异常 → monitor.captureError。
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  context?: ErrorContext,
): Promise<T> {
  const span = monitor.startSpan(name, context);
  try {
    const out = await fn();
    monitor.endSpan(span);
    return out;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    monitor.endSpan(span, { ok: "0" });
    monitor.captureError({
      type: err.name || "Error",
      message: err.message,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
      context: { span: name, ...(context ?? {}) },
      level: "error",
    });
    throw e;
  }
}
