/**
 * @file useHandleNewChat.ts
 * @description 新建聊天 Hook - 处理创建新聊天的逻辑
 * @module hooks/useHandleNewChat
 */

import { useCallback } from "react";

import { ensureHomeChatProject } from "../lib/chatProjects";
import type { NewThreadOptions } from "../lib/threadBootstrap";
import { useWorkspaceStore } from "../workspaceStore";
import { useHandleNewThread } from "./useHandleNewThread";

/**
 * 新建聊天 Hook
 *
 * @description
 * 提供一个简化的接口来创建新的聊天线程。
 * 自动处理家庭目录项目的创建，并支持创建全新线程的选项。
 *
 * @returns 包含 handleNewChat 方法的对象
 * @returns.handleNewChat - 创建新聊天的方法
 *
 * @example
 * ```tsx
 * const { handleNewChat } = useHandleNewChat();
 *
 * const handleClick = async () => {
 *   const result = await handleNewChat({ fresh: true });
 *   if (result.ok) {
 *     console.log('新聊天创建成功');
 *   }
 * };
 * ```
 */
export function useHandleNewChat() {
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  const { handleNewThread } = useHandleNewThread();

  const handleNewChat = useCallback(
    async (
      options?: { fresh?: boolean; cwd?: string | null },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      // 优先使用调用方显式传入的 cwd(例如从 picker 选定的目录),
      // 其次回退到全局 homeDir(由 setWorkspaceCwd 同步刷新)。
      const effectiveCwd = options?.cwd?.trim() || homeDir;
      if (!effectiveCwd) {
        return {
          ok: false,
          error: "Home folder is not available yet.",
        };
      }

      // 确保家庭目录项目存在
      const projectId = await ensureHomeChatProject(effectiveCwd);
      if (!projectId) {
        return {
          ok: false,
          error: "Unable to prepare a new chat.",
        };
      }

      try {
        // 构建线程选项
        const threadOptions: NewThreadOptions | undefined =
          options?.fresh === true
            ? {
                fresh: true,
                envMode: "local",
                worktreePath: null,
              }
            : undefined;

        // 创建新线程
        await handleNewThread(projectId, threadOptions);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Unable to prepare a new chat.",
        };
      }
    },
    [handleNewThread, homeDir],
  );

  return { handleNewChat };
}
