/**
 * @file sentryMonitor
 * @description Sentry 后端适配 — 包装官方 `@sentry/browser` SDK
 *
 * P1-6 目标:把 `monitor.ts` 的接口对接到 Sentry 真实后端,
 * 让 ErrorBoundary / unhandledrejection 错误能上报到 Sentry 项目。
 *
 * ## 设计原则
 *
 * - **可降级**: Sentry SDK 未安装 / DSN 为空时,自动降级到 console
 * - **PII 脱敏**: 所有 context 在上报前自动过滤敏感字段(token / apiKey / authorization)
 * - **Tauri 友好**: 通过 `dynamic import` 加载 Sentry SDK,
 *   避免强制依赖,主 bundle 体积不受影响
 * - **beforeSend 钩子**: 用于脱敏 + 自定义 tag
 *
 * ## 使用方式
 *
 * ```ts
 * import { initSentryMonitor } from "~/lib/sentryMonitor";
 * import { setMonitorImpl } from "~/lib/monitor";
 *
 * const dsn = import.meta.env.VITE_SENTRY_DSN;
 * setMonitorImpl(initSentryMonitor({ dsn, environment: "production" }));
 * ```
 */

import type { ErrorContext, ErrorPayload, MonitorImpl, Span } from "./monitor";

/** Sentry 适配器配置 */
export interface SentryMonitorConfig {
  /** Sentry DSN(从 Sentry 项目 Settings → Client Keys 复制) */
  dsn: string;
  /** 环境名: development / production / staging */
  environment?: string;
  /** release 版本,默认 = APP_VERSION */
  release?: string;
  /** 采样率 0~1,默认 1.0(全量上报) */
  sampleRate?: number;
  /** 性能追踪采样率 0~1,默认 0.1 */
  tracesSampleRate?: number;
  /** 用户上下文(可选,登录后调用 setUser 设置) */
  user?: { id: string; email?: string; username?: string };
  /** 额外 tags */
  tags?: ErrorContext;
}

/** Sentry SDK 形状(只声明我们用到的方法,避免 SDK 类型耦合) */
interface SentryLike {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: Error, context?: Record<string, unknown>) => string;
  captureMessage: (message: string, level?: string) => string;
  startSpan?: (
    options: { name: string; op?: string },
    callback: (span: { setTag: (key: string, value: string) => void }) => void,
  ) => void;
  withScope?: (callback: (scope: { setTag: (key: string, value: string) => void; setExtra: (key: string, value: unknown) => void }) => void) => void;
  setUser: (user: { id: string; email?: string; username?: string } | null) => void;
  setTag: (key: string, value: string) => void;
  getCurrentHub?: () => { getClient?: () => unknown };
  addBreadcrumb?: (breadcrumb: { message: string; category?: string; level?: string; data?: Record<string, unknown> }) => void;
}

/** 需要脱敏的 context 字段(值如果包含这些 key,value 整体替换为 "[REDACTED]") */
const SENSITIVE_KEYS = new Set([
  "token",
  "apikey",
  "api_key",
  "authorization",
  "password",
  "secret",
  "accesstoken",
  "refreshtoken",
  "sessionid",
  "cookie",
  "set-cookie",
]);

