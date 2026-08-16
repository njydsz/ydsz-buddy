/**
 * @file CostBudgetPanel
 * @description 成本预算设置面板（P2-4）
 *
 * Settings 中嵌入的"成本预算"子面板:
 * - 日预算 / 月预算 input
 * - 拦截策略(warn / block)单选
 * - 实时显示当前花费进度条
 *
 * ## 大厂基线
 *
 * - 输入框失焦时提交(避免每个按键都写 store)
 * - 数值变化清空 dismissed 列表(由 store 内部处理,UI 不感知)
 * - 进度条 0% / 100% / 超额 三种视觉态
 */

import { useTranslation } from "~/i18n";
import { useCallback, useId, useState } from "react";

import { useCostBudgetSnapshot } from "~/hooks/useCostBudgetGuard";
import {
  useCostBudgetStore,
  type BudgetPolicy,
} from "~/costBudgetStore";
import { formatUsd } from "~/lib/costTracking";
import { cn } from "~/lib/utils";

/** 进度条宽度百分比(封顶 100% 用于视觉,文本仍可显示 > 100%) */
function ratioToPercent(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio >= 1) return 100;
  return Math.round(ratio * 100);
}

interface NumberInputProps {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  value: number | null;
  onChange: (next: number | null) => void;
  testId: string;
}

/** 受控的"金额输入"组件:支持空 / 0 / 浮点,失焦时归一化 */
function NumberInput({ id, label, hint, placeholder, value, onChange, testId }: NumberInputProps) {
  const [draft, setDraft] = useState<string>(
    value == null ? "" : String(value),
  );
  // 父组件 value 变化时同步 draft(如 store 重置)
  // 注意:不能简单用 useEffect 同步,会陷入死循环;
  // 用 key-on-store 的方式重置
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-fg-muted">$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={draft}
          data-testid={testId}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const trimmed = draft.trim();
            if (trimmed === "") {
              onChange(null);
              return;
            }
            const num = Number(trimmed);
            if (Number.isFinite(num) && num >= 0) {
              onChange(num);
              setDraft(num === 0 ? "0" : String(num));
            } else {
              // 非法:回滚到上次合法值
              setDraft(value == null ? "" : String(value));
            }
          }}
          className={cn(
            "flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-accent/40",
            "placeholder:text-fg-muted/60",
          )}
        />
      </div>
      <p className="text-xs text-fg-muted">{hint}</p>
    </div>
  );
}

interface PolicyOptionProps {
  /** 策略标识(用于在父组件中区分选中项) */
  value: "warn" | "block";
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  testId: string;
}

function PolicyOption({ label, description, selected, onSelect, testId }: PolicyOptionProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={testId}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition",
        "focus:outline-none focus:ring-2 focus:ring-accent/40",
        selected
          ? "border-accent bg-accent/5"
          : "border-border bg-bg hover:border-accent/40",
      )}
    >
      <span className="text-sm font-medium text-fg">{label}</span>
      <span className="text-xs text-fg-muted">{description}</span>
    </button>
  );
}

interface SpendMeterProps {
  label: string;
  spend: number;
  budget: number | null;
  ratio: number;
  remaining: number;
  exceeded: boolean;
  noBudgetLabel: string;
  exceededLabel: string;
  remainingFormatter: (amount: string) => string;
  spentOfFormatter: (spend: string, budget: string) => string;
}

