/**
 * @file useZhipuDeviceFlow
 * @description 智谱 BigModel Coding Plan OAuth Device Flow — 前端薄壳 Hook
 *
 * P1-5 目标：让用户像海外 ChatGPT/Claude 订阅一样，在桌面端一键"使用 Coding Plan 登录"，
 * 不必手动复制 API Key。
 *
 * ## Device Flow 时序（RFC 8628）
 *
 * 1. `start()` → 调后端 `coding_plan_request_device_code` 拿到 `user_code` + `verification_uri`
 * 2. UI 提示用户去 `verification_uri` 粘贴 `user_code` 完成授权
 * 3. Hook 内部按 `interval` 周期调 `coding_plan_poll_device_token` 轮询
 * 4. 成功时后端把 access_token 写入 SecretStore，UI 切到 "已绑定" 状态
 *
 * ## 与后端的契约
 *
 * - 后端状态权威源（`CodingPlanOAuthState`）只持有 in-flight grant，
 *   最终 token 写入 SecretStore 后就不再返回前端
 * - 前端轮询失败（Pending / SlowDown）时不报错，只更新内部 phase
 * - Expired / AccessDenied 走"重置"按钮让用户重试
 *
 * @module hooks/useZhipuDeviceFlow
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Coding Plan Provider 标识（与后端 CodingPlanProvider 对齐） */
export type CodingPlanProviderId = "zhipu" | "deepseek" | "moonshot" | "qwen";

/** Device Flow 进行中状态 */
export type DeviceFlowPhase =
  /** 空闲（未发起授权） */
  | "idle"
  /** 正在申请 device_code */
  | "requesting"
  /** 等待用户在浏览器完成授权 */
  | "awaiting-user"
  /** 轮询中（与 awaiting-user 合并,保留以备调试） */
  | "polling"
  /** 成功授权,后端已写入 SecretStore */
  | "authorized"
  /** 失败（网络/解析/被拒/过期） */
  | "failed"
  /** 已取消 */
  | "cancelled";

/** Device Flow 申请响应（与后端 DeviceCodeGrant 对齐） */
export interface DeviceCodeGrant {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string | null;
  expires_in: number;
  interval: number;
}

/** Device Flow 轮询结果（与后端 DeviceFlowPollResult 对齐） */
export type DeviceFlowPollResult =
  | { status: "pending" }
  | { status: "slow-down" }
  | { status: "expired" }
  | { status: "access-denied" }
  | { status: "authorized"; provider: string; expires_in: number | null }
  | { status: "failed"; reason: string };

/** Hook 返回值 */
export interface UseZhipuDeviceFlowResult {
  /** 当前阶段 */
  phase: DeviceFlowPhase;
  /** Device Code Grant（申请成功后填充） */
  grant: DeviceCodeGrant | null;
  /** 最近一次错误信息 */
  errorMessage: string | null;
  /** 已绑定 Provider Kind（成功后填充,如 "glm"） */
  boundProvider: string | null;
  /** Provider 是否支持 Device Flow（当前只有 zhipu） */
  isSupported: boolean;
  /** 发起授权 */
  start: () => Promise<void>;
  /** 取消授权 */
  cancel: () => Promise<void>;
  /** 重置（清空状态,允许重新发起） */
  reset: () => void;
  /** 倒计时（秒） */
  secondsRemaining: number;
  /** 复制 user_code 到剪贴板的便捷方法 */
  copyUserCode: () => Promise<boolean>;
}

const DEFAULT_INTERVAL_SEC = 5;
const DEFAULT_EXPIRES_IN_SEC = 600;

/**
 * 智谱 BigModel Coding Plan OAuth Device Flow Hook
 *
 * @param provider - 要登录的 Coding Plan Provider（当前只支持 "zhipu"）
 * @param clientId - 可选,自定义 OAuth client_id（默认使用后端内置 demo）
 */
