/**
 * @file 状态栏组件
 *
 * 顶部常驻状态栏，显示当前 Mode · Provider · Model · Token 消耗 · 任务数。
 * 即使 Sidebar 折叠也保持可见，点击任一项可弹下拉切换。
 *
 * ## 核心功能
 *
 * - **状态展示**：Mode / Provider / Model / Token / 任务数
 * - **快速切换**：点击各项弹出下拉菜单
 * - **常驻可见**：Sidebar 折叠后仍显示
 * - **性能优化**：响应 < 50ms
 *
 * ## 使用场景
 *
 * - ChatView 顶部
 * - 全局状态快速访问
 *
 * ## 注意事项
 *
 * - 4K 屏居中不重叠
 * - 点击响应 < 50ms
 * - 与 ModeSwitcher / ProviderModelPicker 联动
 */

import { memo, useCallback, useMemo } from "react";
import { PiCpu, PiDatabase, PiLightning, PiListChecks } from "react-icons/pi";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Menu,
  MenuGroup,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { cn } from "~/lib/utils";
import { formatTokenCount } from "~/lib/formatTokenCount";
import type {
  ModelSlug,
  ProviderInteractionMode,
  ProviderKind,
  RuntimeMode,
  ServerProviderStatus,
} from "~/contracts";
import { PROVIDER_DISPLAY_NAMES } from "~/contracts";
import { PROVIDER_ICON_COMPONENT_BY_PROVIDER } from "./ProviderIcon";
import { getModeBadgeLabel } from "./ModeSwitcher";
import { TbChevronDown } from "react-icons/tb";

