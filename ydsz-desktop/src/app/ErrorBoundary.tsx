/**
 * @file 全局 React ErrorBoundary 组件
 *
 * 捕获子组件树中的 JavaScript 错误，显示降级 UI，并提供错误详情复制、重试、重载功能。
 *
 * ## 设计目标
 *
 * - 防止单个子组件异常导致整个应用白屏
 * - 保留主导航/侧栏（仅渲染出错区域）
 * - 提供可复制的 stack trace 用于问题定位
 * - 与 RootRouteErrorView 风格保持一致
 * - 全面国际化，所有面向用户的文本均通过 i18n 消息系统管理
 *
 * ## 使用方式
 *
 * ```tsx
 * <AppErrorBoundary>
 *   <YourApp />
 * </AppErrorBoundary>
 * ```
 *
 * ## 错误上报
 *
 * 通过 monitor 钩子上报错误（默认 console stub,可注入 Sentry / 自家后端）。
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { WindowCaptionButtons } from "~/components/WindowCaptionButtons";
import { APP_DISPLAY_NAME } from "~/branding";
import { toastManager } from "~/components/ui/toast";
import { monitor } from "~/lib/monitor";
import { useMessages } from "~/i18n";
import type { Messages } from "~/i18n/messages";

interface Props {
  children: ReactNode;
  /** 可选的 fallback 渲染函数，允许调用方自定义降级 UI */
  fallback?: (props: FallbackProps) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface FallbackProps {
  error: Error;
  errorInfo: ErrorInfo;
  reset: () => void;
}

/**
 * 全局 ErrorBoundary 类组件
 *
 * 使用 React 的 getDerivedStateFromError + componentDidCatch 生命周期方法
 * 捕获渲染阶段的错误并展示降级 UI。
 *
 * 内部使用 ErrorBoundaryInner 来注入 i18n messages，
 * 因为类组件无法直接使用 hooks。
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // 记录错误到控制台（便于开发调试）
    console.error("[AppErrorBoundary] Caught error:", error);
    console.error("[AppErrorBoundary] Component stack:", errorInfo.componentStack);

    // 调用 monitor 钩子上报错误
    monitor.captureError({
      type: "ReactErrorBoundary",
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"),
      context: {
        source: "AppErrorBoundary",
        componentStack: errorInfo.componentStack?.split("\n").slice(0, 5).join("\n") ?? "",
        url: typeof window !== "undefined" ? window.location.pathname : "",
        appVersion: APP_DISPLAY_NAME,
      },
      level: "error",
    });
  }

  /** 重置错误状态，允许用户重试 */
  reset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error && this.state.errorInfo) {
      // 如果调用方提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          reset: this.reset,
        });
      }

      // 使用内部组件来注入 i18n messages
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          reset={this.reset}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * 降级 UI 的函数组件包装器，用于注入 i18n messages。
 */
function ErrorBoundaryFallback({
  error,
  errorInfo,
  reset,
}: {
  error: Error;
  errorInfo: ErrorInfo;
  reset: () => void;
}) {
  const messages = useMessages();
  return (
    <DefaultFallback
      error={error}
      errorInfo={errorInfo}
      reset={reset}
      messages={messages}
    />
  );
}

/**
 * 默认降级 UI 组件
 *
 * 与 RootRouteErrorView 风格保持一致：居中卡片 + 错误详情折叠面板
 * 所有文本通过 i18n 消息系统管理，支持多语言。
 */
interface DefaultFallbackProps {
  error: Error;
  errorInfo: ErrorInfo;
  reset: () => void;
  messages: Messages;
}

function DefaultFallback({ error, errorInfo, reset, messages }: DefaultFallbackProps) {
  const { errorFallback: t } = messages;

  const message = error.message.trim().length > 0 ? error.message : t.unexpected;
  const details = [
    `Error: ${error.message}`,
    `Stack: ${error.stack ?? t.noDetails}`,
    `Component Stack: ${errorInfo.componentStack ?? t.noDetails}`,
  ].join("\n\n");

  const copyErrorDetails = async (): Promise<void> => {
    const fullDetails = [
      `Error: ${error.message}`,
      `Stack: ${error.stack ?? t.noDetails}`,
      `Component Stack: ${errorInfo.componentStack ?? t.noDetails}`,
      `Timestamp: ${new Date().toISOString()}`,
      `User Agent: ${navigator.userAgent}`,
      `App Version: ${APP_DISPLAY_NAME} v0.3.0`,
    ].join("\n\n");

    try {
      await navigator.clipboard.writeText(fullDetails);
      toastManager.add({
        type: "success",
        title: t.copySuccessTitle,
        description: t.copySuccessDescription,
        timeout: 3000,
      });
    } catch {
      toastManager.add({
        type: "error",
        title: t.copyFailedTitle,
        description: t.copyFailedDescription,
      });
    }
  };

  const reloadApp = (): void => {
    window.location.reload();
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6"
      data-testid="error-boundary-root"
      role="alert"
      aria-live="assertive"
    >
      <WindowCaptionButtons className="absolute top-0 right-0" />
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-red-500)_16%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{t.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={reset}>
            {t.retry}
          </Button>
          <Button size="sm" variant="outline" onClick={copyErrorDetails}>
            {t.copyDetails}
          </Button>
          <Button size="sm" variant="outline" onClick={reloadApp}>
            {t.reload}
          </Button>
        </div>

        <details className="group mt-5 overflow-hidden rounded-lg border border-border/70 bg-background/55">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground">
            <span className="group-open:hidden">{t.showDetails}</span>
            <span className="hidden group-open:inline">{t.hideDetails}</span>
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-border/70 bg-background/80 px-3 py-2 text-xs text-foreground/85">
            {details}
          </pre>
        </details>
      </section>
    </div>
  );
}

/**
 * 便捷 hook：在函数组件中手动触发错误边界重置
 *
 * 注意：此 hook 必须在 AppErrorBoundary 的子组件中使用，且需要传递 reset 函数。
 * 通常不直接使用，而是通过 ErrorBoundary 的 reset 方法。
 */
export function useErrorBoundaryReset(reset: () => void): () => void {
  return reset;
}
