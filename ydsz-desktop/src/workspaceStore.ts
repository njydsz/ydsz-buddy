/**
 * @file 工作区页面状态管理模块
 * @description 持久化管理仅终端的工作区页面及其稳定的工作区终端作用域。
 *              支持工作区的创建、重命名、删除、重新排序和布局预设管理。
 *              自 v3 起：每个 workspace 页面携带独立的 cwd（由用户在 Trae 风格 picker 中选择）
 *              和 mode（local / worktree / cloud），不再依赖 server welcome 事件自动注入。
 *              自 v4 起：每个 workspace 携带 `threadId` 和 `worktreePath`，
 *              与 ManagedWorktreeService 注册表对齐，支持 worktree↔thread 反查与并行 UI 承载。
 */

import { type ThreadId } from "@ydsz-buddy/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_WORKSPACE_LAYOUT_PRESET_ID,
  getWorkspaceLayoutPreset,
  type WorkspaceLayoutPresetId,
} from "./workspaceTerminalLayoutPresets";

/**
 * 工作区运行模式
 * - local: 用户指定的本地目录,新建 thread/terminal 直接使用该 cwd
 * - worktree: 基于本地目录创建的 git worktree
 * - cloud: 云端开发环境(占位,UI 暂时禁用)
 * - ssh: SSH 远端开发,通过 sshConnectionId 关联远端连接
 */
export type WorkspaceMode = "local" | "worktree" | "cloud" | "ssh";

