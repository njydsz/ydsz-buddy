/**
 * @file composerProviderRegistry
 * @description 集中管理各服务提供者的编辑器状态和特征选择器渲染逻辑。
 *              通过注册表模式为每个提供者提供统一的状态获取和 UI 渲染接口。
 */

import {
  type ModelSlug,
  type ProviderAgentDescriptor,
  type ProviderKind,
  type ProviderModelDescriptor,
  type ProviderModelOptions,
  type ThreadId,
} from "~/contracts";
import {
  getDefaultContextWindow,
  getDefaultEffort,
  getGeminiThinkingSelectionValue,
  hasContextWindowOption,
  hasEffortLevel,
  isClaudeUltrathinkPrompt,
  normalizeClaudeModelOptions,
  normalizeGeminiModelOptions,
  normalizeGrokModelOptions,
  normalizeOpenCodeModelOptions,
  normalizePiModelOptions,
  resolveLabeledOptionValue,
  trimOrNull,
} from "~/shared/model";
import type { ReactNode } from "react";
import { TraitsMenuContent, TraitsPicker } from "./TraitsPicker";
import { getComposerTraitSelection, hasVisibleComposerTraitControls } from "./composerTraits";
import { getRuntimeAwareModelCapabilities } from "./runtimeModelCapabilities";

/** 编辑器提供者状态输入参数 */
export type ComposerProviderStateInput = {
  /** 服务提供者类型 */
  provider: ProviderKind;
  /** 当前模型标识 */
  model: ModelSlug;
  /** 运行时模型描述符 */
  runtimeModel?: ProviderModelDescriptor | undefined;
  /** 当前提示词文本 */
  prompt: string;
  /** 模型选项配置 */
  modelOptions: ProviderModelOptions | null | undefined;
};

/** 编辑器提供者状态输出 */
export type ComposerProviderState = {
  /** 服务提供者类型 */
  provider: ProviderKind;
  /** 当前推理力度 */
  promptEffort: string | null;
  /** 用于分发的模型选项 */
  modelOptionsForDispatch: ProviderModelOptions[ProviderKind] | undefined;
  /** 编辑器框架的自定义 CSS 类名 */
  composerFrameClassName?: string;
  /** 编辑器表面的自定义 CSS 类名 */
  composerSurfaceClassName?: string;
  /** 模型选择器图标的自定义 CSS 类名 */
  modelPickerIconClassName?: string;
};

/** 提供者特征渲染输入参数 */
type ProviderTraitRenderInput = {
  threadId: ThreadId;
  model: ModelSlug;
  runtimeModel?: ProviderModelDescriptor | undefined;
  runtimeModels?: ReadonlyArray<ProviderModelDescriptor> | null | undefined;
  runtimeAgents?: ReadonlyArray<ProviderAgentDescriptor> | null | undefined;
  modelOptions: ProviderModelOptions[ProviderKind] | undefined;
  prompt: string;
  includeFastMode?: boolean;
  onPromptChange: (prompt: string) => void;
};

/** 提供者特征选择器渲染输入参数（含受控打开状态） */
type ProviderTraitPickerRenderInput = ProviderTraitRenderInput & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcutLabel?: string | null;
};

/** 提供者注册表条目，包含状态获取和 UI 渲染方法 */
type ProviderRegistryEntry = {
  getState: (input: ComposerProviderStateInput) => ComposerProviderState;
  renderTraitsMenuContent: (input: ProviderTraitRenderInput) => ReactNode;
  renderTraitsPicker: (input: ProviderTraitPickerRenderInput) => ReactNode;
};

function renderTraitsMenuContentForProvider(
  provider: ProviderKind,
  input: ProviderTraitRenderInput,
): ReactNode {
  return (
    <TraitsMenuContent
      provider={provider}
      threadId={input.threadId}
      model={input.model}
      runtimeModel={input.runtimeModel}
      runtimeModels={input.runtimeModels}
      runtimeAgents={input.runtimeAgents}
      modelOptions={input.modelOptions}
      prompt={input.prompt}
      {...(input.includeFastMode === undefined ? {} : { includeFastMode: input.includeFastMode })}
      onPromptChange={input.onPromptChange}
    />
  );
}

function renderTraitsPickerForProvider(
  provider: ProviderKind,
  input: ProviderTraitPickerRenderInput,
): ReactNode {
  return (
    <TraitsPicker
      provider={provider}
      threadId={input.threadId}
      model={input.model}
      runtimeModel={input.runtimeModel}
      runtimeModels={input.runtimeModels}
      runtimeAgents={input.runtimeAgents}
      modelOptions={input.modelOptions}
      prompt={input.prompt}
      {...(input.open !== undefined ? { open: input.open } : {})}
      {...(input.onOpenChange ? { onOpenChange: input.onOpenChange } : {})}
      {...(input.shortcutLabel !== undefined ? { shortcutLabel: input.shortcutLabel } : {})}
      {...(input.includeFastMode === undefined ? {} : { includeFastMode: input.includeFastMode })}
      onPromptChange={input.onPromptChange}
    />
  );
}

