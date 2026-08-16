/**
 * @file BudgetBlockDialog
 * @description 成本预算拦截确认对话框（P2-4）
 *
 * 业务层 send 之前调用 useCostBudgetGuard() 拿到 shouldBlock=true 时,
 * 弹此对话框要求用户确认是否"仍要继续"。
 *
 * - 用户点继续 → 触发 onContinue() → 业务层继续 send
 * - 用户点取消 → 触发 onCancel() → 业务层中断
 *
 * ## 大厂基线
 *
 * - 默认聚焦"取消"按钮(防误触放行)
 * - ESC 触发取消
 * - 文案走 i18n
 * - 拦截原因 reason 是结构化 `scope:spend:budget`,UI 解析后用 i18n 渲染
 */

import { useEffect, useMemo, useRef } from "react";

import { useTranslation } from "~/i18n";
import { parseBudgetGuardReason } from "~/hooks/useCostBudgetGuard";
import { formatUsd } from "~/lib/costTracking";
import { cn } from "~/lib/utils";

export interface BudgetBlockDialogProps {
  open: boolean;
  scope: "daily" | "monthly" | null;
  threshold: number | null;
  /** 来自 useCostBudgetGuard 的结构化 reason(scope:spend:budget) */
  reason: string | null;
  onContinue: () => void;
  onCancel: () => void;
}

export function BudgetBlockDialog({
  open,
  scope,
  threshold,
  reason,
  onContinue,
  onCancel,
}: BudgetBlockDialogProps) {
  const { messages } = useTranslation();
  const t = messages.costBudget.blockDialog;
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // 默认聚焦"取消"按钮 + ESC 处理
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // 解析 reason → i18n 化拦截描述
  const reasonDisplay = useMemo<string | null>(() => {
    const parsed = parseBudgetGuardReason(reason);
    if (!parsed) return null;
    if (parsed.scope === "daily") {
      return t.reasonDaily(formatUsd(parsed.spend), formatUsd(parsed.budget));
    }
    return t.reasonMonthly(formatUsd(parsed.spend), formatUsd(parsed.budget));
  }, [reason, t]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-budget-block-title"
      data-testid="cost-budget-block-dialog"
      data-scope={scope ?? "unknown"}
      data-threshold={threshold ?? "none"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={cn(
          "w-[min(440px,calc(100vw-32px))] space-y-3 rounded-lg border border-border bg-bg-elevated p-5 shadow-lg",
        )}
      >
        <h2 id="cost-budget-block-title" className="text-base font-semibold text-fg">
          {t.title}
        </h2>
        <p className="text-sm text-fg-muted">{t.description}</p>
        {reasonDisplay && (
          <div className="rounded-md border border-border bg-bg-subtle p-2.5">
            <p className="text-xs font-medium text-fg-muted">{t.reasonLabel}</p>
            <p className="mt-1 text-sm text-fg" data-testid="cost-budget-block-reason">
              {reasonDisplay}
            </p>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            data-testid="cost-budget-block-cancel"
            className={cn(
              "rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm font-medium text-fg",
              "hover:bg-bg-subtle focus:outline-none focus:ring-2 focus:ring-accent/40",
            )}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={onContinue}
            data-testid="cost-budget-block-continue"
            className={cn(
              "rounded-md border border-danger bg-danger px-3 py-1.5 text-sm font-medium text-danger-fg",
              "hover:bg-danger/90 focus:outline-none focus:ring-2 focus:ring-danger/40",
            )}
          >
            {t.continue}
          </button>
        </div>
      </div>
    </div>
  );
}
