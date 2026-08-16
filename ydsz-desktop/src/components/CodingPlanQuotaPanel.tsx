/**
 * @file CodingPlanQuotaPanel
 * @description 国内 Coding Plan 配额面板（G6 目标：GLM/DeepSeek/Moonshot/Qwen 4 家）
 *
 * 在 Provider 设置或 sidebar 中展示 4 家国内 Coding Plan 订阅的剩余额度：
 *
 * - **摘要卡片**：每家 Provider 一个卡，状态徽标（已绑定 / 未绑定 / 拉取中 / 未知）
 * - **剩余额度**：百分比进度条 + 文本 + reset 时间
 * - **Learn more**：跳到官方用量控制台（由 `deriveProviderUsageLearnMoreHref` 派生）
 * - **绑定入口**：未绑定时展示「绑定 Coding Plan」按钮
 *
 * ## 关键设计
 *
 * - **数据源**：`useCodingPlanQuota()` Hook 提供 4 家 Provider 的 `CodingPlanQuotaSnapshot`
 * - **不阻塞 UI**：未拉取时显示「正在获取额度」+ 骨架进度条
 * - **i18n**：使用 `messages.codingPlan.*` 命名空间（en/zh 双语）
 *
 * @module components/CodingPlanQuotaPanel
 */

import { useCallback, useMemo, type ReactNode } from "react";
import type { ProviderKind } from "~/contracts";
import { deriveProviderUsageLearnMoreHref } from "~/lib/rateLimits";
import { useMessages } from "~/i18n";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Spinner } from "./ui/spinner";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";

// ─── 类型 ────────────────────────────────────────────────────────────────────

export type CodingPlanProviderId = "glm" | "deepseek" | "moonshot" | "qwen";

/**
 * 配额快照
 *
 * - `bound=false`：用户未绑定此 Coding Plan
 * - `fetching=true`：正在拉取配额
 * - `remainingPercent=null`：Provider 未返回 quota（不是错误，标识"无数据"）
 */
export interface CodingPlanQuotaSnapshot {
  provider: CodingPlanProviderId;
  bound: boolean;
  fetching: boolean;
  /** 剩余百分比 0~100，null 表示 Provider 未返回 quota */
  remainingPercent: number | null;
  /** 重置时间（ISO 字符串），null 表示无限量或未知 */
  resetsAt: string | null;
  /** 错误信息（拉取失败时填充） */
  errorMessage: string | null;
  /** 上次更新时间（ISO 字符串） */
  updatedAt: string;
}

