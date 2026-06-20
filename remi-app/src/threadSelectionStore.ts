/**
 * @file threadSelectionStore.ts
 * @description 渚ц竟鏍忕嚎绋嬪閫夌姸鎬佺殑 Zustand Store銆? *
 * 鏀寔涓夌閫夋嫨妯″紡锛? * - Cmd/Ctrl+Click锛氬垏鎹㈠崟涓嚎绋嬬殑閫変腑鐘舵€? * - Shift+Click锛氳寖鍥撮€夋嫨锛堜粠閿氱偣绾跨▼鍒扮洰鏍囩嚎绋嬩箣闂寸殑鎵€鏈夌嚎绋嬶級
 * - 鎵归噺鎿嶄綔锛氬宸查€変腑鐨勭嚎绋嬮泦鍚堟墽琛屾壒閲忔搷浣? *
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

/** 绌洪泦鍚堝父閲忥紝鐢ㄤ簬 clearSelection 鏃堕伩鍏嶅垱寤烘柊鐨?Set 瀹炰緥 */
const EMPTY_SET = new Set<ThreadId>();

/**
 * 绾跨▼澶氶€夌姸鎬?Store锛屾彁渚涢€夋嫨銆佸彇娑堥€夋嫨銆佽寖鍥撮€夋嫨绛夋搷浣溿€? *
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
        // No anchor yet —treat as a single toggle
        const next = new Set(state.selectedThreadIds);
        next.add(threadId);
        return { selectedThreadIds: next, anchorThreadId: threadId };
      }

      const anchorIndex = orderedThreadIds.indexOf(anchor);
      const targetIndex = orderedThreadIds.indexOf(threadId);
      if (anchorIndex === -1 || targetIndex === -1) {
        // Anchor or target not in this list (different project?) —fallback to toggle
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
