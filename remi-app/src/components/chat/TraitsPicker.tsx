/**
 * @file TraitsPicker
 * @description 编辑器特征控件菜单，包括推理力度（Effort）、思考模式（Thinking）、
 *              快速模式（Fast Mode）、上下文窗口和智能体选择等功能。
 *              依赖共享的特征解析辅助函数、服务提供者模型选项更新和菜单 UI 原语。
 */

import {
  type OpenCodeModelOptions,
  type ProviderAgentDescriptor,
  type ProviderKind,
  type ProviderModelDescriptor,
  type ThreadId,
} from "~/contracts";
import { applyClaudePromptEffortPrefix } from "~/shared/model";
import { memo, useCallback, useState } from "react";
import { IoFlash } from "react-icons/io5";
import { ChevronDownIcon } from "~/lib/icons";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuTrigger,
} from "../ui/menu";
import { useComposerDraftStore } from "../../composerDraftStore";
import {
  buildNextProviderOptions,
  buildProviderOptionPatch,
  type ProviderOptions,
} from "../../providerModelOptions";
import { COMPOSER_PICKER_TRIGGER_TEXT_CLASS_NAME } from "./composerPickerStyles";
import { getComposerTraitSelection, hasVisibleComposerTraitControls } from "./composerTraits";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ShortcutKbd } from "../ui/shortcut-kbd";

/** Ultrathink 提示词前缀，用于通过 prompt 控制推理力度 */
const ULTRATHINK_PROMPT_PREFIX = "Ultrathink:\n";

/**
 * 获取指定服务提供者的默认智能体名称。
 *
 * @param provider - 服务提供者类型
 * @returns 默认智能体名称，若无则返回 null
 */
function defaultAgentForProvider(provider: ProviderKind): string | null {
  if (provider === "kilo") return "code";
  if (provider === "opencode") return "build";
  return null;
}

/**
 * 获取指定服务提供者的智能体选项列表。
 * 仅 kilo 和 opencode 提供者支持智能体选择。
 *
 * @param provider - 服务提供者类型
 * @param runtimeAgents - 运行时发现的智能体描述符列表
 * @returns 智能体选项列表
 */
function getAgentOptions(
  provider: ProviderKind,
  runtimeAgents: ReadonlyArray<ProviderAgentDescriptor> | null | undefined,
): ReadonlyArray<ProviderAgentDescriptor> {
  if (provider !== "kilo" && provider !== "opencode") return [];
  return runtimeAgents ?? [];
}

/**
 * 获取当前选中的智能体值。
 * 优先使用模型选项中配置的智能体，否则使用提供者默认智能体。
 *
 * @param provider - 服务提供者类型
 * @param modelOptions - 当前模型选项
 * @returns 选中的智能体名称，若无则返回 null
 */
function getSelectedAgentValue(
  provider: ProviderKind,
  modelOptions: ProviderOptions | null | undefined,
): string | null {
  const defaultAgent = defaultAgentForProvider(provider);
  if (!defaultAgent) return null;
  const selectedAgent = (modelOptions as OpenCodeModelOptions | undefined)?.agent?.trim();
  return selectedAgent && selectedAgent.length > 0 ? selectedAgent : defaultAgent;
}

/**
 * 在智能体列表中查找指定值的显示标签。
 *
 * @param agents - 智能体描述符列表
 * @param value - 待查找的智能体名称
 * @returns 显示标签，未找到则返回原始值或 null
 */
function findAgentLabel(
  agents: ReadonlyArray<ProviderAgentDescriptor>,
  value: string | null,
): string | null {
  if (!value) return null;
  const agent = agents.find((candidate) => candidate.name === value);
  return agent?.displayName ?? value;
}