export interface CodingPlanQuotaPanelProps {
  /** 4 家 Provider 的配额快照 */
  snapshots: ReadonlyArray<CodingPlanQuotaSnapshot>;
  /** 刷新单家 Provider */
  onRefresh?: (provider: CodingPlanProviderId) => void;
  /** 跳到绑定流程（带 provider 标识） */
  onBind?: (provider: CodingPlanProviderId) => void;
  /** 跳到设置/登录入口（无 provider 标识） */
  onOpenSettings?: () => void;
  /** 类名透传 */
  className?: string;
  /** 是否显示整段标题（默认 true） */
  showHeader?: boolean;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const CODING_PLAN_PROVIDERS: ReadonlyArray<CodingPlanProviderId> = [
  "glm",
  "deepseek",
  "moonshot",
  "qwen",
];

const QUOTA_BAR_THRESHOLDS = {
  /** 0~50%: 绿色 */
  low: 50,
  /** 50~85%: 黄色 */
  mid: 85,
  /** 85%+: 红色 */
} as const;

// ─── 子组件：进度条 ───────────────────────────────────────────────────────────

function QuotaProgressBar({ percent }: { percent: number | null }) {
  if (percent === null) {
    return (
      <div
        data-testid="coding-plan-progress-unknown"
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full w-1/3 animate-pulse bg-muted-foreground/40" />
      </div>
    );
  }
  const clamped = Math.max(0, Math.min(100, percent));
  const tone =
    clamped >= QUOTA_BAR_THRESHOLDS.mid
      ? "bg-(--color-destructive)"
      : clamped >= QUOTA_BAR_THRESHOLDS.low
        ? "bg-(--color-warning)"
        : "bg-(--color-success)";
  return (
    <div
      data-testid="coding-plan-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn("h-full transition-all", tone)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// ─── 子组件：状态徽标 ─────────────────────────────────────────────────────────

function StatusBadge({
  snapshot,
  labels,
}: {
  snapshot: CodingPlanQuotaSnapshot;
  labels: {
    bound: string;
    notBound: string;
    quotaUnknown: string;
    fetching: string;
  };
}) {
  if (snapshot.fetching) {
    return (
      <span
        data-testid="coding-plan-status-fetching"
        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      >
        <Spinner className="size-3" />
        {labels.fetching}
      </span>
    );
  }
  if (snapshot.errorMessage) {
    return (
      <span
        data-testid="coding-plan-status-error"
        className="inline-flex items-center gap-1 rounded-full bg-(--color-destructive)/10 px-2 py-0.5 text-[10px] font-medium text-(--color-destructive)"
      >
        <CircleAlertIcon className="size-3" />
        {snapshot.errorMessage}
      </span>
    );
  }
  if (!snapshot.bound) {
    return (
      <span
        data-testid="coding-plan-status-not-bound"
        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      >
        {labels.notBound}
      </span>
    );
  }
  if (snapshot.remainingPercent === null) {
    return (
      <span
        data-testid="coding-plan-status-quota-unknown"
        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      >
        {labels.quotaUnknown}
      </span>
    );
  }
  return (
    <span
      data-testid="coding-plan-status-bound"
      className="inline-flex items-center gap-1 rounded-full bg-(--color-success)/10 px-2 py-0.5 text-[10px] font-medium text-(--color-success)"
    >
      <CircleCheckIcon className="size-3" />
      {labels.bound}
    </span>
  );
}

// ─── 子组件：单家 Provider 卡片 ───────────────────────────────────────────────

interface ProviderCardProps {
  snapshot: CodingPlanQuotaSnapshot;
  providerLabel: string;
  learnMoreHref: string | null;
  quotaRow: {
    label: string;
    remaining: (percent: number) => string;
    resetsAt: (when: string) => string;
    unlimited: string;
  };
  actions: {
    bind: string;
    viewUsage: string;
    refresh: string;
  };
  onRefresh?: (provider: CodingPlanProviderId) => void;
  onBind?: (provider: CodingPlanProviderId) => void;
  statusLabels: {
    bound: string;
    notBound: string;
    quotaUnknown: string;
    fetching: string;
  };
  /** 用于显示重置时间的格式化函数（来自父组件 useMessages） */
  formatReset: (iso: string) => string;
}

function ProviderCard({
  snapshot,
  providerLabel,
  learnMoreHref,
  quotaRow,
  actions,
  onRefresh,
  onBind,
  statusLabels,
  formatReset,
}: ProviderCardProps) {
  const handleOpenConsole = useCallback(() => {
    if (learnMoreHref && typeof window !== "undefined") {
      window.open(learnMoreHref, "_blank", "noopener,noreferrer");
    }
  }, [learnMoreHref]);

  const handleRefresh = useCallback(() => {
    onRefresh?.(snapshot.provider);
  }, [onRefresh, snapshot.provider]);

  const handleBind = useCallback(() => {
    onBind?.(snapshot.provider);
  }, [onBind, snapshot.provider]);

  const remainingText = useMemo(() => {
    if (snapshot.remainingPercent === null) return quotaRow.unlimited;
    return quotaRow.remaining(snapshot.remainingPercent);
  }, [snapshot.remainingPercent, quotaRow]);

  const resetText = useMemo(() => {
    if (!snapshot.resetsAt) return null;
    try {
      return formatReset(snapshot.resetsAt);
    } catch {
      return null;
    }
  }, [snapshot.resetsAt, formatReset]);

  return (
    <Card
      data-testid="coding-plan-quota-card"
      data-provider={snapshot.provider}
      data-bound={snapshot.bound ? "true" : "false"}
      data-fetching={snapshot.fetching ? "true" : "false"}
      className="min-w-0"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="truncate text-sm font-semibold">
            {providerLabel}
          </CardTitle>
          <StatusBadge snapshot={snapshot} labels={statusLabels} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 进度条 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{quotaRow.label}</span>
            <span
              data-testid="coding-plan-quota-remaining"
              className="font-mono text-foreground/80"
            >
              {remainingText}
            </span>
          </div>
          <QuotaProgressBar percent={snapshot.remainingPercent} />
          {resetText ? (
            <div
              data-testid="coding-plan-quota-resets"
              className="text-[10px] text-muted-foreground/80"
            >
              {quotaRow.resetsAt(resetText)}
            </div>
          ) : null}
        </div>

        {/* 错误信息 */}
        {snapshot.errorMessage ? (
          <p
            data-testid="coding-plan-quota-error"
            className="text-[10px] text-(--color-destructive)"
            role="alert"
          >
            {snapshot.errorMessage}
          </p>
        ) : null}

        {/* 操作按钮 */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {snapshot.bound ? (
            learnMoreHref ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleOpenConsole}
                data-testid="coding-plan-open-console"
                data-provider={snapshot.provider}
              >
                <ExternalLinkIcon className="size-3" />
                {actions.viewUsage}
              </Button>
            ) : null
          ) : onBind ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleBind}
              data-testid="coding-plan-bind"
              data-provider={snapshot.provider}
            >
              {actions.bind}
            </Button>
          ) : null}
          {onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleRefresh}
              disabled={snapshot.fetching}
              data-testid="coding-plan-refresh"
              data-provider={snapshot.provider}
              aria-label={actions.refresh}
            >
              <RefreshCwIcon className="size-3" />
              {actions.refresh}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function CodingPlanQuotaPanel({
  snapshots,
  onRefresh,
  onBind,
  onOpenSettings: _onOpenSettings,
  className,
  showHeader = true,
}: CodingPlanQuotaPanelProps) {
  const messages = useMessages();
  const cpMessages = messages.codingPlan;

  // 用 providerId → snapshot 的 Map，避免 O(n^2) 查找
  const snapshotByProvider = useMemo(() => {
    const map = new Map<CodingPlanProviderId, CodingPlanQuotaSnapshot>();
    for (const s of snapshots) {
      map.set(s.provider, s);
    }
    return map;
  }, [snapshots]);

  // 简单的 reset 时间格式化（24h 内显示 HH:mm，否则显示月日）
  const formatReset = useCallback((iso: string): string => {
    const resetMs = Date.parse(iso);
    if (Number.isNaN(resetMs)) return "";
    const diffMs = resetMs - Date.now();
    if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(resetMs);
    }
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(resetMs);
  }, []);

  const cards: ReactNode = CODING_PLAN_PROVIDERS.map((provider) => {
    const snapshot =
      snapshotByProvider.get(provider) ??
      ({
        provider,
        bound: false,
        fetching: false,
        remainingPercent: null,
        resetsAt: null,
        errorMessage: null,
        updatedAt: new Date(0).toISOString(),
      } satisfies CodingPlanQuotaSnapshot);
    const label = (() => {
      switch (provider) {
        case "glm":
          return cpMessages.providerLabel.glm;
        case "deepseek":
          return cpMessages.providerLabel.deepseek;
        case "moonshot":
          return cpMessages.providerLabel.moonshot;
        case "qwen":
          return cpMessages.providerLabel.qwen;
      }
    })();
    // deriveProviderUsageLearnMoreHref 接受的是 ProviderKind（CodingPlan 的 provider id 与 ProviderKind 对齐）
    const learnMoreHref = deriveProviderUsageLearnMoreHref(
      provider as unknown as ProviderKind,
    );
    return (
      <ProviderCard
        key={provider}
        snapshot={snapshot}
        providerLabel={label}
        learnMoreHref={learnMoreHref}
        quotaRow={cpMessages.quotaRow}
        actions={cpMessages.actions}
        onRefresh={onRefresh}
        onBind={onBind}
        statusLabels={cpMessages.status}
        formatReset={formatReset}
      />
    );
  });

  return (
    <div
      data-testid="coding-plan-quota-panel"
      className={cn("space-y-3", className)}
    >
      {showHeader ? (
        <div className="space-y-1">
          <h3
            data-testid="coding-plan-section-title"
            className="text-sm font-semibold text-foreground"
          >
            {cpMessages.sectionTitle}
          </h3>
          <p
            data-testid="coding-plan-section-description"
            className="text-xs text-muted-foreground/85"
          >
            {cpMessages.sectionDescription}
          </p>
        </div>
      ) : null}
      <div
        data-testid="coding-plan-card-grid"
        className="grid gap-2 sm:grid-cols-2"
      >
        {cards}
      </div>
    </div>
  );
}
