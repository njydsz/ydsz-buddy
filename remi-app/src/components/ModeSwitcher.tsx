// FILE: ModeSwitcher.tsx
// Purpose: Renders a combined mode badge + dropdown switcher for the current
//          thread's RuntimeMode (work/code) and InteractionMode
//          (chat/plan/agent/review/task). Used in the chat header.
// Exports: ModeSwitcher, getModeBadgeLabel, getModeBadgeTooltip

import { useCallback, useMemo } from "react";
import { TbChevronDown } from "react-icons/tb";
import {
  BotIcon,
  CheckIcon,
  FlagIcon,
  ListChecksIcon,
  MessageCircleIcon,
  RocketIcon,
  SparklesIcon,
  TerminalIcon,
} from "~/lib/icons";
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
import type { ProviderInteractionMode, RuntimeMode } from "~/contracts";

const RUNTIME_MODES: ReadonlyArray<{ value: RuntimeMode; label: string; description: string }> = [
  {
    value: "code",
    label: "Code",
    description: "Provider · terminal · git（默认）",
  },
  {
    value: "work",
    label: "Work",
    description: "Office · 批量 · 调度 · 浏览器自动化",
  },
];

const INTERACTION_MODES: ReadonlyArray<{
  value: ProviderInteractionMode;
  label: string;
  description: string;
}> = [
  { value: "agent", label: "Agent", description: "自主执行（默认）" },
  { value: "chat", label: "Chat", description: "纯对话，不执行副作用" },
  { value: "plan", label: "Plan", description: "先输出可审批的执行计划" },
  { value: "review", label: "Review", description: "针对 diff 的代码审查" },
  { value: "task", label: "Task", description: "Work 域的一次性任务" },
];

/**
 * 根据 RuntimeMode + InteractionMode 拼出徽标短文本，例如 "Code · Agent"。
 * 未知值兜底为 "Code · Agent"。
 */
export function getModeBadgeLabel(
  runtimeMode: RuntimeMode | string | null | undefined,
  interactionMode: ProviderInteractionMode | string | null | undefined,
): string {
  const r =
    runtimeMode === "work" || runtimeMode === "code"
      ? runtimeMode
      : "code";
  const i = INTERACTION_MODES.some((m) => m.value === interactionMode)
    ? (interactionMode as ProviderInteractionMode)
    : "agent";
  const rLabel = RUNTIME_MODES.find((m) => m.value === r)?.label ?? "Code";
  const iLabel = INTERACTION_MODES.find((m) => m.value === i)?.label ?? "Agent";
  return `${rLabel} · ${iLabel}`;
}

/**
 * 徽标悬浮提示，列出当前两个维度的可读说明。
 */
export function getModeBadgeTooltip(
  runtimeMode: RuntimeMode | string | null | undefined,
  interactionMode: ProviderInteractionMode | string | null | undefined,
): string {
  const r = RUNTIME_MODES.find((m) => m.value === runtimeMode);
  const i = INTERACTION_MODES.find((m) => m.value === interactionMode);
  const lines: string[] = [];
  lines.push(`Runtime: ${r?.label ?? runtimeMode ?? "code"} — ${r?.description ?? ""}`);
  lines.push(`Interaction: ${i?.label ?? interactionMode ?? "agent"} — ${i?.description ?? ""}`);
  return lines.join("\n");
}

interface ModeSwitcherProps {
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  disabled?: boolean;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onInteractionModeChange: (mode: ProviderInteractionMode) => void;
  className?: string;
  /**
   * 是否在徽标中显示 tooltip。默认开启，单元测试可关闭。
   */
  showTooltip?: boolean;
}

/**
 * 模式徽标 + 切换器，点击徽标打开下拉菜单。
 * Work/Code 维度使用 RadioGroup；5 种 InteractionMode 同样使用 RadioGroup，
 * 并按维度用 MenuGroup 分组。
 */
