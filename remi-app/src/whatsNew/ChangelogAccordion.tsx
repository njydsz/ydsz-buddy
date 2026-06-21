// FILE: whatsNew/ChangelogAccordion.tsx
// Purpose: Collapsible release-history accordion used by both the Settings
// "Release history" surface and the `WhatsNewDialog` "Complete changelog"
// secondary view. Each row summarises a release; expanding reveals the
// FeatureSection cards for that version.
// Layer: presentational ï½?it assumes the caller has already sorted entries
// newest-first (see `sortEntriesByVersionDesc`).

import { useState } from "react";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { cn } from "~/lib/utils";

import { FeatureSection } from "./FeatureSection";
import type { WhatsNewEntry } from "./logic";

export interface ChangelogAccordionProps {
  readonly entries: readonly WhatsNewEntry[];
  /**
   * The version to expand by default. When set, the matching row is open on
   * mount; all other rows start collapsed. Useful in the dialog, where we
   * want the installed build's notes front-and-center even in the changelog
   * view.
   */
  readonly defaultExpandedVersion?: string | null;
  readonly className?: string;
}

export function ChangelogAccordion({
  entries,
  defaultExpandedVersion = null,
  className,
}: ChangelogAccordionProps) {
  if (entries.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No release notes yet ï½?check back after the next update.
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-col", className)}>
      {entries.map((entry, index) => (
        <ChangelogAccordionRow
          key={entry.version}
          entry={entry}
          defaultOpen={entry.version === defaultExpandedVersion}
          isLast={index === entries.length - 1}
        />
      ))}
    </ul>
  );
}

/**
 * 更新日志手风琴行组件
 * @description 渲染单个版本的可折叠行,包含版本信息和功能列表
 * @param props - 组件属性
 * @returns 手风琴行组件
 */
function ChangelogAccordionRow({
  entry,
  defaultOpen,
  isLast,
}: {
  /** 版本条目 */
  readonly entry: WhatsNewEntry;
  /** 是否默认展开 */
  readonly defaultOpen: boolean;
  /** 是否为最后一行 */
  readonly isLast: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const featureCount = entry.features.length;
  const featureLabel = featureCount === 1 ? "1 个更新" : `${featureCount} 个更新`;

  return (
    <li className={cn(!isLast && "border-b border-border/40")}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 py-3 text-left">
          <DisclosureChevron open={open} />
          <span className="flex flex-1 items-baseline gap-2">
            <span className="text-xs text-muted-foreground">{entry.date}</span>
            <span className="text-sm font-semibold text-foreground">版本 {entry.version}</span>
            <span className="text-xs text-muted-foreground/70">({featureLabel})</span>
          </span>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="flex flex-col gap-6 pb-4 pl-6 pr-1">
            {entry.features.map((feature) => (
              <FeatureSection key={feature.id} feature={feature} />
            ))}
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </li>
  );
}
