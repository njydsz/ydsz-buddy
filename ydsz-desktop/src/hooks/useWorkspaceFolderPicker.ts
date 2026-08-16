/**
 * @file useWorkspaceFolderPicker.ts
 * @description 共享的「工作区选择文件夹」逻辑,供 WorkspaceModePicker 和
 *              WorkspaceView 的 composer 提交复用。
 *
 * 行为:
 * - 调起系统原生目录选择器 (api.dialogs.pickFolder)
 * - 写入 workspaceStore (per-workspace cwd, 同步刷新全局 homeDir)
 * - worktree 模式: 通过 api.git.createWorktree 在选定的仓库下创建 worktree;
 *   v4 起: 透传合成 threadId(workspace:<id>) 让后端写入 ManagedWorktreeService 注册表,
 *   并把 worktreePath 单独写入 workspace.worktreePath 字段(不再混入 cwd)。
 *   返回的 cwd 仍是 worktree 路径(向后兼容调用方用作 chat cwd)。
 * - cloud 模式: 暂未实现,抛出明确的错误(调用方应避免进入此分支)
 */
import { useCallback } from "react";
import { readNativeApi } from "~/nativeApi";
import { useWorkspaceStore, workspaceThreadId, type WorkspaceMode } from "~/workspaceStore";

interface PickWorkspaceFolderInput {
  workspaceId: string;
  mode: WorkspaceMode;
}

export interface UseWorkspaceFolderPicker {
  /**
   * 调起系统 picker 选定目录,并按 mode 写入 store。
   * 用户取消时返回 null;发生错误时抛错(由调用方决定是否 toast)。
   */
  pickWorkspaceFolder: (input: PickWorkspaceFolderInput) => Promise<string | null>;
}

function pickFreeWorktreeName(cwd: string): string {
  const segments = cwd.split(/[/\\]/).filter(Boolean);
  const baseName = segments[segments.length - 1] ?? "ydsz";
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
  return `${baseName}-worktree-${stamp}`;
}

export function useWorkspaceFolderPicker(): UseWorkspaceFolderPicker {
  const setWorkspaceCwd = useWorkspaceStore((state) => state.setWorkspaceCwd);
  const setWorkspaceWorktreePath = useWorkspaceStore(
    (state) => state.setWorkspaceWorktreePath,
  );

  return {
    pickWorkspaceFolder: useCallback(
      async ({ workspaceId, mode }: PickWorkspaceFolderInput) => {
        if (mode === "cloud") {
          throw new Error("Cloud mode is not available yet.");
        }
        if (mode === "ssh") {
          // SSH 模式下不调本地 picker,由 SshConnectionConfig 组件负责建立连接
          // 调用方应在此分支前先检查 sshConnectionId 是否已设置
          throw new Error("SSH mode requires configuring a connection first.");
        }
        const api = readNativeApi();
        if (!api) {
          throw new Error("Native API unavailable");
        }
        const picked = await api.dialogs.pickFolder();
        if (!picked) {
          return null;
        }

        // 先把用户选定的主仓库路径写入 cwd(无论何种 mode,主仓库路径都是 cwd 的语义)
        setWorkspaceCwd(workspaceId, picked);

        if (mode !== "worktree") {
          // local 模式:返回 picked 作为 chat cwd
          return picked;
        }

        // worktree 模式:创建 worktree 并单独写入 worktreePath 字段
        // 服务端契约(ydsz-server git.createWorktree):
        // - `branch`  = 基分支(用 "HEAD" 作为兜底,表示基于当前 commit)
        // - `newBranch` = 要创建的新分支
        // - `path` = 可选,传 null 让服务端按 <parent of cwd>/.ydsz-worktrees/<newBranch> 默认
        // - `threadId` = v4 新增,合成 threadId(workspace:<id>),
        //   让后端 ManagedWorktreeService 注册表能反查 worktree↔workspace 关系
        // 返回 { worktree: { path, branch } },path 是新 worktree 的绝对路径
        const newBranchName = pickFreeWorktreeName(picked);
        const syntheticThreadId = workspaceThreadId(workspaceId);
        const result = await api.git.createWorktree({
          cwd: picked,
          branch: "HEAD",
          newBranch: newBranchName,
          path: null,
          threadId: syntheticThreadId,
        });
        const worktreePath = result.worktree.path;
        setWorkspaceWorktreePath(workspaceId, worktreePath);
        // 返回 worktreePath 作为 chat cwd(向后兼容:chat 应在 worktree 内跑,主仓库不受影响)
        return worktreePath;
      },
      [setWorkspaceCwd, setWorkspaceWorktreePath],
    ),
  };
}
