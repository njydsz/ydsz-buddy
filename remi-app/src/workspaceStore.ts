/**
 * @file workspaceStore.ts
 * @description 鎸佷箙鍖栫殑缁堢宸ヤ綔鍖洪〉闈㈢姸鎬佺鐞?Store銆? *
 * 绠＄悊缁堢涓撳睘鐨勫伐浣滃尯椤甸潰锛屾瘡涓伐浣滃尯椤甸潰鎷ユ湁鐙珛鐨勭粓绔竷灞€棰勮銆? * 鍚屾椂缁存姢鐢ㄦ埛涓荤洰褰曡矾寰勶紝渚涚粓绔矾寰勮В鏋愪娇鐢ㄣ€? * 鐘舵€侀€氳繃 localStorage 鎸佷箙鍖栥€? */

import { type ThreadId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_WORKSPACE_LAYOUT_PRESET_ID,
  getWorkspaceLayoutPreset,
  type WorkspaceLayoutPresetId,
} from "./workspaceTerminalLayoutPresets";

/**
 * 宸ヤ綔鍖洪〉闈㈡暟鎹紝鍖呭惈 ID銆佹爣棰樸€佸竷灞€棰勮鍜屾椂闂存埑銆? */
interface WorkspacePage {
  /** 宸ヤ綔鍖哄敮涓€鏍囪瘑 */
  id: string;
  /** 宸ヤ綔鍖烘樉绀烘爣棰?*/
  title: string;
  /** 缁堢甯冨眬棰勮 ID */
  layoutPresetId: WorkspaceLayoutPresetId;
  /** 鍒涘缓鏃堕棿锛圛SO 鏍煎紡锛?*/
  createdAt: string;
  /** 鏈€鍚庢洿鏂版椂闂达紙ISO 鏍煎紡锛?*/
  updatedAt: string;
}

interface WorkspaceStoreState {
  homeDir: string | null;
  workspacePages: WorkspacePage[];
  setHomeDir: (homeDir: string | null | undefined) => void;
  ensureWorkspacePage: (workspaceId: string) => void;
  createWorkspace: () => string;
  renameWorkspace: (workspaceId: string, title: string) => void;
  setWorkspaceLayoutPreset: (workspaceId: string, layoutPresetId: WorkspaceLayoutPresetId) => void;
  deleteWorkspace: (workspaceId: string) => void;
  reorderWorkspace: (workspaceId: string, nextIndex: number) => void;
}

/** localStorage 鎸佷箙鍖栭敭鍚?*/
const WORKSPACE_STORE_STORAGE_KEY = "remicode:workspace-pages:v2";

function randomWorkspaceId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function trimWorkspaceTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

function nextWorkspaceTitle(
  workspacePages: readonly WorkspacePage[],
  excludeWorkspaceId?: string | undefined,
): string {
  const takenTitles = new Set(
    workspacePages
      .filter((workspace) => workspace.id !== excludeWorkspaceId)
      .map((workspace) => workspace.title.toLowerCase()),
  );
  let index = 1;
  while (true) {
    const candidate = `Workspace ${index}`;
    if (!takenTitles.has(candidate.toLowerCase())) {
      return candidate;
    }
    index += 1;
  }
}

function createWorkspacePage(
  workspacePages: readonly WorkspacePage[],
  input?: { id?: string; title?: string; layoutPresetId?: WorkspaceLayoutPresetId },
): WorkspacePage {
  const createdAt = nowIso();
  return {
    id: input?.id ?? randomWorkspaceId(),
    title: trimWorkspaceTitle(input?.title ?? "") || nextWorkspaceTitle(workspacePages),
    layoutPresetId: getWorkspaceLayoutPreset(
      input?.layoutPresetId ?? DEFAULT_WORKSPACE_LAYOUT_PRESET_ID,
    ).id,
    createdAt,
    updatedAt: createdAt,
  };
}

function normalizeWorkspacePages(workspacePages: readonly WorkspacePage[]): WorkspacePage[] {
  const seenIds = new Set<string>();
  const nextPages: WorkspacePage[] = [];

  for (const workspace of workspacePages) {
    const id = workspace.id.trim();
    if (id.length === 0 || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    nextPages.push({
      id,
      title: trimWorkspaceTitle(workspace.title) || nextWorkspaceTitle(nextPages, id),
      layoutPresetId: getWorkspaceLayoutPreset(
        workspace.layoutPresetId ?? DEFAULT_WORKSPACE_LAYOUT_PRESET_ID,
      ).id,
      createdAt: workspace.createdAt || nowIso(),
      updatedAt: workspace.updatedAt || workspace.createdAt || nowIso(),
    });
  }

  return nextPages.length > 0 ? nextPages : [createWorkspacePage([])];
}

function reorderAtIndex<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return [...items];
  }
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * 灏嗗伐浣滃尯 ID 杞崲涓哄悎鎴愮殑绾跨▼ ID銆? * 宸ヤ綔鍖洪〉闈娇鐢ㄥ悎鎴愮殑绾跨▼ ID 涓庣粓绔姸鎬?Store 鍏宠仈锛? * 浣垮緱宸ヤ綔鍖洪〉闈㈠彲浠ュ鐢ㄧ嚎绋嬬骇鍒殑缁堢鐘舵€佺鐞嗐€? *
 * @param workspaceId - 宸ヤ綔鍖?ID
 * @returns 鍚堟垚鐨勭嚎绋?ID锛屾牸寮忎负 "workspace:{workspaceId}"
 *
 * @example
 * ```ts
 * workspaceThreadId("abc-123"); // => "workspace:abc-123"
 * ```
 */
