/**
 * @file Cursor 模型变体处理
 *
 * 处理 Cursor Provider 的模型变体归并逻辑。Cursor CLI 会为同一基础模型
 * 生成多个变体（如不同推理强度、fast 模式、thinking 模式等），
 * 本模块将这些变体归并为统一的模型条目，合并推理强度选项、上下文窗口选项等。
 */

import type { ProviderModelDescriptor } from "@remi-code/contracts";

/**
 * 根据 value 字段去重，保留首次出现的元素。
 *
 * @param values - 待去重的数组
 * @returns 去重后的数组
 */
function uniqueByValue<T extends { readonly value: string }>(values: ReadonlyArray<T>): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value.value)) {
      continue;
    }
    seen.add(value.value);
    result.push(value);
  }
  return result;
}

/**
 * 将推理强度值转换为可读标签。
 *
 * @param value - 推理强度原始值（如 "xhigh"、"max"、"low"）
 * @returns 格式化后的标签
 */
function cursorReasoningLabel(value: string): string {
  switch (value) {
    case "xhigh":
      return "Extra High";
    case "max":
      return "Max";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

/**
 * 从 Cursor CLI 模型名称中解析推理强度（reasoning effort）后缀。
 * 从模型名称末尾向前扫描，识别 "max"、"none"、"low"、"medium"、"high"、"xhigh" 等标记。
 * "extra-high" 会被归一化为 "xhigh"。
 *
 * @param model - Cursor CLI 模型名称
 * @returns 推理强度值，未找到返回 undefined
 */
function parseCursorCliReasoningEffort(model: string): string | undefined {
  const tokens = model.trim().toLowerCase().split("-");
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (token === "xhigh") {
      return "xhigh";
    }
    if (token === "high" && tokens[index - 1] === "extra") {
      return "xhigh";
    }
    if (
      token === "max" ||
      token === "none" ||
      token === "low" ||
      token === "medium" ||
      token === "high"
    ) {
      return token;
    }
  }
  return undefined;
}

/**
 * 去除 Cursor 模型名称中的参数化后缀（方括号内容）。
 * 例如 "claude-3.5-sonnet[thinking]" → "claude-3.5-sonnet"
 *
 * @param value - 原始模型名称
 * @returns 去除参数化后缀的名称
 */
function stripCursorParameterizedSuffix(value: string): string {
  return value.trim().replace(/\[[^\]]*\]$/u, "");
}

/**
 * 将 Cursor 模型变体的 slug 标准化为基础模型 ID。
 * 依次去除：参数化后缀、-fast 后缀、推理强度后缀、-thinking 后缀、
 * 重复的 -fast 和推理强度后缀、-max 后缀（codex-max 除外），
 * 并对 Claude 模型名称进行版本号和家族名的重排序。
 *
 * @param model - 模型 slug
 * @returns 基础模型 ID，输入为空时返回 null
 *
 * @example
 * ```ts
 * normalizeCursorModelVariantBaseId("claude-3.5-sonnet-high") // "claude-sonnet-3-5"
 * normalizeCursorModelVariantBaseId("gpt-4o-fast")            // "gpt-4o"
 * ```
 */
export function normalizeCursorModelVariantBaseId(model: string | null | undefined): string | null {
  const trimmed = model?.trim();
  if (!trimmed) {
    return null;
  }
  let base = stripCursorParameterizedSuffix(trimmed)
    .replace(/-fast$/u, "")
    .replace(/-(?:extra-high|none|low|medium|high|xhigh)$/u, "")
    .replace(/-thinking$/u, "")
    .replace(/-fast$/u, "")
    .replace(/-(?:extra-high|none|low|medium|high|xhigh)$/u, "");

  if (base.endsWith("-max") && !base.includes("codex-max")) {
    base = base.slice(0, -"-max".length);
  }
  base = base
    .replace(/^claude-(\d+(?:\.\d+)?)-([a-z]+)-max$/u, "claude-$1-$2")
    .replace(/-preview$/u, "");

  const claudeReordered = base.match(/^claude-(\d+(?:\.\d+)?)-([a-z]+)$/u);
  if (claudeReordered) {
    const version = claudeReordered[1];
    const family = claudeReordered[2];
    if (version && family) {
      return `claude-${family}-${version.replace(".", "-")}`;
    }
  }
  return base;
}

/**
 * 去除变体显示名称中的模式后缀（如 "Fast"、"Thinking"、"High"、"1M" 等）。
 *
 * @param name - 原始显示名称
 * @returns 去除后缀的名称
 */
function removeVariantNameSuffix(name: string): string {
  return name
    .replace(/\s+Fast$/iu, "")
    .replace(/\s+Thinking$/iu, "")
    .replace(/\s+Fast$/iu, "")
    .replace(/\s+(?:None|Low|Medium|High|Extra High)$/iu, "")
    .replace(/\s+1M$/u, "")
    .trim();
}

