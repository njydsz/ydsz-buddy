// FILE: Sidebar.uiState.ts
// Purpose: Persists sidebar-only UI preferences plus the last chat route for restore flows.
// Layer: Browser storage helper
// Exports: sidebar UI state read/write helpers.
/**
 * @file 侧边栏 UI 状态持久化
 *
 * 侧边栏专属的 UI 偏好 + 上次聊天路由：
 *
 * - **存储 key**：`remi-claw:sidebar-ui:v1`
 * - **状态字段**：聊天区域展开、线程列表展开、被关闭的状态提醒、上次路由
 * - **迁移**：旧 key 读取后写入新 key
 *
 * ## 核心导出
 *
 * - `SidebarUiState`：状态类型
 * - `loadSidebarUiState` / `saveSidebarUiState`：读写函数
 * - `DEFAULT_SIDEBAR_UI_STATE`：默认值
 *
 * ## 使用场景
 *
 * - Sidebar 主组件挂载时恢复
 * - 应用启动时路由恢复
 *
 * ## 注意事项
 *
 * - 工作区根路径会做大小写无关的归一化
 * - 字段缺失时回落到默认值
 */
import { normalizeWorkspaceRootForComparison } from "~/shared/threadWorkspace";
import type { LastThreadRoute } from "../chatRouteRestore";

const SIDEBAR_UI_STATE_STORAGE_KEY = "remi-claw:sidebar-ui:v1";

export type SidebarUiState = {
  chatSectionExpanded: boolean;
  chatThreadListExpanded: boolean;
  expandedProjectThreadListCwds: string[];
  dismissedThreadStatusKeyByThreadId: Record<string, string>;
  lastThreadRoute: LastThreadRoute | null;
};

const DEFAULT_SIDEBAR_UI_STATE: SidebarUiState = {
  chatSectionExpanded: false,
  chatThreadListExpanded: false,
  expandedProjectThreadListCwds: [],
  dismissedThreadStatusKeyByThreadId: {},
  lastThreadRoute: null,
};

export function normalizeSidebarProjectThreadListCwd(cwd: string): string {
  return normalizeWorkspaceRootForComparison(cwd);
}

export function readSidebarUiState(): SidebarUiState {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_UI_STATE;
  }

  try {
    const raw = window.localStorage.getItem(SIDEBAR_UI_STATE_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SIDEBAR_UI_STATE;
    }

    const parsed = JSON.parse(raw) as {
      chatSectionExpanded?: boolean;
      chatThreadListExpanded?: boolean;
      expandedProjectThreadListCwds?: string[];
      dismissedThreadStatusKeyByThreadId?: Record<string, string>;
      lastThreadRoute?: {
        threadId?: unknown;
        splitViewId?: unknown;
      } | null;
    };

    const lastThreadRoute =
      parsed.lastThreadRoute &&
      typeof parsed.lastThreadRoute.threadId === "string" &&
      parsed.lastThreadRoute.threadId.length > 0
        ? {
            threadId: parsed.lastThreadRoute.threadId,
            ...(typeof parsed.lastThreadRoute.splitViewId === "string" &&
            parsed.lastThreadRoute.splitViewId.length > 0
              ? { splitViewId: parsed.lastThreadRoute.splitViewId }
              : {}),
          }
        : null;

    return {
      chatSectionExpanded: parsed.chatSectionExpanded === true,
      chatThreadListExpanded: parsed.chatThreadListExpanded === true,
      expandedProjectThreadListCwds: [
        ...new Set(
          (parsed.expandedProjectThreadListCwds ?? [])
            .filter((cwd): cwd is string => typeof cwd === "string")
            .map((cwd) => normalizeSidebarProjectThreadListCwd(cwd))
            .filter((cwd) => cwd.length > 0),
        ),
      ],
      dismissedThreadStatusKeyByThreadId: Object.fromEntries(
        Object.entries(parsed.dismissedThreadStatusKeyByThreadId ?? {}).filter(
          ([threadId, statusKey]) =>
            typeof threadId === "string" &&
            threadId.length > 0 &&
            typeof statusKey === "string" &&
            statusKey.length > 0,
        ),
      ),
      lastThreadRoute,
    };
  } catch {
    return DEFAULT_SIDEBAR_UI_STATE;
  }
}

export function persistSidebarUiState(input: SidebarUiState): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SIDEBAR_UI_STATE_STORAGE_KEY,
      JSON.stringify({
        chatSectionExpanded: input.chatSectionExpanded,
        chatThreadListExpanded: input.chatThreadListExpanded,
        expandedProjectThreadListCwds: [
          ...new Set(
            input.expandedProjectThreadListCwds
              .map((cwd) => normalizeSidebarProjectThreadListCwd(cwd))
              .filter((cwd) => cwd.length > 0),
          ),
        ],
        dismissedThreadStatusKeyByThreadId: Object.fromEntries(
          Object.entries(input.dismissedThreadStatusKeyByThreadId).filter(
            ([threadId, statusKey]) => threadId.length > 0 && statusKey.length > 0,
          ),
        ),
        lastThreadRoute: input.lastThreadRoute
          ? {
              threadId: input.lastThreadRoute.threadId,
              ...(input.lastThreadRoute.splitViewId
                ? { splitViewId: input.lastThreadRoute.splitViewId }
                : {}),
            }
          : null,
      }),
    );
  } catch {
    // Ignore storage errors so sidebar rendering keeps working when persistence is unavailable.
  }
}