function getProviderStateFromCapabilities(
  input: ComposerProviderStateInput,
): ComposerProviderState {
  const { provider, model, runtimeModel, prompt, modelOptions } = input;
  const caps = getRuntimeAwareModelCapabilities({ provider, model, runtimeModel });

  let rawEffort: string | null = null;
  let normalizedOptions: ProviderModelOptions[ProviderKind] | undefined;

  switch (provider) {
    case "codex": {
      const providerOptions = modelOptions?.codex;
      rawEffort = trimOrNull(providerOptions?.reasoningEffort);
      const defaultReasoningEffort = getDefaultEffort(caps);
      const reasoningEffort =
        rawEffort && hasEffortLevel(caps, rawEffort) && rawEffort !== defaultReasoningEffort
          ? rawEffort
          : undefined;
      const fastModeEnabled = caps.supportsFastMode && providerOptions?.fastMode === true;
      const nextOptions = {
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(fastModeEnabled ? { fastMode: true } : {}),
      };
      normalizedOptions = Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
      break;
    }
    case "claudeAgent": {
      const providerOptions = modelOptions?.claudeAgent;
      rawEffort = trimOrNull(providerOptions?.effort);
      normalizedOptions = normalizeClaudeModelOptions(model, providerOptions);
      break;
    }
    case "cursor": {
      const providerOptions = modelOptions?.cursor;
      rawEffort = trimOrNull(providerOptions?.reasoningEffort);
      const defaultReasoningEffort = getDefaultEffort(caps);
      const reasoningEffort =
        rawEffort && hasEffortLevel(caps, rawEffort) && rawEffort !== defaultReasoningEffort
          ? rawEffort
          : undefined;
      const rawContextWindow = trimOrNull(providerOptions?.contextWindow);
      const defaultContextWindow = getDefaultContextWindow(caps);
      const contextWindow =
        rawContextWindow &&
        hasContextWindowOption(caps, rawContextWindow) &&
        rawContextWindow !== defaultContextWindow
          ? rawContextWindow
          : undefined;
      const fastModeEnabled = caps.supportsFastMode && providerOptions?.fastMode === true;
      const thinking =
        caps.supportsThinkingToggle && providerOptions?.thinking !== undefined
          ? providerOptions.thinking
          : undefined;
      const nextOptions = {
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(fastModeEnabled ? { fastMode: true } : {}),
        ...(thinking !== undefined ? { thinking } : {}),
        ...(contextWindow ? { contextWindow } : {}),
      };
      normalizedOptions = Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
      break;
    }
    case "gemini": {
      const providerOptions = modelOptions?.gemini;
      rawEffort = getGeminiThinkingSelectionValue(caps, providerOptions);
      normalizedOptions = normalizeGeminiModelOptions(model, providerOptions);
      break;
    }
    case "grok": {
      const providerOptions = modelOptions?.grok;
      rawEffort = trimOrNull(providerOptions?.reasoningEffort);
      normalizedOptions = normalizeGrokModelOptions(model, providerOptions);
      break;
    }
    case "kilo":
    case "opencode": {
      const providerOptions = provider === "kilo" ? modelOptions?.kilo : modelOptions?.opencode;
      rawEffort = trimOrNull(providerOptions?.variant);
      const variantOptions = caps.variantOptions ?? [];
      const reasoningVariant =
        rawEffort && variantOptions.some((option) => option.value === rawEffort)
          ? rawEffort
          : undefined;
      const agent = trimOrNull(providerOptions?.agent);
      if (variantOptions.length > 0) {
        const nextOptions = {
          ...(reasoningVariant ? { variant: reasoningVariant } : {}),
          ...(agent ? { agent } : {}),
        };
        normalizedOptions = Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
        break;
      }
      normalizedOptions = normalizeOpenCodeModelOptions(providerOptions);
      break;
    }
    case "pi": {
      const providerOptions = modelOptions?.pi;
      rawEffort = trimOrNull(providerOptions?.thinkingLevel);
      normalizedOptions = normalizePiModelOptions(providerOptions);
      break;
    }
  }

  const draftEffort = trimOrNull(rawEffort);
  const defaultEffort = getDefaultEffort(caps);
  const isPromptInjected = draftEffort
    ? caps.promptInjectedEffortLevels.includes(draftEffort)
    : false;
  const promptEffort =
    provider === "kilo" || provider === "opencode"
      ? resolveLabeledOptionValue(caps.variantOptions, draftEffort)
      : draftEffort && !isPromptInjected && hasEffortLevel(caps, draftEffort)
        ? draftEffort
        : defaultEffort && hasEffortLevel(caps, defaultEffort)
          ? defaultEffort
          : null;

  const ultrathinkActive =
    caps.promptInjectedEffortLevels.length > 0 && isClaudeUltrathinkPrompt(prompt);

  return {
    provider,
    promptEffort,
    modelOptionsForDispatch: normalizedOptions,
    ...(ultrathinkActive ? { composerFrameClassName: "ultrathink-frame" } : {}),
    ...(ultrathinkActive
      ? { composerSurfaceClassName: "shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]" }
      : {}),
    ...(ultrathinkActive ? { modelPickerIconClassName: "ultrathink-chroma" } : {}),
  };
}

