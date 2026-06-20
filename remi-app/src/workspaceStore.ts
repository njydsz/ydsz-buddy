/**
 * @file workspaceStore.ts
 * @description 閹镐椒绠欓崠鏍畱缂佸牏顏銉ょ稊閸栨椽銆夐棃銏㈠Ц閹胶顓搁悶?Store閵? *
 * 缁狅紕鎮婄紒鍫㈩伂娑撴挸鐫橀惃鍕紣娴ｆ粌灏い鐢告桨閿涘本鐦℃稉顏勪紣娴ｆ粌灏い鐢告桨閹枫儲婀侀悪顒傜彌閻ㄥ嫮绮撶粩顖氱鐏炩偓妫板嫯顔曢妴? * 閸氬本妞傜紒瀛樺Б閻劍鍩涙稉鑽ゆ窗瑜版洝鐭惧鍕剁礉娓氭稓绮撶粩顖濈熅瀵板嫯袙閺嬫劒濞囬悽銊ｂ偓? * 閻樿埖鈧線鈧俺绻?localStorage 閹镐椒绠欓崠鏍モ偓? */

import { type ThreadId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_WORKSPACE_LAYOUT_PRESET_ID,
  getWorkspaceLayoutPreset,
  type WorkspaceLayoutPresetId,
} from "./workspaceTerminalLayoutPresets";

/**
 * 瀹搞儰缍旈崠娲€夐棃銏℃殶閹诡噯绱濋崠鍛儓 ID閵嗕焦鐖ｆ０妯糕偓浣哥鐏炩偓妫板嫯顔曢崪灞炬闂傚瓨鍩戦妴? */
interface WorkspacePage {
  /** 瀹搞儰缍旈崠鍝勬暜娑撯偓閺嶅洩鐦?*/
  id: string;
  /** 瀹搞儰缍旈崠鐑樻▔缁€鐑樼垼妫?*/
  title: string;
  /** 缂佸牏顏敮鍐ㄧ湰妫板嫯顔?ID */
  layoutPresetId: WorkspaceLayoutPresetId;
  /** 閸掓稑缂撻弮鍫曟？閿涘湜SO 閺嶇厧绱￠敍?*/
  createdAt: string;
  /** 閺堚偓閸氬孩娲块弬鐗堟闂傝揪绱橧SO 閺嶇厧绱￠敍?*/
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

/** localStorage 閹镐椒绠欓崠鏍暛閸?*/
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
 * 鐏忓棗浼愭担婊冨隘 ID 鏉烆剚宕叉稉鍝勬値閹存劗娈戠痪璺ㄢ柤 ID閵? * 瀹搞儰缍旈崠娲€夐棃顫▏閻劌鎮庨幋鎰畱缁捐法鈻?ID 娑撳海绮撶粩顖滃Ц閹?Store 閸忓疇浠堥敍? * 娴ｅ灝绶卞銉ょ稊閸栨椽銆夐棃銏犲讲娴犮儱顦查悽銊у殠缁嬪楠囬崚顐ゆ畱缂佸牏顏悩鑸碘偓浣侯吀閻炲棎鈧? *
 * @param workspaceId - 瀹搞儰缍旈崠?ID
 * @returns 閸氬牊鍨氶惃鍕殠缁?ID閿涘本鐗稿蹇庤礋 "workspace:{workspaceId}"
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
 * 瀹搞儰缍旈崠娲€夐棃銏㈠Ц閹?Zustand Store閵? * 缁狅紕鎮婂銉ょ稊閸栨椽銆夐棃銏㈡畱婢х偛鍨归弨瑙勭叀閵嗕線鍣搁崨钘夋倳閵嗕焦甯撴惔蹇撴嫲鐢啫鐪０鍕啎閸掑洦宕查妴? * 闁俺绻?persist 娑擃參妫挎禒璺虹殺閻樿埖鈧焦瀵旀稊鍛閸?localStorage閵? *
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