/** 特征菜单内容组件的属性接口 */
export interface TraitsMenuContentProps {
  /** 当前服务提供者类型 */
  provider: ProviderKind;
  /** 当前线程 ID */
  threadId: ThreadId;
  /** 当前选中的模型标识 */
  model: string | null | undefined;
  /** 运行时发现的模型描述符 */
  runtimeModel?: ProviderModelDescriptor | undefined;
  /** 运行时发现的模型描述符列表 */
  runtimeModels?: ReadonlyArray<ProviderModelDescriptor> | null | undefined;
  /** 运行时发现的智能体描述符列表 */
  runtimeAgents?: ReadonlyArray<ProviderAgentDescriptor> | null | undefined;
  /** 当前编辑器提示词文本 */
  prompt: string;
  /** 提示词变更回调 */
  onPromptChange: (prompt: string) => void;
  /** 是否包含快速模式控件 */
  includeFastMode?: boolean;
  /** 当前模型选项 */
  modelOptions?: ProviderOptions | null | undefined;
  /** 选择完成后的回调 */
  onSelectionComplete?: () => void;
}

/**
 * 特征菜单内容组件。
 * 渲染推理力度、思考模式、快速模式、上下文窗口和智能体选择的菜单项，
 * 根据模型能力动态显示可用控件。
 */