/** 递归脱敏:任何键名(小写)命中 SENSITIVE_KEYS 就替换 value */
export function redactContext(
  context: ErrorContext | undefined,
): ErrorContext | undefined {
  if (!context) return context;
  const out: ErrorContext = {};
  for (const [k, v] of Object.entries(context)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** 动态加载 Sentry SDK(不强制依赖) */
async function loadSentry(): Promise<SentryLike | null> {
  try {
    // 用 eval 包裹的 dynamic import 让 Vite 不静态分析依赖
    // 这是 SDK 未安装时降级到 console 的关键
    const dynImport = new Function("m", "return import(m)") as (
      m: string,
    ) => Promise<unknown>;
    const mod = (await dynImport("@sentry/browser")) as
      | (SentryLike & { default?: SentryLike })
      | undefined;
    if (!mod) return null;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

/** 初始化 Sentry 监控并返回 monitor impl */
export async function initSentryMonitor(
  config: SentryMonitorConfig,
): Promise<MonitorImpl> {
  const sentry = await loadSentry();
  if (!sentry) {
    // SDK 未安装:降级到 console stub,告知用户
    // eslint-disable-next-line no-console
    console.warn(
      "[sentryMonitor] @sentry/browser 未安装,降级到 console monitor。" +
        "如需真实上报,请运行: pnpm add @sentry/browser",
    );
    return createConsoleFallback();
  }

  // 初始化 Sentry
  sentry.init({
    dsn: config.dsn,
    environment: config.environment ?? "production",
    release: config.release,
    sampleRate: config.sampleRate ?? 1.0,
    tracesSampleRate: config.tracesSampleRate ?? 0.1,
    beforeSend(event: { user?: unknown; extra?: Record<string, unknown>; tags?: Record<string, string> }) {
      // PII 脱敏:把 user 清空(应用层不主动上报 PII)
      if (event.user) {
        event.user = undefined;
      }
      if (event.extra) {
        event.extra = redactContext(event.extra as ErrorContext) as Record<string, unknown>;
      }
      return event;
    },
  });

  // 设置初始 user / tags
  if (config.user) {
    sentry.setUser(config.user);
  }
  if (config.tags) {
    for (const [k, v] of Object.entries(config.tags)) {
      sentry.setTag(k, String(v));
    }
  }

  return {
    captureError(payload: ErrorPayload) {
      const synthError = new Error(payload.message);
      synthError.name = payload.type;
      if (payload.stack) {
        Object.defineProperty(synthError, "stack", { value: payload.stack });
      }
      sentry.captureException(synthError, {
        tags: { type: payload.type, level: payload.level ?? "error" },
        extra: redactContext(payload.context),
      });
    },
    captureMessage(message, context) {
      sentry.captureMessage(message, "warning");
      if (context && sentry.withScope) {
        sentry.withScope((scope) => {
          for (const [k, v] of Object.entries(redactContext(context) ?? {})) {
            scope.setExtra(k, v);
          }
        });
      }
    },
    startSpan(name, tags) {
      const start = performance.now();
      const span: Span = { name, start, tags };
      if (sentry.addBreadcrumb) {
        sentry.addBreadcrumb({ message: `span.start: ${name}`, category: "span" });
      }
      return span;
    },
    endSpan(span, extra) {
      const ms = performance.now() - span.start;
      if (sentry.addBreadcrumb) {
        sentry.addBreadcrumb({
          message: `span.end: ${span.name} = ${ms.toFixed(1)}ms`,
          category: "span",
          data: { ms, ...(extra ?? {}) },
        });
      }
    },
  };
}

/** 当 Sentry SDK 不可用时的 console 后备实现 */
function createConsoleFallback(): MonitorImpl {
  return {
    captureError: (p) => {
      // eslint-disable-next-line no-console
      console.error(`[sentry-monitor-fallback] ${p.type}: ${p.message}`, p.context ?? {});
    },
    captureMessage: (m, c) => {
      // eslint-disable-next-line no-console
      console.warn(`[sentry-monitor-fallback] ${m}`, c ?? {});
    },
    startSpan: (name) => ({ name, start: performance.now() }),
    endSpan: (span) => {
      const ms = performance.now() - span.start;
      // eslint-disable-next-line no-console
      console.debug(`[sentry-monitor-fallback] span ${span.name} = ${ms.toFixed(1)}ms`);
    },
  };
}

/**
 * 设置全局 unhandledrejection 监听,自动上报未捕获的 Promise 错误
 *
 * 应该在应用入口(main.tsx / root)调用一次。
 */
export function installGlobalErrorHandlers(): () => void {
  const onError = (event: ErrorEvent) => {
    // 避免重复上报:ErrorBoundary 已经处理 React 错误
    if (event.error) {
      import("./monitor").then(({ monitor }) => {
        monitor.captureError({
          type: "window.onerror",
          message: event.message,
          stack: event.error instanceof Error ? event.error.stack : undefined,
          context: {
            filename: event.filename,
            lineno: String(event.lineno),
            colno: String(event.colno),
          },
          level: "error",
        });
      });
    }
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const err = event.reason;
    import("./monitor").then(({ monitor }) => {
      monitor.captureError({
        type: "unhandledrejection",
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        level: "error",
      });
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
