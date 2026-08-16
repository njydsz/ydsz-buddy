/**
 * @file 模型能力徽章 + 过滤 chip 组件
 * @description P0-2: 把 modelCapabilities.ts 的纯函数渲染为 React 组件。
 *
 * ## 组件
 *
 * - `ModelCapabilityBadges`: 单个模型旁的 1~4 个小徽章(图视觉/工具/推理/附件)
 * - `ModelCapabilityFilterChips`: 搜索 picker 顶部的过滤 chip 行
 *
 * @module components/ModelCapabilityIndicators
 */

import { memo, useCallback, useMemo } from "react";
import {
  CAPABILITY_KEYS_BY_ORDER,
  CAPABILITY_META,
  type ModelCapabilityFilterState,
  type ModelCapabilityKey,
  emptyCapabilityFilter,
  filterModelsByCapabilities,
  formatContextWindow,
  formatModelCost,
  listEnabledCapabilities,
  toggleCapability,
} from "~/lib/modelCapabilities";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { ProviderModelOption } from "~/providerModelOptions";

const BADGE_CLASSES = "text-[10px] px-1.5 py-0 leading-4 font-medium";

/**
 * 单模型旁的"视觉/工具/推理/附件"徽章组
 *
 * - 没有 caps 数据时返回 null
 * - 已合并 formatContextWindow / formatModelCost 的"上下文 + 成本"行
 *   单独由 `ModelContextCostRow` 渲染(避免徽章过密)
 */
export const ModelCapabilityBadges = memo(function ModelCapabilityBadges({
  capabilities,
  size = "sm",
}: {
  capabilities: ProviderModelOption["capabilities"];
  size?: "sm" | "xs";
}) {
  const keys = useMemo(() => listEnabledCapabilities(capabilities), [capabilities]);
  if (keys.length === 0) return null;
  const sizeClass = size === "xs" ? "text-[9px] px-1 py-0 leading-3" : BADGE_CLASSES;
  return (
    <span className="inline-flex items-center gap-1" data-testid="model-capability-badges">
      {keys.map((key) => {
        const meta = CAPABILITY_META[key];
        return (
          <Tooltip key={key}>
            <TooltipTrigger
              render={
                <Badge
                  variant="outline"
                  className={cn(
                    "border-border/60 bg-muted/30 text-muted-foreground",
                    sizeClass,
                  )}
                  data-testid={`cap-badge-${key}`}
                >
                  {meta.label}
                </Badge>
              }
            />
            <TooltipPopup>{describeCapability(key)}</TooltipPopup>
          </Tooltip>
        );
      })}
    </span>
  );
});

/** 能力语义描述(给 tooltip) */
function describeCapability(key: ModelCapabilityKey): string {
  switch (key) {
    case "imageInput":
      return "支持图像理解(看图)";
    case "toolUse":
      return "支持 function calling / 工具调用";
    case "reasoning":
      return "支持 extended thinking / 推理模式";
    case "attachment":
      return "支持文件附件(PDF/Office/zip)";
  }
}

/** 上下文窗口 + 定价的简短文本(单行) */
export const ModelContextCostRow = memo(function ModelContextCostRow({
  contextWindow,
  cost,
}: {
  contextWindow: ProviderModelOption["contextWindow"];
  cost: ProviderModelOption["cost"];
}) {
  const ctx = formatContextWindow(
    typeof contextWindow === "string" ? contextWindow : contextWindow?.size,
  );
  const costStr = formatModelCost(cost);
  if (!ctx && !costStr) return null;
  const parts: string[] = [];
  if (ctx) parts.push(ctx);
  if (costStr) parts.push(costStr);
  return (
    <span
      className="text-[10px] text-muted-foreground tabular-nums"
      data-testid="model-context-cost-row"
    >
      {parts.join(" · ")}
    </span>
  );
});

/**
 * 过滤 chip 行
 *
 * - 4 个核心能力 chip(视觉/工具/推理/附件),按 order 升序
 * - 当前激活时高亮(主色 outline),未激活时 muted
 * - 提供"清除"按钮(只在有任一 chip 激活时显示)
 */
export const ModelCapabilityFilterChips = memo(function ModelCapabilityFilterChips({
  state,
  onChange,
  options,
}: {
  state: ModelCapabilityFilterState;
  onChange: (next: ModelCapabilityFilterState) => void;
  /**
   * 当前 provider 的所有模型选项 —— 用于计算 chip 上的命中数(可选)。
   * 不传则不显示命中数,chip 纯按"是否激活"渲染。
   */
  options?: ReadonlyArray<ProviderModelOption>;
}) {
  const handleToggle = useCallback(
    (key: ModelCapabilityKey) => {
      onChange(toggleCapability(state, key));
    },
    [state, onChange],
  );
  const handleClear = useCallback(() => {
    onChange(emptyCapabilityFilter());
  }, [onChange]);

  const counts = useMemo(() => {
    const map: Partial<Record<ModelCapabilityKey, number>> = {};
    if (!options) return map;
    for (const key of CAPABILITY_KEYS_BY_ORDER) {
      map[key] = filterModelsByCapabilities(options, new Set([key])).length;
    }
    return map;
  }, [options]);

  const hasAny = state.required.size > 0;

  return (
    <div
      className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-border/40"
      data-testid="model-capability-filter-chips"
    >
      <span className="text-[10px] text-muted-foreground mr-1">能力</span>
      {CAPABILITY_KEYS_BY_ORDER.map((key) => {
        const meta = CAPABILITY_META[key];
        const active = state.required.has(key);
        const count = counts[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => handleToggle(key)}
            aria-pressed={active}
            data-testid={`filter-chip-${key}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
              active
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <span>{meta.label}</span>
            {typeof count === "number" && (
              <span className="opacity-60 tabular-nums">{count}</span>
            )}
          </button>
        );
      })}
      {hasAny && (
        <button
          type="button"
          onClick={handleClear}
          data-testid="filter-chip-clear"
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
        >
          清除
        </button>
      )}
    </div>
  );
});