interface StatusBarProps {
  /** 当前运行时模式 */
  runtimeMode: RuntimeMode;
  /** 当前交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 当前 Provider */
  provider: ProviderKind;
  /** 当前模型 */
  model: ModelSlug;
  /** Provider 状态列表 */
  providerStatuses: ServerProviderStatus[];
  /** 可用模型列表 */
  availableModels: Array<{ slug: ModelSlug; label: string }>;
  /** Token 消耗 */
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  /** 活跃任务数 */
  activeTaskCount?: number;
  /** 模式切换回调 */
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  /** 交互模式切换回调 */
  onInteractionModeChange: (mode: ProviderInteractionMode) => void;
  /** Provider 切换回调 */
  onProviderChange: (provider: ProviderKind) => void;
  /** 模型切换回调 */
  onModelChange: (model: ModelSlug) => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * 状态栏组件
 */
export const StatusBar = memo(function StatusBar({
  runtimeMode,
  interactionMode,
  provider,
  model,
  providerStatuses,
  availableModels,
  tokenUsage,
  activeTaskCount = 0,
  onRuntimeModeChange,
  onInteractionModeChange,
  onProviderChange,
  onModelChange,
  className,
}: StatusBarProps) {
  const modeLabel = useMemo(
    () => getModeBadgeLabel(runtimeMode, interactionMode),
    [runtimeMode, interactionMode],
  );

  const providerLabel = useMemo(
    () => PROVIDER_DISPLAY_NAMES[provider] ?? provider,
    [provider],
  );

  const modelLabel = useMemo(() => {
    const found = availableModels.find((m) => m.slug === model);
    return found?.label ?? model;
  }, [availableModels, model]);

  const providerStatus = useMemo(
    () => providerStatuses.find((s) => s.provider === provider),
    [providerStatuses, provider],
  );

  const ProviderIcon = PROVIDER_ICON_COMPONENT_BY_PROVIDER[provider];

  const handleRuntimeModeChange = useCallback(
    (value: string) => {
      if (value === "work" || value === "code") {
        onRuntimeModeChange(value);
      }
    },
    [onRuntimeModeChange],
  );

  const handleInteractionModeChange = useCallback(
    (value: string) => {
      const modes: ProviderInteractionMode[] = ["agent", "chat", "plan", "review", "task"];
      if (modes.includes(value as ProviderInteractionMode)) {
        onInteractionModeChange(value as ProviderInteractionMode);
      }
    },
    [onInteractionModeChange],
  );

  return (
    <div
      className={cn(
        "flex h-8 items-center gap-2 border-b border-border bg-muted/30 px-3 text-xs",
        className,
      )}
      role="status"
      aria-label="应用状态栏"
    >
      {/* Mode 切换 */}
      <Menu modal={false}>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 gap-1 px-2 text-xs"
                    aria-label={`模式: ${modeLabel}`}
                  />
                }
              >
                <Badge
                  variant="outline"
                  className="h-5 cursor-pointer items-center gap-1 px-1.5 text-[10px]"
                >
                  <PiLightning className="size-3" />
                  <span>{modeLabel}</span>
                  <TbChevronDown className="size-2.5 opacity-60" />
                </Badge>
              </MenuTrigger>
            }
          />
          <TooltipPopup side="bottom">点击切换模式</TooltipPopup>
        </Tooltip>
        <MenuPopup align="start" side="bottom" className="w-56">
          <MenuGroup>
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Runtime
            </div>
            <MenuRadioGroup value={runtimeMode} onValueChange={handleRuntimeModeChange}>
              <MenuRadioItem value="code">
                <PiCpu className="size-3.5" />
                <span>Code</span>
              </MenuRadioItem>
              <MenuRadioItem value="work">
                <PiLightning className="size-3.5" />
                <span>Work</span>
              </MenuRadioItem>
            </MenuRadioGroup>
          </MenuGroup>
          <MenuSeparator />
          <MenuGroup>
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Interaction
            </div>
            <MenuRadioGroup value={interactionMode} onValueChange={handleInteractionModeChange}>
              <MenuRadioItem value="agent">Agent</MenuRadioItem>
              <MenuRadioItem value="chat">Chat</MenuRadioItem>
              <MenuRadioItem value="plan">Plan</MenuRadioItem>
              <MenuRadioItem value="review">Review</MenuRadioItem>
              <MenuRadioItem value="task">Task</MenuRadioItem>
            </MenuRadioGroup>
          </MenuGroup>
        </MenuPopup>
      </Menu>

      {/* 分隔符 */}
      <div className="h-4 w-px bg-border" />

      {/* Provider 切换 */}
      <Menu modal={false}>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 gap-1 px-2 text-xs"
                    aria-label={`Provider: ${providerLabel}`}
                  />
                }
              >
                {ProviderIcon && <ProviderIcon className="size-3" />}
                <span>{providerLabel}</span>
                {providerStatus && !providerStatus.available && (
                  <span className="size-1.5 rounded-full bg-destructive" />
                )}
                <TbChevronDown className="size-2.5 opacity-60" />
              </MenuTrigger>
            }
          />
          <TooltipPopup side="bottom">点击切换 Provider</TooltipPopup>
        </Tooltip>
        <MenuPopup align="start" side="bottom" className="w-56">
          <MenuRadioGroup value={provider} onValueChange={(v) => onProviderChange(v as ProviderKind)}>
            {providerStatuses.map((status) => {
              const Icon = PROVIDER_ICON_COMPONENT_BY_PROVIDER[status.provider];
              return (
                <MenuRadioItem key={status.provider} value={status.provider}>
                  {Icon && <Icon className="size-3.5" />}
                  <span>{PROVIDER_DISPLAY_NAMES[status.provider]}</span>
                  {!status.available && (
                    <span className="ml-auto size-1.5 rounded-full bg-destructive" />
                  )}
                </MenuRadioItem>
              );
            })}
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>

      {/* 分隔符 */}
      <div className="h-4 w-px bg-border" />

      {/* Model 切换 */}
      <Menu modal={false}>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 gap-1 px-2 text-xs"
                    aria-label={`模型: ${modelLabel}`}
                  />
                }
              >
                <PiDatabase className="size-3" />
                <span className="max-w-32 truncate">{modelLabel}</span>
                <TbChevronDown className="size-2.5 opacity-60" />
              </MenuTrigger>
            }
          />
          <TooltipPopup side="bottom">点击切换模型</TooltipPopup>
        </Tooltip>
        <MenuPopup align="start" side="bottom" className="w-64">
          <MenuRadioGroup value={model} onValueChange={(v) => onModelChange(v as ModelSlug)}>
            {availableModels.map((m) => (
              <MenuRadioItem key={m.slug} value={m.slug}>
                <span className="truncate">{m.label}</span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>

      {/* 右侧：Token 消耗和任务数 */}
      <div className="ml-auto flex items-center gap-3">
        {/* Token 消耗 */}
        {tokenUsage && (
          <Tooltip>
            <TooltipTrigger render={<div className="flex items-center gap-1 text-muted-foreground" />}>
              <PiLightning className="size-3" />
              <span className="text-[10px]">
                {formatTokenCount(tokenUsage.total)} tokens
              </span>
            </TooltipTrigger>
            <TooltipPopup side="bottom">
              输入: {formatTokenCount(tokenUsage.input)} · 输出: {formatTokenCount(tokenUsage.output)}
            </TooltipPopup>
          </Tooltip>
        )}

        {/* 活跃任务数 */}
        {activeTaskCount > 0 && (
          <Tooltip>
            <TooltipTrigger render={<div className="flex items-center gap-1 text-muted-foreground" />}>
              <PiListChecks className="size-3" />
              <span className="text-[10px]">{activeTaskCount}</span>
            </TooltipTrigger>
            <TooltipPopup side="bottom">{activeTaskCount} 个活跃任务</TooltipPopup>
          </Tooltip>
        )}
      </div>
    </div>
  );
});
