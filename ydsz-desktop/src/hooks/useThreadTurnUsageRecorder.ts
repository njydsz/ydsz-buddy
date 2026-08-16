/**
 * @file useThreadTurnUsageRecorder
 * @description 监听 thread.turn-completed 事件,把每次 AI 调用的成本写入 costUsageStore
 *
 * ## 大厂基线
 *
 * - 单 mount,组件树根注册一次,持久订阅
 * - 数据回填:orchestrator 当前不会下发 usage 字段,本 hook 在
 *   payload.usage 缺失时静默 noop(不会写入空记录,避免污染 budget 统计)
 * - 一旦后端补齐 ThreadTurnCompletedPayload 字段,无需改本 hook:
 *   它从 `event.payload.usage` 读取,后端字段就位即可自动生效
 *
 * ## 集成
 *
 * 由根路由 `<RootRouteView>` 挂载,不在 ChatView 内挂载(避免路由切换时丢失事件)。
 */

import { useEffect } from "react";

import { recordUsageAndCheck } from "./useCostBudgetGuard";
import { useDismissBudgetAlert } from "./useCostBudgetGuard";
import { toastManager } from "~/components/ui/toast";
import { useTranslation } from "~/i18n";
import { readNativeApi } from "~/nativeApi";
import type { OrchestrationThreadStreamItem } from "@ydsz-buddy/contracts";

/** turn-completed payload 中我们关心的 usage 形状(可选) */
interface TurnUsageLike {
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  costUsd?: number | null;
  threadId?: string | null;
  turnId?: string | null;
}

interface TurnCompletedLike {
  threadId?: string;
  turnId?: string;
  usage?: TurnUsageLike;
  costUsd?: number | null;
}

function extractUsage(payload: TurnCompletedLike | undefined): {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number | null;
  threadId: string | null;
  turnId: string | null;
} | null {
  if (!payload) return null;
  const usage = payload.usage;
  if (!usage) return null;
  const provider = usage.provider?.trim();
  const model = usage.model?.trim();
  if (!provider || !model) {
    return null;
  }
  const inputTokens = Math.max(0, Number(usage.inputTokens ?? 0) || 0);
  const outputTokens = Math.max(0, Number(usage.outputTokens ?? 0) || 0);
  const cachedInputTokens = Math.max(
    0,
    Number(usage.cachedInputTokens ?? 0) || 0,
  );
  if (inputTokens === 0 && outputTokens === 0 && cachedInputTokens === 0) {
    // 完全没有 token 计数:可能是 orchestrator 还没补齐,静默跳过
    return null;
  }
  const costUsd =
    typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd)
      ? usage.costUsd
      : typeof payload.costUsd === "number" && Number.isFinite(payload.costUsd)
        ? payload.costUsd
        : null;
  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    costUsd,
    threadId: payload.threadId ?? usage.threadId ?? null,
    turnId: payload.turnId ?? usage.turnId ?? null,
  };
}

/**
 * 注册全局 thread.turn-completed 监听,把每次调用的 usage 写 store 并触发告警检测。
 *
 * @returns void
 */
export function useThreadTurnUsageRecorder(): void {
  const dismiss = useDismissBudgetAlert();
  const { messages } = useTranslation();

  useEffect(() => {
    const api = readNativeApi();
    if (!api || typeof api.orchestration.onThreadEvent !== "function") {
      return;
    }
    const unsub = api.orchestration.onThreadEvent((item: OrchestrationThreadStreamItem) => {
      if (item.kind !== "event") return;
      const event = item.event;
      if (!event || event.type !== "thread.turn-completed") return;
      // OrchestrationEvent 的 payload 是结构化的,这里用 unknown 透传到 extractUsage
      // (orchestrator 当前不会下发 usage 字段,extractUsage 会静默 noop)
      const usage = extractUsage(event.payload as unknown as TurnCompletedLike);
      if (!usage) return;
      const alert = recordUsageAndCheck({
        provider: usage.provider as never,
        model: usage.model,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          ...(usage.cachedInputTokens > 0
            ? { cachedInputTokens: usage.cachedInputTokens }
            : {}),
        },
        ...(usage.costUsd !== null ? { costUsd: usage.costUsd } : {}),
        ...(usage.threadId ? { threadId: usage.threadId } : {}),
        ...(usage.turnId ? { turnId: usage.turnId } : {}),
      });
      if (alert) {
        // 新阈值告警 → toast(横幅走 BudgetAlertBanner 持续展示)
        const desc = messages.costBudget.alert.description(
          alert.threshold,
          alert.spend.toFixed(2),
          alert.budget.toFixed(2),
        );
        toastManager.add({
          type: alert.threshold >= 1.0 ? "error" : "warning",
          title: messages.costBudget.alert.title,
          description: desc,
          timeout: 6000,
        });
        // 自动 dismiss,banner 仍会显示直到用户手动关闭
        dismiss(alert);
      }
    });
    return () => {
      try {
        unsub();
      } catch {
        // 忽略取消订阅异常
      }
    };
  }, [dismiss, messages]);
}
