/**
 * @file 智能重试 Hook
 *
 * 本 Hook 实现 AI 请求失败时的智能重试机制：
 *
 * - **错误分类**：network | timeout | rate-limit | server-error | client-error | unknown
 * - **指数退避**：baseDelay * 2^attempt + jitter（网络错误 / 服务器错误）
 * - **速率限制**：尊重 Retry-After 头部，自动等待后重试
 * - **超时错误**：增加超时时间后重试（30s → 60s → 120s）
 * - **客户端错误（4xx）**：不重试，直接报错
 * - **取消支持**：用户可随时取消重试
 *
 * ## 核心导出
 *
 * - `useSmartRetry`：智能重试 Hook
 * - `classifyError`：错误分类工具函数
 * - `computeBackoffDelay`：退避延迟计算工具函数
 *
 * ## 使用场景
 *
 * - Provider 请求失败后自动重试
 * - 展示重试进度与状态
 * - 用户手动取消重试
 *
 * ## 注意事项
 *
 * - 客户端错误（4xx）不会触发重试
 * - 重试期间组件卸载会自动清理定时器
 * - 最大重试次数为 5 次
 */

import { useState, useCallback, useRef, useEffect } from "react";

// ─── 错误分类 ────────────────────────────────────────────────────────────────

/** 错误类型枚举 */
export type RetryErrorClass =
  | "network"
  | "timeout"
  | "rate-limit"
  | "server-error"
  | "client-error"
  | "unknown";

/** 重试配置 */
export interface SmartRetryConfig {
  /** 最大重试次数（默认 5） */
  maxRetries: number;
  /** 基础延迟毫秒（默认 1000） */
  baseDelayMs: number;
  /** 超时递增序列毫秒（默认 [30000, 60000, 120000]） */
  timeoutStepsMs: number[];
  /** 是否启用抖动（默认 true） */
  jitter: boolean;
}

/** 重试状态 */
export type RetryStatus =
  | "idle"
  | "retrying"
  | "waiting-retry-after"
  | "cancelled"
  | "exhausted"
  | "success";

/** 重试历史记录条目 */
export interface RetryHistoryEntry {
  /** 尝试序号（从 1 开始） */
  attempt: number;
  /** 错误分类 */
  errorClass: RetryErrorClass;
  /** 错误消息 */
  errorMessage: string;
  /** 等待延迟毫秒 */
  delayMs: number;
  /** 时间戳 */
  timestamp: number;
  /** Retry-After 秒数（仅 rate-limit） */
  retryAfterSec?: number;
  /** 超时时间毫秒（仅 timeout） */
  timeoutMs?: number;
}

/** 重试状态结果 */
export interface UseSmartRetryResult {
  /** 当前重试状态 */
  status: RetryStatus;
  /** 当前尝试次数（0 表示尚未重试） */
  currentAttempt: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 下次重试前的剩余等待毫秒 */
  remainingDelayMs: number;
  /** 重试历史 */
  history: ReadonlyArray<RetryHistoryEntry>;
  /** 当前建议的超时毫秒 */
  currentTimeoutMs: number;
  /** 执行带重试的异步操作 */
  execute: <T>(fn: () => Promise<T>, signal?: AbortSignal) => Promise<T>;
  /** 取消当前重试 */
  cancel: () => void;
  /** 重置状态 */
  reset: () => void;
}

/** 默认配置 */
const DEFAULT_CONFIG: SmartRetryConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,
  timeoutStepsMs: [30_000, 60_000, 120_000],
  jitter: true,
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 根据错误对象分类错误类型。
 *
 * @param error - 捕获到的错误
 * @param statusCode - HTTP 状态码（若可获取）
 * @param retryAfterHeader - Retry-After 头部值（若可获取）
 * @returns 错误分类
 */
export function classifyError(
  error: unknown,
  statusCode?: number,
  retryAfterHeader?: string,
): RetryErrorClass {
  // 显式状态码优先级最高
  if (statusCode !== undefined) {
    if (statusCode === 429) return "rate-limit";
    if (statusCode >= 400 && statusCode < 500) return "client-error";
    if (statusCode >= 500) return "server-error";
  }

  // 根据错误消息 / 名称推断
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";

  // 网络错误
  if (
    name === "TypeError" &&
    /fetch|network|ECONNREFUSED|ECONNRESET|ENOTFOUND|DNS|socket/i.test(message)
  ) {
    return "network";
  }
  if (/network error|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(message)) {
    return "network";
  }

  // 超时错误
  if (
    name === "AbortError" ||
    /timeout|timed out|ETIMEDOUT|deadline exceeded/i.test(message)
  ) {
    return "timeout";
  }

  // 速率限制
  if (
    /rate.?limit|429|too many requests|retry.?after/i.test(message) ||
    retryAfterHeader !== undefined
  ) {
    return "rate-limit";
  }

  // 服务器错误
  if (/5\d\d|internal server|bad gateway|service unavailable|gateway timeout/i.test(message)) {
    return "server-error";
  }

  // 客户端错误
  if (/4\d\d|bad request|unauthorized|forbidden|not found|conflict/i.test(message)) {
    return "client-error";
  }

  return "unknown";
}

