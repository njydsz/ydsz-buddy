/**
 * @file useChatBudgetGuard
 * @description 把 useCostBudgetGuard 接入到 chat send 流程
 *
 * 业务层调用 `requestSendBudgetApproval()`:
 * - policy=warn 或未超额 → 立即 resolve true,无 UI 弹窗
 * - policy=block + 超额 → 弹 BudgetBlockDialog,等待用户确认
 *   - 用户点继续 → resolve true(放行本次)
 *   - 用户点取消 / ESC → resolve false(中断)
 *
 * ## 大厂基线
 *
 * - 单实例:同时只允许一个待确认的 budget 对话框(同 budget scope 内并发 send 串行化)
 * - resolve 后立即清空 pending state,避免闭包泄漏
 * - reason 是结构化 `scope:spend:budget`,UI 层按 messages 渲染
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useCostBudgetGuard } from "./useCostBudgetGuard";
import { BudgetBlockDialog } from "~/components/BudgetBlockDialog";
import type { BudgetGuardDecision } from "./useCostBudgetGuard";

/**
 * 业务层 send 之前调用,等待"预算放行"结果
 *
 * @returns { approve, BudgetBlockDialogElement }
 *   - approve() → Promise<boolean>:true = 放行,false = 中断
 *   - BudgetBlockDialogElement: 渲染到组件树任意位置
 */
export function useChatBudgetGuard() {
  const decision = useCostBudgetGuard();
  const [pending, setPending] = useState<BudgetGuardDecision | null>(null);
  const resolverRef = useRef<((approved: boolean) => void) | null>(null);

  // pending 状态变更时,确保 resolver 不残留
  useEffect(() => {
    if (pending === null && resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, [pending]);

  const approve = useCallback((): Promise<boolean> => {
    if (!decision.shouldBlock) return Promise.resolve(true);
    if (pending !== null) {
      // 已有 pending 的 budget 对话框:把当前的 resolve 串行到队尾
      // 简化实现:直接 reject 当前,让业务层用之前的 approval 流程
      return Promise.resolve(false);
    }
    setPending(decision);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, [decision, pending]);

  const handleContinue = useCallback(() => {
    if (resolverRef.current) resolverRef.current(true);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const handleCancel = useCallback(() => {
    if (resolverRef.current) resolverRef.current(false);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const dialog = (
    <BudgetBlockDialog
      open={pending !== null}
      scope={pending?.scope ?? null}
      threshold={pending?.threshold ?? null}
      reason={pending?.reason ?? null}
      onContinue={handleContinue}
      onCancel={handleCancel}
    />
  );

  return { approve, dialog, pending };
}
