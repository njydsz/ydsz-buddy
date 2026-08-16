// FILE: PluginLibraryPresentation.tsx
// Purpose: Shared presentational building blocks used by both PluginsView and SkillsView.
//          Grid items and the small UI bits that don't carry route state.
// Layer: Presentation
// Exports: PluginGridItem, SkillGridItem, PluginGlyph, SkillGlyph, InstalledStatus
/**
 * @file 插件库共享展示组件
 *
 * `PluginsView` 与 `SkillsView` 共用的展示组件：
 *
 * - `PluginGridItem` / `SkillGridItem`：网格项
 * - `PluginGlyph` / `SkillGlyph`：图标占位
 * - `InstalledStatus`：已安装/未安装状态
 *
 * ## 使用场景
 *
 * - PluginsView / SkillsView 内部复用
 *
 * ## 注意事项
 *
 * - 不持有路由级状态，仅接收 props
 */
import { useState, type ReactNode } from "react";
import { HammerIcon, CheckIcon, type LucideIcon } from "~/lib/icons";
import {
  type ProviderPluginDescriptor,
  type ProviderSkillDescriptor,
} from "~/contracts";
import {
  SiCanva,
  SiFigma,
  SiGithub,
  SiGmail,
  SiGooglecalendar,
  SiGoogledrive,
  SiHuggingface,
  SiLinear,
  SiNotion,
  SiSlack,
  SiStripe,
  SiVercel,
} from "react-icons/si";
import { isInstalledProviderPlugin } from "~/lib/providerDiscovery";
import { type PluginEntry } from "./useProviderDiscoveryData";

// ── Constants ──────────────────────────────────────────────────────────────

const KNOWN_PLUGIN_BRANDS: Record<string, { color: string; icon: typeof SiCanva }> = {
  canva: { icon: SiCanva, color: "#00C4CC" },
  figma: { icon: SiFigma, color: "#F24E1E" },
  github: { icon: SiGithub, color: "#181717" },
  gmail: { icon: SiGmail, color: "#EA4335" },
  googlecalendar: { icon: SiGooglecalendar, color: "#4285F4" },
  googledrive: { icon: SiGoogledrive, color: "#0F9D58" },
  huggingface: { icon: SiHuggingface, color: "#FF9D00" },
  linear: { icon: SiLinear, color: "#5E6AD2" },
  notion: { icon: SiNotion, color: "#111111" },
  slack: { icon: SiSlack, color: "#4A154B" },
  stripe: { icon: SiStripe, color: "#635BFF" },
  vercel: { icon: SiVercel, color: "#111111" },
};

export { type PluginEntry };

// ── Utilities ──────────────────────────────────────────────────────────────

export function pluginEntryKey(entry: Pick<PluginEntry, "marketplacePath" | "plugin">): string {
  return `${entry.marketplacePath}::${entry.plugin.name}`;
}

export function sectionTitle(value: string): string {
  const n = value.trim();
  return n.length === 0 ? "Unknown" : n;
}

function resolvePluginAccent(plugin: ProviderPluginDescriptor): string | undefined {
  return plugin.interface?.brandColor?.trim() || undefined;
}

function normalizeBrandKey(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function resolvePluginLogo(plugin: ProviderPluginDescriptor): string | undefined {
  return plugin.interface?.logo?.trim() || undefined;
}

function resolvePluginBrand(
  plugin: ProviderPluginDescriptor,
): { color: string; icon: typeof SiCanva } | undefined {
  const candidates = [
    plugin.interface?.composerIcon,
    plugin.interface?.displayName,
    plugin.name,
  ].map(normalizeBrandKey);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const knownBrand = KNOWN_PLUGIN_BRANDS[candidate];
    if (knownBrand) return knownBrand;
  }

  return undefined;
}

function nameToHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h) % 360;
}

// ── Glyphs ─────────────────────────────────────────────────────────────────

export function PluginGlyph({ plugin }: { plugin: ProviderPluginDescriptor }) {
  const accent = resolvePluginAccent(plugin);
  const logo = resolvePluginLogo(plugin);
  const brand = resolvePluginBrand(plugin);
  const hue = nameToHue(plugin.interface?.displayName ?? plugin.name);
  const [logoFailed, setLogoFailed] = useState(false);
  const style = accent
    ? {
        background: `linear-gradient(145deg, ${accent}cc, ${accent}77)`,
        boxShadow: `0 0 0 0.5px ${accent}35`,
      }
    : {
        background: `linear-gradient(145deg, hsl(${hue} 55% 30%), hsl(${hue} 45% 18%))`,
        boxShadow: `0 0 0 0.5px hsl(${hue} 40% 30% / 0.35)`,
      };

  if (logo && !logoFailed) {
    return (
      <span
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-border/60 bg-background"
        style={accent ? { boxShadow: `0 0 0 0.5px ${accent}25` } : undefined}
      >
        <img
          src={logo}
          alt=""
          className="size-7 rounded-md object-contain"
          onError={() => setLogoFailed(true)}
        />
      </span>
    );
  }

  if (brand) {
    const BrandIcon = brand.icon;
    return (
      <span
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-border/60"
        style={{
          background: `${brand.color}1f`,
          boxShadow: `inset 0 0 0 0.5px ${brand.color}40`,
        }}
      >
        <BrandIcon className="size-6" style={{ color: brand.color }} />
      </span>
    );
  }

  return (
    <span
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px]"
      style={style}
    >
      <HammerIcon className="size-4 text-foreground/85" />
    </span>
  );
}

export function SkillGlyph({ skill }: { skill: ProviderSkillDescriptor }) {
  const hue = nameToHue(skill.name);
  return (
    <span
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] text-[15px] font-semibold text-foreground"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 55% 30%), hsl(${hue} 45% 18%))`,
        boxShadow: `inset 0 0 0 0.5px hsl(${hue} 40% 30% / 0.35)`,
      }}
    >
      {skill.name.charAt(0).toUpperCase()}
    </span>
  );
}

// ── Status / Toolbar ───────────────────────────────────────────────────────

export function InstalledStatus({ installed }: { installed: boolean }) {
  if (!installed) return null;
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground/60">
      <CheckIcon className="size-3.5" />
    </span>
  );
}

// ── Grid items ─────────────────────────────────────────────────────────────

export function PluginGridItem({ entry }: { entry: PluginEntry }) {
  const description =
    entry.plugin.interface?.shortDescription ??
    entry.plugin.interface?.longDescription ??
    entry.plugin.source.path;

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-(--sidebar-accent)">
      <PluginGlyph plugin={entry.plugin} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-foreground">
          {entry.plugin.interface?.displayName ?? entry.plugin.name}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{description}</p>
      </div>
      <InstalledStatus installed={isInstalledProviderPlugin(entry.plugin)} />
    </div>
  );
}

export function SkillGridItem({ skill }: { skill: ProviderSkillDescriptor }) {
  const description =
    skill.interface?.shortDescription ?? skill.description ?? "No description available.";

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-(--sidebar-accent)">
      <SkillGlyph skill={skill} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-foreground">
          {skill.interface?.displayName ?? skill.name}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{description}</p>
      </div>
      <InstalledStatus installed={skill.enabled} />
    </div>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return <h2 className="px-3 pb-1 pt-2 text-[15px] font-semibold text-foreground">{title}</h2>;
}

export function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 px-5 py-6 text-center">
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function InlineWarning({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/6 px-3 py-2.5 text-xs text-muted-foreground">
      <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
      <div>{children}</div>
    </div>
  );
}

export type { LucideIcon };