export function workspaceThreadId(workspaceId: string): ThreadId {
  return `workspace:${workspaceId}` as ThreadId;
}

/**
 * 宸ヤ綔鍖洪〉闈㈢姸鎬?Zustand Store銆? * 绠＄悊宸ヤ綔鍖洪〉闈㈢殑澧炲垹鏀规煡銆侀噸鍛藉悕銆佹帓搴忓拰甯冨眬棰勮鍒囨崲銆? * 閫氳繃 persist 涓棿浠跺皢鐘舵€佹寔涔呭寲鍒?localStorage銆? *
 * @example
 * ```tsx
 * const { workspacePages, createWorkspace, deleteWorkspace } = useWorkspaceStore();
 * ```
 */
export const useWorkspaceStore = create<WorkspaceStoreState>()(
  persist(
    (set) => ({
      homeDir: null,
      workspacePages: [createWorkspacePage([])],
      setHomeDir: (homeDir) =>
        set((state) => {
          // `undefined` means server config has not arrived yet; keep the last known value.
          if (homeDir === undefined) {
            return state;
          }
          const normalizedHomeDir = homeDir?.trim() ?? null;
          if (state.homeDir === normalizedHomeDir) {
            return state;
          }
          return { homeDir: normalizedHomeDir };
        }),
      ensureWorkspacePage: (workspaceId) =>
        set((state) => {
          const normalizedWorkspaceId = workspaceId.trim();
          if (normalizedWorkspaceId.length === 0) {
            return state;
          }
          if (state.workspacePages.some((workspace) => workspace.id === normalizedWorkspaceId)) {
            return state;
          }
          return {
            workspacePages: [
              ...state.workspacePages,
              createWorkspacePage(state.workspacePages, { id: normalizedWorkspaceId }),
            ],
          };
        }),
      createWorkspace: () => {
        const workspaceId = randomWorkspaceId();
        set((state) => ({
          workspacePages: [
            ...state.workspacePages,
            createWorkspacePage(state.workspacePages, { id: workspaceId }),
          ],
        }));
        return workspaceId;
      },
      renameWorkspace: (workspaceId, title) =>
        set((state) => {
          const normalizedTitle = trimWorkspaceTitle(title);
          const workspacePages = state.workspacePages.map((workspace) => {
            if (workspace.id !== workspaceId) {
              return workspace;
            }
            const nextTitle =
              normalizedTitle.length > 0
                ? normalizedTitle
                : nextWorkspaceTitle(state.workspacePages, workspaceId);
            if (workspace.title === nextTitle) {
              return workspace;
            }
            return {
              ...workspace,
              title: nextTitle,
              updatedAt: nowIso(),
            };
          });
          return { workspacePages };
        }),
      setWorkspaceLayoutPreset: (workspaceId, layoutPresetId) =>
        set((state) => {
          const normalizedPresetId = getWorkspaceLayoutPreset(layoutPresetId).id;
          const workspacePages = state.workspacePages.map((workspace) => {
            if (workspace.id !== workspaceId || workspace.layoutPresetId === normalizedPresetId) {
              return workspace;
            }
            return {
              ...workspace,
              layoutPresetId: normalizedPresetId,
              updatedAt: nowIso(),
            };
          });
          return { workspacePages };
        }),
      deleteWorkspace: (workspaceId) =>
        set((state) => {
          const remainingWorkspacePages = state.workspacePages.filter(
            (workspace) => workspace.id !== workspaceId,
          );
          return {
            workspacePages:
              remainingWorkspacePages.length > 0
                ? remainingWorkspacePages
                : [createWorkspacePage([])],
          };
        }),
      reorderWorkspace: (workspaceId, nextIndex) =>
        set((state) => {
          const currentIndex = state.workspacePages.findIndex(
            (workspace) => workspace.id === workspaceId,
          );
          if (currentIndex < 0 || currentIndex === nextIndex) {
            return state;
          }
          return {
            workspacePages: reorderAtIndex(state.workspacePages, currentIndex, nextIndex),
          };
        }),
    }),
    {
      name: WORKSPACE_STORE_STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        homeDir: state.homeDir,
        workspacePages: state.workspacePages,
      }),
      merge: (persistedState, currentState) => {
        const candidate = (persistedState as Partial<WorkspaceStoreState> | undefined) ?? {};
        const workspacePages = normalizeWorkspacePages(candidate.workspacePages ?? []);
        return {
          ...currentState,
          homeDir: candidate.homeDir?.trim() ?? null,
          workspacePages,
        };
      },
    },
  ),
);