const composerProviderRegistry: Record<ProviderKind, ProviderRegistryEntry> = {
  codex: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("codex", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("codex", input),
  },
  claudeAgent: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("claudeAgent", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("claudeAgent", input),
  },
  cursor: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("cursor", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("cursor", input),
  },
  gemini: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("gemini", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("gemini", input),
  },
  grok: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("grok", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("grok", input),
  },
  kilo: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("kilo", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("kilo", input),
  },
  opencode: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("opencode", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("opencode", input),
  },
  pi: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("pi", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("pi", input),
  },
};

/**
 * 获取编辑器提供者状态。
 * 根据服务提供者类型解析模型能力、推理力度和模型选项等状态。
 *
 * @param input - 提供者状态输入参数
 * @returns 提供者状态
 */
export function getComposerProviderState(input: ComposerProviderStateInput): ComposerProviderState {
  return composerProviderRegistry[input.provider].getState(input);
}

/**
 * 渲染提供者特征菜单内容。
 * 当模型无可见特征控件时返回 null。
 *
 * @param input - 渲染输入参数
 * @returns 菜单内容 React 节点
 */
export function renderProviderTraitsMenuContent(input: {
  provider: ProviderKind;
  threadId: ThreadId;
  model: ModelSlug;
  runtimeModel?: ProviderModelDescriptor | undefined;
  runtimeModels?: ReadonlyArray<ProviderModelDescriptor> | null | undefined;
  runtimeAgents?: ReadonlyArray<ProviderAgentDescriptor> | null | undefined;
  modelOptions: ProviderModelOptions[ProviderKind] | undefined;
  prompt: string;
  includeFastMode?: boolean;
  onPromptChange: (prompt: string) => void;
}): ReactNode {
  const selection = getComposerTraitSelection(
    input.provider,
    input.model,
    input.prompt,
    input.modelOptions,
    input.runtimeModel,
  );
  if (
    !hasVisibleComposerTraitControls(
      selection,
      input.includeFastMode === undefined ? undefined : { includeFastMode: input.includeFastMode },
    ) &&
    ((input.provider !== "kilo" && input.provider !== "opencode") ||
      (input.runtimeAgents?.length ?? 0) === 0)
  ) {
    return null;
  }
  return composerProviderRegistry[input.provider].renderTraitsMenuContent(input);
}

/**
 * 渲染提供者特征选择器。
 * 当模型无可见特征控件时返回 null。
 *
 * @param input - 渲染输入参数（含受控打开状态）
 * @returns 选择器 React 节点
 */
export function renderProviderTraitsPicker(input: {
  provider: ProviderKind;
  threadId: ThreadId;
  model: ModelSlug;
  runtimeModel?: ProviderModelDescriptor | undefined;
  runtimeModels?: ReadonlyArray<ProviderModelDescriptor> | null | undefined;
  runtimeAgents?: ReadonlyArray<ProviderAgentDescriptor> | null | undefined;
  modelOptions: ProviderModelOptions[ProviderKind] | undefined;
  prompt: string;
  includeFastMode?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcutLabel?: string | null;
  onPromptChange: (prompt: string) => void;
}): ReactNode {
  const selection = getComposerTraitSelection(
    input.provider,
    input.model,
    input.prompt,
    input.modelOptions,
    input.runtimeModel,
  );
  if (
    !hasVisibleComposerTraitControls(
      selection,
      input.includeFastMode === undefined ? undefined : { includeFastMode: input.includeFastMode },
    ) &&
    ((input.provider !== "kilo" && input.provider !== "opencode") ||
      (input.runtimeAgents?.length ?? 0) === 0)
  ) {
    return null;
  }
  return composerProviderRegistry[input.provider].renderTraitsPicker(input);
}