function SpendMeter(props: SpendMeterProps) {
  const { label, spend, budget, ratio, remaining, exceeded, noBudgetLabel, exceededLabel, remainingFormatter, spentOfFormatter } = props;
  if (budget == null) {
    return (
      <div className="rounded-md border border-dashed border-border bg-bg-subtle p-3">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        <p className="mt-1 text-sm text-fg-muted">{noBudgetLabel}</p>
      </div>
    );
  }
  const pct = ratioToPercent(ratio);
  return (
    <div className="space-y-1.5" data-testid="cost-budget-meter">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        <p
          className={cn(
            "text-xs font-medium tabular-nums",
            exceeded ? "text-danger" : "text-fg",
          )}
          data-testid="cost-budget-spend-label"
        >
          {spentOfFormatter(formatUsd(spend), formatUsd(budget))}
        </p>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-bg-subtle"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            exceeded
              ? "bg-danger"
              : ratio >= 0.95
                ? "bg-warning"
                : ratio >= 0.8
                  ? "bg-warning/70"
                  : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
          data-testid="cost-budget-progress-bar"
        />
      </div>
      <p
        className={cn(
          "text-xs tabular-nums",
          exceeded ? "text-danger" : "text-fg-muted",
        )}
      >
        {exceeded
          ? exceededLabel
          : remainingFormatter(formatUsd(Math.max(0, remaining)))}
      </p>
    </div>
  );
}

export function CostBudgetPanel() {
  const { messages } = useTranslation();
  const t = messages.costBudget;
  const dailyBudget = useCostBudgetStore((s) => s.dailyBudgetUsd);
  const monthlyBudget = useCostBudgetStore((s) => s.monthlyBudgetUsd);
  const policy = useCostBudgetStore((s) => s.policy);
  const setDailyBudget = useCostBudgetStore((s) => s.setDailyBudget);
  const setMonthlyBudget = useCostBudgetStore((s) => s.setMonthlyBudget);
  const setPolicy = useCostBudgetStore((s) => s.setPolicy);
  const snapshot = useCostBudgetSnapshot();

  const dailyId = useId();
  const monthlyId = useId();

  const handlePolicySelect = useCallback(
    (next: BudgetPolicy) => {
      setPolicy(next);
    },
    [setPolicy],
  );

  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-bg-elevated p-4"
      data-testid="cost-budget-panel"
    >
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-fg">{t.sectionTitle}</h2>
        <p className="text-sm text-fg-muted">{t.sectionDescription}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberInput
          id={dailyId}
          label={t.dailyBudget.label}
          hint={t.dailyBudget.hint}
          placeholder={t.dailyBudget.placeholder}
          value={dailyBudget}
          onChange={setDailyBudget}
          testId="cost-budget-daily-input"
        />
        <NumberInput
          id={monthlyId}
          label={t.monthlyBudget.label}
          hint={t.monthlyBudget.hint}
          placeholder={t.monthlyBudget.placeholder}
          value={monthlyBudget}
          onChange={setMonthlyBudget}
          testId="cost-budget-monthly-input"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-fg">{t.policy.label}</p>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          <PolicyOption
            value="warn"
            label={t.policy.warn}
            description={t.policy.warnDescription}
            selected={policy === "warn"}
            onSelect={() => handlePolicySelect("warn")}
            testId="cost-budget-policy-warn"
          />
          <PolicyOption
            value="block"
            label={t.policy.block}
            description={t.policy.blockDescription}
            selected={policy === "block"}
            onSelect={() => handlePolicySelect("block")}
            testId="cost-budget-policy-block"
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-3">
        <p className="text-sm font-medium text-fg">{t.progress.title}</p>
        <SpendMeter
          label={t.progress.dailyLabel}
          spend={snapshot.dailySpend}
          budget={snapshot.dailyBudget}
          ratio={snapshot.dailyRatio}
          remaining={snapshot.dailyRemaining}
          exceeded={snapshot.exceeded && snapshot.dailyRemaining < 0}
          noBudgetLabel={t.progress.noBudget}
          exceededLabel={t.progress.exceeded}
          remainingFormatter={t.progress.remaining}
          spentOfFormatter={t.progress.spentOf}
        />
        <SpendMeter
          label={t.progress.monthlyLabel}
          spend={snapshot.monthlySpend}
          budget={snapshot.monthlyBudget}
          ratio={snapshot.monthlyRatio}
          remaining={snapshot.monthlyRemaining}
          exceeded={snapshot.exceeded && snapshot.monthlyRemaining < 0}
          noBudgetLabel={t.progress.noBudget}
          exceededLabel={t.progress.exceeded}
          remainingFormatter={t.progress.remaining}
          spentOfFormatter={t.progress.spentOf}
        />
      </div>
    </section>
  );
}
