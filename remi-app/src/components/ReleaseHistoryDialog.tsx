/**
 * @file ReleaseHistoryDialog.tsx
 * @description ç‹¬ç«‹çš„å®Œæ•´å‘å¸ƒåŽ†å²å¯¹è¯æ¡†ï¼Œä¾›"è®¾ç½® > å…³äºŽ"å…¥å£ä½¿ç”¨ï¼Œ
 *              é•œåƒæ›´æ–°åŽå¯¹è¯æ¡†çš„"å®Œæ•´æ›´æ–°æ—¥å¿—"è§†å›¾ï¼Œä½†ä¸é”šå®šå½“å‰ç‰ˆæœ¬ã€‚
 */

import { ChangelogAccordion } from "../whatsNew/ChangelogAccordion";
import { WHATS_NEW_ENTRIES } from "../whatsNew/entries";
import { sortEntriesByVersionDesc, type WhatsNewEntry } from "../whatsNew/logic";
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

export interface ReleaseHistoryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Entries to display. Defaults to the full curated list; callers can
   * override in tests or storybook scenarios without poking at module state.
   */
  readonly entries?: readonly WhatsNewEntry[];
  /**
   * Version to expand by default (usually the installed build). `null`
   * leaves every row collapsed so the user scans dates-first.
   */
  readonly defaultExpandedVersion?: string | null;
}

export default function ReleaseHistoryDialog({
  open,
  onOpenChange,
  entries = WHATS_NEW_ENTRIES,
  defaultExpandedVersion = null,
}: ReleaseHistoryDialogProps) {
  // Sort at render time so the source of truth (`entries.ts`) stays free of
  // ordering rules ï¿½?authors can prepend, append, or reorder entries freely.
  const sorted = sortEntriesByVersionDesc(entries);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg gap-0 p-0">
        <DialogHeader className="gap-1 p-4 pr-12">
          <DialogTitle className="text-base">Release history</DialogTitle>
          <DialogDescription className="text-xs">
            Every curated release, newest first.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="max-h-[min(62vh,520px)] px-4 py-3">
          <ChangelogAccordion entries={sorted} defaultExpandedVersion={defaultExpandedVersion} />
        </DialogPanel>

        <DialogFooter className="px-4 py-3">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