export function useZhipuDeviceFlow(
  provider: CodingPlanProviderId = "zhipu",
  clientId?: string,
): UseZhipuDeviceFlowResult {
  const [phase, setPhase] = useState<DeviceFlowPhase>("idle");
  const [grant, setGrant] = useState<DeviceCodeGrant | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [boundProvider, setBoundProvider] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const isSupported = provider === "zhipu";

  /** 清理轮询 + 倒计时 */
  const cleanup = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  /** 启动倒计时 */
  const startCountdown = useCallback(
    (totalSec: number) => {
      cleanup();
      setSecondsRemaining(totalSec);
      countdownRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            cleanup();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [cleanup],
  );

  /** 发起授权申请 */
  const start = useCallback(async () => {
    if (!isSupported) {
      setErrorMessage("当前 Provider 暂未提供 Device Flow,请使用 API Key 方式");
      setPhase("failed");
      return;
    }
    if (phase === "requesting" || phase === "awaiting-user" || phase === "polling") {
      return; // 已有进行中的授权
    }
    setErrorMessage(null);
    setBoundProvider(null);
    setGrant(null);
    cancelledRef.current = false;
    setPhase("requesting");

    try {
      const next = await invoke<DeviceCodeGrant>("coding_plan_request_device_code", {
        args: {
          provider,
          client_id: clientId ?? null,
          scope: null,
        },
      });
      if (cancelledRef.current) {
        return;
      }
      setGrant(next);
      setPhase("awaiting-user");
      startCountdown(next.expires_in || DEFAULT_EXPIRES_IN_SEC);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      setPhase("failed");
    }
  }, [isSupported, phase, provider, clientId, startCountdown]);

  /** 轮询一次 token */
  const pollOnce = useCallback(
    async (deviceCode: string, intervalSec: number) => {
      try {
        const result = await invoke<DeviceFlowPollResult>("coding_plan_poll_device_token", {
          args: {
            provider,
            device_code: deviceCode,
            client_id: clientId ?? null,
          },
        });
        if (cancelledRef.current) {
          return;
        }
        switch (result.status) {
          case "pending":
            // 继续轮询
            pollTimeoutRef.current = setTimeout(
              () => pollOnce(deviceCode, intervalSec),
              intervalSec * 1000,
            );
            break;
          case "slow-down":
            // 智谱要求放慢轮询,interval + 5
            const newInterval = intervalSec + 5;
            pollTimeoutRef.current = setTimeout(
              () => pollOnce(deviceCode, newInterval),
              newInterval * 1000,
            );
            break;
          case "authorized":
            setBoundProvider(result.provider);
            setPhase("authorized");
            cleanup();
            break;
          case "expired":
            setErrorMessage("device_code 已过期,请重新发起授权");
            setPhase("failed");
            cleanup();
            break;
          case "access-denied":
            setErrorMessage("用户拒绝授权");
            setPhase("failed");
            cleanup();
            break;
          case "failed":
            setErrorMessage(result.reason);
            setPhase("failed");
            cleanup();
            break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
        setPhase("failed");
        cleanup();
      }
    },
    [provider, clientId, cleanup],
  );

  /** 取消授权 */
  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    cleanup();
    try {
      await invoke<boolean>("coding_plan_cancel_grant", { provider });
    } catch {
      // 忽略后端错误
    }
    setGrant(null);
    setErrorMessage(null);
    setSecondsRemaining(0);
    setPhase("cancelled");
  }, [provider, cleanup]);

  /** 重置 */
  const reset = useCallback(() => {
    cleanup();
    cancelledRef.current = false;
    setGrant(null);
    setErrorMessage(null);
    setSecondsRemaining(0);
    setBoundProvider(null);
    setPhase("idle");
  }, [cleanup]);

  /** 复制 user_code 到剪贴板 */
  const copyUserCode = useCallback(async (): Promise<boolean> => {
    if (!grant) return false;
    try {
      await navigator.clipboard.writeText(grant.user_code);
      return true;
    } catch {
      return false;
    }
  }, [grant]);

  // 当进入 awaiting-user 时自动开始轮询
  useEffect(() => {
    if (phase === "awaiting-user" && grant && !cancelledRef.current) {
      const interval = grant.interval || DEFAULT_INTERVAL_SEC;
      pollTimeoutRef.current = setTimeout(
        () => pollOnce(grant.device_code, interval),
        interval * 1000,
      );
    }
    return () => {
      // 卸载时清理
      cleanup();
    };
  }, [phase, grant, pollOnce, cleanup]);

  // 组件卸载时取消进行中的 grant
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return {
    phase,
    grant,
    errorMessage,
    boundProvider,
    isSupported,
    start,
    cancel,
    reset,
    secondsRemaining,
    copyUserCode,
  };
}
