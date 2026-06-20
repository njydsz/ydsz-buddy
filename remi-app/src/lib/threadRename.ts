/**
 * @file 线程重命名流程
 * @description 共享线程标题重命名流程，支持头部栏和侧边栏界面。
 *              当标题在首次发送前编辑时，会触发草稿线程提升（promotion），
 *              提升路径复用共享的幂等辅助函数，避免并发草稿提升调用者
 *              产生重复的 thread.create 不变失败并显示为用户可见的 toast。
 */

import {
  type ModelSelection,
  type OrchestrationThreadPullRequest,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
  type ThreadId,
} from "~/contracts";
import { type DraftThreadEnvMode } from "../composerDraftStore";
import { readNativeApi } from "../nativeApi";
import { promoteThreadCreate } from "./threadCreatePromotion";
import { newCommandId } from "./utils";

/** 线程重命名结果类型 */
type ThreadRenameOutcome = "empty" | "unchanged" | "unavailable" | "renamed";

/**
 * 分发线程重命名命令
 *
 * 验证新标题的有效性，若线程尚未创建则先执行草稿线程提升，
 * 然后发送 thread.meta.update 命令更新标题。
 *
 * @param input - 重命名输入参数
 * @param input.threadId - 目标线程 ID
 * @param input.newTitle - 新标题
 * @param input.unchangedTitles - 视为未变更的标题列表（跳过重命名）
 * @param input.createIfMissing - 线程尚未创建时的提升参数
 * @returns 重命名结果："empty"（空标题）、"unchanged"（标题未变）、"unavailable"（API 不可用）、"renamed"（已重命名）
 */
export async function dispatchThreadRename(input: {
  threadId: ThreadId;
  newTitle: string;
  unchangedTitles: readonly string[];
  createIfMissing?:
    | {
        projectId: ProjectId;
        modelSelection: ModelSelection;
        runtimeMode: RuntimeMode;
        interactionMode: ProviderInteractionMode;
        envMode: DraftThreadEnvMode;
        branch: string | null;
        worktreePath: string | null;
        lastKnownPr?: OrchestrationThreadPullRequest | null;
        createdAt: string;
      }
    | undefined;
}): Promise<ThreadRenameOutcome> {
  const trimmed = input.newTitle.trim();
  if (trimmed.length === 0) {
    return "empty";
  }
  if (input.unchangedTitles.includes(trimmed)) {
    return "unchanged";
  }

  const api = readNativeApi();
  if (!api) {
    return "unavailable";
  }

  if (input.createIfMissing) {
    const promotionResult = await promoteThreadCreate(
      {
        type: "thread.create",
        commandId: newCommandId(),
        threadId: input.threadId,
        projectId: input.createIfMissing.projectId,
        title: trimmed,
        modelSelection: input.createIfMissing.modelSelection,
        runtimeMode: input.createIfMissing.runtimeMode,
        interactionMode: input.createIfMissing.interactionMode,
        envMode: input.createIfMissing.envMode,
        branch: input.createIfMissing.branch,
        worktreePath: input.createIfMissing.worktreePath,
        ...(input.createIfMissing.lastKnownPr !== undefined
          ? { lastKnownPr: input.createIfMissing.lastKnownPr }
          : {}),
        createdAt: input.createIfMissing.createdAt,
      },
      api,
    );
    if (promotionResult === "exists") {
      await api.orchestration.dispatchCommand({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId: input.threadId,
        title: trimmed,
      });
    }
  } else {
    await api.orchestration.dispatchCommand({
      type: "thread.meta.update",
      commandId: newCommandId(),
      threadId: input.threadId,
      title: trimmed,
    });
  }

  return "renamed";
}
