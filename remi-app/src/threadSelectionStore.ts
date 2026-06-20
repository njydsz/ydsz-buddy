/**
 * @file threadSelectionStore.ts
 * @description 娓氀嗙珶閺嶅繒鍤庣粙瀣樋闁濮搁幀浣烘畱 Zustand Store閵? *
 * 閺€顖涘瘮娑撳顫掗柅澶嬪濡€崇础閿? * - Cmd/Ctrl+Click閿涙艾鍨忛幑銏犲礋娑擃亞鍤庣粙瀣畱闁鑵戦悩鑸碘偓? * - Shift+Click閿涙俺瀵栭崶鎾偓澶嬪閿涘牅绮犻柨姘卞仯缁捐法鈻奸崚鎵窗閺嶅洨鍤庣粙瀣╃闂傚娈戦幍鈧張澶屽殠缁嬪绱? * - 閹靛綊鍣洪幙宥勭稊閿涙艾顕鏌モ偓澶夎厬閻ㄥ嫮鍤庣粙瀣肠閸氬牊澧界悰灞惧闁插繑鎼锋担? *
 * @example
 * ```tsx
 * const { selectedThreadIds, toggleThread, rangeSelectTo, clearSelection } = useThreadSelectionStore();
 * ```
 */

import type { ThreadId } from "~/contracts";
import { create } from "zustand";

export interface ThreadSelectionState {
  /** Currently selected thread IDs. */
  selectedThreadIds: ReadonlySet<ThreadId>;
  /** The thread ID that anchors shift-click range selection. */
  anchorThreadId: ThreadId | null;
}

interface ThreadSelectionStore extends ThreadSelectionState {
  /** Toggle a single thread in the selection (Cmd/Ctrl+Click). */
  toggleThread: (threadId: ThreadId) => void;
  /**
   * Select a range of threads (Shift+Click).
   * Requires the ordered list of thread IDs within the same project
   * so the store can compute which threads fall between anchor and target.
   */
  rangeSelectTo: (threadId: ThreadId, orderedThreadIds: readonly ThreadId[]) => void;
  /** Clear all selection state. */
  clearSelection: () => void;
  /** Remove specific thread IDs from the selection (e.g. after deletion). */
  removeFromSelection: (threadIds: readonly ThreadId[]) => void;
  /** Set the anchor thread without adding it to the selection (e.g. on plain-click navigate). */
  setAnchor: (threadId: ThreadId) => void;
  /** Check if any threads are selected. */
  hasSelection: () => boolean;
}

/** 缁屾椽娉﹂崥鍫濈埗闁插骏绱濋悽銊ょ艾 clearSelection 閺冨爼浼╅崗宥呭灡瀵ょ儤鏌婇惃?Set 鐎圭偘绶?*/
const EMPTY_SET = new Set<ThreadId>();

/**
 * 缁捐法鈻兼径姘垛偓澶屽Ц閹?Store閿涘本褰佹笟娑⑩偓澶嬪閵嗕礁褰囧☉鍫モ偓澶嬪閵嗕浇瀵栭崶鎾偓澶嬪缁涘鎼锋担婧库偓? *
 * @example
 * ```tsx
 * function Sidebar() {
 *   const selectedIds = useThreadSelectionStore((s) => s.selectedThreadIds);
 *   const toggleThread = useThreadSelectionStore((s) => s.toggleThread);
 *   const hasSelection = useThreadSelectionStore((s) => s.hasSelection);
 * }
 * ```
 */
export const useThreadSelectionStore = create<ThreadSelectionStore>((set, get) => ({
  selectedThreadIds: EMPTY_SET,
  anchorThreadId: null,

  toggleThread: (threadId) => {
    set((state) => {
      const next = new Set(state.selectedThreadIds);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return {
        selectedThreadIds: next,
        anchorThreadId: next.has(threadId) ? threadId : state.anchorThreadId,
      };
    });
  },

  rangeSelectTo: (threadId, orderedThreadIds) => {
    set((state) => {
      const anchor = state.anchorThreadId;
      if (anchor === null) {
        // No anchor yet 鈥攖reat as a single toggle
        const next = new Set(state.selectedThreadIds);
        next.add(threadId);
        return { selectedThreadIds: next, anchorThreadId: threadId };
      }

      const anchorIndex = orderedThreadIds.indexOf(anchor);
      const targetIndex = orderedThreadIds.indexOf(threadId);
      if (anchorIndex === -1 || targetIndex === -1) {
        // Anchor or target not in this list (different project?) 鈥攆allback to toggle
        const next = new Set(state.selectedThreadIds);
        next.add(threadId);
        return { selectedThreadIds: next, anchorThreadId: threadId };
      }

      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      const next = new Set(state.selectedThreadIds);
      for (let i = start; i <= end; i++) {
        const id = orderedThreadIds[i];
        if (id !== undefined) {
          next.add(id);
        }
      }
      // Keep anchor stable so subsequent shift-clicks extend from the same point
      return { selectedThreadIds: next, anchorThreadId: anchor };
    });
  },

  clearSelection: () => {
    const state = get();
    if (state.selectedThreadIds.size === 0 && state.anchorThreadId === null) return;
    set({ selectedThreadIds: EMPTY_SET, anchorThreadId: null });
  },

  setAnchor: (threadId) => {
    if (get().anchorThreadId === threadId) return;
    set({ anchorThreadId: threadId });
  },

  removeFromSelection: (threadIds) => {
    set((state) => {
      const toRemove = new Set(threadIds);
      let changed = false;
      const next = new Set<ThreadId>();
      for (const id of state.selectedThreadIds) {
        if (toRemove.has(id)) {
          changed = true;
        } else {
          next.add(id);
        }
      }
      if (!changed) return state;
      const newAnchor =
        state.anchorThreadId !== null && toRemove.has(state.anchorThreadId)
          ? null
          : state.anchorThreadId;
      return { selectedThreadIds: next, anchorThreadId: newAnchor };
    });
  },

  hasSelection: () => get().selectedThreadIds.size > 0,
}));