/**
 * 根据基础模型 slug 推断该分组的默认推理强度。
 * - GPT/Codex 系列默认 medium
 * - Claude 系列默认 high
 * - 其他系列取第一个可用值
 *
 * @param baseSlug - 基础模型 slug
 * @param efforts - 可用的推理强度值列表
 * @returns 默认推理强度，无可用值时返回 undefined
 */
function defaultEffortForGroup(
  baseSlug: string,
  efforts: ReadonlyArray<string>,
): string | undefined {
  if (efforts.length === 0) {
    return undefined;
  }
  if (baseSlug.includes("gpt") || baseSlug.includes("codex")) {
    return efforts.includes("medium") ? "medium" : efforts[0];
  }
  if (baseSlug.includes("claude")) {
    return efforts.includes("high") ? "high" : efforts[0];
  }
  return efforts[0];
}

/**
 * 判断模型是否为 1M 上下文窗口变体。
 * 通过 defaultContextWindow、contextWindowOptions 或名称中的 "1M" 标识判断。
 *
 * @param model - 模型描述符
 * @returns 是否为 1M 上下文窗口变体
 */
function isCursorOneMillionVariant(model: ProviderModelDescriptor): boolean {
  if (model.defaultContextWindow === "1m") {
    return true;
  }
  if (
    model.contextWindowOptions?.some((option) => option.value === "1m" && option.isDefault === true)
  ) {
    return true;
  }
  return /\b1M\b/u.test(model.name ?? "");
}

/**
 * 将 Cursor 的多个模型变体归并为统一的模型条目。
 * 按基础模型 ID 分组，合并各变体的推理强度选项、上下文窗口选项、
 * fast 模式和 thinking 模式支持状态。
 *
 * @param models - 原始的模型描述符列表
 * @returns 归并后的模型描述符列表
 */
export function collapseCursorModelVariants(
  models: ReadonlyArray<ProviderModelDescriptor>,
): ProviderModelDescriptor[] {
  const groups = new Map<string, ProviderModelDescriptor[]>();
  for (const model of models) {
    const baseSlug = normalizeCursorModelVariantBaseId(model.slug) ?? model.slug;
    const group = groups.get(baseSlug);
    if (group) {
      group.push(model);
    } else {
      groups.set(baseSlug, [model]);
    }
  }

  return Array.from(groups.entries()).map(([baseSlug, variants]) => {
    const preferredName =
      variants.find((variant) => variant.slug === baseSlug)?.name ??
      variants.find((variant) => !variant.slug.endsWith("-fast"))?.name ??
      variants[0]?.name ??
      baseSlug;
    const efforts = uniqueByValue(
      variants.flatMap((variant) => [
        ...(variant.supportedReasoningEfforts ?? []),
        ...(parseCursorCliReasoningEffort(variant.slug)
          ? [
              {
                value: parseCursorCliReasoningEffort(variant.slug)!,
                label: cursorReasoningLabel(parseCursorCliReasoningEffort(variant.slug)!),
              },
            ]
          : []),
      ]),
    );
    const defaultEffort =
      variants.find((variant) => normalizeCursorModelVariantBaseId(variant.slug) === variant.slug)
        ?.defaultReasoningEffort ??
      defaultEffortForGroup(
        baseSlug,
        efforts.map((effort) => effort.value),
      );
    const hasOneMillionContext = variants.some(isCursorOneMillionVariant);
    const contextWindowOptions = uniqueByValue([
      ...variants.flatMap((variant) => variant.contextWindowOptions ?? []),
      ...(hasOneMillionContext ? [{ value: "1m", label: "1M", isDefault: true as const }] : []),
    ]);

    return {
      slug: baseSlug,
      name: removeVariantNameSuffix(preferredName),
      ...(variants[0]?.upstreamProviderId
        ? { upstreamProviderId: variants[0].upstreamProviderId }
        : {}),
      ...(variants[0]?.upstreamProviderName
        ? { upstreamProviderName: variants[0].upstreamProviderName }
        : {}),
      ...(efforts.length > 0
        ? {
            supportedReasoningEfforts: efforts.map((effort) => ({
              value: effort.value,
              label: effort.label,
              ...(effort.value === defaultEffort ? { isDefault: true as const } : {}),
            })),
            ...(defaultEffort ? { defaultReasoningEffort: defaultEffort } : {}),
          }
        : {}),
      ...(variants.some((variant) => variant.supportsFastMode === true)
        ? { supportsFastMode: true as const }
        : {}),
      ...(variants.some((variant) => variant.supportsThinkingToggle === true)
        ? { supportsThinkingToggle: true as const }
        : {}),
      ...(contextWindowOptions.length > 0
        ? {
            contextWindowOptions,
            defaultContextWindow:
              contextWindowOptions.find((option) => option.isDefault === true)?.value ??
              contextWindowOptions[0]?.value,
          }
        : {}),
    };
  });
}
