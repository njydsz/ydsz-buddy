/**
 * @file WhatsNewDialog.tsx
 * @description æ›´æ–°åŽçš„"æ–°åŠŸèƒ½"å‘å¸ƒè¯´æ˜Žå¯¹è¯æ¡†ï¼ŒåŒ…å«å½“å‰ç‰ˆæœ¬åŠŸèƒ½å¡ç‰‡å’Œå®Œæ•´æ›´æ–°æ—¥å¿—æŠ˜å é¢æ¿ã€‚
 *              å¼€å…³çŠ¶æ€ç”± useWhatsNew ç®¡ç†ï¼Œæœ¬ç»„ä»¶ä»…è´Ÿè´£å±•ç¤ºã€‚
 */

import { useEffect, useState } from "react";

import { ArrowLeftIcon, ArrowRightIcon } from "~/lib/icons";

import { ChangelogAccordion } from "../whatsNew/ChangelogAccordion";
import { FeatureSection } from "../whatsNew/FeatureSection";
import type { WhatsNewEntry } from "../whatsNew/logic";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";

type View = "current" | "changelog";

export interface WhatsNewDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * The entry matching the installed build. `null` means "nothing to show" ï¿½?   * the hook only flips `open=true` when we have an entry, so normally this is
   * non-null while the dialog is visible. We still guard against the null
   * case to keep the UI tolerant of mid-transition re-renders.
   */
  readonly currentEntry: WhatsNewEntry | null;
  /** Full curated history, newest-first, for the changelog accordion. */
  readonly allEntries: readonly WhatsNewEntry[];
  readonly currentVersion: string;
}

export default function WhatsNewDialog({
  open,
  onOpenChange,
  currentEntry,
  allEntries,
  currentVersion,
}: WhatsNewDialogProps) {
  const [view, setView] = useState<View>("current");

  // Reset back to the primary view whenever the dialog re-opens so the next
  // release doesn't boot into the secondary "Complete changelog" screen just
  // because the user left it there on a previous open.
  useEffect(() => {
    if (open) {
      setView("current");
    }
  }, [open]);

  // Guard against a race where the hook has already reset but base-ui is
  // still transitioning ï¿½?rendering an empty card would briefly flash a
  // confusing empty state.
  if (!currentEntry) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPopup className="max-w-md" />
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg gap-0 p-0" showCloseButton={false}>
        <DialogHeader className="gap-1 p-4 pr-12">
          {view === "current" ? (
            <CurrentHeader entry={currentEntry} currentVersion={currentVersion} />
          ) : (
            <ChangelogHeader onBack={() => setView("current")} />
          )}
        </DialogHeader>

        <DialogPanel className="max-h-[min(62vh,520px)] px-4 py-3">
          {view === "current" ? (
            <div className="flex flex-col gap-8 py-1">
              {currentEntry.features.map((feature) => (
                <FeatureSection key={feature.id} feature={feature} />
              ))}
            </div>
          ) : (
            <ChangelogAccordion
              entries={allEntries}
              defaultExpandedVersion={currentEntry.version}
            />
          )}
        </DialogPanel>

        {view === "current" && (
          <DialogFooter className="gap-2 px-4 py-3 sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => setView("changelog")}
            >
              View changelog
              <ArrowRightIcon className="size-3" />
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Got it
            </Button>
          </DialogFooter>
        )}
      </DialogPopup>
    </Dialog>
  );
}

function CurrentHeader({
  entry,
  currentVersion,
}: {
  readonly entry: WhatsNewEntry;
  readonly currentVersion: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/favicon-32x32.png"
        alt=""
        aria-hidden="true"
        className="size-8 shrink-0 rounded-[8px]"
        loading="eager"
        decoding="async"
      />
      <div className="flex min-w-0 flex-col">
        <DialogTitle className="text-base">What&rsquo;s new?</DialogTitle>
        <DialogDescription className="text-xs">
          v{currentVersion}
          <span aria-hidden="true"> Â· </span>
          {entry.date}
        </DialogDescription>
      </div>
    </div>
  );
}

function ChangelogHeader({ onBack }: { readonly onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Button size="icon-sm" variant="ghost" aria-label="Back to What's new" onClick={onBack}>
        <ArrowLeftIcon className="size-4" />
      </Button>
      <div className="flex min-w-0 flex-col">
        <DialogTitle className="text-base">Complete changelog</DialogTitle>
        <DialogDescription className="text-xs">
          Every curated release, newest first.
        </DialogDescription>
      </div>
    </div>
  );
}