export function ModeSwitcher({
  runtimeMode,
  interactionMode,
  disabled = false,
  onRuntimeModeChange,
  onInteractionModeChange,
  className,
  showTooltip = true,
}: ModeSwitcherProps) {
  const label = useMemo(
    () => getModeBadgeLabel(runtimeMode, interactionMode),
    [runtimeMode, interactionMode],
  );
  const tooltipText = useMemo(
    () => getModeBadgeTooltip(runtimeMode, interactionMode),
    [runtimeMode, interactionMode],
  );

  const handleRuntimeChange = useCallback(
    (value: string) => {
      if (value === "work" || value === "code") {
        onRuntimeModeChange(value);
      }
    },
    [onRuntimeModeChange],
  );
  const handleInteractionChange = useCallback(
    (value: string) => {
      const allowed = INTERACTION_MODES.find((m) => m.value === value);
      if (allowed) {
        onInteractionModeChange(allowed.value);
      }
    },
    [onInteractionModeChange],
  );

  const trigger = (
    <Badge
      variant="outline"
      className={cn(
        "h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[10px] font-normal",
        "border-(--color-border) bg-transparent text-foreground/85",
        "hover:bg-(--sidebar-accent) hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
      data-mode-switcher-trigger
      data-runtime-mode={runtimeMode}
      data-interaction-mode={interactionMode}
    >
      <RuntimeModeGlyph runtimeMode={runtimeMode} className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
      <TbChevronDown className="size-2.5 shrink-0 opacity-65" />
    </Badge>
  );

  const menu = (
    <MenuPopup align="end" side="bottom" className="w-64 p-1.5">
      <MenuGroup>
        <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Runtime
        </div>
        <MenuRadioGroup value={runtimeMode} onValueChange={handleRuntimeChange}>
          {RUNTIME_MODES.map((mode) => (
            <MenuRadioItem key={mode.value} value={mode.value}>
              <RuntimeModeGlyph runtimeMode={mode.value} className="size-3.5 shrink-0" />
              <span className="flex flex-col">
                <span className="text-xs">{mode.label}</span>
                <span className="text-[10px] text-muted-foreground/75">{mode.description}</span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuGroup>
      <MenuSeparator className="mx-1 my-1" />
      <MenuGroup>
        <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Interaction
        </div>
        <MenuRadioGroup value={interactionMode} onValueChange={handleInteractionChange}>
          {INTERACTION_MODES.map((mode) => (
            <MenuRadioItem key={mode.value} value={mode.value}>
              <InteractionModeGlyph interactionMode={mode.value} className="size-3.5 shrink-0" />
              <span className="flex flex-col">
                <span className="text-xs">{mode.label}</span>
                <span className="text-[10px] text-muted-foreground/75">{mode.description}</span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuGroup>
    </MenuPopup>
  );

  if (disabled) {
    return showTooltip ? (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex">{trigger}</span>} />
        <TooltipPopup side="bottom">{tooltipText}</TooltipPopup>
      </Tooltip>
    ) : (
      trigger
    );
  }

  return (
    <Menu modal={false}>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-6 rounded-md p-0 hover:bg-transparent"
                  aria-label={`Mode: ${label}. Click to change mode.`}
                />
              }
            >
              {trigger}
            </MenuTrigger>
          }
        />
        <TooltipPopup side="bottom">{tooltipText}</TooltipPopup>
      </Tooltip>
      {menu}
    </Menu>
  );
}

function RuntimeModeGlyph({
  runtimeMode,
  className,
}: {
  runtimeMode: RuntimeMode | string;
  className?: string;
}) {
  if (runtimeMode === "work") {
    return <RocketIcon className={className} />;
  }
  return <TerminalIcon className={className} />;
}

function InteractionModeGlyph({
  interactionMode,
  className,
}: {
  interactionMode: ProviderInteractionMode | string;
  className?: string;
}) {
  switch (interactionMode) {
    case "agent":
      return <BotIcon className={className} />;
    case "chat":
      return <MessageCircleIcon className={className} />;
    case "plan":
      return <FlagIcon className={className} />;
    case "review":
      return <CheckIcon className={className} />;
    case "task":
      return <ListChecksIcon className={className} />;
    default:
      return <SparklesIcon className={className} />;
  }
}
