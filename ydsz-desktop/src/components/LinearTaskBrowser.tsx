/**
 * @file Linear Task 浏览器组件
 *
 * 提供在应用内浏览 Linear (linear.app) 任务的功能：
 * - API Key 设置（首次使用时）
 * - 任务列表（按状态过滤 + 搜索）
 * - 查看任务详情
 * - 从任务创建 worktree 线程
 * - 在浏览器中打开任务
 *
 * ## 凭证持久化（P1-6）
 *
 * - API Key 通过 `credentialVault.ts` 持久化到 OS Keyring（如可用）
 *   或 localStorage XOR 混淆 / sessionStorage。
 * - 凭证 ref 约定：`linear-api-key`
 * - 应用启动时由 `loadLinearCredentialsOnBoot()`（在 `__root.tsx` 调用）
 *   从 vault 读取并通过 `linear.setApiKey` 塞回后端 `LinearApiKeyStore`。
 * - 在 setup 视图点击 "Disconnect" 会同时清除 vault 和后端内存中的 key。
 */

import { useCallback, useEffect, useState } from "react";
import type {
  LinearTaskSummary,
  LinearTaskDetail,
  ThreadId,
} from "~/contracts";
import { readNativeApi } from "~/nativeApi";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  LockIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
  PlusIcon,
} from "~/lib/icons";
import type { DiffPanelMode } from "./DiffPanelShell";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { DiffPanelShell } from "./DiffPanelShell";
import { toastManager } from "./ui/toast";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { ScrollArea } from "./ui/scroll-area";
import {
  storeCredential,
  getCredential,
  removeCredential,
  getDefaultCredentialStorageMode,
  type CredentialStorageMode,
} from "~/lib/credentialVault";

/** 凭证 ref 约定（与 `loadLinearCredentialsOnBoot` 保持一致） */
const LINEAR_API_KEY_REF = "linear-api-key";

/**
 * 应用启动时把 OS Keyring 中的 Linear API Key 塞回后端 `LinearApiKeyStore`
 *
 * 应在 `__root.tsx` 的 `onServerWelcome` 钩子中调用一次。
 * 失败时静默降级（无持久化凭证时后端 store 仍为空，用户可在 setup 视图手动输入）。
 */
export async function loadLinearCredentialsOnBoot(): Promise<void> {
  if (typeof window === "undefined" || !(window as { __TAURI__?: unknown }).__TAURI__) {
    return;
  }
  const apiKey = getCredential(LINEAR_API_KEY_REF);
  if (!apiKey) {
    return; // 没有持久化凭证，跳过
  }
  try {
    const api = readNativeApi();
    if (!api) {
      return;
    }
    const result = await api.linear.setApiKey({ apiKey });
    if (!result.valid) {
      // 持久化的 key 已失效（被撤销 / 过期），清除避免每次启动都试错
      removeCredential(LINEAR_API_KEY_REF);
    }
  } catch {
    // 启动期失败不抛错，避免阻塞 UI；用户进入 LinearTaskBrowser 时会再次尝试
  }
}

type LinearTaskState = "active" | "backlog" | "completed" | "canceled" | "all";
type ViewMode = "setup" | "list" | "detail";

export interface LinearTaskBrowserProps {
  mode: DiffPanelMode;
  threadId: ThreadId;
  projectCwd: string | null;
  projectId: string | null;
  onClose: () => void;
}

function stateToLabel(state: LinearTaskState): string {
  switch (state) {
    case "active":
      return "Active";
    case "backlog":
      return "Backlog";
    case "completed":
      return "Completed";
    case "canceled":
      return "Canceled";
    case "all":
      return "All Tasks";
  }
}

function stateToBadgeColor(stateName: string): string {
  const lower = stateName.toLowerCase();
  if (lower.includes("progress") || lower.includes("started"))
    return "bg-blue-500/15 text-blue-300 border-blue-500/25";
  if (lower.includes("done") || lower.includes("completed"))
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (lower.includes("cancel"))
    return "bg-muted/50 text-muted-foreground border-border/50";
  if (lower.includes("backlog"))
    return "bg-amber-500/15 text-amber-300 border-amber-500/25";
  return "bg-muted/50 text-muted-foreground border-border/50";
}

function priorityLabel(priority: number): string {
  switch (priority) {
    case 0:
      return "No priority";
    case 1:
      return "Urgent";
    case 2:
      return "High";
    case 3:
      return "Medium";
    case 4:
      return "Low";
    default:
      return `P${priority}`;
  }
}

function priorityColor(priority: number): string {
  switch (priority) {
    case 1:
      return "text-red-400";
    case 2:
      return "text-orange-400";
    case 3:
      return "text-yellow-400";
    default:
      return "text-muted-foreground";
  }
}