/**
 * 计算指数退避延迟（含可选抖动）。
 *
 * 公式：baseDelay * 2^attempt + jitter
 *
 * @param attempt - 当前尝试序号（从 0 开始）
 * @param baseDelayMs - 基础延迟毫秒
 * @param jitter - 是否添加随机抖动
 * @returns 延迟毫秒
 */
export function computeBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  jitter: boolean = true,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  if (!jitter) return exponential;
  // 添加 ±25% 的随机抖动
  const jitterRange = exponential * 0.25;
  return Math.round(exponential + (Math.random() * 2 - 1) * jitterRange);
}

/**
 * 解析 Retry-After 头部值为毫秒。
 *
 * 支持两种格式：
 * - 秒数（数字字符串）
 * - HTTP 日期（Date.parse 可解析的格式）
 *
 * @param header - Retry-After 头部值
 * @returns 等待毫秒，无法解析时返回 null
 */
export function parseRetryAfter(header: string): number | null {
  const trimmed = header.trim();
  if (trimmed.length === 0) {
    return null;
  }
  // 纯数字 → 秒数
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  // HTTP 日期
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

/**
 * 判断错误类型是否可重试。
 *
 * @param errorClass - 错误分类
 * @returns 是否可重试
 */
export function isRetriableError(errorClass: RetryErrorClass): boolean {
  // 客户端错误（4xx）不重试
  return errorClass !== "client-error";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * 智能重试 Hook。
 *
 * @param config - 可选的重试配置覆盖
 * @returns 重试状态与控制方法
 *
 * @example
 * ```ts
 * const { execute, status, currentAttempt, cancel, history } = useSmartRetry();
 *
 * const result = await execute(
 *   () => fetch("/api/chat").then(r => r.json()),
 * );
 * ```
 */
export function useSmartRetry(
  configOverrides?: Partial<SmartRetryConfig>,
): UseSmartRetryResult {
  const config: SmartRetryConfig = { ...DEFAULT_CONFIG, ...configOverrides };

  const [status, setStatus] = useState<RetryStatus>("idle");
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [remainingDelayMs, setRemainingDelayMs] = useState(0);
  const [history, setHistory] = useState<RetryHistoryEntry[]>([]);
  const [currentTimeoutMs, setCurrentTimeoutMs] = useState(config.timeoutStepsMs[0] ?? 30_000);

  // 用于取消内部等待的 ref
  const cancelWaitRef = useRef<AbortController | null>(null);
  // 用于取消外部 execute 的 ref
  const executeCancelRef = useRef<AbortController | null>(null);

  // 清理：组件卸载时取消等待
  useEffect(() => {
    return () => {
      cancelWaitRef.current?.abort();
      executeCancelRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    cancelWaitRef.current?.abort();
    executeCancelRef.current?.abort();
    setStatus("idle");
    setCurrentAttempt(0);
    setRemainingDelayMs(0);
    setHistory([]);
    setCurrentTimeoutMs(config.timeoutStepsMs[0] ?? 30_000);
  }, [config.timeoutStepsMs]);

  const cancel = useCallback(() => {
    cancelWaitRef.current?.abort();
    executeCancelRef.current?.abort();
    setStatus("cancelled");
  }, []);

  /** 等待指定毫秒，支持取消 */
  const waitWithCancel = useCallback(
    (delayMs: number, signal: AbortSignal): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Cancelled", "AbortError"));
          return;
        }

        const controller = new AbortController();
        cancelWaitRef.current = controller;

        // 倒计时更新 remainingDelayMs
        const startTime = Date.now();
        const tickInterval = setInterval(() => {
          if (controller.signal.aborted || signal.aborted) {
            clearInterval(tickInterval);
            return;
          }
          const elapsed = Date.now() - startTime;
          setRemainingDelayMs(Math.max(0, delayMs - elapsed));
        }, 200);

        const timer = setTimeout(() => {
          clearInterval(tickInterval);
          setRemainingDelayMs(0);
          resolve();
        }, delayMs);

        const onAbort = () => {
          clearTimeout(timer);
          clearInterval(tickInterval);
          setRemainingDelayMs(0);
          reject(new DOMException("Cancelled", "AbortError"));
        };

        signal.addEventListener("abort", onAbort, { once: true });
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
    },
    [],
  );

  const execute = useCallback(
    async <T,>(fn: () => Promise<T>, externalSignal?: AbortSignal): Promise<T> => {
      // 重置状态
      cancelWaitRef.current?.abort();
      executeCancelRef.current?.abort();
      const internalCancel = new AbortController();
      executeCancelRef.current = internalCancel;

      setStatus("retrying");
      setCurrentAttempt(0);
      setHistory([]);
      setRemainingDelayMs(0);
      setCurrentTimeoutMs(config.timeoutStepsMs[0] ?? 30_000);

      // 合并外部 signal
      const onExternalAbort = () => internalCancel.abort();
      externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

      let lastError: unknown = null;

      for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        if (internalCancel.signal.aborted) {
          setStatus("cancelled");
          throw new DOMException("Retry cancelled", "AbortError");
        }

        try {
          setCurrentAttempt(attempt);
          const result = await fn();

          // 成功
          setStatus("success");
          externalSignal?.removeEventListener("abort", onExternalAbort);
          return result;
        } catch (err) {
          lastError = err;

          // 如果是外部取消，直接抛出
          if (err instanceof DOMException && err.name === "AbortError" && externalSignal?.aborted) {
            setStatus("cancelled");
            throw err;
          }

          // 提取错误信息（供分类使用）
          const statusCode = extractStatusCode(err);
          const retryAfterHeader = extractRetryAfterHeader(err);
          const errorClass = classifyError(err, statusCode, retryAfterHeader ?? undefined);

          // 不可重试 → 直接失败
          if (!isRetriableError(errorClass)) {
            setStatus("exhausted");
            externalSignal?.removeEventListener("abort", onExternalAbort);
            throw err;
          }

          // 已达最大重试次数
          if (attempt >= config.maxRetries) {
            setHistory((prev) => [
              ...prev,
              {
                attempt: attempt + 1,
                errorClass,
                errorMessage: err instanceof Error ? err.message : String(err),
                delayMs: 0,
                timestamp: Date.now(),
              },
            ]);
            setStatus("exhausted");
            externalSignal?.removeEventListener("abort", onExternalAbort);
            throw err;
          }

          // 计算本次等待延迟
          let delayMs: number;
          let entryRetryAfterSec: number | undefined;
          let entryTimeoutMs: number | undefined;

          if (errorClass === "rate-limit" && retryAfterHeader) {
            const parsed = parseRetryAfter(retryAfterHeader);
            if (parsed !== null) {
              delayMs = parsed;
              entryRetryAfterSec = Math.round(parsed / 1000);
              setStatus("waiting-retry-after");
            } else {
              delayMs = computeBackoffDelay(attempt, config.baseDelayMs, config.jitter);
            }
          } else if (errorClass === "timeout") {
            // 超时：使用递增的超时时间作为下次尝试的 timeout
            const nextTimeoutIdx = Math.min(attempt, config.timeoutStepsMs.length - 1);
            const nextTimeout = config.timeoutStepsMs[nextTimeoutIdx] ?? 120_000;
            setCurrentTimeoutMs(nextTimeout);
            entryTimeoutMs = nextTimeout;
            delayMs = computeBackoffDelay(attempt, config.baseDelayMs, config.jitter);
          } else {
            // network / server-error / unknown：指数退避
            delayMs = computeBackoffDelay(attempt, config.baseDelayMs, config.jitter);
          }

          setHistory((prev) => [
            ...prev,
            {
              attempt: attempt + 1,
              errorClass,
              errorMessage: err instanceof Error ? err.message : String(err),
              delayMs,
              timestamp: Date.now(),
              ...(entryRetryAfterSec !== undefined ? { retryAfterSec: entryRetryAfterSec } : {}),
              ...(entryTimeoutMs !== undefined ? { timeoutMs: entryTimeoutMs } : {}),
            },
          ]);

          setStatus("retrying");

          // 等待延迟
          try {
            await waitWithCancel(delayMs, internalCancel.signal);
          } catch {
            // 等待被取消
            setStatus("cancelled");
            externalSignal?.removeEventListener("abort", onExternalAbort);
            throw new DOMException("Retry cancelled", "AbortError");
          }
        }
      }

      // 理论上不会到达这里，但作为安全措施
      externalSignal?.removeEventListener("abort", onExternalAbort);
      throw lastError;
    },
    [config, waitWithCancel],
  );

  return {
    status,
    currentAttempt,
    maxRetries: config.maxRetries,
    remainingDelayMs,
    history,
    currentTimeoutMs,
    execute,
    cancel,
    reset,
  };
}

// ─── 内部辅助 ─────────────────────────────────────────────────────────────────

/**
 * 从错误对象中提取 HTTP 状态码。
 * 支持常见的 fetch 错误、Axios 错误等格式。
 */
function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const err = error as Record<string, unknown>;

  // fetch Response
  const response = err["response"] ?? err["res"];
  if (response && typeof response === "object") {
    const status = (response as Record<string, unknown>)["status"];
    if (typeof status === "number") return status;
  }

  // 直接 status 属性
  if (typeof err["status"] === "number") return err["status"];
  if (typeof err["statusCode"] === "number") return err["statusCode"];

  return undefined;
}

/**
 * 从错误对象中提取 Retry-After 头部值。
 */
function extractRetryAfterHeader(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const err = error as Record<string, unknown>;

  // headers 对象
  const headers = err["headers"];
  if (headers && typeof headers === "object") {
    const retryAfter = (headers as Record<string, unknown>)["retry-after"] ??
      (headers as Record<string, unknown>)["Retry-After"];
    if (typeof retryAfter === "string") return retryAfter;
  }

  // 直接 retryAfter 属性
  if (typeof err["retryAfter"] === "string") return err["retryAfter"];

  return undefined;
}
