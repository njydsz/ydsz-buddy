/**
 * @file useSentryInit
 * @description 集中初始化 Sentry 监控的 Hook
 *
 * P1-6 目标:在应用启动时一次性把 Sentry 注入到 monitor 钩子,并安装
 * 全局 error / unhandledrejection 监听。
 *
 * ## 使用方式
 *
 * 在 `main.tsx` 顶层调用一次:
 *
 * ```tsx
 * useSentryInit({
 *   dsn: import.meta.env.VITE_SENTRY_DSN,
 *   environment: import.meta.env.MODE,
 * });
 * ```
 *
 * ## 行为
 *
 * - DSN 为空:跳过初始化,保留 console stub
 * - `@sentry/browser` 未安装:降级到 console,打印 warning
 * - 应用卸载时自动清理全局监听(在 SPA 场景下基本不会触发)
 */

import { useEffect, useRef } from "react";
import { setMonitorImpl, type MonitorImpl } from "~/lib/monitor";
import {
  initSentryMonitor,
  installGlobalErrorHandlers,
  type SentryMonitorConfig,
} from "~/lib/sentryMonitor";

export interface UseSentryInitOptions extends SentryMonitorConfig {
  /** 设为 false 跳过初始化(默认 true) */
  enabled?: boolean;
}

let installed = false;

/**
 * 初始化 Sentry 监控(单次)
 */
export function useSentryInit(options: UseSentryInitOptions): void {
  const { enabled = true, ...config } = options;
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (installed) return; // 全局幂等
    if (!config.dsn) {
      // DSN 为空:保留 console stub,不警告(开发环境常见)
      if (config.environment === "production") {
        // eslint-disable-next-line no-console
        console.warn(
          "[useSentryInit] production 环境未配置 Sentry DSN,生产错误将不会上报",
        );
      }
      return;
    }

    let cancelled = false;
    installed = true;

    (async () => {
      const impl: MonitorImpl = await initSentryMonitor(config);
      if (cancelled) return;
      setMonitorImpl(impl);
      cleanupRef.current = installGlobalErrorHandlers();
    })();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      installed = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, config.dsn, config.environment, config.release]);
}