export const TraitsMenuContent = memo(function TraitsMenuContentImpl({
  provider,
  threadId,
  model,
  runtimeModel,
  runtimeAgents,
  prompt,
  onPromptChange,
  includeFastMode = true,
  modelOptions,
  onSelectionComplete,
}: TraitsMenuContentProps) {
  const setProviderModelOptions = useComposerDraftStore((store) => store.setProviderModelOptions);
  const {
    caps,
    defaultEffort,
    effort,
    effortLevels,
    thinkingEnabled,
    fastModeEnabled,
    contextWindowOptions,
    contextWindow,
    defaultContextWindow,
    ultrathinkPromptControlled,
    primarySelectDescriptor,
    fastModeDescriptor,
    promptInjectedValues,
  } = getComposerTraitSelection(provider, model, prompt, modelOptions, runtimeModel);
  const hasVisibleControls = hasVisibleComposerTraitControls(
    { caps, effortLevels, thinkingEnabled, contextWindowOptions, fastModeDescriptor },
    { includeFastMode },
  );
  const supportsFastModeControl = fastModeDescriptor !== null || caps.supportsFastMode;
  const agentOptions = getAgentOptions(provider, runtimeAgents);
  const defaultAgent = defaultAgentForProvider(provider);
  const selectedAgent = getSelectedAgentValue(provider, modelOptions);
  const hasAgentControls = agentOptions.length > 0 && defaultAgent !== null;
  const hasPriorFastModeSection =
    effortLevels.length > 0 || thinkingEnabled !== null || contextWindowOptions.length > 1;

  const handleEffortChange = useCallback(
    (value: string) => {
      if (ultrathinkPromptControlled) return;
      if (!value) return;
      const nextOption = effortLevels.find((option) => option.value === value);
      if (!nextOption) return;
      if (promptInjectedValues.includes(nextOption.value)) {
        const nextPrompt =
          prompt.trim().length === 0
            ? ULTRATHINK_PROMPT_PREFIX
            : applyClaudePromptEffortPrefix(prompt, "ultrathink");
        onPromptChange(nextPrompt);
        onSelectionComplete?.();
        return;
      }
      const optionId =
        primarySelectDescriptor?.id ??
        (provider === "kilo" || provider === "opencode"
          ? "variant"
          : provider === "pi"
            ? "thinkingLevel"
            : provider === "claudeAgent"
              ? "effort"
              : provider === "gemini"
                ? "thinkingLevel"
                : "reasoningEffort");
      const nextModelOptionsPatch = buildProviderOptionPatch(provider, optionId, nextOption.value);
      setProviderModelOptions(
        threadId,
        provider,
        buildNextProviderOptions(provider, modelOptions, nextModelOptionsPatch),
        { ...(model !== undefined ? { model } : {}), persistSticky: true },
      );
      onSelectionComplete?.();
    },
    [
      ultrathinkPromptControlled,
      modelOptions,
      onPromptChange,
      onSelectionComplete,
      threadId,
      setProviderModelOptions,
      effortLevels,
      prompt,
      promptInjectedValues,
      model,
      provider,
      primarySelectDescriptor?.id,
    ],
  );

  if (!hasVisibleControls && !hasAgentControls) {
    return null;
  }

  return (
    <>
      {effortLevels.length > 0 ? (
        <>
          <MenuGroup>
            <div className="px-2 pt-1.5 pb-1 font-medium text-muted-foreground text-xs">
              {provider === "kilo" || provider === "opencode" ? "Variant" : "Effort"}
            </div>
            {ultrathinkPromptControlled ? (
              <div className="px-2 pb-1.5 text-muted-foreground/80 text-xs">
                Remove Ultrathink from the prompt to change effort.
              </div>
            ) : null}
            <MenuRadioGroup value={effort ?? ""} onValueChange={handleEffortChange}>
              {effortLevels.map((option) => {
                const item = (
                  <MenuRadioItem
                    key={option.value}
                    value={option.value}
                    disabled={ultrathinkPromptControlled}
                    onClick={() => onSelectionComplete?.()}
                  >
                    {option.label}
                    {option.value === defaultEffort ? " (default)" : ""}
                  </MenuRadioItem>
                );
                return option.description ? (
                  <Tooltip key={option.value}>
                    <TooltipTrigger render={item} />
                    <TooltipPopup side="right" className="max-w-80 whitespace-normal leading-tight">
                      {option.description}
                    </TooltipPopup>
                  </Tooltip>
                ) : (
                  item
                );
              })}
            </MenuRadioGroup>
          </MenuGroup>
        </>
      ) : thinkingEnabled !== null ? (
        <MenuGroup>
          <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Thinking</div>
          <MenuRadioGroup
            value={thinkingEnabled ? "on" : "off"}
            onValueChange={(value) => {
              setProviderModelOptions(
                threadId,
                provider,
                buildNextProviderOptions(provider, modelOptions, { thinking: value === "on" }),
                { ...(model !== undefined ? { model } : {}), persistSticky: true },
              );
              onSelectionComplete?.();
            }}
          >
            <MenuRadioItem value="on" onClick={() => onSelectionComplete?.()}>
              On (default)
            </MenuRadioItem>
            <MenuRadioItem value="off" onClick={() => onSelectionComplete?.()}>
              Off
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      ) : null}
      {includeFastMode && supportsFastModeControl ? (
        <>
          {hasPriorFastModeSection ? <MenuDivider /> : null}
          <MenuGroup>
            <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Fast Mode</div>
            <MenuRadioGroup
              value={fastModeEnabled ? "on" : "off"}
              onValueChange={(value) => {
                setProviderModelOptions(
                  threadId,
                  provider,
                  buildNextProviderOptions(provider, modelOptions, { fastMode: value === "on" }),
                  { ...(model !== undefined ? { model } : {}), persistSticky: true },
                );
                onSelectionComplete?.();
              }}
            >
              <MenuRadioItem value="off" onClick={() => onSelectionComplete?.()}>
                Default
              </MenuRadioItem>
              <MenuRadioItem value="on" onClick={() => onSelectionComplete?.()}>
                Fast
              </MenuRadioItem>
            </MenuRadioGroup>
          </MenuGroup>
        </>
      ) : null}
      {contextWindowOptions.length > 1 ? (
        <>
          <MenuDivider />
          <MenuGroup>
            <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
              Context Window
            </div>
            <MenuRadioGroup
              value={contextWindow ?? defaultContextWindow ?? ""}
              onValueChange={(value) => {
                setProviderModelOptions(
                  threadId,
                  provider,
                  buildNextProviderOptions(provider, modelOptions, { contextWindow: value }),
                  { ...(model !== undefined ? { model } : {}), persistSticky: true },
                );
                onSelectionComplete?.();
              }}
            >
              {contextWindowOptions.map((option) => (
                <MenuRadioItem
                  key={option.value}
                  value={option.value}
                  onClick={() => onSelectionComplete?.()}
                >
                  {option.label}
                  {option.value === defaultContextWindow ? " (default)" : ""}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        </>
      ) : null}
      {hasAgentControls ? (
        <>
          {hasVisibleControls ? <MenuDivider /> : null}
          <MenuGroup>
            <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
              {provider === "kilo" ? "Mode" : "Agent"}
            </div>
            <MenuRadioGroup
              value={selectedAgent ?? defaultAgent ?? ""}
              onValueChange={(value) => {
                if (!value || !defaultAgent) return;
                setProviderModelOptions(
                  threadId,
                  provider,
                  buildNextProviderOptions(provider, modelOptions, {
                    agent: value === defaultAgent ? undefined : value,
                  }),
                  { ...(model !== undefined ? { model } : {}), persistSticky: true },
                );
                onSelectionComplete?.();
              }}
            >
              {agentOptions.map((agent) => {
                const item = (
                  <MenuRadioItem
                    key={agent.name}
                    value={agent.name}
                    onClick={() => onSelectionComplete?.()}
                  >
                    {agent.displayName}
                    {agent.name === defaultAgent ? " (default)" : ""}
                  </MenuRadioItem>
                );
                return agent.description ? (
                  <Tooltip key={agent.name}>
                    <TooltipTrigger render={item} />
                    <TooltipPopup side="right" className="max-w-80 whitespace-normal leading-tight">
                      {agent.description}
                    </TooltipPopup>
                  </Tooltip>
                ) : (
                  item
                );
              })}
            </MenuRadioGroup>
          </MenuGroup>
        </>
      ) : null}
    </>
  );
});

/**
 * 特征选择器组件。
 * 以菜单按钮形式展示当前特征状态，点击后展开特征菜单进行配置。
 * 支持受控和非受控两种打开模式，并可选显示快捷键提示。
 *
 * @param props.provider - 服务提供者类型
 * @param props.threadId - 线程 ID
 * @param props.model - 当前模型标识
 * @param props.runtimeModel - 运行时模型描述符
 * @param props.runtimeAgents - 运行时智能体列表
 * @param props.prompt - 当前提示词
 * @param props.onPromptChange - 提示词变更回调
 * @param props.includeFastMode - 是否包含快速模式
 * @param props.modelOptions - 模型选项
 * @param props.open - 受控的菜单打开状态
 * @param props.onOpenChange - 菜单打开状态变更回调
 * @param props.shortcutLabel - 快捷键标签
 */
export const TraitsPicker = memo(function TraitsPicker({
  provider,
  threadId,
  model,
  runtimeModel,
  runtimeAgents,
  prompt,
  onPromptChange,
  includeFastMode = true,
  modelOptions,
  open,
  onOpenChange,
  shortcutLabel,
}: TraitsMenuContentProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcutLabel?: string | null;
}) {
  const [uncontrolledMenuOpen, setUncontrolledMenuOpen] = useState(false);
  const isMenuOpen = open ?? uncontrolledMenuOpen;
  const setMenuOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setUncontrolledMenuOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );
  const {
    caps,
    effort,
    effortLevels,
    thinkingEnabled,
    fastModeEnabled,
    contextWindowOptions,
    contextWindow,
    defaultContextWindow,
    ultrathinkPromptControlled,
    fastModeDescriptor,
  } = getComposerTraitSelection(provider, model, prompt, modelOptions, runtimeModel);
  const hasVisibleControls = hasVisibleComposerTraitControls(
    { caps, effortLevels, thinkingEnabled, contextWindowOptions, fastModeDescriptor },
    { includeFastMode },
  );
  const supportsFastModeControl = fastModeDescriptor !== null || caps.supportsFastMode;
  const agentOptions = getAgentOptions(provider, runtimeAgents);
  const defaultAgent = defaultAgentForProvider(provider);
  const selectedAgent = getSelectedAgentValue(provider, modelOptions);
  const hasAgentControls = agentOptions.length > 0 && defaultAgent !== null;

  if (!hasVisibleControls && !hasAgentControls) {
    return null;
  }

  const effortLabel = effort
    ? (effortLevels.find((l) => l.value === effort)?.label ?? effort)
    : null;
  const contextWindowLabel =
    contextWindowOptions.length > 1 && contextWindow !== defaultContextWindow
      ? (contextWindowOptions.find((option) => option.value === contextWindow)?.label ?? null)
      : null;
  const isFastOnlyControl =
    supportsFastModeControl &&
    effortLevels.length === 0 &&
    thinkingEnabled === null &&
    contextWindowOptions.length <= 1;
  const primaryTriggerLabel = ultrathinkPromptControlled
    ? "Ultrathink"
    : effortLabel
      ? effortLabel
      : thinkingEnabled !== null
        ? `Thinking ${thinkingEnabled ? "On" : "Off"}`
        : isFastOnlyControl
          ? fastModeEnabled
            ? "Fast"
            : "Default"
          : null;
  const agentLabel = findAgentLabel(agentOptions, selectedAgent);
  const visiblePrimaryTriggerLabel = primaryTriggerLabel ?? agentLabel;
  const showsFastBadge = supportsFastModeControl && fastModeEnabled && !isFastOnlyControl;

  const isCodexStyle = provider === "codex";

  const triggerButton = (
    <Button
      size="sm"
      variant="chrome"
      className={
        isCodexStyle
          ? `min-w-0 max-w-40 shrink justify-start overflow-hidden whitespace-nowrap px-2 sm:max-w-48 sm:px-3 [&_svg]:mx-0 ${COMPOSER_PICKER_TRIGGER_TEXT_CLASS_NAME}`
          : `shrink-0 whitespace-nowrap px-2 sm:px-3 ${COMPOSER_PICKER_TRIGGER_TEXT_CLASS_NAME}`
      }
    />
  );

  const triggerContent = isCodexStyle ? (
    <span className="flex min-w-0 w-full items-center gap-2 overflow-hidden">
      <span className="min-w-0 flex flex-1 items-center gap-1.5 truncate">
        {visiblePrimaryTriggerLabel ? (
          <span className="truncate">{visiblePrimaryTriggerLabel}</span>
        ) : null}
        {showsFastBadge ? (
          <>
            {visiblePrimaryTriggerLabel ? (
              <span className="shrink-0 text-muted-foreground/45">·</span>
            ) : null}
            <span className="inline-flex shrink-0 items-center gap-1">
              <IoFlash aria-hidden="true" className="size-3 text-[hsl(var(--chart-4))]" />
              <span>Fast</span>
            </span>
          </>
        ) : null}
        {contextWindowLabel ? (
          <>
            {visiblePrimaryTriggerLabel || showsFastBadge ? (
              <span className="shrink-0 text-muted-foreground/45">·</span>
            ) : null}
            <span className="shrink-0">{contextWindowLabel}</span>
          </>
        ) : null}
      </span>
      <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
    </span>
  ) : (
    <>
      <span className="inline-flex items-center gap-1.5">
        {visiblePrimaryTriggerLabel ? <span>{visiblePrimaryTriggerLabel}</span> : null}
        {showsFastBadge ? (
          <>
            {visiblePrimaryTriggerLabel ? (
              <span className="text-muted-foreground/45">·</span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <IoFlash aria-hidden="true" className="size-3 text-[hsl(var(--chart-4))]" />
              <span>Fast</span>
            </span>
          </>
        ) : null}
        {contextWindowLabel ? (
          <>
            {visiblePrimaryTriggerLabel || showsFastBadge ? (
              <span className="text-muted-foreground/45">·</span>
            ) : null}
            <span>{contextWindowLabel}</span>
          </>
        ) : null}
      </span>
      <ChevronDownIcon aria-hidden="true" className="size-3 opacity-60" />
    </>
  );

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
      }}
    >
      {shortcutLabel ? (
        <Tooltip>
          <TooltipTrigger render={<MenuTrigger render={triggerButton} />}>
            {triggerContent}
          </TooltipTrigger>
          {!isMenuOpen ? (
            <TooltipPopup side="top" sideOffset={6}>
              <span className="inline-flex items-center gap-2 px-1 py-0.5">
                <span>Change reasoning</span>
                <ShortcutKbd
                  shortcutLabel={shortcutLabel}
                  className="h-4 min-w-4 px-1 text-[length:var(--app-font-size-ui-2xs,9px)] text-muted-foreground"
                />
              </span>
            </TooltipPopup>
          ) : null}
        </Tooltip>
      ) : (
        <MenuTrigger render={triggerButton}>{triggerContent}</MenuTrigger>
      )}
      <MenuPopup align="start">
        <TraitsMenuContent
          provider={provider}
          threadId={threadId}
          model={model}
          runtimeModel={runtimeModel}
          runtimeAgents={runtimeAgents}
          prompt={prompt}
          onPromptChange={onPromptChange}
          includeFastMode={includeFastMode}
          modelOptions={modelOptions}
          onSelectionComplete={() => setMenuOpen(false)}
        />
      </MenuPopup>
    </Menu>
  );
});