export interface WorkspacePage {
  id: string;
  title: string;
  layoutPresetId: WorkspaceLayoutPresetId;
  /**
   * 用户在 landing 页面通过 [选择文件夹] picker 选定的目录;
   * null 表示尚未选择(此时 composer 的发送按钮会触发 picker 而非 disabled)。
   */
  cwd: string | null;
  /**
   * 工作区运行模式,默认 local。切换 mode 不会自动清空 cwd。
   */
  mode: WorkspaceMode;
  /**
   * v4 新增:绑定的真实 AI Agent 线程 ID(与合成 ID `workspace:<id>` 区分)。
   * 当 workspace 通过 composer 创建首个 thread 时写入,
   * 后续该 workspace 内的所有 chat/terminal 操作均复用此 threadId,
   * 让 workspace 真正承载 AI 会话,而非仅是终端容器。
   */
  threadId: string | null;
  /**
   * v4 新增:当 mode === "worktree" 时,记录 git worktree 的绝对路径,
   * 与后端 ManagedWorktreeService 注册表对齐。
   * mode === "local" 或尚未创建 worktree 时为 null。
   */
  worktreePath: string | null;
  /**
   * v5 新增:当 mode === "ssh" 时,关联的 SSH 连接 ID(来自 ssh_connect 返回)。
   * 其他 mode 下为 null。切换到 ssh mode 时由 UI 写入,断开连接时清空。
   */
  sshConnectionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceStoreState {
  /**
   * 全局 homeDir,仅在用户尚未为任何 workspace 显式选择目录时作为 fallback。
   * 通过 picker 写入;不再从 server welcome 事件或 config 接口注入。
   */
  homeDir: string | null;
  workspacePages: WorkspacePage[];
  activeWorkspaceId: string | null;
  /**
   * v2 → v3 升级引导横幅是否已被用户 dismiss。
   * 默认 false,任意一次 dismiss 后置 true 并持久化。
   */
  migrationHintDismissed: boolean;
  setHomeDir: (homeDir: string | null | undefined) => void;
  setActiveWorkspace: (workspaceId: string | null) => void;
  ensureWorkspacePage: (workspaceId: string) => void;
  createWorkspace: () => string;
  renameWorkspace: (workspaceId: string, title: string) => void;
  setWorkspaceLayoutPreset: (workspaceId: string, layoutPresetId: WorkspaceLayoutPresetId) => void;
  deleteWorkspace: (workspaceId: string) => void;
  reorderWorkspace: (workspaceId: string, nextIndex: number) => void;
  /**
   * 设置某个 workspace 的工作目录;同时刷新全局 homeDir(便于 sidebar 搜索等场景使用)。
   */
  setWorkspaceCwd: (workspaceId: string, cwd: string | null) => void;
  /**
   * 切换某个 workspace 的运行模式。
   */
  setWorkspaceMode: (workspaceId: string, mode: WorkspaceMode) => void;
  /**
   * v4 新增:绑定真实 AI Agent 线程 ID 到 workspace。
   * 当 workspace 通过 composer 创建首个 thread 时写入。
   */
  setWorkspaceThreadId: (workspaceId: string, threadId: string | null) => void;
  /**
   * v4 新增:记录 workspace 关联的 git worktree 绝对路径。
   * mode === "worktree" 创建 worktree 成功后写入。
   */
  setWorkspaceWorktreePath: (workspaceId: string, worktreePath: string | null) => void;
  /**
   * v5 新增:设置 workspace 关联的 SSH 连接 ID。
   * mode === "ssh" 时由 UI 写入,断开连接或切换 mode 时清空。
   */
  setWorkspaceSshConnectionId: (workspaceId: string, connectionId: string | null) => void;
  /**
   * 用户点击迁移提示横幅上的 dismiss 按钮时调用。
   * 置 migrationHintDismissed=true 并持久化,之后不再展示。
   */
  dismissMigrationHint: () => void;
}

const WORKSPACE_STORE_STORAGE_KEY = "ydsz-buddy:workspace-pages:v5";

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
  input?: {
    id?: string;
    title?: string;
    layoutPresetId?: WorkspaceLayoutPresetId;
    cwd?: string | null;
    mode?: WorkspaceMode;
    threadId?: string | null;
    worktreePath?: string | null;
    sshConnectionId?: string | null;
  },
): WorkspacePage {
  const createdAt = nowIso();
  return {
    id: input?.id ?? randomWorkspaceId(),
    title: trimWorkspaceTitle(input?.title ?? "") || nextWorkspaceTitle(workspacePages),
    layoutPresetId: getWorkspaceLayoutPreset(
      input?.layoutPresetId ?? DEFAULT_WORKSPACE_LAYOUT_PRESET_ID,
    ).id,
    cwd: input?.cwd ?? null,
    mode: input?.mode ?? "local",
    threadId: input?.threadId ?? null,
    worktreePath: input?.worktreePath ?? null,
    sshConnectionId: input?.sshConnectionId ?? null,
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
      cwd: workspace.cwd?.trim() ? workspace.cwd.trim() : null,
      mode:
        workspace.mode === "worktree" ||
        workspace.mode === "cloud" ||
        workspace.mode === "ssh"
          ? workspace.mode
          : "local",
      threadId: workspace.threadId?.trim() ? workspace.threadId.trim() : null,
      worktreePath: workspace.worktreePath?.trim() ? workspace.worktreePath.trim() : null,
      sshConnectionId: workspace.sshConnectionId?.trim() ? workspace.sshConnectionId.trim() : null,
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

export function workspaceThreadId(workspaceId: string): ThreadId {
  return `workspace:${workspaceId}` as ThreadId;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  persist(
    (set) => ({
      homeDir: null,
      workspacePages: [createWorkspacePage([])],
      activeWorkspaceId: null,
      migrationHintDismissed: false,
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
      setActiveWorkspace: (workspaceId) =>
        set((state) => {
          // 验证 workspaceId 是否存在
          if (workspaceId === null) {
            return { activeWorkspaceId: null };
          }
          const exists = state.workspacePages.some((workspace) => workspace.id === workspaceId);
          if (!exists) {
            return state;
          }
          return { activeWorkspaceId: workspaceId };
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
      setWorkspaceCwd: (workspaceId, cwd) =>
        set((state) => {
          const normalizedCwd = cwd?.trim() ? cwd.trim() : null;
          const workspacePages = state.workspacePages.map((workspace) => {
            if (workspace.id !== workspaceId || workspace.cwd === normalizedCwd) {
              return workspace;
            }
            return {
              ...workspace,
              cwd: normalizedCwd,
              updatedAt: nowIso(),
            };
          });
          // 同步刷新全局 homeDir,让 sidebar 等其他消费者立即可见。
          return {
            workspacePages,
            homeDir: normalizedCwd ?? state.homeDir,
          };
        }),
      setWorkspaceMode: (workspaceId, mode) =>
        set((state) => {
          const workspacePages = state.workspacePages.map((workspace) => {
            if (workspace.id !== workspaceId || workspace.mode === mode) {
              return workspace;
            }
            return {
              ...workspace,
              mode,
              updatedAt: nowIso(),
            };
          });
          return { workspacePages };
        }),
      setWorkspaceThreadId: (workspaceId, threadId) =>
        set((state) => {
          const normalizedThreadId = threadId?.trim() ? threadId.trim() : null;
          const workspacePages = state.workspacePages.map((workspace) => {
            if (workspace.id !== workspaceId || workspace.threadId === normalizedThreadId) {
              return workspace;
            }
            return {
              ...workspace,
              threadId: normalizedThreadId,
              updatedAt: nowIso(),
            };
          });
          return { workspacePages };
        }),
      setWorkspaceWorktreePath: (workspaceId, worktreePath) =>
        set((state) => {
          const normalizedPath = worktreePath?.trim() ? worktreePath.trim() : null;
          const workspacePages = state.workspacePages.map((workspace) => {
            if (workspace.id !== workspaceId || workspace.worktreePath === normalizedPath) {
              return workspace;
            }
            return {
              ...workspace,
              worktreePath: normalizedPath,
              updatedAt: nowIso(),
            };
          });
          return { workspacePages };
        }),
      setWorkspaceSshConnectionId: (workspaceId, connectionId) =>
        set((state) => {
          const normalizedId = connectionId?.trim() ? connectionId.trim() : null;
          const workspacePages = state.workspacePages.map((workspace) => {
            if (workspace.id !== workspaceId || workspace.sshConnectionId === normalizedId) {
              return workspace;
            }
            return {
              ...workspace,
              sshConnectionId: normalizedId,
              updatedAt: nowIso(),
            };
          });
          return { workspacePages };
        }),
      dismissMigrationHint: () =>
        set((state) => {
          if (state.migrationHintDismissed) {
            return state;
          }
          return { migrationHintDismissed: true };
        }),
    }),
    {
      name: WORKSPACE_STORE_STORAGE_KEY,
      version: 5,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        homeDir: state.homeDir,
        workspacePages: state.workspacePages,
        activeWorkspaceId: state.activeWorkspaceId,
        migrationHintDismissed: state.migrationHintDismissed,
      }),
      merge: (persistedState, currentState) => {
        const candidate = (persistedState as Partial<WorkspaceStoreState> | undefined) ?? {};
        const workspacePages = normalizeWorkspacePages(candidate.workspacePages ?? []);
        return {
          ...currentState,
          homeDir: candidate.homeDir?.trim() ?? null,
          workspacePages,
          activeWorkspaceId: candidate.activeWorkspaceId ?? null,
          migrationHintDismissed: candidate.migrationHintDismissed === true,
        };
      },
      // 升级提示:v2 → v3 时清空旧的全局 homeDir(由 server 注入,语义已变更),让用户重新通过 picker 选择。
      // migrationHintDismissed 故意置 false:升级上来的用户需要看到提示。
      // v3 → v4:仅增加 threadId/worktreePath 字段,通过 normalizeWorkspacePages 自动补 null,
      // 不需要清空任何旧数据,也不重置 migrationHintDismissed。
      // v4 → v5:增加 sshConnectionId 字段 + mode 新增 "ssh" 变体,
      // normalizeWorkspacePages 自动补 sshConnectionId=null,无需清空旧数据。
      migrate: (persistedState, version) => {
        if (version < 3) {
          return {
            ...((persistedState as object) ?? {}),
            homeDir: null,
            migrationHintDismissed: false,
            workspacePages: normalizeWorkspacePages(
              (persistedState as { workspacePages?: WorkspacePage[] })?.workspacePages ?? [],
            ),
          } as WorkspaceStoreState;
        }
        if (version < 4) {
          // v3→v4 仅补齐新字段,normalizeWorkspacePages 会把缺失的 threadId/worktreePath 设为 null
          return {
            ...((persistedState as object) ?? {}),
            workspacePages: normalizeWorkspacePages(
              (persistedState as { workspacePages?: WorkspacePage[] })?.workspacePages ?? [],
            ),
          } as WorkspaceStoreState;
        }
        if (version < 5) {
          // v4→v5 补齐 sshConnectionId 字段,normalizeWorkspacePages 会把缺失的设为 null
          return {
            ...((persistedState as object) ?? {}),
            workspacePages: normalizeWorkspacePages(
              (persistedState as { workspacePages?: WorkspacePage[] })?.workspacePages ?? [],
            ),
          } as WorkspaceStoreState;
        }
        return persistedState as WorkspaceStoreState;
      },
    },
  ),
);

// =============================================================================
// Selectors(派生状态,组件订阅使用)
// =============================================================================

/**
 * 派生 selector:未设置 cwd 的 workspace 数量。
 * 大厂基线:派生状态不存进 store,避免多源数据不一致。
 */
export const selectUnsetCwdWorkspaceCount = (state: WorkspaceStoreState): number =>
  state.workspacePages.filter((workspace) => workspace.cwd === null).length;

/**
 * 派生 selector:迁移提示横幅是否应展示。
 *
 * 条件(同时满足):
 * 1. 用户尚未 dismiss(migrationHintDismissed === false)
 * 2. 存在至少一个没有 cwd 的 workspace
 */
export const selectIsMigrationHintPending = (state: WorkspaceStoreState): boolean => {
  if (state.migrationHintDismissed) {
    return false;
  }
  return state.workspacePages.some((workspace) => workspace.cwd === null);
};

/**
 * v4 派生 selector:所有 workspace 的 id 列表。
 * 用于未来多 tab UI 同时挂载多个 workspace(并行会话)。
 * 当前单 active 模式下,可用于"切换器列出全部 workspace"等场景。
 */
export const selectOpenWorkspaceIds = (state: WorkspaceStoreState): string[] =>
  state.workspacePages.map((workspace) => workspace.id);

/**
 * v4 派生 selector:按 threadId 反查所属 workspace。
 * 用于 Provider 事件回调(threadId 维度)时定位到对应 workspace。
 */
export const selectWorkspaceByThreadId = (
  state: WorkspaceStoreState,
  threadId: string,
): WorkspacePage | undefined =>
  state.workspacePages.find((workspace) => workspace.threadId === threadId);