export function LinearTaskBrowser({
  mode,
  projectCwd,
  projectId,
  onClose,
}: LinearTaskBrowserProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [state, setState] = useState<LinearTaskState>("active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<LinearTaskSummary[]>([]);
  const [selectedTask, setSelectedTask] = useState<LinearTaskDetail | null>(
    null,
  );
  const [authChecked, setAuthChecked] = useState(false);
  /** 当前后端是否已持有 API Key（用于在 setup 视图显示 Disconnect 按钮） */
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const api = readNativeApi();

  // 检查认证状态
  const checkAuth = useCallback(async () => {
    if (!api) return;
    try {
      const status = await api.linear.getAuthStatus();
      setIsAuthenticated(status.set);
      if (!status.set) {
        setViewMode("setup");
      } else {
        setViewMode("list");
      }
    } catch {
      // 忽略错误，默认显示列表
    }
    setAuthChecked(true);
  }, [api]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 加载任务列表
  const loadTasks = useCallback(async () => {
    if (!api || viewMode === "setup") return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.linear.listTasks({
        state: state === "all" ? undefined : state,
        limit: 50,
      });
      setTasks(result || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load tasks";
      if (msg.includes("not set") || msg.includes("API key")) {
        setViewMode("setup");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [api, state, viewMode]);

  useEffect(() => {
    if (authChecked && viewMode === "list") {
      loadTasks();
    }
  }, [loadTasks, authChecked, viewMode]);

  // 搜索任务
  const handleSearch = useCallback(async () => {
    if (!api || !searchQuery.trim()) {
      loadTasks();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.linear.searchTasks({
        query: searchQuery.trim(),
        limit: 25,
      });
      setTasks(result || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to search tasks",
      );
    } finally {
      setLoading(false);
    }
  }, [api, searchQuery, loadTasks]);

  // 设置 API Key
  // 成功后通过 `credentialVault` 持久化到 OS Keyring / localStorage,
  // 下次启动时由 `loadLinearCredentialsOnBoot` 自动恢复。
  const handleSetApiKey = useCallback(async () => {
    if (!api || !apiKeyInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const trimmed = apiKeyInput.trim();
      const result = await api.linear.setApiKey({ apiKey: trimmed });
      if (result.valid) {
        // P1-6: 持久化到 vault（按用户全局默认存储模式）
        const mode: CredentialStorageMode = getDefaultCredentialStorageMode();
        storeCredential(LINEAR_API_KEY_REF, trimmed, mode);
        setIsAuthenticated(true);
        toastManager.add({
          type: "success",
          title: `Connected to Linear as ${result.viewerName ?? "user"}`,
        });
        setApiKeyInput("");
        setViewMode("list");
        loadTasks();
      } else {
        setError(result.error ?? "Invalid API key");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set API key",
      );
    } finally {
      setLoading(false);
    }
  }, [api, apiKeyInput, loadTasks]);

  // 断开连接：清除后端内存 + vault 中的 API Key
  const handleDisconnect = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      await api.linear.clearApiKey();
      removeCredential(LINEAR_API_KEY_REF);
      setIsAuthenticated(false);
      setApiKeyInput("");
      setTasks([]);
      setSelectedTask(null);
      setViewMode("setup");
      toastManager.add({
        type: "info",
        title: "Disconnected from Linear",
        timeout: 2000,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to disconnect",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  // 查看任务详情
  const handleSelectTask = useCallback(
    async (task: LinearTaskSummary) => {
      if (!api) return;
      setLoading(true);
      setError(null);
      try {
        const detail = await api.linear.getTask({ taskId: task.id });
        setSelectedTask(detail);
        setViewMode("detail");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load task details",
        );
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  // 从任务创建线程
  const handleCreateThread = useCallback(
    async (task: LinearTaskDetail) => {
      if (!api || !projectCwd || !projectId) {
        setError("Project context required (cwd and projectId)");
        return;
      }
      setCreating(true);
      setError(null);
      try {
        const result = await api.linear.createThreadFromTask({
          taskId: task.id,
          projectId,
          cwd: projectCwd,
          autoStart: true,
        });
        toastManager.add({
          type: "success",
          title: `Thread created for ${task.identifier}`,
          description: `Branch: ${result.branch}`,
        });
        onClose();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to create thread from task",
        );
      } finally {
        setCreating(false);
      }
    },
    [api, projectCwd, projectId, onClose],
  );

  const handleOpenInBrowser = useCallback(
    (url: string) => {
      if (api) {
        void api.shell.openExternal(url);
      }
    },
    [api],
  );

  // ── Setup View ──
  if (viewMode === "setup") {
    return (
      <DiffPanelShell
        mode={mode}
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LockIcon className="size-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Linear Setup</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7"
              onClick={onClose}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
          <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
            <SettingsIcon className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-semibold">Connect to Linear</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter your Linear API key to browse and import tasks.
              <br />
              Get it from Linear Settings → API.
            </p>
          </div>
          <div className="w-full max-w-sm space-y-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSetApiKey();
              }}
              placeholder="lin_api_xxx..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            <Button
              type="button"
              className="w-full"
              onClick={handleSetApiKey}
              disabled={loading || !apiKeyInput.trim()}
              data-testid="linear-connect-btn"
            >
              {loading ? (
                <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
              ) : null}
              Connect
            </Button>
            {/* P1-6: 已认证用户可断开连接（清除 vault + 后端内存中的 key） */}
            {isAuthenticated ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleDisconnect}
                disabled={loading}
                data-testid="linear-disconnect-btn"
              >
                {loading ? (
                  <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
                ) : null}
                Disconnect
              </Button>
            ) : null}
          </div>
        </div>
      </DiffPanelShell>
    );
  }

  return (
    <DiffPanelShell
      mode={mode}
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Linear Tasks</span>
          </div>
          <div className="flex items-center gap-1">
            <Menu modal={false}>
              <MenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7"
                  >
                    <ChevronRightIcon className="size-3.5" />
                  </Button>
                }
              />
              <MenuPopup align="end" side="bottom" className="w-40">
                {(
                  [
                    "active",
                    "backlog",
                    "completed",
                    "canceled",
                    "all",
                  ] as const
                ).map((s) => (
                  <MenuItem
                    key={s}
                    className={cn(state === s && "bg-(--color-background-elevated-secondary)")}
                    onClick={() => {
                      setState(s);
                      setViewMode("list");
                      setSelectedTask(null);
                    }}
                  >
                    {stateToLabel(s)}
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7"
              onClick={() => {
                setViewMode("list");
                setSelectedTask(null);
                loadTasks();
              }}
            >
              <RefreshCwIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7"
              onClick={() => setViewMode("setup")}
            >
              <SettingsIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7"
              onClick={onClose}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {error && (
          <div className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {viewMode === "list" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Search bar */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <SearchIcon className="size-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Search tasks..."
                className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    loadTasks();
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>

            {loading && tasks.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && tasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
                <p>No tasks found</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={loadTasks}
                >
                  <RefreshCwIcon className="mr-1.5 size-3" />
                  Refresh
                </Button>
              </div>
            )}

            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleSelectTask(task)}
                    className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-muted-foreground">
                        {task.identifier}
                      </span>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                          stateToBadgeColor(task.stateName),
                        )}
                      >
                        {task.stateName}
                      </span>
                      {task.priority > 0 && (
                        <span
                          className={cn(
                            "text-[10px] font-medium",
                            priorityColor(task.priority),
                          )}
                        >
                          {priorityLabel(task.priority)}
                        </span>
                      )}
                    </div>
                    <span className="line-clamp-2 text-xs">
                      {task.title}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{task.teamName}</span>
                      {task.assigneeName && (
                        <>
                          <span>·</span>
                          <span>{task.assigneeName}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {viewMode === "detail" && selectedTask && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setViewMode("list")}
              >
                ← Back
              </Button>
              <span className="font-mono text-xs font-medium text-muted-foreground">
                {selectedTask.identifier}
              </span>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                  stateToBadgeColor(selectedTask.stateName),
                )}
              >
                {selectedTask.stateName}
              </span>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3 p-3">
                <h3 className="text-sm font-semibold">
                  {selectedTask.title}
                </h3>

                {/* Meta info */}
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span>Team: {selectedTask.teamName}</span>
                  {selectedTask.assigneeName && (
                    <span>· Assignee: {selectedTask.assigneeName}</span>
                  )}
                  {selectedTask.creatorName && (
                    <span>· Created by: {selectedTask.creatorName}</span>
                  )}
                  <span>· {priorityLabel(selectedTask.priority)}</span>
                </div>

                {/* Labels */}
                {selectedTask.labels && selectedTask.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedTask.labels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Description */}
                {selectedTask.description && (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">
                      {selectedTask.description}
                    </pre>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleCreateThread(selectedTask)}
                    disabled={creating || !projectId || !projectCwd}
                  >
                    {creating ? (
                      <LoaderCircleIcon className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <PlusIcon className="mr-1.5 size-3.5" />
                    )}
                    Create Thread
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleOpenInBrowser(selectedTask.url)}
                  >
                    <ExternalLinkIcon className="mr-1.5 size-3.5" />
                    Open in Linear
                  </Button>
                </div>

                {(!projectId || !projectCwd) && (
                  <p className="text-[10px] text-muted-foreground">
                    Project context required to create a thread
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </DiffPanelShell>
  );
}
