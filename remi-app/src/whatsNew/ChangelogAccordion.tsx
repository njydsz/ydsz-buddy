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
 * æ›´æ–°æ—¥å—æ‰‹é£Žç´è¡Œç»„ä»¶
 * @description æ¸²æŸ“å•ä¸ªç‰ˆæœ¬çš„å¯æŠ˜å è¡Œ,åŒ…å«ç‰ˆæœ¬ä¡æ¯å’ŒåŠŸèƒ½åˆ—è¡¨
 * @param props - ç»„ä»¶å±žæ€§
 * @returns æ‰‹é£Žç´è¡Œç»„ä»¶
 */
function ChangelogAccordionRow({
  entry,
  defaultOpen,
  isLast,
}: {
  /** ç‰ˆæœ¬æ¡ç›® */
  readonly entry: WhatsNewEntry;
  /** æ˜¯å¦é»˜è®¤å±•å¼€ */
  readonly defaultOpen: boolean;
  /** æ˜¯å¦ä¸ºæœ€åŽä¸€è¡Œ */
  readonly isLast: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const featureCount = entry.features.length;
  const featureLabel = featureCount === 1 ? "1 ä¸ªæ›´æ–°" : `${featureCount} ä¸ªæ›´æ–°`;

  return (
    <li className={cn(!isLast && "border-b border-border/40")}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 py-3 text-left">
          <DisclosureChevron open={open} />
          <span className="flex flex-1 items-baseline gap-2">
            <span className="text-xs text-muted-foreground">{entry.date}</span>
            <span className="text-sm font-semibold text-foreground">ç‰ˆæœ¬ {entry.version}</span>
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
