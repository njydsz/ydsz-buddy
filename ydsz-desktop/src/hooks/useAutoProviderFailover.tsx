/**
 * @file useAutoProviderFailover
 * @description 自动 Provider 故障转移 Hook（全局单例）
 *
 * 在 dispatchCommand 失败时自动累加失败次数，触发阈值时自动切换到备用 Provider，
 * 并通过 toast 通知用户。配合 appSettings.DEFAULT_PROVIDER_ORDER 使用。
 *
 * ## 核心导出
 *
 * - `useAutoProviderFailover`：Hook
 * - `getGlobalFailoverController`：直接获取全局控制器
 * - `AutoProviderFailoverProvider`：Provider 组件（顶层挂载）
 *
 * ## 使用场景
 *
 * - 顶层挂载 `AutoProviderFailoverProvider` 后，所有 `api.orchestration.dispatchCommand`
 *   调用自动接入失败计数与切换
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ProviderKind } from "~/contracts";
import { DEFAULT_PROVIDER_ORDER } from "~/providerOrdering";
import { toastManager } from "~/components/ui/toast";
import { checkProviderCapability } from "./useProviderFailover";
import type { ProviderCapability } from "./useProviderFailover";

const DEFAULT_FAILURE_THRESHOLD = 3;

const DEFAULT_CAPABILITY_MAP: Readonly<
  Partial<Record<ProviderKind, { capabilities: ReadonlyArray<ProviderCapability> }>>
> = {
  codex: {
    capabilities: ["tool-calling", "vision", "reasoning-effort", "fast-mode"],
  },
  claudeAgent: {
    capabilities: ["tool-calling", "vision", "reasoning-effort"],
  },
  cursor: {
    capabilities: ["tool-calling", "vision", "fast-mode"],
  },
  gemini: {
    capabilities: ["tool-calling", "vision", "reasoning-effort"],
  },
  grok: {
    capabilities: ["tool-calling", "vision", "reasoning-effort"],
  },
  kilo: {
    capabilities: ["tool-calling", "vision"],
  },
  opencode: {
    capabilities: ["tool-calling", "vision"],
  },
  pi: {
    capabilities: ["tool-calling"],
  },
};

const RECOVERY_RESET_MS = 5 * 60 * 1000; // 5 分钟无失败重置计数

export interface FailoverEvent {
  from: ProviderKind;
  to: ProviderKind;
  reason: string;
  at: number;
}

interface ControllerState {
  activeProvider: ProviderKind;
  failureCounts: Readonly<Record<ProviderKind, number>>;
  history: ReadonlyArray<FailoverEvent>;
  isMonitoring: boolean;
}

interface ControllerApi extends ControllerState {
  recordFailure: (provider: ProviderKind, error?: Error) => void;
  recordSuccess: (provider: ProviderKind) => void;
  switchTo: (target: ProviderKind, reason?: string) => boolean;
  setMonitoring: (enabled: boolean) => void;
  reset: () => void;
}

const FailoverContext = createContext<ControllerApi | null>(null);

/** 顶层 Provider 组件：把自动故障转移能力注入到 React 树 */
export function AutoProviderFailoverProvider(props: {
  enabled?: boolean;
  threshold?: number;
  enabledProviders?: ReadonlyArray<ProviderKind>;
  children: ReactNode;
}) {
  const enabled = props.enabled ?? true;
  const threshold = props.threshold ?? DEFAULT_FAILURE_THRESHOLD;
  const enabledProviders = useMemo<ReadonlyArray<ProviderKind>>(
    () => props.enabledProviders ?? DEFAULT_PROVIDER_ORDER,
    [props.enabledProviders],
  );
  const [activeProvider, setActiveProvider] = useState<ProviderKind>(() => enabledProviders[0]);
  const [failureCounts, setFailureCounts] = useState<Record<ProviderKind, number>>(() => {
    const map: Record<string, number> = {};
    for (const p of enabledProviders) map[p] = 0;
    return map as Record<ProviderKind, number>;
  });
  const [history, setHistory] = useState<FailoverEvent[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(enabled);
  const lastFailureAtRef = useRef(0);

  // 5 分钟无失败 → 重置全部计数
  useEffect(() => {
    if (!isMonitoring) return;
    const id = setInterval(() => {
      if (Date.now() - lastFailureAtRef.current > RECOVERY_RESET_MS) {
        setFailureCounts(() => {
          const next: Record<string, number> = {};
          for (const p of enabledProviders) next[p] = 0;
          return next as Record<ProviderKind, number>;
        });
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [enabledProviders, isMonitoring]);

  const pickFallback = useCallback(
    (current: ProviderKind): ProviderKind | null => {
      const currentCaps = DEFAULT_CAPABILITY_MAP[current]?.capabilities ?? [];
      const candidates = enabledProviders
        .filter((p) => p !== current)
        .filter((p) => (failureCounts[p] ?? 0) < threshold)
        .sort((a, b) => {
          const aMatch = currentCaps.filter((cap) =>
            checkProviderCapability(a, cap, DEFAULT_CAPABILITY_MAP),
          ).length;
          const bMatch = currentCaps.filter((cap) =>
            checkProviderCapability(b, cap, DEFAULT_CAPABILITY_MAP),
          ).length;
          return bMatch - aMatch;
        });
      return candidates[0] ?? null;
    },
    [enabledProviders, failureCounts, threshold],
  );

  const switchTo = useCallback(
    (target: ProviderKind, reason: string = "Manual switch"): boolean => {
      const previous = activeProvider;
      if (target === previous) return true;
      if (!enabledProviders.includes(target)) return false;
      setActiveProvider(target);
      // 互联网大厂基线:切换时只清零目标 provider 的失败计数,
      // 保留 source 的计数(避免立即被切回已知不可用的 provider)
      setFailureCounts((current) => ({ ...current, [target]: 0 }));
      setHistory((current) => [
        ...current,
        { from: previous, to: target, reason, at: Date.now() },
      ]);
      toastManager.add({
        type: "info",
        title: "Provider 已切换",
        description: `从 ${previous} 切换到 ${target}：${reason}`,
      });
      return true;
    },
    [activeProvider, enabledProviders],
  );

  const recordFailure = useCallback(
    (provider: ProviderKind, error?: Error) => {
      lastFailureAtRef.current = Date.now();
      setFailureCounts((prev) => {
        const newCount = (prev[provider] ?? 0) + 1;
        const next = { ...prev, [provider]: newCount };
        if (
          isMonitoring &&
          newCount >= threshold &&
          provider === activeProvider
        ) {
          const fallback = pickFallback(provider);
          if (fallback) {
            // 触发切换：使用 setTimeout 跳出当前 setState 上下文
            setTimeout(() => {
              switchTo(fallback, `连续 ${newCount} 次失败后自动切换：${error?.message ?? "未知错误"}`);
            }, 0);
          } else {
            toastManager.add({
              type: "error",
              title: "Provider 全部不可用",
              description: `已尝试 ${enabledProviders.length} 个 Provider，仍未成功，请稍后再试。`,
            });
          }
        }
        return next;
      });
    },
    [activeProvider, enabledProviders.length, isMonitoring, pickFallback, switchTo, threshold],
  );

  const recordSuccess = useCallback((provider: ProviderKind) => {
    setFailureCounts((prev) => (prev[provider] ? { ...prev, [provider]: 0 } : prev));
  }, []);

  const setMonitoring = useCallback((value: boolean) => {
    setIsMonitoring(value);
    if (value) {
      toastManager.add({
        type: "info",
        title: "自动故障转移已启用",
        description: "Provider 连续失败时会自动切换到备用 Provider。",
      });
    }
  }, []);

  const reset = useCallback(() => {
    const map: Record<string, number> = {};
    for (const p of enabledProviders) map[p] = 0;
    setFailureCounts(map as Record<ProviderKind, number>);
    setHistory([]);
  }, [enabledProviders]);

  const value = useMemo<ControllerApi>(
    () => ({
      activeProvider,
      failureCounts,
      history,
      isMonitoring,
      recordFailure,
      recordSuccess,
      switchTo,
      setMonitoring,
      reset,
    }),
    [
      activeProvider,
      failureCounts,
      history,
      isMonitoring,
      recordFailure,
      recordSuccess,
      switchTo,
      setMonitoring,
      reset,
    ],
  );

  return <FailoverContext.Provider value={value}>{props.children}</FailoverContext.Provider>;
}

/** 获取全局故障转移控制器（必须在 Provider 内使用） */
export function useAutoProviderFailover(): ControllerApi {
  const ctx = useContext(FailoverContext);
  if (!ctx) {
    throw new Error("useAutoProviderFailover must be used within AutoProviderFailoverProvider");
  }
  return ctx;
}
