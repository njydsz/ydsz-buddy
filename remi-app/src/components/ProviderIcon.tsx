/**
 * @file ProviderIcon.tsx
 * @description 提供者图标映射组件，集中管理提供者到图标的对应关系，
 *              避免在每个 UI 表面重复分支判断。
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

/** 提供者图标色调类型：默认或头部强调 */
export type ProviderIconTone = "default" | "header";

/** 按提供者类型映射的图标组件注册表 */
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
