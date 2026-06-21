/**
 * ProviderIcon - shared provider glyphs for chat, sidebar, and picker surfaces.
 *
 * Centralizes provider-to-icon mapping so new providers do not need repeated
 * branching across every UI surface.
 */
/**
 * @file Provider 图标
 *
 * 聊天、侧栏、选择器中复用的 provider 图标集合：
 *
 * - 集中 provider → 图标映射
 * - 避免每个 UI 表面重复分支
 *
 * ## 核心导出
 *
 * - `ProviderIcon`：根据 `ProviderKind` 渲染对应图标
 * - `ProviderIconByKind`：provider → 图标组件映射
 *
 * ## 使用场景
 *
 * - ChatHeader 中的 provider 徽标
 * - Sidebar provider 列表
 * - ProviderModelPicker 选项前缀
 *
 * ## 注意事项
 *
 * - 新增 provider 时需要在此文件补充图标
 * - 通过 `cn` 支持自定义 className
 * - 所有图标尺寸统一
 */
import { type ProviderKind } from "~/contracts";
import type { ReactNode, SVGProps } from "react";

import { cn } from "~/lib/utils";
import {
  ClaudeAI,
  CursorIcon,
  Gemini,
  GrokIcon,
  type Icon,
  KiloIcon,
  OpenAI,
  OpenCodeIcon,
  PiIcon,
} from "./Icons";

export type ProviderIconTone = "default" | "header";

export const PROVIDER_ICON_COMPONENT_BY_PROVIDER: Record<ProviderKind, Icon> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  cursor: CursorIcon,
  gemini: Gemini,
  grok: GrokIcon,
  kilo: KiloIcon,
  opencode: OpenCodeIcon,
  pi: PiIcon,
};

export function providerIconToneClassName(
  provider: ProviderKind | null | undefined,
  tone: ProviderIconTone = "default",
): string {
  if (provider === "kilo" || provider === "opencode") {
    return "text-muted-foreground/70";
  }
  if (provider === "codex") {
    return tone === "header" ? "text-muted-foreground/75" : "text-muted-foreground/60";
  }
  return "text-foreground";
}

export type ProviderIconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  readonly provider: ProviderKind | null | undefined;
  readonly fallback?: ReactNode;
  readonly tone?: ProviderIconTone;
};

export function ProviderIcon({
  provider,
  fallback = null,
  tone = "default",
  className,
  "aria-hidden": ariaHidden = true,
  ...svgProps
}: ProviderIconProps) {
  if (provider === null || provider === undefined) {
    return fallback;
  }

  const Icon = PROVIDER_ICON_COMPONENT_BY_PROVIDER[provider];
  return (
    <Icon
      aria-hidden={ariaHidden}
      {...svgProps}
      className={cn(providerIconToneClassName(provider, tone), className)}
    />
  );
}
